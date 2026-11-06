import { createP04Flow } from '../src/features/inbound/p04Flow';
import { createStorage, createMemoryBackend } from '../src/storage/storage';
import { createP04ReviewService, P04_REVIEW_SESSION, type P04ReviewScenario } from '../src/web/p04ReviewService';
import type { RequestOptions } from '../src/api/client';
import type { P04Body } from '../src/services/wms/p04Inbound';

function fixture(scenario: P04ReviewScenario = 'normal') {
  const calls: RequestOptions[] = [];
  const service = createP04ReviewService({ scenario, calls });
  const storage = createStorage(createMemoryBackend());
  const flow = createP04Flow({ service, storage, getSession: () => P04_REVIEW_SESSION });
  return { calls, service, storage, flow };
}
async function ready(scenario: P04ReviewScenario = 'normal', category: 'PRODUCT' | 'COMPONENT' | 'OTHER' = 'PRODUCT') {
  const f = fixture(scenario);
  await f.flow.begin();
  const ui = f.flow.snapshot().run!.ui;
  f.flow.metadata({ ...ui, name: 'Phiếu local đầy đủ', inboundCategory: category, supplierId: '12345678-1234-4234-8234-000000000025', supplierName: 'NCC local 25 — Hoa Nam', note: 'Unicode ghi chú 👋\nDòng thứ hai' });
  await f.flow.next();
  return f;
}

test.each(['PRODUCT', 'COMPONENT', 'OTHER'] as const)('local S01–S04 giữ dữ liệu/category %s và không Post', async category => {
  const f = await ready('normal', category);
  expect(f.flow.snapshot().run!.ui.step).toBe(1);
  const before = f.flow.snapshot().run!;
  expect(before.server!.document_no).toBe('PN-20261013-0001');
  await f.flow.scan('HN1|SKU=DCJZ2090i|ITEM=LOCAL-01', 'MANUAL');
  await f.flow.scan('HN1|SKU=DCJZ2090i|ITEM=LOCAL-02', 'CAMERA');
  await f.flow.scan('HN1|SKU=DCJZ2090i|ITEM=LOCAL-01', 'MANUAL');
  await f.flow.scan('BAD', 'MANUAL');
  await f.flow.next();
  const review = f.flow.snapshot();
  expect(review.run!.ui.step).toBe(2);
  expect(review.review!.can_record).toBe(true);
  expect(review.review!.sku_summary[0].quantity).toBe(2);
  expect(review.run!.ui.scanAttempts!.map(row => row.kind)).toEqual(['valid', 'valid', 'duplicate', 'invalid']);
  expect(review.run!.ui.scanAttempts![2].reasonCode).toBe('DUPLICATE_ITEM_IN_BATCH');
  expect(review.run!.ui.scanAttempts![2].reason).toBe('Mã đã có trong phiếu. Không cộng thêm số lượng.');
  await Promise.all([f.flow.record(), f.flow.record()]);
  const result = f.flow.snapshot().run!;
  expect(result.result!.data).toMatchObject({ doc_no: 'PN-20261013-0001', status: 'SCANNING', posted: false, stock_effect: 'NONE' });
  expect(result.identity).toEqual(before.identity);
  expect(result.scope).toEqual(before.scope);
  expect(result.items).toHaveLength(2);
  expect(result.ui.name).toBe('Phiếu local đầy đủ');
  const writes = f.calls.filter(call => call.method === 'PUT');
  const body = writes.at(-1)!.body as P04Body;
  expect(body).toMatchObject({ inbound_category: category, supplier_id: '12345678-1234-4234-8234-000000000025', name: 'Phiếu local đầy đủ', note: 'Unicode ghi chú 👋\nDòng thứ hai' });
  expect(body.items.map(item => item.scan_source)).toEqual(['MANUAL', 'CAMERA']);
  expect(body.items.every(item => !Object.hasOwn(item, 'resolved'))).toBe(true);
  const records = f.calls.filter(call => call.path.endsWith('/record'));
  expect(records).toHaveLength(1);
  expect(records[0].body).toEqual({ warehouse_id: result.scope.warehouseId, scan_session_id: result.identity.scanSessionId });
  expect(f.calls.every(call => !call.path.includes('/post') && call.method !== 'DELETE')).toBe(true);
  expect(JSON.stringify(f.storage.keys().map(key => f.storage.getObject(key)))).not.toContain('local-review-token');
});

test('BOX quantity và new-SKU type phải được người dùng xác nhận', async () => {
  const f = await ready();
  const box = await f.flow.scan('BOX-DCJZ2090i-001', 'MANUAL');
  expect(box.requiresInput).toBe(true);
  expect(f.flow.snapshot().run!.items).toHaveLength(0);
  await f.flow.scan('BOX-DCJZ2090i-001', 'MANUAL', { quantity: 5 }, box.eventId);
  const fresh = await f.flow.scan('NEW-LOCAL-01', 'MANUAL');
  expect(fresh.requiresInput).toBe(true);
  await f.flow.scan('NEW-LOCAL-01', 'MANUAL', { new_sku_type: 'COMPONENT' }, fresh.eventId);
  const run = f.flow.snapshot().run!;
  expect(run.items.map(item => item.quantity)).toEqual([5, 1]);
  expect(run.items[1].new_sku_type).toBe('COMPONENT');
  await f.flow.next();
  expect(f.flow.snapshot().review!.items.reduce((n, row) => n + (row.quantity ?? 0), 0)).toBe(6);
});

