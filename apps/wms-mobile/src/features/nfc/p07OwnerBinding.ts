/** Durable identities owned by a NEW NFC attempt, never synthesized in HTTP.
 * No enrollment, old-journal migration, retries, recovery activation or END.
 */
import { AppError } from '../../errors/AppError';
import { createP03RequestId } from '../../services/wms/p03Drafts';
import {
  verifyP04Admission,
  type P04Admission,
} from '../../shift/p04Admission';
import type { NfcContext, NfcJournal } from './nfcAssignment';

export interface P07OwnerBinding {
  revision: 'p07-local-shift-identities-v1';
  shiftId: string;
  prepareRequestId: string;
  confirmRequestId: string;
  releaseRequestId: string;
}
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function fail(code: string, message: string): never {
  throw new AppError({ kind: 'blocked_by_gate', code, message });
}
export async function createP07OwnerBinding(
  context: NfcContext,
  {
    admission = verifyP04Admission,
    newId = createP03RequestId,
  }: { admission?: P04Admission; newId?: () => string } = {},
): Promise<P07OwnerBinding> {
  const { shiftId } = await admission(context, 'VALIDATE', 0);
  const ids = [newId(), newId(), newId()];
  if (
    !uuid.test(shiftId) ||
    ids.some(id => !uuid.test(id)) ||
    new Set(ids).size !== 3
  )
    fail(
      'NFC_OWNER_IDENTITY_INVALID',
      'Chưa tạo được identity riêng cho từng lệnh NFC. Chưa giữ chỗ hoặc ghi thẻ.',
    );
  return Object.freeze({
    revision: 'p07-local-shift-identities-v1',
    shiftId,
    prepareRequestId: ids[0],
    confirmRequestId: ids[1],
    releaseRequestId: ids[2],
  });
}
const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
    ? Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, stable(v)]),
      )
    : value;
export async function p07OwnerHeaders(
  journal: NfcJournal,
  command: 'PREPARE' | 'RECOVERY_PREPARE' | 'WRITE' | 'CONFIRM' | 'RELEASE',
  {
    load,
    admission = verifyP04Admission,
  }: {
    load(context: NfcContext): NfcJournal | undefined;
    admission?: P04Admission;
  },
): Promise<Record<string, string>> {
  const b =
    command === 'RECOVERY_PREPARE'
      ? journal.recoveryPrepare?.ownerBinding
      : journal.ownerBinding;
  if (
    !b ||
    b.revision !== 'p07-local-shift-identities-v1' ||
    [
      b.shiftId,
      b.prepareRequestId,
      b.confirmRequestId,
      b.releaseRequestId,
    ].some(id => !uuid.test(id)) ||
    new Set([b.prepareRequestId, b.confirmRequestId, b.releaseRequestId])
      .size !== 3
  )
    fail(
      'NFC_ORIGINAL_OWNER_IDENTITY_REQUIRED',
      'Lượt NFC chưa có identity owner gốc. Giữ nguyên để đối chiếu; không bổ sung trace/ca vào lượt cũ.',
    );
  const expectedStage = {
    PREPARE: 'PREPARING',
    RECOVERY_PREPARE: 'RECOVERY_PREPARING',
    WRITE: 'PREPARED',
    CONFIRM: 'CONFIRMING',
    RELEASE: 'PREPARED',
  }[command];
  if (
    journal.stage !== expectedStage ||
    (command === 'CONFIRM' &&
      (!journal.writtenPayload ||
        journal.writtenPayload !== journal.preparation.nfc_payload))
  )
    fail(
      'NFC_OWNER_STAGE_INVALID',
      'Lệnh NFC chưa ở đúng mốc đã lưu. Chưa gửi lại hoặc ghi thẻ.',
    );
  const assertPersisted = () => {
    const saved = load(journal.context);
    if (
      !saved ||
      JSON.stringify(stable(saved)) !== JSON.stringify(stable(journal))
    )
      fail(
        'NFC_JOURNAL_UNVERIFIED',
        'Chưa đọc lại được đúng journal NFC. Chưa giữ chỗ, ghi hoặc xác nhận.',
      );
  };
  assertPersisted();
  const current = await admission(journal.context, 'VALIDATE', 0, b.shiftId);
  if (current.shiftId !== b.shiftId)
    fail(
      'NFC_ORIGINAL_SHIFT_CHANGED',
      'Không chuyển lượt NFC sang ca khác. Giữ yêu cầu gốc để đối chiếu.',
    );
  assertPersisted();
  return {
    'X-Work-Shift-ID': b.shiftId,
    'X-Request-ID':
      command === 'PREPARE' || command === 'RECOVERY_PREPARE'
        ? b.prepareRequestId
        : command === 'RELEASE'
        ? b.releaseRequestId
        : b.confirmRequestId,
  };
}
