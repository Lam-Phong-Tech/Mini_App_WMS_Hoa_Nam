import { createP12Service } from '../src/features/documents/p12/service';
import { createP12Controller } from '../src/features/documents/p12/controller';
import {
  parseScans,
  evidenceQuery,
  warrantyQuery,
  P12_RELEASE,
} from '../src/features/documents/p12/contract';
import { P12_DEV, p12ReadPath } from '../src/config/p12Release';
import { createApiClient } from '../src/api/client';
import { ENVIRONMENTS } from '../src/config/env';
import { setSession, clearSession } from '../src/auth/session';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import * as m from './fixtures/p12Protocol';
const user = () => ({
  id: m.actor,
  auth_session_id: m.session,
  active_warehouse_id: m.warehouse,
  warehouse_context: { status: 'READY' },
  available_warehouses: [{ warehouse_id: m.warehouse, status: 'ACTIVE' }],
  permissions: m.context().rights,
});
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    userId: m.actor,
    authSessionId: m.session,
    activeWarehouseId: m.warehouse,
    accessToken: 'offline-only',
  });
});
afterEach(() => clearSession());
function fixture() {
  const transport = m.mockTransport(),
    client = {
      async get(path, options) {
        const r = await transport.request(
          'https://p12.invalid' +
            path +
            '?' +
            new URLSearchParams(Object.entries(options.query ?? {})),
          {
            method: 'GET',
            signal: options.signal,
            headers: { Authorization: 'Bearer offline' },
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
          header: name => r.headers.get(name),
        };
      },
    };
  const api = createP12Service(() => ({ user: user() }), {
    client,
    origin: 'https://p12.invalid',
  });
  return { transport, api, controller: createP12Controller(api) };
}
function legacy(body) {
  const s = body.meta.summary;
  s.coverage = 'LEGACY_CACHE_PENDING_REFRESH';
  for (const key of [
    'quantity_total',
    'quantity_complete',
    'missing_quantity_count',
    'unit_complete',
    'unknown_unit_entry_count',
    'mixed_units',
  ])
    s[key] = null;
  for (const g of s.quantity_by_unit)
    for (const key of [
      'quantity',
      'known_quantity',
      'entry_count',
      'missing_quantity_count',
    ])
      g[key] = null;
  return body;
}
test('owner source and verified runtime retain production OFF and GET-only aggregate', () => {
  expect(P12_RELEASE.commit).toBe('eaa8fd2fd4ffb4013e6b72da0fa1384e80ef0154');
  expect(P12_RELEASE.fullActivation).toBe(false);
  expect(P12_DEV.runtimeSha).toBe('49bceda27ebc6a2de83d43342f8216860b3d708a');
  expect(P12_DEV.productionEnabled).toBe(false);
  expect(p12ReadPath('GET', '/api/v1/mini-app/documents')).toBe(true);
  expect(p12ReadPath('POST', '/api/v1/mini-app/documents')).toBe(false);
});
const summaryFields = [
  'scope',
  'entry_count',
  'sku_count',
  'item_count',
  'resolved_serial_count',
  'quantity_total',
  'quantity_by_unit',
  'quantity_complete',
  'missing_quantity_count',
  'unit_complete',
  'unknown_unit_entry_count',
  'mixed_units',
  'coverage',
];
for (const type of ['inbound', 'outbound']) {
  const parent = type === 'inbound' ? m.business : m.outbound;
  test.each(summaryFields)(type + ' CURRENT_QUERY requires %s', field => {
    const b = m.scans(parent);
    delete b.meta.summary[field];
    expect(() => parseScans(b, type, parent, evidenceQuery())).toThrow();
  });
  test.each([
    'unit',
    'quantity',
    'known_quantity',
    'entry_count',
    'missing_quantity_count',
  ])(type + ' group requires %s', field => {
    const b = m.scans(parent);
    delete b.meta.summary.quantity_by_unit[0][field];
    expect(() => parseScans(b, type, parent, evidenceQuery())).toThrow();
  });
  test.each([
    'quantity_total',
    'quantity_complete',
    'missing_quantity_count',
    'unit_complete',
    'unknown_unit_entry_count',
    'mixed_units',
  ])(type + ' legacy requires explicit null %s', field => {
    for (const value of [undefined, 0, true]) {
      const b = legacy(m.scans(parent));
      if (value === undefined) delete b.meta.summary[field];
      else b.meta.summary[field] = value;
      expect(() => parseScans(b, type, parent, evidenceQuery())).toThrow();
    }
  });
  test.each([
    'quantity',
    'known_quantity',
    'entry_count',
    'missing_quantity_count',
  ])(type + ' legacy group requires explicit null %s', field => {
    for (const value of [undefined, 0]) {
      const b = legacy(m.scans(parent));
      if (value === undefined) delete b.meta.summary.quantity_by_unit[0][field];
      else b.meta.summary.quantity_by_unit[0][field] = value;
      expect(() => parseScans(b, type, parent, evidenceQuery())).toThrow();
    }
  });
  test.each(
    Object.entries({
      contract: 'p12-scan-evidence-v1',
      document_id: m.id(999),
      scan_status: 'REMOVED',
      sort: { created_at: 'asc', id: 'asc' },
      pagination_mode: 'cursor',
      snapshot_consistent: true,
    }),
  )(type + ' reserved metadata %s cannot be stale', (field, value) => {
    const b = m.scans(parent);
    b.meta[field] = value;
    expect(() => parseScans(b, type, parent, evidenceQuery())).toThrow();
  });
  test.each([403, 404])(
    type + ' cached scans cannot survive owner %s, parent remains read',
    async status => {
      const f = fixture(),
        path = `/api/v1/mini-app/${type}-documents/${parent}/scan-entries`,
        rows = Array.from({ length: 21 }, (_, i) => ({
          ...m.scans(parent).data[0],
          id: m.id(200 + i),
        }));
      f.transport.control.replace[path] = q =>
        m.response(
          m.scans(
            parent,
            q.status,
            q,
            rows.slice((q.page - 1) * 20, q.page * 20),
            m.summary(rows),
          ),
        );
      await f.controller.open(type, parent);
      await f.controller.tab('products');
      expect(f.controller.snapshot().scans.data.items).toHaveLength(20);
      f.transport.control.fail[path] = status;
      await f.controller.moreChild();
      expect(f.controller.snapshot().scans.status).toBe('error');
      expect(f.controller.snapshot().scans.data).toBeUndefined();
      expect(f.controller.snapshot().detail.status).toBe('ready');
      f.controller.dispose();
    },
  );
  test(
    type + ' invalid append metadata cannot keep successful cached evidence',
    async () => {
      for (const mutate of [
        b => {
          b.meta.document_id = m.id(999);
        },
        b => {
          delete b.meta.summary.unit_complete;
        },
      ]) {
        const f = fixture(),
          path = `/api/v1/mini-app/${type}-documents/${parent}/scan-entries`,
          rows = Array.from({ length: 21 }, (_, i) => ({
            ...m.scans(parent).data[0],
            id: m.id(200 + i),
          }));
        f.transport.control.replace[path] = q =>
          m.response(
            m.scans(
              parent,
              q.status,
              q,
              rows.slice((q.page - 1) * 20, q.page * 20),
              m.summary(rows),
            ),
          );
        await f.controller.open(type, parent);
        await f.controller.tab('products');
        f.transport.control.replace[path] = q => {
          const b = m.scans(
            parent,
            q.status,
            q,
            rows.slice(20),
            m.summary(rows),
          );
          mutate(b);
          return m.response(b);
        };
        await f.controller.moreChild();
        expect(f.controller.snapshot().scans.status).toBe('error');
        expect(f.controller.snapshot().scans.data).toBeUndefined();
        f.controller.dispose();
      }
    },
  );
  test(
    type +
      ' cached zero becomes nullable pending; ETag and exact query metadata retained',
    async () => {
      const f = fixture(),
        path = `/api/v1/mini-app/${type}-documents/${parent}/scan-entries`;
      f.transport.control.replace[path] = q =>
        m.response(
          legacy(m.scans(parent, q.status, q, [], m.summary([]))),
          200,
          { ETag: '"17"' },
        );
      const p = await f.api.scans(type, parent);
      expect(p.summary.quantity_total).toBeNull();
      expect(p.refreshRequired).toBe(true);
      expect(p.responseHeaders.etag).toBe('"17"');
      expect(p.meta.document_id).toBe(parent);
      expect(p.paging.page).toBe(1);
      f.controller.dispose();
    },
  );
}
test.each([{}, [], null, undefined])(
  'P12 marker rejects explicit GET body %p before health/authenticated fetch',
  async body => {
    const fetchImpl = jest.fn(),
      client = createApiClient({
        environment: ENVIRONMENTS['dev-test'],
        fetchImpl,
        log: { debug() {}, info() {}, warn() {}, error() {} },
      });
    await expect(
      client.get('/api/v1/mini-app/inbound-documents', { p12Read: true, body }),
    ).rejects.toMatchObject({ code: 'P12_GET_ONLY' });
    expect(fetchImpl).not.toHaveBeenCalled();
  },
);
test.each(['', '  '])(
  'P09 search %p omitted instead of null; nonblank stays raw',
  async search => {
    expect(warrantyQuery('list', { search }).search).toBeUndefined();
    expect(warrantyQuery('list', { search: '  SN-1  ' }).search).toBe(
      '  SN-1  ',
    );
    const f = fixture();
    await f.api.list('warranty', { search });
    expect(f.transport.calls[0].query.search).toBeUndefined();
    f.controller.dispose();
  },
);
test('Binary known size mismatch rejected; null size remains source unknown', async () => {
  const f = fixture(),
    parent = await f.api.detail('inbound', m.business),
    file = m.attachment();
  await expect(
    f.api.download(parent, { ...file, file_size_bytes: 999 }),
  ).rejects.toMatchObject({ code: 'BINARY_SIZE_MISMATCH' });
  expect(
    (await f.api.download(parent, { ...file, file_size_bytes: null })).blob
      .size,
  ).toBe(11);
  f.controller.dispose();
});
