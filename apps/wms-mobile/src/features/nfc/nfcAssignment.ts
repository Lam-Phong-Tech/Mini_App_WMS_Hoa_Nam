import { AppError, toAppError } from '../../errors/AppError';
import type { NativeNfcTag, WrittenNfcTag } from '../../native/nfc';
import type { P07OwnerBinding } from './p07OwnerBinding';
import {
  verifyNfcRejection,
  type NfcRejectedConfirmation,
} from '../../contracts/p07NfcRecovery';
import {
  p07AssignmentBlock,
  type NfcConfirmation,
  type NfcConfirmationStatus,
  type NfcPreparation,
  type NfcTagResolution,
} from '../../services/wms/nfc';

export interface NfcContext {
  actorId: string;
  authSessionId: string;
  warehouseId: string;
}
export interface NfcReadInspection {
  context: NfcContext;
  itemId: string;
  hardwareUid: string;
  hasNdefData?: boolean;
}
/**
 * Volatile, read-only evidence used by P17.S03. It is deliberately separate
 * from the write journal: seeing a UID or an NDEF payload never proves a WMS
 * assignment and must not create/release/confirm an NFC request.
 */
export interface NfcMappingObservation {
  context: NfcContext;
  itemId: string;
  hardwareUid: string;
  resolveCode?: string;
  verification: 'verified' | 'unverified';
  physicalCodeId?: string;
  status: 'ASSIGNED' | 'LOCKED' | null;
  statusLabel?: string;
  canViewLink: boolean;
  product?: {
    code?: string;
    name?: string;
    sku?: string;
    serial?: string;
  };
}
export type NfcStage =
  | 'PREPARING'
  | 'PREPARE_UNKNOWN'
  | 'PREPARED'
  | 'WRITING'
  | 'WRITE_UNKNOWN'
  | 'READBACK_VERIFIED'
  | 'CONFIRMING'
  | 'UNKNOWN'
  | 'REJECTED'
  | 'RECOVERY_PREPARING'
  | 'RECOVERY_PREPARE_UNKNOWN'
  | 'RECOVERY_READY'
  | 'CONFIRMED'
  | 'RELEASED';
export interface NfcJournal {
  context: NfcContext;
  itemId: string;
  key: string;
  preparation: NfcPreparation;
  hardwareUid: string;
  stage: NfcStage;
  /** Optional only for legacy journals; never backfilled into an old attempt. */
  ownerBinding?: P07OwnerBinding;
  readAt?: string;
  writtenPayload?: string;
  result?: NfcConfirmation;
  confirmationIssue?: { code?: string; status?: number; requestId?: string };
  lastCheck?: { state: 'PROCESSING' | 'UNKNOWN'; checkedAt: string };
  rejection?: NfcRejectedConfirmation;
  recoveryEligibilityStale?: boolean;
  /** Immutable old operation retained across a new, explicitly permitted attempt. */
  recoveryOrigin?: NfcJournal;
  recoveryPrepare?: {
    source: NfcJournal;
    preparation?: NfcPreparation;
    ownerBinding?: P07OwnerBinding;
  };
}
export interface NfcAssignmentDeps {
  context(): NfcContext | undefined;
  preflight(context: NfcContext): Promise<void>;
  assertWritable(): Promise<void>;
  createOwnerBinding?(context: NfcContext): Promise<P07OwnerBinding>;
  validateOwnerBeforeWrite?(journal: NfcJournal): Promise<void>;
  now(): number;
  createKey(itemId: string, uid: string): string;
  read(): Promise<NativeNfcTag>;
  write(
    payload: string,
    uid: string,
    remainingMs: number,
  ): Promise<WrittenNfcTag>;
  resolveTag(uid: string, context: NfcContext): Promise<NfcTagResolution>;
  prepare(
    itemId: string,
    context: NfcContext,
    journal?: NfcJournal,
  ): Promise<NfcPreparation>;
  prepareRecovery?(
    rejectedJournal: NfcJournal,
    activeJournal?: NfcJournal,
  ): Promise<NfcPreparation>;
  confirm(journal: NfcJournal): Promise<NfcConfirmation>;
  reconcile(journal: NfcJournal): Promise<NfcConfirmationStatus>;
  release(
    journal: NfcJournal,
  ): Promise<{ released: boolean; stock_effect: string }>;
  load(context: NfcContext): NfcJournal | undefined;
  save(journal: NfcJournal): void;
  remove(context: NfcContext): void;
}
const sameContext = (a: NfcContext | undefined, b: NfcContext): boolean =>
  !!a &&
  a.actorId === b.actorId &&
  a.authSessionId === b.authSessionId &&
  a.warehouseId === b.warehouseId;
