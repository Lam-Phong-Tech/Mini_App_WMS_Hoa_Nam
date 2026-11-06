import {
  createP09Service,
  p09Query,
  p09Scope,
  P09_BASE,
  type P09Receipt,
  type P09Attachment,
} from '../src/services/wms/p09Warranty';
import { P09_RELEASE } from '../src/config/p09Release';
import * as environment from '../src/config/env';
import {
  createP09CommandOwner,
  createP09Pager,
} from '../src/features/warranty/p09Controller';
import {
  harness,
  id,
  caseRow,
  context,
  fields,
  resolved,
  envelope,
  receipt,
  pageMeta,
  deferred,
} from './fixtures/p09Mock';
import { AppError } from '../src/errors/AppError';

const identity = { mode: 'IDENTIFIED' as const, resolved };
describe('P09 strict contract', () => {
  it('approved DEV lane can prepare without dispatch; production stays closed', () => {
    const request = jest.fn();
    expect(P09_RELEASE).toMatchObject({
      productionEnabled: false,
      linkedP03Enabled: false,
      status: 'DEV_CONNECTED_CANONICAL_OWNER_PRODUCTION_OFF',
    });
    const service = createP09Service(context, { client: { request } });
    expect(service.canWrite()).toBe(true);
    expect(service.prepareCreate(identity, fields).method).toBe('POST');
    expect(request).not.toHaveBeenCalled();
    const actual = environment.getCurrentEnvironment();
    const env = jest
      .spyOn(environment, 'getCurrentEnvironment')
      .mockReturnValue({
        ...actual,
        name: 'customer-production',
        expectedTier: 'customer-production',
      });
    expect(service.canWrite()).toBe(false);
    expect(() => service.prepareCreate(identity, fields)).toThrow();
    expect(request).not.toHaveBeenCalled();
    env.mockRestore();
  });
  it.each([0, NaN, 1])(
    'rejects invalid/expired session timestamp %s',
    expiresAtMs => {
      const c = context();
      expect(() =>
        p09Scope({ ...c, session: { ...c.session!, expiresAtMs } }),
      ).toThrow();
    },
  );
  it('requires verified actor/session/warehouse and real grants', () => {
    const c = context();
    expect(() =>
      p09Scope({ ...c, user: { ...c.user!, auth_session_id: id(99) } }),
    ).toThrow();
    expect(() =>
      p09Scope({ ...c, user: { ...c.user!, permissions: [] } }),
    ).toThrow();
    expect(() =>
      p09Scope(
        { ...c, user: { ...c.user!, permissions: ['warranty.view'] } },
        true,
      ),
    ).toThrow();
  });
  it.each([
    { page: 1, cursor: 'x' },
    { per_page: 101 },
    { per_page: 0 },
    { search: 'x'.repeat(201) },
    { keyword: 'x' },
    { date_from: '2026-10-10' },
    { sort: 'x' },
    { status: 'PENDING' },
    { page: 100001 },
    { cursor: '' },
  ])('rejects unsupported query %j', q => {
    expect(() => p09Query(id(3), q)).toThrow();
  });
  it('first keyset has no invented page; metadata owns total, cursor, offset', async () => {
    const h = harness(() =>
      envelope([caseRow()], {
        ...pageMeta,
        total: 77,
        hasMore: true,
        nextCursor: 'opaque',
      }),
    );
    expect(
      (
        await h.service.list({
          search: 'serial',
          status: 'ALL',
          sort: 'created_at_asc',
        })
      ).meta.total,
    ).toBe(77);
    expect(h.calls[0].query).toEqual({
      warehouse_id: id(3),
      search: 'serial',
      status: 'ALL',
      sort: 'created_at_asc',
    });
    expect(h.calls[0].body).toBeUndefined();
    await h.service.list({ cursor: 'opaque' });
    await h.service.list({ page: 3 });
    expect(h.calls[2].query?.page).toBe(3);
  });
  it('detail rejects another ID, old envelope and missing canonical version', async () => {
    for (const data of [
      caseRow(8),
      { ...caseRow(), version: null },
      { id: id(4), status: 'RECEIVED' },
    ])
      await expect(
        harness(() => envelope(data)).service.detail(id(4)),
      ).rejects.toThrow();
  });
  it('resolve exactly one identity; no search fallback', async () => {
    const h = harness(() => envelope(resolved));
    await h.service.resolve({ raw_code: 'serial' });
    expect(h.calls[0].body).toEqual({
      raw_code: 'serial',
      warehouse_id: id(3),
    });
    await expect(h.service.resolve({})).rejects.toThrow();
    await expect(
      h.service.resolve({ raw_code: 'a', item_id: id(5) }),
    ).rejects.toThrow();
  });
  it.each([false, null])(
    'eligibility %s does not switch to TEMP_ONLY',
    async eligible_for_warranty => {
      const h = harness(() => envelope({ ...resolved, eligible_for_warranty }));
      const r = await h.service.resolve({ raw_code: 'serial' });
      expect(() =>
        h.service.prepareCreate({ mode: 'IDENTIFIED', resolved: r }, fields),
      ).toThrow();
      expect(h.calls).toHaveLength(1);
    },
  );
  it('explicit TEMP_ONLY sends only approved fields and omits unused optional PII', () => {
    const h = harness();
    const c = h.service.prepareCreate(
      {
        mode: 'TEMP_ONLY',
        missing_code_reason: 'Lost',
        manual_product_description: 'Motor',
      },
      fields,
    );
    expect(c.body).toEqual({
      ...fields,
      missing_code_reason: 'Lost',
      manual_product_description: 'Motor',
    });
    expect(c.body).not.toHaveProperty('item_code');
    expect(() =>
      h.service.prepareCreate(identity, { ...fields, customer_name: '*' }),
    ).toThrow();
    expect(() =>
      h.service.prepareCreate(identity, {
        ...fields,
        customer_phone: '1123456789',
      }),
    ).toThrow();
    expect(() =>
      h.service.prepareCreate(identity, {
        ...fields,
        customer_name: 'x'.repeat(201),
      }),
    ).toThrow();
    expect(() =>
      h.service.prepareCreate(identity, {
        ...fields,
        description: 'x'.repeat(2001),
      }),
    ).toThrow();
    expect(() =>
      h.service.prepareCreate(identity, {
        ...fields,
        actor_id: id(1),
      } as never),
    ).toThrow();
  });
  it('blocks active duplicate and all linked P03 without stripping headers', () => {
    const h = harness();
    expect(() =>
      h.service.prepareCreate(
        {
          mode: 'IDENTIFIED',
          resolved: { ...resolved, active_warranty_exists: true },
        },
        fields,
      ),
    ).toThrow();
    expect(() =>
      h.service.prepareCreate(identity, fields, { draftId: id(7) }),
    ).toThrow('P09_P03_LINK_PENDING');
    expect(h.calls).toHaveLength(0);
  });
  it('command identity is unique, immutable and reviewed If-Match is retained', async () => {
    const h = harness(() =>
      envelope({ receipt: receipt('UNKNOWN', { operation: 'UPDATE' }) }),
    );
    const a = h.service.prepareUpdate(caseRow(), { note: 'Append' }),
      b = h.service.prepareUpdate(caseRow(), { note: 'Append' });
    expect(a.requestId).not.toBe(b.requestId);
    expect(a.headers).toEqual({
      'Idempotency-Key': a.idempotencyKey,
      'X-Request-ID': a.requestId,
      'If-Match': '"2"',
    });
    expect(Object.isFrozen(a.body)).toBe(true);
    expect(a.body).toEqual({ note: 'Append' });
    expect(a.body).not.toHaveProperty('description');
    await h.service.send(a);
    await h.service.send(a);
    expect(h.calls[0]).toEqual(h.calls[1]);
    await expect(
      h.service.send({ ...a, headers: { ...a.headers, 'If-Match': '"3"' } }),
    ).rejects.toThrow();
  });
  it('no missing version, masked PII update, RETURNED or closed case writes', () => {
    const h = harness();
    for (const c of [
      { ...caseRow(), version: 0 },
      { ...caseRow(), status: 'RETURNED' },
      { ...caseRow(), status: 'CANCELLED' },
    ])
      expect(() =>
        h.service.prepareUpdate(c as never, { note: 'x' }),
      ).toThrow();
    expect(() =>
      h.service.prepareUpdate(caseRow(), { status: 'RETURNED' } as never),
    ).toThrow();
    expect(() =>
      h.service.prepareUpdate(caseRow(), { customer_name: '***' } as never),
    ).toThrow();
  });
  it.each([
    'PROCESSING',
    'UNKNOWN',
    'FAILED',
    'SUCCEEDED',
  ] as P09Receipt['state'][])(
    'parses %s receipt without casting case',
    async state => {
      const h = harness(() => envelope({ receipt: receipt(state) }));
      const c = h.service.prepareCreate(identity, fields);
      const r = await h.service.send(c);
      expect(r.state).toBe(state);
      expect(r).not.toHaveProperty('customer_name');
    },
  );
  it('rejects mismatched request, operation or target', async () => {
    for (const extra of [
      { request_id: id(99) },
      { operation: 'CREATE' },
      { warranty_case_id: id(99) },
    ]) {
      const h = harness(() =>
        envelope({
          receipt: receipt('SUCCEEDED', { operation: 'UPDATE', ...extra }),
        }),
      );
      await expect(
        h.service.send(h.service.prepareUpdate(caseRow(), { note: 'x' })),
      ).rejects.toThrow();
    }
  });
  it('redaction and missing event actor/time are not errors or invented values', async () => {
    const h = harness(() =>
      envelope(
        [
          {
            event_id: id(8),
            warranty_case_id: id(4),
            message: null,
            message_redacted: true,
            from_status: 'RECEIVED',
            to_status: 'CHECKING',
          },
        ],
        pageMeta,
      ),
    );
    const r = await h.service.events(id(4));
    expect(r.items[0]).toMatchObject({
      message: null,
      message_redacted: true,
      event_at: null,
      actor: { user_id: null },
    });
  });
  it('component link is POSTED with correct canonical owner route', async () => {
    const row = {
      component_issue_document_id: id(9),
      warranty_case_id: id(4),
      status: 'POSTED',
      can_open: true,
      detail_url: P09_BASE + '/warranty-component-issues/' + id(9),
    };
    expect(
      (await harness(() => envelope([row], pageMeta)).service.components(id(4)))
        .meta.total,
    ).toBe(40);
    for (const change of [
      { status: 'DRAFT' },
      { warranty_case_id: id(5) },
      { detail_url: 'https://evil.invalid' },
    ])
      await expect(
        harness(() =>
          envelope([{ ...row, ...change }], pageMeta),
        ).service.components(id(4)),
      ).rejects.toThrow();
  });
  it('attachment binary requires ACTIVE, permission and pinned same-origin URL', async () => {
    const file = {
      attachment_id: id(9),
      warranty_case_id: id(4),
      status: 'ACTIVE',
      can_download: true,
      download_url: P09_BASE + '/warranty-attachments/' + id(9) + '/download',
    } as P09Attachment;
    const h = harness(() => new Blob(['offline']));
    await h.service.download(file, id(4));
    expect(h.calls[0]).toMatchObject({
      method: 'GET',
      path: file.download_url,
      responseType: 'blob',
    });
    for (const change of [
      { status: 'DELETED' },
      { can_download: false },
      { download_url: 'https://evil.invalid/file' },
      { warranty_case_id: id(5) },
    ])
      await expect(
        h.service.download({ ...file, ...change }, id(4)),
      ).rejects.toThrow();
    h.setContext({
      ...h.context(),
      user: {
        ...h.context().user!,
        permissions: ['warranty.view', 'documents.read'],
      },
    });
    await expect(h.service.download(file, id(4))).rejects.toMatchObject({
      status: 403,
    });
  });
});
describe('P09 operation owner', () => {
  it('latch blocks same-turn double submit before any await', async () => {
    const d = deferred<unknown>(),
      h = harness(() => d.promise),
      o = createP09CommandOwner(h.service);
    const prepare = jest.fn(() => h.service.prepareCreate(identity, fields));
    const a = o.confirm(prepare),
      b = o.confirm(prepare);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(o.snapshot().phase).toBe('sending');
    expect(h.calls).toHaveLength(0);
    await Promise.resolve();
    expect(h.calls).toHaveLength(1);
    d.resolve(envelope({ receipt: receipt('PROCESSING') }));
    await Promise.all([a, b]);
    expect(o.snapshot().phase).toBe('unknown');
  });
  it('timeout retains exact snapshot; only original request reconciliation permitted', async () => {
    const h = harness(o => {
      if (o.method === 'POST')
        throw new AppError({ kind: 'timeout', message: 'timeout' });
      return envelope({ receipt: receipt('UNKNOWN') });
    });
    const owner = createP09CommandOwner(h.service);
    await owner.confirm(() => h.service.prepareCreate(identity, fields));
    const c = owner.snapshot().command;
    expect(owner.snapshot().phase).toBe('unknown');
    await expect(
      owner.confirm(() => h.service.prepareCreate(identity, fields)),
    ).rejects.toThrow();
    await owner.reconcile();
    expect(h.calls[1]).toMatchObject({
      method: 'GET',
      path: P09_BASE + '/warranty-requests/' + c?.requestId,
    });
    expect(h.calls[1].headers).toBeUndefined();
    expect(owner.snapshot().command).toBe(c);
  });
  it('success hydrates only canonical receipt ID; newer detail remains valid', async () => {
    const h = harness(o =>
        o.method === 'POST'
          ? envelope({ receipt: receipt() })
          : envelope({ ...caseRow(), version: 5, status: 'REPAIRING' }),
      ),
      owner = createP09CommandOwner(h.service);
    await owner.confirm(() => h.service.prepareCreate(identity, fields));
    expect(owner.snapshot()).toMatchObject({
      phase: 'succeeded',
      detail: { version: 5, status: 'REPAIRING' },
    });
    expect(h.calls[1].path).toBe(P09_BASE + '/warranty-cases/' + id(4));
  });
  it('saved + hydrate failure retries GET only, never creates again', async () => {
    let fail = true;
    const h = harness(o => {
      if (o.method === 'POST') return envelope({ receipt: receipt() });
      if (fail) throw Error('offline');
      return envelope(caseRow());
    });
    const owner = createP09CommandOwner(h.service);
    await owner.confirm(() => h.service.prepareCreate(identity, fields));
    expect(owner.snapshot().phase).toBe('saved-unloaded');
    await expect(
      owner.confirm(() => h.service.prepareCreate(identity, fields)),
    ).rejects.toThrow();
    fail = false;
    await owner.retryDetail();
    expect(owner.snapshot().phase).toBe('succeeded');
    expect(h.calls.map(x => x.method)).toEqual(['POST', 'GET', 'GET']);
  });
  it.each([false, true])(
    'FAILED new operation only after policy %s and explicit confirm',
    async allowed => {
      const h = harness(() =>
          envelope({
            receipt: receipt('FAILED', {
              may_create_new_request: allowed,
              error_code: 'VALIDATION_FAILED',
            }),
          }),
        ),
        owner = createP09CommandOwner(h.service);
      await owner.confirm(() => h.service.prepareCreate(identity, fields));
      expect(owner.snapshot().phase).toBe('failed');
      const next = () =>
        owner.confirm(() => h.service.prepareCreate(identity, fields));
      if (allowed) {
        await next();
        expect(h.calls).toHaveLength(2);
      } else {
        await expect(next()).rejects.toThrow();
        expect(h.calls).toHaveLength(1);
      }
    },
  );
  it('stale update requires reviewed newer version under a new request; old snapshot unchanged', async () => {
    const h = harness(options =>
      envelope({
        receipt: receipt('FAILED', {
          request_id: options.headers?.['X-Request-ID'],
          operation: 'UPDATE',
          error_code: 'STALE_VERSION',
          may_create_new_request: true,
        }),
      }),
    );
    const owner = createP09CommandOwner(h.service);
    await owner.confirm(() =>
      h.service.prepareUpdate(caseRow(), { note: 'x' }),
    );
    const original = owner.snapshot().command;
    await expect(
      owner.confirm(() => h.service.prepareUpdate(caseRow(), { note: 'x' })),
    ).rejects.toThrow('P09_REVIEW_NEW_VERSION');
    await owner.confirm(() =>
      h.service.prepareUpdate({ ...caseRow(), version: 3 }, { note: 'x' }),
    );
    expect(h.calls).toHaveLength(2);
    expect(original?.headers['If-Match']).toBe('"2"');
    expect(h.calls[1].headers?.['If-Match']).toBe('"3"');
  });
  it.each(['logout', 'session', 'warehouse', 'permission'])(
    'late response after %s never hydrates/rebinds',
    async change => {
      const d = deferred<unknown>(),
        h = harness(() => d.promise),
        owner = createP09CommandOwner(h.service);
      const pending = owner.confirm(() =>
        h.service.prepareCreate(identity, fields),
      );
      await Promise.resolve();
      expect(h.calls).toHaveLength(1);
      const c = context();
      if (change === 'logout') h.setContext({});
      if (change === 'session') {
        h.setContext({
          ...c,
          session: { ...c.session!, authSessionId: id(99) },
          user: { ...c.user!, auth_session_id: id(99) },
        });
      }
      if (change === 'warehouse') {
        h.setContext({
          ...c,
          session: { ...c.session!, activeWarehouseId: id(99) },
        });
      }
      if (change === 'permission') {
        h.setContext({
          ...c,
          user: { ...c.user!, permissions: ['warranty.view'] },
        });
      }
      d.resolve(envelope({ receipt: receipt() }));
      await pending;
      expect(owner.snapshot()).toEqual({ phase: 'unknown' });
      await owner.reconcile();
      expect(h.calls).toHaveLength(1);
      await expect(
        owner.confirm(() => h.service.prepareCreate(identity, fields)),
      ).rejects.toThrow();
    },
  );
});
describe('independent pagers', () => {
  it('dedup, totals, Back scroll and next error retaining rows', async () => {
    let fail = false;
    const load = jest.fn(async p => {
      if (fail) throw Error('offline');
      return {
        items: [caseRow()],
        meta: {
          ...pageMeta,
          total: 88,
          hasMore: true,
          nextCursor: p.cursor ? 'next' : 'opaque',
          pagination: 'KEYSET' as const,
        },
      };
    });
    const pager = createP09Pager(
      load,
      r => r.warranty_case_id,
      () => 'scope',
    );
    await pager.load();
    pager.scroll(321);
    await pager.load(true);
    expect(pager.snapshot()).toMatchObject({
      scroll: 321,
      meta: { total: 88 },
    });
    expect(pager.snapshot().items).toHaveLength(1);
    expect(load.mock.calls[1][0]).toEqual({ cursor: 'opaque' });
    fail = true;
    await pager.load(true);
    expect(pager.snapshot().items).toHaveLength(1);
    expect(pager.snapshot().error).toBeDefined();
  });
  it('scope/filter reset ignores older response and resets scroll', async () => {
    let key = 'a';
    const d = deferred<any>();
    const pager = createP09Pager<ReturnType<typeof caseRow>>(
      () =>
        key === 'a'
          ? d.promise
          : Promise.resolve({
              items: [caseRow(5)],
              meta: { ...pageMeta, pagination: 'KEYSET' as const },
            }),
      r => r.warranty_case_id,
      () => key,
    );
    const pending = pager.load();
    pager.scroll(99);
    key = 'b';
    await pager.load();
    d.resolve({ items: [caseRow()], meta: pageMeta });
    await pending;
    expect(pager.snapshot().items[0].warranty_case_id).toBe(id(5));
    expect(pager.snapshot().scroll).toBe(0);
  });
  it('events/files/components use independent cursors', async () => {
    const loads = [0, 1, 2].map(n =>
      jest.fn(async (_p: unknown) => ({
        items: [{ id: n }],
        meta: {
          ...pageMeta,
          hasMore: true,
          nextCursor: 'c' + n,
          pagination: 'KEYSET' as const,
        },
      })),
    );
    const ps = loads.map(l =>
      createP09Pager(
        l,
        r => String(r.id),
        () => 'scope',
      ),
    );
    for (const p of ps) {
      await p.load();
      await p.load(true);
    }
    loads.forEach((l, n) =>
      expect(l.mock.calls[1][0]).toEqual({ cursor: 'c' + n }),
    );
  });
});

