import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { login } from '../src/services/wms/auth';
import {
  clearSession,
  setSession,
  getSession,
  updateSessionIdentity,
} from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { useCameraPermission } from '../src/scanner/useCameraPermission';
import { assertP03ReconcileIdentity } from '../src/services/wms/p03ReconcileIdentity';
import { mapNotification } from '../src/services/wms/notifications';
import {
  parseOwnerUploadReceipt,
  reconcileOwnerAttachment,
  uploadOwnerAttachment,
} from '../src/services/wms/warrantyWrite';
const id = (n: number) =>
  '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
const session = {
  accessToken: 'offline',
  userId: id(1),
  authSessionId: id(2),
  activeWarehouseId: id(3),
};
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
};
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession(session);
});
afterEach(clearSession);
const auth = (token: string) => ({
  data: {
    access_token: token,
    refresh_token: 'refresh-' + token,
    expires_in: 3600,
  },
  meta: { timestamp: '2026-10-23T01:00:00Z' },
});
test('late login A cannot overwrite login B or its credential publication', async () => {
  const a = deferred<any>(),
    b = deferred<any>();
  const first = login(
    { email: 'a@example.test', password: 'test' },
    { post: () => a.promise },
  ).catch(e => e);
  const second = login(
    { email: 'b@example.test', password: 'test' },
    { post: () => b.promise },
  );
  b.resolve(auth('B'));
  await second;
  a.resolve(auth('A'));
  expect(await first).toMatchObject({ code: 'STALE_AUTH_RESPONSE' });
  expect(getSession()?.accessToken).toBe('B');
});
test('late login cannot publish after explicit logout/generation change', async () => {
  const a = deferred<any>();
  const pending = login(
    { email: 'a@example.test', password: 'test' },
    { post: () => a.promise },
  ).catch(e => e);
  clearSession();
  a.resolve(auth('late'));
  expect(await pending).toMatchObject({ code: 'STALE_AUTH_RESPONSE' });
  expect(getSession()).toBeUndefined();
});
test('explicit warehouse null clears rather than retaining prior identity', () => {
  updateSessionIdentity({ activeWarehouseId: null });
  expect(getSession()?.activeWarehouseId).toBeUndefined();
});
const expected = {
  key: id(4),
  draftId: id(5),
  scanSessionId: id(6),
  warehouseId: id(3),
  operation: 'INBOUND',
  command: 'SAVE',
};
const identity = {
  request_id: id(4),
  document_id: id(5),
  scan_session_id: id(6),
  warehouse_id: id(3),
  operation: 'INBOUND',
  command: 'SAVE',
};
test.each(Object.keys(identity))(
  'reconcile cannot authorize retry with wrong %s',
  field => {
    expect(() =>
      assertP03ReconcileIdentity({ ...identity, [field]: 'wrong' }, expected),
    ).toThrow('không khớp');
  },
);
test('exact reconciliation identity is accepted without inventing terminal outcome', () =>
  expect(() => assertP03ReconcileIdentity(identity, expected)).not.toThrow());
