// Isolated contract fixtures; no live calls and no stock/NFC changes.
import {
  createLinkedHistoryRead,
  linkedHistoryQuery,
  type ResumeTask,
} from '../src/services/wms/linkedHistoryRead';
import { context, id } from './fixtures/p09Mock';
import {
  p23BatchFixture,
  p23MetaFixture,
  p23CountsFixture,
  p23DetailFixture,
} from './fixtures/p23V3';
import { clearSession, setSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
const sha = '709744875a039178f432574ce1b59aaa3b42395c';
function ctx() {
  const c = context();
  return {
    session: c.session,
    user: {
      ...c.user!,
      permissions: [
        ...c.user!.permissions!,
        'history.read',
        'inventory.view',
        'inventory.trace',
      ],
    },
  };
}
const nfc = (extra = {}) => ({
  eventId: id(5),
  source: 'NFC',
  physical_code_id: id(4),
  recordId: 'NFC:' + id(4),
  activityId: 'NFC:' + id(5),
  warehouse: { warehouse_id: id(3), name: 'Offline' },
  identity_source: 'PERSISTED_NFC_AUDIT_SNAPSHOT',
  raw_content: null,
  raw_content_status: 'NOT_EXPOSED_MAY_CONTAIN_SECRETS',
  current_tag_status: null,
  actor: null,
  reason: null,
  audit_details_status: 'REDACTED',
  time: null,
  timeStatus: 'NOT_RECORDED',
  isConfirmationReceipt: false,
  mutation_available: false,
  type: 'ASSIGN',
  type_label: 'Gán',
  status: null,
  status_source: 'NOT_RECORDED',
  hardware_uid: null,
  previous_hardware_uid: null,
  serial_number: null,
  ...extra,
});
const nfcMeta = {
  contract: 'p22-nfc-history-v1',
  owner: 'P08',
  warehouseId: id(3),
  countUnit: 'EVENT',
  source: 'NFC',
  coveragePolicy: 'ONLY_PERSISTED_EVENT_SNAPSHOTS',
  legacyPolicy: 'EXCLUDE_UNPROVEN_EVENT_WAREHOUSE',
  resultPolicy: 'OWNER_RESULT_SNAPSHOT_NO_STORAGE_DEFAULTS',
  paginationConsistency: 'KEYSET_UPPER_BOUND_NOT_FROZEN_SNAPSHOT',
  exportAvailable: false,
  currentTagLookupPerformed: false,
  isConfirmationReceipt: false,
  total: 1,
  hasMore: false,
  nextCursor: null,
  nextPage: null,
};
const task = () => ({
  document_id: id(8),
  document_kind: 'STAGING_DRAFT',
  scan_session_id: id(9),
  warranty_case_id: id(10),
  actor_id: id(1),
  auth_session_id: id(2),
  warehouse_id: id(3),
  operation: 'COMPONENT_ISSUE',
  version: 2,
  status: 'RECORDED',
  codes_validated: false,
  scan_evidence_persisted: false,
  mutation_exposed: false,
  resume_policy: 'OPEN_EXISTING_RESULT',
  codes: [{ raw_code: 'Unvalidated input', quantity: null, scan_source: null }],
  form: {
    p19: {
      contract: 'p19-component-issue-linked-v1',
      warranty_case_id: id(10),
    },
  },
  snapshot_shape_valid: false,
  case_status: 'CHECKING',
  case_allows_issue: true,
  owner_revalidation_required: true,
  stock_effect: 'NONE',
  read_stock_effect: 'NONE',
  summary: {
    code_count: 1,
    quantity_total: null,
    basis: 'UNVALIDATED_PERSONAL_SNAPSHOT',
  },
  business_document_id: id(11),
  business_link_present: true,
  business_status: 'POSTED',
  business_detail_path: '/api/v1/mini-app/warranty-component-issues/' + id(11),
  business_version: 3,
  document_no: 'XLK-offline',
  posted_at: null,
  can_open_business: true,
  last_request_id: id(12),
  last_command: 'RECORD',
});
const taskMeta = {
  contract: 'mini-app-p03-v1',
  resume_contract: 'p21-component-resume-v1',
  actor_id: id(1),
  auth_session_id: id(2),
  warehouse_id: id(3),
  mutation_exposed: false,
  total: 7,
  page: 1,
  per_page: 20,
  last_page: 1,
  has_more: false,
};
function harness(
  reply: (path: string, options: any) => unknown,
  healthSha = sha,
) {
  const get = jest.fn(async (path: string, options: any) =>
    path === '/api/v1/health'
      ? {
          status: 200,
          data: { data: { build: { sha: healthSha } } },
          header: (name: string) =>
            name === 'X-WMS-Deployment-Tier' ? 'dev-test' : undefined,
        }
      : { status: 200, data: await reply(path, options) },
  );
  return { get, api: createLinkedHistoryRead(ctx, { get } as any) };
}
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession(context().session!);
});
afterEach(() => {
  clearSession();
  jest.restoreAllMocks();
});

