// Source/fence tests only. Never sends HTTP or simulates live stock evidence.
import {
  createP05OwnerChecks,
  reconcileP05OwnerCheck,
  restoreP05Checks,
  p05ChecksPending,
  type P05ResolverBinding,
} from '../src/features/outbound/linked/p05-owner-checks';
import { createP05Service } from '../src/services/wms/p05Outbound';
import { P05ApiError } from '../src/features/outbound/linked/p05-contract';
import {
  bindShiftOwnerHeaders,
  resetShiftHeaderBindingsForTesting,
} from '../src/shift/ownerHeaders';
import { publishShiftState, resetShiftState } from '../src/shift/shiftState';
import { setSession, clearSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import type { WorkShift } from '../src/services/wms/workShift';
const id = (n: number) =>
  `01234567-1234-4234-8234-${String(n).padStart(12, '0')}`;
const scope = { actorId: id(1), authSessionId: id(2), warehouseId: id(3) };
function fixture() {
  let runtime = 'same-caller',
    sequence = 100,
    stored = '',
    failStorage = false;
  const context = { scope, draftId: id(5), scanSessionId: id(6), version: 1 };
  const state: { ownerChecks?: P05ResolverBinding[] } = {};
  const admission = jest.fn(async () => ({ shiftId: id(4) }));
  const uuid = jest.fn(() => id(++sequence));
  const persist = () => {
    if (failStorage) return false;
    stored = JSON.stringify(state);
    return true;
  };
  const resolve = createP05OwnerChecks({
    state: () => state,
    capture: () => ({ ...context, runtime }),
    persist,
    admit: admission,
    uuid,
  });
  return {
    state,
    context,
    resolve,
    uuid,
    admission,
    stored: () => JSON.parse(stored || '{}'),
    fail: () => {
      failStorage = true;
    },
    move: () => {
      runtime = 'new-caller';
    },
  };
}
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  resetShiftState();
  resetShiftHeaderBindingsForTesting();
});
afterEach(() => {
  clearSession();
  setAppStorageForTesting(undefined);
  jest.restoreAllMocks();
});

