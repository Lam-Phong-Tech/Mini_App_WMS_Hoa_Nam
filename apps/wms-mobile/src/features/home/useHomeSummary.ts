/**
 * Dữ liệu cho Trang chủ.
 *
 * 🔓 Đọc thật qua `GATE_WMS §2d`. Không mock, không fixture.
 *
 * ## Nguồn các chỉ số
 *
 * *Chờ duyệt* luôn lấy từ cùng hai truy vấn hàng đợi với màn Duyệt phiếu:
 * phiếu nhập `WAITING_APPROVAL` và phiếu xuất do WMS xác nhận sẵn sàng. Không
 * suy ra từ `DRAFT`/`SCANNING` của trang lịch sử, vì các trạng thái đó chưa
 * phải lúc nào cũng có thể duyệt/Post.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toAppError, type AppError } from '../../errors/AppError';
import {
  WMS_READ_PATHS,
  fetchInboundDocuments,
  fetchOutboundDocuments,
  fetchWarrantyCases,
} from '../../services/wms/queries';
import type { InboundDocument, Page } from '../../services/wms/types';
import {
  approvalQueueQuery,
  approvalQueueTotal,
} from '../approvals/approvalQueue';

/** Trạng thái chờ duyệt giống Mini App nguồn. */
export const STATUS_WAITING_APPROVAL = 'WAITING_APPROVAL';
export const APPROVED_DASHBOARD_STATUSES = new Set([
  'POSTED',
  'APPROVED',
  'COMPLETED',
]);

/** Hồ sơ chưa kết thúc/chưa trả máy cho khách. */
const OPEN_WARRANTY_STATUSES = ['RECEIVED', 'CHECKING', 'REPAIRING'] as const;

function hasStatus(
  document: InboundDocument,
  statuses: ReadonlySet<string>,
): boolean {
  return statuses.has(String(document.status ?? '').toUpperCase());
}

export interface HomeSummary {
  /** Số phiếu chờ duyệt. `undefined` khi chưa tải xong. */
  readonly pendingApproval?: number;
  /**
   * Số phiếu nhập đã ghi sổ trong trang 50 dòng vừa tải.
   *
   * Đây KHÔNG phải tổng toàn kho hoặc tổng "hôm nay": BE chưa có endpoint
   * aggregate theo ngày, nên không được gắn nhãn sai phạm vi cho con số này.
   */
  readonly postedInboundInLoadedPage?: number;
  /** Tổng hồ sơ đang mở do WMS trả theo ba trạng thái đang xử lý. */
  readonly openWarranty?: number;
  /** Vài phiếu nhập gần nhất, cho khối cuối Trang chủ. */
  readonly recent: readonly InboundDocument[];
}

export type HomePhase = 'loading' | 'ready' | 'error';

export interface HomeState {
  readonly phase: HomePhase;
  readonly summary: HomeSummary;
  readonly error?: AppError;
  /** Giờ tải gần nhất, cho dòng *"Cập nhật 23:45"* ở ảnh 11. */
  readonly loadedAt?: Date;
  readonly refreshing: boolean;
}

export interface UseHomeSummaryDeps {
  /** Snapshot cho danh sách "Sản phẩm đã duyệt" ở cuối Trang chủ. */
  readonly fetchDocuments?: typeof fetchInboundDocuments;
  /** Hai nguồn này phải giống hệt nguồn màn Duyệt phiếu. */
  readonly fetchInboundPending?: typeof fetchInboundDocuments;
  readonly fetchOutboundPending?: typeof fetchOutboundDocuments;
  /** Tiêm riêng cho test; app thật dùng `fetchWarrantyCases`. */
  readonly fetchWarrantyOpen?: typeof fetchWarrantyCases;
}

const EMPTY: HomeSummary = { recent: [] };

function pageTotal<T>(page: Page<T>): number {
  return page.meta?.total ?? page.items.length;
}

async function fetchOpenWarrantyCount(
  fetchCases: typeof fetchWarrantyCases,
): Promise<number> {
  // Mỗi request chỉ hỏi 1 dòng và lấy `meta.total`, nên không kéo danh sách
  // hồ sơ dài về Home. API hiện chưa có endpoint dashboard aggregate.
  const pages = await Promise.all(
    OPEN_WARRANTY_STATUSES.map(status =>
      fetchCases({ query: { status, per_page: 1 } }),
    ),
  );
  return pages.reduce((total, page) => total + pageTotal(page), 0);
}

