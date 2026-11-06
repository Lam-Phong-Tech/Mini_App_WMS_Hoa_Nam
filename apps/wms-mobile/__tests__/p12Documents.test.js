import { createP12Service } from '../src/features/documents/p12/service';
import {
  createP12Controller,
  initialFilters,
} from '../src/features/documents/p12/controller';
import {
  parseStockDetail,
  parseStockList,
  parseScans,
  parseWarrantyReceipt,
  parseP12Record,
  stockListQuery,
  warrantyQuery,
  evidenceQuery,
  p04Seed,
} from '../src/features/documents/p12/contract';
import { P12_DEV, p12ReadPath, p12DevEnabled } from '../src/config/p12Release';
import { createApiClient } from '../src/api/client';
import { ENVIRONMENTS } from '../src/config/env';
import { setSession, clearSession } from '../src/auth/session';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import * as m from './fixtures/p12Protocol';

const current = () => ({
  id: m.actor,
  auth_session_id: m.session,
  active_warehouse_id: m.warehouse,
  warehouse_context: { status: 'READY' },
  available_warehouses: [{ warehouse_id: m.warehouse, status: 'ACTIVE' }],
  permissions: m.context().rights,
});
const session = () => ({
  userId: m.actor,
  authSessionId: m.session,
  activeWarehouseId: m.warehouse,
  accessToken: 'offline-access',
});
const silent = { debug() {}, warn() {}, info() {}, error() {} };
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession(session());
});
afterEach(() => clearSession());
function fixture() {
  let user = current();
  const transport = m.mockTransport(),
    client = {
      async get(path, options = {}) {
        const query = new URLSearchParams(Object.entries(options.query ?? {}));
        const r = await transport.request(
          'https://p12.invalid' + path + '?' + query,
          {
            method: 'GET',
            headers: { Authorization: 'Bearer offline' },
            signal: options.signal,
          },
        );
        if (!r.ok) {
          const e = Error('HTTP ' + r.status);
          e.status = r.status;
          throw e;
        }
        return {
          status: r.status,
          data:
            options.responseType === 'blob' ? await r.blob() : await r.json(),
          header: n => r.headers.get(n) ?? undefined,
        };
      },
    };
  const api = createP12Service(() => ({ session: session(), user }), {
      client,
      origin: 'https://p12.invalid',
      timeoutMs: 100,
    }),
    controller = createP12Controller(api);
  return {
    api,
    controller,
    transport,
    setUser: u => {
      user = u;
    },
  };
}
test('DEV read activation cannot open customer or any command', () => {
  expect(P12_DEV.fullActivation).toBe(false);
  expect(P12_DEV.productionEnabled).toBe(false);
  expect(p12DevEnabled(ENVIRONMENTS['customer-production'])).toBe(false);
  for (const method of ['POST', 'PATCH', 'DELETE'])
    expect(
      p12ReadPath(method, '/api/v1/mini-app/inbound-documents/' + m.business),
    ).toBe(false);
  expect(
    p12ReadPath(
      'GET',
      '/api/v1/mini-app/warranty-cases/' + m.caseId + '/status',
    ),
  ).toBe(false);
});
test.each(['inbound', 'outbound'])(
  '%s query/meta preserves source total and scope',
  async type => {
    const f = fixture(),
      p = await f.api.list(type);
    expect(p.meta.p12.contract).toBe('p12-documents-read-v2');
    expect(p.paging.snapshotConsistent).toBe(false);
    expect(f.transport.calls[0].query.status).toBeUndefined();
    expect(f.transport.calls[0].query.warehouse_id).toBe(m.warehouse);
    f.controller.dispose();
  },
);
test('Mixed All reads one aggregate request without source merges', async () => {
  const f = fixture();
  await f.controller.load();
  expect(f.transport.calls).toHaveLength(1);
  expect(f.transport.calls[0].path).toBe('/api/v1/mini-app/documents');
  expect(f.controller.snapshot().list).toMatchObject({
    status: 'ready',
  });
  expect(f.controller.snapshot().list.data.items).toHaveLength(3);
  await f.controller.resumeList();
  expect(f.transport.calls).toHaveLength(1);
});
test('Typed source then All does not merge rows or totals', async () => {
  const f = fixture();
  await f.controller.filters({ ...initialFilters(), source: 'outbound' });
  await f.controller.filters(initialFilters());
  expect(f.transport.calls).toHaveLength(2);
  expect(f.controller.snapshot().list.data.items).toHaveLength(3);
  expect(f.controller.snapshot().groups.outbound.data).toBeUndefined();
});
test('Null persisted warehouse never becomes session warehouse', () => {
  const row = m.record({ ...m.stock(), dst_warehouse_id: null }, 'inbound');
  expect(parseP12Record(row, 'inbound').identity.warehouse_id).toBeNull();
  expect(() =>
    parseStockDetail(m.detail(row), 'inbound', m.business, m.warehouse),
  ).toThrow();
});
test.each(['source', 'owner', 'count_unit', 'contract'])(
  'Invalid additive %s fails closed',
  key => {
    const b = m.list();
    b.meta.p12[key] = 'wrong';
    expect(() =>
      parseStockList(b, 'inbound', stockListQuery('inbound')),
    ).toThrow();
  },
);
test('Missing quantity preserves known subtotal and row null', () => {
  const rows = m.scans().data;
  rows[1].quantity = null;
  const b = m.scans(m.business, 'ACTIVE', {}, rows, m.summary(rows)),
    d = parseScans(b, 'inbound', m.business, evidenceQuery());
  expect(d.items[1].quantity).toBeNull();
  expect(d.summary.quantity_total).toBeNull();
  expect(d.summary.quantity_by_unit[0].known_quantity).toBe(5);
  expect(d.summary.quantity_complete).toBe(false);
});
test.each(['Hộp', null, ''])(
  'Mixed/unknown unit %s cannot produce overall total',
  unit => {
    const rows = m.scans().data;
    rows[1].unit = unit;
    const d = parseScans(
      m.scans(m.business, 'ACTIVE', {}, rows, m.summary(rows)),
      'inbound',
      m.business,
      evidenceQuery(),
    );
    expect(d.summary.quantity_total).toBeNull();
  },
);
test('Legacy cache v2 stays pending and v1 rejected', () => {
  const b = m.scans(),
    s = b.meta.summary;
  s.coverage = 'LEGACY_CACHE_PENDING_REFRESH';
  s.quantity_total = null;
  for (const k of [
    'quantity_complete',
    'missing_quantity_count',
    'unit_complete',
    'unknown_unit_entry_count',
    'mixed_units',
  ])
    s[k] = null;
  for (const g of s.quantity_by_unit)
    for (const k of [
      'quantity',
      'known_quantity',
      'entry_count',
      'missing_quantity_count',
    ])
      g[k] = null;
  expect(
    parseScans(b, 'inbound', m.business, evidenceQuery()).refreshRequired,
  ).toBe(true);
  b.meta.contract = 'p12-scan-evidence-v1';
  expect(() => parseScans(b, 'inbound', m.business, evidenceQuery())).toThrow();
});
test('Confirmed empty and quantity0 differ from missing', () => {
  for (const qty of [0, null]) {
    const rows = [{ ...m.scans().data[0], quantity: qty }];
    expect(
      parseScans(
        m.scans(m.business, 'ACTIVE', {}, rows, m.summary(rows)),
        'inbound',
        m.business,
        evidenceQuery(),
      ).summary.quantity_total,
    ).toBe(qty);
  }
  expect(
    parseScans(
      m.scans(m.business, 'ACTIVE', {}, [], m.summary([])),
      'inbound',
      m.business,
      evidenceQuery(),
    ).summary.quantity_total,
  ).toBe(0);
});
test('POSTED without posted_at never creates timestamp event', () => {
  const d = parseStockDetail(
    m.detail({
      ...m.stock(),
      status: 'POSTED',
      posted_at: null,
      submitted_at: '2026-10-11T02:00:00Z',
    }),
    'inbound',
    m.business,
    m.warehouse,
  );
  expect(d.p12.timeline.milestones.posted.availability).toBe('NOT_RECORDED');
  expect(d.p12.timeline.milestones.created.event_id).toBeNull();
  expect(d.p12.timeline.milestones.sent_to_web.occurred_at).toBeNull();
});
test('Timeline malformed isolated from valid detail', () => {
  const b = m.detail();
  b.data.p12.timeline.milestones.checked.occurred_at = b.data.created_at;
  const d = parseStockDetail(b, 'inbound', m.business, m.warehouse);
  expect(d.id).toBe(m.business);
  expect(d.p12.timeline).toBeNull();
  expect(d.p12.timelineError).toBeDefined();
});
test.each(['UNKNOWN', 'PROCESSING', 'FAILED'])(
  'P09 %s receipt never opens detail or recreates',
  state => {
    const r = parseWarrantyReceipt(
      m.receipt(state),
      m.journal().requestId,
      m.context(),
    );
    expect(r.readTarget).toBeNull();
    expect(r.receipt.may_create_new_request).toBe(state === 'FAILED');
  },
);
test('Successful P09 bridge still reads canonical current detail and masked PII', async () => {
  const f = fixture(),
    r = await f.api.receipt(m.journal());
  expect(f.transport.calls).toHaveLength(1);
  const d = await f.api.receiptDetail(r);
  expect(d.source.status).toBe('COMPLETED');
  expect(d.source.customer_name).toBeNull();
  expect(d.p12.timeline.milestones.posted.availability).toBe('NOT_APPLICABLE');
});
test('Receipt wrong canonical target/kho/old scope fails', async () => {
  const f = fixture(),
    r = await f.api.receipt(m.journal());
  setSession({ ...session(), authSessionId: m.id(99) });
  expect(() => f.api.receiptDetail(r)).toThrow();
  const b = m.receipt();
  b.meta.p12.read_target.query.warehouse_id = m.id(99);
  expect(() =>
    parseWarrantyReceipt(b, m.journal().requestId, m.context()),
  ).toThrow();
});
test('Stock date/sort/paging and P09 remain independent', () => {
  expect(() =>
    stockListQuery('outbound', { status: 'WAITING_APPROVAL' }),
  ).toThrow();
  expect(() => stockListQuery('inbound', { cursor: 'x' })).toThrow();
  expect(() => warrantyQuery('list', { page: 1, cursor: 'x' })).toThrow();
  expect(() => warrantyQuery('list', { date_from: '2026-10-10' })).toThrow();
  expect(() => warrantyQuery('list', { per_page: 101 })).toThrow();
  expect(() => stockListQuery('inbound', { per_page: 201 })).toThrow();
});
test('Detail tabs do not form a Back loop and keep query/scroll per page', async () => {
  const f = fixture();
  await f.controller.filters({ ...initialFilters(), source: 'inbound' });
  await f.controller.open('inbound', m.business);
  await f.controller.tab('products');
  f.controller.search('SKU-A');
  f.controller.scroll(m.business + ':products', 88);
  await f.controller.tab('events');
  await f.controller.tab('products');
  expect(f.controller.snapshot().query).toBe('SKU-A');
  expect(f.controller.snapshot().scroll[m.business + ':products']).toBe(88);
  expect(f.controller.back()).toBe(true);
  expect(f.controller.snapshot().panel).toBe(1);
  expect(f.controller.snapshot().filters.source).toBe('inbound');
});
test('Child files403 remains child error; parent stays read', async () => {
  const f = fixture();
  await f.controller.open('inbound', m.business);
  f.transport.control.fail[
    '/api/v1/mini-app/inbound-documents/' + m.business + '/attachments'
  ] = 403;
  await f.controller.tab('files');
  expect(f.controller.snapshot().detail.status).toBe('ready');
  expect(f.controller.snapshot().files.status).toBe('error');
});
test('Changed scan summary clears stale pages and permits refetch page1', async () => {
  const f = fixture();
  const path =
    '/api/v1/mini-app/inbound-documents/' + m.business + '/scan-entries';
  const rows = Array.from({ length: 21 }, (_, i) => ({
    ...m.scans().data[0],
    id: m.id(200 + i),
  }));
  f.transport.control.replace[path] = q =>
    m.response(
      m.scans(
        m.business,
        'ACTIVE',
        q,
        rows.slice((q.page - 1) * 20, q.page * 20),
        m.summary(rows),
      ),
    );
  await f.controller.open('inbound', m.business);
  await f.controller.tab('products');
  f.transport.control.replace[path] = q => {
    const b = m.scans(m.business, 'ACTIVE', q, rows.slice(20), m.summary(rows));
    b.meta.summary.quantity_total = 106;
    b.meta.summary.quantity_by_unit[0].quantity = 106;
    b.meta.summary.quantity_by_unit[0].known_quantity = 106;
    return m.response(b);
  };
  await f.controller.moreChild();
  expect(f.controller.snapshot().scans.code).toBe('SUMMARY_CHANGED_RELOAD');
  expect(f.controller.snapshot().scans.data).toBeUndefined();
});

