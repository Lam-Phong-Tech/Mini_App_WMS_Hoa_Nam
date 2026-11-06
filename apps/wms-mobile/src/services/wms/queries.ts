import { apiClient } from '../../api/client';
import { decodeAccountSessionPolicy } from '../../auth/session';
/**
 * Các phép đọc WMS mà màn hình dùng.
 *
 * Mỗi hàm ở đây tương ứng **một endpoint đã được kiểm chứng trả 200** trong
 * contract test ngày 2026-09-05 ([§4e.2](../../../../../docs/migration/03-api-contract-delta.md)).
 * Không thêm endpoint chưa từng gọi thật — đoán đường dẫn là cách nhanh nhất để
 * màn hình chết trên máy thủ kho.
 *
 * 🔓 `GATE_WMS §2d` cho phép đọc; **mọi phép ghi vẫn cấm**.
 */

import { readOne, readPage, type ReadOptions } from './readOnlyClient';
import type {
  CurrentUser,
  ScanEntry,
  InboundDocument,
  OutboundDocument,
  Page,
  Warehouse,
  WarrantyCase,
} from './types';

/**
 * Đường dẫn — gom một chỗ để đối chiếu với `03-api-mapping.md`.
 *
 * 🔧 **Sửa kết luận sai 2026-09-06.** Trước đây tôi ghi ở đây rằng
 * `warranty-attachments/{id}` chỉ khai `DELETE` (đo được HTTP 405), nên đường
 * tải file của client cũ *"không bao giờ chạy được"*. **Kết luận đó sai** — tôi
 * đã đo nhầm đường.
 *
 * Có **hai** đường khác nhau:
 *
 * | Đường | Method | Việc |
 * |---|---|---|
 * | `warranty-attachments/{id}` | `DELETE` | xoá file — đúng là 405 với GET |
 * | `warranty-attachments/{id}/download` | `GET` | tải file |
 *
 * Xác minh: `warranty-flow.service.ts:301-311` của Mini App đang chạy gọi đúng
 * đường có hậu tố `/download`. Bài học: đo một đường rồi kết luận cho cả một
 * họ đường là suy diễn quá tay — 405 chỉ nói *"method này không đúng cho đường
 * này"*, không nói gì về đường khác.
 */
export const WMS_READ_PATHS = {
  me: '/api/v1/auth/me',
  warehouses: '/api/v1/warehouses',
  products: '/api/v1/mini-app/products',
  inboundDocuments: '/api/v1/mini-app/inbound-documents',
  outboundDocuments: '/api/v1/mini-app/outbound-documents',
  warrantyCases: '/api/v1/mini-app/warranty-cases',
  /**
   * Chứng từ xuất linh kiện gắn với `warranty_case_id`.
   *
   * Không nằm trong payload hồ sơ bảo hành; màn chi tiết phải đọc riêng để
   * lưu vết linh kiện đã dùng cho từng máy.
   */
  componentIssueDocuments: '/api/v1/component-issue-documents',
  /**
   * Tải nội dung một file đính kèm. Hậu tố `/download` là **bắt buộc** — xem
   * chú thích ở trên.
   */
  warrantyAttachmentDownload: '/api/v1/mini-app/warranty-attachments',
  printerConfigs: '/api/v1/mini-app/printer-configs',
  inventoryBalances: '/api/v1/inventory/balances',
  /** Annex C queryInventory: số dư theo SKU/kho/trạng thái, có filter sku_id. */
  inventory: '/api/v1/inventory',
  /** Sổ ledger authoritative, có filter item_id / product_id / code_value. */
  inventoryLedger: '/api/v1/reports/inventory-ledger',
  /** Thông báo của chính người dùng đang đăng nhập. */
  notifications: '/api/v1/notifications',
  /** Bộ đếm dùng cho chuông ở Trang chủ. */
  notificationUnreadCount: '/api/v1/notifications/unread-count',
  scanEvents: '/api/v1/scan/events',
  /**
   * 🔴 Trả **403 ACCESS_DENIED** với vai Thủ kho — đo thật 2026-09-05
   * ([04-screen-survey.md §3.2](../../../../../docs/migration/04-screen-survey.md)).
   * Bên gọi **phải** xử lý 403 như một trạng thái hợp lệ, không phải sự cố.
   */
  defects: '/api/v1/defects',
} as const;

/** Số bản ghi mỗi trang. Đủ một màn cuộn mà không kéo cả kho về máy. */
export const DEFAULT_PER_PAGE = 25;

function withPaging(
  options: ReadOptions,
  perPage: number = DEFAULT_PER_PAGE,
): ReadOptions {
  return { ...options, query: { per_page: perPage, ...options.query } };
}

