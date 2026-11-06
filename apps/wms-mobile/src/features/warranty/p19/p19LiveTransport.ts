import { apiClient, type RequestOptions } from '../../../api/client';
import {
  captureSessionScope,
  isSessionScopeCurrent,
} from '../../../auth/session';
import { getAppStorage, type KeyValueStorage } from '../../../storage/storage';
import { assertP19DevConnected } from '../../../config/p19Release';
import { isDevRuntimeIdentity } from '../../../config/runtimePolicy';
import {
  verifyP04Admission,
  type P04Admission,
} from '../../../shift/p04Admission';
import { AppError } from '../../../errors/AppError';
import { createP03RequestId } from '../../../services/wms/p03Drafts';
import type { P19LiveRequest, P19Scope } from './p19Types';
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const stable = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === 'object'
    ? Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, x]) => [k, stable(x)]),
      )
    : v;
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const fail = (code: string): never => {
  throw new AppError({
    kind: 'blocked_by_gate',
    code,
    message:
      'Chưa xác minh đúng owner P19 (' +
      code +
      '). Giữ yêu cầu gốc, không gửi lại.',
  });
};
export function createP19LiveTransport(options: {
  getScope(): P19Scope;
  caseId: string;
  getCheckpoint(): unknown;
  client?: Pick<typeof apiClient, 'request'>;
  storage?: KeyValueStorage;
  admission?: P04Admission;
}): P19LiveRequest {
  const client = options.client ?? apiClient,
    storage = options.storage ?? getAppStorage(),
    admission = options.admission ?? verifyP04Admission;
  return async descriptor => {
    assertP19DevConnected();
    const scope = options.getScope(),
      auth = captureSessionScope();
    const current = () => {
      if (!isSessionScopeCurrent(auth) || !equal(scope, options.getScope()))
        fail('P19_SCOPE_CHANGED');
    };
    const health = await client.request<any>({
      path: '/api/v1/health',
      method: 'GET',
    });
    current();
    if (
      health.status !== 200 ||
      health.data?.success !== true ||
      !isDevRuntimeIdentity(
        health.data?.data?.build?.sha,
        health.header?.('X-WMS-Deployment-Tier'),
      )
    )
      fail('P19_RUNTIME_UNVERIFIED');
    const { method, path, query, body } = descriptor;
    const checkpoint = options.getCheckpoint() as any;
    const draft = checkpoint?.draftId;
    const readAllowed =
      method === 'GET' &&
      (path === '/api/v1/mini-app/p03/context' ||
        path === '/api/v1/mini-app/warranty-cases/' + options.caseId ||
        (uuid.test(draft || '') &&
          (path === '/api/v1/mini-app/drafts/' + draft ||
            path ===
              '/api/v1/mini-app/drafts/' +
                draft +
                '/requests/' +
                checkpoint?.pending?.key)) ||
        (uuid.test(checkpoint?.result?.business_document_id || '') &&
          path ===
            '/api/v1/mini-app/warranty-component-issues/' +
              checkpoint.result.business_document_id));
    const resolve =
      method === 'POST' &&
      path === '/api/v1/mini-app/warranty-component-issues/resolve-code' &&
      body?.warranty_case_id === options.caseId &&
      body?.warehouse_id === scope.warehouseId;
    const write =
      (method === 'PUT' &&
        uuid.test(draft || '') &&
        path === '/api/v1/mini-app/drafts/' + draft) ||
      (method === 'POST' &&
        path === '/api/v1/mini-app/warranty-component-issues/record');
    if (!readAllowed && !resolve && !write) fail('P19_PATH_NOT_OWNED');
    const headers = { ...descriptor.headers };
    if (write) {
      const pending = checkpoint?.pending,
        key = pending?.key;
      if (
        !pending ||
        !uuid.test(key || '') ||
        !equal(pending.scope, scope) ||
        pending.caseId !== options.caseId ||
        !equal(
          [pending.method, pending.path, pending.body, pending.headers],
          [method, path, body, descriptor.headers],
        )
      )
        fail('P19_PENDING_NOT_PERSISTED');
      const journalKey =
        'p19-linked-private/v1/' +
        [
          scope.actorId,
          scope.authSessionId,
          scope.warehouseId,
          options.caseId,
        ].join('/');
      const saved = storage.getObject<any>(journalKey);
      if (!saved?.pending || !equal(saved.pending, pending))
        fail('P19_JOURNAL_UNVERIFIED');
      const bindingKey =
        'p19-native-command-shift/v1/' +
        [scope.actorId, scope.authSessionId, scope.warehouseId, key].join('/');
      const previous = storage.getObject<{
        shiftId: string;
        requestId: string;
      }>(bindingKey);
      const originKey =
        'p19-native-draft-shift/v1/' +
        [scope.actorId, scope.authSessionId, scope.warehouseId, draft].join(
          '/',
        );
      const origin = storage.getObject<{ shiftId: string }>(originKey);
      if (!origin && pending.draftVersion > 0)
        fail('P19_ORIGINAL_SHIFT_REQUIRED');
      const command = pending.command === 'SAVE' ? 'SAVE' : 'RECORD';
      const admitted = await admission(
        scope,
        command,
        pending.draftVersion,
        origin?.shiftId ?? previous?.shiftId,
      );
      current();
      if (origin && origin.shiftId !== admitted.shiftId)
        fail('P19_ORIGINAL_SHIFT_CHANGED');
      if (
        previous &&
        (previous.shiftId !== admitted.shiftId ||
          !uuid.test(previous.requestId) ||
          previous.requestId === key)
      )
        fail('P19_ORIGINAL_SHIFT_CHANGED');
      const binding = {
        shiftId: admitted.shiftId,
        requestId: previous?.requestId ?? createP03RequestId(),
      };
      if (!uuid.test(binding.requestId) || binding.requestId === key)
        fail('P19_TRACE_IDENTITY_INVALID');
      storage.setObject(bindingKey, binding);
      storage.setObject(originKey, { shiftId: binding.shiftId });
      if (!equal(storage.getObject(bindingKey), binding))
        fail('P19_SHIFT_JOURNAL_FAILED');
      if (!equal(storage.getObject(originKey), { shiftId: binding.shiftId }))
        fail('P19_SHIFT_JOURNAL_FAILED');
      headers['X-Work-Shift-ID'] = binding.shiftId;
      headers['X-Request-ID'] = binding.requestId;
    }
    current();
    const response = await client.request<unknown>({
      method: method as RequestOptions['method'],
      path,
      query: query as RequestOptions['query'],
      body,
      headers,
    });
    current();
    return {
      status: response.status,
      body: response.data,
      etag: response.header?.('ETag'),
    };
  };
}