test('More is a no-op before data and after the final page', async () => {
  const f = fixture();
  await f.controller.more();
  await f.controller.filters({ ...initialFilters(), source: 'inbound' });
  const count = f.transport.calls.length;
  await f.controller.more();
  await f.controller.open('inbound', m.business);
  await f.controller.moreChild();
  await f.controller.tab('products');
  const after = f.transport.calls.length;
  await f.controller.moreChild();
  expect(count).toBe(1);
  expect(f.transport.calls.length).toBe(after);
});
test('Concurrent list More reads page2 once and retains source total', async () => {
  const f = fixture(),
    path = '/api/v1/mini-app/inbound-documents';
  const rows = Array.from({ length: 41 }, (_, i) =>
    m.stock('inbound', 200 + i),
  );
  f.transport.control.replace[path] = q =>
    m.response(
      m.list('inbound', q, rows.slice((q.page - 1) * 20, q.page * 20), 41),
    );
  await f.controller.filters({ ...initialFilters(), source: 'inbound' });
  f.transport.control.hold[path] = true;
  const more = f.controller.more();
  await f.controller.more();
  expect(f.transport.calls.map(r => r.query.page)).toEqual([1, 2]);
  f.transport.control.hold[path]();
  await more;
  delete f.transport.control.hold[path];
  expect(f.controller.snapshot().list.data.items).toHaveLength(40);
  await f.controller.more();
  expect(f.controller.snapshot().list.data.items).toHaveLength(41);
  expect(f.controller.snapshot().list.data.paging.total).toBe(41);
  const after = f.transport.calls.length;
  await f.controller.more();
  expect(f.transport.calls).toHaveLength(after);
});
test('Changing offset total clears accumulated rows and retry starts page1', async () => {
  const f = fixture(),
    path = '/api/v1/mini-app/inbound-documents';
  f.transport.control.replace[path] = q =>
    m.response(
      m.list(
        'inbound',
        q,
        [m.stock('inbound', 100 + q.page)],
        q.page === 1 ? 41 : 42,
      ),
    );
  await f.controller.filters({ ...initialFilters(), source: 'inbound' });
  await f.controller.more();
  expect(f.controller.snapshot().list).toMatchObject({
    status: 'error',
    code: 'P12_PAGING_CHANGED_RELOAD',
  });
  expect(f.controller.snapshot().list.data).toBeUndefined();
  await f.controller.retry();
  expect(f.transport.calls.at(-1).query.page).toBe(1);
});
test('Repeated page cannot loop and masquerade as more documents', async () => {
  const f = fixture(),
    path = '/api/v1/mini-app/inbound-documents';
  f.transport.control.replace[path] = q =>
    m.response(m.list('inbound', q, [m.stock()], 41));
  await f.controller.filters({ ...initialFilters(), source: 'inbound' });
  await f.controller.more();
  expect(f.controller.snapshot().list.code).toBe('P12_PAGING_CHANGED_RELOAD');
  expect(f.controller.snapshot().list.data).toBeUndefined();
});
test('Final offset page with overlap cannot masquerade as a complete source', async () => {
  const f = fixture(),
    path = '/api/v1/mini-app/inbound-documents',
    rows = Array.from({ length: 20 }, (_, i) => m.stock('inbound', 100 + i));
  f.transport.control.replace[path] = q =>
    m.response(m.list('inbound', q, q.page === 1 ? rows : [rows[19]], 21));
  await f.controller.filters({ ...initialFilters(), source: 'inbound' });
  await f.controller.more();
  expect(f.controller.snapshot().list).toMatchObject({
    status: 'error',
    code: 'P12_PAGING_CHANGED_RELOAD',
  });
  expect(f.controller.snapshot().list.data).toBeUndefined();
});
test('Failed detail retry uses original canonical target even without detail data', async () => {
  const f = fixture(),
    path = '/api/v1/mini-app/inbound-documents/' + m.business;
  f.transport.control.fail[path] = 503;
  await f.controller.open('inbound', m.business);
  expect(f.controller.snapshot().detail.status).toBe('error');
  delete f.transport.control.fail[path];
  await f.controller.retry();
  expect(f.controller.snapshot().detail.data.id).toBe(m.business);
});
test('Opening detail while More is loading keeps loaded list and ignores late page', async () => {
  const f = fixture(),
    path = '/api/v1/mini-app/inbound-documents';
  f.transport.control.replace[path] = q =>
    m.response(m.list('inbound', q, [m.stock('inbound', 100 + q.page)], 41));
  await f.controller.filters({ ...initialFilters(), source: 'inbound' });
  f.controller.scroll('list', 222);
  f.transport.control.hold[path] = true;
  const more = f.controller.more();
  await f.controller.open('inbound', m.business);
  f.transport.control.hold[path]();
  await more;
  f.controller.back();
  expect(f.controller.snapshot().list.status).toBe('ready');
  expect(f.controller.snapshot().list.data.items).toHaveLength(1);
  expect(f.controller.snapshot().scroll.list).toBe(222);
});
test('Permission or session changes clear cached detail and form', async () => {
  const f = fixture();
  await f.controller.open('inbound', m.business);
  f.controller.draft({ supplierId: null, supplierName: '', note: 'Private' });
  f.setUser({ ...current(), permissions: [] });
  expect(f.controller.snapshot().detail.data).toBeUndefined();
  expect(f.controller.snapshot().createDraft).toBeUndefined();
});
test('Late callback from a changed parent cannot paint it back', async () => {
  const f = fixture(),
    path = '/api/v1/mini-app/inbound-documents/' + m.business;
  f.transport.control.hold[path] = true;
  const pending = f.controller.open('inbound', m.business);
  await f.controller.open('outbound', m.outbound);
  f.transport.control.hold[path]();
  await pending;
  expect(f.controller.snapshot().detail.data.id).toBe(m.outbound);
});
test('Supplier query GLOBAL and note1000 Unicode codepoints intact', async () => {
  const f = fixture();
  await f.api.suppliers();
  expect(f.transport.calls[0].query.warehouse_id).toBeUndefined();
  expect(p04Seed({ supplierId: null, note: '😀'.repeat(1000) }).note).toBe(
    '😀'.repeat(1000),
  );
  expect(() =>
    p04Seed({ supplierId: null, note: '😀'.repeat(1001) }),
  ).toThrow();
});

