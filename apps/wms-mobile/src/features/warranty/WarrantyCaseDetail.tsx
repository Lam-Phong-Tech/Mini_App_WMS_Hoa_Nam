/**
 * Chi tiết một hồ sơ bảo hành — nối `WarrantyDetailScreen` với dữ liệu thật.
 *
 * 🎨 Nguồn: ảnh **44, 45, 46**.
 *
 * ## 🔴 Vì sao có tệp này
 *
 * Bấm một hồ sơ ở màn danh sách trước đây **không làm gì** — `onOpenCase` chưa
 * được nối ở `AppShell`. Nghĩa là toàn bộ màn chi tiết (chuyển trạng thái,
 * timeline, ảnh/video) **không tới được từ trong app**, dù ba phần đó đều đã
 * dựng và test xong.
 *
 * Phát hiện ngày 2026-09-06 khi chạy thử bộ chọn ảnh trên máy thật: bấm vào hồ
 * sơ, log không có lời gọi `/warranty-cases/{id}` nào. Đúng loại lỗi mà test
 * đơn vị không bắt được — mỗi mảnh đều đúng, chỉ là không ai nối chúng lại.
 *
 * ## Ba nguồn dữ liệu, ba số phận khi hỏng
 *
 * | Nguồn | Hỏng thì sao |
 * |---|---|
 * | Hồ sơ | đã có sẵn từ danh sách — màn luôn vẽ được |
 * | Timeline | hiện lỗi, **không** nuốt thành danh sách rỗng |
 * | Tệp đính kèm | `useAttachments` tự xử, cũng không nuốt |
 *
 * Timeline rỗng trông y hệt *"hồ sơ chưa có xử lý nào"* — với hồ sơ đang Sửa
 * chữa thì đó là điều không thể đúng.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { toAppError, messageForUser } from '../../errors/AppError';
import { fetchWarrantyEvents } from '../../services/wms/queries';
import { WarrantyDetailScreen } from './WarrantyDetailScreen';
import { useWarrantyTransition } from './useWarrantyTransition';
import { useWarrantyComponentHistory } from './useWarrantyComponentHistory';
import { WARRANTY_STATUSES } from './warrantyPolicy';
import type { WarrantyCase } from '../../services/wms/types';
import type { TimelineEntry } from '../../ui/Timeline';

interface RawEvent {
  readonly id?: string;
  readonly status?: string;
  readonly note?: string;
  readonly created_at?: string;
  readonly actor_name?: string;
}

/** Bước hiện tại trên stepper 4 bước của ảnh 44. */
export function stepForStatus(status: string | undefined): number {
  const index = WARRANTY_STATUSES.indexOf(
    (status ?? '').toUpperCase() as never,
  );
  // `CANCELLED` không nằm trên trục tiến độ — giữ ở bước 0 thay vì đẩy ra cuối,
  // vì hồ sơ huỷ không phải hồ sơ đã hoàn thành.
  if (index < 0 || (status ?? '').toUpperCase() === 'CANCELLED') {
    return 0;
  }
  return Math.min(index, 3);
}

export interface WarrantyCaseDetailProps {
  warrantyCase: WarrantyCase;
  onBack: () => void;
  onIssueComponents?: (warrantyCase: WarrantyCase) => void;
  created?: boolean;
  /** Tiêm để test không cần mạng. */
  loadEvents?: typeof fetchWarrantyEvents;
}

export function WarrantyCaseDetail({
  warrantyCase,
  onBack,
  onIssueComponents,
  created = false,
  loadEvents = fetchWarrantyEvents,
}: WarrantyCaseDetailProps): React.ReactElement {
  // Hồ sơ đến từ danh sách; sau mỗi lần chuyển trạng thái thì lấy bản mới.
  const [current, setCurrent] = useState(warrantyCase);
  const [timeline, setTimeline] = useState<readonly TimelineEntry[]>([]);
  const [timelineError, setTimelineError] = useState<string | undefined>();
  const componentHistory = useWarrantyComponentHistory(current.warranty_case_id);

  const refreshTimeline = useCallback(() => {
    setTimelineError(undefined);
    loadEvents(current.warranty_case_id)
      .then(page =>
        setTimeline(
          (page.items as readonly RawEvent[]).map((event, index) => ({
            id: event.id ?? String(index),
            code: (event.status ?? 'CẬP NHẬT').toUpperCase(),
            note: event.note ?? event.actor_name ?? undefined,
            at: event.created_at,
          })),
        ),
      )
      .catch(cause =>
        // 🔴 KHÔNG nuốt thành danh sách rỗng — xem chú thích đầu tệp.
        setTimelineError(
          'Không tải được timeline: ' + messageForUser(toAppError(cause)),
        ),
      );
  }, [current.warranty_case_id, loadEvents]);

  useEffect(refreshTimeline, [refreshTimeline]);

  const transition = useWarrantyTransition(current.warranty_case_id, {
    onDone: updated => {
      setCurrent(updated);
      refreshTimeline();
    },
  });

  return (
    <WarrantyDetailScreen
      warrantyCase={current}
      timeline={timeline}
      timelineError={timelineError}
      currentStep={stepForStatus(current.status)}
      created={created}
      transitionError={
        transition.error === undefined
          ? undefined
          : messageForUser(transition.error)
      }
      componentHistory={componentHistory.documents}
      componentHistoryLoading={componentHistory.loading}
      componentHistoryError={componentHistory.error}
      onReloadComponentHistory={componentHistory.refresh}
      transitioning={transition.running}
      onTransition={(status, note, confirmedDefect) => {
        transition.run(status, note, confirmedDefect).catch(() => undefined);
      }}
      onIssueComponents={
        onIssueComponents === undefined
          ? undefined
          : () => onIssueComponents(current)
      }
      onBack={onBack}
    />
  );
}
