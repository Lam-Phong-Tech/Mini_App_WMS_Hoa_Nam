/** Offline-only regression seams for candidate70974487; all identities fake. */
declare const __dirname: string;
const { readFileSync } = require('fs');
const { resolve } = require('path');
import React from 'react';
import Renderer from 'react-test-renderer';
import {
  useHomeSummary,
  type UseHomeSummaryDeps,
} from '../src/features/home/useHomeSummary';
import {
  clearSession,
  getSession,
  setSession,
  captureSessionScope,
} from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  getAppStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import {
  getShiftState,
  publishShiftState,
  resetShiftState,
} from '../src/shift/shiftState';
import { createShiftStartOwner } from '../src/shift/startIntent';
import { bindShiftOwnerHeaders } from '../src/shift/ownerHeaders';
import {
  clearPendingWorkShiftStart,
  getOrCreatePendingWorkShiftStart,
  markPendingWorkShiftStart,
  parseWorkShift,
  readPendingWorkShiftStart,
  startWorkShift,
  type WorkShiftWriteClient,
  type WorkShift,
} from '../src/services/wms/workShift';

const wid = '11111111-1111-4111-8111-111111111111';
const owner = {
  actorId: 'offline-actor',
  authSessionId: 'offline-family',
  warehouseId: wid,
};
const shift: WorkShift = {
  shift_id: '22222222-2222-4222-8222-222222222222',
  actor_id: owner.actorId,
  auth_session_id: owner.authSessionId,
  warehouse_id: wid,
  status: 'ACTIVE',
  started_at: '2026-10-14T00:00:00+07:00',
  ended_at: null,
  version: 1,
  preview_ready: true,
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
};
const rotate = () =>
  setSession({ ...getSession()!, accessToken: 'offline-rotated' });
const nextFamily = () =>
  setSession({ ...getSession()!, authSessionId: 'offline-next-family' });
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline-only',
    userId: owner.actorId,
    authSessionId: owner.authSessionId,
    activeWarehouseId: wid,
  });
  resetShiftState();
});
afterEach(() => {
  clearSession();
  resetShiftState();
});

