/** Shared P01/Home/P14 state. Server reads/receipts, never a synthetic shift. */
import {
  captureSessionScope,
  getSession,
  subscribeSession,
} from '../auth/session';
import { AppError } from '../errors/AppError';
import { getAppStorage } from '../storage/storage';
import type { WorkShift, StartWorkShiftInput } from '../services/wms/workShift';
import type { ShiftAdmission } from './admission';

export const SHIFT_LIFECYCLE_VERSION = 'p01-p14-lifecycle-v1';
export const SHIFT_SAFETY_REVISION = 'p01-p14-safety-r2';
export const SHIFT_SOURCE_SHA = '026f4f758da5e5ef8c16096ad5ec5cc963b37dba';
export interface ShiftState {
  readonly admission?: ShiftAdmission;
  readonly phase: 'UNVERIFIED' | 'NO_SHIFT' | 'ACTIVE' | 'ENDED';
  readonly owner?: StartWorkShiftInput;
  /** Only this field is current server proof. Hidden while revalidating. */
  readonly shift?: WorkShift;
  /** Same-owner history/fence only; never Home/END/owner-write authority. */
  readonly lastVerifiedShift?: WorkShift;
  readonly generation?: number;
  /** Changes on refresh/reset; auth family generation remains stable on refresh. */
  readonly verificationEpoch: number;
  /** Closing is an owner write barrier, never evidence of local CLEAN. */
  readonly closing?: boolean;
}
let state: ShiftState = Object.freeze({
  phase: 'UNVERIFIED',
  verificationEpoch: 0,
});
let observedSession = getSession(); // memory-only auth owner, never a journal field
const listeners = new Set<() => void>();
export const sameShiftOwner = (
  a: StartWorkShiftInput,
  b: StartWorkShiftInput,
): boolean =>
  a.actorId === b.actorId &&
  a.authSessionId === b.authSessionId &&
  a.warehouseId === b.warehouseId;
export const currentShiftOwner = (): StartWorkShiftInput | undefined => {
  const s = getSession();
  return s?.userId && s.authSessionId && s.activeWarehouseId
    ? {
        actorId: s.userId,
        authSessionId: s.authSessionId,
        warehouseId: s.activeWarehouseId,
      }
    : undefined;
};
const familyKey = (owner: StartWorkShiftInput) =>
  'shift.tracked-family:' +
  JSON.stringify([owner.actorId, owner.authSessionId]);
