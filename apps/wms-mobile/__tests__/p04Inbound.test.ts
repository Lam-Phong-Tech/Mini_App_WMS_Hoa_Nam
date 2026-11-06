// Contract fixtures from the authoritative a304b14e controller. No live calls.
import {
  createP04Service,
  type P04Body,
  type P04Item,
} from '../src/services/wms/p04Inbound';
import { createP04Flow, p04Body } from '../src/features/inbound/p04Flow';
import { createMemoryBackend, createStorage } from '../src/storage/storage';
import { AppError } from '../src/errors/AppError';
import type { RequestOptions } from '../src/api/client';
import type { Session } from '../src/auth/session';
import {
  approvedWriteFor,
  allowsIdempotencyKey,
  allowsIfMatch,
} from '../src/api/writeGate';
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  auth = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  warehouse = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  business = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
function fixture() {
  let session: Session = {
    accessToken: 'isolated-test-token',
    userId: actor,
    authSessionId: auth,
    activeWarehouseId: warehouse,
    userName: 'Actor test',
  };
  const storage = createStorage(createMemoryBackend()),
    calls: RequestOptions[] = [],
    receipts = new Map<string, unknown>();
  let version = 0,
    status = 'DRAFT',
    saved: P04Body | undefined,
    draftId = '',
    recordCount = 0,
    timeout: 'SAVE' | 'RECORD' | undefined,
    mismatch = false,
    permissions = true,
    categoriesSupported = false,
    rejectRecord = false,
    rejectInactiveSku = false,
    draftNumbering = false;
  const envelope = (data: unknown, meta: Record<string, unknown> = {}) => ({
    success: true,
    data,
    meta: { contract: 'mini-app-p04-v1', ...meta },
  });
  const document = () => ({
    document_id: draftId,
    document_kind: 'STAGING_DRAFT',
    actor_id: actor,
    auth_session_id: auth,
    warehouse_id: warehouse,
    operation: 'INBOUND',
    scan_session_id: saved!.scan_session_id,
    version,
    status,
    codes: saved!.items.map(i => ({
      raw_code: i.raw_code,
      quantity: i.quantity,
      scan_source: i.scan_source,
    })),
    form: {
      p04_contract: 'mini-app-p04-v1',
      metadata: { inbound_type: 'receipt' },
    },
    codes_validated: false,
    business_document_id: status === 'RECORDED' ? business : null,
    business_status: status === 'RECORDED' ? 'SCANNING' : null,
    last_request_id: null,
    stock_effect: 'NONE',
    metadata: {
      inbound_type: 'receipt',
      name: saved!.name,
      note: saved!.note,
      supplier_id: saved!.supplier_id,
    },
    items: saved!.items,
    document_no:
      status === 'RECORDED' || (draftNumbering && version > 0)
        ? 'PN-TEST-1'
        : null,
    scan_session: {
      document_id: draftId,
      scan_session_id: saved!.scan_session_id,
      auth_session_id: auth,
      warehouse_id: warehouse,
      status: status === 'DRAFT' ? 'OPEN' : 'CLOSED',
      document_version: version,
      expires_at: null,
      expiry_policy: 'AUTH_SESSION',
    },
    created_at: '2026-10-07T08:00:00Z',
    updated_at: '2026-10-07T08:01:00Z',
  });
  const receipt = (key: string, command: string) => ({
    request_id: key,
    document_id: draftId,
    scan_session_id: saved!.scan_session_id,
    warehouse_id: warehouse,
    operation: 'INBOUND',
    command,
    version,
    outcome: 'SUCCEEDED',
    committed_at: '2026-10-07T08:01:00Z',
  });
  function row(i: P04Item, index = 0) {
    const duplicate = saved!.items.some(
      p => p.raw_code.toUpperCase() === i.raw_code.toUpperCase(),
    );
    const rejected = i.raw_code === 'BAD';
    const requiresType = i.raw_code === 'NEW' && !i.new_sku_type;
    return {
      row_no: index + 1,
      raw_code: i.raw_code,
      outcome:
        rejected || requiresType
          ? 'REJECTED'
          : duplicate
          ? 'DUPLICATE'
          : 'ACCEPTED',
      reason_code: rejected
        ? 'CODE_REJECTED'
        : requiresType
        ? 'NEW_SKU_TYPE_REQUIRED'
        : duplicate
        ? 'DUPLICATE_ITEM_IN_BATCH'
        : null,
      quantity: i.quantity,
      ...(rejected
        ? {}
        : {
            resolved: {
              item_type: i.raw_code.startsWith('BOX') ? 'BOX' : 'ITEM',
              sku_id: null,
              sku_code: 'SKU-A',
              sku_name: 'Name from BE',
              sku_type: 'PRODUCT',
              item_id: null,
              item_unique: i.raw_code,
              serial_number: i.raw_code,
              box_number: i.raw_code.startsWith('BOX') ? '01' : null,
              requires_quantity: i.raw_code.startsWith('BOX'),
              requires_new_sku_type: i.raw_code === 'NEW',
              is_serial_tracked: true,
              warehouse_id: warehouse,
              stock_effect: 'NONE',
            },
          }),
    };
  }
  const client = {
    request: jest.fn(async (options: RequestOptions) => {
      calls.push(copy(options));
      const path = options.path,
        method = options.method ?? 'GET',
        key = options.headers?.['Idempotency-Key'];
      if (path.endsWith('/context'))
        return {
          status: 200,
          data: envelope({
            actor_id: actor,
            auth_session_id: auth,
            active_warehouse_id: warehouse,
            warehouse_context: { status: 'READY' },
            warehouse_status: 'ACTIVE',
            inbound_supported: true,
            ...(draftNumbering
              ? { document_number_assignment: 'WITH_DRAFT_SAVE' }
              : {}),
            ...(categoriesSupported
              ? {
                  ui_metadata_extension: 'p04-ui-options-v1',
                  inbound_categories: [
                    { id: 'PRODUCT', label: 'Nhập sản phẩm' },
                    { id: 'COMPONENT', label: 'Nhập linh kiện' },
                    { id: 'OTHER', label: 'Khác' },
                  ],
                }
              : {}),
            permissions: {
              read: true,
              save: permissions,
              cancel: true,
              record: permissions,
            },
            available_warehouses: [
              {
                warehouse_id: warehouse,
                name: 'Warehouse from BE',
                code: 'KHO-TONG-HN',
                status: 'ACTIVE',
              },
            ],
          }),
        };
      if (path.endsWith('/types'))
        return {
          status: 200,
          data: envelope([
            {
              id: 'receipt',
              code: 'receipt',
              label: 'Nhập kho',
              allowed: permissions,
            },
          ]),
        };
      if (method === 'PUT') {
        const previous = version;
        saved = copy(options.body as P04Body);
        draftId = path.split('/').at(-1)!;
        version++;
        const body = envelope({
          document: document(),
          receipt: receipt(key!, 'SAVE'),
        });
        receipts.set(key!, body);
        if (timeout === 'SAVE') {
          timeout = undefined;
          throw new AppError({
            kind: 'timeout',
            message: 'response lost after commit',
          });
        }
        return { status: previous === 0 ? 201 : 200, data: body };
      }
      if (path.endsWith('/scan-session'))
        return { status: 200, data: envelope(document().scan_session) };
      if (path.endsWith('/validate-code')) {
        const body = options.body as { client_event_id: string; item: P04Item };
        return {
          status: 200,
          data: envelope({
            document_id: draftId,
            scan_session_id: saved!.scan_session_id,
            version,
            client_event_id: body.client_event_id,
            event_persisted: false,
            result: rejectInactiveSku
              ? {
                  row_no: 1,
                  raw_code: body.item.raw_code,
                  outcome: 'REJECTED',
                  reason_code: 'SKU_INACTIVE',
                  message: 'SKU trong QR đang không Đang hoạt động.',
                }
              : row(body.item),
            scan_evidence_created: false,
            stock_effect: 'NONE',
          }),
        };
      }
      if (path.endsWith('/review')) {
        const items = saved!.items.map((i, index) => ({
          ...row(i, index),
          outcome: 'ACCEPTED',
          reason_code: null,
        }));
        return {
          status: 200,
          data: envelope({
            document: document(),
            metadata: document().metadata,
            supplier: null,
            items,
            sku_summary: [
              {
                sku_code: 'SKU-A',
                sku_name: 'Name from BE',
                quantity: items.reduce((n, i) => n + i.quantity, 0),
              },
            ],
            can_record: items.length > 0,
            revalidated_at: '2026-10-07T08:01:00Z',
            revalidation_policy: 'AGAIN_AT_RECORD',
            stock_effect: 'NONE',
            scan_evidence_created: false,
          }),
        };
      }
      if (path.endsWith('/record')) {
        recordCount++;
        if (rejectRecord) {
          rejectRecord = false;
          throw new AppError({
            kind: 'http',
            status: 409,
            code: 'ITEM_ALREADY_REGISTERED',
            message: 'Registered item rejected',
          });
        }
        status = 'RECORDED';
        version++;
        const r = receipt(key!, 'RECORD');
        const body = envelope(
          {
            document_id: business,
            doc_no: 'PN-TEST-1',
            draft_id: draftId,
            record_status: 'RECORDED',
            posted: false,
            status: 'SCANNING',
            stock_effect: 'NONE',
          },
          {
            p03_draft: {
              document: document(),
              receipt: mismatch ? { ...r, scan_session_id: auth } : r,
            },
          },
        );
        receipts.set(key!, body);
        if (timeout === 'RECORD') {
          timeout = undefined;
          throw new AppError({
            kind: 'timeout',
            message: 'response lost after commit',
          });
        }
        return { status: 201, data: body };
      }
      if (path.includes('/requests/')) {
        const original = receipts.get(path.split('/').at(-1)!) as
          | {
              data: { receipt?: unknown };
              meta: { p03_draft?: { receipt: unknown } };
            }
          | undefined;
        return {
          status: 200,
          data: envelope(
            original
              ? {
                  outcome: 'SUCCEEDED',
                  request_id: path.split('/').at(-1),
                  document_id: draftId,
                  scan_session_id: options.query?.scan_session_id,
                  warehouse_id: warehouse,
                  operation: 'INBOUND',
                  command: options.query?.command,
                  state: status,
                  document: document(),
                  receipt:
                    original.data.receipt ?? original.meta.p03_draft?.receipt,
                  response: original,
                  retry: 'NONE',
                  new_document_allowed: false,
                  cancel_allowed: false,
                }
              : {
                  outcome: 'UNKNOWN',
                  request_id: path.split('/').at(-1),
                  document_id: draftId,
                  scan_session_id: options.query?.scan_session_id,
                  warehouse_id: warehouse,
                  operation: 'INBOUND',
                  command: options.query?.command,
                  receipt: null,
                  response: null,
                  state: 'UNKNOWN',
                  retry: 'SAME_REQUEST_ONLY',
                  new_document_allowed: false,
                  cancel_allowed: false,
                },
          ),
        };
      }
      if (path.includes('/documents/'))
        return {
          status: 200,
          data: envelope({
            document: { id: business, dst_warehouse_id: warehouse },
            status: 'SCANNING',
            posted: false,
            history: [],
          }),
        };
      if (path.endsWith('/cancel')) {
        status = 'CANCELLED';
        version++;
        return {
          status: 200,
          data: envelope({
            document: document(),
            receipt: receipt(key!, 'CANCEL'),
          }),
        };
      }
      return { status: 200, data: envelope({ document: document() }) };
    }),
  };
  const service = createP04Service(
    client as unknown as Parameters<typeof createP04Service>[0],
    () => session,
  );
  const flow = () =>
    createP04Flow({ service, storage, getSession: () => session });
  return {
    flow,
    service,
    storage,
    calls,
    client,
    changeSession() {
      session = { ...session, authSessionId: actor };
    },
    setTimeout(v: 'SAVE' | 'RECORD') {
      timeout = v;
    },
    badReceipt() {
      mismatch = true;
    },
    denyWrites() {
      permissions = false;
    },
    enableCategories() {
      categoriesSupported = true;
    },
    rejectNextRecord() {
      rejectRecord = true;
    },
    rejectSkuAtValidate() {
      rejectInactiveSku = true;
    },
    enableDraftNumbering() {
      draftNumbering = true;
    },
    recordCount: () => recordCount,
    advanceVersion() {
      version++;
    },
    scope: { actorId: actor, authSessionId: auth, warehouseId: warehouse },
  };
}
async function ready(f: ReturnType<typeof fixture>) {
  const flow = f.flow();
  await flow.begin();
  const ui = flow.snapshot().run!.ui;
  flow.metadata({
    ...ui,
    name: 'Typed P04 test',
    note: 'Unicode ghi chú 👋',
    supplierId: undefined,
  });
  await flow.next();
  return flow;
}
test('P04 exact write routes only; no broad gate, DELETE, or Post capability', () => {
  expect(approvedWriteFor('PUT', '/api/v1/mini-app/inbound/drafts/id')).toBe(
    'p04.saveDraft',
  );
  expect(
    approvedWriteFor('POST', '/api/v1/mini-app/inbound/drafts/id/record'),
  ).toBe('p04.record');
  expect(
    approvedWriteFor('DELETE', '/api/v1/mini-app/inbound/drafts/id'),
  ).toBeUndefined();
  expect(
    approvedWriteFor('POST', '/api/v1/mini-app/inbound/drafts/id/post'),
  ).toBeUndefined();
  expect(
    allowsIdempotencyKey(
      'POST',
      '/api/v1/mini-app/inbound/drafts/id/validate-code',
    ),
  ).toBe(false);
  expect(
    allowsIfMatch('POST', '/api/v1/mini-app/inbound/drafts/id/review'),
  ).toBe(true);
});
test('typed metadata and accepted items are saved; record uses only identity/current version with a distinct key', async () => {
  const f = fixture(),
    flow = await ready(f);
  await flow.scan('CODE-A', 'MANUAL');
  await flow.next();
  await flow.record();
  const s = flow.snapshot();
  expect(s.run!.result!.data.doc_no).toBe('PN-TEST-1');
  const saves = f.calls.filter(c => c.method === 'PUT'),
    record = f.calls.find(c => c.path.endsWith('/record'))!;
  expect((saves.at(-1)!.body as P04Body).note).toBe('Unicode ghi chú 👋');
  expect((saves.at(-1)!.body as P04Body).items[0]).toMatchObject({
    raw_code: 'CODE-A',
    quantity: 1,
    scan_source: 'MANUAL',
  });
  expect(record.body).toEqual({
    warehouse_id: warehouse,
    scan_session_id: s.run!.identity.scanSessionId,
  });
  expect(record.headers!['If-Match']).toBe('"2"');
  expect(record.headers!['Idempotency-Key']).not.toBe(
    saves.at(-1)!.headers!['Idempotency-Key'],
  );
  expect(
    f.calls.some(
      c =>
        c.path.endsWith('/post-receipt') ||
        c.path === '/api/v1/mini-app/inbound/record',
    ),
  ).toBe(false);
  expect(
    JSON.stringify(f.storage.keys().map(k => f.storage.getObject(k))),
  ).not.toContain('isolated-test-token');
});
test('duplicate and reject retain raw attempts, never change accepted snapshot or quantity', async () => {
  const f = fixture(),
    flow = await ready(f);
  await flow.scan('CODE-A', 'CAMERA');
  await flow.scan('code-a', 'MANUAL');
  await flow.scan('BAD', 'MANUAL');
  const s = flow.snapshot().run!;
  expect(s.items).toHaveLength(1);
  expect(s.ui.scanAttempts!.map(a => a.kind)).toEqual([
    'valid',
    'duplicate',
    'invalid',
  ]);
  expect(s.ui.scanAttempts![1].raw).toBe('code-a');
});

