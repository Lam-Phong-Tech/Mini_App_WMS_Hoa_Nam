/**
 * Lịch sử linh kiện đã xuất của một hồ sơ bảo hành.
 *
 * Hồ sơ bảo hành và chứng từ xuất linh kiện là hai aggregate riêng: endpoint
 * hồ sơ không nhúng danh sách linh kiện, còn từng chứng từ luôn giữ
 * `warranty_case_id`. Vì vậy lịch sử được dựng từ các phiếu `POSTED` liên kết
 * với đúng hồ sơ, rồi đọc chi tiết từng phiếu để lấy SKU và số lượng thật.
 */

import {
  readOne,
  readPage,
  type ReadClient,
  type ReadOptions,
} from './readOnlyClient';
import { WMS_READ_PATHS } from './queries';

const COMPONENT_HISTORY_PAGE_SIZE = 10;

interface RawComponentIssueItem {
  readonly quantity?: number;
}

interface RawComponentIssueLine {
  readonly id?: string;
  readonly sku_code?: string;
  readonly sku_name?: string;
  readonly required_qty?: number;
  readonly scanned_qty?: number;
  readonly items?: readonly RawComponentIssueItem[];
}

interface RawComponentIssueDocument {
  readonly id?: string;
  readonly component_issue_no?: string;
  readonly status?: string;
  readonly posted_at?: string | null;
  readonly created_at?: string;
}

interface RawComponentIssueDetail {
  readonly document?: RawComponentIssueDocument;
  readonly lines?: readonly RawComponentIssueLine[];
}

export interface WarrantyComponentIssuedLine {
  readonly id: string;
  readonly skuCode?: string;
  readonly skuName?: string;
  /** Số lượng đã xuất, ưu tiên bằng chứng quét thực tế. */
  readonly quantity: number;
  /** Số tem/hộp đã dùng để cấu thành dòng này, nếu WMS trả về. */
  readonly scannedCodeCount: number;
}

export interface WarrantyComponentHistoryDocument {
  readonly id: string;
  readonly documentNumber?: string;
  readonly postedAt?: string;
  readonly lines: readonly WarrantyComponentIssuedLine[];
  /** Chi tiết một phiếu không tải được; không giấu cả lịch sử còn lại. */
  readonly detailUnavailable?: boolean;
}

export interface WarrantyComponentHistoryPage {
  readonly documents: readonly WarrantyComponentHistoryDocument[];
  readonly page: number;
  readonly hasMore: boolean;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function detailPath(documentId: string): string {
  return WMS_READ_PATHS.componentIssueDocuments + '/' + encodeURIComponent(documentId);
}

function itemQuantity(line: RawComponentIssueLine): number {
  const totalFromItems = (line.items ?? []).reduce(
    (sum, item) => sum + (nonNegativeNumber(item.quantity) ?? 0),
    0,
  );
  return (
    totalFromItems ||
    nonNegativeNumber(line.scanned_qty) ||
    nonNegativeNumber(line.required_qty) ||
    0
  );
}

function mapDetail(
  fallback: RawComponentIssueDocument,
  payload: RawComponentIssueDetail,
): WarrantyComponentHistoryDocument {
  const document = payload.document ?? fallback;
  const id = text(document.id) ?? text(fallback.id);
  if (id === undefined) {
    throw new Error('Chứng từ xuất linh kiện không có mã định danh.');
  }
  return {
    id,
    documentNumber: text(document.component_issue_no) ?? text(fallback.component_issue_no),
    postedAt: text(document.posted_at) ?? text(fallback.posted_at) ?? text(document.created_at),
    lines: (payload.lines ?? []).map((line, index) => ({
      id: text(line.id) ?? id + '-line-' + String(index + 1),
      skuCode: text(line.sku_code),
      skuName: text(line.sku_name),
      quantity: itemQuantity(line),
      scannedCodeCount: line.items?.length ?? 0,
    })),
  };
}

function fallbackDocument(
  document: RawComponentIssueDocument,
): WarrantyComponentHistoryDocument {
  const id = text(document.id);
  if (id === undefined) {
    throw new Error('Chứng từ xuất linh kiện không có mã định danh.');
  }
  return {
    id,
    documentNumber: text(document.component_issue_no),
    postedAt: text(document.posted_at) ?? text(document.created_at),
    lines: [],
    detailUnavailable: true,
  };
}

/**
 * Chỉ lấy phiếu đã Post: DRAFT/CANCELLED không phải linh kiện đã dùng cho máy
 * và không được đưa vào hồ sơ lịch sử.
 */
export async function fetchPostedWarrantyComponentHistoryPage(
  warrantyCaseId: string,
  options: ReadOptions = {},
  client?: ReadClient,
): Promise<WarrantyComponentHistoryPage> {
  const page = await readPage<RawComponentIssueDocument>(
    WMS_READ_PATHS.componentIssueDocuments,
    {
      ...options,
      query: {
        warranty_case_id: warrantyCaseId,
        status: 'POSTED',
        per_page: COMPONENT_HISTORY_PAGE_SIZE,
        ...options.query,
      },
    },
    client,
  );

  // Response danh sách không có lines. Tải chi tiết song song cho tối đa 10
  // phiếu gần nhất; lỗi ở một phiếu không được che lịch sử các phiếu khác.
  const results = await Promise.allSettled(
    page.items.map(async summary => {
      const id = text(summary.id);
      if (id === undefined) return fallbackDocument(summary);
      const detail = await readOne<RawComponentIssueDetail>(
        detailPath(id),
        options,
        client,
      );
      return mapDetail(summary, detail);
    }),
  );

  const documents = results.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    return fallbackDocument(page.items[index] ?? {});
  });
  const requestedPage = Number(options.query?.page ?? 1);
  const currentPage = page.meta?.current_page ??
    (Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
  const hasMore = page.links?.next !== undefined && page.links.next !== null
    ? true
    : page.meta?.last_page !== undefined
      ? currentPage < page.meta.last_page
      : page.items.length >= COMPONENT_HISTORY_PAGE_SIZE;
  return { documents, page: currentPage, hasMore };
}

/** Tương thích các nơi chỉ cần trang đầu của lịch sử đã Post. */
export async function fetchPostedWarrantyComponentHistory(
  warrantyCaseId: string,
  options: ReadOptions = {},
  client?: ReadClient,
): Promise<readonly WarrantyComponentHistoryDocument[]> {
  return (await fetchPostedWarrantyComponentHistoryPage(
    warrantyCaseId,
    options,
    client,
  )).documents;
}
