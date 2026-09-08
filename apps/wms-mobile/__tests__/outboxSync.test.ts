/**
 * Kiểm chứng §D của Prompt 3: hàng đợi offline, khôi phục sau restart,
 * chống gửi trùng, phân loại lỗi, xung đột.
 *
 * Hai quy tắc được người dùng chốt 2026-09-05 và được test bảo vệ ở đây:
 *   - KHÔNG tự retry; timeout → `unknown`, dừng.
 *   - KHÔNG bao giờ tự giải quyết xung đột.
 */

import {
  createMemoryBackend,
  createStorage,
  type KeyValueStorage,
} from '../src/storage/storage';
import {
  createOutbox,
  generateIdempotencyKey,
  generateOutboxId,
  type Outbox,
} from '../src/sync/outbox';
import {
  CONFLICT_STATUSES,
  HTTP_5XX_POLICY,
  UNKNOWN_RESULT_MESSAGE,
  classifyFailure,
  createSyncEngine,
} from '../src/sync/syncEngine';
import { assertNoForbiddenHeaders } from '../src/api/client';
import { AppError } from '../src/errors/AppError';
import { createLogger } from '../src/logging/logger';
import type { ConnectivityState } from '../src/connectivity/connectivity';

const ONLINE: ConnectivityState = {
  isConnected: true,
  isInternetReachable: true,
  type: 'wifi',
};
const OFFLINE: ConnectivityState = {
  isConnected: false,
  isInternetReachable: false,
  type: 'none',
};

const silentLog = createLogger({ minLevel: 'debug', sink: () => undefined });

function freshOutbox(storage: KeyValueStorage = createStorage(createMemoryBackend())): {
  outbox: Outbox;
  storage: KeyValueStorage;
} {
  return { outbox: createOutbox({ storage, log: silentLog }), storage };
}

describe('outbox — hàng đợi bền vững', () => {
  it('enqueue tạo bản ghi pending với dấu thời gian', () => {
    const { outbox } = freshOutbox();
    const record = outbox.enqueue({ kind: 'RECEIPT_DRAFT', payload: { qty: 5 } });

    expect(record.state).toBe('pending');
    expect(record.attemptCount).toBe(0);
    expect(record.kind).toBe('RECEIPT_DRAFT');
    expect(record.payload).toEqual({ qty: 5 });
    expect(Date.parse(record.createdAt)).not.toBeNaN();
  });

  it('id không trùng nhau', () => {
    const ids = new Set(Array.from({ length: 500 }, () => generateOutboxId()));
    expect(ids.size).toBe(500);
  });

  it('tồn tại qua "restart" — outbox mới đọc lại từ cùng storage', () => {
    const storage = createStorage(createMemoryBackend());
    const first = createOutbox({ storage, log: silentLog });
    first.enqueue({ kind: 'A', payload: 1 });
    first.enqueue({ kind: 'B', payload: 2 });

    // Giả lập app khởi động lại: instance mới, cùng storage.
    const second = createOutbox({ storage, log: silentLog });

    expect(second.list()).toHaveLength(2);
    expect(second.summary().pending).toBe(2);
  });

  it('summary đếm đúng từng trạng thái', () => {
    const { outbox } = freshOutbox();
    const a = outbox.enqueue({ kind: 'A', payload: 1 });
    const b = outbox.enqueue({ kind: 'B', payload: 2 });
    const c = outbox.enqueue({ kind: 'C', payload: 3 });

    outbox.transition(a.id, 'synced');
    outbox.transition(b.id, 'conflict');
    outbox.transition(c.id, 'unknown');

    const summary = outbox.summary();
    expect(summary.total).toBe(3);
    expect(summary.synced).toBe(1);
    expect(summary.conflict).toBe(1);
    expect(summary.unknown).toBe(1);
    expect(summary.needsAttention).toBe(2);
  });

  it('transition ghi lại lần thử cuối', () => {
    const { outbox } = freshOutbox();
    const record = outbox.enqueue({ kind: 'A', payload: 1 });

    outbox.transition(record.id, 'failed', {
      errorKind: 'http',
      httpStatus: 422,
      errorCode: 'QTY_INVALID',
      message: 'Số lượng không hợp lệ',
    });

    const after = outbox.get(record.id);
    expect(after?.state).toBe('failed');
    expect(after?.attemptCount).toBe(1);
    expect(after?.lastAttempt?.httpStatus).toBe(422);
    expect(after?.lastAttempt?.errorCode).toBe('QTY_INVALID');
  });

  it('vào syncing KHÔNG tăng attemptCount', () => {
    const { outbox } = freshOutbox();
    const record = outbox.enqueue({ kind: 'A', payload: 1 });

    outbox.transition(record.id, 'syncing');
    expect(outbox.get(record.id)?.attemptCount).toBe(0);
  });
});

