import {
  createP07OwnerBinding,
  p07OwnerHeaders,
  type P07OwnerBinding,
} from '../src/features/nfc/p07OwnerBinding';
import type { NfcJournal } from '../src/features/nfc/nfcAssignment';
import {
  bindShiftOwnerHeaders,
  resetShiftHeaderBindingsForTesting,
} from '../src/shift/ownerHeaders';
import { publishShiftState, resetShiftState } from '../src/shift/shiftState';
import { clearSession, setSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { confirmNfcAssignment } from '../src/services/wms/nfc';
import type { WorkShift } from '../src/services/wms/workShift';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = { actorId: id(1), authSessionId: id(2), warehouseId: id(3) };
const binding: P07OwnerBinding = {
  revision: 'p07-local-shift-identities-v1',
  shiftId: id(4),
  prepareRequestId: id(5),
  confirmRequestId: id(6),
  releaseRequestId: id(7),
};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const journal = (stage: NfcJournal['stage'] = 'PREPARED'): NfcJournal => ({
  context: clone(context),
  itemId: id(8),
  key: 'same-original-custom-confirm-key',
  hardwareUid: 'TEST_UID',
  stage,
  ownerBinding: clone(binding),
  preparation: {
    item: { item_id: id(8) },
    reservation_token: 'hold-original',
    nfc_payload: 'payload-original',
  },
  ...(stage === 'CONFIRMING' ? { writtenPayload: 'payload-original' } : {}),
});
const shift = {
  shift_id: id(4),
  actor_id: context.actorId,
  auth_session_id: context.authSessionId,
  warehouse_id: context.warehouseId,
  status: 'ACTIVE',
  version: 1,
  tracking_contract: 'p14-shift-v1',
  lifecycle: {
    contract: 'p01-p14-lifecycle-v1',
    mode: 'ENABLED',
    tracking_status: 'TRACKED',
  },
} as WorkShift;
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  resetShiftState();
  resetShiftHeaderBindingsForTesting();
  setSession({
    accessToken: 'offline-test-only',
    userId: context.actorId,
    authSessionId: context.authSessionId,
    activeWarehouseId: context.warehouseId,
  });
  publishShiftState(shift, context);
});
afterEach(() => {
  clearSession();
  resetShiftState();
});
test('new NFC attempt owns three distinct trace UUIDs after admission, separate from confirmation key', async () => {
  const admission = jest.fn(async () => ({ shiftId: id(4) }));
  let n = 4;
  const b = await createP07OwnerBinding(context, {
    admission,
    newId: () => id(++n),
  });
  expect(admission).toHaveBeenCalledWith(context, 'VALIDATE', 0);
  expect(b).toEqual(binding);
  expect(Object.isFrozen(b)).toBe(true);
});
test('recovery prepare uses its durably captured new trace and original shift, not source PREPARE trace', async () => {
  const source = journal('REJECTED');
  const recoveryBinding = {
    ...binding,
    prepareRequestId: id(15),
    confirmRequestId: id(16),
    releaseRequestId: id(17),
  };
  const active: NfcJournal = {
    ...source,
    stage: 'RECOVERY_PREPARING',
    recoveryPrepare: { source, ownerBinding: recoveryBinding },
  };
  const admission = jest.fn(async () => ({ shiftId: id(4) }));
  const headers = await p07OwnerHeaders(active, 'RECOVERY_PREPARE', {
    load: () => clone(active),
    admission,
  });
  expect(headers).toEqual({ 'X-Work-Shift-ID': id(4), 'X-Request-ID': id(15) });
  expect(admission).toHaveBeenCalledWith(context, 'VALIDATE', 0, id(4));
});
test('invalid or colliding traces are rejected before creating an intent', async () => {
  await expect(
    createP07OwnerBinding(context, {
      admission: async () => ({ shiftId: id(4) }),
      newId: () => id(5),
    }),
  ).rejects.toMatchObject({ code: 'NFC_OWNER_IDENTITY_INVALID' });
});
test.each([
  ['PREPARE', 'PREPARING', id(5)],
  ['WRITE', 'PREPARED', id(6)],
  ['CONFIRM', 'CONFIRMING', id(6)],
  ['RELEASE', 'PREPARED', id(7)],
] as const)(
  'persisted %s identity remains exact and unrotated',
  async (command, stage, trace) => {
    const j = journal(stage),
      saved = clone(j),
      admission = jest.fn(async () => ({ shiftId: id(4) }));
    const h = await p07OwnerHeaders(j, command, {
      load: () => saved,
      admission,
    });
    expect(h).toEqual({ 'X-Work-Shift-ID': id(4), 'X-Request-ID': trace });
    expect(admission).toHaveBeenCalledWith(context, 'VALIDATE', 0, id(4));
    expect(saved).toEqual(j);
    expect(j.key).toBe('same-original-custom-confirm-key');
  },
);
test('legacy journal without binding is not backfilled or physically written', async () => {
  const j = journal();
  delete j.ownerBinding;
  const saved = clone(j),
    admission = jest.fn(async () => ({ shiftId: id(4) }));
  await expect(
    p07OwnerHeaders(j, 'WRITE', { load: () => saved, admission }),
  ).rejects.toMatchObject({ code: 'NFC_ORIGINAL_OWNER_IDENTITY_REQUIRED' });
  expect(admission).not.toHaveBeenCalled();
  expect(saved).toEqual(j);
  expect(saved.ownerBinding).toBeUndefined();
});
test.each(['key', 'hardwareUid', 'itemId'] as const)(
  'persisted %s mismatch prevents a request',
  async field => {
    const j = journal('PREPARING'),
      saved = { ...j, [field]: 'changed' },
      admission = jest.fn(async () => ({ shiftId: id(4) }));
    await expect(
      p07OwnerHeaders(j, 'PREPARE', { load: () => saved, admission }),
    ).rejects.toMatchObject({ code: 'NFC_JOURNAL_UNVERIFIED' });
    expect(admission).not.toHaveBeenCalled();
  },
);
test('storage change during awaited admission is rechecked', async () => {
  const j = journal('CONFIRMING');
  let saved = clone(j);
  await expect(
    p07OwnerHeaders(j, 'CONFIRM', {
      load: () => saved,
      admission: async () => {
        saved = { ...saved, key: 'other' };
        return { shiftId: id(4) };
      },
    }),
  ).rejects.toMatchObject({ code: 'NFC_JOURNAL_UNVERIFIED' });
});
test('different shift cannot adopt an old NFC request', async () => {
  const j = journal();
  await expect(
    p07OwnerHeaders(j, 'WRITE', {
      load: () => clone(j),
      admission: async () => ({ shiftId: id(9) }),
    }),
  ).rejects.toMatchObject({ code: 'NFC_ORIGINAL_SHIFT_CHANGED' });
});
test('confirm without verified readback and prepare/release at wrong stages are blocked', async () => {
  const j = journal('CONFIRMING');
  delete j.writtenPayload;
  await expect(
    p07OwnerHeaders(j, 'CONFIRM', { load: () => clone(j) }),
  ).rejects.toMatchObject({ code: 'NFC_OWNER_STAGE_INVALID' });
  await expect(
    p07OwnerHeaders(journal(), 'PREPARE', { load: () => journal() }),
  ).rejects.toMatchObject({ code: 'NFC_OWNER_STAGE_INVALID' });
});
test.each([
  '/api/v1/mini-app/nfc/resolve-tag',
  '/api/v1/mini-app/nfc/resolve-code',
  '/api/v1/mini-app/warranty/resolve-code',
])('exact BE check-only POST %s needs no owner command receipt/trace', path => {
  const headers = { 'X-Owner-Contract': 'fixture-only' };
  expect(
    bindShiftOwnerHeaders({ method: 'POST', path, headers, body: {} }),
  ).toEqual(headers);
});
test.each([
  ['POST', '/api/v1/mini-app/items/' + id(8) + '/nfc/prepare'],
  ['PATCH', '/api/v1/mini-app/items/' + id(8) + '/nfc'],
  ['POST', '/api/v1/mini-app/nfc/resolve-tag/extra'],
  ['PATCH', '/api/v1/mini-app/nfc/resolve-tag'],
  ['POST', '/api/v1/mini-app/nfc/resolve-tag?mutation=true'],
  ['POST', '/api/v1/mini-app/warranty-cases'],
])(
  'actual writes and look-alike paths %s %s retain the fence',
  (method, path) => {
    expect(() =>
      bindShiftOwnerHeaders({
        method: method as 'POST' | 'PATCH',
        path,
        body: {},
      }),
    ).toThrow();
  },
);
test('NFC confirm service merges supplied owner headers without changing its original Idempotency-Key', async () => {
  const request = jest.fn(async (_options: unknown) => ({
    status: 201,
    data: { success: true, data: { stock_effect: 'NONE' } },
  }));
  await confirmNfcAssignment(
    id(8),
    {
      hardwareUid: 'TEST_UID',
      writtenPayload: 'payload-original',
      reservationToken: 'hold-original',
      idempotencyKey: 'same-original-custom-confirm-key',
    },
    {
      warehouseId: id(3),
      headers: { 'X-Work-Shift-ID': id(4), 'X-Request-ID': id(6) },
    },
    { request } as never,
  );
  expect(request.mock.calls[0][0]).toMatchObject({
    method: 'PATCH',
    headers: {
      'X-Work-Shift-ID': id(4),
      'X-Request-ID': id(6),
      'Idempotency-Key': 'same-original-custom-confirm-key',
    },
    body: {
      hardware_uid: 'TEST_UID',
      written_payload: 'payload-original',
      reservation_token: 'hold-original',
    },
  });
});