/** A private fence marker is not a restored shift, END proof or DB lookup. */
export function knownTrackedFamily(): boolean {
  const owner = currentShiftOwner();
  return !!owner && getAppStorage().getBoolean(familyKey(owner)) === true;
}
/** Check-only END journals fence admission within the same actor/login family. */
export function hasPendingEndIntent(owner = currentShiftOwner()): boolean {
  if (!owner) return false;
  return getAppStorage()
    .keys()
    .some(key => {
      const prefix = 'shift.end.check-only:';
      if (!key.startsWith(prefix)) return false;
      try {
        const savedOwner = JSON.parse(
          key.slice(prefix.length),
        ) as StartWorkShiftInput;
        return (
          savedOwner?.actorId === owner.actorId &&
          savedOwner?.authSessionId === owner.authSessionId
        );
      } catch {
        return false; // never adopt a foreign/undecodable identity as this owner
      }
    });
}
function notify() {
  for (const listener of listeners) listener();
}
export function resetShiftState(): void {
  state = Object.freeze({
    phase: 'UNVERIFIED',
    verificationEpoch: state.verificationEpoch + 1,
  });
  notify();
}
export function getShiftState(): ShiftState {
  return state;
}
export function subscribeShiftState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function shiftMatchesOwner(
  shift: WorkShift,
  owner: StartWorkShiftInput,
): boolean {
  return (
    shift.actor_id === owner.actorId &&
    shift.auth_session_id === owner.authSessionId &&
    shift.warehouse_id === owner.warehouseId
  );
}
const staleResponse = (): never => {
  throw new AppError({
    kind: 'cancelled',
    code: 'SHIFT_RESPONSE_STALE',
    message: 'Response ca cũ không được ghi đè ca/version hiện tại.',
  });
};
/** A current read cannot erase/replace a newer shift published while it waited. */
export function assertShiftResponseCurrent(
  shift: WorkShift | null,
  atDispatch: ShiftState,
): void {
  if (state.verificationEpoch !== atDispatch.verificationEpoch) staleResponse();
  if (
    state !== atDispatch &&
    state.shift &&
    (shift ? shift.shift_id !== state.shift.shift_id : state.phase !== 'ENDED')
  )
    staleResponse();
}
/** Historical END receipts are not authority to end another known current ca. */
export function assertKnownShiftIdentity(shift: WorkShift): void {
  const known = state.shift ?? state.lastVerifiedShift;
  if (known && known.shift_id !== shift.shift_id) staleResponse();
}
export function publishShiftState(
  shift: WorkShift | null,
  owner: StartWorkShiftInput,
  generation = captureSessionScope().generation,
  admission?: ShiftAdmission,
): void {
  const current = currentShiftOwner();
  if (
    !current ||
    !sameShiftOwner(current, owner) ||
    generation !== captureSessionScope().generation ||
    (shift && !shiftMatchesOwner(shift, owner))
  ) {
    throw new AppError({
      kind: 'cancelled',
      code: 'SHIFT_OWNER_CHANGED',
      message: 'Ca không thuộc đúng người/phiên/kho hiện tại.',
    });
  }
  if (
    knownTrackedFamily() &&
    shift &&
    shift.tracking_contract !== 'p14-shift-v1'
  )
    throw new AppError({
      kind: 'parse',
      code: 'SHIFT_TRACKING_DOWNGRADE',
      message: 'Không chuyển family tracked thành legacy/untracked.',
    });
  if (shift && !['ACTIVE', 'ENDED'].includes(shift.status))
    throw new AppError({
      kind: 'parse',
      code: 'SHIFT_STATUS_INVALID',
      message: 'Trạng thái ca không đúng contract.',
    });
  const previous = state.shift ?? state.lastVerifiedShift;
  if (admission && (admission.actor_id !== owner.actorId || admission.auth_session_id !== owner.authSessionId ||
    admission.warehouse_id !== owner.warehouseId || (knownTrackedFamily() && !admission.tracked_family)))
    throw new AppError({ kind: 'parse', code: 'SHIFT_ADMISSION_DOWNGRADE', message: 'Không bỏ hàng rào family tracked hoặc nhận capability khác owner.' });
  if (
    shift &&
    previous?.shift_id === shift.shift_id &&
    ((previous.status === 'ENDED' && shift.status !== 'ENDED') ||
      (previous.version !== undefined &&
        shift.version !== undefined &&
        shift.version < previous.version))
  )
    staleResponse();
  // current:null after END must not discard the tracked family history/fence.
  if (shift?.tracking_contract === 'p14-shift-v1' || admission?.tracked_family)
    getAppStorage().setBoolean(familyKey(owner), true);
  state = Object.freeze({
    admission,
    owner: Object.freeze({ ...owner }),
    shift: shift
      ? Object.freeze({
          ...shift,
          ...(shift.lifecycle
            ? { lifecycle: Object.freeze({ ...shift.lifecycle }) }
            : {}),
        })
      : undefined,
    ...(shift === null && previous ? { lastVerifiedShift: previous } : {}),
    generation,
    verificationEpoch: state.verificationEpoch,
    closing:
      shift?.status === 'ACTIVE' && previous?.shift_id === shift.shift_id
        ? state.closing
        : false,
    phase:
      shift === null
        ? 'NO_SHIFT'
        : shift.status === 'ENDED'
        ? 'ENDED'
        : 'ACTIVE',
  });
  notify();
}
export function protocolEndSupported(shift: WorkShift | undefined): boolean {
  return (
    !!shift &&
    shift.status === 'ACTIVE' &&
    shift.tracking_contract === 'p14-shift-v1' &&
    shift.lifecycle?.contract === SHIFT_LIFECYCLE_VERSION &&
    shift.lifecycle.end_supported === true &&
    ['ENABLED', 'DRAINING'].includes(shift.lifecycle.mode)
  );
}
export function requestShiftClose(): void {
  if (!protocolEndSupported(state.shift)) return;
  state = Object.freeze({ ...state, closing: true });
  notify();
}
export function cancelShiftClose(): void {
  if (hasPendingEndIntent()) return;
  state = Object.freeze({ ...state, closing: false });
  notify();
}
subscribeSession(next => {
  const previous = observedSession;
  observedSession = next;
  const owner = currentShiftOwner();
  if (
    state.owner &&
    (!owner ||
      !sameShiftOwner(owner, state.owner) ||
      state.generation !== captureSessionScope().generation)
  )
    resetShiftState();
  else if (
    previous &&
    next &&
    previous.authSessionId &&
    previous.userId === next.userId &&
    previous.authSessionId === next.authSessionId &&
    previous.activeWarehouseId === next.activeWarehouseId &&
    (previous.accessToken !== next.accessToken ||
      (next.issuedAtMs !== undefined &&
        previous.issuedAtMs !== next.issuedAtMs))
  ) {
    // Preserve the family/request identities, but remove capability proof until
    // current is re-read. Fence delayed responses even before first publication.
    state = Object.freeze({
      phase: 'UNVERIFIED',
      owner: state.owner,
      generation: state.generation,
      ...(state.shift ?? state.lastVerifiedShift
        ? { lastVerifiedShift: state.shift ?? state.lastVerifiedShift }
        : {}),
      verificationEpoch: state.verificationEpoch + 1,
    });
    notify();
  }
});