test('P22 summary exposes only verified persisted result options and rejects conflicting counts', async () => {
  const data = {
    grandTotal: 3,
    availableTotal: 3,
    countUnit: 'EVENT',
    statusTotals: [
      { status: null, total: 1 },
      { status: 'SUCCESS', total: 2 },
    ],
  };
  const h = harness(() => ({ success: true, data, meta: nfcMeta }));
  expect((await h.api.nfcSummary()).statusTotals).toEqual(data.statusTotals);
  const bad = harness(() => ({
    success: true,
    data: { ...data, statusTotals: [{ status: 'SUCCESS', total: 4 }] },
    meta: nfcMeta,
  }));
  await expect(bad.api.nfcSummary()).rejects.toMatchObject({
    code: 'P22_STATUS_TOTALS_INVALID',
  });
});

test('new DEV deployment reaches NFC owner contract without repinning; incompatible contract is still rejected', async () => {
  const h = harness(
    () => ({ success: true, data: [nfc()], meta: nfcMeta }),
    'b'.repeat(40),
  );
  expect((await h.api.nfcList()).items).toHaveLength(1);
  const bad = harness(
    () => ({
      success: true,
      data: [],
      meta: { ...nfcMeta, contract: 'p22-nfc-history-v999' },
    }),
    'c'.repeat(40),
  );
  await expect(bad.api.nfcList()).rejects.toMatchObject({
    code: 'OWNER_READ_INVALID',
  });
  expect(bad.get).toHaveBeenCalledTimes(2);
});
test('NFC GET owns its header and source, keeps missing result/UID null', async () => {
  const h = harness(() => ({ success: true, data: [nfc()], meta: nfcMeta }));
  const r = await h.api.nfcList({
    keyword: 'chip',
    cursor: 'opaque',
    limit: 10,
  });
  expect(r.items[0]).toMatchObject({
    status: null,
    uid: null,
    statusSource: 'NOT_RECORDED',
  });
  expect(h.get.mock.calls[0][1].headers).toBeUndefined();
  expect(h.get.mock.calls[1]).toEqual([
    '/api/v1/mini-app/history/records',
    expect.objectContaining({
      headers: { 'X-NFC-History-Contract': 'p22-nfc-history-v1' },
      query: {
        warehouse_id: id(3),
        source: 'NFC',
        keyword: 'chip',
        cursor: 'opaque',
        limit: 10,
      },
    }),
  ]);
  expect(h.get.mock.calls[1][1].body).toBeUndefined();
});
test.each([
  { source: 'DOCUMENT' },
  { page: 1 },
  { warehouse_id: id(99) },
  { cursor: 'x', page: 1 },
  { date_mode: 'RANGE', from: '2026-02-30', to: '2026-03-01' },
])('rejects foreign/invalid NFC query before HTTP %j', async q => {
  const h = harness(() => ({}));
  await expect(h.api.nfcList(q as any)).rejects.toThrow();
  expect(h.get).not.toHaveBeenCalled();
});
test('summary excludes paging; direct event has only persisted UUID and source', async () => {
  expect(() => linkedHistoryQuery('P22', { cursor: 'x' }, true)).toThrow();
  const h = harness((_path, options) =>
    options?.query?.event_id
      ? { success: true, data: [nfc()], meta: nfcMeta }
      : {
          success: true,
          data: {
            recordId: 'NFC:' + id(4),
            selectedActivity: nfc(),
            events: [nfc()],
          },
          meta: nfcMeta,
        },
  );
  await h.api.nfcEvent(id(5));
  expect(h.get.mock.calls[1][1].query).toEqual({
    source: 'NFC',
    event_id: id(5),
    warehouse_id: id(3),
  });
  expect(h.get.mock.calls[3][0]).toContain(encodeURIComponent('NFC:' + id(4)));
  expect(h.get.mock.calls[3][1].query.activityId).toBe('NFC:' + id(5));
});
test('NFC detail rejects another event/parent or fabricated SUCCESS', async () => {
  const h = harness(() => ({
    success: true,
    data: {
      recordId: 'NFC:' + id(4),
      selectedActivity: nfc({ eventId: id(6), activityId: 'NFC:' + id(6) }),
      events: [nfc()],
    },
    meta: nfcMeta,
  }));
  await expect(
    h.api.nfcDetail('NFC:' + id(4), 'NFC:' + id(5)),
  ).rejects.toThrow();
  const mismatch = harness(() => ({
    success: true,
    data: [nfc({ status: 'SUCCESS' })],
    meta: nfcMeta,
  }));
  await expect(mismatch.api.nfcList()).rejects.toThrow();
});

