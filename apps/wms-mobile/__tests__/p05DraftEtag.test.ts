import { draftEtagMatches } from '../src/features/outbound/linked/p05-contract';
import { createP05Service } from '../src/services/wms/p05Outbound';
import capture from './fixtures/p05-recorded-draft-response.json';

test.each(['"2"', 'W/"2"', ' W/"2" \t', undefined, null])(
  'draft version 2 accepts optional matching response ETag %s',
  etag => {
    expect(draftEtagMatches(etag, 2)).toBe(true);
  },
);
test.each([
  '',
  '2',
  'W/2',
  'w/"2"',
  '"02"',
  'W/"02"',
  '"3"',
  'W/"3"',
  '"2", "3"',
  '*',
  '"2suffix"',
  'W/"2"suffix',
  '"0"',
])('draft version 2 rejects malformed or mismatched response ETag %s', etag => {
  expect(draftEtagMatches(etag, 2)).toBe(false);
});
test.each([0, -1, 2.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN])(
  'invalid version %s never gains validation from an absent header',
  version => {
    expect(draftEtagMatches(undefined, version)).toBe(false);
  },
);

test('captured DEV GET with W/"3" passes the actual draft service guard, preserving the recorded identity and stock-neutral state (offline replay)', async () => {
  const client = {
    async request<T>() {
      return {
        status: capture.http,
        data: {
          success: capture.success,
          data: capture.data,
          meta: capture.meta,
        } as T,
        header: (name: string) =>
          name.toLowerCase() === 'etag' ? capture.etag : undefined,
      };
    },
  };
  const service = createP05Service(client, () => ({
    accessToken: 'TEST-OFFLINE',
    userId: '00000000-0000-4000-8000-000000000001',
    authSessionId: capture.data.auth_session_id,
    activeWarehouseId: capture.data.warehouse_id,
  }));
  const draft = await service.draft(
    capture.data.document_id,
    capture.data.scan_session_id,
  );
  expect(draft).toEqual(capture.data);
  expect(draft).toMatchObject({
    version: 3,
    status: 'RECORDED',
    stock_effect: 'NONE',
  });
});