// ---------------------------------------------------------------------------
// Phiên và danh mục
// ---------------------------------------------------------------------------

export async function fetchCurrentUser(
  options: ReadOptions = {},
): Promise<CurrentUser> {
  if (options.query && Object.values(options.query).some(v => v !== undefined))
    throw new Error('GET /auth/me không nhận query.');
  const response = await apiClient.get<{
    data: unknown;
    meta?: Record<string, unknown>;
  }>(WMS_READ_PATHS.me, {
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });
  return {
    ...mapCurrentUser(response.data?.data),
    profile_meta: response.data?.meta,
    etag: response.header?.('etag'),
  };
}

/** Chuẩn hoá biến thể `staff` / `user` của `/auth/me` như Mini App. */
export function mapCurrentUser(payload: unknown): CurrentUser {
  const root = asRecord(payload);
  if (root === undefined) {
    return {};
  }
  const nested = {
    ...root,
    ...(asRecord(root.staff) ?? asRecord(root.user) ?? {}),
  };

  const roles = Array.isArray(nested.roles) ? nested.roles : [];
  const primaryRole = asRecord(roles[0]);
  const name = firstText(
    nested.display_name,
    nested.name,
    nested.full_name,
    nested.username,
    nested.email,
  );
  const role = firstText(
    nested.role,
    primaryRole?.role_name,
    primaryRole?.role_code,
  );
  const id = firstText(nested.id, nested.user_id, nested.zalo_user_id);
  const avatarUrl = firstText(nested.avatar_url);
  const permissions = Array.isArray(nested.permissions)
    ? nested.permissions.filter(
        (item): item is string => typeof item === 'string',
      )
    : undefined;

  return {
    id,
    status: firstText(nested.status),
    accountSessionPolicy: decodeAccountSessionPolicy(
      nested.account_session_policy,
    ),
    warehouse_context:
      asRecord(nested.warehouse_context) &&
      typeof asRecord(nested.warehouse_context)?.status === 'string'
        ? {
            status: asRecord(nested.warehouse_context)!.status as string,
            error_code:
              typeof asRecord(nested.warehouse_context)?.error_code === 'string'
                ? (asRecord(nested.warehouse_context)!.error_code as string)
                : null,
          }
        : undefined,
    available_warehouses: Array.isArray(nested.available_warehouses)
      ? nested.available_warehouses.flatMap(value => {
          const row = asRecord(value);
          return typeof row?.warehouse_id === 'string' &&
            typeof row.status === 'string'
            ? [
                {
                  warehouse_id: row.warehouse_id,
                  code: firstText(row.code),
                  name: firstText(row.name),
                  status: row.status,
                },
              ]
            : [];
        })
      : undefined,
    auth_session_id: firstText(nested.auth_session_id),
    active_warehouse_id:
      nested.active_warehouse_id === null
        ? null
        : firstText(nested.active_warehouse_id),
    name,
    email: firstText(nested.email),
    phone:
      nested.phone === null
        ? null
        : firstText(nested.phone, nested.phone_number),
    avatar_url: avatarUrl,
    role,
    permissions,
    roles,
    warehouse_scope_ids:
      nested.warehouse_scope_ids === null
        ? null
        : Array.isArray(nested.warehouse_scope_ids)
        ? nested.warehouse_scope_ids.filter(
            (item): item is string => typeof item === 'string',
          )
        : undefined,
    version: firstText(nested.version) ?? firstNumberText(nested.version),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstText(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value;
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value);
  }
  return undefined;
}

function firstNumberText(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : undefined;
}

export function fetchWarehouses(
  options: ReadOptions = {},
): Promise<Page<Warehouse>> {
  return readPage<Warehouse>(
    WMS_READ_PATHS.warehouses,
    withPaging(options, 50),
  );
}

// ---------------------------------------------------------------------------
// Nhập kho
// ---------------------------------------------------------------------------

export function fetchInboundDocuments(
  options: ReadOptions = {},
): Promise<Page<InboundDocument>> {
  return readPage<InboundDocument>(
    WMS_READ_PATHS.inboundDocuments,
    withPaging(options),
  );
}

/**
 * Chi tiết phiếu nhập.
 *
 * ⚠️ **Phải gọi riêng, không tái dùng phần tử trong danh sách** (§4f.5): bản chi
 * tiết có thêm `status_history` mà danh sách không có.
 */
export function fetchInboundDocument(
  id: string,
  options: ReadOptions = {},
): Promise<InboundDocument> {
  return readOne<InboundDocument>(
    WMS_READ_PATHS.inboundDocuments + '/' + encodeURIComponent(id),
    options,
  );
}

// ---------------------------------------------------------------------------
// Xuất kho
// ---------------------------------------------------------------------------

