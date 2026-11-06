// Isolated old body + P03 linkage. Real RECORD is verified separately.
import { createP05CreateOwner } from '../src/features/outbound/p05CreateOwner';
import {
  createP05CreateService,
  type P05Catalogue,
} from '../src/services/wms/p05Create';
import type { P05Client } from '../src/services/wms/p05Outbound';
import { createMemoryBackend, createStorage } from '../src/storage/storage';
import { P05ApiError } from '../src/features/outbound/linked/p05-contract';
import {
  p05CreateErrors,
  p05DeliveryAddress,
  emptyP05CreateForm,
  sanitiseP05Phone,
  validP05Phone,
} from '../src/features/outbound/p05CreateForm';
import type { RequestOptions } from '../src/api/client';
import type { Session } from '../src/auth/session';
import { p05ExceptionView } from '../src/features/outbound/P05Exceptions';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { actorId: id(1), authSessionId: id(2), warehouseId: id(3) },
  copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
function fixture() {
  let counter = 100;
  const session: Session = {
      userId: scope.actorId,
      authSessionId: scope.authSessionId,
      activeWarehouseId: scope.warehouseId,
      accessToken: 'TEST-ONLY',
    },
    calls: RequestOptions[] = [],
    drafts = new Map<string, Record<string, unknown>>(),
    responses = new Map<string, unknown>();
  const opts = {
    numbering: false,
    numberingAllowed: true,
    numberingBadMeta: false,
    numberingBadForm: false,
    numberingChanged: false,
    unknownMissing: false,
    lose: '',
    invalid: false,
    alias: false,
    sku: id(7),
    permissions: true,
    contextFail: false,
    recordFail: '',
    badReceipt: false,
    resolveFailure: null as P05ApiError | null,
    holdResolve: null as Promise<void> | null,
    holdContext: null as null | Promise<void>,
    recipientAddress: 'Địa chỉ cũ',
    productFailure: false,
    productDuplicate: 'none' as 'none' | 'identical' | 'conflict',
    recipientName: 'Người nhận thật',
    etag: 'absent' as 'absent' | 'strong' | 'weak' | 'wrong' | 'malformed',
  };
  const env = (
    data: unknown,
    contract = 'mini-app-p03-v1',
    meta: Record<string, unknown> = {},
  ) => ({
    success: true,
    data,
    meta: {
      contract,
      ...(opts.numbering
        ? {
            numbering_contract: 'p05-save-numbering-v1',
            numbering_revision: 'p05-save-numbering-r1',
          }
        : {}),
      ...meta,
    },
  });
  const client = {
    async request<T>(r: RequestOptions) {
      calls.push(copy(r));
      let status = 200,
        data: unknown;
      const body = r.body as Record<string, unknown>,
        key = r.headers?.['Idempotency-Key'] ?? '',
        command = r.path.endsWith('/record')
          ? 'RECORD'
          : r.path.endsWith('/cancel')
          ? 'CANCEL'
          : 'SAVE';
      if (r.path.endsWith('/context')) {
        if (opts.contextFail)
          throw new P05ApiError('NETWORK', 'Mất kết nối phiên');
        if (opts.holdContext) await opts.holdContext;
        data = env(
          {
            ...(opts.numbering
              ? {
                  document_number_assignment: 'WITH_DRAFT_SAVE',
                  numbering: {
                    contract: 'p05-save-numbering-v1',
                    revision: 'p05-save-numbering-r1',
                    mode: 'MANUAL_CREATE_ONLY',
                    schema_ready: true,
                    allowed: opts.numberingAllowed,
                    format: 'PX-YYYYMMDD-SEQUENCE',
                    cancel_policy: 'RETAIN_NEVER_REUSE',
                    source_linked_policy: 'KEEP_SOURCE_DOCUMENT_NO',
                    stock_effect: 'NONE',
                    save: {
                      method: 'PUT',
                      path: '/api/v1/mini-app/drafts/{draft_id}',
                      operation: 'OUTBOUND',
                      headers: {
                        'X-Outbound-Numbering-Contract':
                          'p05-save-numbering-v1',
                      },
                      response_field: 'data.document.document_no',
                    },
                  },
                }
              : {}),
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
              save: opts.permissions,
              record: opts.permissions,
              cancel: opts.permissions,
            },
            record: { reconcile_mode: 'P03_LINKED' },
            address_contract: {
              format: 'TEXT',
              structured_codes_supported: false,
            },
          },
          'mini-app-p05-v1',
        );
      } else if (r.path === '/api/v1/recipients')
        data = {
          success: true,
          data: [
            {
              agency_id: id(6),
              agency_name: opts.recipientName,
              phone: '0901234567',
              address: opts.recipientAddress,
              status: 'ACTIVE',
            },
            { agency_id: id(16), agency_name: 'Đã ngừng', status: 'INACTIVE' },
          ],
          meta: { current_page: 1, per_page: 50, total: 2, last_page: 1 },
        };
      else if (r.path === '/api/v1/mini-app/products') {
        if (opts.productFailure)
          throw new P05ApiError(
            'CATALOGUE_INVALID',
            'Danh mục sản phẩm trùng định danh.',
          );
        const page = Number(r.query?.page ?? 1),
          firstProduct = {
            sku_id: id(7),
            sku_code: 'A',
            sku_type: 'PRODUCT',
            category_name: 'Máy A',
            brand_name: 'Hoa Nam',
            status: 'ACTIVE',
          };
        const duplicatePageOne = [
          firstProduct,
          ...Array.from({ length: 49 }, (_, index) => ({
            sku_id: id(1000 + index),
            sku_code: `A-${index + 1}`,
            sku_type: 'PRODUCT',
            category_name: 'Máy A',
            brand_name: 'Hoa Nam',
            status: 'ACTIVE',
          })),
        ];
        data =
          opts.productDuplicate === 'none'
            ? {
                success: true,
                data: [
                  firstProduct,
                  {
                    sku_id: id(8),
                    sku_code: 'B',
                    sku_type: 'PRODUCT',
                    category_name: 'Máy B',
                    brand_name: 'Hoa Nam',
                    status: 'ACTIVE',
                  },
                ],
                meta: { current_page: 1, per_page: 50, total: 2, last_page: 1 },
              }
            : {
                success: true,
                data:
                  page === 1
                    ? duplicatePageOne
                    : [
                        {
                          ...firstProduct,
                          ...(opts.productDuplicate === 'conflict'
                            ? { category_name: 'Máy khác' }
                            : {}),
                        },
                      ],
                meta: {
                  current_page: page,
                  per_page: 50,
                  total: 51,
                  last_page: 2,
                },
              };
      } else if (r.path.endsWith('/resolve-code')) {
        if (opts.holdResolve) await opts.holdResolve;
        if (opts.resolveFailure) throw opts.resolveFailure;
        data = {
          success: true,
          data: {
            eligible_for_outbound: !opts.invalid,
            sku_type: 'PRODUCT',
            sku_id: opts.sku,
            sku_code: 'A',
            item_id: opts.alias
              ? id(70)
              : body.raw_code === 'CODE-2'
              ? id(71)
              : id(70),
            available_qty: 4,
          },
          meta: {},
        };
      } else if (r.path.includes('/requests/')) {
        const saved = opts.unknownMissing
          ? undefined
          : responses.get(r.path.split('/').pop()!);
        data = env(
          saved
            ? {
                outcome: 'SUCCEEDED',
                retry: 'NONE',
                new_document_allowed: false,
                cancel_allowed: false,
                receipt:
                  (saved as any).meta?.p03_draft?.receipt ??
                  (saved as any).data.receipt,
                document:
                  (saved as any).meta?.p03_draft?.document ??
                  (saved as any).data.document,
                response: saved,
              }
            : {
                outcome: 'UNKNOWN',
                retry: r.headers?.['X-Outbound-Numbering-Contract']
                  ? 'CHECK_ONLY'
                  : 'SAME_REQUEST_ONLY',
                new_document_allowed: false,
                cancel_allowed: false,
                receipt: null,
                document: null,
                response: null,
              },
        );
      } else if ((r.method ?? 'GET') === 'GET')
        data = env(drafts.get(r.path.split('/').pop()!));
      else if (responses.has(key)) data = responses.get(key);
      else {
        if (command === 'RECORD' && opts.recordFail)
          throw new P05ApiError(opts.recordFail, 'Máy chủ từ chối ghi nhận', {
            status: 422,
          });
        const draftId =
          command === 'RECORD'
            ? r.headers!['X-Draft-ID']
            : r.path.split('/')[5];
        const prior = drafts.get(draftId),
          version = Number(prior?.version ?? 0) + 1;
        const d =
          command === 'SAVE'
            ? {
                document_kind: 'STAGING_DRAFT',
                document_id: draftId,
                scan_session_id: body.scan_session_id,
                auth_session_id: scope.authSessionId,
                warehouse_id: scope.warehouseId,
                operation: 'OUTBOUND',
                version,
                status: 'DRAFT',
                stock_effect: 'NONE',
                codes_validated: false,
                codes: body.codes,
                form: body.form,
                title: body.title,
              }
            : {
                ...prior,
                version,
                status: command === 'RECORD' ? 'RECORDED' : 'CANCELLED',
                business_document_id: command === 'RECORD' ? id(90) : null,
              };
        if (r.headers?.['X-Outbound-Numbering-Contract'])
          Object.assign(d, {
            document_no: opts.numberingChanged
              ? 'PX-20261105-0999'
              : prior?.document_no ?? 'PX-20261104-0001',
            numbering_status: 'ASSIGNED',
          });
        drafts.set(draftId, copy(d));
        const receipt = {
          request_id: key,
          document_id: draftId,
          scan_session_id: d.scan_session_id,
          warehouse_id: scope.warehouseId,
          operation: 'OUTBOUND',
          command,
          outcome: 'SUCCEEDED',
          version,
          committed_at: '2026-10-09T03:00:00Z',
        };
        data =
          command === 'RECORD'
            ? env(
                {
                  id: id(90),
                  doc_no: r.headers?.['X-Outbound-Numbering-Contract']
                    ? (d as any).document_no
                    : 'PX-SERVER',
                  status: 'SCANNING',
                  readiness: 'READY',
                  missing_fields: [],
                  invalid_fields: [],
                  record_allowed: true,
                  name:
                    typeof body.name === 'string' && body.name.trim()
                      ? body.name.trim()
                      : null,
                  stock_effect: 'NONE',
                  movement_created: false,
                  version: 1,
                },
                'p05-outbound-record-field-matrix-v1',
                {
                  revision: 'p05-record-field-matrix-r1',
                  p03_draft: { document: d, receipt },
                },
              )
            : env({ document: d, receipt });
        if (command === 'RECORD' && opts.badReceipt)
          receipt.request_id = id(999);
        responses.set(key, copy(data));
        if (command === 'SAVE' && !prior) status = 201;
        if (opts.lose === command) {
          opts.lose = '';
          throw new P05ApiError('TIMEOUT', 'Mất phản hồi', { unknown: true });
        }
      }
      if (r.headers?.['X-Outbound-Numbering-Contract']) {
        (data as any).meta.numbering_contract = 'p05-save-numbering-v1';
        (data as any).meta.numbering_revision = opts.numberingBadMeta
          ? 'wrong'
          : 'p05-save-numbering-r1';
        if (opts.numberingBadForm && (data as any).data?.document)
          (data as any).data.document.form = {};
      }
      const version =
        (data as any)?.data?.document?.version ?? (data as any)?.data?.version;
      const etag =
        opts.etag === 'absent' || !version
          ? undefined
          : opts.etag === 'weak'
          ? `W/"${version}"`
          : opts.etag === 'strong'
          ? `"${version}"`
          : opts.etag === 'wrong'
          ? `W/"${version + 1}"`
          : 'W/2';
      return {
        status,
        data: data as T,
        header: (name: string) =>
          name.toLowerCase() === 'etag' ? etag : undefined,
      };
    },
  } as P05Client;
  const service = createP05CreateService(client, () => session),
    storage = createStorage(createMemoryBackend()),
    geo = {
      provinces: async () => ({
        items: [
          { code: '79', name: 'TP.HCM' },
          { code: '01', name: 'Hà Nội' },
          { code: '48', name: 'Thành phố Đà Nẵng' },
        ],
        stale: false,
      }),
      wards: async (code: string) => ({
        items: [
          code === '48'
            ? { code: '20341', name: 'Phường Tam Kỳ' }
            : {
                code: code === '79' ? '79001' : '01001',
                name: code === '79' ? 'Phường A' : 'Phường B',
              },
        ],
        stale: false,
      }),
    };
  const owner = (
    extra: Partial<Parameters<typeof createP05CreateOwner>[0]> = {},
  ) =>
    createP05CreateOwner({
      service,
      storage,
      getScope: () => scope,
      uuid: () => id(++counter),
      geo,
      ...extra,
    });
  return { flow: owner(), owner, opts, calls, geo, storage, drafts, service };
}
async function fill(t: ReturnType<typeof fixture>, quantity = '1') {
  await t.flow.initialize();
  t.flow.field('name', 'Xuất kiểm thử');
  t.flow.choose('recipient', 'walk-in');
  t.flow.field('recipient', 'Khách vãng lai');
  t.flow.field('phone', '0901234567');
  t.flow.choose('province', '79');
  await t.flow.loadGeo('79');
  t.flow.choose('ward', '79001');
  t.flow.field('address', '12 Hoa Nam');
  t.flow.choose('group', 'Máy A');
  t.flow.field('plannedInput', quantity);
  t.flow.field('note', 'Ghi chú\nUnicode ✓');
}