test('LC01 refresh keeps family/generation/identity but removes ACTIVE proof until own current re-read', async () => {
  publishShiftState(shift, owner);
  const before = getShiftState(),
    generation = captureSessionScope().generation;
  rotate();
  expect(captureSessionScope().generation).toBe(generation);
  expect(getShiftState()).toMatchObject({
    phase: 'UNVERIFIED',
    owner,
    generation,
    lastVerifiedShift: shift,
  });
  expect(getShiftState().shift).toBeUndefined();
  expect(getShiftState()).not.toBe(before);
  expect(() =>
    bindShiftOwnerHeaders({
      method: 'POST',
      path: '/api/v1/mini-app/inbound/record',
      headers: { 'Idempotency-Key': wid },
    }),
  ).toThrow();
  await createShiftStartOwner({ current: async () => shift }).restore(owner);
  expect(getShiftState()).toMatchObject({ phase: 'ACTIVE', shift });
});
test('LC01 current issued before refresh cannot publish even with the same shift ID', async () => {
  let finish!: (value: WorkShift) => void;
  const c = createShiftStartOwner({
    current: () =>
      new Promise(r => {
        finish = r;
      }),
  });
  const pending = c.restore(owner).catch(e => e);
  rotate();
  finish(shift);
  expect(await pending).toMatchObject({ code: 'SHIFT_RESPONSE_STALE' });
  expect(getShiftState().shift).toBeUndefined();
});
test('LC01 refresh issuance revalidates even if access token bytes are unchanged', () => {
  publishShiftState(shift, owner);
  const generation = captureSessionScope().generation;
  setSession({ ...getSession()!, issuedAtMs: 1234 });
  expect(captureSessionScope().generation).toBe(generation);
  expect(getShiftState().phase).toBe('UNVERIFIED');
  expect(getShiftState().shift).toBeUndefined();
});
test('LC01 last ENDED version survives refresh and cannot be revived by a re-read', async () => {
  publishShiftState(
    {
      ...shift,
      status: 'ENDED',
      version: 2,
      preview_ready: false,
      ended_at: shift.started_at,
      lifecycle: { ...shift.lifecycle!, end_supported: false },
    },
    owner,
  );
  rotate();
  await expect(
    createShiftStartOwner({ current: async () => shift }).restore(owner),
  ).rejects.toMatchObject({ code: 'SHIFT_RESPONSE_STALE' });
  expect(getShiftState().phase).toBe('UNVERIFIED');
});
test('LC01 login new family drops old verified/historical snapshot; it never inherits ACTIVE', () => {
  publishShiftState(shift, owner);
  rotate();
  nextFamily();
  expect(getShiftState().shift).toBeUndefined();
  expect(getShiftState()).not.toHaveProperty('lastVerifiedShift');
  expect(getShiftState().phase).toBe('UNVERIFIED');
});
test.each(['PAUSED', 'unknown', ''])(
  'LC01 legacy status %s must not parse or publish ACTIVE',
  status => {
    const legacy = { ...shift };
    delete legacy.lifecycle;
    delete legacy.tracking_contract;
    expect(() => parseWorkShift({ ...legacy, status }, 'offline')).toThrow();
    expect(() => publishShiftState({ ...legacy, status }, owner)).toThrow();
    expect(getShiftState().phase).toBe('UNVERIFIED');
  },
);
test('LC01 nested lifecycle cannot mutate mode/capability outside publication', () => {
  const mutable = { ...shift, lifecycle: { ...shift.lifecycle! } };
  publishShiftState(mutable, owner);
  mutable.lifecycle.mode = 'DISABLED';
  mutable.lifecycle.end_supported = false;
  expect(getShiftState().shift!.lifecycle).toMatchObject({
    mode: 'ENABLED',
    end_supported: true,
  });
  expect(Object.isFrozen(getShiftState().shift!.lifecycle)).toBe(true);
});
test('LC01 current null after ENDED is NO_SHIFT, historical fence is not current proof', async () => {
  const ended = {
    ...shift,
    status: 'ENDED',
    version: 2,
    preview_ready: false,
    ended_at: shift.started_at,
    lifecycle: { ...shift.lifecycle!, end_supported: false },
  };
  publishShiftState(ended, owner);
  rotate();
  await createShiftStartOwner({ current: async () => null }).restore(owner);
  expect(getShiftState()).toMatchObject({
    phase: 'NO_SHIFT',
    lastVerifiedShift: ended,
  });
  expect(getShiftState().shift).toBeUndefined();
  expect(() => publishShiftState(shift, owner)).toThrow();
});
test('P01_START_INTENT old UNKNOWN is privately retained, never inherited by new family', () => {
  const first = getOrCreatePendingWorkShiftStart(
    owner.authSessionId,
    wid,
    owner.actorId,
  );
  markPendingWorkShiftStart('UNKNOWN');
  const original = readPendingWorkShiftStart()!;
  clearSession();
  expect(readPendingWorkShiftStart()).toBeUndefined();
  setSession({
    accessToken: 'offline-new',
    userId: owner.actorId,
    authSessionId: 'offline-next-family',
    activeWarehouseId: wid,
  });
  expect(readPendingWorkShiftStart()).toBeUndefined();
  const next = getOrCreatePendingWorkShiftStart(
    'offline-next-family',
    wid,
    owner.actorId,
  );
  expect(next.idempotencyKey).not.toBe(first.idempotencyKey);
  const records = getAppStorage()
    .keys()
    .map(k => getAppStorage().getObject(k));
  expect(records).toContainEqual(original);
  expect(readPendingWorkShiftStart()).toEqual(next);
});
test('LC05 foreign-family pending cannot bypass DRAINING new-intent gate', () => {
  getOrCreatePendingWorkShiftStart(owner.authSessionId, wid, owner.actorId);
  nextFamily();
  const newOwner = { ...owner, authSessionId: 'offline-next-family' };
  publishShiftState(
    {
      ...shift,
      auth_session_id: newOwner.authSessionId,
      lifecycle: { ...shift.lifecycle!, mode: 'DRAINING' },
    },
    newOwner,
  );
  expect(() =>
    getOrCreatePendingWorkShiftStart(
      newOwner.authSessionId,
      wid,
      owner.actorId,
    ),
  ).toThrow();
  expect(getAppStorage().getObject('work-shift.start.pending')).toMatchObject({
    authSessionId: owner.authSessionId,
  });
});
test('RC01 cleanup does not delete corrupt or unscoped UNKNOWN journal', () => {
  getAppStorage().setObject('work-shift.start.pending', {
    outcome: 'UNKNOWN',
    damaged: true,
  });
  clearPendingWorkShiftStart(owner.authSessionId);
  clearPendingWorkShiftStart();
  expect(getAppStorage().getObject('work-shift.start.pending')).toEqual({
    outcome: 'UNKNOWN',
    damaged: true,
  });
});
test('RC01 AppShell login/logout/recovery never blanket-clears pending START', () => {
  const shell = readFileSync(
    resolve(__dirname, '../src/app/AppShell.tsx'),
    'utf8',
  );
  expect(shell).not.toContain('clearPendingWorkShiftStart(');
});
test('P01_START_INTENT pre-refresh late START is UNKNOWN with original key, not ACTIVE', async () => {
  let finish!: (value: WorkShift) => void;
  const c = createShiftStartOwner({
    start: () =>
      new Promise(r => {
        finish = r;
      }),
  });
  const pending = c.start(owner).catch(e => e),
    original = readPendingWorkShiftStart()!;
  rotate();
  finish(shift);
  expect(await pending).toMatchObject({ code: 'SHIFT_RESPONSE_STALE' });
  expect(getShiftState().shift).toBeUndefined();
  expect(readPendingWorkShiftStart()).toMatchObject({
    idempotencyKey: original.idempotencyKey,
    body: original.body,
    outcome: 'UNKNOWN',
  });
});
test('LC01 Home consumes refresh epoch and re-reads current without a new confirmation prop', async () => {
  publishShiftState(shift, owner);
  let finish!: (value: WorkShift) => void;
  const current = jest.fn(
    () =>
      new Promise<WorkShift>(r => {
        finish = r;
      }),
  );
  const c = createShiftStartOwner({ current });
  const deps: UseHomeSummaryDeps = {
    readSession: getSession,
    readSharedShift: getShiftState,
    capabilities: {
      stockSummary: false,
      warehouseListFilter: false,
      stableCreatedAtSort: false,
      warrantyWarehouseScope: false,
      recentAggregate: false,
    },
    fetchUser: async () => ({
      id: owner.actorId,
      auth_session_id: owner.authSessionId,
      active_warehouse_id: wid,
      warehouse_scope_ids: [wid],
      permissions: [],
      warehouse_context: { status: 'READY' },
    }),
    fetchShift: () => c.restore(owner),
    fetchUnread: async () => 0,
  };
  let view!: ReturnType<typeof useHomeSummary>;
  function Probe() {
    view = useHomeSummary(deps);
    return null;
  }
  let tree!: Renderer.ReactTestRenderer;
  try {
    await Renderer.act(async () => {
      tree = Renderer.create(React.createElement(Probe));
    });
    expect(view.shift).toEqual(shift);
    expect(current).not.toHaveBeenCalled();
    await Renderer.act(async () => {
      rotate();
    });
    expect(view.shift).toBeUndefined();
    expect(current).toHaveBeenCalledTimes(1);
    await Renderer.act(async () => {
      finish(shift);
    });
    expect(view.shift).toEqual(shift);
  } finally {
    await Renderer.act(async () => {
      tree?.unmount();
    });
  }
});
test('LC05 adapter503 retains exact pending START; no automatic retry or synthetic ACTIVE', async () => {
  const request = jest.fn(async () => ({
    status: 503,
    data: { success: false, code: 'SHIFT_START_PAUSED' },
  }));
  const client = { request } as unknown as WorkShiftWriteClient;
  const c = createShiftStartOwner({
    start: (input, key) => startWorkShift(input, key, {}, client),
  });
  await expect(c.start(owner)).rejects.toMatchObject({
    kind: 'http',
    status: 503,
  });
  const intent = readPendingWorkShiftStart()!;
  expect(intent.outcome).toBe('UNKNOWN');
  expect(getShiftState().shift).toBeUndefined();
  await expect(c.start(owner)).rejects.toMatchObject({
    code: 'SHIFT_START_PENDING',
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]).toEqual([
    {
      path: '/api/v1/mini-app/work-shifts/start',
      method: 'POST',
      headers: { 'Idempotency-Key': intent.idempotencyKey },
      body: intent.body,
      signal: undefined,
      timeoutMs: undefined,
    },
  ]);
});
