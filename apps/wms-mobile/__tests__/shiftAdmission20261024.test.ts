import { parseShiftAdmission } from '../src/shift/admission';
import {
  publishShiftState,
  resetShiftState,
  getShiftState,
  knownTrackedFamily,
} from '../src/shift/shiftState';
import {
  getOrCreatePendingWorkShiftStart,
  markPendingWorkShiftStart,
  readPendingWorkShiftStart,
} from '../src/services/wms/workShift';
import { setSession, clearSession } from '../src/auth/session';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import {
  id,
  actor,
  session,
  warehouse,
} from './fixtures/beReleasedReads20261024';
import {
  registerShiftLocalOwner,
  REQUIRED_SHIFT_OWNERS,
} from '../src/shift/localOwners';
import { apiClient } from '../src/api/client';
import { fetchCurrentWorkShift } from '../src/services/wms/workShift';
const disposers: (() => void)[] = [];
const owner = {
  actorId: actor,
  authSessionId: session,
  warehouseId: warehouse,
};
const admission = (mode = 'ENABLED', tracked = true) => ({
  contract: 'p01-p14-admission-v1',
  revision: 'p01-p14-admission-r1',
  actor_id: actor,
  auth_session_id: session,
  warehouse_id: warehouse,
  warehouse_context: { status: 'READY' },
  mode,
  tracked_family: tracked,
  current_state: 'NO_ACTIVE_SHIFT',
  current_state_source: 'OWNED_ACTIVE_SHIFT_QUERY',
  owner_fence_required: mode === 'ENABLED' || tracked,
  new_tracked_start_supported: mode === 'ENABLED',
  unavailable_reason:
    mode === 'ENABLED'
      ? null
      : mode === 'DRAINING'
      ? 'SHIFT_START_PAUSED'
      : 'P14_SHIFT_NOT_ENABLED',
  current_shift_id: null,
  current_tracking_contract: null,
  new_shift_tracking_contract: mode === 'ENABLED' ? 'p14-shift-v1' : null,
  legacy_upgrade_allowed: false,
  legacy_fallback_authorized: false,
  local_state_verified: false,
  owner_coverage: 'PARTIAL_EXPLICIT_OWNER_PROTOCOLS',
  pending_start_end_policy: 'RECONCILE_ORIGINAL_IDENTITY_BEFORE_NEW_START',
  admission_scope:
    'SERVER_CHECK_ONLY_REQUIRES_LOCAL_RECONCILIATION_AND_USER_INTENT',
  freshness: 'REOBSERVE_BEFORE_START_SERVER_REVALIDATES',
  observed_at: '2026-10-24T05:00:00.000000Z',
});
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  setSession({
    accessToken: 'local-unit',
    userId: actor,
    authSessionId: session,
    activeWarehouseId: warehouse,
  });
  resetShiftState();
  for (const name of REQUIRED_SHIFT_OWNERS)
    disposers.push(
      registerShiftLocalOwner(name, () => ({
        state: 'CLEAN',
        coverageComplete: true,
        revision: 'LOCAL_UNIT_ONLY',
        busy: false,
        pendingRequestIds: [],
      })),
    );
});
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
  jest.restoreAllMocks();
  clearSession();
  resetShiftState();
});
test('actual current GET consumes additive admission metadata, not a synthetic active shift', async () => {
  const get = jest
    .spyOn(apiClient, 'get')
    .mockResolvedValue({
      status: 200,
      data: {
        success: true,
        data: null,
        meta: { shift_admission: admission() },
      },
    } as never);
  expect(await fetchCurrentWorkShift()).toBeNull();
  expect(get).toHaveBeenCalledTimes(1);
  expect(getShiftState().admission?.new_tracked_start_supported).toBe(true);
  expect(getShiftState().shift).toBeUndefined();
});
test('admission true is not local CLEAN; unregistered or dirty owners cannot prepare a new key', () => {
  publishShiftState(
    null,
    owner,
    undefined,
    parseShiftAdmission(admission(), null, owner),
  );
  disposers.splice(0).forEach(dispose => dispose());
  expect(() =>
    getOrCreatePendingWorkShiftStart(session, warehouse, actor),
  ).toThrow();
  expect(readPendingWorkShiftStart()).toBeUndefined();
  for (const name of REQUIRED_SHIFT_OWNERS)
    disposers.push(
      registerShiftLocalOwner(name, () => ({
        state: 'DIRTY',
        coverageComplete: true,
        revision: 'LOCAL_UNIT_ONLY',
        busy: false,
        pendingRequestIds: [],
      })),
    );
  expect(() =>
    getOrCreatePendingWorkShiftStart(session, warehouse, actor),
  ).toThrow();
});
test.each(['ENABLED', 'DRAINING', 'DISABLED'])(
  'current:null %s retains tracked-family fence without creating a shift or local CLEAN',
  mode => {
    const parsed = parseShiftAdmission(admission(mode), null, owner);
    publishShiftState(null, owner, undefined, parsed);
    expect(getShiftState()).toMatchObject({
      phase: 'NO_SHIFT',
      admission: { mode, tracked_family: true },
    });
    expect(getShiftState().shift).toBeUndefined();
    expect(knownTrackedFamily()).toBe(true);
    if (mode === 'ENABLED')
      expect(
        getOrCreatePendingWorkShiftStart(session, warehouse, actor).body,
      ).toEqual({ warehouse_id: warehouse });
    else
      expect(() =>
        getOrCreatePendingWorkShiftStart(session, warehouse, actor),
      ).toThrow();
  },
);
test('missing advisory metadata never downgrades known tracked family to legacy START', () => {
  publishShiftState(
    null,
    owner,
    undefined,
    parseShiftAdmission(admission(), null, owner),
  );
  publishShiftState(null, owner);
  expect(() =>
    getOrCreatePendingWorkShiftStart(session, warehouse, actor),
  ).toThrow();
  expect(readPendingWorkShiftStart()).toBeUndefined();
});
test('disabled admission cannot replace or rotate an original START UNKNOWN', () => {
  publishShiftState(
    null,
    owner,
    undefined,
    parseShiftAdmission(admission(), null, owner),
  );
  const original = getOrCreatePendingWorkShiftStart(session, warehouse, actor);
  markPendingWorkShiftStart('UNKNOWN');
  publishShiftState(
    null,
    owner,
    undefined,
    parseShiftAdmission(admission('DISABLED'), null, owner),
  );
  expect(
    getOrCreatePendingWorkShiftStart(session, warehouse, actor),
  ).toMatchObject({
    idempotencyKey: original.idempotencyKey,
    outcome: 'UNKNOWN',
    body: original.body,
  });
});
test('server metadata cannot clear a locally known tracked-family marker', () => {
  publishShiftState(
    null,
    owner,
    undefined,
    parseShiftAdmission(admission(), null, owner),
  );
  expect(() =>
    publishShiftState(
      null,
      owner,
      undefined,
      parseShiftAdmission(admission('DISABLED', false), null, owner),
    ),
  ).toThrow();
  expect(knownTrackedFamily()).toBe(true);
});
test.each([
  { actor_id: id(90) },
  { auth_session_id: id(90) },
  { warehouse_id: id(90) },
  { current_shift_id: id(91) },
  { local_state_verified: true },
  { legacy_upgrade_allowed: true },
  { legacy_fallback_authorized: true },
  { owner_coverage: 'FULL' },
  { owner_fence_required: false },
  { new_tracked_start_supported: false },
  { observed_at: '2026-02-30T00:00:00Z' },
  { current_state_source: 'APP_CACHE' },
])(
  'invalid/mis-scoped advisory is unavailable, not a legacy permission %#',
  change => {
    expect(() =>
      parseShiftAdmission({ ...admission(), ...change }, null, owner),
    ).toThrow();
  },
);
