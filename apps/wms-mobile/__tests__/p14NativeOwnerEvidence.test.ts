import {
  establishP09CloseCheckBaseline,
  registerNativeP14Owners,
} from '../src/shift/nativeOwnerEvidence';
import {
  readShiftLocalOwners,
  readShiftLocalOwnerStatus,
} from '../src/shift/localOwners';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { clearSession, setSession } from '../src/auth/session';
import {
  p05FormSnapshot,
  p05StableJSON,
} from '../src/features/outbound/p05CreateForm';
const id = '11111111-1111-4111-8111-111111111111',
  scope = { actorId: id, authSessionId: id, warehouseId: id };
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline',
    userId: id,
    authSessionId: id,
    activeWarehouseId: id,
  });
});
afterEach(() => clearSession());
test('native inventory keeps missing legacy P09 evidence incomplete', () => {
  const release = registerNativeP14Owners(),
    statuses = readShiftLocalOwnerStatus();
  expect(statuses.map(v => v.owner)).toEqual([
    'P03',
    'P04',
    'P05',
    'P07',
    'P09',
    'P19',
  ]);
  expect(statuses.every(v => v.registered)).toBe(true);
  expect(statuses.find(v => v.owner === 'P09')).toMatchObject({
    state: 'UNKNOWN',
    coverageComplete: false,
  });
  expect(readShiftLocalOwners()).toMatchObject({
    coverageComplete: false,
    state: 'UNKNOWN',
  });
  release();
  expect(readShiftLocalOwners().coverageComplete).toBe(false);
});
test('verified server close-check establishes a scoped P09 clean baseline only when no command journal exists', () => {
  const store = createStorage(createMemoryBackend()),
    release = registerNativeP14Owners(store);
  expect(
    readShiftLocalOwnerStatus().find(v => v.owner === 'P09'),
  ).toMatchObject({ state: 'UNKNOWN', coverageComplete: false });
  expect(establishP09CloseCheckBaseline(false, store)).toBe(false);
  expect(establishP09CloseCheckBaseline(true, store)).toBe(true);
  expect(
    readShiftLocalOwnerStatus().find(v => v.owner === 'P09'),
  ).toMatchObject({ state: 'CLEAN', coverageComplete: true });
  expect(readShiftLocalOwners()).toMatchObject({
    state: 'CLEAN',
    coverageComplete: true,
  });
  release();
});
test('P09 UNKNOWN journal cannot be hidden by a close-check baseline', () => {
  const store = createStorage(createMemoryBackend());
  store.setObject('p09-command-recovery/v1/' + [id, id, id].join('/'), {
    schema: 'p09-command-recovery-v1',
    scope,
    phase: 'unknown',
    command: {
      scope,
      requestId: id,
      idempotencyKey: id,
    },
  });
  const release = registerNativeP14Owners(store);
  expect(establishP09CloseCheckBaseline(true, store)).toBe(false);
  expect(
    readShiftLocalOwnerStatus().find(v => v.owner === 'P09'),
  ).toMatchObject({ state: 'UNKNOWN', pendingCount: 1 });
  release();
});
test.each([
  ['sending', undefined, 'UNKNOWN'],
  ['unknown', undefined, 'UNKNOWN'],
  ['succeeded', 'SUCCEEDED', 'CLEAN'],
  ['failed', 'FAILED', 'CLEAN'],
] as const)(
  'P09 durable owner evidence maps %s/%s to %s',
  (phase, receiptState, expected) => {
    const store = createStorage(createMemoryBackend());
    const command = {
      scope: { ...scope, permissions: ['warranty.manage'] },
      requestId: id,
      idempotencyKey: id,
    };
    store.setObject('p09-command-recovery/v1/' + [id, id, id].join('/'), {
      schema: 'p09-command-recovery-v1',
      scope,
      phase,
      command,
      ...(receiptState
        ? { receipt: { request_id: id, state: receiptState } }
        : {}),
    });
    const release = registerNativeP14Owners(store);
    expect(
      readShiftLocalOwnerStatus().find(v => v.owner === 'P09'),
    ).toMatchObject({ state: expected });
    if (expected === 'UNKNOWN')
      expect(readShiftLocalOwners().pendingRequestIds).toContain(id);
    release();
  },
);
test('reading empty owner storage does not write', () => {
  const store = createStorage(createMemoryBackend()),
    before = store.keys(),
    release = registerNativeP14Owners(store);
  expect(readShiftLocalOwners().pendingRequestIds).toEqual([]);
  expect(store.keys()).toEqual(before);
  release();
});
test('P04 and P03 pending records remain UNKNOWN', () => {
  const store = createStorage(createMemoryBackend());
  store.setObject('p04.runs.v1/' + id, {
    id,
    scope,
    pending: { key: id, outcome: 'UNKNOWN' },
  });
  store.setObject('p03.drafts.v1/' + id, {
    id,
    scope,
    body: { operation: 'INBOUND' },
    pending: { requestId: id, outcome: 'UNKNOWN' },
  });
  const release = registerNativeP14Owners(store),
    status = readShiftLocalOwnerStatus();
  expect(status.find(v => v.owner === 'P04')?.state).toBe('UNKNOWN');
  expect(status.find(v => v.owner === 'P03')?.state).toBe('UNKNOWN');
  expect(readShiftLocalOwners().pendingRequestIds).toContain(id);
  release();
});

