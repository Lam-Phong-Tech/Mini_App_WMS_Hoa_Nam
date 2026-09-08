/**
 * Bộ gửi thật cho phiếu **xuất kho** — `GATE_WMS §2g`.
 *
 * Cùng khuôn với `inboundSender.ts`: chỉ nhận đúng `kind` nó biết và **uỷ quyền
 * phần còn lại** cho bộ gửi kế tiếp. Ghép hai bộ lại thành một chuỗi:
 *
 * ```
 * outbound → inbound → gateBlockedSender
 * ```
 *
 * Loại nào chưa được duyệt (bảo hành) rơi tới cuối chuỗi và vẫn bị chặn kèm lý
 * do nói ra được. Mở thêm luồng nào thì thêm **một mắt xích có tên**, không
 * phải nới một điều kiện — điều kiện nới ra thì không ai đọc lại được là nó
 * đang cho những gì đi qua.
 *
 * ## 🔴 Không có bước `post-issue`
 *
 * Gửi xong, phiếu ở trạng thái **chờ duyệt** và tồn kho **chưa giảm**. Đó là
 * đúng chỗ luồng dừng lại theo phê duyệt hiện có (*"chưa duyệt F"*).
 */

import { AppError } from '../errors/AppError';
import { OUTBOUND_OUTBOX_KIND } from '../features/outbound/outboundDraft';
import type { OutboundOutboxPayload } from '../features/outbound/outboundDraft';
import { recordOutbound } from '../services/wms/outboundWrite';
import type { OutboundRecordItem } from '../services/wms/outboundWrite';
import type { ScanSource } from '../scanner/scanPayload';
import type { OutboxRecord } from './types';
import type { OutboxSender } from './syncEngine';

function isOutboundPayload(value: unknown): value is OutboundOutboxPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { recipientName?: unknown; codes?: unknown };
  return (
    typeof candidate.recipientName === 'string' && Array.isArray(candidate.codes)
  );
}

/**
 * Đổi payload trong hàng đợi thành `items` của contract.
 *
 * `source` để trống ⇒ `CAMERA`, cùng lý do với luồng nhập: bản ghi cũ không có
 * trường này, và đoán `MANUAL` là vu oan cho thủ kho là gõ tay.
 */
export function toOutboundRecordItems(
  payload: OutboundOutboxPayload,
): readonly OutboundRecordItem[] {
  return payload.codes.map(code => ({
    raw_code: code.raw,
    scan_source: (code.source ?? 'CAMERA') as ScanSource,
  }));
}

export interface OutboundSenderDeps {
  readonly send?: typeof recordOutbound;
}

export function createOutboundSender(
  fallback: OutboxSender,
  deps: OutboundSenderDeps = {},
): OutboxSender {
  const submit = deps.send ?? recordOutbound;

  return async (outboxRecord: OutboxRecord): Promise<unknown> => {
    if (outboxRecord.kind !== OUTBOUND_OUTBOX_KIND) {
      return fallback(outboxRecord);
    }

    const payload = outboxRecord.payload;
    if (!isOutboundPayload(payload)) {
      throw new AppError({
        kind: 'parse',
        message:
          'Bản ghi "' + outboxRecord.id + '" không đúng dạng phiếu xuất kho.',
      });
    }

    // Kho thiếu ⇒ KHÔNG đoán. Xuất nhầm kho là lấy hàng khỏi chỗ không có nó,
    // và phiếu đã POSTED thì app không sửa được.
    const warehouseId = payload.warehouseId ?? '';
    if (warehouseId === '') {
      throw new AppError({
        kind: 'config',
        message:
          'Phiếu "' +
          payload.name +
          '" thiếu kho xuất nên không gửi được. Tạo lại phiếu và chọn kho.',
      });
    }

    return submit(
      {
        name: payload.name,
        warehouseId,
        recipientName: payload.recipientName,
        recipientAddress: payload.recipientAddress,
        recipientPhone: payload.phone,
        note: payload.note,
        items: toOutboundRecordItems(payload),
      },
      // Khoá ổn định của bản ghi — sinh một lần lúc `outbox.enqueue`.
      outboxRecord.idempotencyKey,
    );
  };
}