describe('v5 TC10 group apply before PX is assigned',()=>{
 test('numbering denial retains verified group selection locally but still blocks SAVE',async()=>{
  const t=fixture();t.opts.numbering=true;t.opts.numberingAllowed=false;
  await t.flow.initialize();
  expect(t.flow.snapshot().catalogue?.groups).toContain('Máy A');
  expect(t.flow.chooseGroups(['Máy A'])).toBe(true);
  expect(t.flow.snapshot().form).toMatchObject({group:'Máy A',groups:['Máy A']});
  expect(await t.flow.save()).toBe(false);
  expect(t.calls.filter(c=>['PUT','POST'].includes(c.method??'GET'))).toHaveLength(0);
 });
 test('group metadata does not bypass save/record rights',async()=>{
  const t=fixture();t.opts.permissions=false;
  await t.flow.initialize();const before=t.flow.snapshot().form;
  expect(t.flow.chooseGroups(['Máy A'])).toBe(false);
  expect(t.flow.snapshot().form).toEqual(before);
 });
});

describe('v5 TC09 exit actions when PX numbering is denied',()=>{
 test.each([null,undefined,-1,'0',0.5])('valid JSON with invalid version %s is preserved without writes or discard',async version=>{
  const t=fixture();t.opts.numbering=true;t.opts.numberingAllowed=false;
  await t.flow.initialize();t.flow.field('note','TC09 corrupted-version TEST');
  const key=t.storage.keys().find(k=>k.startsWith('hn-p05-create-v1:'))!;
  const raw=JSON.parse(t.storage.getString(key)!);
  if(version===undefined)delete raw.state.version;else raw.state.version=version;
  const damaged=JSON.stringify(raw);t.storage.setString(key,damaged);
  const restored=t.owner();
  expect(await restored.initialize()).toBe(false);
  expect(restored.snapshot().errorCode).toBe('JOURNAL_INVALID');
  expect(await restored.discard()).toBe(false);
  expect(t.storage.getString(key)).toBe(damaged);
  expect(t.calls.filter(c=>['PUT','POST'].includes(c.method??'GET'))).toHaveLength(0);
 });
 test('a damaged journal is never treated as an unsaved local checkpoint',async()=>{
  const t=fixture(),remove=jest.fn(()=>true);
  const owner=t.owner({storage:{...t.storage,getString:()=>'{broken',remove}});
  expect(await owner.initialize()).toBe(false);
  const before=owner.snapshot();
  expect(before.errorCode).toBeTruthy();
  expect(owner.chooseGroups(['Máy A'])).toBe(false);
  expect(await owner.discard()).toBe(false);
  expect(owner.snapshot()).toEqual(before);
  expect(remove).not.toHaveBeenCalled();
 });
 test('SAVE stays blocked but supplies a visible explanation instead of a silent false',async()=>{
  const t=fixture();t.opts.numbering=true;t.opts.numberingAllowed=false;
  await t.flow.initialize();
  expect(await t.flow.save()).toBe(false);
  expect(t.flow.snapshot().message.trim().length).toBeGreaterThan(0);
  expect(t.flow.snapshot()).toMatchObject({version:0,pending:null,unknown:false});
  expect(t.calls.filter(c=>['PUT','POST'].includes(c.method??'GET'))).toHaveLength(0);
 });
 test('confirmed local discard can remove only its never-saved empty-code journal without a BE grant',async()=>{
  const t=fixture();t.opts.numbering=true;t.opts.numberingAllowed=false;
  await t.flow.initialize();t.flow.field('note','TC09 TEST unsaved');
  t.storage.setObject('TC09_UNRELATED',{keep:true});
  const before=t.flow.snapshot();expect(before.version).toBe(0);
  expect(await t.flow.discard()).toBe(true);
  expect(t.flow.snapshot().draftId).not.toBe(before.draftId);
  expect(t.flow.snapshot().form.note).toBe('');
  expect(t.storage.getObject('TC09_UNRELATED')).toEqual({keep:true});
  expect(t.calls.filter(c=>['PUT','POST'].includes(c.method??'GET'))).toHaveLength(0);
 });
 test('a version-zero SAVE with unknown outcome cannot be discarded or have its request changed',async()=>{
  const t=fixture();t.opts.numbering=true;
  await t.flow.initialize();t.opts.lose='SAVE';
  expect(await t.flow.requestDocumentNumber()).toBe(false);
  const before=t.flow.snapshot();expect(before.unknown).toBe(true);expect(before.pending).not.toBeNull();
  expect(t.flow.chooseGroups(['Máy A'])).toBe(false);
  expect(await t.flow.discard()).toBe(false);
  expect(t.flow.snapshot()).toEqual(before);
 });
});