test('REPLACE without saved old-to-new evidence is never displayed as Thay', async () => {
  const h = harness(() => ({
    success: true,
    data: [nfc({ type: 'REPLACE', type_label: 'Thay' })],
    meta: nfcMeta,
  }));
  await expect(h.api.nfcList()).rejects.toThrow();
});

test.each([
  { actor: { display_name: 'SHOULD NOT LEAK' } },
  { reason: 'SHOULD NOT LEAK' },
  {
    audit_details_status: 'PERMITTED',
    actor: { display_name: 'SHOULD NOT LEAK' },
  },
  { current_tag_status: 'ACTIVE' },
  { raw_content: { secret: 'SHOULD NOT LEAK' } },
])(
  'P22 rejects privacy/provenance mismatch before returning fields: %j',
  async extra => {
    const h = harness(() => ({
      success: true,
      data: [nfc(extra)],
      meta: nfcMeta,
    }));
    await expect(h.api.nfcList()).rejects.toThrow();
  },
);

test('P22 exact-event projections cannot disagree on payload even with matching event ID', async () => {
  const h = harness(() => ({
    success: true,
    data: {
      recordId: 'NFC:' + id(4),
      selectedActivity: nfc({ hardware_uid: 'UID-one' }),
      events: [nfc({ hardware_uid: 'UID-two' })],
    },
    meta: nfcMeta,
  }));
  await expect(
    h.api.nfcDetail('NFC:' + id(4), 'NFC:' + id(5)),
  ).rejects.toThrow();
});

test.each([
  { resume_policy: 'AUTO_POST' },
  { business_detail_path: '/other/' + id(11) },
  { business_version: 0 },
  { snapshot_shape_valid: true },
  {
    summary: {
      code_count: 1,
      quantity_total: 1,
      basis: 'UNVALIDATED_PERSONAL_SNAPSHOT',
    },
  },
  { can_open_business: false },
])(
  'P21 rejects unverified quantity, policy and business-link claims: %j',
  async extra => {
    const h = harness(() => ({
      success: true,
      data: [{ ...task(), ...extra }],
      meta: taskMeta,
    }));
    await expect(h.api.tasks()).rejects.toThrow();
  },
);

test('P21 whitelists private code fields and preserves incomplete snapshot without fabricated quantity', async () => {
  const h = harness(() => ({
    success: true,
    data: [
      {
        ...task(),
        codes: [
          {
            raw_code: 'original',
            quantity: null,
            scan_source: null,
            customer_phone: 'SHOULD NOT LEAK',
          },
        ],
      },
    ],
    meta: taskMeta,
  }));
  const result = await h.api.tasks();
  expect(result.items[0].quantity).toBeNull();
  expect(result.items[0].codes).toEqual([
    { raw_code: 'original', quantity: null, scan_source: null },
  ]);
});
test('P21 keeps staging/business identity and nullable snapshot quantity separate', async () => {
  const h = harness(() => ({ success: true, data: [task()], meta: taskMeta })),
    r = await h.api.tasks();
  expect(r.total).toBe(7);
  expect(r.items[0]).toMatchObject({
    id: id(8),
    businessId: id(11),
    version: 2,
    businessVersion: 3,
    quantity: null,
    postedAt: null,
  });
  expect(h.get.mock.calls[1][1]).toMatchObject({
    headers: { 'X-Component-Resume-Contract': 'p21-component-resume-v1' },
    query: {
      warehouse_id: id(3),
      operation: 'COMPONENT_ISSUE',
      page: 1,
      per_page: 20,
    },
  });
  expect(h.get.mock.calls[1][1].headers['Idempotency-Key']).toBeUndefined();
});
test('P21 UNKNOWN remains CHECK_ONLY; wrong original receipt cannot mean success', async () => {
  const h = harness(() => ({
    success: true,
    data: {
      outcome: 'UNKNOWN',
      receipt: null,
      response: null,
      p21_recovery_policy: 'CHECK_ONLY',
      may_create_new_request: false,
    },
    meta: taskMeta,
  }));
  const t = { id: id(8), scanSessionId: id(9) } as ResumeTask;
  expect((await h.api.taskRequest(t, id(12), 'RECORD')).outcome).toBe(
    'UNKNOWN',
  );
  expect(h.get.mock.calls[1][1].query).toEqual({
    warehouse_id: id(3),
    scan_session_id: id(9),
    operation: 'COMPONENT_ISSUE',
    command: 'RECORD',
  });
  const bad = harness(() => ({
    success: true,
    data: {
      outcome: 'SUCCEEDED',
      receipt: { request_id: id(99) },
      p21_recovery_policy: 'CHECK_ONLY',
      may_create_new_request: false,
    },
    meta: taskMeta,
  }));
  await expect(bad.api.taskRequest(t, id(12), 'RECORD')).rejects.toThrow();
});
test('P23 counts sessions, including zero events, and keeps partial total/issued counts null', async () => {
  const h = harness(() => ({
    success: true,
    data: [
      {
        ...p23BatchFixture(),
        latestEvent: null,
        latestEventStatus: 'NO_RETAINED_EVENTS',
        counts: { ...p23CountsFixture(), total: 0, other: 0, statusTotals: {} },
      },
    ],
    meta: {
      ...p23MetaFixture(),
      coverage: 'PARTIAL_SOURCE',
      total: null,
      availableTotal: 1,
      hasMore: false,
      nextCursor: null,
      nextPage: null,
    },
  }));
  const r = await h.api.sessions({ page: 1, date_mode: 'ALL' });
  expect(r.total).toBeNull();
  expect(r.availableTotal).toBe(1);
  expect(r.items[0].counts.issuedQuantity).toBeNull();
  expect(h.get.mock.calls[1][1].headers).toBeUndefined();
});

