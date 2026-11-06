jest.mock('../src/shift/p04Admission', () => ({
  verifyP04Admission: jest.fn(async () => ({
    shiftId: '00000000-0000-4000-8000-000000000009',
  })),
}));
import { apiClient } from '../src/api/client';
import { clearSession, setSession } from '../src/auth/session';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
  getAppStorage,
} from '../src/storage/storage';
import { createP09Service } from '../src/services/wms/p09Warranty';
import { createP19EntryController } from '../src/features/warranty/p19/p19Entry';
import { createP19LiveTransport } from '../src/features/warranty/p19/p19LiveTransport';
import { verifyP04Admission } from '../src/shift/p04Admission';
import { linkedServer, scope, id } from './fixtures/p19LinkedServer';
import {
  approvedWriteFor,
  allowsIdempotencyKey,
  allowsIfMatch,
} from '../src/api/writeGate';
import * as env from '../src/config/env';
import { assertP19DevConnected } from '../src/config/p19Release';
import type { P19Scope } from '../src/features/warranty/p19/p19Types';
import {
  p19OriginalRecovery,
  p19LocalPendingTasks,
} from '../src/features/warranty/p19/p19OriginalRecovery';
import { retainP19Owner } from '../src/features/warranty/p19/p19OwnerRegistry';
const testScope = scope as P19Scope;
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'mock-not-live',
    userId: scope.actorId,
    authSessionId: scope.authSessionId,
    activeWarehouseId: scope.warehouseId,
  });
  jest.clearAllMocks();
});
afterEach(() => {
  jest.restoreAllMocks();
  clearSession();
});
function setup() {
  const server = linkedServer(),
    calls: any[] = [],
    failure = { context: false };
  jest.spyOn(apiClient, 'request').mockImplementation(async (options: any) => {
    calls.push(options);
    if (failure.context && options.path === '/api/v1/mini-app/p03/context')
      throw Error('mock context read unavailable');
    if (options.path === '/api/v1/health')
      return {
        status: 200,
        data: { success: true, data: { build: { sha: 'a'.repeat(40) } } },
        header: (name: string) =>
          name.toLowerCase() === 'x-wms-deployment-tier'
            ? 'dev-test'
            : undefined,
      } as any;
    const result = await server.request({
      ...options,
      live: true,
      credentials: 'NATIVE_AUTH_CLIENT',
    });
    return {
      status: result.status,
      data: result.body,
      header: (name: string) =>
        name.toLowerCase() === 'etag' ? result.etag : undefined,
    } as any;
  });
  const service = createP09Service(() => ({
    session: {
      accessToken: 'mock-not-live',
      userId: scope.actorId,
      authSessionId: scope.authSessionId,
      activeWarehouseId: scope.warehouseId,
    },
    user: {
      id: scope.actorId,
      auth_session_id: scope.authSessionId,
      active_warehouse_id: scope.warehouseId,
      warehouse_context: { status: 'READY' },
      available_warehouses: [
        { warehouse_id: scope.warehouseId, status: 'ACTIVE' },
      ],
      permissions: scope.permissions,
      canonical_profile: { status: 'ACTIVE' },
    },
  }));
  const row = {
    warranty_case_id: id(4),
    status: 'CHECKING',
    version: 1,
    ownerScope: {
      source: 'P09_META',
      policy: 'PERSISTED_WARRANTY_OWNER_BEFORE_TOTAL',
      warehouseId: scope.warehouseId,
    },
  } as any;
  const controller = createP19EntryController(service, row);
  return { server, calls, service, controller, failure };
}
test('default native P09→P19 entry owns a real-client transport; SAVE→RECORD uses exact journal and distinct trace', async () => {
  const h = setup();
  expect(h.controller.offline).toBe(false);
  expect(h.controller.connected).toBe(true);
  expect(await h.controller.initialize()).toBe(true);
  expect((await h.controller.flow.scan('BOX1', 'MANUAL')).kind).toBe(
    'quantity',
  );
  expect(h.controller.flow.quantity(1).kind).toBe('accepted');
  expect(await h.controller.flow.prepareReview()).toBe(true);
  const saved = h.controller.checkpoint() as any;
  expect(saved.pending).toBeNull();
  expect(saved.dirty).toBe(false);
  expect((await h.controller.flow.post()).kind).toBe('posted');
  const writes = h.calls.filter(
    c => c.method === 'PUT' || c.path.endsWith('/record'),
  );
  expect(writes).toHaveLength(2);
  expect(h.server.balances.get(id(12))).toBe(19);
  for (const w of writes) {
    expect(w.headers['X-Work-Shift-ID']).toBe(id(9));
    expect(w.headers['X-Request-ID']).not.toBe(w.headers['Idempotency-Key']);
    expect(w.headers.Authorization).toBeUndefined();
  }
  expect(h.controller.snapshot().receipt?.quantity).toBe(1);
  expect(h.calls.some(c => /\/post$/.test(c.path))).toBe(false);
});
test('resolver ineligibility never appends BOX or starts a write', async () => {
  const h = setup();
  (h.server.options as any).resolvePatch = {
    eligible_for_issue: false,
    eligible_for_component_issue: false,
    sku_type: 'PRODUCT',
    eligibility_code: 'COMPONENT_SKU_REQUIRED',
  };
  await h.controller.initialize();
  expect((await h.controller.flow.scan('BOX1')).kind).toBe('invalid');
  expect(h.controller.snapshot().lines).toHaveLength(0);
  expect(h.server.writes).toBe(0);
  expect(h.controller.snapshot().canPost).toBe(false);
});
test('lost RECORD keeps original identity and only GET reconciles, never a second decrement', async () => {
  const h = setup();
  await h.controller.initialize();
  await h.controller.flow.scan('ITEM1');
  await h.controller.flow.prepareReview();
  (h.server.options as any).lose = 'RECORD';
  expect((await h.controller.flow.post()).kind).toBe('unknown');
  const frozen = (h.controller.checkpoint() as any).pending;
  expect(frozen.command).toBe('RECORD');
  expect(h.server.balances.get(id(11))).toBe(19);
  expect((await h.controller.flow.reconcile()).kind).toBe('posted');
  expect(h.calls.filter(c => c.path.endsWith('/record'))).toHaveLength(1);
  expect(h.server.balances.get(id(11))).toBe(19);
  expect(
    h.calls
      .find(c => c.path.includes('/requests/'))
      ?.path.endsWith('/' + frozen.key),
  ).toBe(true);
});
test('reentry revalidates context/case without replacing accepted local batch', async () => {
  const h = setup();
  await h.controller.initialize();
  await h.controller.flow.scan('ITEM1');
  const old = h.controller.snapshot().lines;
  h.controller.leave();
  h.server.options.caseStatus = 'RETURNED';
  await h.controller.initialize();
  expect(h.controller.snapshot().lines).toEqual(old);
  expect(h.controller.snapshot().canPost).toBe(false);
  expect(h.server.writes).toBe(0);
});