describe('P05 SAVE numbering BE1c0cee03', () => {
  test('explicit resume refuses a different draft before allocating or sending a mutation', async () => {
    const t = fixture();
    await t.flow.initialize();
    await t.flow.save();
    const before = t.calls.filter(c => c.method === 'PUT').length;
    const restored = t.owner();
    expect(await restored.initialize(undefined, false, id(999))).toBe(false);
    expect(restored.snapshot().errorCode).toBe('P05_RESUME_DRAFT_MISMATCH');
    expect(t.calls.filter(c => c.method === 'PUT')).toHaveLength(before);
  });
  test('initialize is read-only; explicit new-entry intent reserves partial empty draft once, separate from optional name', async () => {
    const t = fixture();
    t.opts.numbering = true;
    await t.flow.initialize();
    expect(t.calls.filter(c => c.method === 'PUT')).toHaveLength(0);
    expect(await t.flow.requestDocumentNumber()).toBe(true);
    const s = t.flow.snapshot();
    expect(s.documentNo).toBe('PX-20261104-0001');
    expect(s.form.name).toBe('');
    expect(s.version).toBe(1);
    expect(s.accepted).toEqual([]);
    const q = t.calls.find(c => c.method === 'PUT')!;
    expect(q.headers).toMatchObject({
      'X-Outbound-Numbering-Contract': 'p05-save-numbering-v1',
      'If-Match': '"0"',
    });
    expect(q.body).toMatchObject({ codes: [], title: null });
    expect(q.body).not.toHaveProperty('document_no');
    expect(await t.flow.requestDocumentNumber()).toBe(false);
    expect(t.calls.filter(c => c.method === 'PUT')).toHaveLength(1);
  });
  test('number and contract survive reopen and later SAVE while form name stays independent', async () => {
    const t = fixture();
    t.opts.numbering = true;
    await t.flow.initialize();
    await t.flow.requestDocumentNumber();
    t.flow.field('note', 'TEST later');
    await t.flow.save();
    const restored = t.owner();
    expect(await restored.initialize(undefined, false)).toBe(true);
    expect(restored.snapshot().documentNo).toBe('PX-20261104-0001');
    expect(restored.snapshot().version).toBe(2);
    expect(
      t.calls
        .filter(c => c.path.includes('/drafts/') && c.method === 'GET')
        .pop()?.headers,
    ).toMatchObject({
      'X-Outbound-Numbering-Contract': 'p05-save-numbering-v1',
    });
  });
  test('legacy saved receipt is never silently backfilled on GET or UI entry; explicit intent allocates with new key/current version', async () => {
    const t = fixture();
    await t.flow.initialize();
    await t.flow.save();
    const first = t.calls.find(c => c.method === 'PUT')!;
    t.opts.numbering = true;
    // The real new contract projects an unnumbered legacy row explicitly.
    for (const d of t.drafts.values())
      Object.assign(d, {
        document_no: null,
        numbering_status: 'AWAITING_EXPLICIT_SAVE',
      });
    const restored = t.owner();
    await restored.initialize(undefined, false);
    const before = t.calls.filter(c => c.method === 'PUT').length;
    expect(await restored.requestDocumentNumber()).toBe(false);
    expect(t.calls.filter(c => c.method === 'PUT')).toHaveLength(before);
    expect(await restored.requestDocumentNumber(true)).toBe(true);
    const q = t.calls.filter(c => c.method === 'PUT').pop()!;
    expect(q.headers?.['If-Match']).toBe('"1"');
    expect(q.headers?.['Idempotency-Key']).not.toBe(
      first.headers?.['Idempotency-Key'],
    );
  });
  test('lost numbered SAVE is CHECK_ONLY, same pending identity remains and no retry mutation/new key is offered', async () => {
    const t = fixture();
    t.opts.numbering = true;
    await t.flow.initialize();
    t.opts.lose = 'SAVE';
    await t.flow.requestDocumentNumber();
    const pending = t.flow.snapshot().pending;
    t.opts.unknownMissing = true;
    expect(await t.flow.check()).toBe(false);
    expect(t.flow.snapshot().retry).toBe('NONE');
    expect(await t.flow.retrySame()).toBe(false);
    expect(t.flow.snapshot().pending).toEqual(pending);
    expect(t.calls.filter(c => c.method === 'PUT')).toHaveLength(1);
    t.opts.unknownMissing = false;
    expect(await t.flow.check()).toBe(true);
    expect(t.flow.snapshot().documentNo).toBe('PX-20261104-0001');
    expect(t.calls.filter(c => c.method === 'PUT')).toHaveLength(1);
  });
  test.each(['numberingBadMeta', 'numberingBadForm'] as const)(
    'invalid %s does not publish a number or clear pending SAVE',
    async flag => {
      const t = fixture();
      t.opts.numbering = true;
      t.opts[flag] = true;
      await t.flow.initialize();
      expect(await t.flow.requestDocumentNumber()).toBe(false);
      expect(t.flow.snapshot()).toMatchObject({
        documentNo: null,
        unknown: true,
      });
      expect(t.flow.snapshot().pending).not.toBeNull();
    },
  );
  test('actual capability denial cannot fall back to root legacy permission; assigned number cannot change on later SAVE', async () => {
    const t = fixture();
    t.opts.numbering = true;
    t.opts.numberingAllowed = false;
    await t.flow.initialize();
    expect(await t.flow.save()).toBe(false);
    expect(t.calls.filter(c => c.method === 'PUT')).toHaveLength(0);
    const u = fixture();
    u.opts.numbering = true;
    await u.flow.initialize();
    await u.flow.requestDocumentNumber();
    u.flow.field('note', 'TEST');
    u.opts.numberingChanged = true;
    expect(await u.flow.save()).toBe(false);
    expect(u.flow.snapshot()).toMatchObject({
      documentNo: 'PX-20261104-0001',
      unknown: true,
    });
  });
  test('numbered RECORD returns the same official number and CANCEL retains its reservation projection', async () => {
    const t = fixture();
    t.opts.numbering = true;
    await fill(t);
    await t.flow.requestDocumentNumber();
    await t.flow.begin();
    await t.flow.scan('CODE-1', 'MANUAL');
    t.flow.review();
    expect(await t.flow.send()).toBe(true);
    expect(t.flow.snapshot().documentNo).toBe('PX-20261104-0001');
    const u = fixture();
    u.opts.numbering = true;
    await u.flow.initialize();
    await u.flow.requestDocumentNumber();
    expect(await u.flow.discard()).toBe(true);
    expect([...u.drafts.values()][0]).toMatchObject({
      document_no: 'PX-20261104-0001',
      numbering_status: 'ASSIGNED',
      status: 'CANCELLED',
    });
  });
});

test('TC29 same raw failing authoritative revalidation cannot dispatch RECORD or manufacture a new identity', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  const raw = 'SN-ADJ-20260823-001';
  expect(await t.flow.scan(raw, 'MANUAL')).toBe('valid');
  expect(t.flow.review()).toBe(true);
  const before = t.flow.snapshot(),
    offset = t.calls.length;
  t.opts.resolveFailure = new P05ApiError(
    'PHYSICAL_CODE_NOT_FOUND',
    'Barcode/QR không tồn tại hoặc không Đang hoạt động.',
    { status: 422 },
  );
  expect(await t.flow.send()).toBe(false);
  const after = t.flow.snapshot(),
    requests = t.calls.slice(offset);
  expect(
    requests
      .filter(r => r.path.endsWith('/resolve-code'))
      .map(r => (r.body as any).raw_code),
  ).toEqual([raw]);
  expect(requests.some(r => r.path.endsWith('/record'))).toBe(false);
  expect(after.accepted).toEqual(before.accepted);
  expect(after.draftId).toBe(before.draftId);
  expect(after.scanSessionId).toBe(before.scanSessionId);
  expect(after.version).toBe(before.version);
  expect(after.pending).toBeNull();
  expect(after.outcome).not.toBe('recorded');
  expect(after.error).toContain('không tồn tại');
});

test('TC29 empty optional name remains empty in original RECORD; verified receipt alone opens SCANNING success, no POSTED conversion', async () => {
  const t = fixture();
  await fill(t);
  t.flow.field('name', '');
  await t.flow.begin();
  await t.flow.scan('CODE-1', 'MANUAL');
  t.flow.review();
  expect(await t.flow.send()).toBe(true);
  const record = t.calls.find(r => r.path.endsWith('/record'))!;
  expect((record.body as any).name).toBe('');
  expect(t.flow.snapshot().outcome).toBe('recorded');
  expect(t.flow.snapshot().serverDraft?.status).toBe('RECORDED');
  expect(t.flow.snapshot().serverDraft?.stock_effect).toBe('NONE');
  expect(t.flow.snapshot().current?.status).not.toBe('POSTED');
  expect(t.calls.some(r => r.path.includes('post-issue'))).toBe(false);
});