test('P04 SKU_INACTIVE row without resolved data uses clear copy while retaining raw/identity and blocking record', async () => {
  const f = fixture(),
    flow = await ready(f);
  const before = flow.snapshot().run!;
  f.rejectSkuAtValidate();
  const raw = 'HN1|SKU=DF123456|ITEM=DF123456-01|SER=DF123456-01';
  const result = await flow.scan(raw, 'MANUAL');
  expect(result.row.reason_code).toBe('SKU_INACTIVE');
  expect(result.row.resolved).toBeUndefined();
  const after = flow.snapshot().run!;
  expect(after.identity).toEqual(before.identity);
  expect(after.items).toEqual(before.items);
  expect(after.ui.codes).toEqual(before.ui.codes);
  expect(after.server?.version).toBe(before.server?.version);
  expect(after.ui.scanAttempts!.at(-1)).toMatchObject({
    raw,
    kind: 'invalid',
    reason:
      'Sản phẩm DF123456 đang ngừng hoạt động. Liên hệ quản trị để kiểm tra.',
  });
  expect(await flow.record()).toBe(false);
  expect(f.recordCount()).toBe(0);
});
test('BOX and new SKU require explicit user options before saving an accepted item', async () => {
  const f = fixture(),
    flow = await ready(f);
  const box = await flow.scan('BOX-A-01', 'CAMERA');
  expect(box.requiresInput).toBe(true);
  expect(flow.snapshot().run!.items).toHaveLength(0);
  await flow.scan('BOX-A-01', 'CAMERA', { quantity: 7 }, box.eventId);
  const fresh = await flow.scan('NEW', 'MANUAL');
  expect(fresh.requiresInput).toBe(true);
  expect(flow.snapshot().run!.items).toHaveLength(1);
  await flow.scan(
    'NEW',
    'MANUAL',
    { new_sku_type: 'COMPONENT' },
    fresh.eventId,
  );
  expect(
    flow.snapshot().run!.items.map(i => [i.quantity, i.new_sku_type]),
  ).toEqual([
    [7, undefined],
    [1, 'COMPONENT'],
  ]);
});
test('save response lost after commit survives reload with exact body/key/version; reconcile precedes further writes', async () => {
  const f = fixture(),
    flow = f.flow();
  await flow.begin();
  flow.metadata({ ...flow.snapshot().run!.ui, name: 'Save test' });
  f.setTimeout('SAVE');
  await flow.next();
  const pending = copy(flow.snapshot().run!.pending!);
  flow.dispose();
  const restored = f.flow();
  await restored.begin();
  expect(restored.snapshot().run!.pending).toEqual(pending);
  const before = f.calls.filter(c => c.method === 'PUT').length;
  await restored.next();
  expect(f.calls.filter(c => c.method === 'PUT')).toHaveLength(before);
  await restored.check();
  expect(restored.snapshot().run!.pending).toBeUndefined();
  expect(restored.snapshot().run!.server!.version).toBe(1);
});
test('record UNKNOWN preserves request and cannot create a replacement; query confirms without a second record', async () => {
  const f = fixture(),
    flow = await ready(f);
  await flow.scan('CODE-A', 'MANUAL');
  await flow.next();
  f.setTimeout('RECORD');
  await flow.record();
  const frozen = copy(flow.snapshot().run!.pending!);
  expect(frozen.outcome).toBe('UNKNOWN');
  expect(flow.newRun()).toBe(false);
  await flow.record();
  expect(flow.snapshot().run!.pending).toEqual(frozen);
  await flow.check();
  expect(flow.snapshot().run!.result!.data.document_id).toBe(business);
  expect(f.recordCount()).toBe(1);
});
test('mismatched receipt can never open success, and session/kho isolation forbids old result reuse', async () => {
  const f = fixture(),
    flow = await ready(f);
  await flow.scan('CODE-A', 'MANUAL');
  await flow.next();
  f.badReceipt();
  await flow.record();
  expect(flow.snapshot().run!.result).toBeUndefined();
  expect(flow.snapshot().run!.pending!.outcome).toBe('UNKNOWN');
  f.changeSession();
  await flow.check();
  expect(flow.snapshot().run!.pending!.outcome).toBe('UNKNOWN');
  expect(f.recordCount()).toBe(1);
});
test('permission withdrawal blocks handler before record and keeps document/codes', async () => {
  const f = fixture(),
    flow = await ready(f);
  await flow.scan('CODE-A', 'MANUAL');
  await flow.next();
  const before = copy(flow.snapshot().run!);
  f.denyWrites();
  await flow.record();
  expect(f.recordCount()).toBe(0);
  expect(flow.snapshot().run!.identity).toEqual(before.identity);
  expect(flow.snapshot().run!.items).toEqual(before.items);
});
test('historical SAVE receipt remains valid when current document version advanced', async () => {
  const f = fixture(),
    flow = await ready(f);
  const run = flow.snapshot().run!;
  f.advanceVersion();
  const r = await f.service.reconcile(
    f.scope,
    run.identity,
    run.saveReceipt!.request_id,
    'SAVE',
  );
  expect(r.outcome).toBe('SUCCEEDED');
  expect((r.document as { version: number }).version).toBe(2);
});
test('result return uses exact business document ID; ordinary Home re-entry starts fresh and archives receipt', async () => {
  const f = fixture(),
    flow = await ready(f);
  await flow.scan('CODE-A', 'MANUAL');
  await flow.next();
  await flow.record();
  const original = flow.snapshot().run!;
  flow.dispose();
  const back = f.flow();
  await back.begin(business);
  expect(back.snapshot().run!.identity).toEqual(original.identity);
  expect(back.snapshot().run!.result!.data.document_id).toBe(business);
  back.dispose();
  const next = f.flow();
  await next.begin();
  expect(next.snapshot().run!.ui.step).toBe(0);
  expect(next.snapshot().run!.items).toHaveLength(0);
  expect(next.snapshot().run!.identity.documentId).not.toBe(
    original.identity.documentId,
  );
  expect(next.snapshot().run!.pending).toBeUndefined();
  expect(f.recordCount()).toBe(1);
});