test('notification malformed read_at never becomes verified read', () => {
  expect(() => mapNotification({ id: id(4), read_at: 'not-a-time' })).toThrow(
    'chưa được xác minh',
  );
});
test('camera permission has single-flight and does not allow late check to replace granted', async () => {
  const check = deferred<boolean>(),
    request = deferred<'granted'>();
  const backend = {
    check: jest.fn(() => check.promise),
    request: jest.fn(() => request.promise),
  };
  let hook!: ReturnType<typeof useCameraPermission>,
    tree!: Renderer.ReactTestRenderer;
  function Harness() {
    hook = useCameraPermission(backend);
    return null;
  }
  await act(async () => {
    tree = Renderer.create(<Harness />);
  });
  let first!: Promise<void>, second!: Promise<void>;
  act(() => {
    first = hook.request();
    second = hook.request();
  });
  expect(first).toBe(second);
  expect(backend.request).toHaveBeenCalledTimes(1);
  await act(async () => {
    request.resolve('granted');
    await first;
  });
  await act(async () => check.resolve(false));
  expect(hook.state).toBe('granted');
  await act(async () => tree.unmount());
});
const sha = 'a'.repeat(64);
const receipt = {
  contract: 'owner-attachment-upload-v1',
  command: 'UPLOAD',
  request_key: id(4),
  actor_id: id(1),
  auth_session_id: id(2),
  warehouse_id: id(3),
  parent_type: 'WARRANTY',
  parent_id: id(5),
  file_sha256: sha,
  attachment_id: id(7),
  outcome: 'SUCCEEDED',
  http_status: 201,
  attachment_status_at_completion: 'ACTIVE',
  attachment_version_at_completion: 1,
  scan_result: 'UNSCANNED',
  completed_at: '2026-10-23T01:00:00Z',
};
const receiptExpected = () => ({
  owner: 'warranty' as const,
  parentId: id(5),
  key: id(4),
  warehouseId: id(3),
  sha256: sha,
  scope: {
    generation: 0,
    ...session,
    userId: id(1),
    authSessionId: id(2),
    warehouseId: id(3),
  },
});
test.each([
  'actor_id',
  'auth_session_id',
  'parent_id',
  'parent_type',
  'file_sha256',
  'request_key',
  'command',
  'completed_at',
])('upload receipt rejects wrong %s', field => {
  expect(() =>
    parseOwnerUploadReceipt(
      { ...receipt, [field]: 'wrong' },
      receiptExpected(),
    ),
  ).toThrow();
});
test('upload terminal NONE is accepted with exact original receipt, without granting download access', async () => {
  const get = jest.fn().mockResolvedValue({
    status: 200,
    data: {
      success: true,
      meta: { contract: 'owner-attachment-upload-v1' },
      data: {
        outcome: 'SUCCEEDED',
        request_state: 'SUCCEEDED',
        request_key: id(4),
        parent_type: 'WARRANTY',
        parent_id: id(5),
        file_sha256: sha,
        auth_session_id: id(2),
        warehouse_id: id(3),
        receipt,
        current_attachment: {
          attachment_id: id(7),
          status: 'DELETED',
          version: 2,
        },
        retry_policy: 'NONE',
        cancel_supported: false,
        observed_at: '2026-10-23T01:01:00Z',
      },
    },
  });
  const result = await reconcileOwnerAttachment(
    'warranty',
    id(5),
    id(4),
    id(3),
    sha,
    { get },
  );
  expect(result.retryPolicy).toBe('NONE');
  expect(result.currentAttachment?.status).toBe('DELETED');
});
test('unbound fake terminal response cannot clear pending even if it says CHECK_ONLY', async () => {
  const get = jest.fn().mockResolvedValue({
    status: 200,
    data: {
      success: true,
      meta: { contract: 'owner-attachment-upload-v1' },
      data: {
        outcome: 'SUCCEEDED',
        request_state: 'SUCCEEDED',
        receipt: null,
        retry_policy: 'CHECK_ONLY',
        cancel_supported: false,
      },
    },
  });
  await expect(
    reconcileOwnerAttachment('warranty', id(5), id(4), id(3), sha, { get }),
  ).rejects.toMatchObject({ code: 'P18_RECONCILE_INVALID' });
});
test('scope changing during file hashing prevents any upload dispatch', async () => {
  const bytes = deferred<ArrayBuffer>();
  const file = {
    uri: 'offline://file',
    name: 'x.jpg',
    type: 'image/jpeg',
    blob: { size: 3, arrayBuffer: () => bytes.promise } as Blob,
  };
  const request = jest.fn();
  const pending = uploadOwnerAttachment(
    'warranty',
    id(5),
    file,
    { warehouseId: id(3), idempotencyKey: id(4) },
    { request },
  );
  setSession({ ...session, authSessionId: id(99) });
  bytes.resolve(new Uint8Array([1, 2, 3]).buffer);
  await expect(pending).rejects.toMatchObject({ code: 'P18_SCOPE_CHANGED' });
  expect(request).not.toHaveBeenCalled();
});