test('multi-group selection accepts products from either selected group and survives SAVE/resume without changing RECORD fields', async () => {
  const t = fixture();
  await fill(t, '2');
  expect(t.flow).toHaveProperty('chooseGroups', expect.any(Function));
  expect((t.flow as any).chooseGroups(['Máy A', 'Máy B'])).toBe(true);
  expect(await t.flow.begin()).toBe(true);
  expect(await t.flow.scan('CODE-1', 'MANUAL')).toBe('valid');
  t.opts.sku = id(8);
  expect(await t.flow.scan('CODE-2', 'CAMERA')).toBe('valid');
  expect(t.flow.snapshot().accepted).toHaveLength(2);
  const saved = t.calls.filter(c => c.method === 'PUT').at(-1)!;
  expect((saved.body as any).form.p05_create.groups).toEqual([
    'Máy A',
    'Máy B',
  ]);
  const resumed = t.owner();
  expect(await resumed.initialize()).toBe(true);
  expect((resumed.snapshot().form as any).groups).toEqual(['Máy A', 'Máy B']);
  expect((resumed as any).chooseGroups(['Máy B'])).toBe(false);
  expect(resumed.snapshot().accepted).toEqual(t.flow.snapshot().accepted);
  const resolve = t.service.resolve;
  jest.spyOn(t.service, 'resolve').mockImplementation((raw, binding) => {
    t.opts.sku = raw === 'CODE-2' ? id(8) : id(7);
    return resolve(raw, binding);
  });
  expect(resumed.review()).toBe(true);
  expect(await resumed.send()).toBe(true);
  const record = t.calls.find(c => c.path.endsWith('/outbound/record'))!;
  expect(Object.keys(record.body as object).sort()).toEqual(
    [
      'expected_total_qty',
      'items',
      'name',
      'note',
      'recipient_address',
      'recipient_contact_phone',
      'recipient_name',
      'warehouse_id',
    ].sort(),
  );
  expect((record.body as any).items).toEqual([
    { raw_code: 'CODE-1', scan_source: 'MANUAL' },
    { raw_code: 'CODE-2', scan_source: 'CAMERA' },
  ]);
});

test('multi-group rejects empty/duplicate/unknown names and cannot change an original UNKNOWN request', async () => {
  const t = fixture();
  await fill(t);
  expect(t.flow).toHaveProperty('chooseGroups', expect.any(Function));
  const before = t.flow.snapshot();
  for (const groups of [
    [],
    ['Máy A', 'Máy A'],
    ['Máy A', 'KHÔNG CÓ'],
    [' Máy A'],
    [null],
  ])
    expect((t.flow as any).chooseGroups(groups)).toBe(false);
  expect(t.flow.snapshot().form).toEqual(before.form);
  expect((t.flow as any).chooseGroups(['Máy A', 'Máy B'])).toBe(true);
  t.opts.lose = 'SAVE';
  await t.flow.begin();
  const unknown = t.flow.snapshot();
  expect(unknown.unknown).toBe(true);
  expect((t.flow as any).chooseGroups(['Máy B'])).toBe(false);
  const resumed = t.owner();
  await resumed.initialize();
  expect(resumed.snapshot().pending).toEqual(unknown.pending);
  expect(resumed.snapshot().version).toBe(unknown.version);
  expect((resumed.snapshot().form as any).groups).toEqual(['Máy A', 'Máy B']);
});

test('a removed second selected group blocks begin before any new SAVE', async () => {
  const t = fixture();
  await fill(t);
  expect(t.flow.chooseGroups(['Máy A', 'Máy B'])).toBe(true);
  jest.spyOn(t.service, 'catalogue').mockResolvedValue({
    recipients: [],
    groups: ['Máy A'],
    skuGroups: { [id(7)]: 'Máy A' },
  });
  await t.flow.loadCatalogue();
  expect(t.flow.errors().group).toBeDefined();
  expect(await t.flow.begin()).toBe(false);
  expect(t.calls.filter(c => c.method === 'PUT')).toHaveLength(0);
});

test('legacy single-group UNKNOWN restores its original request without adding a groups array', async () => {
  const t = fixture();
  await fill(t);
  t.opts.lose = 'SAVE';
  await t.flow.begin();
  const key = t.storage.keys().find(k => k.startsWith('hn-p05-create-v1:'))!;
  const legacy = JSON.parse(t.storage.getString(key)!);
  // Seed the previous schema exactly; no real journal or request is modified.
  delete legacy.state.form.groups;
  delete legacy.state.pending.form.groups;
  delete legacy.state.pending.body.form.p05_create.groups;
  t.storage.setString(key, JSON.stringify(legacy));
  const original = copy(legacy.state.pending);
  const owner = t.owner();
  expect(await owner.initialize()).toBe(true);
  expect(owner.snapshot().pending).toEqual(original);
  expect(owner.snapshot().form).not.toHaveProperty('groups');
  expect(owner.snapshot().form.group).toBe('Máy A');
  expect(owner.chooseGroups(['Máy A', 'Máy B'])).toBe(false);
});

test.each([[], ['Máy A', 'Máy A'], ['Máy B'], [null], 'Máy A'])(
  'malformed multi-group data %j never falls back to a valid scalar group',
  groups => {
    const form = { ...emptyP05CreateForm(), group: 'Máy A', groups } as any;
    expect(p05CreateErrors(form).group).toBeDefined();
  },
);

test('a legacy group containing only spaces remains invalid', () => {
  expect(
    p05CreateErrors({ ...emptyP05CreateForm(), group: '   ' }).group,
  ).toBeDefined();
});

test('live P05 releases a fresh form after context while catalogue and provinces continue as guarded background reads', async () => {
  const t = fixture();
  let resolveCatalogue!: (value: P05Catalogue) => void,
    resolveProvinces!: (value: {
      items: { code: string; name: string }[];
      stale: boolean;
    }) => void;
  const catalogue = new Promise<P05Catalogue>(resolve => {
      resolveCatalogue = resolve;
    }),
    provinces = new Promise<{
      items: { code: string; name: string }[];
      stale: boolean;
    }>(resolve => {
      resolveProvinces = resolve;
    });
  const owner = t.owner({
    service: {
      ...t.service,
      live: true,
      catalogue: () => catalogue,
    },
    geo: { ...t.geo, provinces: () => provinces },
  });
  expect(await owner.initialize()).toBe(true);
  expect(owner.snapshot()).toMatchObject({
    busy: false,
    catalogueBusy: true,
    catalogue: null,
    geo: { busy: true, provinces: [] },
  });
  resolveCatalogue({
    recipients: [],
    groups: ['Máy A'],
    skuGroups: { [id(7)]: 'Máy A' },
  });
  resolveProvinces({ items: [{ code: '79', name: 'TP.HCM' }], stale: false });
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  expect(owner.snapshot()).toMatchObject({
    busy: false,
    catalogueBusy: false,
    catalogue: { groups: ['Máy A'] },
    geo: { busy: false, provinces: [{ code: '79', name: 'TP.HCM' }] },
  });
});

test('P17 manual rejected observation is allowlisted/transient; Scan other keeps exact form/batch/view/session without writes', async () => {
  const t = fixture();
  await fill(t, '2');
  await t.flow.begin();
  await t.flow.scan('ITEM1', 'MANUAL');
  t.flow.setView({
    manual: true,
    rawInput: 'BAD',
    filter: 'invalid',
    scroll: { 2: 75 },
  });
  const before = t.flow.snapshot(),
    writes = t.calls.length;
  jest.spyOn(t.service, 'resolve').mockResolvedValue({
    eligible_for_outbound: false,
    eligibility_code: 'ITEM_ALREADY_MATCHED',
    item_unique: 'PRODUCT-CODE',
    sku_name: 'Máy thử ✓',
    sku_code: 'SKU-TEST',
    serial_number: 'NOT-PRODUCT-CODE',
    private: 'DROP',
    reservation: {
      redacted: true,
      can_open: false,
      document_id: id(99),
      doc_no: 'PRIVATE',
    },
  });
  expect(await t.flow.scan('BAD', 'MANUAL')).toBe('invalid');
  const observed = t.flow.snapshot();
  expect(p05ExceptionView(observed)?.panel).toBe('P17.S02');
  expect(observed.rejected).toMatchObject({
    raw: 'BAD',
    product: { code: 'PRODUCT-CODE', name: 'Máy thử ✓', sku: 'SKU-TEST' },
    relatedDocument: { kind: 'redacted' },
  });
  expect(JSON.stringify(observed.rejected)).not.toMatch(
    /PRIVATE|DROP|NOT-PRODUCT-CODE/,
  );
  expect(t.calls.length).toBe(writes);
  const saved = JSON.parse(
    t.storage.getString(
      t.storage.keys().find(k => k.startsWith('hn-p05-create-v1:'))!,
    )!,
  );
  expect(saved.state.rejected).toBeUndefined();
  const scopeKey = t.flow.exceptionScope()!;
  expect(t.flow.dismissRejected(observed.rejected!.eventId, scopeKey)).toBe(
    true,
  );
  const after = t.flow.snapshot();
  for (const key of [
    'draftId',
    'scanSessionId',
    'version',
    'form',
    'accepted',
    'view',
    'serverDraft',
  ] as const)
    expect(after[key]).toEqual(before[key]);
  expect(t.calls.length).toBe(writes);
  expect(after.rejected).toBeNull();
});