describe('P09 unused optional search', () => {
  it.each(['', '   '])(
    'omits blank search %j while preserving status/sort/paging',
    search => {
      expect(
        p09Query(id(3), {
          search,
          status: 'CHECKING',
          sort: 'created_at_desc',
          page: 2,
        }),
      ).toEqual({
        warehouse_id: id(3),
        status: 'CHECKING',
        sort: 'created_at_desc',
        page: 2,
      });
    },
  );
  it('retains the entered nonblank query and rejects null instead of inventing a query', () => {
    expect(p09Query(id(3), { search: ' WC-001 ' })).toEqual({
      warehouse_id: id(3),
      search: ' WC-001 ',
    });
    expect(() => p09Query(id(3), { search: null })).toThrow('P09_SEARCH');
  });
});

it('event actor display metadata rejects an object rather than rendering an unverified name', async () => {
  const h = harness(() =>
    envelope(
      [
        {
          event_id: id(8),
          warranty_case_id: id(4),
          actor: { user_id: id(1), display_name: { bad: true } },
          event_at: null,
          from_status: null,
          to_status: null,
          message: null,
          message_redacted: false,
        },
      ],
      { ...pageMeta, total: 1 },
    ),
  );
  await expect(h.service.events(id(4))).rejects.toThrow();
});
