/** HTTP admission points at the original service capture, never another identity/store. */
import type { RequestOptions } from '../api/client';
import type { AppEnvironment } from '../config/env';
import { p14DevEnabled } from '../config/p14Release';
import { AppError } from '../errors/AppError';
import { captureSessionScope, isSessionScopeCurrent } from '../auth/session';
import {
  getShiftState,
  currentShiftOwner,
  protocolEndSupported,
  shiftMatchesOwner,
} from './shiftState';
import { readShiftLocalOwners } from './localOwners';
import { getAppStorage } from '../storage/storage';
const captures = new Map<string, (options: RequestOptions) => void>();
export function bindOriginalP14End(
  key: string,
  check: (options: RequestOptions) => void,
) {
  captures.set(key, check);
  return () => captures.delete(key);
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const denied = () => {
  throw new AppError({
    kind: 'blocked_by_gate',
    code: 'P14_REQUEST_NOT_READY',
    message:
      'Yêu cầu END chưa đủ bằng chứng gốc, quyền DEV hoặc local CLEAN. Giữ nguyên yêu cầu để đối chiếu.',
  });
};
export function assertP14ClosureRequest(
  options: RequestOptions,
  env: AppEnvironment,
) {
  if (!p14DevEnabled(env)) denied();
  const h = Object.fromEntries(
    Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  if (options.method === 'GET') {
    if (
      Object.hasOwn(options, 'body') ||
      Object.keys(h).some(k =>
        [
          'authorization',
          'idempotency-key',
          'if-match',
          'x-request-id',
        ].includes(k),
      )
    )
      denied();
    return;
  }
  const state = getShiftState(),
    shift = state.shift,
    owner = currentShiftOwner();
  if (
    !shift ||
    !owner ||
    !shiftMatchesOwner(shift, owner) ||
    !protocolEndSupported(shift)
  )
    return denied();
  if (
    options.path !== `/api/v1/mini-app/work-shifts/${shift.shift_id}/end` ||
    Object.keys(options.query ?? {}).length ||
    Object.keys(h).some(k => !['idempotency-key', 'if-match'].includes(k))
  )
    denied();
  const body = record(options.body),
    key = h['idempotency-key'],
    journal = record(
      getAppStorage().getObject(
        'shift.end.check-only:' + JSON.stringify(owner),
      ),
    );
  if (
    !key ||
    !captures.has(key) ||
    journal.key !== key ||
    journal.version !== shift.version ||
    record(journal.shift).actor_id !== owner.actorId ||
    record(journal.shift).auth_session_id !== owner.authSessionId ||
    record(journal.shift).warehouse_id !== owner.warehouseId ||
    h['if-match'] !== `"${shift.version}"` ||
    record(journal.shift).shift_id !== shift.shift_id ||
    Object.keys(body).sort().join(',') !==
      'check_token,local_state,pending_request_ids,warehouse_id' ||
    body.warehouse_id !== owner.warehouseId ||
    body.local_state !== 'CLEAN' ||
    !Array.isArray(body.pending_request_ids) ||
    body.pending_request_ids.length
  )
    denied();
  const scope = captureSessionScope(),
    local = readShiftLocalOwners();
  if (
    !local.coverageComplete ||
    local.state !== 'CLEAN' ||
    local.busy ||
    local.pendingRequestIds.length ||
    !isSessionScopeCurrent(scope)
  )
    denied();
  captures.get(key)!(options);
}