test('P17 manual visible holder requires exact owner GET; a scope change during read cannot open or reveal stale data', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  let currentScope = { ...scope },
    finish!: (d: { id: string }) => void;
  const readRelated = jest.fn(
    () =>
      new Promise<{ id: string }>(resolve => {
        finish = resolve;
      }),
  );
  const owner = t.owner({ getScope: () => currentScope, readRelated });
  await owner.initialize();
  jest.spyOn(t.service, 'resolve').mockResolvedValue({
    eligible_for_outbound: false,
    eligibility_code: 'ITEM_ALREADY_MATCHED',
    reservation: {
      redacted: false,
      can_open: true,
      document_id: id(99),
      doc_no: 'PX-HOLDER',
    },
  });
  await owner.scan('HELD', 'MANUAL');
  const event = owner.snapshot().rejected!,
    binding = owner.exceptionScope()!;
  expect(await owner.readRejectedDocument(event.eventId, binding, id(98))).toBe(
    false,
  );
  expect(readRelated).not.toHaveBeenCalled();
  const pendingRead = owner.readRejectedDocument(
    event.eventId,
    binding,
    id(99),
  );
  expect(readRelated.mock.calls).toEqual([
    [id(99), { query: { warehouse_id: scope.warehouseId } }],
  ]);
  currentScope = { ...scope, authSessionId: id(999) };
  finish({ id: id(99) });
  expect(await pendingRead).toBe(false);
  expect(owner.exceptionScope()).toBeNull();
  expect(owner.dismissRejected(event.eventId, binding)).toBe(false);
});

test.each(['SAVE', 'RECORD'] as const)(
  'P17 manual %s UNKNOWN maps original identity and only GET-checks its receipt',
  async command => {
    const t = fixture();
    await fill(t);
    if (command === 'RECORD') {
      await t.flow.begin();
      await t.flow.scan('ITEM1', 'MANUAL');
      t.flow.review();
    }
    t.opts.lose = command;
    await (command === 'SAVE' ? t.flow.begin() : t.flow.send());
    const before = t.flow.snapshot(),
      request = JSON.stringify(before.pending);
    const view = p05ExceptionView(before);
    expect(view).toMatchObject({
      panel: 'P17.S04',
      owner: 'P05',
      phase: 'unknown',
      identity: {
        operationKey: before.pending!.key,
        draftId: before.draftId,
        scanSessionId: before.scanSessionId,
        version: before.version,
        command,
      },
    });
    const calls = t.calls.length;
    expect(await t.flow.check()).toBe(true);
    expect(
      t.calls.slice(calls).every(c => !c.method || c.method === 'GET'),
    ).toBe(true);
    expect(t.calls[calls].path).toBe(
      `/api/v1/mini-app/drafts/${before.draftId}/requests/${
        before.pending!.key
      }`,
    );
    expect(JSON.stringify(before.pending)).toBe(request);
    expect(t.flow.snapshot().pending).toBeNull();
    expect(p05ExceptionView(t.flow.snapshot())).toBeNull();
    expect(t.flow.snapshot().draftId).toBe(before.draftId);
  },
);

test('P17 manual holder GET denial removes the transient identity/link without releasing the reservation or writing', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  const readRelated = jest
    .fn()
    .mockResolvedValueOnce({ id: id(99) })
    .mockRejectedValueOnce(
      new P05ApiError('DENIED', 'Private', { status: 403 }),
    );
  const flow = t.owner({ readRelated });
  await flow.initialize();
  jest.spyOn(t.service, 'resolve').mockResolvedValue({
    eligible_for_outbound: false,
    reservation: {
      redacted: false,
      can_open: true,
      document_id: id(99),
      doc_no: 'HOLDER-PRIVATE',
    },
  });
  await flow.scan('HELD', 'MANUAL');
  const observed = flow.snapshot(),
    binding = flow.exceptionScope()!,
    calls = t.calls.length;
  expect(
    await flow.readRejectedDocument(
      observed.rejected!.eventId,
      binding,
      id(99),
    ),
  ).toBe(true);
  expect(
    await flow.readRejectedDocument(
      observed.rejected!.eventId,
      binding,
      id(99),
    ),
  ).toBe(false);
  expect(flow.snapshot().rejected?.relatedDocument).toEqual({
    kind: 'unavailable',
  });
  expect(JSON.stringify(flow.snapshot().rejected)).not.toContain(
    'HOLDER-PRIVATE',
  );
  expect(flow.snapshot().accepted).toEqual(observed.accepted);
  expect(t.calls.length).toBe(calls);
  expect(readRelated).toHaveBeenCalledTimes(2);
});