test('failed reentry read blocks writing without dropping the saved batch; verified retry restores it', async () => {
  const h = setup();
  await h.controller.initialize();
  await h.controller.flow.scan('ITEM1');
  expect(await h.controller.flow.prepareReview()).toBe(true);
  expect(h.controller.snapshot().canPost).toBe(true);
  const before = h.controller.checkpoint() as any;
  h.controller.leave();
  h.failure.context = true;
  expect(await h.controller.initialize()).toBe(false);
  expect(h.controller.snapshot().lines).toHaveLength(1);
  expect(h.controller.snapshot().canPost).toBe(false);
  expect((await h.controller.flow.post()).kind).toBe('invalid');
  expect(h.calls.filter(c => c.path.endsWith('/record'))).toHaveLength(0);
  const after = h.controller.checkpoint() as any;
  expect(after.savedSnapshot).toEqual(before.savedSnapshot);
  expect(after.draftId).toBe(before.draftId);
  expect(after.pending).toBeNull();
  h.failure.context = false;
  expect(await h.controller.initialize()).toBe(true);
  expect(h.controller.snapshot().canPost).toBe(true);
  expect(h.controller.snapshot().lines).toHaveLength(1);
});
test('only exact linked resolver/record paths are approved, production remains closed', () => {
  expect(
    approvedWriteFor(
      'POST',
      '/api/v1/mini-app/warranty-component-issues/record',
    ),
  ).toBe('componentIssue.linkedRecord');
  expect(
    allowsIdempotencyKey(
      'POST',
      '/api/v1/mini-app/warranty-component-issues/record',
    ),
  ).toBe(true);
  expect(
    allowsIfMatch('POST', '/api/v1/mini-app/warranty-component-issues/record'),
  ).toBe(false);
  expect(
    approvedWriteFor(
      'POST',
      '/api/v1/mini-app/warranty-component-issues/x/post',
    ),
  ).toBeUndefined();
  const actual = env.getCurrentEnvironment();
  jest.spyOn(env, 'getCurrentEnvironment').mockReturnValue({
    ...actual,
    name: 'customer-production',
    expectedTier: 'customer-production',
  });
  expect(() => assertP19DevConnected()).toThrow();
});
test('transport cannot dispatch a write with no persisted exact pending owner', async () => {
  const request = jest.fn().mockResolvedValue({
    status: 200,
    data: { success: true, data: { build: { sha: 'a'.repeat(40) } } },
    header: () => 'dev-test',
  });
  const send = createP19LiveTransport({
    getScope: () => testScope,
    caseId: id(4),
    getCheckpoint: () => ({ draftId: id(5) }),
    client: { request },
    storage: getAppStorage(),
    admission: verifyP04Admission,
  });
  await expect(
    send({
      live: true,
      credentials: 'NATIVE_AUTH_CLIENT',
      method: 'PUT',
      path: '/api/v1/mini-app/drafts/' + id(5),
      body: {},
      headers: {},
    }),
  ).rejects.toMatchObject({ code: 'P19_PENDING_NOT_PERSISTED' });
  expect(request).toHaveBeenCalledTimes(1);
});