test('three UI categories are kept locally, but an old server never receives a fabricated category field', async () => {
  const f = fixture(),
    flow = f.flow();
  await flow.begin();
  flow.metadata({
    ...flow.snapshot().run!.ui,
    name: 'Category test',
    inboundCategory: 'PRODUCT',
  });
  await flow.next();
  expect(f.calls.some(c => c.method === 'PUT')).toBe(false);
  expect(flow.snapshot().run!.ui.inboundCategory).toBe('PRODUCT');
  expect(flow.snapshot().message).toContain('chưa công bố');
});

test('TC20 opening a retained unnumbered checkpoint never auto-SAVEs it when numbering is newly enabled', async () => {
  const f = fixture(),
    first = f.flow();
  await first.begin();
  first.metadata({
    ...first.snapshot().run!.ui,
    name: 'Existing checkpoint — read only',
  });
  const before = copy(first.snapshot().run!);
  first.dispose();
  f.enableDraftNumbering();
  const restored = f.flow();
  expect(await restored.begin()).toBe(true);
  expect(restored.snapshot().resume).toBe(true);
  expect(restored.snapshot().run!.identity).toEqual(before.identity);
  expect(restored.snapshot().run!.ui).toEqual(before.ui);
  expect(f.calls.filter(c => c.method === 'PUT')).toHaveLength(0);
});

