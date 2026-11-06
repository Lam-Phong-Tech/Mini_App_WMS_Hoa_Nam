/** Additive fence binding. No trace rotation, no owner retry/reconciliation. */
import { AppError } from '../errors/AppError';
import {
  captureSessionScope,
  getSession,
  subscribeSession,
} from '../auth/session';
import {
  getShiftState,
  currentShiftOwner,
  sameShiftOwner,
  knownTrackedFamily,
  hasPendingEndIntent,
} from './shiftState';
import { getAppStorage } from '../storage/storage';
import type { RequestOptions } from '../api/client';

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const bindings = new Map<
  string,
  { shiftId: string; trace: string; signature: string; generation: number }
>();
// Private comparison copies do not survive logout; the native owner keeps its
// original request journal, and BE reconciliation remains authoritative.
subscribeSession(() => {
  if (!getSession()) bindings.clear();
});
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          k =>
            JSON.stringify(k) +
            ':' +
            stable((value as Record<string, unknown>)[k]),
        )
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'undefined';
}
export function bindShiftOwnerHeaders(
  options: RequestOptions,
): Record<string, string> | undefined {
  const method = options.method ?? 'GET';
  // Exact pure-resolution endpoints exempted by the deployed BE e2442df9
  // P14ShiftOwnerFence::checkOnly. They still pass API auth, tier, permission,
  // schema and caller/warehouse validation. Never exempt prepare/confirm/write.
  const pureResolution =
    method === 'POST' &&
    [
      '/api/v1/mini-app/warranty/resolve-code',
      '/api/v1/mini-app/warranty-component-issues/resolve-code',
      '/api/v1/mini-app/nfc/resolve-code',
      '/api/v1/mini-app/nfc/resolve-tag',
    ].includes(options.path);
  if (
    ['GET', 'HEAD'].includes(method) ||
    pureResolution ||
    !options.path.startsWith('/api/v1/mini-app/') ||
    options.path.startsWith('/api/v1/mini-app/work-shifts/')
  )
    return options.headers;
  const state = getShiftState();
  const existingSave =
    method === 'PUT' &&
    /^\/api\/v1\/mini-app\/(?:inbound\/)?drafts\/[0-9a-f-]{36}$/i.test(
      options.path,
    ) &&
    Object.entries(options.headers ?? {}).some(
      ([k, v]) => k.toLowerCase() === 'if-match' && /^"[1-9][0-9]*"$/.test(v),
    );
  if (
    (state.closing || hasPendingEndIntent()) &&
    (!existingSave || hasPendingEndIntent())
  )
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'SHIFT_LOCAL_CLOSING',
      message:
        'Ca đang được kiểm tra kết thúc. Lưu hoặc đối chiếu tại đúng nghiệp vụ trước khi mở thao tác mới.',
    });
  if (state.shift?.tracking_contract !== 'p14-shift-v1') {
    if (knownTrackedFamily())
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'SHIFT_CURRENT_UNVERIFIED',
        message:
          'Family đã tracked nhưng chưa có ca ACTIVE được xác minh. Không chuyển sang ghi untracked.',
      });
    return options.headers; // no enrollment/backfill
  }
  const owner = currentShiftOwner();
  if (
    !owner ||
    !state.owner ||
    !sameShiftOwner(owner, state.owner) ||
    state.phase !== 'ACTIVE' ||
    !state.shift.lifecycle ||
    state.shift.lifecycle.mode === 'DISABLED'
  ) {
    throw new AppError({
      kind: 'blocked_by_gate',
      code:
        state.phase === 'ENDED' ? 'SHIFT_NOT_ACTIVE' : 'P14_SHIFT_NOT_ENABLED',
      message:
        'Ca tracked không cho thao tác này. Giữ yêu cầu gốc và đối chiếu tại owner.',
    });
  }
  const headers = { ...options.headers };
  const find = (name: string) =>
    Object.entries(headers).find(([k]) => k.toLowerCase() === name)?.[1];
  const nativeKey = find('idempotency-key');
  const trace = find('x-request-id') ?? nativeKey;
  if (!trace || !UUID.test(trace))
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'SHIFT_COMMAND_IDENTITY_REQUIRED',
      message:
        'Owner chưa lưu X-Request-ID ổn định trước gửi. Không tự tạo trace tại tầng HTTP.',
    });
  const suppliedShift = find('x-work-shift-id');
  if (suppliedShift && suppliedShift !== state.shift.shift_id)
    throw new AppError({
      kind: 'config',
      code: 'SHIFT_REQUEST_CONFLICT',
      message: 'Không đổi ca của ý định owner cũ.',
    });
  // The private volatile signature is compared only; never logged/exported or
  // persisted as an audit copy of form/file data. Multipart needs its owner's
  // explicit immutable identity; this seam cannot prove its file fingerprint.
  if (typeof FormData !== 'undefined' && options.body instanceof FormData)
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'SHIFT_UPLOAD_OWNER_UNVERIFIED',
      message: 'Owner upload chưa chốt fingerprint tệp. Không suy đủ coverage.',
    });
  const identityHeaders = Object.fromEntries(
    Object.entries(headers).filter(
      ([k]) =>
        ['idempotency-key', 'if-match'].includes(k.toLowerCase()) ||
        k.toLowerCase().startsWith('x-draft-') ||
        k.toLowerCase().includes('contract'),
    ),
  );
  const signature = stable([
    method,
    options.path,
    options.query,
    options.body,
    identityHeaders,
  ]);
  const key = stable([owner, nativeKey ?? trace]);
  const storedKey = 'shift.owner.binding:' + key;
  const persisted = getAppStorage().getObject<{
    shiftId: string;
    trace: string;
  }>(storedKey);
  if (
    persisted &&
    (persisted.shiftId !== state.shift.shift_id || persisted.trace !== trace)
  )
    throw new AppError({
      kind: 'config',
      code: 'SHIFT_REQUEST_CONFLICT',
      message: 'Không xoay ca/trace của intent owner đã lưu.',
    });
  const existing = bindings.get(key);
  if (
    existing &&
    (existing.trace !== trace ||
      existing.shiftId !== state.shift.shift_id ||
      existing.signature !== signature ||
      existing.generation !== state.generation)
  ) {
    throw new AppError({
      kind: 'config',
      code: 'SHIFT_REQUEST_CONFLICT',
      message:
        'Identity/body/ca của yêu cầu gốc đã thay đổi; dùng owner GET để đối chiếu.',
    });
  }
  bindings.set(key, {
    shiftId: state.shift.shift_id,
    trace,
    signature,
    generation: captureSessionScope().generation,
  });
  getAppStorage().setObject(storedKey, {
    shiftId: state.shift.shift_id,
    trace,
  });
  if (!find('x-work-shift-id'))
    headers['X-Work-Shift-ID'] = state.shift.shift_id;
  if (!find('x-request-id')) headers['X-Request-ID'] = trace;
  return headers;
}
export function resetShiftHeaderBindingsForTesting(): void {
  bindings.clear();
}
