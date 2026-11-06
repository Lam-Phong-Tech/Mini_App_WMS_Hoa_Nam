/** P04 owner admission. GET current only; never START/END/enroll a legacy ca. */
import { captureSessionScope, isSessionScopeCurrent } from '../auth/session';
import { AppError } from '../errors/AppError';
import { fetchCurrentWorkShift } from '../services/wms/workShift';
import type { P03Scope } from '../services/wms/p03Drafts';
import {
  currentShiftOwner,
  getShiftState,
  hasPendingEndIntent,
  sameShiftOwner,
  shiftMatchesOwner,
} from './shiftState';

export interface P04CommandBinding {
  requestId: string;
  shiftId: string;
}
export type P04Admission = (
  scope: P03Scope,
  command: 'SAVE' | 'RECORD' | 'CANCEL' | 'VALIDATE' | 'REVIEW',
  version: number,
  expectedShiftId?: string,
) => Promise<{ shiftId: string }>;

function rejectAdmission(code = 'P04_SHIFT_ADMISSION_REQUIRED'): never {
  throw new AppError({
    kind: 'blocked_by_gate',
    code,
    message:
      'Cần xác nhận ca TRACKED đang hoạt động của đúng tài khoản, phiên và kho trước khi lưu/quét/gửi. Không tự bắt đầu hoặc nâng cấp ca cũ; dữ liệu được giữ nguyên.',
  });
}

export const verifyP04Admission: P04Admission = async (
  scope,
  command,
  version,
  expectedShiftId,
) => {
  const auth = captureSessionScope(),
    owner = currentShiftOwner();
  if (!owner || !sameShiftOwner(owner, scope)) rejectAdmission();
  await fetchCurrentWorkShift();
  if (!isSessionScopeCurrent(auth)) rejectAdmission('P04_SHIFT_OWNER_CHANGED');
  const state = getShiftState(),
    shift = state.shift;
  const existingSave = command === 'SAVE' && version > 0;
  if (!shift) rejectAdmission();
  const activeShift = shift;
  if (
    !owner ||
    !state.owner ||
    !sameShiftOwner(owner, state.owner) ||
    !sameShiftOwner(owner, scope) ||
    state.generation !== auth.generation ||
    state.phase !== 'ACTIVE' ||
    !shiftMatchesOwner(activeShift, owner) ||
    activeShift.status !== 'ACTIVE' ||
    activeShift.tracking_contract !== 'p14-shift-v1' ||
    activeShift.lifecycle?.contract !== 'p01-p14-lifecycle-v1' ||
    activeShift.lifecycle.tracking_status !== 'TRACKED' ||
    !(
      activeShift.lifecycle.mode === 'ENABLED' ||
      (existingSave && activeShift.lifecycle.mode === 'DRAINING')
    ) ||
    (state.closing && !existingSave) ||
    hasPendingEndIntent(owner)
  )
    rejectAdmission();
  if (expectedShiftId && activeShift.shift_id !== expectedShiftId)
    rejectAdmission('P04_ORIGINAL_SHIFT_CHANGED');
  return { shiftId: activeShift.shift_id };
};