export function useHomeSummary(deps: UseHomeSummaryDeps = {}): HomeState & {
  reload: () => void;
} {
  const fetchDocuments = deps.fetchDocuments ?? fetchInboundDocuments;
  const fetchInboundPending = deps.fetchInboundPending ?? fetchInboundDocuments;
  const fetchOutboundPending = deps.fetchOutboundPending ?? fetchOutboundDocuments;
  // Khi test đã tiêm bất kỳ nguồn đọc nào, không âm thầm gọi WMS thật cho KPI
  // mới. App thật gọi hook không đối số nên luôn dùng endpoint bảo hành thật.
  const fetchWarrantyOpen = deps.fetchWarrantyOpen ??
    (Object.keys(deps).length === 0 ? fetchWarrantyCases : undefined);

  const [state, setState] = useState<HomeState>({
    phase: 'loading',
    summary: EMPTY,
    refreshing: false,
  });
  /** Chỉ request mới nhất được phép ghi state; query hiện chưa nhận AbortSignal. */
  const requestSequence = useRef(0);
  const mounted = useRef(true);

  const load = useCallback(
    async (isRefresh: boolean) => {
      const requestId = ++requestSequence.current;
      setState(current => ({
        ...current,
        phase: isRefresh ? current.phase : 'loading',
        refreshing: isRefresh,
      }));

      try {
        // `recent` chỉ phục vụ danh sách cuối Trang chủ. Số *Chờ duyệt* phải
        // đọc chính hai hàng đợi mà màn Duyệt hiển thị — trước đây nó đếm nhầm
        // cả DRAFT/SCANNING từ snapshot nhập, nên có thể lệch với Duyệt phiếu.
        const [recent, inboundQueue, outboundQueue, warrantyResult] = await Promise.all([
          fetchDocuments({ query: { per_page: 50 } }),
          fetchInboundPending({ query: approvalQueueQuery('inbound') }),
          fetchOutboundPending({ query: approvalQueueQuery('outbound') }),
          // Một lỗi đọc KPI bảo hành không được làm Home mất cả danh sách
          // chứng từ hay hàng đợi duyệt đang tải được.
          fetchWarrantyOpen === undefined
            ? Promise.resolve<number | undefined>(undefined)
            : fetchOpenWarrantyCount(fetchWarrantyOpen)
                .catch(() => undefined),
        ]);

        if (!mounted.current || requestId !== requestSequence.current) return;
        setState({
          phase: 'ready',
          refreshing: false,
          loadedAt: new Date(),
          summary: {
            pendingApproval:
              approvalQueueTotal(inboundQueue.items.length) +
              approvalQueueTotal(outboundQueue.items.length),
            postedInboundInLoadedPage: recent.items.filter(document =>
              hasStatus(document, APPROVED_DASHBOARD_STATUSES),
            ).length,
            openWarranty: warrantyResult,
            recent: recent.items.slice(0, 5),
          },
        });
      } catch (error) {
        if (!mounted.current || requestId !== requestSequence.current) return;
        // Giữ snapshot thành công gần nhất. Nếu chưa từng tải thành công,
        // các KPI vẫn là `undefined` và UI bắt buộc hiển thị "—", không bịa 0.
        setState(current => ({
          phase: 'error',
          refreshing: false,
          summary: current.summary,
          loadedAt: current.loadedAt,
          error: toAppError(error),
        }));
      }
    },
    [fetchDocuments, fetchInboundPending, fetchOutboundPending, fetchWarrantyOpen],
  );

  useEffect(() => {
    mounted.current = true;
    // `catch` rỗng có chủ đích: `load` đã tự bắt lỗi và đưa vào state. Ở đây chỉ
    // cần chặn unhandled rejection, không xử lý gì thêm.
    load(false).catch(() => undefined);
    return () => {
      mounted.current = false;
      requestSequence.current += 1;
    };
  }, [load]);

  const reload = useCallback(() => {
    load(true).catch(() => undefined);
  }, [load]);

  return { ...state, reload };
}

/** Đường dẫn màn này đọc — để test đối chiếu khỏi phải đoán. */
export const HOME_SOURCE_PATH = WMS_READ_PATHS.inboundDocuments;