export function fetchOutboundDocuments(
  options: ReadOptions = {},
): Promise<Page<OutboundDocument>> {
  return readPage<OutboundDocument>(
    WMS_READ_PATHS.outboundDocuments,
    withPaging(options),
  );
}

/** Chi tiết phiếu xuất — thêm `status_history`, `item_matches`, `movements`. */
export function fetchOutboundDocument(
  id: string,
  options: ReadOptions = {},
): Promise<OutboundDocument> {
  return readOne<OutboundDocument>(
    WMS_READ_PATHS.outboundDocuments + '/' + encodeURIComponent(id),
    options,
  );
}

// ---------------------------------------------------------------------------
// Bảo hành
// ---------------------------------------------------------------------------

export function fetchWarrantyCases(
  options: ReadOptions = {},
): Promise<Page<WarrantyCase>> {
  return readPage<WarrantyCase>(
    WMS_READ_PATHS.warrantyCases,
    withPaging(options),
  );
}

/**
 * Chi tiết hồ sơ bảo hành.
 *
 * 🔴 Nhận `warrantyCaseId` chứ **không** phải `id`: bản ghi bảo hành không có
 * trường `id` (§4f.4). Đặt tên tham số như vậy để không ai truyền nhầm.
 */
export function fetchWarrantyCase(
  warrantyCaseId: string,
  options: ReadOptions = {},
): Promise<WarrantyCase> {
  return readOne<WarrantyCase>(
    WMS_READ_PATHS.warrantyCases + '/' + encodeURIComponent(warrantyCaseId),
    options,
  );
}
/**
 * Các mã đã quét trong một phiếu **nhập**.
 *
 * Query lấy nguyên từ Mini App đang chạy (`receipt-flow.service.ts:552`):
 * `?status=ACTIVE&per_page=200`. 200 là để lấy hết trong một lần — phiếu nhập
 * thực tế hiếm khi vượt số đó, và phân trang ở màn chi tiết thì thủ kho phải
 * cuộn hai lần mới biết đủ mã hay chưa.
 *
 * ⚠️ Luồng **xuất** KHÔNG có endpoint này — mã của nó nằm sẵn trong
 * `item_matches` / `matches` của chi tiết phiếu. Xem `ScanEntry`.
 */
export function fetchInboundScanEntries(
  documentId: string,
  options: ReadOptions = {},
): Promise<Page<ScanEntry>> {
  return readPage<ScanEntry>(
    WMS_READ_PATHS.inboundDocuments +
      '/' +
      encodeURIComponent(documentId) +
      '/scan-entries',
    {
      ...options,
      query: { status: 'ACTIVE', per_page: 200, ...options.query },
    },
  );
}

/**
 * Lịch sử xử lý một hồ sơ bảo hành.
 *
 * ⚠️ Lỗi tải **KHÔNG** được biến thành danh sách rỗng. Người dùng đã chỉ ra
 * đúng điểm này ở Mini App đang chạy (2026-09-06): *"Timeline và danh sách file
 * lỗi tải sẽ bị thay bằng danh sách rỗng ở trang chi tiết; điều này có thể che
 * mất nguyên nhân backend lỗi."*
 *
 * Timeline rỗng trông y hệt *"hồ sơ chưa có xử lý nào"* — mà với một hồ sơ đang
 * ở trạng thái Sửa chữa thì đó là điều **không thể đúng**. Hàm này để lỗi nổi
 * lên, bên gọi phải hiện nó.
 */
export function fetchWarrantyEvents(
  warrantyCaseId: string,
  options: ReadOptions = {},
): Promise<Page<unknown>> {
  return readPage<unknown>(
    WMS_READ_PATHS.warrantyCases +
      '/' +
      encodeURIComponent(warrantyCaseId) +
      '/events',
    options,
  );
}

/** Danh sách file đính kèm của một hồ sơ. Lỗi tải cũng KHÔNG nuốt thành rỗng. */
export function fetchWarrantyAttachments(
  warrantyCaseId: string,
  options: ReadOptions = {},
): Promise<Page<unknown>> {
  return readPage<unknown>(
    WMS_READ_PATHS.warrantyCases +
      '/' +
      encodeURIComponent(warrantyCaseId) +
      '/attachments',
    options,
  );
}

/**
 * Đường tải nội dung một file đính kèm.
 *
 * Trả **đường dẫn** chứ không tải: nội dung là blob ảnh/video, không đi qua
 * `readOne` vốn chỉ bóc JSON. Bên gọi tự quyết tải hay hiển thị.
 */
export function warrantyAttachmentDownloadPath(attachmentId: string): string {
  return (
    WMS_READ_PATHS.warrantyAttachmentDownload +
    '/' +
    encodeURIComponent(attachmentId) +
    '/download'
  );
}
