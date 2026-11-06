import type { RequestOptions } from '../src/api/client';
import {
  getNfcConfirmation,
  prepareNfcRecovery,
  prepareNfcAssignment,
  confirmNfcAssignment,
  type WriteClient,
} from '../src/services/wms/nfc';
import { NFC_RECOVERY_CONTRACT } from '../src/contracts/p07NfcRecovery';
import { createLogger, REDACTED } from '../src/logging/logger';
function client(
  body: unknown = {
    success: true,
    data: { state: 'UNKNOWN', may_create_new_request: false },
  },
) {
  const request = jest.fn(async (_options: RequestOptions) => ({
    status: 200,
    data: body,
  }));
  return { request, api: { request } as unknown as WriteClient };
}
describe('P07 recovery transport, mocked HTTP', () => {
  it('opts in only on GET confirmation using original PATCH key, query and no body', async () => {
    const f = client();
    await getNfcConfirmation(
      'item-a',
      'original-patch-key',
      { warehouseId: 'warehouse-a' },
      f.api,
    );
    expect(f.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/mini-app/items/item-a/nfc/confirmation',
        query: { warehouse_id: 'warehouse-a' },
        headers: {
          'Idempotency-Key': 'original-patch-key',
          'X-NFC-Recovery-Contract': NFC_RECOVERY_CONTRACT,
        },
      }),
    );
    expect(f.request.mock.calls[0][0]).not.toHaveProperty('body');
  });
  it('legacy opt-out sends no recovery header and never changes key', async () => {
    const f = client();
    await getNfcConfirmation(
      'item-a',
      'original-patch-key',
      { recoveryContract: false },
      f.api,
    );
    expect(f.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'Idempotency-Key': 'original-patch-key' },
      }),
    );
  });
  it('recovery prepare keeps owner body empty and uses old key only in recovery header', async () => {
    const f = client({ success: true, data: {} });
    await prepareNfcRecovery(
      'item-a',
      'old-patch-key',
      { warehouseId: 'warehouse-a' },
      f.api,
    );
    expect(f.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        body: {},
        query: { warehouse_id: 'warehouse-a' },
        headers: {
          'X-NFC-Recovery-Contract': NFC_RECOVERY_CONTRACT,
          'X-NFC-Recovery-Key': 'old-patch-key',
        },
      }),
    );
    expect(f.request.mock.calls[0][0].headers).not.toHaveProperty(
      'Idempotency-Key',
    );
  });
  it('normal prepare and fresh PATCH retain existing body/header contracts', async () => {
    const f = client({ success: true, data: {} });
    await prepareNfcAssignment('item-a', {}, f.api);
    expect(f.request.mock.calls[0][0]).not.toHaveProperty('headers');
    await confirmNfcAssignment(
      'item-a',
      {
        hardwareUid: 'NEWUID',
        writtenPayload: 'payload',
        reservationToken: 'new-hold',
        idempotencyKey: 'new-key',
      },
      {},
      f.api,
    );
    expect(f.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        headers: { 'Idempotency-Key': 'new-key' },
        body: {
          hardware_uid: 'NEWUID',
          written_payload: 'payload',
          reservation_token: 'new-hold',
        },
      }),
    );
  });
  it('REJECTED without the agreed response metadata is blocked rather than treated as success', async () => {
    const f = client({
      success: true,
      data: { state: 'REJECTED', may_create_new_request: true },
    });
    await expect(
      getNfcConfirmation('item-a', 'old-key', {}, f.api),
    ).rejects.toMatchObject({ code: 'NFC_REJECTION_INVALID' });
  });
  it('new recovery/idempotency header values are redacted by the shared logger', () => {
    const sink = jest.fn();
    const logger = createLogger({ minLevel: 'debug', sink });
    logger.debug('request', {
      headers: {
        'X-NFC-Recovery-Key': 'original-secret-key',
        'Idempotency-Key': 'new-secret-key',
        'X-NFC-Recovery-Contract': NFC_RECOVERY_CONTRACT,
      },
    });
    expect(sink).toHaveBeenCalledWith('debug', 'request', {
      headers: {
        'X-NFC-Recovery-Key': REDACTED,
        'Idempotency-Key': REDACTED,
        'X-NFC-Recovery-Contract': NFC_RECOVERY_CONTRACT,
      },
    });
  });
});