describe('khôi phục sau khi app bị đóng giữa lúc gửi', () => {
  it('bản ghi kẹt ở syncing chuyển thành unknown, KHÔNG quay về pending', () => {
    const storage = createStorage(createMemoryBackend());
    const before = createOutbox({ storage, log: silentLog });
    const record = before.enqueue({ kind: 'A', payload: 1 });
    before.transition(record.id, 'syncing');

    // App chết ở đây. Khởi động lại:
    const after = createOutbox({ storage, log: silentLog });
    const { recovered } = after.recoverAfterRestart();

    expect(recovered).toBe(1);
    // Quay về `pending` sẽ khiến lần đồng bộ sau gửi lại → nguy cơ trùng.
    expect(after.get(record.id)?.state).toBe('unknown');
    expect(after.get(record.id)?.lastAttempt?.message).toMatch(/kiểm tra thủ công/i);
  });

  it('không đụng tới bản ghi ở trạng thái khác', () => {
    const { outbox } = freshOutbox();
    const pending = outbox.enqueue({ kind: 'A', payload: 1 });
    const synced = outbox.enqueue({ kind: 'B', payload: 2 });
    outbox.transition(synced.id, 'synced');

    outbox.recoverAfterRestart();

    expect(outbox.get(pending.id)?.state).toBe('pending');
    expect(outbox.get(synced.id)?.state).toBe('synced');
  });
});

describe('dọn dữ liệu', () => {
  it('chỉ xoá bản ghi đã synced và đủ cũ', () => {
    const storage = createStorage(createMemoryBackend());
    let clock = new Date('2026-01-01T00:00:00.000Z');
    const outbox = createOutbox({ storage, log: silentLog, now: () => clock });

    const old = outbox.enqueue({ kind: 'A', payload: 1 });
    outbox.transition(old.id, 'synced');

    clock = new Date('2026-01-10T00:00:00.000Z');
    const recent = outbox.enqueue({ kind: 'B', payload: 2 });
    outbox.transition(recent.id, 'synced');
    const pending = outbox.enqueue({ kind: 'C', payload: 3 });
    const conflict = outbox.enqueue({ kind: 'D', payload: 4 });
    outbox.transition(conflict.id, 'conflict');

    // Cắt mọi bản synced cũ hơn 5 ngày.
    const { removed } = outbox.pruneSynced(5 * 24 * 60 * 60 * 1000);

    expect(removed).toBe(1);
    expect(outbox.get(old.id)).toBeUndefined();
    expect(outbox.get(recent.id)).toBeDefined();
    // GATE_01 §3: không được làm mất dữ liệu chưa gửi.
    expect(outbox.get(pending.id)).toBeDefined();
    expect(outbox.get(conflict.id)).toBeDefined();
  });

  it('không bao giờ xoá pending/failed/conflict/unknown dù cũ đến đâu', () => {
    const storage = createStorage(createMemoryBackend());
    const clock = new Date('2020-01-01T00:00:00.000Z');
    const outbox = createOutbox({ storage, log: silentLog, now: () => clock });

    for (const state of ['pending', 'failed', 'conflict', 'unknown'] as const) {
      const record = outbox.enqueue({ kind: state, payload: 1 });
      if (state !== 'pending') {
        outbox.transition(record.id, state);
      }
    }

    const { removed } = outbox.pruneSynced(1);
    expect(removed).toBe(0);
    expect(outbox.list()).toHaveLength(4);
  });
});