test('server-number capability opens S01 with a persisted real number and resumes the same draft without another save', async () => {
  const f = fixture();
  f.enableDraftNumbering();
  const flow = f.flow();
  expect(await flow.begin()).toBe(true);
  const original = flow.snapshot().run!;
  expect(original.server?.document_no).toBe('PN-TEST-1');
  expect(original.ui.step).toBe(0);
  expect(f.calls.filter(c => c.method === 'PUT')).toHaveLength(1);
  expect(
    (f.calls.find(c => c.method === 'PUT')!.body as P04Body).items,
  ).toEqual([]);
  flow.dispose();
  const restored = f.flow();
  expect(await restored.begin()).toBe(true);
  expect(restored.snapshot().run!.identity).toEqual(original.identity);
  expect(restored.snapshot().run!.server?.document_no).toBe('PN-TEST-1');
  expect(f.calls.filter(c => c.method === 'PUT')).toHaveLength(1);
});

test('initial number-save timeout restores UNKNOWN with the original request and never invents or replaces a number', async () => {
  const f = fixture();
  f.enableDraftNumbering();
  f.setTimeout('SAVE');
  const flow = f.flow();
  expect(await flow.begin()).toBe(false);
  const before = flow.snapshot().run!;
  expect(before.pending?.outcome).toBe('UNKNOWN');
  flow.dispose();
  const restored = f.flow();
  await restored.begin();
  expect(restored.snapshot().run!.identity).toEqual(before.identity);
  expect(restored.snapshot().run!.pending).toEqual(before.pending);
  expect(f.calls.filter(c => c.method === 'PUT')).toHaveLength(1);
  await restored.check();
  expect(restored.snapshot().run!.server?.document_no).toBe('PN-TEST-1');
  expect(restored.snapshot().run!.pending).toBeUndefined();
});