const fail = (code: string, message: string): never => {
  throw new AppError({ kind: 'config', code, message });
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** No background writes/retry. A restarted physical write is read-only recovery. */
export class NfcAssignment {
  private journal?: NfcJournal;
  private inspection?: NfcReadInspection;
  private mappingObservation?: NfcMappingObservation;
  private busy = false;
  private disposed = false;
  constructor(private readonly deps: NfcAssignmentDeps) {
    const context = deps.context();
    const loaded = context ? deps.load(context) : undefined;
    if (
      loaded &&
      sameContext(loaded.context, context!) &&
      loaded.key &&
      loaded.itemId &&
      loaded.preparation
    ) {
      this.journal = clone(loaded);
      if (loaded.stage === 'PREPARING') this.setStage('PREPARE_UNKNOWN');
      if (loaded.stage === 'WRITING') this.setStage('WRITE_UNKNOWN');
      if (loaded.stage === 'CONFIRMING') this.setStage('UNKNOWN');
      if (loaded.stage === 'RECOVERY_PREPARING')
        this.setStage('RECOVERY_PREPARE_UNKNOWN');
    }
  }
  resetConfirmed(): void {
    if (
      this.busy ||
      !this.journal ||
      !['CONFIRMED', 'RELEASED'].includes(this.journal.stage)
    )
      fail(
        'NFC_UNRESOLVED_OPERATION',
        'Đối chiếu yêu cầu hiện tại trước khi liên kết thẻ khác.',
      );
    const terminal = this.journal;
    if (!terminal) return;
    this.assertContext(terminal.context);
    this.deps.remove(terminal.context);
    this.journal = undefined;
  }
  snapshot(): NfcJournal | undefined {
    return this.journal ? clone(this.journal) : undefined;
  }
  /** Volatile physical observation only: never a reservation or receipt. */
  readSnapshot(): NfcReadInspection | undefined {
    return !this.disposed &&
      this.inspection &&
      sameContext(this.deps.context(), this.inspection.context)
      ? clone(this.inspection)
      : undefined;
  }
  /** Current-scope presentation evidence only; never persisted as a receipt. */
  mappingSnapshot(): NfcMappingObservation | undefined {
    return !this.disposed &&
      this.mappingObservation &&
      sameContext(this.deps.context(), this.mappingObservation.context)
      ? clone(this.mappingObservation)
      : undefined;
  }
  dispose(): void {
    this.disposed = true;
    this.inspection = undefined;
    this.mappingObservation = undefined;
  }
  private assertContext(context: NfcContext): void {
    if (this.disposed || !sameContext(this.deps.context(), context))
      fail(
        'NFC_SESSION_CHANGED',
        'Phiên hoặc kho đã thay đổi; không tiếp tục yêu cầu NFC cũ.',
      );
  }
  private setStage(stage: NfcStage): void {
    if (!this.journal) return;
    this.journal = { ...this.journal, stage };
    this.deps.save(this.journal);
  }
  private async exclusive<T>(run: () => Promise<T>): Promise<T> {
    if (this.busy) fail('NFC_BUSY', 'Thao tác NFC đang xử lý.');
    this.busy = true;
    try {
      return await run();
    } finally {
      this.busy = false;
    }
  }
  private requireJournal(): NfcJournal {
    const journal = this.journal;
    if (!journal) return fail('NFC_NO_RESERVATION', 'Chưa có giữ chỗ NFC.');
    this.assertContext(journal.context);
    return journal;
  }
  private remaining(journal: NfcJournal): number {
    const expiry = Date.parse(journal.preparation.expires_at ?? '');
    const remaining = expiry - this.deps.now();
    if (!Number.isFinite(remaining) || remaining <= 0)
      return fail(
        'NFC_RESERVATION_EXPIRED',
        'Giữ chỗ hết hạn. Không tự ghi lại chip hoặc tạo yêu cầu mới.',
      );
    return remaining;
  }
  private observeMapping(
    itemId: string,
    chip: NativeNfcTag,
    context: NfcContext,
    mapping: NfcTagResolution,
  ): void {
    const sourceStatus = mapping.nfc?.tab_status;
    const status =
      sourceStatus === 'ASSIGNED' || sourceStatus === 'LOCKED'
        ? sourceStatus
        : null;
    const physicalCodeId = mapping.nfc?.physical_code_id?.trim();
    const returnedUid = mapping.nfc?.hardware_uid?.trim().toUpperCase();
    const verified =
      mapping.resolve_code === 'RESOLVED' &&
      !!physicalCodeId &&
      status !== null &&
      (!returnedUid || returnedUid === chip.hardwareUid.trim().toUpperCase());
    const item = mapping.item;
    this.mappingObservation = {
      context: clone(context),
      itemId,
      hardwareUid: chip.hardwareUid,
      resolveCode: mapping.resolve_code,
      verification: verified ? 'verified' : 'unverified',
      ...(physicalCodeId ? { physicalCodeId } : {}),
      status: verified ? status : null,
      ...(verified && mapping.nfc?.status_label
        ? { statusLabel: mapping.nfc.status_label }
        : {}),
      canViewLink: verified,
      ...(verified && item
        ? {
            product: {
              ...(item.item_unique ? { code: item.item_unique } : {}),
              ...(item.sku_name ?? mapping.sku?.name
                ? { name: item.sku_name ?? mapping.sku?.name ?? undefined }
                : {}),
              ...(item.sku_code ?? mapping.sku?.sku_code
                ? { sku: item.sku_code ?? mapping.sku?.sku_code ?? undefined }
                : {}),
              ...(item.serial_number ?? item.serial
                ? { serial: item.serial_number ?? item.serial ?? undefined }
                : {}),
            },
          }
        : {}),
    };
  }
  private validatePreparation(
    prepared: NfcPreparation,
    itemId: string,
    context: NfcContext,
  ): void {
    if (
      prepared.item?.item_id !== itemId ||
      p07AssignmentBlock(prepared) !== null ||
      prepared.assignable !== true ||
      prepared.assign_block_code !== 'ASSIGNABLE' ||
      prepared.stock_effect !== 'NONE' ||
      !prepared.nfc_payload ||
      !prepared.reservation_token ||
      prepared.auth_session_id !== context.authSessionId ||
      prepared.warehouse_id !== context.warehouseId ||
      prepared.replace_existing_allowed !== false
    )
      fail(
        'NFC_PREPARATION_INVALID',
        'Giữ chỗ NFC chưa hợp lệ hoặc không khớp phiên/kho/hiện vật. Chưa ghi chip.',
      );
  }
  private validateRejection(
    result: NfcRejectedConfirmation,
    source: NfcJournal,
  ): void {
    verifyNfcRejection(result, {
      ...source,
      skuId: source.preparation.sku?.sku_id ?? source.preparation.sku?.id,
    });
    if (
      source.rejection &&
      source.rejection.receipt.receipt_id !== result.receipt.receipt_id
    )
      fail(
        'NFC_REJECTION_INVALID',
        'Biên nhận của lượt cũ đã thay đổi. Chưa cho phép phục hồi.',
      );
  }
  private async checkGrantedRecovery(source: NfcJournal): Promise<void> {
    const latest = await this.deps.reconcile(source);
    this.assertContext(source.context);
    if (latest.state !== 'REJECTED')
      return fail(
        'NFC_RECOVERY_NOT_PROVEN',
        'Chưa xác minh được giữ chỗ phục hồi hiện tại. Chưa ghi thẻ.',
      );
    this.validateRejection(latest, source);
    if (
      !latest.recovery.permit_consumed ||
      !latest.recovery.prepare_allowed ||
      latest.recovery.confirm_dispatched ||
      latest.recovery.completed
    )
      fail(
        'NFC_RECOVERY_BLOCKED',
        'Giữ chỗ phục hồi đã mất, hết hạn hoặc bị khóa. Chưa ghi thẻ; giữ yêu cầu để đối chiếu.',
      );
  }
  async prepare(itemId: string): Promise<void> {
    return this.exclusive(async () => {
      if (this.journal && this.journal.stage !== 'RELEASED')
        fail(
          'NFC_UNRESOLVED_OPERATION',
          'Giữ nguyên yêu cầu hiện tại để đối chiếu hoặc giải phóng giữ chỗ.',
        );
      this.inspection = undefined;
      this.mappingObservation = undefined;
      const context = this.deps.context();
      if (!context)
        return fail(
          'NFC_CONTEXT_REQUIRED',
          'Thiếu actor, phiên hoặc UUID kho đã xác nhận.',
        );
      await this.deps.preflight(context);
      this.assertContext(context);
      const chip = await this.deps.read();
      this.assertContext(context);
      this.inspection = {
        context: clone(context),
        itemId,
        hardwareUid: chip.hardwareUid,
        hasNdefData: chip.hasNdefData,
      };
      // Physical evidence is checked before any WMS mapping/hold. A populated
      // or unverified chip must fail closed locally; a verified blank Web tag
      // then fails the UID-bound writer capability without any reservation.
      this.assertBlank(chip);
      await this.deps.assertWritable();
      this.assertContext(context);
      const mapping = await this.deps.resolveTag(chip.hardwareUid, context);
      this.assertContext(context);
      this.observeMapping(itemId, chip, context, mapping);
      if (
        ![
          'NFC_TAG_NOT_REGISTERED',
          'NFC_TAG_NOT_ASSIGNED',
          'RESOLVED',
        ].includes(mapping?.resolve_code || '')
      )
        fail(
          'NFC_MAPPING_UNVERIFIED',
          'Chưa xác minh được mapping của chip. Không giữ chỗ hoặc ghi thẻ.',
        );
      if (mapping.nfc?.physical_code_id || mapping.item)
        fail(
          'NFC_TAG_ALREADY_ASSIGNED',
          'Chip đã đăng ký hoặc liên kết. Không ghi đè.',
        );
      this.assertBlank(chip);
      const ownerBinding = await this.deps.createOwnerBinding?.(context);
      this.assertContext(context);
      this.journal = {
        context: clone(context),
        itemId,
        key: this.deps.createKey(itemId, chip.hardwareUid),
        preparation: { reservation_token: '' },
        hardwareUid: chip.hardwareUid,
        readAt: new Date(this.deps.now()).toISOString(),
        stage: 'PREPARING',
        ...(ownerBinding ? { ownerBinding } : {}),
      };
      this.deps.save(this.journal);
      try {
        const prepared = await this.deps.prepare(
          itemId,
          context,
          clone(this.journal),
        );
        this.assertContext(context);
        this.validatePreparation(prepared, itemId, context);
        this.journal = {
          ...this.journal!,
          preparation: prepared,
          stage: 'PREPARED',
        };
        // Persist the identity before any irreversible physical operation.
        this.deps.save(this.journal);
        this.remaining(this.journal);
      } catch (cause) {
        const error = toAppError(cause);
        if (
          error.kind === 'http' &&
          error.status === 422 &&
          ['SKU_INACTIVE', 'SKU_NOT_FOUND'].includes(error.code || '')
        ) {
          // Recovery contract: these initial prepare failures acquire no hold.
          // No physical write or confirm has run. Do not turn them into UNKNOWN.
          this.journal = undefined;
          this.deps.remove(context);
          throw cause;
        }
        this.setStage('PREPARE_UNKNOWN');
        throw cause;
      }
    });
  }
  /** Called only after the user confirms recovery; never writes or reads a chip. */
  async prepareRecovery(): Promise<void> {
    return this.exclusive(async () => {
      const active = this.requireJournal();
      const resuming = active.stage === 'RECOVERY_PREPARE_UNKNOWN';
      if (active.stage !== 'REJECTED' && !resuming)
        fail(
          'NFC_RECOVERY_NOT_PROVEN',
          'Chỉ phục hồi lượt có biên nhận từ chối xác định.',
        );
      const source = resuming ? active.recoveryPrepare?.source : active;
      if (!source?.rejection)
        return fail(
          'NFC_RECOVERY_NOT_PROVEN',
          'Chưa có biên nhận từ chối để chuẩn bị phục hồi.',
        );
      if (!this.deps.prepareRecovery)
        return fail(
          'NFC_RECOVERY_MODULE_REQUIRED',
          'Bản app chưa nối prepare phục hồi.',
        );
      await this.deps.preflight(source.context);
      this.assertContext(source.context);
      await this.deps.assertWritable();
      this.assertContext(source.context);
      // Current eligibility can change after the dialog opened. Re-read with old key.
      const latest = await this.deps.reconcile(source);
      this.assertContext(source.context);
      if (!resuming) this.setStage('UNKNOWN');
      if (latest.state !== 'REJECTED')
        return fail(
          'NFC_RECOVERY_NOT_PROVEN',
          'WMS chưa trả biên nhận từ chối xác định cho lượt này.',
        );
      this.validateRejection(latest, source);
      const r = latest.recovery;
      const allowed =
        latest.may_create_new_request === true ||
        (resuming &&
          r.permit_consumed &&
          r.prepare_allowed &&
          !r.confirm_dispatched &&
          !r.completed);
      this.journal = {
        ...active,
        stage: resuming ? 'RECOVERY_PREPARE_UNKNOWN' : 'REJECTED',
        rejection: latest,
      };
      this.deps.save(this.journal);
      if (!allowed || r.confirm_dispatched || r.completed)
        return fail(
          'NFC_RECOVERY_BLOCKED',
          'WMS chưa cho phép chuẩn bị phục hồi. Giữ lượt cũ.',
        );
      const retained = { ...source, rejection: latest };
      if (this.deps.createOwnerBinding && !source.ownerBinding)
        return fail(
          'NFC_ORIGINAL_OWNER_IDENTITY_REQUIRED',
          'Lượt cũ chưa có identity ca gốc. Chỉ đối chiếu, không nâng cấp journal để phục hồi.',
        );
      const ownerBinding =
        active.recoveryPrepare?.ownerBinding ??
        (!resuming
          ? await this.deps.createOwnerBinding?.(source.context)
          : undefined);
      this.assertContext(source.context);
      if (
        this.deps.createOwnerBinding &&
        (!ownerBinding || ownerBinding.shiftId !== source.ownerBinding?.shiftId)
      )
        return fail(
          'NFC_ORIGINAL_SHIFT_CHANGED',
          'Không chuyển yêu cầu phục hồi NFC sang ca khác.',
        );
      this.journal = {
        ...active,
        rejection: latest,
        stage: 'RECOVERY_PREPARING',
        recoveryPrepare: {
          source: clone(retained),
          ...(ownerBinding ? { ownerBinding } : {}),
        },
      };
      this.deps.save(this.journal);
      try {
        const prepared = await this.deps.prepareRecovery(
          retained,
          clone(this.journal),
        );
        this.assertContext(source.context);
        this.validatePreparation(prepared, source.itemId, source.context);
        if (
          prepared.reservation_token === source.preparation.reservation_token ||
          (resuming &&
            active.recoveryPrepare?.preparation &&
            prepared.reservation_token !==
              active.recoveryPrepare.preparation.reservation_token) ||
          prepared.recovery?.receipt_id !== latest.receipt.receipt_id ||
          prepared.recovery.blank_new_tag_required !== true ||
          prepared.recovery.old_tag_reuse_allowed !== false ||
          prepared.recovery.new_confirm_key_required !== true
        )
          fail(
            'NFC_RECOVERY_PREPARATION_INVALID',
            'Giữ chỗ phục hồi chưa khớp biên nhận hoặc vẫn dùng token cũ. Chưa ghi chip.',
          );
        this.remaining({ ...source, preparation: prepared });
        this.journal = {
          ...this.journal!,
          stage: 'RECOVERY_READY',
          recoveryPrepare: {
            source: clone(retained),
            preparation: prepared,
            ...(ownerBinding ? { ownerBinding } : {}),
          },
        };
        this.deps.save(this.journal);
      } catch (cause) {
        this.setStage('RECOVERY_PREPARE_UNKNOWN');
        throw cause;
      }
    });
  }
  /** Uses the granted reservation; it does not call prepare again or confirm. */
  async readRecoveryChip(): Promise<void> {
    return this.exclusive(async () => {
      const active = this.requireJournal();
      const checkpoint = active.recoveryPrepare;
      if (active.stage !== 'RECOVERY_READY' || !checkpoint?.preparation)
        return fail(
          'NFC_RECOVERY_NOT_READY',
          'Chưa có giữ chỗ phục hồi để đọc thẻ mới.',
        );
      const source = checkpoint.source,
        prepared = checkpoint.preparation;
      this.mappingObservation = undefined;
      await this.deps.preflight(source.context);
      this.assertContext(source.context);
      this.remaining({ ...source, preparation: prepared });
      await this.checkGrantedRecovery(source);
      const chip = await this.deps.read();
      this.assertContext(source.context);
      const rejected: NfcJournal[] = [];
      for (
        let previous: NfcJournal | undefined = source;
        previous;
        previous = previous.recoveryOrigin
      )
        rejected.push(previous);
      if (
        rejected.some(
          previous =>
            previous.hardwareUid.trim().toUpperCase() ===
            chip.hardwareUid.trim().toUpperCase(),
        )
      )
        return fail(
          'NFC_REJECTED_TAG_REUSE',
          'Thẻ này thuộc lượt đã bị từ chối. Dùng thẻ trắng mới có UID khác.',
        );
      const hasPhysicalContent =
        chip.hasNdefData === true || (chip.rawCode ?? '') !== '';
      if (!hasPhysicalContent) {
        this.assertBlank(chip);
        await this.deps.assertWritable();
        this.assertContext(source.context);
      }
      const mapping = await this.deps.resolveTag(
        chip.hardwareUid,
        source.context,
      );
      this.assertContext(source.context);
      this.observeMapping(source.itemId, chip, source.context, mapping);
      if (
        ![
          'NFC_TAG_NOT_REGISTERED',
          'NFC_TAG_NOT_ASSIGNED',
          'RESOLVED',
        ].includes(mapping?.resolve_code || '')
      )
        return fail(
          'NFC_MAPPING_UNVERIFIED',
          'Chưa xác minh được mapping của thẻ mới.',
        );
      if (mapping.nfc?.physical_code_id || mapping.item)
        return fail(
          'NFC_TAG_ALREADY_ASSIGNED',
          'Thẻ mới đã đăng ký/liên kết; không ghi đè.',
        );
      this.assertBlank(chip);
      const newKey = this.deps.createKey(source.itemId, chip.hardwareUid);
      if (
        !newKey ||
        newKey.trim().length < 8 ||
        newKey.trim().length > 100 ||
        rejected.some(previous => previous.key.trim() === newKey.trim())
      )
        return fail(
          'NFC_RECOVERY_KEY_INVALID',
          'Lượt mới cần key mới khác key đã bị từ chối.',
        );
      this.remaining({ ...source, preparation: prepared });
      this.journal = {
        context: clone(source.context),
        itemId: source.itemId,
        key: newKey,
        preparation: prepared,
        hardwareUid: chip.hardwareUid,
        readAt: new Date(this.deps.now()).toISOString(),
        stage: 'PREPARED',
        recoveryOrigin: clone(source),
        ...(checkpoint.ownerBinding
          ? { ownerBinding: clone(checkpoint.ownerBinding) }
          : {}),
      };
      this.deps.save(this.journal);
    });
  }
  async writeAndConfirm(): Promise<void> {
    return this.exclusive(async () => {
      let journal = this.requireJournal();
      if (journal.stage !== 'PREPARED')
        fail(
          'NFC_UNRESOLVED_OPERATION',
          'Không ghi lại chip. Kiểm tra nội dung hoặc đối chiếu yêu cầu hiện tại.',
        );
      if (journal.preparation.sku?.status === 'INACTIVE')
        fail(
          'SKU_INACTIVE',
          'SKU ngừng hoạt động. Chưa ghi chip; hủy giữ chỗ trước khi chọn hiện vật khác.',
        );
      await this.deps.preflight(journal.context);
      this.assertContext(journal.context);
      await this.deps.assertWritable();
      this.assertContext(journal.context);
      await this.deps.validateOwnerBeforeWrite?.(clone(journal));
      this.assertContext(journal.context);
      if (journal.recoveryOrigin)
        await this.checkGrantedRecovery(journal.recoveryOrigin);
      const remaining = this.remaining(journal);
      this.setStage('WRITING');
      try {
        const written = await this.deps.write(
          journal.preparation.nfc_payload!,
          journal.hardwareUid,
          remaining,
        );
        this.assertContext(journal.context);
        if (
          written.hardwareUid !== journal.hardwareUid ||
          written.writtenPayload !== journal.preparation.nfc_payload
        )
          fail(
            'NFC_VERIFY_FAILED',
            'UID hoặc nội dung đọc lại không khớp. Chưa confirm WMS.',
          );
        this.journal = {
          ...this.requireJournal(),
          writtenPayload: written.writtenPayload,
        };
        this.setStage('READBACK_VERIFIED');
      } catch (cause) {
        this.setStage('WRITE_UNKNOWN');
        throw cause;
      }
      journal = this.requireJournal();
      await this.sendConfirmation(journal);
    });
  }
  private assertBlank(chip: NativeNfcTag): void {
    if (!chip.hardwareUid)
      fail('NFC_UID_UNAVAILABLE', 'Chưa đọc được UID của thẻ.');
    if (chip.hasNdefData === true || (chip.rawCode ?? '') !== '')
      fail('NFC_TAG_NOT_EMPTY', 'Thẻ có dữ liệu NDEF; không ghi đè.');
    if (chip.hasNdefData !== false)
      fail('NFC_TAG_CONTENT_UNVERIFIED', 'Chưa có bằng chứng thẻ trắng.');
  }
  private accept(result: NfcConfirmation, journal: NfcJournal): void {
    this.assertContext(journal.context);
    const receipt = result?.confirmation;
    if (
      !receipt ||
      receipt.state !== 'SUCCEEDED' ||
      receipt.item_id !== journal.itemId ||
      receipt.actor_id !== journal.context.actorId ||
      receipt.auth_session_id !== journal.context.authSessionId ||
      receipt.warehouse_id !== journal.context.warehouseId ||
      !receipt.physical_code_id ||
      result.nfc?.physical_code_id !== receipt.physical_code_id ||
      result.nfc?.hardware_uid !== journal.hardwareUid ||
      result.item?.item_id !== journal.itemId ||
      result.item?.item_status !== 'ISSUED' ||
      result.stock_effect !== 'NONE' ||
      result.movement_created !== false ||
      result.nfc_status !== 'ASSIGNED' ||
      result.nfc_payload !== journal.preparation.nfc_payload ||
      (result.replaced_physical_code_id ?? null) !== null
    )
      fail(
        'NFC_CONFIRMATION_INVALID',
        'Phản hồi chưa xác nhận đúng yêu cầu NFC. Giữ key để đối chiếu.',
      );
    this.journal = { ...journal, result };
    this.setStage('CONFIRMED');
    // No reusable reservation credential is persisted after confirmed success.
    this.journal = {
      ...this.journal!,
      preparation: { ...journal.preparation, reservation_token: '' },
    };
    this.deps.save(this.journal);
  }
  private async sendConfirmation(journal: NfcJournal): Promise<void> {
    this.assertContext(journal.context);
    this.remaining(journal);
    this.setStage('CONFIRMING');
    try {
      this.accept(await this.deps.confirm(this.requireJournal()), journal);
    } catch (cause) {
      const issue = toAppError(cause);
      this.journal = {
        ...(this.journal ?? journal),
        confirmationIssue: {
          code: issue.code,
          status: issue.status,
          requestId: issue.requestId,
        },
      };
      this.setStage('UNKNOWN');
      throw cause;
    }
  }
  async verifyWrittenChip(): Promise<void> {
    return this.exclusive(async () => {
      const journal = this.requireJournal();
      if (!['WRITE_UNKNOWN', 'READBACK_VERIFIED'].includes(journal.stage))
        fail(
          'NFC_UNRESOLVED_OPERATION',
          'Dùng đối chiếu WMS cho yêu cầu PATCH đã gửi.',
        );
      await this.deps.preflight(journal.context);
      this.assertContext(journal.context);
      const chip = await this.deps.read();
      this.assertContext(journal.context);
      if (
        chip.hardwareUid !== journal.hardwareUid ||
        chip.rawCode !== journal.preparation.nfc_payload
      )
        fail(
          'NFC_VERIFY_FAILED',
          'Chip chưa đọc lại đúng nội dung. Không ghi lại hoặc confirm.',
        );
      this.journal = { ...journal, writtenPayload: chip.rawCode };
      this.setStage('READBACK_VERIFIED');
      await this.sendConfirmation(this.requireJournal());
    });
  }
  async reconcile(): Promise<
    'SUCCEEDED' | 'PROCESSING' | 'UNKNOWN' | 'REJECTED'
  > {
    return this.exclusive(async () => {
      const journal = this.requireJournal();
      if (!['UNKNOWN', 'CONFIRMING', 'REJECTED'].includes(journal.stage))
        return fail('NFC_UNRESOLVED_OPERATION', 'Chưa có PATCH để đối chiếu.');
      const result = await this.deps.reconcile(journal);
      this.assertContext(journal.context);
      this.setStage('UNKNOWN');
      if (result.state === 'REJECTED') {
        this.validateRejection(result, journal);
        this.journal = {
          ...journal,
          stage: 'REJECTED',
          rejection: clone(result),
          recoveryEligibilityStale: false,
        };
        this.deps.save(this.journal);
        return 'REJECTED';
      }
      if (
        result.state === 'SUCCEEDED' &&
        (result.http_status === 200 || result.http_status === 201) &&
        result.response?.success === true &&
        result.response.data
      ) {
        this.accept(result.response.data, journal);
        return 'SUCCEEDED';
      }
      this.setStage('UNKNOWN');
      if (
        (result.state !== 'UNKNOWN' && result.state !== 'PROCESSING') ||
        result.may_create_new_request !== false
      )
        return fail(
          'NFC_CONFIRMATION_INVALID',
          'Kết quả đối chiếu chưa hợp lệ.',
        );
      this.journal = {
        ...this.requireJournal(),
        lastCheck: {
          state: result.state,
          checkedAt: new Date(this.deps.now()).toISOString(),
        },
      };
      this.deps.save(this.journal!);
      return result.state;
    });
  }
  async release(): Promise<void> {
    return this.exclusive(async () => {
      const journal = this.requireJournal();
      if (journal.stage !== 'PREPARED')
        return fail(
          'NFC_UNRESOLVED_OPERATION',
          'Không giải phóng khi chip đã bắt đầu ghi hoặc PATCH chưa rõ kết quả.',
        );
      const result = await this.deps.release(journal);
      this.assertContext(journal.context);
      if (result.stock_effect !== 'NONE')
        return fail('NFC_RELEASE_INVALID', 'Release chưa có xác nhận hợp lệ.');
      if (journal.recoveryOrigin) {
        // Release cannot unconsume a recovery permit. Keep the rejected source.
        const source = clone(journal.recoveryOrigin);
        // Retain BE's snapshot unchanged; a separate local flag requires GET
        // before displaying a current permission to prepare again.
        this.journal = {
          ...source,
          stage: 'REJECTED',
          recoveryEligibilityStale: true,
        };
        this.deps.save(this.journal);
      } else {
        this.setStage('RELEASED');
        this.deps.remove(journal.context);
      }
    });
  }
}
