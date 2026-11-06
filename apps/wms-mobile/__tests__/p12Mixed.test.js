import {
  mixedQuery,
  parseMixed,
  compareMixed,
} from '../src/features/documents/p12/mixed';
import { createP12Service } from '../src/features/documents/p12/service';
import {
  createP12Controller,
  initialFilters,
} from '../src/features/documents/p12/controller';
import { setSession, clearSession } from '../src/auth/session';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import * as m from './fixtures/p12Protocol';
import * as mix from './fixtures/p12Mixed';
const origin = 'https://p12.invalid',
  scope = m.context;
const error = code => e => e.code === code;
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  setSession({
    userId: m.actor,
    authSessionId: m.session,
    activeWarehouseId: m.warehouse,
    accessToken: 'mock-only',
  });
});
afterEach(() => clearSession());
function fixture(rows = mix.defaultRows()) {
  let rights = scope().rights;
  const transport = m.mockTransport(),
    path = '/api/v1/mini-app/documents';
  transport.control.replace[path] = q =>
    m.response(mix.response(q, rows), 200, {
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Authorization',
    });
  const client = {
    async get(p, o) {
      const r = await transport.request(
        origin + p + '?' + new URLSearchParams(Object.entries(o.query ?? {})),
        {
          method: 'GET',
          headers: { Authorization: 'Bearer mock' },
          signal: o.signal,
        },
      );
      if (!r.ok) {
        const e = Error('Owner error');
        e.status = r.status;
        e.code = (await r.json()).error_code;
        throw e;
      }
      return {
        status: r.status,
        data: await r.json(),
        header: name => r.headers.get(name),
      };
    },
  };
  const api = createP12Service(
      () => ({
        user: {
          id: m.actor,
          auth_session_id: m.session,
          active_warehouse_id: m.warehouse,
          warehouse_context: { status: 'READY' },
          available_warehouses: [
            { warehouse_id: m.warehouse, status: 'ACTIVE' },
          ],
          permissions: rights,
        },
      }),
      { client, origin, revalidateUser: async () => ({id:m.actor,auth_session_id:m.session,active_warehouse_id:m.warehouse,warehouse_context:{status:'READY'},available_warehouses:[{warehouse_id:m.warehouse,status:'ACTIVE'}],permissions:rights}) },
    ),
    controller = createP12Controller(api);
  return {
    api,
    controller,
    transport,
    path,
    rights: value => {
      rights = value;
    },
  };
}
test('Mixed v2 builds bodyless aggregate query, paired dates, own cursor and limits', () => {
  expect(mixedQuery()).toMatchObject({
    source: 'ALL',
    sort: 'created_at_desc',
    per_page: 20,
    status: 'ALL',
    timezone: 'Asia/Ho_Chi_Minh',
  });
  expect(
    mixedQuery({ cursor: 'opaque+/?', status: 'WARRANTY:CHECKING' }).cursor,
  ).toBe('opaque+/?');
  for (const q of [
    { page: 1 },
    { per_page: 101 },
    { timezone: 'UTC' },
    { date_from: '2026-10-01' },
    { date_to: '2026-10-12' },
    { date_from: '2026-10-12', date_to: '2026-10-01' },
    { source: 'INBOUND', status: 'OUTBOUND:POSTED' },
    { status: 'SCANNING' },
    { cursor: '' },
    { q: 'a'.repeat(201) },
  ])
    expect(() => mixedQuery(q)).toThrow();
});
test('Mixed list preserves server common total, owner canonical identities and private warranty', () => {
  const b = mix.response(),
    p = parseMixed(b, {}, scope(), origin);
  expect(p.items.map(d => d.type)).toEqual(['outbound', 'inbound', 'warranty']);
  expect(p.paging.total).toBe(3);
  expect(p.paging.mode).toBe('KEYSET');
  expect(p.items[2].source.partner).toMatchObject({
    redacted: true,
    display_name: null,
  });
  expect(p.items[2].id).toBe(m.caseId);
  expect(p.items[0].p12.status.waiting_for_web).toBeNull();
  expect(p.mixed.options.some(o => o.value === 'WARRANTY:CHECKING')).toBe(true);
});

