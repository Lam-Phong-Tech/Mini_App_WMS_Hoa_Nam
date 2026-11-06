// Isolated HTTP contract tests. Not evidence of live DEV/device success.
import {
  createP05Service,
  validateP05Frozen,
} from '../src/services/wms/p05Outbound';
import { createP05NativeOwner } from '../src/features/outbound/p05NativeOwner';
import { createMemoryBackend, createStorage } from '../src/storage/storage';
import type { RequestOptions } from '../src/api/client';
import type { Session } from '../src/auth/session';
import type {
  FrozenRequest,
  Source,
} from '../src/features/outbound/linked/types';
import { P05ApiError } from '../src/features/outbound/linked/p05-contract';
import { p05ExceptionView } from '../src/features/outbound/P05Exceptions';
import * as queries from '../src/services/wms/queries';
jest.mock('../src/auth/serverClock', () => ({
  serverNow: () => Date.parse('2026-10-08T10:00:00Z'),
}));
const id = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  scope = { actorId: id(1), authSessionId: id(2), warehouseId: id(3) };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const source: Source = {
  source_kind: 'WMS_OUTBOUND_DOCUMENT',
  document_id: id(4),
  source_document_id: id(4),
  source_version: 7,
  doc_no: 'PX-NATIVE-TEST',
  warehouse_id: id(3),
  outbound_request_id: id(5),
  status: 'DRAFT',
  planned_total_qty: 2,
  lines: [
    {
      line_id: id(6),
      sku_id: id(7),
      sku_code: 'A',
      sku_name: 'Máy A',
      planned_qty: 1,
      scanned_qty: 0,
    },
    {
      line_id: id(8),
      sku_id: id(9),
      sku_code: 'B',
      sku_name: 'Máy B',
      planned_qty: 1,
      scanned_qty: 0,
    },
  ],
  recipient: {
    name: 'Test',
    phone: null,
    address: 'Địa chỉ văn bản',
    agency_id: null,
  },
  note: 'Note',
  created_at: '2026-10-08 03:00:00+00',
  expires_at: '2026-10-15T03:00:00Z',
  address_format: 'TEXT',
  address_dataset_version: null,
};
function fixture() {
  let session: Session = {
    accessToken: 'TEST-IN-MEMORY',
    userId: scope.actorId,
    authSessionId: scope.authSessionId,
    activeWarehouseId: scope.warehouseId,
  };
  const storage = createStorage(createMemoryBackend()),
    calls: RequestOptions[] = [],
    drafts = new Map<string, Record<string, unknown>>(),
    receipts = new Map<string, Record<string, unknown>>();
  const options = {
    lost: '',
    fail: '',
    failSaveOnly: false,
    eligible: true,
    wrongSku: false,
    posted: false,
    currentVersion: 0,
    unknown: false,
    permissions: true,
    sources: clone([source]),
    etag: 'absent' as 'absent' | 'weak' | 'wrong',
  };
  const env = (
    data: unknown,
    contract = 'mini-app-p05-v1',
    meta: Record<string, unknown> = {},
  ) => ({ success: true, data, meta: { contract, ...meta } });
  const client = {
    async request<T>(r: RequestOptions) {
      calls.push(clone(r));
      const path = r.path,
        body = r.body as Record<string, unknown>,
        headers = r.headers ?? {},
        query = r.query ?? {};
      let data: unknown,
        status = 200;
      if (
        options.fail &&
        (!options.failSaveOnly || r.method === 'PUT') &&
        r.method !== 'GET' &&
        r.method !== undefined
      ) {
        const code = options.fail;
        options.fail = '';
        throw new P05ApiError(code, code, {
          status: code.includes('STALE') ? 412 : 409,
        });
      }
      if (path.endsWith('/context'))
        data = env({
          actor_id: scope.actorId,
          auth_session_id: scope.authSessionId,
          active_warehouse_id: scope.warehouseId,
          warehouse_context: { status: 'READY' },
          available_warehouses: [
            {
              warehouse_id: scope.warehouseId,
              name: 'Kho test',
              status: 'ACTIVE',
            },
          ],
          permissions: {
            read: true,
            save: options.permissions,
            cancel: options.permissions,
            record: options.permissions,
          },
          record: { reconcile_mode: 'P03_LINKED' },
          address_contract: {
            format: 'TEXT',
            structured_codes_supported: false,
          },
        });
      else if (path.endsWith('/sources')) {
        const page = Number(query.page),
          per = Number(query.per_page),
          rows = options.sources.filter(s =>
            s.doc_no.includes(String(query.q ?? '')),
          );
        data = env(
          rows.slice((page - 1) * per, page * per),
          'mini-app-p05-v1',
          {
            page,
            per_page: per,
            total: rows.length,
            last_page: Math.max(1, Math.ceil(rows.length / per)),
            warehouse_id: scope.warehouseId,
            source_kind: 'WMS_OUTBOUND_DOCUMENT',
          },
        );
      } else if (path.includes('/sources/'))
        data = env(
          options.sources.find(s => path.endsWith(s.source_document_id)),
        );
      else if (path.endsWith('/resolve-code'))
        data = {
          success: true,
          data: {
            eligible_for_outbound: options.eligible,
            sku_type: 'PRODUCT',
            sku_id: options.wrongSku
              ? id(90)
              : body.raw_code === 'B'
              ? id(9)
              : id(7),
            sku_code: body.raw_code === 'B' ? 'B' : 'A',
            item_id: body.raw_code === 'B' ? id(11) : id(10),
            available_qty: 10,
          },
        };
      else if (path.includes('/requests/')) {
        const key = path.split('/').at(-1)!,
          d = drafts.get(path.split('/')[5]!)!,
          historic = receipts.get(key);
        data = env(
          historic && !options.unknown
            ? {
                outcome: 'SUCCEEDED',
                receipt: historic.receipt,
                document: {
                  ...d,
                  version: options.currentVersion || d.version,
                },
                response: historic.response,
                retry: 'NONE',
                new_document_allowed: false,
                cancel_allowed: d.status === 'DRAFT',
              }
            : {
                outcome: 'UNKNOWN',
                request_id: key,
                document_id: path.split('/')[5],
                scan_session_id: r.query?.scan_session_id,
                warehouse_id: id(3),
                operation: 'OUTBOUND',
                command: r.query?.command,
                receipt: null,
                document: d ?? null,
                response: null,
                retry: 'SAME_REQUEST_ONLY',
                new_document_allowed: false,
                cancel_allowed: false,
              },
          'mini-app-p03-v1',
        );
      } else if (path.includes('/outbound/documents/'))
        data = env({
          document: {
            id: id(4),
            src_warehouse_id: id(3),
            version: 12,
            status: options.posted ? 'POSTED' : 'SCANNING',
          },
          status: options.posted ? 'POSTED' : 'SCANNING',
          posted: options.posted,
          history: [],
          observed_at: '2026-10-08T12:00:00Z',
        });
      else if ((r.method ?? 'GET') === 'GET')
        data = env(drafts.get(path.split('/').at(-1)!), 'mini-app-p03-v1');
      else {
        const command =
            r.method === 'PUT'
              ? 'SAVE'
              : path.endsWith('/cancel')
              ? 'CANCEL'
              : 'RECORD',
          draftId =
            command === 'RECORD' ? headers['X-Draft-ID'] : path.split('/')[5]!,
          key = headers['Idempotency-Key']!,
          cached = receipts.get(key);
        if (cached) data = cached.response;
        else {
          let d = clone(drafts.get(draftId) ?? {});
          const version = Number(d.version ?? 0) + 1;
          if (command === 'SAVE') {
            d = {
              document_id: draftId,
              document_kind: 'STAGING_DRAFT',
              scan_session_id: body.scan_session_id,
              auth_session_id: id(2),
              warehouse_id: id(3),
              operation: 'OUTBOUND',
              version,
              status: 'DRAFT',
              codes: body.codes,
              form: body.form,
              title: body.title,
              codes_validated: false,
              stock_effect: 'NONE',
              business_document_id: null,
            };
            status = version === 1 ? 201 : 200;
          } else {
            d = {
              ...d,
              version,
              status: command === 'RECORD' ? 'RECORDED' : 'CANCELLED',
              business_document_id: command === 'RECORD' ? id(4) : null,
            };
          }
          drafts.set(draftId, clone(d));
          const receipt = {
            request_id: key,
            document_id: draftId,
            scan_session_id: d.scan_session_id,
            warehouse_id: id(3),
            operation: 'OUTBOUND',
            command,
            outcome: 'SUCCEEDED',
            version,
            committed_at: '2026-10-08T11:00:00Z',
          };
          data =
            command === 'RECORD'
              ? env(
                  {
                    document_id: id(4),
                    source_document_id: id(4),
                    source_version: body.source_version,
                    src_warehouse_id: id(3),
                    version: 8,
                    status: 'SCANNING',
                    record_status: 'RECORDED',
                    posted: false,
                    source_created: false,
                    wms_document_created: false,
                    movement_created: false,
                    stock_effect: 'NONE',
                    expected_total_qty: 2,
                    scanned_total_qty: 2,
                  },
                  'mini-app-p05-v1',
                  { p03_draft: { document: d, receipt } },
                )
              : env({ document: d, receipt }, 'mini-app-p03-v1');
          receipts.set(key, { receipt, response: clone(data) });
        }
        if (options.lost === command) {
          options.lost = '';
          throw new P05ApiError('NETWORK_UNKNOWN', 'Lost response', {
            unknown: true,
          });
        }
      }
      const version =
        (data as any)?.data?.document?.version ?? (data as any)?.data?.version;
      const etag =
        options.etag === 'absent' || !version
          ? undefined
          : `W/"${version + (options.etag === 'wrong' ? 1 : 0)}"`;
      return {
        status,
        data: clone(data) as T,
        header: (name: string) =>
          name.toLowerCase() === 'etag' ? etag : undefined,
      };
    },
  };
  const service = createP05Service(client, () => session),
    make = () =>
      createP05NativeOwner({
        storage,
        service,
        getScope: () => ({
          actorId: session.userId!,
          authSessionId: session.authSessionId!,
          warehouseId: session.activeWarehouseId!,
        }),
        onChange: () => undefined,
      }),
    flow = make();
  return {
    flow,
    make,
    service,
    client,
    calls,
    drafts,
    options,
    storage,
    setSession: (next: Session) => {
      session = next;
    },
  };
}
async function selected() {
  const f = fixture();
  f.flow.start();
  expect(await f.flow.initialize()).toBe(true);
  expect(await f.flow.selectSource(id(4))).toBe(true);
  return f;
}
async function ready() {
  const f = await selected();
  f.flow.next();
  expect(await f.flow.bindScan()('A')).toBe('valid');
  expect(await f.flow.bindScan()('B')).toBe('valid');
  f.flow.next();
  return f;
}