test('identity is durably saved BEFORE real P14 fence binding; no Idempotency/If-Match added to resolver', async () => {
  setSession({
    accessToken: 'TEST-NOT-SENT',
    userId: scope.actorId,
    authSessionId: scope.authSessionId,
    activeWarehouseId: scope.warehouseId,
  });
  const shift: WorkShift = {
    shift_id: id(4),
    actor_id: scope.actorId,
    auth_session_id: scope.authSessionId,
    warehouse_id: scope.warehouseId,
    status: 'ACTIVE',
    started_at: '2026-10-20T00:00:00Z',
    version: 1,
    tracking_contract: 'p14-shift-v1',
    preview_ready: true,
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
  publishShiftState(shift, scope);
  const t = fixture(),
    observed: any[] = [];
  const client = {
    request: jest.fn(async (options: any) => {
      const saved = t.stored().ownerChecks.at(-1);
      expect(saved).toMatchObject({
        outcome: 'IN_FLIGHT',
        body: options.body,
        requestId: options.headers['X-Request-ID'],
        shiftId: id(4),
      });
      const headers = bindShiftOwnerHeaders(options);
      observed.push({ body: options.body, headers });
      return {
        status: 200,
        data: {
          success: true,
          data: {
            warehouse_id: scope.warehouseId,
            eligible_for_outbound: true,
          },
        },
      };
    }),
  };
  const service = createP05Service(client as any, () => ({
    accessToken: 'TEST-NOT-SENT',
    userId: scope.actorId,
    authSessionId: scope.authSessionId,
    activeWarehouseId: scope.warehouseId,
  }));
  await t.resolve(service, 'HN1|SKU=A|ITEM=B|SER=B', 'SCAN');
  await t.resolve(service, 'HN1|SKU=A|ITEM=B|SER=B', 'REVALIDATE');
  expect(observed).toHaveLength(2);
  expect(observed[0].headers).toEqual({
    'X-Request-ID': id(101),
    'X-Work-Shift-ID': id(4),
  });
  expect(observed[1].headers['X-Request-ID']).toBe(id(102));
  expect(t.state.ownerChecks?.map(c => [c.purpose, c.outcome])).toEqual([
    ['SCAN', 'SUCCEEDED'],
    ['REVALIDATE', 'SUCCEEDED'],
  ]);
});
test('storage failure prevents any resolver call', async () => {
  const t = fixture(),
    adapter = { resolve: jest.fn() };
  t.fail();
  await expect(t.resolve(adapter, 'A', 'SCAN')).rejects.toMatchObject({
    code: 'JOURNAL_UNAVAILABLE',
  });
  expect(adapter.resolve).not.toHaveBeenCalled();
});
test('timeout retains exact identity/body and blocks new code or implicit retry without fake receipt', async () => {
  const t = fixture(),
    adapter = {
      resolve: jest
        .fn()
        .mockRejectedValue(
          new P05ApiError('TIMEOUT', 'test', { unknown: true }),
        ),
    };
  await expect(t.resolve(adapter, 'A', 'SCAN')).rejects.toBeDefined();
  const original = JSON.stringify(t.state.ownerChecks);
  expect(t.state.ownerChecks?.[0].outcome).toBe('UNKNOWN');
  await expect(t.resolve(adapter, 'B', 'SCAN')).rejects.toMatchObject({
    code: 'P05_CHECK_OUTCOME_UNKNOWN',
  });
  expect(adapter.resolve).toHaveBeenCalledTimes(1);
  expect(t.uuid).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(t.state.ownerChecks)).toBe(original);
  expect(JSON.stringify(t.state)).not.toContain('receipt');
});
test.each([true, false])(
  'UNKNOWN resolver recovery uses the exact original trace/body once; succeeds=%s',
  async succeeds => {
    const t = fixture(),
      adapter = {
        resolve: jest
          .fn()
          .mockRejectedValueOnce(
            new P05ApiError('TIMEOUT', 'lost', { unknown: true }),
          ),
      };
    await expect(t.resolve(adapter, 'A', 'SCAN')).rejects.toBeDefined();
    const original = JSON.stringify(t.state.ownerChecks?.[0]);
    adapter.resolve.mockImplementationOnce(async (_raw, binding) => {
      expect(binding.requestId).toBe(id(101));
      expect(binding.body).toEqual({
        warehouse_id: scope.warehouseId,
        raw_code: 'A',
      });
      if (!succeeds)
        throw new P05ApiError('TIMEOUT', 'still lost', { unknown: true });
      return { resolved: true };
    });
    const check = () =>
      reconcileP05OwnerCheck(
        {
          state: () => t.state,
          capture: () => ({ ...t.context, runtime: 'same-caller' }),
          persist: () => true,
        },
        adapter,
      );
    if (succeeds) {
      await expect(check()).resolves.toBe(true);
      expect(t.state.ownerChecks?.[0].outcome).toBe('SUCCEEDED');
    } else {
      await expect(check()).rejects.toBeDefined();
      expect(t.state.ownerChecks?.[0].outcome).toBe('UNKNOWN');
    }
    expect(adapter.resolve).toHaveBeenCalledTimes(2);
    expect(JSON.parse(original).requestId).toBe(
      t.state.ownerChecks?.[0].requestId,
    );
  },
);
test('a confirmed 422 is FAILED, not an UNKNOWN request or reusable successful receipt', async () => {
  const t = fixture(),
    adapter = {
      resolve: jest
        .fn()
        .mockRejectedValueOnce(
          new P05ApiError('PHYSICAL_CODE_NOT_FOUND', 'missing', {
            status: 422,
          }),
        )
        .mockResolvedValue({}),
    };
  await expect(t.resolve(adapter, 'bad', 'SCAN')).rejects.toBeDefined();
  await t.resolve(adapter, 'other', 'SCAN');
  expect(t.state.ownerChecks?.map(c => c.outcome)).toEqual([
    'FAILED',
    'SUCCEEDED',
  ]);
});
test('late response after caller changes cannot apply success; restore is UNKNOWN with the original trace', async () => {
  const t = fixture();
  let done!: (v: Record<string, unknown>) => void;
  const adapter = {
    resolve: jest.fn(
      () =>
        new Promise<Record<string, unknown>>(r => {
          done = r;
        }),
    ),
  };
  const pending = t.resolve(adapter, 'A', 'SCAN');
  await Promise.resolve();
  t.move();
  done({ eligible_for_outbound: true });
  await expect(pending).rejects.toMatchObject({ code: 'OWNER_CHANGED' });
  const restored = t.stored();
  restoreP05Checks(restored, t.context);
  expect(restored.ownerChecks[0]).toMatchObject({
    outcome: 'UNKNOWN',
    requestId: id(101),
    body: { warehouse_id: scope.warehouseId, raw_code: 'A' },
  });
  expect(p05ChecksPending(restored)).toBe(true);
});
test('closed/changed admission does not allocate a trace or dispatch', async () => {
  const t = fixture(),
    adapter = { resolve: jest.fn() };
  t.admission.mockRejectedValue(new Error('closing'));
  await expect(t.resolve(adapter, 'A', 'SCAN')).rejects.toBeDefined();
  expect(t.uuid).not.toHaveBeenCalled();
  expect(adapter.resolve).not.toHaveBeenCalled();
});
test('old frozen requests are untouched; foreign check scopes are not adopted', () => {
  const old: any = {
    pending: {
      key: id(90),
      body: { original: true },
      headers: { 'If-Match': '"4"' },
    },
    unknown: true,
  };
  const before = JSON.stringify(old);
  restoreP05Checks(old, fixture().context);
  expect(JSON.stringify(old)).toBe(before);
  const bad: any = {
    ownerChecks: [
      {
        contract: 'p05-resolver-owner-v1',
        requestId: id(80),
        scope: { ...scope, authSessionId: id(99) },
      },
    ],
  };
  expect(() => restoreP05Checks(bad, fixture().context)).toThrow();
});
