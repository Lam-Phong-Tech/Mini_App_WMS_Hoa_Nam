/**
 * Dữ liệu cho Trang chủ.
 *
 * 🔓 Đọc thật qua `GATE_WMS §2d`. Không mock, không fixture.
 *
 * ## Nguồn các chỉ số
 *
 * Mini App gốc lấy tối đa 50 phiếu nhập, rồi phân loại trạng thái để hiện cả
 * *Chờ duyệt* và *Đã duyệt hôm nay*. Bản native trước đây chỉ gọi danh sách
 * `WAITING_APPROVAL`; vì vậy ô thứ hai phải hiện `—`, dù dữ liệu đã có trong
 * WMS. Lấy một danh sách chung cũng tránh hai kết quả lệch thời điểm.
 *
 * ## 🔴 V-01 — và vì sao Trang chủ KHÔNG phải chỗ sai
 *
 * Khảo sát thấy Trang chủ ghi *"Chờ duyệt: 5"* trong khi màn Duyệt phiếu ghi
 * *"0 phiếu chờ duyệt"* ([04-screen-survey.md §4](../../../../../docs/migration/04-screen-survey.md)).
 * Đối chiếu log mạng thì rõ nguyên nhân: hai màn **không** đọc lệch nhau — màn
 * Duyệt phiếu chỉ **chưa nạp**, vì nó đòi bấm *"Đồng bộ WMS"* thủ công (V-02).
 *
 * ⇒ Sửa đúng chỗ là cho màn Duyệt phiếu **tự nạp** (thuộc đợt 5), không phải
 * đổi Trang chủ. Ghi lại đây để lần sau không ai "sửa" nhầm màn.
 */

import { useCallback, useEffect, useState } from 'react';
import { toAppError, type AppError } from '../../errors/AppError';
import {
  WMS_READ_PATHS,
  fetchInboundDocuments,
} from '../../services/wms/queries';
import type { InboundDocument } from '../../services/wms/types';

/** Trạng thái chờ duyệt giống Mini App nguồn. */
export const STATUS_WAITING_APPROVAL = 'WAITING_APPROVAL';
export const PENDING_DASHBOARD_STATUSES = new Set([
  'DRAFT',
  'SCANNING',
  'READY_TO_ISSUE',
  'WAITING_APPROVAL',
  'PENDING_APPROVAL',
  'PENDING',
  'SUBMITTED',
]);
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
  readonly fetchDocuments?: typeof fetchInboundDocuments;
}

const EMPTY: HomeSummary = { recent: [] };

export function useHomeSummary(deps: UseHomeSummaryDeps = {}): HomeState & {
  reload: () => void;
} {
  const fetchDocuments = deps.fetchDocuments ?? fetchInboundDocuments;

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
        // Cùng một snapshot cho cả hai KPI, đúng Mini App nguồn. Lấy 50 là
        // giới hạn của dashboard web, không tải toàn bộ lịch sử về PDA.
        const recent = await fetchDocuments({ query: { per_page: 50 } });

        setState({
          phase: 'ready',
          refreshing: false,
          loadedAt: new Date(),
          summary: {
            pendingApproval: recent.items.filter(document =>
              hasStatus(document, PENDING_DASHBOARD_STATUSES),
            ).length,
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
    [fetchDocuments],
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
