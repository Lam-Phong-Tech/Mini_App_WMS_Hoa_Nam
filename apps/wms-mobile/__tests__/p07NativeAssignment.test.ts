import { AppError } from '../src/errors/AppError';
import {
  NfcAssignment,
  type NfcAssignmentDeps,
  type NfcJournal,
} from '../src/features/nfc/nfcAssignment';
import type {
  NfcConfirmation,
  NfcConfirmationStatus,
  NfcPreparation,
} from '../src/services/wms/nfc';

const context = {
  actorId: 'actor-a',
  authSessionId: 'session-a',
  warehouseId: 'warehouse-a',
};
const preparation: NfcPreparation = {
  item: { item_id: 'item-a', item_status: 'ISSUED' },
  assignable: true,
  assign_block_code: 'ASSIGNABLE',
  nfc_status: 'UNASSIGNED',
  nfc: null,
  stock_effect: 'NONE',
  movement_created: false,
  nfc_payload: 'HN1|SKU=SKU-A|ITEM=SN-A',
  reservation_token: 'hold-a',
  expires_at: '2026-10-08T06:05:00Z',
  auth_session_id: context.authSessionId,
  warehouse_id: context.warehouseId,
  replace_existing_allowed: false,
};
const confirmation: NfcConfirmation = {
  item: { item_id: 'item-a', item_status: 'ISSUED' },
  nfc_status: 'ASSIGNED',
  stock_effect: 'NONE',
  movement_created: false,
  nfc_payload: preparation.nfc_payload,
  nfc: { physical_code_id: 'tag-a', hardware_uid: '04AABB' },
  confirmation: {
    state: 'SUCCEEDED',
    item_id: 'item-a',
    physical_code_id: 'tag-a',
    actor_id: context.actorId,
    auth_session_id: context.authSessionId,
    warehouse_id: context.warehouseId,
  },
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function fixture(saved?: NfcJournal) {
  let stored = saved ? clone(saved) : undefined;
  const deps: NfcAssignmentDeps = {
    context: jest.fn(() => context),
    now: jest.fn(() => Date.parse('2026-10-08T06:00:00Z')),
    preflight: jest.fn(async () => undefined),
    assertWritable: jest.fn(async () => undefined),
    createKey: jest.fn(() => 'same-key-a'),
    read: jest.fn(async () => ({ hardwareUid: '04AABB', hasNdefData: false })),
    write: jest.fn(async () => ({
      hardwareUid: '04AABB',
      writtenPayload: preparation.nfc_payload!,
    })),
    resolveTag: jest.fn(async () => ({
      resolve_code: 'NFC_TAG_NOT_REGISTERED',
      nfc: null,
      item: null,
    })),
    prepare: jest.fn(async () => clone(preparation)),
    confirm: jest.fn(async () => clone(confirmation)),
    reconcile: jest.fn(
      async (): Promise<NfcConfirmationStatus> => ({
        state: 'SUCCEEDED',
        http_status: 201,
        response: { success: true, data: clone(confirmation) },
        may_create_new_request: false,
      }),
    ),
    release: jest.fn(async () => ({ released: true, stock_effect: 'NONE' })),
    load: jest.fn(() => stored),
    save: jest.fn(journal => {
      stored = clone(journal);
    }),
    remove: jest.fn(() => {
      stored = undefined;
    }),
  };
  return { deps, flow: new NfcAssignment(deps), stored: () => stored };
}
describe('P07 native state machine (mock HTTP/hardware, not device evidence)', () => {
  it('persists new owner identity before prepare and rechecks it before physical write', async () => {
    const { deps, flow, stored } = fixture();
    const b = {
      revision: 'p07-local-shift-identities-v1' as const,
      shiftId: 'shift-test',
      prepareRequestId: 'prepare-test',
      confirmRequestId: 'confirm-test',
      releaseRequestId: 'release-test',
    };
    deps.createOwnerBinding = jest.fn(async () => b);
    (deps.prepare as jest.Mock).mockImplementation(
      async (_id, _context, journal) => {
        expect(stored()?.ownerBinding).toEqual(b);
        expect(journal.ownerBinding).toEqual(b);
        return clone(preparation);
      },
    );
    deps.validateOwnerBeforeWrite = jest.fn(async () => {
      expect(stored()?.stage).toBe('PREPARED');
      throw new AppError({
        kind: 'config',
        code: 'NFC_JOURNAL_UNVERIFIED',
        message: 'hold',
      });
    });
    await flow.prepare('item-a');
    await expect(flow.writeAndConfirm()).rejects.toMatchObject({
      code: 'NFC_JOURNAL_UNVERIFIED',
    });
    expect(deps.write).not.toHaveBeenCalled();
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(flow.snapshot()?.stage).toBe('PREPARED');
  });
  it('reads real UID before reservation, persists identity before writing, confirms exact readback', async () => {
    const { deps, flow, stored } = fixture();
    await flow.prepare('item-a');
    expect(deps.read).toHaveBeenCalledTimes(1);
    expect(deps.resolveTag).toHaveBeenCalledWith('04AABB', context);
    expect(flow.snapshot()?.stage).toBe('PREPARED');
    (deps.write as jest.Mock).mockImplementation(async () => {
      expect(stored()?.stage).toBe('WRITING');
      return { hardwareUid: '04AABB', writtenPayload: preparation.nfc_payload };
    });
    await flow.writeAndConfirm();
    expect(deps.write).toHaveBeenCalledWith(
      preparation.nfc_payload,
      '04AABB',
      300000,
    );
    expect(deps.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'same-key-a',
        writtenPayload: preparation.nfc_payload,
        stage: 'CONFIRMING',
      }),
    );
    expect(flow.snapshot()?.stage).toBe('CONFIRMED');
    expect(stored()?.preparation.reservation_token).toBe('');
  });
  it.each([
    { hardwareUid: '04AABB', rawCode: 'existing-text' },
    { hardwareUid: '04AABB', hasNdefData: true },
  ])('does not overwrite a populated chip %p', async chip => {
    const { deps, flow } = fixture();
    (deps.read as jest.Mock).mockResolvedValue(chip);
    await expect(flow.prepare('item-a')).rejects.toMatchObject({
      code: 'NFC_TAG_NOT_EMPTY',
    });
    expect(deps.prepare).not.toHaveBeenCalled();
    expect(deps.write).not.toHaveBeenCalled();
  });
  it('unknown blankness is distinct from populated and never reserves', async () => {
    const { deps, flow } = fixture();
    (deps.read as jest.Mock).mockResolvedValue({ hardwareUid: '04AABB' });
    await expect(flow.prepare('item-a')).rejects.toMatchObject({
      code: 'NFC_TAG_CONTENT_UNVERIFIED',
    });
    expect(deps.resolveTag).not.toHaveBeenCalled();
    expect(deps.prepare).not.toHaveBeenCalled();
    expect(deps.save).not.toHaveBeenCalled();
  });
  it('a browser capability refusal keeps only a scoped read, not a hold/UNKNOWN', async () => {
    const { deps, flow, stored } = fixture();
    (deps.assertWritable as jest.Mock).mockRejectedValue(
      new AppError({
        kind: 'config',
        code: 'NFC_UID_BOUND_WRITE_UNSUPPORTED',
        message: 'APK required',
      }),
    );
    await expect(flow.prepare('item-a')).rejects.toMatchObject({
      code: 'NFC_UID_BOUND_WRITE_UNSUPPORTED',
    });
    expect(flow.readSnapshot()).toEqual({
      context,
      itemId: 'item-a',
      hardwareUid: '04AABB',
      hasNdefData: false,
    });
    expect(flow.snapshot()).toBeUndefined();
    expect(stored()).toBeUndefined();
    expect(deps.resolveTag).not.toHaveBeenCalled();
    expect(deps.prepare).not.toHaveBeenCalled();
    expect(deps.createKey).not.toHaveBeenCalled();
    expect(deps.write).not.toHaveBeenCalled();
    expect(deps.confirm).not.toHaveBeenCalled();
  });
  it('read evidence is not available after actor/session/warehouse change or dispose', async () => {
    const { deps, flow } = fixture();
    await flow.prepare('item-a');
    expect(flow.readSnapshot()?.hasNdefData).toBe(false);
    (deps.context as jest.Mock).mockReturnValue({
      ...context,
      authSessionId: 'another-session',
    });
    expect(flow.readSnapshot()).toBeUndefined();
    (deps.context as jest.Mock).mockReturnValue(context);
    flow.dispose();
    expect(flow.readSnapshot()).toBeUndefined();
  });
  it('an old PREPARED hold stays PREPARED when the writer is unavailable', async () => {
    const { deps, flow, stored } = fixture();
    await flow.prepare('item-a');
    (deps.assertWritable as jest.Mock).mockRejectedValue(
      new AppError({
        kind: 'config',
        code: 'NFC_UID_BOUND_WRITE_UNSUPPORTED',
        message: 'APK required',
      }),
    );
    await expect(flow.writeAndConfirm()).rejects.toMatchObject({
      code: 'NFC_UID_BOUND_WRITE_UNSUPPORTED',
    });
    expect(stored()?.stage).toBe('PREPARED');
    expect(deps.write).not.toHaveBeenCalled();
    expect(deps.confirm).not.toHaveBeenCalled();
  });
  it('registered/mapped chip is not reused even when physically blank', async () => {
    const { deps, flow } = fixture();
    (deps.resolveTag as jest.Mock).mockResolvedValue({
      resolve_code: 'RESOLVED',
      nfc: { physical_code_id: 'existing' },
    });
    await expect(flow.prepare('item-a')).rejects.toMatchObject({
      code: 'NFC_TAG_ALREADY_ASSIGNED',
    });
    expect(deps.prepare).not.toHaveBeenCalled();
  });
  it('retains a current UID-bound verified mapping for P17.S03 without creating a request', async () => {
    const { deps, flow, stored } = fixture();
    (deps.read as jest.Mock).mockResolvedValue({
      hardwareUid: '04AABB',
      hasNdefData: false,
    });
    (deps.resolveTag as jest.Mock).mockResolvedValue({
      resolve_code: 'RESOLVED',
      nfc: {
        physical_code_id: 'physical-exact',
        hardware_uid: '04aabb',
        tab_status: 'LOCKED',
        status_label: 'Đã khóa',
      },
      item: {
        item_id: 'linked-item',
        item_unique: 'ITEM-EXACT',
        serial_number: 'SERIAL-EXACT',
        sku_code: 'SKU-EXACT',
        sku_name: 'Sản phẩm đã xác minh',
      },
    });
    await expect(flow.prepare('item-a')).rejects.toMatchObject({
      code: 'NFC_TAG_ALREADY_ASSIGNED',
    });
    expect(flow.mappingSnapshot()).toEqual({
      context,
      itemId: 'item-a',
      hardwareUid: '04AABB',
      resolveCode: 'RESOLVED',
      verification: 'verified',
      physicalCodeId: 'physical-exact',
      status: 'LOCKED',
      statusLabel: 'Đã khóa',
      canViewLink: true,
      product: {
        code: 'ITEM-EXACT',
        name: 'Sản phẩm đã xác minh',
        sku: 'SKU-EXACT',
        serial: 'SERIAL-EXACT',
      },
    });
    expect(stored()).toBeUndefined();
    expect(deps.prepare).not.toHaveBeenCalled();
    expect(deps.write).not.toHaveBeenCalled();
    expect(deps.confirm).not.toHaveBeenCalled();
  });
  it('does not claim a product or view permission when mapped status/UID is unverified', async () => {
    const { deps, flow } = fixture();
    (deps.resolveTag as jest.Mock).mockResolvedValue({
      resolve_code: 'RESOLVED',
      nfc: {
        physical_code_id: 'physical-exact',
        hardware_uid: 'DIFFERENT-UID',
        status: 'ACTIVE',
      },
      item: {
        item_id: 'linked-item',
        item_unique: 'MUST-NOT-SHOW',
        sku_name: 'MUST-NOT-SHOW',
      },
    });
    await expect(flow.prepare('item-a')).rejects.toMatchObject({
      code: 'NFC_TAG_ALREADY_ASSIGNED',
    });
    expect(flow.mappingSnapshot()).toMatchObject({
      verification: 'unverified',
      physicalCodeId: 'physical-exact',
      status: null,
      canViewLink: false,
    });
    expect(flow.mappingSnapshot()?.product).toBeUndefined();
    (deps.context as jest.Mock).mockReturnValue({
      ...context,
      authSessionId: 'changed-session',
    });
    expect(flow.mappingSnapshot()).toBeUndefined();
  });
  it.each(['warehouse_id', 'auth_session_id', 'replace_existing_allowed'])(
    'rejects legacy or mismatched prepare %s',
    async key => {
      const { deps, flow } = fixture();
      (deps.prepare as jest.Mock).mockResolvedValue({
        ...preparation,
        [key]: undefined,
      });
      await expect(flow.prepare('item-a')).rejects.toMatchObject({
        code: 'NFC_PREPARATION_INVALID',
      });
      expect(deps.write).not.toHaveBeenCalled();
    },
  );
  it.each(['NEW', 'IN_STOCK', 'IN_WARRANTY', 'RETURNED_TO_CUSTOMER'])(
    'rejects non-issued item status %s before any physical write',
    async itemStatus => {
      const { deps, flow } = fixture();
      (deps.prepare as jest.Mock).mockResolvedValue({
        ...preparation,
        item: { ...preparation.item, item_status: itemStatus },
      });
      await expect(flow.prepare('item-a')).rejects.toMatchObject({
        code: 'NFC_PREPARATION_INVALID',
      });
      expect(deps.write).not.toHaveBeenCalled();
      expect(deps.confirm).not.toHaveBeenCalled();
    },
  );
  it('rejects prepare when the item already has NFC evidence', async () => {
    const { deps, flow } = fixture();
    (deps.prepare as jest.Mock).mockResolvedValue({
      ...preparation,
      nfc_status: 'ASSIGNED',
      nfc: { physical_code_id: 'existing-tag' },
    });
    await expect(flow.prepare('item-a')).rejects.toMatchObject({
      code: 'NFC_PREPARATION_INVALID',
    });
    expect(deps.write).not.toHaveBeenCalled();
  });
  it('expired reservation cannot write', async () => {
    const { deps, flow } = fixture();
    await flow.prepare('item-a');
    (deps.now as jest.Mock).mockReturnValue(
      Date.parse(preparation.expires_at!),
    );
    await expect(flow.writeAndConfirm()).rejects.toMatchObject({
      code: 'NFC_RESERVATION_EXPIRED',
    });
    expect(deps.write).not.toHaveBeenCalled();
  });
  it('explicit inactive SKU in prepare blocks physical writing while pre-write reservation can be released', async () => {
    const { deps, flow } = fixture();
    (deps.prepare as jest.Mock).mockResolvedValue({
      ...preparation,
      sku: { sku_code: 'SKU-A', sku_name: 'Server SKU', status: 'INACTIVE' },
    });
    await flow.prepare('item-a');
    await expect(flow.writeAndConfirm()).rejects.toMatchObject({
      code: 'SKU_INACTIVE',
    });
    expect(deps.write).not.toHaveBeenCalled();
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(flow.snapshot()?.stage).toBe('PREPARED');
    await flow.release();
    expect(deps.release).toHaveBeenCalledTimes(1);
  });
  it('lost prepare response does not cause another reservation or physical write', async () => {
    const { deps, flow } = fixture();
    (deps.prepare as jest.Mock).mockRejectedValue(new Error('prepare lost'));
    await expect(flow.prepare('item-a')).rejects.toThrow('prepare lost');
    expect(flow.snapshot()?.stage).toBe('PREPARE_UNKNOWN');
    await expect(flow.prepare('item-a')).rejects.toMatchObject({
      code: 'NFC_UNRESOLVED_OPERATION',
    });
    await expect(flow.writeAndConfirm()).rejects.toMatchObject({
      code: 'NFC_UNRESOLVED_OPERATION',
    });
    expect(deps.prepare).toHaveBeenCalledTimes(1);
    expect(deps.write).not.toHaveBeenCalled();
  });
  it.each([
    { hardwareUid: 'DIFFERENT', writtenPayload: preparation.nfc_payload },
    { hardwareUid: '04AABB', writtenPayload: preparation.nfc_payload + ' ' },
  ])('rejects wrong UID or non-exact readback %p', async readback => {
    const { deps, flow } = fixture();
    await flow.prepare('item-a');
    (deps.write as jest.Mock).mockResolvedValue(readback);
    await expect(flow.writeAndConfirm()).rejects.toMatchObject({
      code: 'NFC_VERIFY_FAILED',
    });
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(flow.snapshot()?.stage).toBe('WRITE_UNKNOWN');
    await expect(flow.writeAndConfirm()).rejects.toMatchObject({
      code: 'NFC_UNRESOLVED_OPERATION',
    });
    expect(deps.write).toHaveBeenCalledTimes(1);
  });
  it('native readback failure permits read-only verification, never a second write', async () => {
    const { deps, flow } = fixture();
    await flow.prepare('item-a');
    (deps.write as jest.Mock).mockRejectedValue(
      new AppError({
        kind: 'unknown',
        code: 'NFC_IO_ERROR',
        message: 'RF lost',
      }),
    );
    await expect(flow.writeAndConfirm()).rejects.toThrow('RF lost');
    (deps.read as jest.Mock).mockResolvedValue({
      hardwareUid: '04AABB',
      rawCode: preparation.nfc_payload,
    });
    await flow.verifyWrittenChip();
    expect(deps.write).toHaveBeenCalledTimes(1);
    expect(flow.snapshot()?.stage).toBe('CONFIRMED');
  });
  it('timeout keeps key/payload and only GET-reconciles the full saved envelope', async () => {
    const { deps, flow } = fixture();
    await flow.prepare('item-a');
    (deps.confirm as jest.Mock).mockRejectedValue(
      new AppError({ kind: 'timeout', message: 'lost' }),
    );
    await expect(flow.writeAndConfirm()).rejects.toThrow('lost');
    expect(flow.snapshot()?.stage).toBe('UNKNOWN');
    await expect(flow.writeAndConfirm()).rejects.toMatchObject({
      code: 'NFC_UNRESOLVED_OPERATION',
    });
    expect(await flow.reconcile()).toBe('SUCCEEDED');
    expect(deps.reconcile).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'same-key-a',
        writtenPayload: preparation.nfc_payload,
      }),
    );
    expect(deps.confirm).toHaveBeenCalledTimes(1);
    expect(deps.write).toHaveBeenCalledTimes(1);
  });
  it.each(['UNKNOWN', 'PROCESSING'])(
    '%s does not create/release/rewrite another request',
    async state => {
      const { deps, flow } = fixture();
      await flow.prepare('item-a');
      (deps.confirm as jest.Mock).mockRejectedValue(new Error('lost'));
      await expect(flow.writeAndConfirm()).rejects.toThrow();
      (deps.reconcile as jest.Mock).mockResolvedValue({
        state,
        response: null,
        may_create_new_request: false,
      });
      expect(await flow.reconcile()).toBe(state);
      expect(flow.snapshot()?.lastCheck?.state).toBe(state);
      await expect(flow.release()).rejects.toMatchObject({
        code: 'NFC_UNRESOLVED_OPERATION',
      });
      await expect(flow.prepare('item-a')).rejects.toMatchObject({
        code: 'NFC_UNRESOLVED_OPERATION',
      });
      expect(deps.write).toHaveBeenCalledTimes(1);
      expect(deps.release).not.toHaveBeenCalled();
    },
  );
  it('wrong-context receipt never becomes success', async () => {
    const { deps, flow } = fixture();
    await flow.prepare('item-a');
    (deps.confirm as jest.Mock).mockResolvedValue({
      ...confirmation,
      confirmation: {
        ...confirmation.confirmation,
        auth_session_id: 'other-session',
      },
    });
    await expect(flow.writeAndConfirm()).rejects.toMatchObject({
      code: 'NFC_CONFIRMATION_INVALID',
    });
    expect(flow.snapshot()?.stage).toBe('UNKNOWN');
  });
  it('session switch while writing prevents server confirm', async () => {
    const { deps, flow } = fixture();
    await flow.prepare('item-a');
    (deps.write as jest.Mock).mockImplementation(async () => {
      (deps.context as jest.Mock).mockReturnValue({
        ...context,
        authSessionId: 'other',
      });
      return { hardwareUid: '04AABB', writtenPayload: preparation.nfc_payload };
    });
    await expect(flow.writeAndConfirm()).rejects.toMatchObject({
      code: 'NFC_SESSION_CHANGED',
    });
    expect(deps.confirm).not.toHaveBeenCalled();
  });
  it('restart during physical/server operations is recovery-only', async () => {
    const { flow } = fixture();
    await flow.prepare('item-a');
    for (const stage of ['WRITING', 'CONFIRMING'] as const) {
      const saved = { ...flow.snapshot()!, stage };
      const restarted = fixture(saved);
      expect(restarted.flow.snapshot()?.stage).toBe(
        stage === 'WRITING' ? 'WRITE_UNKNOWN' : 'UNKNOWN',
      );
      await expect(restarted.flow.writeAndConfirm()).rejects.toMatchObject({
        code: 'NFC_UNRESOLVED_OPERATION',
      });
      expect(restarted.deps.write).not.toHaveBeenCalled();
    }
  });
  it.each([true, false])(
    'release before writing (released=%s) is reservation-only',
    async released => {
      const { deps, flow, stored } = fixture();
      await flow.prepare('item-a');
      (deps.release as jest.Mock).mockResolvedValue({
        released,
        stock_effect: 'NONE',
      });
      await flow.release();
      expect(stored()).toBeUndefined();
      expect(deps.confirm).not.toHaveBeenCalled();
      expect(deps.write).not.toHaveBeenCalled();
    },
  );
  it('synchronous lock prevents double-click prepare', async () => {
    const { deps, flow } = fixture();
    let unblock!: () => void;
    (deps.preflight as jest.Mock).mockImplementation(
      () =>
        new Promise<void>(resolve => {
          unblock = resolve;
        }),
    );
    const first = flow.prepare('item-a');
    await expect(flow.prepare('item-a')).rejects.toMatchObject({
      code: 'NFC_BUSY',
    });
    unblock();
    await first;
    expect(deps.prepare).toHaveBeenCalledTimes(1);
  });
});