test('P17 linked rejection/back retains source/version/codes/view with no SAVE or mode switch', async () => {
  const t=await selected(); t.flow.next();
  await t.flow.bindScan()('A');
  t.flow.setViewState({manual: true,rawInput:'HELD',filter:'invalid',scroll:{2:90}});
  const before=t.flow.snapshot(), calls=t.calls.length;
  jest.spyOn(t.service,'resolve').mockResolvedValue({eligible_for_outbound:false,
    eligibility_code:'ITEM_ALREADY_MATCHED',sku_name:'Máy ✓',item_unique:'ITEM-HELD',
    reservation:{redacted:false,can_open:true,document_id:id(99),doc_no:'PX-HOLDER'}});
  expect(await t.flow.bindScan()('HELD')).toBe('invalid');
  const observed=t.flow.snapshot();
  expect(p05ExceptionView(observed)).toMatchObject({panel:'P17.S02',product:{code:'ITEM-HELD',name:'Máy ✓'},relatedDocument:{kind:'visible',documentId:id(99)}});
  const saved=JSON.parse(t.storage.getString(t.storage.keys().find(k=>k.startsWith('hn-p05-linked-v1:'))!)!);
  expect(saved.state.rejected).toBeUndefined();
  expect(t.flow.dismissRejected(observed.rejected!.eventId,t.flow.exceptionScope()!)).toBe(true);
  const after=t.flow.snapshot();
  for(const key of ['mode','draftId','scanSessionId','draftVersion','source','form','accepted','nativeView'] as const)
    expect(after[key]).toEqual(before[key]);
  expect(t.calls.length).toBe(calls);
});

