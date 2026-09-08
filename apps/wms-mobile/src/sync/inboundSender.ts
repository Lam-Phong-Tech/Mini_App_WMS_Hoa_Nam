/**
 * Bộ gửi thật cho hàng đợi — **chỉ luồng nhập kho**, chỉ thao tác đã duyệt.
 *
 * 🔓 `GATE_WMS §2e` (2026-09-06): người dùng duyệt `resolve-code` và `record`,
 * **chưa duyệt** `post-receipt`.
 *
 * ## Vì sao không thay thẳng `gateBlockedSender`
 *
 * Hàng đợi mang **nhiều loại** bản ghi: `INBOUND_RECEIPT_DRAFT`, và các loại
 * xuất kho / bảo hành mà Gate **chưa** mở. Nếu bộ gửi mới nhận tất, thì loại
 * chưa duyệt sẽ rơi vào nhánh mặc định nào đó và có thể lặng lẽ đi ra mạng.
 *
 * ⇒ `createInboundSender` chỉ nhận đúng `kind` nó biết, và **uỷ quyền phần còn
 * lại cho bộ gửi cũ** — tức là vẫn `blocked_by_gate` kèm lý do rõ ràng. Mở
 * thêm luồng nào thì thêm một nhánh có tên, không phải nới một điều kiện.
 *
 * ## 🔴 Tệp này KHÔNG gọi `post-receipt`
 *
 * Ghi nhận xong, phiếu ở trạng thái **chờ duyệt** và tồn kho **chưa** đổi. Đó
 * là đúng chỗ luồng dừng lại theo phê duyệt hiện có. Bước tăng tồn do người
 * duyệt thực hiện trên WMS, không phải app này — cho tới khi có Change Control
 * mới.
 *
 * ## Idempotency — chỗ dễ sai chết người
 *
 * Khoá lấy từ `record.idempotencyKey`, sinh **một lần** lúc `outbox.enqueue` và
 * không đổi qua mọi lần gửi lại. Người dùng chốt 2026-09-05: *"Khi retry phải
 * dùng lại đúng Idempotency-Key cũ."* Sinh khoá ở đây là tạo hai phiếu cho cùng
 * một lô hàng — đúng cái idempotency sinh ra để chặn.
 */

import { AppError, toAppError } from '../errors/AppError';
import { INBOUND_OUTBOX_KIND } from '../features/inbound/inboundDraft';
import type { InboundOutboxPayload } from '../features/inbound/inboundDraft';
import { logger, type Logger } from '../logging/logger';
import { record as recordInbound } from '../services/wms/inboundWrite';
import type { RecordItem, ScanSource } from '../services/wms/inboundWrite';
import type { OutboxRecord } from './types';
import type { OutboxSender } from './syncEngine';

/**
 * Ghi chú gửi kèm phiếu, để người duyệt trên WMS biết phiếu này từ đâu ra.
 *
 * Giữ nguyên tiền tố mà Mini App đang dùng (`receipt-flow.service.ts:691`) —
 * người duyệt đã quen nhận diện phiếu quét bằng chuỗi này.
 */
export const RECORD_NOTE_PREFIX = 'Mini App scan-driven: ';

/**
 * `YYYY-MM-DD` theo **giờ máy**, không phải UTC.
 *
 * `toISOString()` sẽ sai một ngày với ca đêm ở GMT+7: 06:00 ngày 7 giờ Việt Nam
 * là 23:00 ngày 6 theo UTC, và phiếu sẽ mang sai ngày chứng từ.
 */
export function localDateString(now: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    String(now.getFullYear()) +
    '-' +
    pad(now.getMonth() + 1) +
    '-' +
    pad(now.getDate())
  );
}

function isInboundPayload(value: unknown): value is InboundOutboxPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { name?: unknown; codes?: unknown };
  return typeof candidate.name === 'string' && Array.isArray(candidate.codes);
}

/**
 * Đổi payload trong hàng đợi thành `items` của contract.
 *
 * `source` để trống ⇒ coi là `CAMERA`. Bản ghi cũ (ghi ra trước 2026-09-06)
 * không có trường này; đoán `MANUAL` sẽ vu oan cho thủ kho là gõ tay, còn
 * `CAMERA` là trạng thái áp đảo trong thực tế.
 */