test.each(['FAILED', 'CONFLICT'])('a known P04 %s request needs owner repair without being reported as an unknown outcome', outcome => {
  const store = createStorage(createMemoryBackend());
  const row = {id,scope,items:[],ui:{name:'PN-TEST'},pending:{key:id,outcome}};
  store.setObject('p04.runs.v1/'+id,row);
  const release = registerNativeP14Owners(store);
  expect(readShiftLocalOwnerStatus().find(v=>v.owner==='P04')).toMatchObject({state:'DIRTY',coverageComplete:true,pendingCount:0});
  expect(store.getObject('p04.runs.v1/'+id)).toEqual(row);
  release();
});

test('busy or explicitly uncertain work stays UNKNOWN even alongside a failed pending request', () => {
  for (const extra of [{busy:true},{unknown:true}]) {
    const store=createStorage(createMemoryBackend());
    store.setObject('p04.runs.v1/'+id,{id,scope,pending:{key:id,outcome:'FAILED'},...extra});
    const release=registerNativeP14Owners(store);
    expect(readShiftLocalOwnerStatus().find(v=>v.owner==='P04')?.state).toBe('UNKNOWN');
    release();
  }
});
test('P04 unresolved validate/review trace is not local CLEAN even without a pending mutation', () => {
  const store = createStorage(createMemoryBackend());
  store.setObject('p04.runs.v1/' + id, {
    id,
    scope,
    closed: true,
    ownerChecks: [
      { requestId: id, shiftId: id, command: 'REVIEW', outcome: 'UNKNOWN' },
    ],
  });
  const release = registerNativeP14Owners(store);
  expect(
    readShiftLocalOwnerStatus().find(v => v.owner === 'P04'),
  ).toMatchObject({
    state: 'UNKNOWN',
    coverageComplete: false,
    pendingCount: 1,
  });
  expect(readShiftLocalOwners().pendingRequestIds).toContain(id);
  release();
});
test.each(['hn-p05-create-v1:', 'hn-p05-linked-v1:'])(
  'P05 nested journal %s is read with its original key',
  prefix => {
    const store = createStorage(createMemoryBackend());
    store.setObject(prefix + 'test-only', {
      scope,
      state: { pending: { key: id }, busy: true },
    });
    const release = registerNativeP14Owners(store);
    expect(
      readShiftLocalOwnerStatus().find(v => v.owner === 'P05'),
    ).toMatchObject({ state: 'UNKNOWN', pendingCount: 1 });
    expect(readShiftLocalOwners()).toMatchObject({
      busy: true,
      pendingRequestIds: [id],
    });
    release();
  },
);
test('P04 metadata changes invalidate the inventory revision and remain DIRTY', () => {
  const store = createStorage(createMemoryBackend()),
    row = {
      scope,
      id,
      identity: { scanSessionId: id },
      ui: { name: 'new' },
      items: [],
      server: { version: 1 },
      saveReceipt: { command: 'SAVE', version: 1 },
      savedBody: {
        warehouse_id: id,
        scan_session_id: id,
        inbound_type: 'receipt',
        supplier_id: null,
        name: 'old',
        note: '',
        items: [],
      },
    };
  store.setObject('p04.runs.v1/' + id, row);
  const release = registerNativeP14Owners(store),
    before = readShiftLocalOwners().revision;
  expect(readShiftLocalOwnerStatus().find(v => v.owner === 'P04')?.state).toBe(
    'DIRTY',
  );
  store.setObject('p04.runs.v1/' + id, { ...row, ui: { name: 'newer' } });
  expect(readShiftLocalOwners().revision).not.toBe(before);
  release();
});
test('malformed journal is retained and never becomes an empty CLEAN inventory', () => {
  const store = createStorage(createMemoryBackend());
  store.setString('p03.drafts.v1/' + id, 'not-json');
  const release = registerNativeP14Owners(store);
  expect(
    readShiftLocalOwnerStatus().find(v => v.owner === 'P03'),
  ).toMatchObject({ state: 'UNKNOWN', coverageComplete: false });
  expect(store.getString('p03.drafts.v1/' + id)).toBe('not-json');
  release();
});
test('a partial same-version receipt without owner identity is DIRTY', () => {
  const store = createStorage(createMemoryBackend());
  store.setObject('p03.drafts.v1/' + id, {
    id,
    scope,
    server: { version: 1 },
    receipt: { command: 'SAVE', version: 1 },
  });
  const release = registerNativeP14Owners(store);
  expect(
    readShiftLocalOwnerStatus().find(v => v.owner === 'P03'),
  ).toMatchObject({ state: 'DIRTY', coverageComplete: true });
  release();
});
test('verified saved P03 draft remains CLEAN and may survive END', () => {
  const store = createStorage(createMemoryBackend()),
    scanSessionId = '22222222-2222-4222-8222-222222222222',
    body = {
      warehouse_id: id,
      operation: 'INBOUND',
      scan_session_id: scanSessionId,
      codes: [{ raw_code: 'HN1|SKU=TEST|ITEM=TEST-01' }],
      form: { note: 'draft' },
      title: 'PN-0005',
    },
    server = {
      document_id: id,
      scan_session_id: scanSessionId,
      auth_session_id: id,
      warehouse_id: id,
      operation: 'INBOUND',
      version: 2,
      status: 'DRAFT',
      codes: body.codes,
      form: body.form,
      title: body.title,
    };
  store.setObject('p03.drafts.v1/' + id, {
    id,
    scope,
    identity: { documentId: id, scanSessionId },
    body,
    server,
    receipt: {
      request_id: '33333333-3333-4333-8333-333333333333',
      document_id: id,
      scan_session_id: scanSessionId,
      warehouse_id: id,
      operation: 'INBOUND',
      command: 'SAVE',
      version: 2,
      outcome: 'SUCCEEDED',
    },
  });
  const release = registerNativeP14Owners(store);
  establishP09CloseCheckBaseline(true, store);
  expect(
    readShiftLocalOwnerStatus().find(v => v.owner === 'P03'),
  ).toMatchObject({ state: 'CLEAN', coverageComplete: true });
  expect(readShiftLocalOwners()).toMatchObject({
    state: 'CLEAN',
    coverageComplete: true,
  });
  release();
});
test('verified P04/P05/P19 saved journals are CLEAN, unsaved edits stay DIRTY', () => {
  const store = createStorage(createMemoryBackend()),
    scanSessionId = '22222222-2222-4222-8222-222222222222';
  store.setObject('p04.runs.v1/' + id, {
    id,
    scope,
    identity: { documentId: id, scanSessionId },
    ui: { name: 'PN-0005', note: '', supplierId: null },
    items: [],
    server: { version: 1, status: 'DRAFT' },
    saveReceipt: { command: 'SAVE', version: 1 },
    savedBody: {
      warehouse_id: id,
      scan_session_id: scanSessionId,
      inbound_type: 'receipt',
      supplier_id: null,
      name: 'PN-0005',
      note: '',
      items: [],
    },
    closed: false,
  });
  const form = {
    name: 'PX-0005',
    recipientId: 'walk-in',
    originalAddress: '',
    recipient: 'Khách TEST',
    phone: '0901234567',
    province: '48',
    provinceName: 'Đà Nẵng',
    ward: '20194',
    wardName: 'Tam Kỳ',
    address: 'Khối phố 5',
    plannedInput: '1',
    group: 'Dụng cụ',
    note: '',
  };
  const savedSignature = p05StableJSON({
    codes: [],
    form: p05FormSnapshot(form),
  });
  store.setObject('hn-p05-create-v1:test', {
    scope,
    state: {
      form,
      accepted: [],
      version: 1,
      savedSignature,
      serverDraft: { version: 1, status: 'DRAFT' },
    },
  });
  store.setObject('p19-linked-private/v1/' + [id, id, id, id].join('/'), {
    schema: 'p19-linked-private-v1',
    scope,
    caseId: id,
    draftId: id,
    scanSessionId,
    dirty: false,
    unknown: false,
    busy: false,
    pending: null,
  });
  const release = registerNativeP14Owners(store);
  establishP09CloseCheckBaseline(true, store);
  for (const owner of ['P04', 'P05', 'P19'])
    expect(
      readShiftLocalOwnerStatus().find(v => v.owner === owner),
    ).toMatchObject({ state: 'CLEAN', coverageComplete: true });
  expect(readShiftLocalOwners().state).toBe('CLEAN');
  release();
});
test('P07 terminal confirmation is CLEAN while an unresolved write blocks END', () => {
  const store = createStorage(createMemoryBackend()),
    key = 'p07.nfc.' + [id, id, id].join('.'),
    terminal = {
      context: scope,
      itemId: id,
      key: id,
      stage: 'CONFIRMED',
      result: {
        confirmation: {
          state: 'SUCCEEDED',
          item_id: id,
          actor_id: id,
          auth_session_id: id,
          warehouse_id: id,
        },
      },
    };
  store.setObject(key, terminal);
  let release = registerNativeP14Owners(store);
  expect(
    readShiftLocalOwnerStatus().find(v => v.owner === 'P07'),
  ).toMatchObject({ state: 'CLEAN', coverageComplete: true });
  release();
  store.setObject(key, { ...terminal, stage: 'WRITING', result: undefined });
  release = registerNativeP14Owners(store);
  expect(
    readShiftLocalOwnerStatus().find(v => v.owner === 'P07'),
  ).toMatchObject({
    state: 'UNKNOWN',
    coverageComplete: false,
    pendingCount: 1,
  });
  release();
});
test('foreign P05 state is not rebound to current auth owner', () => {
  const store = createStorage(createMemoryBackend());
  store.setObject('hn-p05-create-v1:foreign', {
    scope: { ...scope, authSessionId: 'other' },
    state: { pending: { key: id } },
  });
  const release = registerNativeP14Owners(store);
  expect(
    readShiftLocalOwnerStatus().find(v => v.owner === 'P05')?.pendingCount,
  ).toBe(0);
  expect(store.has('hn-p05-create-v1:foreign')).toBe(true);
  release();
});
test('a damaged scope cannot disappear as a foreign empty journal', () => {
  const store = createStorage(createMemoryBackend());
  store.setObject('hn-p05-create-v1:damaged', {
    scope: {},
    state: { pending: { key: id } },
  });
  const release = registerNativeP14Owners(store);
  expect(
    readShiftLocalOwnerStatus().find(v => v.owner === 'P05'),
  ).toMatchObject({ state: 'UNKNOWN', coverageComplete: false });
  expect(store.has('hn-p05-create-v1:damaged')).toBe(true);
  release();
});