test.each(['leave', 'dispose'] as const)(
  'catalogue read aborts on %s without changing private command identity',
  async action => {
    const t = fixture();
    await t.flow.initialize();
    const before = t.flow.snapshot();
    let signal: AbortSignal | undefined, release!: (value: any) => void;
    jest.spyOn(t.service, 'catalogue').mockImplementation(s => {
      signal = s;
      return new Promise(resolve => {
        release = resolve;
      });
    });
    const waiting = t.flow.loadCatalogue();
    expect(signal?.aborted).toBe(false);
    t.flow[action]();
    expect(signal?.aborted).toBe(true);
    release({ recipients: [], groups: ['LATE'], skuGroups: {} });
    expect(await waiting).toBe(false);
    expect(t.flow.snapshot()).toMatchObject({
      catalogue: before.catalogue,
      version: before.version,
      draftId: before.draftId,
      scanSessionId: before.scanSessionId,
      pending: before.pending,
    });
    expect(t.calls.some(c => c.method === 'PUT' || c.method === 'POST')).toBe(
      false,
    );
  },
);
test('manual-create owner persists resolver binding before scan AND revalidation before RECORD', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  const resolve = t.service.resolve;
  const seen: any[] = [];
  jest.spyOn(t.service, 'resolve').mockImplementation(async (raw, binding) => {
    const saved = JSON.parse(
      t.storage.getString(
        t.storage.keys().find(k => k.startsWith('hn-p05-create-v1:'))!,
      )!,
    );
    expect(saved.state.ownerChecks.at(-1)).toMatchObject({
      requestId: binding!.requestId,
      outcome: 'IN_FLIGHT',
      body: { warehouse_id: scope.warehouseId, raw_code: raw },
    });
    seen.push(binding);
    return resolve(raw, binding);
  });
  await t.flow.scan('ITEM1', 'MANUAL');
  expect(t.flow.review()).toBe(true);
  await t.flow.send();
  expect(seen.map(c => c.purpose)).toEqual(['SCAN', 'REVALIDATE']);
  expect(seen[0].requestId).not.toBe(seen[1].requestId);
  expect(t.flow.snapshot().outcome).toBe('recorded');
});
test('create entry reads actual catalogues, filters INACTIVE, never queries/selects sources or invents PX', async () => {
  const t = fixture();
  await t.flow.initialize();
  expect(t.flow.snapshot().catalogue?.recipients.map(v => v.id)).toEqual([
    id(6),
  ]);
  expect(t.flow.snapshot().documentId).toBeNull();
  expect(t.flow.snapshot().form.plannedInput).toBe('1');
  expect(t.calls.some(c => c.path.includes('/sources'))).toBe(false);
  expect(t.calls.every(c => !c.method || c.method === 'GET')).toBe(true);
});
test.each([
  '0',
  '-1',
  '100',
  '01',
  '1.2',
  '1e1',
  '1 ',
  ' 1',
  '+1',
  '1,0',
  '99x',
  '',
])('rejects raw planned value %p', q => {
  expect(
    p05CreateErrors({ ...emptyP05CreateForm(), plannedInput: q }).plannedInput,
  ).toBeDefined();
});
test.each([
  '0301234567',
  '0501234567',
  '0701234567',
  '0801234567',
  '0901234567',
])('accepts an exact ten-digit mobile phone %p', v =>
  expect(validP05Phone(v)).toBe(true),
);
test.each([
  '0901 234 567',
  '+84 901 234 567',
  '02838221234',
  '0901234567x',
  '09<script>',
  '1e9',
  '090123456',
  '09012345678',
  '0101234567',
])('rejects a phone that is not the exact ten-digit mobile format %p', v =>
  expect(validP05Phone(v)).toBe(false),
);
test('phone input keeps digits only and never stores more than ten', () => {
  expect(sanitiseP05Phone('09a01 234-56789')).toBe('0901234567');
  expect(sanitiseP05Phone('+84 901 234 567')).toBe('8490123456');
});
test('owner normalises manual and catalogue phone values before persistence', async () => {
  const t = fixture();
  await t.flow.initialize();
  expect(t.flow.field('phone', '09a01 234-56789')).toBe(true);
  expect(t.flow.snapshot().form.phone).toBe('0901234567');
  expect(t.flow.choose('recipient', id(6))).toBe(true);
  expect(t.flow.snapshot().form.phone).toBe('0901234567');
});
test('begin blocks a non-empty invalid phone before creating a SAVE request', async () => {
  const t = fixture();
  await t.flow.initialize();
  t.flow.field('phone', '8412345678');
  const writesBefore = t.calls.filter(c => c.method === 'PUT').length;
  expect(await t.flow.begin()).toBe(false);
  expect(t.calls.filter(c => c.method === 'PUT')).toHaveLength(writesBefore);
  expect(t.flow.errors().phone).toContain('đúng 10 chữ số');
});
test('ordered geo choices reset dependent address; begin defers missing ward/address to RECORD', async () => {
  const t = fixture();
  await fill(t);
  expect(t.flow.choose('ward', '01001')).toBe(false);
  expect(t.flow.choose('province', '666')).toBe(false);
  t.flow.choose('province', '01');
  expect(t.flow.snapshot().form).toMatchObject({
    ward: '',
    wardName: '',
    address: '',
  });
  const putsBefore = t.calls.filter(c => c.method === 'PUT').length;
  expect(await t.flow.begin()).toBe(true);
  expect(t.calls.filter(c => c.method === 'PUT')).toHaveLength(putsBefore + 1);
});
test('full SAVE before scan; old body plus linked headers RECORD; server assigns document number', async () => {
  const t = fixture();
  await fill(t);
  expect(await t.flow.begin()).toBe(true);
  expect(await t.flow.scan('CODE-1', 'MANUAL')).toBe('valid');
  expect(t.flow.review()).toBe(true);
  expect(await t.flow.send()).toBe(true);
  const q = t.calls.find(c => c.path.endsWith('/record'))!;
  expect(q.body).toMatchObject({
    name: 'Xuất kiểm thử',
    recipient_name: 'Khách vãng lai',
    recipient_contact_phone: '0901234567',
    recipient_address: '12 Hoa Nam, Phường A, TP.HCM',
    note: 'Ghi chú\nUnicode ✓',
    expected_total_qty: 1,
    items: [{ raw_code: 'CODE-1', scan_source: 'MANUAL' }],
  });
  expect(q.body).not.toHaveProperty('source_document_id');
  expect(q.headers?.['X-Draft-Version']).toBe('2');
  expect(t.flow.snapshot()).toMatchObject({
    step: 4,
    documentId: id(90),
    documentNo: 'PX-SERVER',
    outcome: 'recorded',
  });
});
test('physical alias and wrong group do not increase accepted; group/plan locked after first code', async () => {
  const t = fixture();
  await fill(t, '2');
  await t.flow.begin();
  await t.flow.scan('CODE-1', 'MANUAL');
  t.opts.alias = true;
  expect(await t.flow.scan('ALIAS', 'MANUAL')).toBe('duplicate');
  t.opts.alias = false;
  t.opts.sku = id(8);
  expect(await t.flow.scan('CODE-2', 'MANUAL')).toBe('invalid');
  expect(t.flow.snapshot().accepted).toHaveLength(1);
  expect(t.flow.choose('group', 'Máy B')).toBe(false);
  expect(t.flow.field('plannedInput', '1')).toBe(false);
  expect(t.flow.review()).toBe(true);
  expect(t.flow.canRecord()).toBe(false);
});
test('Back edits metadata without losing codes; dirty form blocks RECORD until latest full SAVE', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  await t.flow.scan('CODE-1', 'MANUAL');
  t.flow.back();
  t.flow.field('note', 'Sửa ghi chú');
  expect(t.flow.snapshot().accepted).toHaveLength(1);
  await t.flow.begin();
  expect(t.flow.canRecord()).toBe(true);
  const save = t.calls.filter(c => c.method === 'PUT').at(-1)!;
  expect((save.body as any).form.p05_create.note).toBe('Sửa ghi chú');
});
test('lost RECORD response retains frozen identity through reload, reconcile opens success without second RECORD', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  await t.flow.scan('CODE-1', 'MANUAL');
  t.flow.review();
  t.opts.lose = 'RECORD';
  expect(await t.flow.send()).toBe(false);
  const frozen = t.flow.snapshot().pending;
  expect(t.flow.snapshot().unknown).toBe(true);
  expect(t.flow.field('note', 'Change')).toBe(false);
  const resumed = t.owner();
  await resumed.initialize();
  expect(resumed.snapshot().pending).toEqual(frozen);
  expect(await resumed.check()).toBe(true);
  expect(resumed.snapshot().documentNo).toBe('PX-SERVER');
  expect(t.calls.filter(c => c.path.endsWith('/record'))).toHaveLength(1);
});
test('terminal success reentry gets fresh IDs; unresolved SAVE never resets or permits RECORD', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  await t.flow.scan('CODE-1', 'MANUAL');
  t.flow.review();
  await t.flow.send();
  const old = t.flow.snapshot().draftId,
    fresh = t.owner();
  await fresh.initialize();
  expect(fresh.snapshot().draftId).not.toBe(old);
  expect(fresh.snapshot().accepted).toHaveLength(0);
  expect(fresh.snapshot().form).toEqual(emptyP05CreateForm());
  const u = fixture();
  await fill(u);
  u.opts.lose = 'SAVE';
  await u.flow.begin();
  const frozen = u.flow.snapshot().pending;
  await u.flow.initialize();
  expect(u.flow.snapshot().pending).toEqual(frozen);
  expect(u.flow.canRecord()).toBe(false);
});
test('double submit has one RECORD', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  await t.flow.scan('CODE-1', 'MANUAL');
  t.flow.review();
  await Promise.all([t.flow.send(), t.flow.send()]);
  expect(t.calls.filter(c => c.path.endsWith('/record'))).toHaveLength(1);
});
test('invalid RECORD receipt stays UNKNOWN; missing/altered confirmation cannot reset or report success', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  await t.flow.scan('CODE-1', 'MANUAL');
  t.flow.review();
  t.opts.badReceipt = true;
  expect(await t.flow.send()).toBe(false);
  expect(t.flow.snapshot()).toMatchObject({
    outcome: null,
    unknown: true,
    step: 3,
    documentId: null,
  });
  expect(t.flow.snapshot().pending?.command).toBe('RECORD');
  const again = t.owner();
  await again.initialize();
  expect(again.snapshot().pending).toEqual(t.flow.snapshot().pending);
});
test('read context failure preserves unresolved SAVE journal before any successful context read', async () => {
  const t = fixture();
  await fill(t);
  t.opts.lose = 'SAVE';
  await t.flow.begin();
  const q = t.flow.snapshot().pending;
  t.opts.contextFail = true;
  const reopened = t.owner();
  expect(await reopened.initialize()).toBe(false);
  expect(reopened.snapshot().pending).toEqual(q);
  const third = t.owner();
  t.opts.contextFail = false;
  await third.initialize();
  expect(third.snapshot().pending).toEqual(q);
  expect(await third.check()).toBe(true);
});
test('confirmed RECORD rejection resets only on new entry, UNKNOWN does not', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  await t.flow.scan('CODE-1', 'MANUAL');
  t.flow.review();
  t.opts.recordFail = 'VALIDATION_ERROR';
  expect(await t.flow.send()).toBe(false);
  expect(t.flow.snapshot()).toMatchObject({
    outcome: 'not-recorded',
    pending: null,
    unknown: false,
  });
  const original = t.flow.snapshot().draftId,
    fresh = t.owner();
  await fresh.initialize();
  expect(fresh.snapshot().draftId).not.toBe(original);
  expect(fresh.snapshot().accepted).toHaveLength(0);
});
test('eligibility changes immediately before RECORD block it without losing codes or form', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  await t.flow.scan('CODE-1', 'MANUAL');
  t.flow.review();
  t.opts.invalid = true;
  expect(await t.flow.send()).toBe(false);
  expect(t.flow.snapshot().accepted).toHaveLength(1);
  expect(t.calls.filter(c => c.path.endsWith('/record'))).toHaveLength(0);
});
test('leaving while preflight is pending cannot dispatch RECORD into a later route', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  await t.flow.scan('CODE-1', 'MANUAL');
  t.flow.review();
  let complete!: () => void;
  t.opts.holdContext = new Promise<void>(r => {
    complete = r;
  });
  const sending = t.flow.send();
  t.flow.leave();
  complete();
  expect(await sending).toBe(false);
  expect(t.calls.filter(c => c.path.endsWith('/record'))).toHaveLength(0);
});
test('address response from previously selected province cannot populate a later province', async () => {
  const t = fixture();
  let complete!: (v: Awaited<ReturnType<typeof t.geo.wards>>) => void;
  const delayed = t.owner({
    geo: {
      ...t.geo,
      wards: async (code: string) =>
        code === '79'
          ? new Promise(r => {
              complete = r;
            })
          : t.geo.wards(code),
    },
  });
  await delayed.initialize();
  delayed.choose('province', '79');
  delayed.choose('province', '01');
  await delayed.loadGeo('01');
  complete({ items: [{ code: '79001', name: 'Phường A' }], stale: false });
  await Promise.resolve();
  expect(delayed.snapshot().geo.wardsProvince).toBe('01');
  expect(delayed.choose('ward', '79001')).toBe(false);
});
test('CANCEL requires verified SAVE version and clears only this create journal after confirmation', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  const identity = t.flow.snapshot().draftId;
  expect(await t.flow.discard()).toBe(true);
  expect(t.flow.snapshot().draftId).not.toBe(identity);
  const q = t.calls.find(c => c.path.endsWith('/cancel'))!;
  expect(q.headers?.['If-Match']).toBe('"1"');
  expect((q.body as any).confirmed_request_id).toBe(
    t.calls.find(c => c.method === 'PUT')!.headers?.['Idempotency-Key'],
  );
});
test('TEXT catalogue address exact-matches province and ward, then separates delivery detail', async () => {
  const t = fixture();
  t.opts.recipientAddress = '218 Điện Biên Phủ, Phường A, TP.HCM';
  await t.flow.initialize();
  t.flow.choose('recipient', id(6));
  await new Promise<void>(r => setTimeout(r, 0));
  expect(t.flow.snapshot().form).toMatchObject({
    recipient: 'Người nhận thật',
    phone: '0901234567',
    address: '218 Điện Biên Phủ',
    province: '79',
    provinceName: 'TP.HCM',
    ward: '79001',
    wardName: 'Phường A',
  });
  expect(p05DeliveryAddress(t.flow.snapshot().form)).toBe(
    '218 Điện Biên Phủ, Phường A, TP.HCM',
  );
  t.flow.choose('province', '01');
  expect(t.flow.snapshot().form).toMatchObject({ address: '', ward: '' });
});
test('TEXT catalogue address never invents a ward when no exact ward segment exists', async () => {
  const t = fixture();
  t.opts.recipientAddress = 'Khối phố 5, Tam Kỳ, TP.HCM';
  await t.flow.initialize();
  t.flow.choose('recipient', id(6));
  await new Promise<void>(r => setTimeout(r, 0));
  expect(t.flow.snapshot().form).toMatchObject({
    province: '79',
    provinceName: 'TP.HCM',
    ward: '',
    wardName: '',
    address: 'Khối phố 5, Tam Kỳ',
  });
  expect(t.flow.errors().ward).toBeDefined();
});
test('legacy Quảng Nam address exact-maps to current Đà Nẵng and Tam Kỳ units', async () => {
  const t = fixture();
  t.opts.recipientAddress = 'Khối phố 5, TP. Tam Kỳ, Quảng Nam';
  await t.flow.initialize();
  t.flow.choose('recipient', id(6));
  await new Promise<void>(r => setTimeout(r, 0));
  expect(t.flow.snapshot().form).toMatchObject({
    province: '48',
    provinceName: 'Thành phố Đà Nẵng',
    ward: '20341',
    wardName: 'Phường Tam Kỳ',
    address: 'Khối phố 5',
  });
  expect(p05DeliveryAddress(t.flow.snapshot().form)).toBe(
    'Khối phố 5, Phường Tam Kỳ, Thành phố Đà Nẵng',
  );
});
test('restored draft reconciles a previously incomplete TEXT address after the directory gains an exact ward', async () => {
  const t = fixture();
  t.opts.recipientAddress = 'Khối phố 5, TP.HCM';
  await t.flow.initialize();
  t.flow.choose('recipient', id(6));
  await new Promise<void>(r => setTimeout(r, 0));
  expect(t.flow.snapshot().form).toMatchObject({
    province: '79',
    provinceName: 'TP.HCM',
    ward: '',
    wardName: '',
    address: 'Khối phố 5',
  });

  t.flow.dispose();
  t.opts.recipientAddress = 'Khối phố 5, Phường A, TP.HCM';
  const restored = t.owner();
  expect(await restored.initialize()).toBe(true);
  expect(restored.snapshot().form).toMatchObject({
    recipientId: id(6),
    province: '79',
    provinceName: 'TP.HCM',
    ward: '79001',
    wardName: 'Phường A',
    address: 'Khối phố 5',
  });
  expect(p05DeliveryAddress(restored.snapshot().form)).toBe(
    'Khối phố 5, Phường A, TP.HCM',
  );
});
test('restored TEXT address keeps its exact detail when the missing ward is selected manually', async () => {
  const t = fixture();
  t.opts.recipientAddress = 'Khối phố 5, TP.HCM';
  await t.flow.initialize();
  t.flow.choose('recipient', id(6));
  await new Promise<void>(r => setTimeout(r, 0));
  t.flow.dispose();

  const restored = t.owner();
  expect(await restored.initialize()).toBe(true);
  expect(restored.snapshot().form).toMatchObject({
    province: '79',
    ward: '',
    address: 'Khối phố 5',
  });
  expect(restored.choose('ward', '79001')).toBe(true);
  expect(restored.snapshot().form).toMatchObject({
    province: '79',
    ward: '79001',
    address: 'Khối phố 5',
  });
});
test('structured v2 catalogue address fills verified province/ward/detail and full SAVE preserves it', async () => {
  const t = fixture();
  t.opts.recipientAddress = JSON.stringify({
    detail: '12 Hoa Nam',
    province_code: 79,
    province: 'TP.HCM',
    ward_code: 79001,
    ward: 'Phường A',
  });
  await t.flow.initialize();
  t.flow.choose('recipient', id(6));
  await new Promise<void>(r => setTimeout(r, 0));
  expect(t.flow.snapshot().form).toMatchObject({
    province: '79',
    provinceName: 'TP.HCM',
    ward: '79001',
    wardName: 'Phường A',
    address: '12 Hoa Nam',
    originalAddress: t.opts.recipientAddress,
  });
  t.flow.field('name', 'E2E');
  t.flow.choose('group', 'Máy A');
  expect(await t.flow.begin()).toBe(true);
  const q = t.calls.find(c => c.method === 'PUT')!;
  expect((q.body as any).form.p05_create.address).toBe('12 Hoa Nam');
});
test('delayed auto ward fill cannot replace a newer recipient or manually changed province', async () => {
  const t = fixture();
  t.opts.recipientAddress = JSON.stringify({
    detail: 'Address',
    province_code: 79,
    ward_code: 79001,
  });
  let complete!: (v: Awaited<ReturnType<typeof t.geo.wards>>) => void;
  const f = t.owner({
    geo: {
      ...t.geo,
      wards: async (code: string) =>
        code === '79'
          ? new Promise(r => {
              complete = r;
            })
          : t.geo.wards(code),
    },
  });
  await f.initialize();
  f.choose('recipient', id(6));
  f.choose('recipient', 'walk-in');
  f.field('recipient', 'New recipient');
  complete({ items: [{ code: '79001', name: 'Phường A' }], stale: false });
  await new Promise<void>(r => setTimeout(r, 0));
  expect(f.snapshot().form).toMatchObject({
    recipientId: 'walk-in',
    recipient: 'New recipient',
    province: '',
    ward: '',
    address: '',
  });
});
test('unknown ward in structured address is not treated as verified; user-entered detail remains exact', async () => {
  const t = fixture();
  t.opts.recipientAddress = JSON.stringify({
    detail: 'Original detail',
    province_code: 79,
    ward_code: 99999,
  });
  await t.flow.initialize();
  t.flow.choose('recipient', id(6));
  await new Promise<void>(r => setTimeout(r, 0));
  expect(t.flow.snapshot().form).toMatchObject({
    province: '79',
    ward: '',
    address: 'Original detail',
  });
  expect(t.flow.errors().ward).toBeDefined();
  t.flow.choose('ward', '79001');
  t.flow.field('address', 'Manually edited');
  t.flow.choose('recipient', id(6));
  expect(t.flow.snapshot().form.address).toBe('Manually edited');
});
test('product catalogue failure keeps verified ACTIVE recipient list available and blocks unverified group', async () => {
  const t = fixture();
  t.opts.productFailure = true;
  await t.flow.initialize();
  const s = t.flow.snapshot();
  expect(s.catalogue?.recipients.map(v => v.id)).toEqual([id(6)]);
  expect(s.catalogue?.groups).toEqual([]);
  expect(s.catalogue?.groupError).toContain('trùng định danh');
  expect(t.flow.choose('recipient', id(6))).toBe(true);
  expect(t.flow.choose('group', 'Máy A')).toBe(false);
});