test('restored FAILED record shows recovery without a resume dialog or replay and preserves the frozen request', async () => {
  const f = fixture(),
    flow = await ready(f);
  await flow.scan('CODE-A', 'MANUAL');
  await flow.next();
  f.rejectNextRecord();
  expect(await flow.record()).toBe(false);
  const before = flow.snapshot().run!;
  expect(before.pending?.outcome).toBe('FAILED');
  flow.dispose();
  const restored = f.flow();
  await restored.begin();
  const state = restored.snapshot();
  expect(state.busy).toBe(false);
  expect(state.resume).toBe(false);
  expect(state.message).toBeTruthy();
  expect(state.run!.pending).toEqual(before.pending);
  expect(restored.metadata({ ...state.run!.ui, name: 'Must not edit' })).toBe(
    false,
  );
  expect(f.recordCount()).toBe(1);
  expect(await restored.recoverRejected()).toBe(true);
  expect(restored.snapshot().run!.identity).toEqual(before.identity);
  expect(restored.snapshot().run!.items).toEqual(before.items);
  expect(restored.snapshot().run!.pending).toBeUndefined();
  expect(f.recordCount()).toBe(1);
});
test('advertised category capability sends and retains each selected category in the full typed snapshot', async () => {
  for (const category of ['PRODUCT', 'COMPONENT', 'OTHER'] as const) {
    const f = fixture();
    f.enableCategories();
    const flow = f.flow();
    await flow.begin();
    flow.metadata({
      ...flow.snapshot().run!.ui,
      name: 'Category test',
      inboundCategory: category,
    });
    await flow.next();
    expect(flow.snapshot().run!.ui.step).toBe(1);
    expect(
      (f.calls.find(c => c.method === 'PUT')!.body as P04Body).inbound_category,
    ).toBe(category);
  }
});

