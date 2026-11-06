import { getSession } from '../../auth/session';
import { hasServerTime, serverNow } from '../../auth/serverClock';
import { AppError } from '../../errors/AppError';
import { assertP07Connected } from '../../config/p07Release';
import {
  getNfcAvailability,
  assertNfcAssignmentWritable,
  readNfcTag,
  writeNfcTextToTag,
} from '../../native/nfc';
import { fetchCurrentUser } from '../../services/wms/queries';
import { UUID_PATTERN } from '../../services/wms/workShift';
import {
  confirmNfcAssignment,
  createNfcConfirmationKey,
  getNfcConfirmation,
  prepareNfcAssignment,
  prepareNfcRecovery,
  releaseNfcReservation,
  resolveNfcTag,
} from '../../services/wms/nfc';
import { getAppStorage } from '../../storage/storage';
import {
  NfcAssignment,
  type NfcContext,
  type NfcJournal,
} from './nfcAssignment';
import { createP07OwnerBinding, p07OwnerHeaders } from './p07OwnerBinding';

export function currentNfcContext(): NfcContext | undefined {
  const session = getSession();
  if (
    !session?.userId ||
    !session.authSessionId ||
    !session.activeWarehouseId ||
    !UUID_PATTERN.test(session.activeWarehouseId)
  )
    return undefined;
  return {
    actorId: session.userId,
    authSessionId: session.authSessionId,
    warehouseId: session.activeWarehouseId,
  };
}
const journalKey = (c: NfcContext): string =>
  'p07.nfc.' + c.actorId + '.' + c.authSessionId + '.' + c.warehouseId;

export function createNativeNfcAssignment(): NfcAssignment {
  const load = (context: NfcContext) =>
    getAppStorage().getObject<NfcJournal>(journalKey(context));
  return new NfcAssignment({
    context: currentNfcContext,
    now: serverNow,
    createKey: createNfcConfirmationKey,
    async preflight(context) {
      assertP07Connected();
      const user = await fetchCurrentUser();
      if (
        user.id !== context.actorId ||
        user.auth_session_id !== context.authSessionId ||
        user.active_warehouse_id !== context.warehouseId ||
        user.warehouse_context?.status !== 'READY'
      )
        throw new AppError({
          kind: 'auth',
          code: 'NFC_SESSION_CHANGED',
          message: 'Phiên/kho chưa được server xác nhận.',
        });
      if (!user.permissions?.includes('physical_code.assign_rfid'))
        throw new AppError({
          kind: 'http',
          status: 403,
          code: 'ACCESS_DENIED',
          message: 'Không có quyền gán NFC.',
        });
      if (!hasServerTime())
        throw new AppError({
          kind: 'config',
          code: 'NFC_SERVER_TIME_REQUIRED',
          message: 'Chưa nhận giờ server để kiểm tra hạn giữ chỗ.',
        });
      const availability = await getNfcAvailability();
      if (availability !== 'available')
        throw new AppError({
          kind: 'config',
          code:
            availability === 'disabled'
              ? 'NFC_DISABLED'
              : availability === 'unavailable'
              ? 'NFC_NO_ACTIVITY'
              : 'NFC_UNSUPPORTED',
          message: 'NFC chưa sẵn sàng.',
        });
    },
    read: readNfcTag,
    assertWritable: assertNfcAssignmentWritable,
    createOwnerBinding: createP07OwnerBinding,
    validateOwnerBeforeWrite: async journal => {
      await p07OwnerHeaders(journal, 'WRITE', { load });
    },
    write: writeNfcTextToTag,
    resolveTag: (uid, context) =>
      resolveNfcTag({ hardwareUid: uid }, { warehouseId: context.warehouseId }),
    prepare: async (id, context, journal) => {
      if (!journal)
        throw new AppError({
          kind: 'config',
          code: 'NFC_JOURNAL_UNVERIFIED',
          message: 'Chưa lưu ý định NFC.',
        });
      return prepareNfcAssignment(id, {
        warehouseId: context.warehouseId,
        headers: await p07OwnerHeaders(journal, 'PREPARE', { load }),
      });
    },
    prepareRecovery: async (source, active) => {
      if (!active)
        throw new AppError({
          kind: 'config',
          code: 'NFC_JOURNAL_UNVERIFIED',
          message: 'Chưa lưu ý định phục hồi NFC.',
        });
      return prepareNfcRecovery(source.itemId, source.key, {
        warehouseId: source.context.warehouseId,
        headers: await p07OwnerHeaders(active, 'RECOVERY_PREPARE', { load }),
      });
    },
    confirm: async journal =>
      confirmNfcAssignment(
        journal.itemId,
        {
          hardwareUid: journal.hardwareUid,
          writtenPayload: journal.writtenPayload!,
          reservationToken: journal.preparation.reservation_token,
          idempotencyKey: journal.key,
        },
        {
          warehouseId: journal.context.warehouseId,
          headers: await p07OwnerHeaders(journal, 'CONFIRM', { load }),
        },
      ),
    reconcile: journal =>
      getNfcConfirmation(journal.itemId, journal.key, {
        warehouseId: journal.context.warehouseId,
      }),
    release: async journal =>
      releaseNfcReservation(
        journal.itemId,
        journal.preparation.reservation_token,
        {
          warehouseId: journal.context.warehouseId,
          headers: await p07OwnerHeaders(journal, 'RELEASE', { load }),
        },
      ),
    load,
    save: journal => {
      getAppStorage().setObject(journalKey(journal.context), journal);
      if (JSON.stringify(load(journal.context)) !== JSON.stringify(journal))
        throw new AppError({
          kind: 'config',
          code: 'NFC_JOURNAL_UNVERIFIED',
          message: 'Không lưu và đọc lại được đúng lượt NFC; chưa gửi lệnh.',
        });
    },
    remove: context => getAppStorage().remove(journalKey(context)),
  });
}
