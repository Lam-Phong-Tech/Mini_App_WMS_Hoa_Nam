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

import { useCallback, useEffect, useState } from 'react';
import { toAppError, type AppError } from '../../errors/AppError';
import {
  WMS_READ_PATHS,
  fetchInboundDocuments,
  fetchOutboundDocuments,
} from '../../services/wms/queries';
import type { InboundDocument } from '../../services/wms/types';
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

function hasStatus(
  document: InboundDocument,
  statuses: ReadonlySet<string>,
): boolean {
  return statuses.has(String(document.status ?? '').toUpperCase());
}

export interface HomeSummary {
  /** Số phiếu chờ duyệt. `undefined` khi chưa tải xong. */
  readonly pendingApproval?: number;
  /** Số phiếu đã hoàn tất, cùng nguồn với Mini App web. */
  readonly approvedCount?: number;
  /** Vài phiếu gần nhất, cho khối *"Sản phẩm đã duyệt"*. */
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
}

const EMPTY: HomeSummary = { recent: [] };

export function useHomeSummary(deps: UseHomeSummaryDeps = {}): HomeState & {
  reload: () => void;
} {
  const fetchDocuments = deps.fetchDocuments ?? fetchInboundDocuments;
  const fetchInboundPending = deps.fetchInboundPending ?? fetchInboundDocuments;
  const fetchOutboundPending = deps.fetchOutboundPending ?? fetchOutboundDocuments;

  const [state, setState] = useState<HomeState>({
    phase: 'loading',
    summary: EMPTY,
    refreshing: false,
  });

  const load = useCallback(
    async (isRefresh: boolean) => {
      setState(current => ({
        ...current,
        phase: isRefresh ? current.phase : 'loading',
        refreshing: isRefresh,
      }));

      try {
        // `recent` chỉ phục vụ danh sách cuối Trang chủ. Số *Chờ duyệt* phải
        // đọc chính hai hàng đợi mà màn Duyệt hiển thị — trước đây nó đếm nhầm
        // cả DRAFT/SCANNING từ snapshot nhập, nên có thể lệch với Duyệt phiếu.
        const [recent, inboundQueue, outboundQueue] = await Promise.all([
          fetchDocuments({ query: { per_page: 50 } }),
          fetchInboundPending({ query: approvalQueueQuery('inbound') }),
          fetchOutboundPending({ query: approvalQueueQuery('outbound') }),
        ]);

        setState({
          phase: 'ready',
          refreshing: false,
          loadedAt: new Date(),
          summary: {
            pendingApproval:
              approvalQueueTotal(inboundQueue.items.length) +
              approvalQueueTotal(outboundQueue.items.length),
            approvedCount: recent.items.filter(document =>
              hasStatus(document, APPROVED_DASHBOARD_STATUSES),
            ).length,
            recent: recent.items.slice(0, 5),
          },
        });
      } catch (error) {
        setState({
          phase: 'error',
          refreshing: false,
          summary: EMPTY,
          error: toAppError(error),
        });
      }
    },
    [fetchDocuments, fetchInboundPending, fetchOutboundPending],
  );

  useEffect(() => {
    // `catch` rỗng có chủ đích: `load` đã tự bắt lỗi và đưa vào state. Ở đây chỉ
    // cần chặn unhandled rejection, không xử lý gì thêm.
    load(false).catch(() => undefined);
  }, [load]);

  const reload = useCallback(() => {
    load(true).catch(() => undefined);
  }, [load]);

  return { ...state, reload };
}

/** Đường dẫn màn này đọc — để test đối chiếu khỏi phải đoán. */
export const HOME_SOURCE_PATH = WMS_READ_PATHS.inboundDocuments;