test('Continue rechecks a category capability deployed while S01 is already open and keeps the same draft identity', async () => {
  const f = fixture(),
    flow = f.flow();
  await flow.begin();
  flow.metadata({
    ...flow.snapshot().run!.ui,
    name: 'Release changed',
    inboundCategory: 'COMPONENT',
    note: 'Keep exact note',
  });
  const identity = flow.snapshot().run!.identity;
  expect(await flow.next()).toBe(false);
  expect(f.calls.some(c => c.method === 'PUT')).toBe(false);
  f.enableCategories();
  expect(await flow.next()).toBe(true);
  expect(flow.snapshot().run!.ui.step).toBe(1);
  expect(flow.snapshot().run!.identity).toEqual(identity);
  const save = f.calls.find(c => c.method === 'PUT')!;
  expect((save.body as P04Body).inbound_category).toBe('COMPONENT');
  expect((save.body as P04Body).note).toBe('Keep exact note');
  expect(save.headers?.['If-Match']).toBe('"0"');
});

test('fresh permission denial blocks Continue even if an earlier context advertised categories', async () => {
  const f = fixture();
  f.enableCategories();
  const flow = f.flow();
  await flow.begin();
  flow.metadata({
    ...flow.snapshot().run!.ui,
    name: 'Denied after open',
    inboundCategory: 'PRODUCT',
  });
  f.denyWrites();
  expect(await flow.next()).toBe(false);
  expect(f.calls.some(c => c.method === 'PUT')).toBe(false);
  expect(flow.snapshot().run!.ui.step).toBe(0);
  expect(flow.snapshot().run!.pending).toBeUndefined();
});

