// HTTP/hardware mocks. No DEV data, receipt or physical chip is fabricated live.
const { createHash } = require('crypto');
import { AppError } from '../src/errors/AppError';
import {
  nfcSha256,
  type NfcRejectedConfirmation,
} from '../src/contracts/p07NfcRecovery';
import {
  NfcAssignment,
  type NfcAssignmentDeps,
  type NfcJournal,
} from '../src/features/nfc/nfcAssignment';
import type { NfcPreparation } from '../src/services/wms/nfc';

const context = {
  actorId: 'actor-a',
  authSessionId: 'session-a',
  warehouseId: 'warehouse-a',
};
const uid = '04AABB',
  receiptId = '11111111-1111-4111-8111-111111111111';
const skuId = '22222222-2222-4222-8222-222222222222';
const preparation: NfcPreparation = {
  item: { item_id: 'item-a', item_status: 'ISSUED' },
  sku: { sku_id: skuId, status: 'ACTIVE' },
  assignable: true,
  assign_block_code: 'ASSIGNABLE',
  nfc_status: 'UNASSIGNED',
  nfc: null,
  stock_effect: 'NONE',
  movement_created: false,
  nfc_payload: 'HN1|SKU=SKU-A|ITEM=SN-A',
  reservation_token: 'old-hold',
  expires_at: '2026-10-10T06:05:00Z',
  auth_session_id: context.authSessionId,
  warehouse_id: context.warehouseId,
  replace_existing_allowed: false,
};
const newPreparation: NfcPreparation = {
  ...preparation,
  reservation_token: 'new-hold',
  recovery: {
    receipt_id: receiptId,
    blank_new_tag_required: true,
    old_tag_reuse_allowed: false,
    new_confirm_key_required: true,
  },
};
function rejection(
  key = 'old-key-a',
  hardwareUid = uid,
  id = receiptId,
): NfcRejectedConfirmation {
  const receipt = {
    receipt_id: id,
    state: 'REJECTED' as const,
    operation: 'CONFIRM' as const,
    actor_id: context.actorId,
    auth_session_id: context.authSessionId,
    warehouse_id: context.warehouseId,
    item_id: 'item-a',
    sku_id: skuId,
    hardware_uid: hardwareUid,
    request_key_sha256: nfcSha256(key.trim()),
    original_request_id: null,
    payload_sha256: nfcSha256(preparation.nfc_payload!),
    reason_code: 'SKU_INACTIVE' as const,
    evidence_type: 'SERVER_PREWRITE_SKU_CHECK' as const,
    rejected_at: '2026-10-10T06:00:00Z',
    mapping_created_by_request: false as const,
    stock_effect: 'NONE' as const,
  };
  return {
    state: 'REJECTED',
    http_status: 422,
    response: { success: false, data: { confirmation: receipt } },
    receipt,
    recovery: {
      prepare_allowed: true,
      next_action: 'PREPARE_WITH_RECOVERY_KEY',
      blank_new_tag_required: true,
      old_tag_reuse_allowed: false,
      same_key_retry_allowed: false,
      chip_write_rolled_back: false,
      reservation_released_by_check: false,
      completed: false,
      permit_consumed: false,
      confirm_dispatched: false,
    },
    may_create_new_request: true,
    retry_policy: 'NEW_PREPARE_ONLY',
  };
}
function fixture(loaded?: NfcJournal) {
  let stored = loaded;
  let recoveryPrepared =
    !!loaded?.recoveryOrigin || !!loaded?.recoveryPrepare?.preparation;
  const deps: NfcAssignmentDeps = {
    context: jest.fn(() => context),
    now: jest.fn(() => Date.parse('2026-10-10T06:00:00Z')),
    preflight: jest.fn(async () => undefined),
    assertWritable: jest.fn(async () => undefined),
    createKey: jest.fn(() => 'old-key-a'),
    read: jest.fn(async () => ({ hardwareUid: uid, hasNdefData: false })),
    write: jest.fn(async (payload, hardwareUid) => ({
      hardwareUid,
      writtenPayload: payload,
    })),
    resolveTag: jest.fn(async () => ({
      resolve_code: 'NFC_TAG_NOT_REGISTERED',
      nfc: null,
      item: null,
    })),
    prepare: jest.fn(async () => preparation),
    prepareRecovery: jest.fn(async () => {
      recoveryPrepared = true;
      return newPreparation;
    }),
    confirm: jest.fn(async () => {
      throw new AppError({
        kind: 'http',
        status: 422,
        code: 'SKU_INACTIVE',
        message: 'SKU changed after prepare',
      });
    }),
    reconcile: jest.fn(async () => {
      const value = rejection();
      if (recoveryPrepared) {
        value.may_create_new_request = false;
        value.recovery.permit_consumed = true;
      }
      return value;
    }),
    release: jest.fn(async () => ({ released: true, stock_effect: 'NONE' })),
    load: jest.fn(() => stored),
    save: jest.fn(j => {
      stored = JSON.parse(JSON.stringify(j)) as NfcJournal;
    }),
    remove: jest.fn(() => {
      stored = undefined;
    }),
  };
  return { deps, flow: new NfcAssignment(deps), stored: () => stored };
}
async function rejected() {
  const f = fixture();
  await f.flow.prepare('item-a');
  await expect(f.flow.writeAndConfirm()).rejects.toMatchObject({
    code: 'SKU_INACTIVE',
  });
  expect(await f.flow.reconcile()).toBe('REJECTED');
  return f;
}
async function recoverReady() {
  const f = await rejected();
  await f.flow.prepareRecovery();
  return f;
}
async function recoverPrepared() {
  const f = await recoverReady();
  (f.deps.read as jest.Mock).mockResolvedValue({
    hardwareUid: '04CCDD',
    hasNdefData: false,
  });
  (f.deps.createKey as jest.Mock).mockReturnValue('new-key-b');
  await f.flow.readRecoveryChip();
  return f;
}

