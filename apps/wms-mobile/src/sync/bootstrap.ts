/**
 * Khởi tạo tầng dữ liệu lúc app mở.
 *
 * Thứ tự bắt buộc:
 *   1. `runMigrations` — trước khi bất kỳ repository nào đọc dữ liệu cũ.
 *   2. `recoverAfterRestart` — dọn bản ghi kẹt ở `syncing` do app bị đóng đột ngột.
 *
 * Gọi đúng một lần từ `App.tsx`.
 */

import { getAppStorage } from '../storage/storage';
import { runMigrations } from '../storage/schema';
import { logger } from '../logging/logger';
import { AppError } from '../errors/AppError';
import { createOutbox, type Outbox } from './outbox';
import { createSyncEngine, type OutboxSender, type SyncEngine } from './syncEngine';
import { createInboundSender } from './inboundSender';
import { createOutboundSender } from './outboundSender';

/**
 * Bộ gửi mặc định của ứng dụng.
 *
 * ❌ **Cố ý KHÔNG gửi gì cả.** Chưa có endpoint nghiệp vụ nào được xác nhận:
 * `GATE_WMS_API_INTEGRATION` vẫn BLOCKED và GATE_01 §11 điều 4 vẫn cấm gọi
 * mutation thật lên WMS.
 *
 * Đây **không phải mock để giả vờ đã xong** (Prompt 3 cấm điều đó). Nó là một
 * lời từ chối thẳng thắn, có thể quan sát được: bản ghi quay về `pending` kèm
 * lý do rõ ràng, không bao giờ bị đánh dấu `synced` sai sự thật.
 *
 * 🔓 **Từ 2026-09-06 đây không còn là bộ gửi mặc định**, mà là **mắt xích
 * cuối** của một chuỗi: `outbound → inbound → đây`. Loại nào chưa được duyệt
 * (bảo hành) rơi tới đây và vẫn bị chặn một cách **nói ra được** — không lặng lẽ.
 */
export const gateBlockedSender: OutboxSender = async record => {
  throw new AppError({
    kind: 'blocked_by_gate',
    message:
      'Chưa gửi được bản ghi "' +
      record.kind +
      '": GATE_WMS_API_INTEGRATION chưa PASS nên chưa có endpoint nghiệp vụ nào được đấu nối.',
  });
};

export interface DataLayer {
  readonly outbox: Outbox;
  readonly syncEngine: SyncEngine;
  readonly schemaFrom: number;
  readonly schemaTo: number;
  readonly recoveredOnStart: number;
}

let instance: DataLayer | undefined;

/**
 * Bộ gửi mặc định của ứng dụng — **nơi duy nhất** quyết định cái gì được gửi đi.
 *
 * | `kind` | Đi đâu | Change Control |
 * |---|---|---|
 * | `OUTBOUND_ISSUE_DRAFT` | `POST outbound/record` | `§2g` |
 * | `INBOUND_RECEIPT_DRAFT` | `POST inbound/record` | `§2e` |
 * | mọi loại khác | 🔴 `gateBlockedSender` | chưa duyệt |
 *
 * Cố ý dựng ở đây chứ không rải trong từng bộ gửi: đọc một tệp là thấy đủ danh
 * sách. Thêm luồng nào thì thêm một mắt xích **có tên** vào chuỗi này.
 */
export const defaultSender: OutboxSender = createOutboundSender(
  createInboundSender(gateBlockedSender),
);

export function initDataLayer(sender: OutboxSender = defaultSender): DataLayer {
  if (instance !== undefined) {
    return instance;
  }

  const storage = getAppStorage();
  const migration = runMigrations(storage);
  if (migration.failedAt !== undefined) {
    logger.error('Migration chưa hoàn tất, dữ liệu có thể ở dạng cũ.', migration);
  }

  const outbox = createOutbox({ storage });
  const { recovered } = outbox.recoverAfterRestart();
  const syncEngine = createSyncEngine({ outbox, send: sender });

  instance = {
    outbox,
    syncEngine,
    schemaFrom: migration.from,
    schemaTo: migration.to,
    recoveredOnStart: recovered,
  };
  return instance;
}

export function getDataLayer(): DataLayer {
  return initDataLayer();
}

/** Chỉ dùng trong test. */
export function resetDataLayerForTesting(): void {
  instance = undefined;
}