test('P12 date seed accepts only an explicit calendar day and adds no timestamp fields', () => {
  expect(p04Seed({supplierId:null,note:'Date',docDate:'2026-10-10'})).toEqual({supplierId:null,note:'Date',docDate:'2026-10-10'});
  for (const docDate of ['2026-02-31','2026-10-10T08:32:00+07:00','1999-12-31'])
    expect(()=>p04Seed({supplierId:null,note:'Date',docDate})).toThrow();
});
test('P12 transport exact marker permits read but cannot bypass P09 commands', async () => {
  const headers = {
    get: k =>
      k === 'X-WMS-Deployment-Tier'
        ? 'dev-test'
        : k === 'Content-Type'
        ? 'application/json'
        : undefined,
  };
  const fetchImpl = jest.fn(async url => ({
    ok: true,
    status: 200,
    headers,
    json: async () => ({ data: { build: { sha: P12_DEV.runtimeSha } } }),
    text: async () =>
      JSON.stringify(m.warranty('list', [m.warranty().data], { page: 1 })),
  }));
  const c = createApiClient({
    environment: ENVIRONMENTS['dev-test'],
    fetchImpl,
    log: silent,
  });
  await c.get('/api/v1/mini-app/warranty-cases', { p12Read: true });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  await expect(
    c.request({
      path: '/api/v1/mini-app/warranty-cases',
      method: 'POST',
      p12Read: true,
      body: {},
    }),
  ).rejects.toMatchObject({ code: 'P12_GET_ONLY' });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
test.each(['sha', 'tier'])(
  'Mismatch %s blocks P12 before authenticated read',
  async mode => {
    const fetchImpl = jest.fn(async () => ({
        ok: true,
        headers: {
          get: () => (mode === 'tier' ? 'customer-production' : 'dev-test'),
        },
        json: async () => ({
          data: {
            build: { sha: mode === 'sha' ? 'wrong' : P12_DEV.runtimeSha },
          },
        }),
      })),
      c = createApiClient({
        environment: ENVIRONMENTS['dev-test'],
        fetchImpl,
        log: silent,
      });
    await expect(
      c.get('/api/v1/mini-app/inbound-documents', { p12Read: true }),
    ).rejects.toMatchObject({ code: 'P12_RUNTIME_MISMATCH' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  },
);
test('Caller cannot inject Bearer or body into P12 GET', async () => {
  const fetchImpl = jest.fn(),
    c = createApiClient({
      environment: ENVIRONMENTS['dev-test'],
      fetchImpl,
      log: silent,
    });
  await expect(
    c.get('/api/v1/mini-app/inbound-documents', {
      p12Read: true,
      headers: { Authorization: 'Bearer arbitrary' },
    }),
  ).rejects.toMatchObject({ code: 'P12_GET_ONLY' });
  expect(fetchImpl).not.toHaveBeenCalled();
});
test('Live owner empty readiness [] retained; nonempty array rejected', () => {
  const row = m.warranty().data;
  row.p12.status.readiness = [];
  expect(parseP12Record(row, 'warranty').status.readiness).toEqual([]);
  row.p12.status.readiness = [true];
  expect(() => parseP12Record(row, 'warranty')).toThrow();
});
test('Warranty UI omits empty search, never submits null query string', async () => {
  const f = fixture();
  await f.controller.filters({ ...initialFilters(), source: 'warranty' });
  expect(f.transport.calls[0].query.search).toBeUndefined();
  expect(f.controller.snapshot().list.status).toBe('ready');
});
test('Mock binary preserves MIME/bytes, refuses wrong parent or missing nosniff', async () => {
  const f = fixture(),
    parent = await f.api.detail('inbound', m.business),
    file = m.attachment();
  const result = await f.api.download(parent, file);
  expect(result.blob.size).toBe(11);
  expect(result.mime).toBe('application/pdf');
  expect(() =>
    f.api.download(parent, { ...file, document_id: m.id(99) }),
  ).toThrow();
  f.transport.control.replace[
    '/api/v1/mini-app/document-attachments/' + m.fileId + '/download'
  ] = () =>
    new global.Response('%PDF-mock-1', {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'private, no-store',
      },
    });
  await expect(f.api.download(parent, file)).rejects.toMatchObject({
    code: 'INVALID_BINARY_HEADERS',
  });
});
