import {
  WORK_SHIFT_PATHS,
  clearPendingWorkShiftStart,
  createWorkShiftIdempotencyKey,
  fetchCurrentWorkShift,
  getOrCreatePendingWorkShiftStart,
  isPreviewReadyShift,
  startWorkShift,
  type WorkShiftWriteClient,
} from '../src/services/wms/workShift';
import type { ReadClient } from '../src/services/wms/readOnlyClient';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';

const warehouseId = '11111111-1111-4111-8111-111111111111';
const idempotencyKey = '22222222-2222-4222-8222-222222222222';
const authSessionId = 'auth-session-1';

const activeShift = {
  actor_id: 'user-1',
  shift_id: 'shift-1',
  auth_session_id: authSessionId,
  warehouse_id: warehouseId,
  status: 'ACTIVE',
  started_at: '2026-10-05T08:00:00+07:00',
  preview_ready: true,
};

beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
});

afterEach(() => {
  setAppStorageForTesting(undefined);
});

describe('API ca kỹ thuật theo phiên đăng nhập', () => {
  it('GET current chấp nhận data:null và không tự tạo ca', async () => {
    const client = {
      get: jest.fn(async <T,>() => ({
        status: 200,
        data: { success: true, data: null } as T,
      })),
    } as unknown as ReadClient;

    await expect(fetchCurrentWorkShift({}, client)).resolves.toBeNull();
    expect(client.get).toHaveBeenCalledWith(WORK_SHIFT_PATHS.current, {});
  });

  it('POST start gửi đúng UUID kho và Idempotency-Key; nhận cả HTTP 201', async () => {
    const client = {
      request: jest.fn(async <T,>() => ({
        status: 201,
        data: { success: true, data: activeShift } as T,
      })),
    } as unknown as WorkShiftWriteClient;

    await expect(
      startWorkShift(
        { actorId: 'user-1', authSessionId, warehouseId },
        idempotencyKey,
        {},
        client,
      ),
    ).resolves.toEqual(activeShift);
    expect(client.request).toHaveBeenCalledWith({
      path: WORK_SHIFT_PATHS.start,
      method: 'POST',
      body: { warehouse_id: warehouseId },
      headers: { 'Idempotency-Key': idempotencyKey },
      signal: undefined,
      timeoutMs: undefined,
    });
  });

  it('chỉ xem ca đúng phiên, đúng kho, ACTIVE + preview_ready là hợp lệ', () => {
    expect(
      isPreviewReadyShift(activeShift, { actorId: 'user-1', authSessionId, warehouseId }),
    ).toBe(true);
    expect(
      isPreviewReadyShift(
        { ...activeShift, preview_ready: false },
        { actorId: 'user-1', authSessionId, warehouseId },
      ),
    ).toBe(false);
    expect(
      isPreviewReadyShift(
        { ...activeShift, auth_session_id: 'session-khac' },
        { actorId: 'user-1', authSessionId, warehouseId },
      ),
    ).toBe(false);
  });

  it('giữ nguyên key cho cùng phiên + cùng body qua lần đọc storage sau', () => {
    const first = getOrCreatePendingWorkShiftStart(authSessionId, warehouseId);
    const second = getOrCreatePendingWorkShiftStart(authSessionId, warehouseId);
    expect(second).toEqual(first);
    expect(second.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    clearPendingWorkShiftStart(authSessionId);
    const afterConfirmed = getOrCreatePendingWorkShiftStart(
      authSessionId,
      warehouseId,
    );
    expect(afterConfirmed.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it('sinh UUID v4 thay vì khoá outbox có tiền tố wmshn-', () => {
    const key = createWorkShiftIdempotencyKey(() => 0.5);
    expect(key).toBe('80808080-8080-4080-8080-808080808080');
  });
});