describe('phân loại lỗi — quyết định gửi lại hay dừng', () => {
  it('lỗi chắc chắn CHƯA rời máy → pending, gửi lại an toàn', () => {
    for (const kind of ['network', 'config'] as const) {
      const result = classifyFailure(new AppError({ kind, message: 'x' }));
      expect(result.state).toBe('pending');
    }
    expect(
      classifyFailure(new AppError({ kind: 'blocked_by_gate', message: 'Gate chặn' }))
        .state,
    ).toBe('pending');
  });

  it('timeout → unknown, KHÔNG được gửi lại tự động', () => {
    const result = classifyFailure(new AppError({ kind: 'timeout', message: 'x' }));
    expect(result.state).toBe('unknown');
    expect(result.reason).toContain(UNKNOWN_RESULT_MESSAGE);
  });

  // -------------------------------------------------------------------------
  // Chính sách an toàn — người dùng chốt 2026-09-05
  // -------------------------------------------------------------------------

  it('thông điệp giữ ĐÚNG nguyên văn người dùng chốt, không diễn đạt lại', () => {
    // "đồng bộ/đối chiếu" là thao tác nghiệp vụ có thật. Ai paraphrase câu này
    // là đổi hướng dẫn cho thủ kho đang cầm hàng.
    expect(UNKNOWN_RESULT_MESSAGE).toBe(
      'Chưa xác định máy chủ đã ghi nhận hay chưa. ' +
        'Vui lòng đồng bộ/đối chiếu trước khi gửi lại.',
    );
  });

  it('500, 502, 503, 504 đều → unknown — không ngoại lệ nào', () => {
    for (const status of [500, 502, 503, 504]) {
      const result = classifyFailure(
        new AppError({ kind: 'http', status, message: 'x' }),
      );
      expect(result.state).toBe('unknown');
      expect(result.reason).toContain(UNKNOWN_RESULT_MESSAGE);
    }
  });

  it('HTTP_5XX_POLICY vẫn là "unknown" — đây là chính sách đã chốt', () => {
    // Đổi hằng số này đòi backend chứng minh ĐỦ BỐN điều kiện người dùng đặt ra
    // (rollback toàn bộ · không side effect ngoài transaction · idempotency
    // hoạt động đúng · có integration test). Xem chú thích trong syncEngine.ts.
    expect(HTTP_5XX_POLICY).toBe('unknown');
  });

  it('timeout và mất kết nối là unknown VĨNH VIỄN, kể cả nếu 5xx sau này được nới', () => {
    // Bốn điều kiện kia chỉ mở được cho 500. Nhánh này không có đường nới.
    for (const kind of ['timeout', 'cancelled', 'parse'] as const) {
      expect(classifyFailure(new AppError({ kind, message: 'x' })).state).toBe(
        'unknown',
      );
    }
  });

  it('bị Cloudflare chặn → pending, KHÔNG phải unknown', () => {
    // Request chưa từng tới ứng dụng ⇒ không có gì để ghi trùng ⇒ gửi lại an
    // toàn. Xếp nhầm sang `unknown` là bắt thủ kho đi đối chiếu một phiếu mà
    // máy chủ chưa hề nhận.
    const result = classifyFailure(
      new AppError({ kind: 'blocked_by_edge', status: 403, message: 'x' }),
    );
    expect(result.state).toBe('pending');
    expect(result.reason).toMatch(/quản trị/i);
  });

  it('phản hồi không đọc được → unknown vì mutation có thể đã áp dụng', () => {
    expect(classifyFailure(new AppError({ kind: 'parse', message: 'x' })).state).toBe(
      'unknown',
    );
  });

  it('409 và 412 → conflict', () => {
    for (const status of CONFLICT_STATUSES) {
      const result = classifyFailure(
        new AppError({ kind: 'http', status, message: 'x' }),
      );
      expect(result.state).toBe('conflict');
      expect(result.reason).toMatch(/không tự ghi đè/i);
    }
  });

  it('4xx khác → failed (lỗi nghiệp vụ)', () => {
    expect(
      classifyFailure(new AppError({ kind: 'http', status: 422, message: 'x' })).state,
    ).toBe('failed');
    expect(classifyFailure(new AppError({ kind: 'auth', message: 'x' })).state).toBe(
      'failed',
    );
  });

  it('giữ nguyên phản hồi nghiệp vụ của WMS để màn Gửi duyệt chỉ đúng lỗi', () => {
    const result = classifyFailure(
      new AppError({
        kind: 'http',
        // WMS có thể trả 200 kèm `success: false`; message mới là lỗi thật.
        status: 200,
        message: 'SKU HN-PV-BASE-002 chưa được phép nhập vào kho đã chọn.',
      }),
    );
    expect(result.state).toBe('failed');
    expect(result.reason).toBe(
      'SKU HN-PV-BASE-002 chưa được phép nhập vào kho đã chọn.',
    );
  });

  it('5xx theo đúng chính sách đang khai báo (mặc định: unknown)', () => {
    const result = classifyFailure(
      new AppError({ kind: 'http', status: 503, message: 'x' }),
    );
    expect(result.state).toBe(HTTP_5XX_POLICY);
    expect(HTTP_5XX_POLICY).toBe('unknown');
  });
});