test('UI memory retains step scroll/filter/manual raw through Back and reload without entering API items', async () => {
  const f = fixture(),
    flow = await ready(f);
  await flow.scan('CODE-A', 'MANUAL');
  flow.view({
    scroll: { 2: 360 },
    filter: 'duplicate',
    all: true,
    manual: true,
    rawInput: ' raw chưa gửi ',
    expandedSkus: ['SKU-A'],
  });
  await flow.next();
  flow.back();
  expect(flow.snapshot().run!.view).toMatchObject({
    scroll: { 2: 360 },
    rawInput: ' raw chưa gửi ',
    filter: 'duplicate',
  });
  const id = flow.snapshot().run!.identity;
  flow.dispose();
  const restored = f.flow();
  await restored.begin();
  expect(restored.snapshot().run!.identity).toEqual(id);
  expect(restored.snapshot().run!.view?.scroll?.[2]).toBe(360);
  for (const c of f.calls.filter(c => c.method === 'PUT'))
    expect(JSON.stringify(c.body)).not.toContain('raw chưa gửi');
});
test('Back keeps the draft and reports a changed session instead of throwing into the UI', async () => {
  const f = fixture(),
    flow = await ready(f);
  await flow.scan('CODE-A', 'MANUAL');
  await flow.next();
  f.changeSession();

  expect(flow.back()).toBe(false);
  expect(flow.snapshot().run!.ui.step).toBe(2);
  expect(flow.snapshot().run!.items).toHaveLength(1);
  expect(flow.snapshot().message).toContain('Phiên hoặc kho đã thay đổi');
});
test('type locks after the first scan, long note stays exact within 1000 characters and an over-limit update is rejected', async () => {
  const f = fixture();
  f.enableCategories();
  const flow = f.flow();
  await flow.begin();
  const ui = flow.snapshot().run!.ui;
  const note = 'x'.repeat(1000);
  expect(
    flow.metadata({ ...ui, name: 'Types', inboundCategory: 'COMPONENT', note }),
  ).toBe(true);
  await flow.next();
  await flow.scan('CODE-A', 'MANUAL');
  expect(
    flow.metadata({ ...flow.snapshot().run!.ui, inboundCategory: 'OTHER' }),
  ).toBe(false);
  expect(flow.metadata({ ...flow.snapshot().run!.ui, note: note + 'x' })).toBe(
    false,
  );
  expect(flow.snapshot().run!.ui.note).toBe(note);
  expect(
    (f.calls.find(c => c.method === 'PUT')!.body as P04Body).inbound_category,
  ).toBe('COMPONENT');
});