test('Mixed readiness accepts only empty [] reserialization, matching existing owner parser', () => {
  const b = mix.response();
  b.data.forEach(row => {
    row.p12.status.readiness = [];
  });
  const p = parseMixed(b, {}, scope(), origin);
  expect(p.items).toHaveLength(3);
  expect(p.items[0].p12.status.readiness).toEqual([]);
  for (const invalid of [
    [false],
    [{ can_post: true }],
    { can_post: true },
    null,
    '',
  ]) {
    const bad = mix.response();
    bad.data[0].p12.status.readiness = invalid;
    expect(() => parseMixed(bad, {}, scope(), origin)).toThrow();
  }
});
test.each(['asc', 'desc'])(
  'Equal timestamp/same UUID separate source keys and NULLS LAST in %s',
  sort => {
    const time = '2026-10-10T00:00:00.123456Z',
      rows = [
        mix.row('WARRANTY', 10, time),
        mix.row('OUTBOUND', 10, time),
        mix.row('INBOUND', 10, time),
        mix.row('WARRANTY', 99, null),
      ],
      q = { sort: 'created_at_' + sort };
    const p = parseMixed(mix.response(q, rows), q, scope(), origin);
    expect(p.items.map(d => d.source.row_key)).toEqual([
      'INBOUND:' + m.business,
      'OUTBOUND:' + m.business,
      'WARRANTY:' + m.business,
      'WARRANTY:' + m.id(99),
    ]);
    expect(p.items[3].createdAt).toBeNull();
    expect(compareMixed(p.items[0], p.items[1], q.sort)).toBeLessThan(0);
  },
);
const mutations = {
  contract: b => {
    b.meta.contract = 'p12-mixed-documents-v1';
  },
  warehouse: b => {
    b.meta.warehouse_id = m.id(999);
  },
  source: b => {
    b.meta.source = 'INBOUND';
  },
  snapshot: b => {
    b.meta.snapshot_consistent = true;
  },
  cursor: b => {
    b.meta.nextCursor = 'bad';
  },
  returned: b => {
    b.meta.returned_count = 99;
  },
  total: b => {
    b.meta.total = 999;
  },
  facet: b => {
    b.meta.source_facets.INBOUND.total = 999;
  },
  sort: b => {
    b.meta.sort = 'created_at_asc';
  },
  order: b => {
    b.data.reverse();
  },
  rowkey: b => {
    b.data[0].row_key = 'PN-number';
  },
  identity: b => {
    b.data[0].p12.identity.id = m.id(999);
  },
  target: b => {
    b.data[0].read_target.path =
      'https://evil.invalid/api/v1/mini-app/outbound-documents/' + m.outbound;
  },
  privacy: b => {
    b.data[2].partner.display_name = 'PRIVATE';
  },
  state: b => {
    b.data[0].display_status.label = 'Chờ duyệt';
  },
  time: b => {
    b.data[0].created_at = '2026-10-11 00:00:00';
  },
  quantity: b => {
    b.meta.count_unit = 'QUANTITY';
  },
  query: b => {
    b.meta.query.q_applied = true;
  },
  writes: b => {
    b.meta.write_operations = ['POST'];
  },
  failure: b => {
    b.meta.source_failure_policy = 'PARTIAL';
  },
};
test.each(Object.entries(mutations))(
  'Malformed mixed %s fails closed without source fallback',
  (name, mutate) => {
    const b = mix.response();
    mutate(b);
    expect(() => parseMixed(b, {}, scope(), origin)).toThrow();
  },
);
test('Denied source is null facet, not zero or private identity; authorized empty remains zero', () => {
  const b = mix.response({}, mix.defaultRows(), ['INBOUND', 'OUTBOUND']);
  const p = parseMixed(
    b,
    {},
    { ...scope(), rights: ['inbound.view', 'outbound.view'] },
    origin,
  );
  expect(p.mixed.facets.WARRANTY).toEqual({
    availability: 'DENIED',
    total: null,
  });
  expect(p.paging.total).toBe(2);
  expect(
    parseMixed(mix.response({}, []), {}, scope(), origin).paging.total,
  ).toBe(0);
});
test('All reads only aggregate and cursor pages; concurrent More once, Back retains complete source chain', async () => {
  const rows = Array.from({ length: 45 }, (_, i) =>
      mix.row(
        i % 3 === 0 ? 'WARRANTY' : i % 3 === 1 ? 'INBOUND' : 'OUTBOUND',
        200 + i,
        '2026-10-10T00:00:00.000000Z',
      ),
    ),
    f = fixture(rows);
  await f.controller.load();
  expect(f.controller.snapshot().list.data.items).toHaveLength(20);
  f.transport.control.hold[f.path] = true;
  const p = f.controller.more();
  await f.controller.more();
  expect(f.transport.calls).toHaveLength(2);
  f.transport.control.hold[f.path]();
  delete f.transport.control.hold[f.path];
  await p;
  expect(f.transport.calls[1].query.cursor).toBe('mock:cursor:20');
  expect(f.transport.calls[1].query.page).toBeUndefined();
  expect(f.controller.snapshot().list.data.items).toHaveLength(40);
  await f.controller.more();
  expect(f.controller.snapshot().list.data.items).toHaveLength(45);
  expect(f.controller.snapshot().list.data.paging.total).toBe(45);
  f.controller.scroll('list', 120);
  await f.controller.open('outbound', m.outbound);
  f.controller.back();
  expect(f.controller.snapshot().scroll.list).toBe(120);
  expect(f.controller.snapshot().list.data.items).toHaveLength(45);
  f.controller.dispose();
});
test('Search/status/date sort resets aggregate cursor, does not issue three old list reads', async () => {
  const f = fixture();
  await f.controller.load();
  await f.controller.filters({
    ...initialFilters(),
    q: 'PN',
    status: 'INBOUND:SCANNING',
    from: '2026-10-01',
    to: '2026-10-12',
    sort: 'asc',
  });
  expect(f.transport.calls.at(-1).query).toMatchObject({
    source: 'ALL',
    q: 'PN',
    status: 'INBOUND:SCANNING',
    date_from: '2026-10-01',
    date_to: '2026-10-12',
    sort: 'created_at_asc',
  });
  expect(f.transport.calls.at(-1).query.cursor).toBe('start');
  expect(f.transport.calls.every(c => c.path === f.path)).toBe(true);
  f.controller.dispose();
});
test.each([
  ['DOCUMENTS_CURSOR_EXPIRED', 410],
  ['DOCUMENTS_CURSOR_CONTEXT_CHANGED', 409],
  ['DOCUMENTS_CURSOR_INVALID', 422],
])(
  '%s clears page chain and retry starts at cursor=start',
  async (code, status) => {
    const rows = Array.from({ length: 25 }, (_, i) =>
        mix.row('INBOUND', 200 + i),
      ),
      f = fixture(rows);
    await f.controller.load();
    f.transport.control.replace[f.path] = () =>
      m.response({ success: false, error_code: code }, status);
    await f.controller.more();
    expect(f.controller.snapshot().list.data).toBeUndefined();
    f.transport.control.replace[f.path] = q =>
      m.response(mix.response(q, rows), 200, {
        'X-Content-Type-Options': 'nosniff',
        Vary: 'Authorization',
      });
    await f.controller.retry();
    expect(f.transport.calls.at(-1).query.cursor).toBe('start');
    expect(f.controller.snapshot().list.data.items).toHaveLength(20);
    f.controller.dispose();
  },
);
test('Disabled gate503 is explicit error, never empty or fallback groups', async () => {
  const f = fixture();
  f.transport.control.replace[f.path] = () =>
    m.response(
      { success: false, error_code: 'DOCUMENTS_AGGREGATE_DISABLED' },
      503,
    );
  await f.controller.load();
  expect(f.controller.snapshot().list).toMatchObject({
    status: 'error',
    code: 'DOCUMENTS_AGGREGATE_DISABLED',
  });
  expect(f.controller.snapshot().list.data).toBeUndefined();
  expect(f.transport.calls).toHaveLength(1);
  f.controller.dispose();
});
test('Context changes discard pending aggregate callback and original owner identity', async () => {
  const f = fixture();
  f.transport.control.hold[f.path] = true;
  const read = f.controller.load();
  f.rights(['inbound.view']);
  f.controller.snapshot();
  f.transport.control.hold[f.path]();
  await read;
  expect(f.controller.snapshot().list.data).toBeUndefined();
  f.controller.dispose();
});