describe('P07 rejection / recovery contract, source mocks only', () => {
  it.each(['SKU_INACTIVE', 'SKU_NOT_FOUND'])(
    'initial prepare %s is a proven pre-hold failure, not a stuck UNKNOWN',
    async code => {
      const f = fixture();
      (f.deps.prepare as jest.Mock).mockRejectedValue(
        new AppError({
          kind: 'http',
          status: 422,
          code,
          message: 'pre-hold deny',
        }),
      );
      await expect(f.flow.prepare('item-a')).rejects.toMatchObject({ code });
      expect(f.stored()).toBeUndefined();
      expect(f.flow.snapshot()).toBeUndefined();
      expect(f.deps.confirm).not.toHaveBeenCalled();
      expect(f.deps.write).not.toHaveBeenCalled();
      (f.deps.prepare as jest.Mock).mockResolvedValue(preparation);
      await f.flow.prepare('item-a');
      expect(f.flow.snapshot()?.stage).toBe('PREPARED');
    },
  );
  it.each([
    '',
    'abc',
    'a'.repeat(55),
    'b'.repeat(56),
    'c'.repeat(64),
    'Tiếng Việt 🌸\nHN1|ITEM=SN-A ',
    '\ud800',
  ])('SHA256 agrees with Node reference for %p', value => {
    expect(nfcSha256(value)).toBe(
      createHash('sha256').update(value, 'utf8').digest('hex'),
    );
  });
  it('verified REJECTED retains old identity/readback and never creates another request by itself', async () => {
    const f = await rejected();
    expect(f.flow.snapshot()).toMatchObject({
      stage: 'REJECTED',
      key: 'old-key-a',
      hardwareUid: uid,
      writtenPayload: preparation.nfc_payload,
    });
    expect(f.deps.prepareRecovery).not.toHaveBeenCalled();
    expect(f.deps.write).toHaveBeenCalledTimes(1);
    expect(() => f.flow.resetConfirmed()).toThrow();
    await expect(f.flow.writeAndConfirm()).rejects.toMatchObject({
      code: 'NFC_UNRESOLVED_OPERATION',
    });
  });
  it.each([
    'actor_id',
    'auth_session_id',
    'warehouse_id',
    'item_id',
    'sku_id',
    'hardware_uid',
    'request_key_sha256',
    'payload_sha256',
    'mapping_created_by_request',
    'stock_effect',
    'evidence_type',
    'reason_code',
    'receipt_id',
  ])('malformed/mismatched receipt %s cannot unlock recovery', async field => {
    const f = fixture();
    await f.flow.prepare('item-a');
    await expect(f.flow.writeAndConfirm()).rejects.toThrow();
    const value = JSON.parse(JSON.stringify(rejection()));
    value.receipt[field] = 'wrong';
    value.response.data.confirmation[field] = 'wrong';
    (f.deps.reconcile as jest.Mock).mockResolvedValue(value);
    await expect(f.flow.reconcile()).rejects.toMatchObject({
      code: 'NFC_REJECTION_INVALID',
    });
    expect(f.flow.snapshot()?.stage).toBe('UNKNOWN');
    expect(f.deps.prepareRecovery).not.toHaveBeenCalled();
  });
  it('UNKNOWN/HTTP422 without receipt never permits prepare recovery', async () => {
    const f = fixture();
    await f.flow.prepare('item-a');
    await expect(f.flow.writeAndConfirm()).rejects.toThrow();
    (f.deps.reconcile as jest.Mock).mockResolvedValue({
      state: 'UNKNOWN',
      may_create_new_request: false,
      response: null,
    });
    await f.flow.reconcile();
    await expect(f.flow.prepareRecovery()).rejects.toMatchObject({
      code: 'NFC_RECOVERY_NOT_PROVEN',
    });
    expect(f.deps.prepareRecovery).not.toHaveBeenCalled();
  });
  it('explicit prepare rechecks current permission before using the original rejected key', async () => {
    const f = await rejected();
    const value = rejection();
    value.may_create_new_request = false;
    value.recovery.prepare_allowed = false;
    value.recovery.next_action = 'BLOCKED';
    (f.deps.reconcile as jest.Mock).mockResolvedValue(value);
    await expect(f.flow.prepareRecovery()).rejects.toMatchObject({
      code: 'NFC_RECOVERY_BLOCKED',
    });
    expect(f.deps.prepareRecovery).not.toHaveBeenCalled();
    expect(f.flow.snapshot()?.key).toBe('old-key-a');
  });
  it('prepare recovery occurs before reading a new chip and no new confirm key is issued until read', async () => {
    const f = await recoverReady();
    expect(f.flow.snapshot()?.stage).toBe('RECOVERY_READY');
    expect(f.deps.prepareRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'old-key-a' }),
      expect.objectContaining({ stage: 'RECOVERY_PREPARING' }),
    );
    expect(f.deps.read).toHaveBeenCalledTimes(1);
    expect(f.deps.createKey).toHaveBeenCalledTimes(1);
    expect(f.deps.confirm).toHaveBeenCalledTimes(1);
  });
  it('a mapped recovery chip exposes P17 evidence but keeps the granted journal untouched', async () => {
    const f = await recoverReady();
    (f.deps.read as jest.Mock).mockResolvedValue({
      hardwareUid: '04CCDD',
      hasNdefData: true,
    });
    (f.deps.resolveTag as jest.Mock).mockResolvedValue({
      resolve_code: 'RESOLVED',
      nfc: {
        physical_code_id: 'physical-existing',
        hardware_uid: '04CCDD',
        tab_status: 'ASSIGNED',
        status_label: 'Đã liên kết',
      },
      item: { item_id: 'other-item', sku_code: 'SKU-OTHER' },
    });
    await expect(f.flow.readRecoveryChip()).rejects.toMatchObject({
      code: 'NFC_TAG_ALREADY_ASSIGNED',
    });
    expect(f.flow.snapshot()).toMatchObject({
      stage: 'RECOVERY_READY',
      key: 'old-key-a',
      hardwareUid: uid,
      recoveryPrepare: {
        preparation: { reservation_token: 'new-hold' },
      },
    });
    expect(f.flow.mappingSnapshot()).toMatchObject({
      hardwareUid: '04CCDD',
      physicalCodeId: 'physical-existing',
      verification: 'verified',
      status: 'ASSIGNED',
    });
    expect(f.deps.createKey).toHaveBeenCalledTimes(1);
    expect(f.deps.write).toHaveBeenCalledTimes(1);
    expect(f.deps.confirm).toHaveBeenCalledTimes(1);
  });
  it.each([
    { hardwareUid: uid, hasNdefData: false },
    { hardwareUid: '04CCDD', hasNdefData: true },
    { hardwareUid: '04CCDD', hasNdefData: false, rawCode: 'already-written' },
  ])('rejects old/nonblank recovery chip %p', async chip => {
    const f = await recoverReady();
    (f.deps.read as jest.Mock).mockResolvedValue(chip);
    await expect(f.flow.readRecoveryChip()).rejects.toThrow();
    expect(f.flow.snapshot()?.stage).toBe('RECOVERY_READY');
    expect(f.deps.write).toHaveBeenCalledTimes(1);
    expect(f.deps.prepareRecovery).toHaveBeenCalledTimes(1);
  });
  it('new blank UID uses a new key/new token, preserves old receipt, then verifies successful new receipt', async () => {
    const f = await recoverPrepared();
    expect(f.flow.snapshot()).toMatchObject({
      key: 'new-key-b',
      hardwareUid: '04CCDD',
      preparation: { reservation_token: 'new-hold' },
      recoveryOrigin: {
        key: 'old-key-a',
        hardwareUid: uid,
        rejection: { receipt: { receipt_id: receiptId } },
      },
    });
    (f.deps.confirm as jest.Mock).mockResolvedValue({
      item: { item_id: 'item-a', item_status: 'ISSUED' },
      nfc: { hardware_uid: '04CCDD', physical_code_id: 'tag-new' },
      confirmation: {
        state: 'SUCCEEDED',
        item_id: 'item-a',
        physical_code_id: 'tag-new',
        actor_id: context.actorId,
        auth_session_id: context.authSessionId,
        warehouse_id: context.warehouseId,
      },
      nfc_payload: preparation.nfc_payload,
      nfc_status: 'ASSIGNED',
      stock_effect: 'NONE',
      movement_created: false,
    });
    await f.flow.writeAndConfirm();
    expect(f.flow.snapshot()?.stage).toBe('CONFIRMED');
    expect(f.deps.write).toHaveBeenLastCalledWith(
      preparation.nfc_payload,
      '04CCDD',
      300000,
    );
    expect(f.deps.confirm).toHaveBeenLastCalledWith(
      expect.objectContaining({
        key: 'new-key-b',
        writtenPayload: preparation.nfc_payload,
        preparation: expect.objectContaining({ reservation_token: 'new-hold' }),
      }),
    );
  });
  it('recovery PATCH timeout keeps the NEW key and cannot prepare or rewrite a third attempt', async () => {
    const f = await recoverPrepared();
    (f.deps.confirm as jest.Mock).mockRejectedValue(
      new AppError({ kind: 'timeout', message: 'lost' }),
    );
    await expect(f.flow.writeAndConfirm()).rejects.toThrow();
    (f.deps.reconcile as jest.Mock).mockResolvedValue({
      state: 'UNKNOWN',
      may_create_new_request: false,
      response: null,
    });
    await f.flow.reconcile();
    expect(f.deps.reconcile).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'new-key-b' }),
    );
    await expect(f.flow.prepareRecovery()).rejects.toThrow();
    await expect(f.flow.readRecoveryChip()).rejects.toThrow();
    await expect(f.flow.writeAndConfirm()).rejects.toThrow();
    expect(f.deps.prepareRecovery).toHaveBeenCalledTimes(1);
    expect(f.deps.write).toHaveBeenCalledTimes(2);
  });
  it('lost backend recovery hold is detected before reading a chip or generating its key', async () => {
    const f = await recoverReady();
    const value = rejection();
    value.may_create_new_request = false;
    value.recovery.permit_consumed = true;
    value.recovery.prepare_allowed = false;
    value.recovery.next_action = 'BLOCKED';
    (f.deps.reconcile as jest.Mock).mockResolvedValue(value);
    await expect(f.flow.readRecoveryChip()).rejects.toMatchObject({
      code: 'NFC_RECOVERY_BLOCKED',
    });
    expect(f.deps.read).toHaveBeenCalledTimes(1);
    expect(f.deps.createKey).toHaveBeenCalledTimes(1);
    expect(f.deps.write).toHaveBeenCalledTimes(1);
  });
  it('revoked/dispatched recovery permission is rechecked before physical write', async () => {
    const f = await recoverPrepared();
    const value = rejection();
    value.may_create_new_request = false;
    value.recovery.permit_consumed = true;
    value.recovery.prepare_allowed = false;
    value.recovery.confirm_dispatched = true;
    value.recovery.next_action = 'BLOCKED';
    (f.deps.reconcile as jest.Mock).mockResolvedValue(value);
    await expect(f.flow.writeAndConfirm()).rejects.toMatchObject({
      code: 'NFC_RECOVERY_BLOCKED',
    });
    expect(f.deps.write).toHaveBeenCalledTimes(1);
    expect(f.deps.confirm).toHaveBeenCalledTimes(1);
  });
  it('restart after lost recovery prepare resumes only the same granted reservation, not a new permit', async () => {
    const f = await rejected();
    (f.deps.prepareRecovery as jest.Mock).mockRejectedValueOnce(
      new Error('lost prepare'),
    );
    await expect(f.flow.prepareRecovery()).rejects.toThrow();
    expect(f.flow.snapshot()?.stage).toBe('RECOVERY_PREPARE_UNKNOWN');
    const saved = f.stored()!;
    const resumed = fixture(saved);
    const consumed = rejection();
    consumed.may_create_new_request = false;
    consumed.recovery.permit_consumed = true;
    (resumed.deps.reconcile as jest.Mock).mockResolvedValue(consumed);
    await resumed.flow.prepareRecovery();
    expect(resumed.flow.snapshot()?.stage).toBe('RECOVERY_READY');
    expect(resumed.deps.prepareRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'old-key-a' }),
      expect.objectContaining({ stage: 'RECOVERY_PREPARING' }),
    );
    expect(resumed.deps.read).not.toHaveBeenCalled();
  });
  it('completed/dispatched consumed recovery cannot resume prepare', async () => {
    const f = await rejected();
    (f.deps.prepareRecovery as jest.Mock).mockRejectedValueOnce(
      new Error('lost prepare'),
    );
    await expect(f.flow.prepareRecovery()).rejects.toThrow();
    const value = rejection();
    value.may_create_new_request = false;
    value.recovery.permit_consumed = true;
    value.recovery.prepare_allowed = false;
    value.recovery.confirm_dispatched = true;
    value.recovery.next_action = 'BLOCKED';
    (f.deps.reconcile as jest.Mock).mockResolvedValue(value);
    await expect(f.flow.prepareRecovery()).rejects.toMatchObject({
      code: 'NFC_RECOVERY_BLOCKED',
    });
    expect(f.deps.prepareRecovery).toHaveBeenCalledTimes(1);
  });
  it('resume with a known recovery reservation cannot silently accept a different token', async () => {
    const f = await recoverReady();
    const checkpoint = {
      ...f.stored()!,
      stage: 'RECOVERY_PREPARE_UNKNOWN' as const,
    };
    const resumed = fixture(checkpoint);
    (resumed.deps.prepareRecovery as jest.Mock).mockResolvedValue({
      ...newPreparation,
      reservation_token: 'another-new-hold',
    });
    await expect(resumed.flow.prepareRecovery()).rejects.toMatchObject({
      code: 'NFC_RECOVERY_PREPARATION_INVALID',
    });
    expect(resumed.deps.read).not.toHaveBeenCalled();
    expect(resumed.deps.write).not.toHaveBeenCalled();
  });
  it.each(['reservation_token', 'receipt_id', 'old_tag_reuse_allowed'])(
    'bad recovery prepare %s never writes or obtains new UID/key',
    async field => {
      const f = await rejected();
      const value = JSON.parse(JSON.stringify(newPreparation));
      if (field === 'reservation_token')
        value.reservation_token = preparation.reservation_token;
      else value.recovery[field] = 'wrong';
      (f.deps.prepareRecovery as jest.Mock).mockResolvedValue(value);
      await expect(f.flow.prepareRecovery()).rejects.toMatchObject({
        code: 'NFC_RECOVERY_PREPARATION_INVALID',
      });
      expect(f.flow.snapshot()?.stage).toBe('RECOVERY_PREPARE_UNKNOWN');
      expect(f.deps.read).toHaveBeenCalledTimes(1);
      expect(f.deps.createKey).toHaveBeenCalledTimes(1);
    },
  );
  it('releasing before recovery write does not erase the rejected receipt or reset its permit', async () => {
    const f = await recoverPrepared();
    const originalReceipt = f.flow.snapshot()!.recoveryOrigin!.rejection;
    await f.flow.release();
    expect(f.flow.snapshot()).toMatchObject({
      stage: 'REJECTED',
      key: 'old-key-a',
      recoveryEligibilityStale: true,
    });
    expect(f.flow.snapshot()?.rejection).toEqual(originalReceipt);
    expect(f.deps.remove).not.toHaveBeenCalled();
    expect(() => f.flow.resetConfirmed()).toThrow();
  });
  it('context changes during recovery prevents replacement of the old operation', async () => {
    const f = await rejected();
    (f.deps.prepareRecovery as jest.Mock).mockImplementation(async () => {
      (f.deps.context as jest.Mock).mockReturnValue({
        ...context,
        authSessionId: 'other',
      });
      return newPreparation;
    });
    await expect(f.flow.prepareRecovery()).rejects.toMatchObject({
      code: 'NFC_SESSION_CHANGED',
    });
    expect(f.flow.snapshot()?.key).toBe('old-key-a');
    expect(f.deps.read).toHaveBeenCalledTimes(1);
  });
});
