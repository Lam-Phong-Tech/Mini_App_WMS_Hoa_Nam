/** Same original START key is the only exact historical lookup BE exposes.
 * current:null is not proof the original key never committed/ended. */
import { AppError } from '../errors/AppError';
import { captureSessionScope, isSessionScopeCurrent } from '../auth/session';
import {
  publishShiftState,
  shiftMatchesOwner,
  getShiftState,
  currentShiftOwner,
  sameShiftOwner,
  assertShiftResponseCurrent,
  knownTrackedFamily,
} from './shiftState';
import {
  getOrCreatePendingWorkShiftStart,
  markPendingWorkShiftStart,
  readPendingWorkShiftStart,
  clearPendingWorkShiftStart,
  isPreviewReadyShift,
  startWorkShift,
  fetchCurrentWorkShift,
  type WorkShift,
  type StartWorkShiftInput,
} from '../services/wms/workShift';

export function createShiftStartOwner(
  deps: {
    start?: typeof startWorkShift;
    current?: typeof fetchCurrentWorkShift;
  } = {},
) {
  let busy = false;
  const guard = (scope: ReturnType<typeof captureSessionScope>) => {
    if (!isSessionScopeCurrent(scope))
      throw new AppError({
        kind: 'cancelled',
        code: 'SHIFT_OWNER_CHANGED',
        message: 'Không dùng response START của phiên/kho cũ.',
      });
  };
  const guardOwner = (owner: StartWorkShiftInput) => {
    const current = currentShiftOwner();
    if (!current || !sameShiftOwner(current, owner))
      throw new AppError({
        kind: 'cancelled',
        code: 'SHIFT_OWNER_CHANGED',
        message: 'START/current không thuộc auth owner hiện tại.',
      });
  };
  return {
    async restore(owner: StartWorkShiftInput) {
      guardOwner(owner);
      const scope = captureSessionScope();
      const atDispatch = getShiftState();
      const shift = await (deps.current ?? fetchCurrentWorkShift)();
      guard(scope);
      assertShiftResponseCurrent(shift, atDispatch);
      if (shift && !shiftMatchesOwner(shift, owner))
        throw new AppError({
          kind: 'parse',
          message: 'Current khác actor/phiên/kho.',
        });
      if (deps.current) publishShiftState(shift, owner, scope.generation);
      return shift;
    },
    async start(
      owner: StartWorkShiftInput,
      replayUnknown = false,
    ): Promise<WorkShift> {
      if (busy)
        throw new AppError({ kind: 'config', message: 'START đang xử lý.' });
      guardOwner(owner);
      const saved = readPendingWorkShiftStart();
      if (
        saved &&
        saved.actorId === owner.actorId &&
        saved.authSessionId === owner.authSessionId &&
        saved.warehouseId === owner.warehouseId &&
        saved.outcome !== 'PREPARED' &&
        !replayUnknown
      )
        throw new AppError({
          kind: 'unknown',
          code: 'SHIFT_START_PENDING',
          message: 'Giữ START intent cũ; đọc current hoặc đối chiếu cùng key.',
        });
      const s = getShiftState();
      if (!saved && knownTrackedFamily() && !s.shift?.lifecycle && !s.admission?.new_tracked_start_supported)
        throw new AppError({
          kind: 'blocked_by_gate',
          code: 'SHIFT_LIFECYCLE_UNVERIFIED',
          message:
            'Family tracked chưa có mode lifecycle được xác minh. Không tự chuyển sang START legacy khi current:null.',
        });
      if (!saved && s.shift?.lifecycle?.mode === 'DRAINING')
        throw new AppError({
          kind: 'blocked_by_gate',
          code: 'SHIFT_START_PAUSED',
          message: 'DRAINING không nhận ca mới.',
        });
      if (
        !saved &&
        s.phase === 'ENDED' &&
        s.shift?.lifecycle?.mode === 'DISABLED'
      )
        throw new AppError({
          kind: 'blocked_by_gate',
          code: 'SHIFT_LIFECYCLE_NOT_ENABLED',
          message: 'DISABLED không mở ca kế tiếp.',
        });
      const scope = captureSessionScope();
      guard(scope);
      const intent = getOrCreatePendingWorkShiftStart(
        owner.authSessionId,
        owner.warehouseId,
        owner.actorId,
      );
      markPendingWorkShiftStart('IN_FLIGHT');
      busy = true;
      try {
        const shift = await (deps.start ?? startWorkShift)(
          owner,
          intent.idempotencyKey,
        );
        guard(scope);
        if (!shiftMatchesOwner(shift, owner))
          throw new AppError({
            kind: 'parse',
            message: 'START receipt không khớp identity.',
          });
        assertShiftResponseCurrent(shift, s);
        publishShiftState(shift, owner, scope.generation);
        if (shift.status === 'ENDED' || isPreviewReadyShift(shift, owner))
          clearPendingWorkShiftStart(owner.authSessionId);
        return shift;
      } catch (error) {
        if (isSessionScopeCurrent(scope)) markPendingWorkShiftStart('UNKNOWN');
        throw error;
      } finally {
        busy = false;
      }
    },
  };
}
export const shiftStartOwner = createShiftStartOwner();