it('keeps verified physical write and explicit SKU rejection across restart without another PATCH/write', async () => {
  const { flow, deps, stored } = fixture();
  await flow.prepare('item-a');
  (deps.confirm as jest.Mock).mockRejectedValue(
    new AppError({
      kind: 'http',
      status: 422,
      code: 'SKU_INACTIVE',
      requestId: 'qa-request',
      message: 'SKU inactive',
    }),
  );
  await expect(flow.writeAndConfirm()).rejects.toMatchObject({
    code: 'SKU_INACTIVE',
  });
  expect(stored()).toMatchObject({
    stage: 'UNKNOWN',
    key: 'same-key-a',
    writtenPayload: preparation.nfc_payload,
    confirmationIssue: {
      code: 'SKU_INACTIVE',
      status: 422,
      requestId: 'qa-request',
    },
  });
  const restarted = fixture(stored());
  (restarted.deps.reconcile as jest.Mock).mockResolvedValue({
    state: 'UNKNOWN',
    response: null,
    may_create_new_request: false,
  });
  expect(await restarted.flow.reconcile()).toBe('UNKNOWN');
  expect(restarted.flow.snapshot()?.confirmationIssue?.code).toBe(
    'SKU_INACTIVE',
  );
  expect(restarted.deps.write).not.toHaveBeenCalled();
  expect(restarted.deps.confirm).not.toHaveBeenCalled();
  expect(() => restarted.flow.resetConfirmed()).toThrow();
});

// Recovery must remain safe independently of UI/navigation.
it('blocks a second prepare while UNKNOWN; malformed mapping never reaches reserve', async () => {
  const { flow, deps } = fixture();
  (deps.resolveTag as jest.Mock).mockResolvedValueOnce({});
  await expect(flow.prepare('item-a')).rejects.toMatchObject({
    code: 'NFC_MAPPING_UNVERIFIED',
  });
  expect(deps.prepare).not.toHaveBeenCalled();
  expect(deps.write).not.toHaveBeenCalled();
});
it('new link only resets a terminal receipt, retaining original product identity in the receipt', async () => {
  const { flow, deps } = fixture();
  await flow.prepare('item-a');
  expect(() => flow.resetConfirmed()).toThrow();
  await flow.writeAndConfirm();
  const receipt = flow.snapshot()!.result;
  flow.resetConfirmed();
  expect(flow.snapshot()).toBeUndefined();
  expect(receipt!.item!.item_id).toBe('item-a');
  expect(deps.remove).toHaveBeenCalledWith(context);
});
