import {
  cancelP03Draft,
  getP03Draft,
  listP03Drafts,
  reconcileP03Request,
  saveP03Draft,
  type P03Identity,
} from '../src/services/wms/p03Drafts';
import { approvedWriteFor, allowsIdempotencyKey, allowsIfMatch } from '../src/api/writeGate';
import { clearSession, setSession } from '../src/auth/session';

const identity: P03Identity = {
  documentId: '11111111-1111-4111-8111-111111111111',
  scanSessionId: '22222222-2222-4222-8222-222222222222',
};
const warehouseId = '33333333-3333-4333-8333-333333333333';
const saveKey = '44444444-4444-4444-8444-444444444444';
const cancelKey = '55555555-5555-4555-8555-555555555555';
const draft = (status = 'DRAFT', version = 1) => ({ document_id: identity.documentId, document_kind: 'STAGING_DRAFT', scan_session_id: identity.scanSessionId, auth_session_id: 'auth-1', warehouse_id: warehouseId, operation: 'INBOUND', version, status, codes: [{ raw_code: 'REAL-1', quantity: 1 }], form: {}, codes_validated: false, business_document_id: null, business_status: null, last_request_id: null, stock_effect: 'NONE' });
beforeEach(() => setSession({ accessToken: 'test', userId: 'actor-1', activeWarehouseId: warehouseId, authSessionId: 'auth-1' }));
afterEach(() => clearSession());

function client(data: unknown = { success: true, data: {}, meta: { total: 0, contract: 'mini-app-p03-v1' } }): any {
  const requests: any[] = [];
  return {
    requests,
    request: jest.fn(async <T>(options: any) => {
      requests.push(options);
      return { status: 200, data: data as T, header: (name: string) => name === 'ETag' ? '"2"' : undefined };
    }),
  };
}

test('write gate opens only exact P03 draft routes and headers', () => {
  expect(approvedWriteFor('PUT', `/api/v1/mini-app/drafts/${identity.documentId}`)).toBe('p03.saveDraft');
  expect(approvedWriteFor('POST', `/api/v1/mini-app/drafts/${identity.documentId}/cancel`)).toBe('p03.cancelDraft');
  expect(approvedWriteFor('DELETE', `/api/v1/mini-app/drafts/${identity.documentId}`)).toBeUndefined();
  expect(allowsIdempotencyKey('PUT', `/api/v1/mini-app/drafts/${identity.documentId}`)).toBe(true);
  expect(allowsIfMatch('PUT', `/api/v1/mini-app/drafts/${identity.documentId}`)).toBe(true);
});

test('save uses full snapshot, stable identity, Idempotency-Key and quoted If-Match', async () => {
  const c = client({ success: true, data: { document: draft('DRAFT', 1), receipt: { request_id: saveKey, document_id: identity.documentId, scan_session_id: identity.scanSessionId, warehouse_id: warehouseId, operation: 'INBOUND', version: 1, command: 'SAVE', outcome: 'SUCCEEDED' } }, meta: { contract: 'mini-app-p03-v1' } });
  c.request.mockResolvedValueOnce({ status: 201, data: { success: true, data: { document: draft('DRAFT', 1), receipt: { request_id: saveKey, document_id: identity.documentId, scan_session_id: identity.scanSessionId, warehouse_id: warehouseId, operation: 'INBOUND', version: 1, command: 'SAVE', outcome: 'SUCCEEDED' } }, meta: { contract: 'mini-app-p03-v1' } }, header: () => '"1"' });
  await saveP03Draft({ identity, warehouseId, operation: 'INBOUND', version: 0, idempotencyKey: saveKey, title: 'Nháp', codes: [{ raw_code: 'REAL-1', quantity: 1 }], form: { note: 'x' } }, {}, c);
  expect(c.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'PUT', headers: { 'Idempotency-Key': saveKey, 'If-Match': '"0"' } }));
  expect(c.request.mock.calls[0][0].body).toEqual({ warehouse_id: warehouseId, operation: 'INBOUND', scan_session_id: identity.scanSessionId, title: 'Nháp', codes: [{ raw_code: 'REAL-1', quantity: 1 }], form: { note: 'x' } });
});

test('detail/list/reconcile use scoped query and meta.total', async () => {
  const c = client({ success: true, data: [draft()], meta: { contract: 'mini-app-p03-v1', total: 4, page: 1, per_page: 20, last_page: 1, warehouse_id: warehouseId, auth_session_id: 'auth-1' } });
  const list = await listP03Drafts('INBOUND', {}, { ...c, request: c.request });
  expect(list.meta.total).toBe(4); expect(c.requests[0].query).toMatchObject({ warehouse_id: warehouseId });
  const d = client({ success: true, data: { document_id: identity.documentId, version: 2 } });
  d.request.mockResolvedValue({ status: 200, data: { success: true, data: draft(), meta: { contract: 'mini-app-p03-v1' } }, header: () => undefined });
  await getP03Draft({ ...identity, warehouseId, operation: 'INBOUND' }, {}, d);
  expect(d.request).toHaveBeenCalledWith(expect.objectContaining({query: expect.objectContaining({scan_session_id: identity.scanSessionId})}));
  const r = client({ success: true, data: { outcome: 'UNKNOWN', retry: 'SAME_REQUEST_ONLY', new_document_allowed: false, cancel_allowed: false }, meta: { contract: 'mini-app-p03-v1' } });
  await reconcileP03Request({ identity, warehouseId, operation: 'INBOUND', requestId: saveKey, command: 'SAVE' }, {}, r);
  expect(r.requests[0].query.command).toBe('SAVE');
});

test('cancel is a soft cancel with a new key and confirmed SAVE receipt', async () => {
  const cancelled = { ...draft('CANCELLED', 3), codes: [], status: 'CANCELLED' };
  const c = client({ success: true, data: { document: cancelled, receipt: { request_id: cancelKey, document_id: identity.documentId, scan_session_id: identity.scanSessionId, warehouse_id: warehouseId, operation: 'INBOUND', version: 3, command: 'CANCEL', outcome: 'SUCCEEDED' } }, meta: { contract: 'mini-app-p03-v1' } });
  await cancelP03Draft({ identity, warehouseId, operation: 'INBOUND', version: 2, idempotencyKey: cancelKey, confirmedRequestId: saveKey, reason: 'Người dùng hủy bản nháp' }, {}, c);
  expect(c.requests[0]).toMatchObject({ method: 'POST', headers: { 'Idempotency-Key': cancelKey, 'If-Match': '"2"' } });
  expect(c.requests[0].body.confirmed_request_id).toBe(saveKey);
});

test('invalid response is not treated as success', async () => {
  const c = client({ success: false, data: null });
  await expect(saveP03Draft({ identity, warehouseId, operation: 'INBOUND', version: 0, idempotencyKey: saveKey, codes: [] }, {}, c)).rejects.toMatchObject({ code: 'INVALID_P03_RESPONSE' });
});