describe('máy đồng bộ', () => {
  it('gửi thành công → synced', async () => {
    const { outbox } = freshOutbox();
    const record = outbox.enqueue({ kind: 'A', payload: 1 });
    const engine = createSyncEngine({
      outbox,
      send: async () => undefined,
      log: silentLog,
    });

    const result = await engine.syncOne(record.id);

    expect(result.state).toBe('synced');
    expect(outbox.get(record.id)?.state).toBe('synced');
    expect(outbox.get(record.id)?.attemptCount).toBe(1);
  });

  it('offline → không gửi gì, không đánh dấu bản ghi nào thất bại', async () => {
    const { outbox } = freshOutbox();
    outbox.enqueue({ kind: 'A', payload: 1 });
    let called = 0;
    const engine = createSyncEngine({
      outbox,
      send: async () => {
        called += 1;
      },
      log: silentLog,
    });

    const run = await engine.syncAll(OFFLINE);

    expect(called).toBe(0);
    expect(run.attempted).toBe(0);
    expect(run.haltedReason).toMatch(/offline/i);
    expect(outbox.summary().pending).toBe(1);
  });

  it('có mạng lại thì gửi được đúng các bản ghi đang chờ', async () => {
    const { outbox } = freshOutbox();
    outbox.enqueue({ kind: 'A', payload: 1 });
    outbox.enqueue({ kind: 'B', payload: 2 });
    const engine = createSyncEngine({
      outbox,
      send: async () => undefined,
      log: silentLog,
    });

    await engine.syncAll(OFFLINE);
    expect(outbox.summary().synced).toBe(0);

    const run = await engine.syncAll(ONLINE);
    expect(run.attempted).toBe(2);
    expect(run.synced).toBe(2);
    expect(outbox.summary().synced).toBe(2);
  });

  it('KHÔNG tự retry: một lần syncAll chỉ gửi mỗi bản ghi đúng một lần', async () => {
    const { outbox } = freshOutbox();
    outbox.enqueue({ kind: 'A', payload: 1 });
    let calls = 0;
    const engine = createSyncEngine({
      outbox,
      send: async () => {
        calls += 1;
        throw new AppError({ kind: 'timeout', message: 'quá lâu' });
      },
      log: silentLog,
    });

    await engine.syncAll(ONLINE);

    expect(calls).toBe(1);
    expect(outbox.summary().unknown).toBe(1);
  });

  it('bản ghi unknown và conflict bị loại khỏi mọi lần đồng bộ sau', async () => {
    const { outbox } = freshOutbox();
    const a = outbox.enqueue({ kind: 'A', payload: 1 });
    const b = outbox.enqueue({ kind: 'B', payload: 2 });
    outbox.transition(a.id, 'unknown');
    outbox.transition(b.id, 'conflict');

    let calls = 0;
    const engine = createSyncEngine({
      outbox,
      send: async () => {
        calls += 1;
      },
      log: silentLog,
    });

    const run = await engine.syncAll(ONLINE);

    expect(calls).toBe(0);
    expect(run.attempted).toBe(0);
    expect(outbox.get(a.id)?.state).toBe('unknown');
    expect(outbox.get(b.id)?.state).toBe('conflict');
  });

  it('syncOne từ chối bản ghi ở trạng thái cần người dùng xử lý', async () => {
    const { outbox } = freshOutbox();
    const record = outbox.enqueue({ kind: 'A', payload: 1 });
    outbox.transition(record.id, 'conflict');

    const engine = createSyncEngine({
      outbox,
      send: async () => {
        throw new Error('không được gọi');
      },
      log: silentLog,
    });

    const result = await engine.syncOne(record.id);
    expect(result.skipped).toBe(true);
    expect(result.state).toBe('conflict');
  });

  it('chống gửi trùng: hai lời gọi song song chỉ có một request bay', async () => {
    const { outbox } = freshOutbox();
    const record = outbox.enqueue({ kind: 'A', payload: 1 });

    let inFlight = 0;
    let maxConcurrent = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });

    const engine = createSyncEngine({
      outbox,
      send: async () => {
        inFlight += 1;
        maxConcurrent = Math.max(maxConcurrent, inFlight);
        await gate;
        inFlight -= 1;
      },
      log: silentLog,
    });

    const first = engine.syncOne(record.id);
    const second = await engine.syncOne(record.id);

    expect(second.skipped).toBe(true);
    expect(engine.inFlightIds()).toEqual([record.id]);

    release?.();
    await first;

    expect(maxConcurrent).toBe(1);
    expect(outbox.get(record.id)?.attemptCount).toBe(1);
  });

  it('ghi `syncing` xuống đĩa TRƯỚC khi gửi, để phát hiện app chết giữa chừng', async () => {
    const { outbox } = freshOutbox();
    const record = outbox.enqueue({ kind: 'A', payload: 1 });

    let stateWhileSending: string | undefined;
    const engine = createSyncEngine({
      outbox,
      send: async () => {
        stateWhileSending = outbox.get(record.id)?.state;
      },
      log: silentLog,
    });

    await engine.syncOne(record.id);
    expect(stateWhileSending).toBe('syncing');
  });

  it('xung đột không bao giờ tự ghi đè — dữ liệu local giữ nguyên', async () => {
    const { outbox } = freshOutbox();
    const record = outbox.enqueue({ kind: 'A', payload: { qty: 42 } });

    const engine = createSyncEngine({
      outbox,
      send: async () => {
        throw new AppError({ kind: 'http', status: 409, message: 'đã thay đổi' });
      },
      log: silentLog,
    });

    await engine.syncOne(record.id);

    const after = outbox.get(record.id);
    expect(after?.state).toBe('conflict');
    expect(after?.payload).toEqual({ qty: 42 });
  });

  it('lỗi mạng giữ bản ghi ở pending để gửi lại được', async () => {
    const { outbox } = freshOutbox();
    const record = outbox.enqueue({ kind: 'A', payload: 1 });

    let shouldFail = true;
    const engine = createSyncEngine({
      outbox,
      send: async () => {
        if (shouldFail) {
          throw new AppError({ kind: 'network', message: 'mất mạng' });
        }
      },
      log: silentLog,
    });

    await engine.syncOne(record.id);
    expect(outbox.get(record.id)?.state).toBe('pending');

    shouldFail = false;
    await engine.syncOne(record.id);
    expect(outbox.get(record.id)?.state).toBe('synced');
  });

  it('gửi theo thứ tự tạo bản ghi', async () => {
    const storage = createStorage(createMemoryBackend());
    let clock = new Date('2026-01-01T00:00:00.000Z');
    const outbox = createOutbox({ storage, log: silentLog, now: () => clock });

    outbox.enqueue({ kind: 'first', payload: 1 });
    clock = new Date('2026-01-01T00:00:01.000Z');
    outbox.enqueue({ kind: 'second', payload: 2 });
    clock = new Date('2026-01-01T00:00:02.000Z');
    outbox.enqueue({ kind: 'third', payload: 3 });

    const order: string[] = [];
    const engine = createSyncEngine({
      outbox,
      send: async record => {
        order.push(record.kind);
      },
      log: silentLog,
    });

    await engine.syncAll(ONLINE);
    expect(order).toEqual(['first', 'second', 'third']);
  });
});