test('P12 seed remains owner metadata only and preserves 1000 Unicode codepoints', async () => {
  const f = fixture(),
    flow = f.flow(),
    note = '😀'.repeat(1000);
  expect(await flow.begin(undefined, { supplierId: null, note })).toBe(true);
  expect(flow.snapshot().run!.ui.note).toBe(note);
  expect(
    flow.metadata({ ...flow.snapshot().run!.ui, name: 'P12 seed', note }),
  ).toBe(true);
  expect(f.calls.filter(c => c.method === 'POST')).toHaveLength(0);
});
test('P12 initial seed never overwrites the retained owner draft', async () => {
  const f = fixture(),
    flow = f.flow();
  await flow.begin();
  flow.metadata({
    ...flow.snapshot().run!.ui,
    name: 'Owner draft',
    note: 'Keep original',
  });
  const id = flow.snapshot().run!.id;
  flow.dispose();
  const resumed = f.flow();
  await resumed.begin(undefined, {
    supplierId: null,
    note: 'Replacement must not apply',
  });
  expect(resumed.snapshot().run!.id).toBe(id);
  expect(resumed.snapshot().run!.ui.note).toBe('Keep original');
});

test('P12 business date is optional owner doc_date, not event time, and a later seed cannot overwrite a retained date', async () => {
  const f = fixture(),
    flow = f.flow();
  expect(
    await flow.begin(undefined, {
      supplierId: null,
      note: 'Date seed',
      docDate: '2026-10-10',
    }),
  ).toBe(true);
  const body = p04Body(flow.snapshot().run!);
  expect(body.doc_date).toBe('2026-10-10');
  expect(body).not.toHaveProperty('created_at');
  expect(body).not.toHaveProperty('posted_at');
  expect(f.calls.map(c => c.path)).toEqual([
    '/api/v1/mini-app/inbound/context',
    '/api/v1/mini-app/inbound/types',
  ]);
  expect(
    f.calls.filter(c =>
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.method ?? 'GET'),
    ),
  ).toHaveLength(0);
  const run = flow.snapshot().run!;
  flow.metadata({ ...run.ui, name: 'Retained date', docDate: '2026-10-10' });
  flow.dispose();
  const resumed = f.flow();
  await resumed.begin(undefined, {
    supplierId: null,
    note: 'Different seed',
    docDate: '2026-10-11',
  });
  expect(p04Body(resumed.snapshot().run!).doc_date).toBe('2026-10-10');
});