test('P17 linked confirmed not-found is rejected; resolver timeout remains its separate check protocol', async () => {
  const t=await selected(); t.flow.next();
  const resolver=jest.spyOn(t.service,'resolve').mockRejectedValueOnce(new P05ApiError('PHYSICAL_CODE_NOT_FOUND','NOT FOUND',{status:422}));
  expect(await t.flow.bindScan()('MISSING')).toBe('invalid');
  const rejected=t.flow.snapshot();
  expect(rejected.attempts.at(-1)?.kind).toBe('invalid');
  expect(p05ExceptionView(rejected)?.panel).toBe('P17.S02');
  t.flow.dismissRejected(rejected.rejected!.eventId,t.flow.exceptionScope()!);
  resolver.mockRejectedValueOnce(new P05ApiError('TIMEOUT','NO RESULT',{unknown:true}));
  expect(await t.flow.bindScan()('UNCERTAIN')).toBe(false);
  const after=t.flow.snapshot();
  expect(after.rejected).toBeNull();
  expect(after.pending).toBeNull();
  expect(after.ownerChecks?.at(-1)?.outcome).toBe('UNKNOWN');
  expect(p05ExceptionView(after)).toBeNull();
});

test.each(['SAVE','RECORD','CANCEL'] as const)('P17 linked %s UNKNOWN checks original GET identity/source without writing or rekeying', async command => {
  const t=command==='RECORD' ? await ready() : await selected();
  t.options.lost=command;
  if(command==='SAVE'){t.flow.next(); await t.flow.bindScan()('A');}
  else if(command==='RECORD') await t.flow.send();
  else await t.flow.cancel();
  const before=t.flow.snapshot(),request=JSON.stringify(before.pending);
  expect(p05ExceptionView(before)).toMatchObject({panel:'P17.S04',phase:'unknown',identity:{operationKey:before.pending!.key,draftId:before.draftId,scanSessionId:before.scanSessionId,version:before.draftVersion,command}});
  const calls=t.calls.length;
  t.options.unknown=true;
  expect(await t.flow.check()).toBe(false);
  expect(JSON.stringify(t.flow.snapshot().pending)).toBe(request);
  expect(t.calls.slice(calls)).toHaveLength(1);
  expect(t.calls[calls]).toMatchObject({path:`/api/v1/mini-app/drafts/${before.draftId}/requests/${before.pending!.key}`,query:{command,scan_session_id:before.scanSessionId,warehouse_id:id(3),operation:'OUTBOUND'}});
  expect(t.calls[calls].method??'GET').toBe('GET');
  expect(t.flow.snapshot().source).toEqual(before.source);
});