describe('Idempotency-Key — sinh MỘT lần, không bao giờ đổi (chốt 2026-09-05)', () => {
  it('mỗi bản ghi mới có một khoá riêng', () => {
    const { outbox } = freshOutbox();
    const a = outbox.enqueue({ kind: 'RECEIPT', payload: {} });
    const b = outbox.enqueue({ kind: 'RECEIPT', payload: {} });
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });

  it('khoá KHÔNG đổi qua các lần chuyển trạng thái — đây là điểm mấu chốt', () => {
    // Sinh khoá mới ở mỗi lần gửi lại = máy chủ coi là request khác = HAI phiếu
    // nhập cho cùng một lô hàng. Đúng thứ idempotency sinh ra để chặn.
    const { outbox } = freshOutbox();
    const created = outbox.enqueue({ kind: 'RECEIPT', payload: {} });
    const key = created.idempotencyKey;

    outbox.transition(created.id, 'syncing');
    expect(outbox.get(created.id)?.idempotencyKey).toBe(key);

    outbox.transition(created.id, 'unknown', { errorKind: 'timeout' });
    expect(outbox.get(created.id)?.idempotencyKey).toBe(key);

    outbox.transition(created.id, 'pending');
    expect(outbox.get(created.id)?.idempotencyKey).toBe(key);
  });

  it('khoá sống sót qua khởi động lại app', () => {
    const { outbox } = freshOutbox();
    const created = outbox.enqueue({ kind: 'RECEIPT', payload: {} });
    outbox.transition(created.id, 'syncing');

    // recoverAfterRestart chuyển syncing → unknown; khoá phải nguyên vẹn.
    outbox.recoverAfterRestart();
    expect(outbox.get(created.id)?.idempotencyKey).toBe(created.idempotencyKey);
    expect(outbox.get(created.id)?.state).toBe('unknown');
  });

  it('khoá dài trong khoảng spec WMS chấp nhận: 8–100 ký tự', () => {
    for (let i = 0; i < 200; i += 1) {
      const key = generateIdempotencyKey();
      expect(key.length).toBeGreaterThanOrEqual(8);
      expect(key.length).toBeLessThanOrEqual(100);
    }
  });

  it('sinh 2000 khoá liên tiếp không trùng nhau', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i += 1) {
      seen.add(generateIdempotencyKey());
    }
    expect(seen.size).toBe(2000);
  });

  it('app VẪN chưa gửi header Idempotency-Key — GATE_01 §11 #6 còn hiệu lực', () => {
    // Lưu khoá ≠ được phép gửi. Chốt chặn nằm ở api/client.ts.
    expect(() =>
      assertNoForbiddenHeaders({ 'Idempotency-Key': 'wmshn-abc' }),
    ).toThrow(AppError);
  });
});