test('identical duplicate product rows across pages are safe for distinct group selection', async () => {
  const t = fixture();
  t.opts.productDuplicate = 'identical';
  await t.flow.initialize();
  expect(t.flow.snapshot().catalogue).toMatchObject({
    groups: ['Máy A'],
    skuGroups: { [id(7)]: 'Máy A' },
  });
  expect(t.flow.snapshot().catalogue?.groupError).toBeUndefined();
  expect(t.flow.choose('group', 'Máy A')).toBe(true);
});

test('same sku id with conflicting group metadata remains blocked', async () => {
  const t = fixture();
  t.opts.productDuplicate = 'conflict';
  await t.flow.initialize();
  expect(t.flow.snapshot().catalogue?.groups).toEqual([]);
  expect(t.flow.snapshot().catalogue?.groupError).toContain(
    'lặp định danh không nhất quán',
  );
  expect(t.flow.choose('group', 'Máy A')).toBe(false);
});

test.each(['strong', 'weak'] as const)(
  'matching %s ETag confirms SAVE/resume/CANCEL without false UNKNOWN and requests keep explicit strong If-Match',
  async etag => {
    const t = fixture();
    t.opts.etag = etag;
    await fill(t);
    expect(await t.flow.begin()).toBe(true);
    expect(await t.flow.scan('CODE-1', 'MANUAL')).toBe('valid');
    expect(t.flow.snapshot()).toMatchObject({
      version: 2,
      unknown: false,
      pending: null,
    });
    expect(t.flow.review()).toBe(true);
    expect(t.flow.canRecord()).toBe(true);
    const original = t.flow.snapshot();
    const resumed = t.owner();
    expect(await resumed.initialize()).toBe(true);
    expect(resumed.snapshot().error).toBe('');
    expect(resumed.snapshot()).toMatchObject({
      draftId: original.draftId,
      version: 2,
      unknown: false,
    });
    expect(resumed.snapshot().accepted).toEqual(original.accepted);
    expect(resumed.canRecord()).toBe(true);
    expect(await resumed.discard()).toBe(true);
    expect(resumed.snapshot().draftId).not.toBe(original.draftId);
    expect(
      t.calls.filter(c => c.method === 'PUT').map(c => c.headers?.['If-Match']),
    ).toEqual(['"0"', '"1"']);
    expect(
      t.calls.find(c => c.path.endsWith('/cancel'))?.headers?.['If-Match'],
    ).toBe('"2"');
    expect(t.calls.filter(c => c.path.endsWith('/record'))).toHaveLength(0);
  },
);