test('P17 linked exact holder owner GET is rechecked and revokes a denied link without touching the source/hold', async () => {
  const read=jest.spyOn(queries,'fetchOutboundDocument')
    .mockResolvedValueOnce({id:id(99)})
    .mockRejectedValueOnce(new P05ApiError('DENIED','Private',{status:403}));
  try {
    const t=await selected(); t.flow.next();
    jest.spyOn(t.service,'resolve').mockResolvedValue({eligible_for_outbound:false,
      reservation:{redacted:false,can_open:true,document_id:id(99),doc_no:'HOLDER-PRIVATE'}});
    await t.flow.bindScan()('HELD');
    const before=t.flow.snapshot(),key=t.flow.exceptionScope()!, calls=t.calls.length;
    expect(await t.flow.readRejectedDocument(before.rejected!.eventId,key,id(98))).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(await t.flow.readRejectedDocument(before.rejected!.eventId,key,id(99))).toBe(true);
    expect(read.mock.calls[0]).toEqual([id(99),{query:{warehouse_id:id(3)}}]);
    expect(await t.flow.readRejectedDocument(before.rejected!.eventId,key,id(99))).toBe(false);
    expect(t.flow.snapshot().rejected?.relatedDocument).toEqual({kind:'unavailable'});
    expect(JSON.stringify(t.flow.snapshot().rejected)).not.toContain('HOLDER-PRIVATE');
    expect(t.flow.snapshot().source).toEqual(before.source);
    expect(t.calls.length).toBe(calls);
  } finally {read.mockRestore();}
});

