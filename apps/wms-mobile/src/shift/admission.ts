import { AppError } from '../errors/AppError';
import { ownerUuid } from '../app/ownerNavigation';
import type { StartWorkShiftInput, WorkShift } from '../services/wms/workShift';
import { parseDocumentTimestamp } from '../services/wms/documentTimestamps';

export interface ShiftAdmission {
  readonly actor_id: string;
  readonly auth_session_id: string;
  readonly warehouse_id: string;
  readonly mode: 'ENABLED' | 'DRAINING' | 'DISABLED';
  readonly tracked_family: boolean;
  readonly owner_fence_required: boolean;
  readonly new_tracked_start_supported: boolean;
  readonly current_state: 'NO_ACTIVE_SHIFT' | 'ACTIVE';
  readonly unavailable_reason: string | null;
  readonly observed_at: string;
}
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export function parseShiftAdmission(
  value: unknown,
  shift: WorkShift | null,
  owner: StartWorkShiftInput,
): ShiftAdmission {
  const a = object(value),
    context = object(a.warehouse_context);
  const capable =
    shift === null && a.mode === 'ENABLED' && context.status === 'READY';
  const reason = shift
    ? 'SHIFT_ALREADY_ACTIVE'
    : a.mode === 'DRAINING'
    ? 'SHIFT_START_PAUSED'
    : a.mode === 'DISABLED'
    ? 'P14_SHIFT_NOT_ENABLED'
    : context.status !== 'READY'
    ? context.error_code
    : null;
  if (
    a.contract !== 'p01-p14-admission-v1' ||
    a.revision !== 'p01-p14-admission-r1' ||
    a.actor_id !== owner.actorId ||
    a.auth_session_id !== owner.authSessionId ||
    a.warehouse_id !== owner.warehouseId ||
    !ownerUuid(a.actor_id) ||
    !ownerUuid(a.auth_session_id) ||
    !ownerUuid(a.warehouse_id) ||
    context.status !== 'READY' ||
    !['ENABLED', 'DRAINING', 'DISABLED'].includes(String(a.mode)) ||
    typeof a.tracked_family !== 'boolean' ||
    a.owner_fence_required !== (a.mode === 'ENABLED' || a.tracked_family) ||
    a.current_state !== (shift ? 'ACTIVE' : 'NO_ACTIVE_SHIFT') ||
    a.current_state_source !== 'OWNED_ACTIVE_SHIFT_QUERY' ||
    a.current_shift_id !== (shift?.shift_id ?? null) ||
    a.current_tracking_contract !== (shift?.tracking_contract ?? null) ||
    (shift?.tracking_contract === 'p14-shift-v1' &&
      a.tracked_family !== true) ||
    a.new_tracked_start_supported !== capable ||
    a.new_shift_tracking_contract !== (capable ? 'p14-shift-v1' : null) ||
    a.unavailable_reason !== reason ||
    a.local_state_verified !== false ||
    a.legacy_upgrade_allowed !== false ||
    a.legacy_fallback_authorized !== false ||
    a.owner_coverage !== 'PARTIAL_EXPLICIT_OWNER_PROTOCOLS' ||
    a.pending_start_end_policy !==
      'RECONCILE_ORIGINAL_IDENTITY_BEFORE_NEW_START' ||
    a.admission_scope !==
      'SERVER_CHECK_ONLY_REQUIRES_LOCAL_RECONCILIATION_AND_USER_INTENT' ||
    a.freshness !== 'REOBSERVE_BEFORE_START_SERVER_REVALIDATES' ||
    parseDocumentTimestamp(a.observed_at).status !== 'RECORDED' ||
    typeof a.observed_at !== 'string' ||
    !a.observed_at.endsWith('Z')
  )
    throw new AppError({
      kind: 'parse',
      code: 'SHIFT_ADMISSION_INVALID',
      message:
        'Nguồn nhận ca mới chưa khớp phiên/kho và contract. Không chuyển sang ca legacy.',
    });
  return Object.freeze({
    actor_id: a.actor_id,
    auth_session_id: a.auth_session_id,
    warehouse_id: a.warehouse_id,
    mode: a.mode as ShiftAdmission['mode'],
    tracked_family: a.tracked_family,
    owner_fence_required: a.owner_fence_required as boolean,
    new_tracked_start_supported: capable,
    current_state: shift ? 'ACTIVE' : 'NO_ACTIVE_SHIFT',
    unavailable_reason: reason as string | null,
    observed_at: a.observed_at,
  });
}