export function toRecordItems(
  payload: InboundOutboxPayload,
): readonly RecordItem[] {
  return payload.codes.map(code => {
    const isBox = code.boxNumber !== undefined;

    return {
      // Gửi mã GỐC, không chuẩn hoá — backend cần đúng mã vật lý để tạo
      // SKU/product/item khớp với nhãn dán trên kiện hàng.
      raw_code: code.raw,
      scan_source: (code.source ?? 'CAMERA') as ScanSource,
      // Contract WMS tách hai khái niệm: `item_type` là ITEM/BOX vật lý;
      // `new_sku_type` mới là lựa chọn PRODUCT/COMPONENT trên bottom sheet.
      ...(isBox
        ? { item_type: 'BOX' as const }
        : code.itemType === undefined
        ? {}
        : {
            item_type: 'ITEM' as const,
            new_sku_type: code.itemType,
          }),
      // Chỉ hộp cần SKU tách riêng. Mã thường phải để WMS resolve từ raw code.
      ...(isBox && code.sku !== undefined ? { sku_code: code.sku } : {}),
      quantity: code.quantity,
      box_number: code.boxNumber,
    };
  });
}

/**
 * Vân tay FNV-1a của tập QR, phục vụ đối chiếu conflict mà không ghi QR thô
 * vào console hay hàng đợi. Sắp xếp trước để cùng batch khác thứ tự vẫn có cùng
 * fingerprint; số mã được lưu riêng để phân biệt lô khác kích thước.
 */
export function inboundScanFingerprint(
  payload: InboundOutboxPayload,
): string {
  const source = payload.codes
    .map(code => code.raw.trim().toUpperCase())
    .sort()
    .join('\n');
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return 'fnv1a-' + (hash >>> 0).toString(16).padStart(8, '0');
}

export interface InboundSenderDeps {
  /** Tiêm để test không cần mạng. */
  readonly send?: typeof recordInbound;
  readonly now?: () => Date;
  readonly log?: Logger;
}

/**
 * Bọc `fallback` bằng nhánh xử lý riêng cho phiếu nhập.
 *
 * @param fallback bộ gửi cho mọi `kind` khác — truyền `gateBlockedSender` để
 * các luồng chưa duyệt tiếp tục bị chặn một cách nói ra được.
 */
export function createInboundSender(
  fallback: OutboxSender,
  deps: InboundSenderDeps = {},
): OutboxSender {
  const submit = deps.send ?? recordInbound;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? logger;

  return async (outboxRecord: OutboxRecord): Promise<unknown> => {
    if (outboxRecord.kind !== INBOUND_OUTBOX_KIND) {
      return fallback(outboxRecord);
    }

    const payload = outboxRecord.payload;
    if (!isInboundPayload(payload)) {
      throw new AppError({
        kind: 'parse',
        message:
          'Bản ghi "' + outboxRecord.id + '" không đúng dạng phiếu nhập kho.',
      });
    }

    // Kho nhận thiếu ⇒ KHÔNG đoán một kho nào đó. Gửi sai kho là hàng vào nhầm
    // chỗ, mà phiếu đã POSTED thì không sửa được từ app. Thà báo lỗi để thủ kho
    // tạo lại phiếu với kho đúng.
    const warehouseId = payload.warehouseId ?? '';
    if (warehouseId === '') {
      throw new AppError({
        kind: 'config',
        message:
          'Phiếu "' +
          payload.name +
          '" thiếu kho nhận nên không gửi được. Tạo lại phiếu và chọn kho.',
      });
    }

    const items = toRecordItems(payload);

    try {
      return await submit(
        {
          name: payload.name,
          dstWarehouseId: warehouseId,
          items,
          docDate: localDateString(now()),
          note: RECORD_NOTE_PREFIX + payload.name,
        },
        // Khoá ổn định của bản ghi — xem chú thích đầu tệp.
        outboxRecord.idempotencyKey,
      );
    } catch (cause) {
      const error = toAppError(cause);
      if (error.kind !== 'http' || error.status !== 409) {
        throw cause;
      }

      const scanFingerprint = inboundScanFingerprint(payload);
      const scanCount = payload.codes.length;
      // Một dòng structured, không lộ QR/serial: backend có thể lọc theo
      // requestId, còn client đối chiếu đúng lô qua fingerprint.
      log.warn('Inbound record conflict.', {
        errorCode: error.code,
        route: error.route,
        requestId: error.requestId,
        scanFingerprint,
        scanCount,
      });
      throw new AppError({
        kind: error.kind,
        message: error.message,
        status: error.status,
        code: error.code,
        route: error.route,
        requestId: error.requestId,
        scanFingerprint,
        scanCount,
        cause: error.cause ?? cause,
      });
    }
  };
}