test('source-linked SAVE/resume/CANCEL also accept matching weak ETag without changing request version or owner', async () => {
  const f = fixture();
  f.options.etag = 'weak';
  f.flow.start();
  expect(await f.flow.initialize()).toBe(true);
  expect(await f.flow.selectSource(id(4))).toBe(true);
  f.flow.next();
  expect(await f.flow.bindScan()('A')).toBe('valid');
  const old = f.flow.snapshot();
  expect(old).toMatchObject({ draftVersion: 2, unknown: false, dirty: false });
  const resumed = f.make();
  resumed.start();
  expect(await resumed.initialize()).toBe(true);
  expect(resumed.snapshot()).toMatchObject({
    draftId: old.draftId,
    draftVersion: 2,
    unknown: false,
  });
  expect(resumed.snapshot().accepted).toEqual(old.accepted);
  expect(await resumed.cancel()).toBe(true);
  expect(
    f.calls.filter(c => c.method === 'PUT').map(c => c.headers?.['If-Match']),
  ).toEqual(['"0"', '"1"']);
  expect(
    f.calls.find(c => c.path.endsWith('/cancel'))?.headers?.['If-Match'],
  ).toBe('"2"');
});

test('draft read rejects weak ETag for another version and mismatched SAVE retains pending identity', async () => {
  const f = await selected();
  const d = f.flow.snapshot();
  f.options.etag = 'wrong';
  await expect(
    f.service.draft(d.draftId!, d.scanSessionId!),
  ).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  f.flow.next();
  await f.flow.bindScan()('A');
  expect(f.flow.snapshot()).toMatchObject({
    unknown: true,
    dirty: true,
    draftVersion: 1,
  });
  expect(f.flow.snapshot().pending).not.toBeNull();
  expect(f.flow.canRecord()).toBe(false);
});
test('native source context/list/detail SQL timestamp/TEXT, no auto source or SAVE', async () => {
  const f = fixture();
  f.flow.start();
  await f.flow.initialize();
  expect(f.flow.snapshot().source).toBeNull();
  expect(f.flow.snapshot().sources.meta?.total).toBe(1);
  expect(f.calls.every(c => (c.method ?? 'GET') === 'GET')).toBe(true);
  await f.flow.selectSource(id(4));
  expect(f.flow.snapshot().document?.address).toBe(source.recipient.address);
  expect(f.flow.fieldErrors()).toEqual({});
});
test('empty/whitespace source search omits q; real search retains exact keyword', async () => {
  const f = fixture();
  await f.service.sources();
  const first = f.calls.at(-1)!;
  expect(first.query?.q).toBeUndefined();
  await f.service.sources({ q: '   ' });
  expect(f.calls.at(-1)?.query?.q).toBeUndefined();
  await f.service.sources({ q: 'PX-NATIVE-TEST' });
  expect(f.calls.at(-1)?.query?.q).toBe('PX-NATIVE-TEST');
});
test('native full SAVE separates versions and RECORD exact headers/body stock neutral once', async () => {
  const f = await ready(),
    before = f.flow.snapshot();
  expect(before.draftId).not.toBe(id(4));
  expect(before.draftVersion).toBe(3);
  expect(before.source?.source_version).toBe(7);
  expect(before.form).toEqual({
    p05_source: { document_id: id(4), version: 7 },
  });
  const a = f.flow.send(),
    b = f.flow.send();
  expect(await b).toBe(false);
  expect(await a).toBe(true);
  const call = f.calls.find(c => c.path.endsWith('/record'))!;
  expect(call.headers?.['X-Draft-Version']).toBe('3');
  expect(call.headers?.['If-Match']).toBeUndefined();
  expect(Object.keys(call.body as object).sort()).toEqual(
    [
      'warehouse_id',
      'source_document_id',
      'source_version',
      'expected_total_qty',
      'items',
    ].sort(),
  );
  expect(f.flow.snapshot().recorded).toBe(true);
  expect(f.flow.snapshot().receipt?.document_id).toBe(before.draftId);
  expect(f.flow.back()).toBe(false);
  expect(f.calls.filter(c => c.path.endsWith('/record'))).toHaveLength(1);
});
test('manual repeat rejected same raw can be checked again; valid trim/order/MANUAL preserved', async () => {
  const f = await selected();
  f.flow.next();
  f.options.eligible = false;
  expect(await f.flow.bindScan()('A')).toBe('invalid');
  f.options.eligible = true;
  expect(await f.flow.bindScan()(' A ')).toBe('valid');
  expect(f.flow.snapshot().accepted[0]?.raw).toBe('A');
  expect(f.flow.snapshot().accepted[0]?.source).toBe('MANUAL');
  expect(f.calls.filter(c => c.path.endsWith('resolve-code'))).toHaveLength(2);
});
test('physical alias and per-SKU plan prevent inflated accepted/record', async () => {
  const f = await selected();
  f.flow.next();
  await f.flow.bindScan()('A');
  expect(await f.flow.bindScan()('alias')).toBe('duplicate');
  f.options.wrongSku = true;
  expect(await f.flow.bindScan()('B')).toBe('invalid');
  expect(f.flow.snapshot().accepted).toHaveLength(1);
  f.flow.next();
  expect(f.flow.canRecord()).toBe(false);
});
test('SAVE UNKNOWN reload keeps exact key/body/version and blocks RECORD', async () => {
  const f = await selected();
  f.flow.next();
  f.options.lost = 'SAVE';
  await f.flow.bindScan()('A');
  const s = f.flow.snapshot();
  expect(s.unknown).toBe(true);
  expect(f.flow.canRecord()).toBe(false);
  const reloaded = f.make();
  reloaded.start();
  await reloaded.initialize();
  expect(reloaded.snapshot().pending).toEqual(s.pending);
  expect(await reloaded.check()).toBe(true);
  expect(reloaded.snapshot().draftVersion).toBe(2);
  expect(f.calls.filter(c => c.method === 'PUT')).toHaveLength(2);
});
test('RECORD lost response reconciles historical receipt and newer draft/current POSTED', async () => {
  const f = await ready();
  f.options.lost = 'RECORD';
  expect(await f.flow.send()).toBe(false);
  const pending = f.flow.snapshot().pending;
  f.options.posted = true;
  f.options.currentVersion = 12;
  expect(await f.flow.check()).toBe(true);
  expect(f.flow.snapshot().receipt?.request_id).toBe(pending?.key);
  expect(f.flow.snapshot().draftVersion).toBe(12);
  expect(f.flow.snapshot().current?.posted).toBe(true);
  expect(f.calls.filter(c => c.path.endsWith('/record'))).toHaveLength(1);
});
test('UNKNOWN retry uses identical request and blocks source replacement/cancellation', async () => {
  const f = await ready();
  f.options.lost = 'RECORD';
  await f.flow.send();
  f.options.unknown = true;
  await f.flow.check();
  expect(await f.flow.cancel()).toBe(false);
  expect(await f.flow.selectSource(id(55), { replace: true })).toBe(false);
  f.options.unknown = false;
  expect(await f.flow.retrySame()).toBe(true);
  const requests = f.calls.filter(c => c.path.endsWith('/record'));
  expect(requests).toHaveLength(2);
  expect(requests[0]?.headers).toEqual(requests[1]?.headers);
  expect(requests[0]?.body).toEqual(requests[1]?.body);
});
test.each([
  'SOURCE_STALE_VERSION',
  'STALE_VERSION',
  'P05_LINKED_DRAFT_REQUIRED',
  'P05_DRAFT_SOURCE_MISMATCH',
  'P05_DRAFT_ITEMS_MISMATCH',
  'SOURCE_PLAN_SKU_MISMATCH',
  'SOURCE_PLAN_QTY_MISMATCH',
  'IDEMPOTENCY_CONFLICT',
])('native %s keeps error/version and never falls back', async code => {
  const f = await ready();
  f.options.fail = code;
  expect(await f.flow.send()).toBe(false);
  expect(f.flow.snapshot().recorded).toBe(false);
  expect(f.flow.snapshot().error?.code).toBe(code);
  expect(f.flow.snapshot().source?.source_version).toBe(7);
  expect(f.flow.canRecord()).toBe(false);
  expect(f.calls.filter(c => c.path.endsWith('/record'))).toHaveLength(1);
});
test('explicit change source cancels via SAVE receipt and creates distinct identity', async () => {
  const f = await selected(),
    old = f.flow.snapshot();
  f.options.sources.push({
    ...source,
    source_document_id: id(55),
    document_id: id(55),
  });
  expect(await f.flow.selectSource(id(55))).toBe(false);
  expect(await f.flow.selectSource(id(55), { replace: true })).toBe(true);
  expect(f.flow.snapshot().draftId).not.toBe(old.draftId);
  const c = f.calls.find(x => x.path.endsWith('/cancel'))!;
  expect((c.body as Record<string, unknown>).confirmed_request_id).toBe(
    old.receipt?.request_id,
  );
  expect(c.headers?.['If-Match']).toBe('"1"');
});
test('storage failure sends no mutation; old-scope journal not resumed', async () => {
  const f = fixture();
  await f.flow.initialize();
  jest.spyOn(f.storage, 'setString').mockImplementation(() => {
    throw Error('quota');
  });
  expect(await f.flow.selectSource(id(4))).toBe(false);
  expect(f.calls.some(c => c.method === 'PUT')).toBe(false);
  const next = await selected();
  next.setSession({
    accessToken: 'DIFFERENT-SESSION',
    userId: id(1),
    authSessionId: id(22),
    activeWarehouseId: id(3),
  });
  expect(next.flow.canRecord()).toBe(false);
});
test('frozen validator denies extra metadata and missing link before transport', async () => {
  const f = await ready();
  f.options.lost = 'RECORD';
  await f.flow.send();
  const frozen = f.flow.snapshot().pending as FrozenRequest;
  expect(() =>
    validateP05Frozen(
      { ...frozen, body: { ...frozen.body, recipient_name: 'override' } },
      scope,
    ),
  ).toThrow();
  expect(() =>
    validateP05Frozen(
      { ...frozen, headers: { ...frozen.headers, 'If-Match': '"7"' } },
      scope,
    ),
  ).toThrow();
  expect(() =>
    validateP05Frozen(
      { ...frozen, body: { ...frozen.body, source_document_id: id(77) } },
      scope,
    ),
  ).toThrow();
});
test('recorded fresh entry resets; unknown reentry preserves operation', async () => {
  const f = await ready();
  f.options.lost = 'RECORD';
  await f.flow.send();
  const old = f.flow.snapshot();
  f.flow.start({}, { newAttempt: true });
  expect(f.flow.snapshot().draftId).toBe(old.draftId);
  await f.flow.check();
  f.flow.start({}, { newAttempt: true });
  expect(f.flow.snapshot().source).toBeNull();
  expect(f.flow.snapshot().accepted).toEqual([]);
});
test('CANCEL lost response reconciles before selecting a new source, no second cancel', async () => {
  const f = await selected();
  f.options.sources.push({
    ...source,
    source_document_id: id(55),
    document_id: id(55),
  });
  f.options.lost = 'CANCEL';
  expect(await f.flow.selectSource(id(55), { replace: true })).toBe(false);
  expect(f.flow.snapshot().unknown).toBe(true);
  expect(await f.flow.check()).toBe(true);
  expect(f.flow.canRecord()).toBe(false);
  expect(await f.flow.selectSource(id(55), { replace: true })).toBe(true);
  expect(f.flow.snapshot().source?.source_document_id).toBe(id(55));
  expect(f.calls.filter(c => c.path.endsWith('/cancel'))).toHaveLength(1);
});
test('unverified manual input/scroll retain in scoped journal without changing SAVE payload', async () => {
  const f = await selected();
  f.flow.setViewState({
    manual: true,
    rawInput: 'USER-REJECTED-RAW',
    scroll: { 2: 230 },
  });
  const old = f.flow.snapshot(),
    loaded = f.make();
  loaded.start();
  await loaded.initialize();
  expect(loaded.snapshot().nativeView).toEqual({
    manual: true,
    rawInput: 'USER-REJECTED-RAW',
    scroll: { 2: 230 },
  });
  expect(loaded.snapshot().draftId).toBe(old.draftId);
  expect(f.calls.filter(c => c.method === 'PUT')).toHaveLength(1);
  expect(
    (f.calls.find(c => c.method === 'PUT')?.body as Record<string, unknown>)
      .codes,
  ).toEqual([]);
});
test('confirmed SAVE failure keeps dirty accepted and retries only after readback and explicit save', async () => {
  const f = await selected();
  f.flow.next();
  f.options.fail = 'P05_OPERATION_DENIED';
  f.options.failSaveOnly = true;
  expect(await f.flow.bindScan()('A')).toBe('valid');
  expect(f.flow.snapshot().dirty).toBe(true);
  expect(f.flow.snapshot().error?.code).toBe('P05_OPERATION_DENIED');
  const count = f.calls.filter(c => c.method === 'PUT').length;
  await f.flow.initialize();
  expect(f.calls.filter(c => c.method === 'PUT')).toHaveLength(count);
  expect(f.flow.snapshot().error).toBeNull();
  expect(f.flow.canRecord()).toBe(false);
  expect(await f.flow.save()).toBe(true);
  expect(f.flow.snapshot().draftVersion).toBe(2);
  expect(f.flow.snapshot().accepted).toHaveLength(1);
});
test('selecting the same source reads version again and does not silently overwrite source link', async () => {
  const f = await selected(),
    old = f.flow.snapshot();
  f.options.sources[0]!.source_version = 8;
  expect(await f.flow.selectSource(source.source_document_id)).toBe(false);
  expect(f.flow.snapshot().error?.code).toBe('SOURCE_STALE_VERSION');
  expect(f.flow.snapshot().draftId).toBe(old.draftId);
  expect(f.flow.snapshot().source?.source_version).toBe(7);
  expect(f.calls.filter(c => c.method === 'PUT')).toHaveLength(1);
});
test('historical SAVE receipt with newer current draft closes SAME_REQUEST retry and cannot unlock RECORD', async () => {
  const f = await selected();
  f.flow.next();
  f.options.lost = 'SAVE';
  await f.flow.bindScan()('A');
  f.options.unknown = true;
  await f.flow.check();
  expect(f.flow.snapshot().retry).toBe('SAME_REQUEST_ONLY');
  f.options.unknown = false;
  f.options.currentVersion = 12;
  expect(await f.flow.check()).toBe(false);
  expect(f.flow.snapshot().retry).toBe('NONE');
  expect(f.flow.retrySame()).toBe(false);
  expect(f.flow.canRecord()).toBe(false);
  expect(f.flow.snapshot().error?.code).toBe('STALE_VERSION');
});