function recoveryTask(checkpoint: any) {
  return {
    id: checkpoint.draftId,
    scanSessionId: checkpoint.scanSessionId,
    caseId: id(4),
  } as any;
}
test.each([false, true])(
  'P21 GET recovery verifies original lost RECORD and exact result; retained owner=%s',
  async retain => {
    const h = setup();
    await h.controller.initialize();
    await h.controller.flow.scan('ITEM1');
    await h.controller.flow.prepareReview();
    (h.server.options as any).lose = 'RECORD';
    await h.controller.flow.post();
    h.controller.leave();
    if (retain) retainP19Owner(h.service, id(4), h.controller);
    const before = h.controller.checkpoint() as any;
    const original = p19OriginalRecovery(h.service, recoveryTask(before))!;
    expect(original.key).toBe(before.pending.key);
    const callsBefore = h.calls.length;
    const result = await original.check();
    expect(result.outcome).toBe('SUCCEEDED');
    expect(result.businessId).toBe([...h.server.results.keys()][0]);
    expect(
      h.calls.slice(callsBefore).every(call => call.method === 'GET'),
    ).toBe(true);
    expect(h.calls.filter(call => call.path.endsWith('/record'))).toHaveLength(
      1,
    );
    expect(h.server.balances.get(id(11))).toBe(19);
    if (retain)
      expect(h.controller.snapshot().receipt?.id).toBe(result.businessId);
  },
);
test('P21 never derives recovery identity from a list row or accepts a different scan/checkpoint', async () => {
  const h = setup();
  await h.controller.initialize();
  const checkpoint = h.controller.checkpoint() as any;
  expect(
    p19OriginalRecovery(h.service, recoveryTask(checkpoint)),
  ).toBeUndefined();
  await h.controller.flow.scan('ITEM1');
  await h.controller.flow.prepareReview();
  (h.server.options as any).lose = 'RECORD';
  await h.controller.flow.post();
  const pending = h.controller.checkpoint() as any;
  expect(
    p19OriginalRecovery(h.service, {
      ...recoveryTask(pending),
      scanSessionId: id(90),
    }),
  ).toBeUndefined();
  const original = p19OriginalRecovery(h.service, recoveryTask(pending))!;
  const key =
    'p19-linked-private/v1/' +
    [scope.actorId, scope.authSessionId, scope.warehouseId, id(4)].join('/');
  getAppStorage().setObject(key, {
    ...pending,
    pending: { ...pending.pending, key: id(91) },
  });
  const count = h.calls.length;
  await expect(original.check()).rejects.toThrow(
    'P21_ORIGINAL_REQUEST_CHANGED',
  );
  expect(h.calls).toHaveLength(count);
});
test('P21 finds a local UNKNOWN request without assuming a server task or stock result', async () => {
  const h = setup();
  await h.controller.initialize();
  await h.controller.flow.scan('ITEM1');
  (h.server.options as any).lose = 'SAVE';
  await h.controller.flow.prepareReview();
  const checkpoint = h.controller.checkpoint() as any;
  const tasks = p19LocalPendingTasks(h.service, id(4));
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toMatchObject({
    id: checkpoint.draftId,
    scanSessionId: checkpoint.scanSessionId,
    status: 'UNKNOWN',
    localOnly: true,
    canOpenBusiness: false,
    businessId: null,
    lastKey: checkpoint.pending.key,
    quantity: null,
  });
  expect(p19LocalPendingTasks(h.service, id(98))).toHaveLength(0);
});