test.each(['wrong', 'malformed'] as const)(
  '%s response ETag retains frozen SAVE/UNKNOWN, does not claim success or issue RECORD, and reconcile reuses original key',
  async etag => {
    const t = fixture();
    t.opts.etag = etag;
    await fill(t);
    expect(await t.flow.begin()).toBe(false);
    const pending = t.flow.snapshot().pending;
    expect(t.flow.snapshot()).toMatchObject({ version: 0, unknown: true });
    expect(t.flow.field('note', 'Cannot overwrite')).toBe(false);
    expect(t.flow.canRecord()).toBe(false);
    expect(t.calls.filter(c => c.method === 'PUT')).toHaveLength(1);
    expect(await t.flow.check()).toBe(true);
    expect(
      t.calls
        .find(c => c.path.includes('/requests/'))
        ?.path.endsWith(pending!.key),
    ).toBe(true);
    expect(t.calls.filter(c => c.method === 'PUT')).toHaveLength(1);
  },
);

test('invalid ACTIVE recipient metadata fails only recipient catalogue; verified product group remains available', async () => {
  const t = fixture();
  t.opts.recipientName = '';
  await t.flow.initialize();
  const c = t.flow.snapshot().catalogue;
  expect(c?.recipients).toEqual([]);
  expect(c?.recipientError).toContain('Thiếu tên');
  expect(c?.groups).toEqual(['Máy A', 'Máy B']);
  expect(c?.groupError).toBeUndefined();
  expect(t.calls.some(r => r.method === 'PUT' || r.method === 'POST')).toBe(
    false,
  );
});

test('retained raw duplicate at full plan adds a duplicate attempt, preserves SAVE and resumes without resolving again', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  await t.flow.scan('CODE-1', 'MANUAL');
  const saved = t.flow.snapshot(),
    calls = t.calls.length;
  expect(await t.flow.scan('CODE-1', 'MANUAL')).toBe('duplicate');
  const after = t.flow.snapshot();
  expect(after.accepted).toEqual(saved.accepted);
  expect(after.version).toBe(saved.version);
  expect(after.saveReceiptKey).toBe(saved.saveReceiptKey);
  expect(after.pending).toBeNull();
  expect(after.attempts.map(a => a.kind)).toEqual(['valid', 'duplicate']);
  expect(after.message).toContain('không cộng số lượng');
  expect(t.calls).toHaveLength(calls);
  const resumed = t.owner();
  await resumed.initialize();
  expect(resumed.snapshot().attempts).toEqual(after.attempts);
  expect(resumed.review()).toBe(true);
  expect(resumed.canRecord()).toBe(true);
});

test('physical alias at full plan is still classified as duplicate without another SAVE', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  await t.flow.scan('CODE-1', 'MANUAL');
  t.opts.alias = true;
  expect(await t.flow.scan('ALIAS', 'MANUAL')).toBe('duplicate');
  expect(t.flow.snapshot().accepted).toHaveLength(1);
  expect(t.flow.snapshot().attempts.map(a => a.kind)).toEqual([
    'valid',
    'duplicate',
  ]);
  expect(t.calls.filter(c => c.method === 'PUT')).toHaveLength(2);
});

test('confirmed missing physical code counts each manual attempt and remains retryable before valid SAVE', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  t.opts.resolveFailure = new P05ApiError(
    'PHYSICAL_CODE_NOT_FOUND',
    'Không có mã',
    { status: 422 },
  );
  expect(await t.flow.scan('MISSING', 'MANUAL')).toBe('invalid');
  expect(await t.flow.scan('MISSING', 'MANUAL')).toBe('invalid');
  expect(t.flow.snapshot()).toMatchObject({
    version: 1,
    accepted: [],
    pending: null,
    unknown: false,
    error: '',
  });
  expect(t.flow.snapshot().attempts.map(a => a.kind)).toEqual([
    'invalid',
    'invalid',
  ]);
  expect(t.calls.filter(c => c.method === 'PUT')).toHaveLength(1);
  t.opts.resolveFailure = null;
  expect(await t.flow.scan('CODE-1', 'MANUAL')).toBe('valid');
  expect(t.flow.snapshot().attempts.map(a => a.kind)).toEqual([
    'invalid',
    'invalid',
    'valid',
  ]);
  expect(t.flow.snapshot()).toMatchObject({
    version: 2,
    pending: null,
    unknown: false,
  });
  expect(t.flow.snapshot().accepted).toHaveLength(1);
});

test.each([
  new P05ApiError('TIMEOUT', 'Mất phản hồi', { unknown: true }),
  new P05ApiError('HTTP_ERROR', 'Lỗi server', { status: 503, unknown: true }),
  new P05ApiError('DENIED', 'Không có quyền', { status: 401 }),
  new P05ApiError('PHYSICAL_CODE_NOT_FOUND', 'Chưa xác minh', {
    status: 422,
    unknown: true,
  }),
])(
  'unconfirmed or denied resolver response %p never counts an invalid item',
  async error => {
    const t = fixture();
    await fill(t);
    await t.flow.begin();
    t.opts.resolveFailure = error;
    expect(await t.flow.scan('CODE-1', 'MANUAL')).toBe(false);
    expect(t.flow.snapshot()).toMatchObject({
      version: 1,
      accepted: [],
      attempts: [],
      pending: null,
    });
    expect(t.calls.filter(c => c.method === 'PUT')).toHaveLength(1);
  },
);

test('late resolver rejection after leaving never adds an attempt to the retained draft', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  let release!: () => void;
  t.opts.holdResolve = new Promise<void>(r => {
    release = r;
  });
  t.opts.resolveFailure = new P05ApiError(
    'PHYSICAL_CODE_NOT_FOUND',
    'Không có mã',
    { status: 422 },
  );
  const waiting = t.flow.scan('MISSING', 'MANUAL');
  t.flow.leave();
  release();
  expect(await waiting).toBe(false);
  expect(t.flow.snapshot()).toMatchObject({
    accepted: [],
    attempts: [],
    version: 1,
    scanBusy: false,
  });
});

test('new valid item after full plan cannot increase quantity, SAVE version or request key', async () => {
  const t = fixture();
  await fill(t);
  await t.flow.begin();
  await t.flow.scan('CODE-1', 'MANUAL');
  const saved = t.flow.snapshot();
  expect(await t.flow.scan('CODE-2', 'MANUAL')).toBe(false);
  expect(t.flow.snapshot()).toMatchObject({
    accepted: saved.accepted,
    version: saved.version,
    saveReceiptKey: saved.saveReceiptKey,
    pending: null,
  });
  expect(t.flow.snapshot().message).toContain('Đã soạn đủ kế hoạch');
  expect(t.calls.filter(c => c.method === 'PUT')).toHaveLength(2);
});
