import { apiClient } from '../src/api/client';
import { createP14ShiftService } from '../src/shift/p14ShiftService';
import { publishShiftState, resetShiftState } from '../src/shift/shiftState';
import { setSession, clearSession } from '../src/auth/session';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import * as shiftReads from '../src/services/wms/workShift';
const id = '11111111-1111-4111-8111-111111111111';
const owner = { actorId: id, authSessionId: id, warehouseId: id };
const shift: shiftReads.WorkShift = {
  shift_id: id,
  actor_id: id,
  auth_session_id: id,
  warehouse_id: id,
  status: 'ACTIVE',
  version: 2,
  preview_ready: true,
  tracking_contract: 'p14-shift-v1',
  started_at: '2026-10-24T01:00:00Z',
  lifecycle: {
    contract: 'p01-p14-lifecycle-v1',
    mode: 'ENABLED',
    tracking_status: 'TRACKED',
    end_supported: true,
    end_unavailable_reason: null,
    local_state_verified: false,
    legacy_upgrade_allowed: false,
    owner_coverage: 'PARTIAL_EXPLICIT_OWNER_PROTOCOLS',
    end_readiness: 'REQUIRES_CLOSE_CHECK_AND_LOCAL_CLEAN',
  },
};
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  setSession({
    accessToken: 'offline-only',
    userId: id,
    authSessionId: id,
    activeWarehouseId: id,
  });
  resetShiftState();
  publishShiftState(shift, owner);
  jest.spyOn(shiftReads, 'fetchCurrentWorkShift').mockResolvedValue(shift);
});
afterEach(() => {
  jest.restoreAllMocks();
  clearSession();
  resetShiftState();
});
const check = () => ({
  shift_id: id,
  actor_id: id,
  auth_session_id: id,
  warehouse_id: id,
  can_end: true,
  can_end_scope: 'SERVER_CHECK_ONLY',
  blockers: [],
  expected_version: 2,
  check_token: 'LOCAL_TEST_ONLY',
  draft_scope: 'AUTH_SESSION_AT_CLOSE_NOT_SHIFT_OWNERSHIP',
  draft_count: 0,
  draft_owners_unchanged: true,
  client_confirmation_required: {
    local_state: 'CLEAN',
    pending_request_ids: [],
  },
});
const local = () => ({
  state: 'CLEAN' as const,
  coverageComplete: true,
  revision: 'UNIT_ONLY',
  busy: false,
  pendingRequestIds: [],
});
test.each(['W/"2"', '"3"', '', undefined])(
  'live transport rejects %j and never sends END',
  async etag => {
    const request = jest
      .spyOn(apiClient, 'request')
      .mockResolvedValue({
        status: 200,
        data: {
          success: true,
          data: check(),
          meta: { contract: 'p14-shift-v1' },
        },
        header: name => (name.toLowerCase() === 'etag' ? etag : undefined),
      });
    const service = createP14ShiftService({ readLocal: local });
    await expect(service.closeCheck()).rejects.toMatchObject({
      code: 'SHIFT_CLOSE_ETAG_INVALID',
    });
    expect(service.canEnd).toBe(false);
    expect(request.mock.calls).toHaveLength(1);
    expect(request.mock.calls[0][0].method).toBe('GET');
  },
);
test('matching strong ETag accepts check but does not dispatch END or convert local UNKNOWN to CLEAN', async () => {
  const request = jest
    .spyOn(apiClient, 'request')
    .mockResolvedValue({
      status: 200,
      data: {
        success: true,
        data: check(),
        meta: { contract: 'p14-shift-v1' },
      },
      header: name => (name.toLowerCase() === 'etag' ? '"2"' : undefined),
    });
  const service = createP14ShiftService({
    readLocal: () => ({
      ...local(),
      state: 'UNKNOWN',
      coverageComplete: false,
    }),
  });
  await expect(service.closeCheck()).resolves.toMatchObject({
    expected_version: 2,
    can_end: true,
  });
  expect(service.canEnd).toBe(false);
  expect(request.mock.calls).toHaveLength(1);
});