test('P23 v3 detail keeps persisted latest event separate from safe paged events and null session times', async () => {
  const h = harness(() => p23DetailFixture());
  const r = await h.api.session(id(6), 'event-cursor');
  expect(r.batch.startedAt).toBeNull();
  expect(r.batch.endedAt).toBeNull();
  expect(r.latestEvent).toMatchObject({
    rawCode: 'OFFLINE-RAW',
    status: 'RESOLVED',
    serial: null,
    sku: null,
    issuedQuantity: null,
  });
  expect(r.batch.counts).toMatchObject({
    accepted: 0,
    other: 1,
    explicitRejected: 0,
    rejected: null,
    quantity: null,
  });
  expect(h.get.mock.calls[1][1].query).toEqual({
    limit: 20,
    cursor: 'event-cursor',
    warehouse_id: id(3),
  });
});

test.each(['mini-app-p23-read-v2', 'mini-app-p23-read-v4'])(
  'P23 does not silently accept %s',
  async contract => {
    const h = harness(() => ({
      success: true,
      data: [p23BatchFixture()],
      meta: { ...p23MetaFixture(), contract },
    }));
    await expect(h.api.sessions()).rejects.toThrow();
  },
);

test('P23 rejects fabricated partial total, wrong event identity and resolved-to-accepted promotion', async () => {
  const badTotal = harness(() => ({
    success: true,
    data: [],
    meta: { ...p23MetaFixture(), coverage: 'PARTIAL_SOURCE' },
  }));
  await expect(badTotal.api.sessions()).rejects.toThrow();
  const badCount = harness(() => ({
    success: true,
    data: [
      {
        ...p23BatchFixture(),
        counts: { ...p23CountsFixture(), accepted: 1, other: 0 },
      },
    ],
    meta: p23MetaFixture(),
  }));
  await expect(badCount.api.sessions()).rejects.toThrow();
  const detail = p23DetailFixture();
  detail.data.events[0].activityId = 'SCAN:' + id(99);
  await expect(harness(() => detail).api.session(id(6))).rejects.toThrow();
});
test('P23 collection query never accepts an events limit or mixed page/cursor', () => {
  expect(() => linkedHistoryQuery('P23', { limit: 20 })).toThrow();
  expect(() =>
    linkedHistoryQuery('P23', { cursor: 'events', page: 1 }),
  ).toThrow();
  expect(() =>
    linkedHistoryQuery('P23', {
      date_mode: 'DATE',
      date_field: 'returned_at',
      date: '2026-10-15',
    }),
  ).toThrow();
});
test('wrong runtime blocks owner read; late old-session response is discarded', async () => {
  const h = harness(() => ({}), 'wrong');
  await expect(h.api.nfcList()).rejects.toThrow();
  expect(h.get).toHaveBeenCalledTimes(1);
  let finish!: (data: unknown) => void;
  const late = harness(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  const pending = late.api.nfcList();
  await Promise.resolve();
  await Promise.resolve();
  setSession({ ...context().session!, authSessionId: id(99) });
  finish({ success: true, data: [nfc()], meta: nfcMeta });
  await expect(pending).rejects.toThrow();
});
