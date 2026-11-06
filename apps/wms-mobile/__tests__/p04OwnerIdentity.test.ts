import * as shifts from '../src/services/wms/workShift';
import { verifyP04Admission } from '../src/shift/p04Admission';
import { publishShiftState, resetShiftState } from '../src/shift/shiftState';
import { setSession, clearSession } from '../src/auth/session';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { createP04Flow, type P04Run } from '../src/features/inbound/p04Flow';
import {
  createP04ReviewService,
  P04_REVIEW_SESSION,
} from '../src/web/p04ReviewService';
import { AppError } from '../src/errors/AppError';
import type { P03Scope } from '../src/services/wms/p03Drafts';
import { initialInboundDraft } from '../src/features/inbound/inboundDraft';

const id = (n: number) =>
  '12345678-1234-4234-8234-' + String(n).padStart(12, '0');
const scope: P03Scope = {
  actorId: id(1),
  authSessionId: id(2),
  warehouseId: id(3),
};
const owner = { ...scope };
const active = (): shifts.WorkShift => ({
  shift_id: id(4),
  actor_id: id(1),
  auth_session_id: id(2),
  warehouse_id: id(3),
  status: 'ACTIVE',
  started_at: '2026-10-16T10:00:00Z',
  preview_ready: true,
  version: 1,
  tracking_contract: 'p14-shift-v1',
  lifecycle: {
    contract: 'p01-p14-lifecycle-v1',
    mode: 'ENABLED',
    tracking_status: 'TRACKED',
    end_supported: true,
    end_unavailable_reason: null,
    end_readiness: 'REQUIRES_CLOSE_CHECK_AND_LOCAL_CLEAN',
    owner_coverage: 'PARTIAL_EXPLICIT_OWNER_PROTOCOLS',
    local_state_verified: false,
    legacy_upgrade_allowed: false,
  },
});
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline',
    userId: scope.actorId,
    authSessionId: scope.authSessionId,
    activeWarehouseId: scope.warehouseId,
  });
  resetShiftState();
});
afterEach(() => {
  jest.restoreAllMocks();
  clearSession();
});
test('P04 admission reads current and accepts only tracked same-owner scope, never START/END', async () => {
  const current = jest
    .spyOn(shifts, 'fetchCurrentWorkShift')
    .mockImplementation(async () => {
      publishShiftState(active(), owner);
      return active();
    });
  await expect(verifyP04Admission(scope, 'SAVE', 0)).resolves.toEqual({
    shiftId: id(4),
  });
  expect(current).toHaveBeenCalledTimes(1);
});
test.each(['missing', 'legacy', 'ended', 'disabled', 'wrong-warehouse'])(
  '%s current blocks admission',
  async mode => {
    jest.spyOn(shifts, 'fetchCurrentWorkShift').mockImplementation(async () => {
      const s = active();
      if (mode === 'missing') {
        publishShiftState(null, owner);
        return null;
      }
      if (mode === 'legacy') {
        Object.assign(s, {
          tracking_contract: null,
          lifecycle: { ...s.lifecycle!, tracking_status: 'LEGACY_UNTRACKED' },
        });
      }
      if (mode === 'ended')
        Object.assign(s, { status: 'ENDED', ended_at: '2026-10-16T11:00:00Z' });
      if (mode === 'disabled')
        Object.assign(s, { lifecycle: { ...s.lifecycle!, mode: 'DISABLED' } });
      if (mode === 'wrong-warehouse')
        Object.assign(s, { warehouse_id: id(99) });
      publishShiftState(s, owner);
      return s;
    });
    await expect(verifyP04Admission(scope, 'SAVE', 0)).rejects.toBeDefined();
  },
);
test('original shift mismatch cannot rebind an old intent to current shift', async () => {
  jest.spyOn(shifts, 'fetchCurrentWorkShift').mockImplementation(async () => {
    publishShiftState(active(), owner);
    return active();
  });
  await expect(
    verifyP04Admission(scope, 'SAVE', 1, id(55)),
  ).rejects.toMatchObject({ code: 'P04_ORIGINAL_SHIFT_CHANGED' });
});
test('failed admission prevents auto-SAVE, preserves journal and never creates pending write identity', async () => {
  const service = createP04ReviewService(),
    save = jest.spyOn(service, 'save'),
    storage = createStorage(createMemoryBackend());
  const flow = createP04Flow({
    service,
    storage,
    getSession: () => P04_REVIEW_SESSION,
    admission: async () => {
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'P04_SHIFT_ADMISSION_REQUIRED',
        message: 'confirm P01',
      });
    },
  });
  await flow.begin();
  expect(save).not.toHaveBeenCalled();
  expect(flow.snapshot().messageCode).toBe('P04_SHIFT_ADMISSION_REQUIRED');
  expect(flow.snapshot().run?.pending).toBeUndefined();
  expect(storage.keys().some(k => k.startsWith('p04.runs.v1/'))).toBe(true);
  flow.dispose();
});
test('legacy UNKNOWN pending keeps exact key/body and GET reconcile works, retry cannot add binding', async () => {
  const session = P04_REVIEW_SESSION,
    s = {
      actorId: session.userId!,
      authSessionId: session.authSessionId!,
      warehouseId: session.activeWarehouseId!,
    };
  const storage = createStorage(createMemoryBackend()),
    service = createP04ReviewService();
  const r: P04Run = {
    id: id(10),
    identity: { documentId: id(10), scanSessionId: id(11) },
    scope: s,
    ui: { ...initialInboundDraft, warehouseId: s.warehouseId },
    items: [],
    rows: [],
    closed: false,
    updatedAt: 1,
    pending: {
      command: 'SAVE',
      key: id(12),
      version: 0,
      body: {
        warehouse_id: s.warehouseId,
        scan_session_id: id(11),
        inbound_type: 'receipt',
        supplier_id: null,
        name: 'old',
        note: 'original',
        items: [],
      },
      outcome: 'UNKNOWN',
      retryAllowed: true,
    },
  };
  storage.setObject('p04.runs.v1/' + r.id, r);
  const save = jest.spyOn(service, 'save'),
    reconcile = jest.spyOn(service, 'reconcile').mockResolvedValue({
      outcome: 'UNKNOWN',
      retry: 'SAME_REQUEST_ONLY',
      new_document_allowed: false,
    });
  const flow = createP04Flow({ service, storage, getSession: () => session });
  await flow.begin();
  await flow.check();
  expect(reconcile).toHaveBeenCalledWith(s, r.identity, id(12), 'SAVE');
  await flow.retry();
  expect(save).not.toHaveBeenCalled();
  expect(flow.snapshot().run?.pending).toEqual(r.pending);
  flow.dispose();
});