test.each(['context-error', 'warehouse-inactive', 'denied', 'context-required'] as const)('scope guard %s không có write', async scenario => {
  const f = fixture(scenario);
  await f.flow.begin();
  expect(f.flow.snapshot().phase).toBe('error');
  expect(f.calls.every(call => !['PUT', 'POST'].includes(call.method ?? 'GET'))).toBe(true);
});

test('review revalidation thất bại giữ raw dữ liệu, không RECORD/S04', async () => {
  const f = await ready('revalidation');
  await f.flow.scan('HN1|SKU=DCJZ2090i|ITEM=LOCAL-01', 'MANUAL');
  await f.flow.next();
  expect(f.flow.snapshot().review!.can_record).toBe(false);
  await f.flow.record();
  expect(f.flow.snapshot().run!.result).toBeUndefined();
  expect(f.flow.snapshot().run!.items).toHaveLength(1);
  expect(f.calls.filter(call => call.path.endsWith('/record'))).toHaveLength(0);
});

test.each(['save-timeout', 'record-timeout'] as const)('%s đối chiếu commit, không gửi lại mù', async scenario => {
  const f = await ready(scenario);
  await f.flow.scan('HN1|SKU=DCJZ2090i|ITEM=LOCAL-01', 'MANUAL');
  if (scenario === 'record-timeout') { await f.flow.next(); await f.flow.record(); }
  const pending = f.flow.snapshot().run!.pending!;
  expect(pending.outcome).toBe('UNKNOWN');
  expect(f.flow.snapshot().run!.result).toBeUndefined();
  await f.flow.check();
  expect(f.flow.snapshot().run!.pending).toBeUndefined();
  expect(f.flow.snapshot().run!.items).toHaveLength(1);
  if (scenario === 'record-timeout') {
    expect(f.flow.snapshot().run!.result!.data.posted).toBe(false);
    expect(f.calls.filter(call => call.path.endsWith('/record'))).toHaveLength(1);
  }
});

test('UNKNOWN chưa commit chỉ retry cùng key/body/version sau đối chiếu', async () => {
  const f = await ready('record-not-sent');
  await f.flow.scan('HN1|SKU=DCJZ2090i|ITEM=LOCAL-01', 'MANUAL');
  await f.flow.next(); await f.flow.record();
  expect(f.flow.newRun()).toBe(false);
  await f.flow.check();
  expect(f.flow.snapshot().run!.pending!.retryAllowed).toBe(true);
  await f.flow.retry();
  const calls = f.calls.filter(call => call.path.endsWith('/record'));
  expect(calls).toHaveLength(2);
  expect(calls[1].headers).toEqual(calls[0].headers);
  expect(calls[1].body).toEqual(calls[0].body);
  expect(f.flow.snapshot().run!.result).toBeDefined();
});

test('RECORD bị từ chối phải xác minh nháp rồi sửa/nhập lượt mới', async () => {
  const f = await ready('record-reject');
  await f.flow.scan('HN1|SKU=DCJZ2090i|ITEM=LOCAL-01', 'MANUAL');
  await f.flow.next(); await f.flow.record();
  expect(f.flow.snapshot().run!.pending!.outcome).toBe('FAILED');
  expect(f.flow.newRun()).toBe(false);
  await f.flow.recoverRejected();
  expect(f.flow.snapshot().run!.pending).toBeUndefined();
  expect(f.flow.snapshot().run!.items).toHaveLength(1);
  expect(f.flow.snapshot().run!.result).toBeUndefined();
});

test('save/resume giữ ID, version, raw và metadata; lượt mới không giữ kết quả', async () => {
  const f = await ready();
  await f.flow.scan('HN1|SKU=DCJZ2090i|ITEM=LOCAL-01', 'MANUAL');
  await f.flow.saveAndLeave();
  const prior = f.flow.snapshot().run!;
  f.flow.dispose();
  const resumed = createP04Flow({ service: f.service, storage: f.storage, getSession: () => P04_REVIEW_SESSION });
  await resumed.begin();
  expect(resumed.snapshot().resume).toBe(true);
  expect(resumed.snapshot().run!.identity).toEqual(prior.identity);
  expect(resumed.snapshot().run!.server!.version).toBe(prior.server!.version);
  resumed.resume(); await resumed.next(); await resumed.record();
  expect(resumed.newRun()).toBe(true);
  // newRun schedules the number SAVE; let that isolated promise settle.
  for (let i = 0; i < 30; i++) await Promise.resolve();
  const fresh = resumed.snapshot().run!;
  expect(fresh.ui.step).toBe(0);
  expect(fresh.ui.name).toBe('');
  expect(fresh.result).toBeUndefined();
  expect(fresh.items).toEqual([]);
  expect(fresh.identity).not.toEqual(prior.identity);
  expect(fresh.server!.document_no).toBe('PN-20261013-0002');
});
