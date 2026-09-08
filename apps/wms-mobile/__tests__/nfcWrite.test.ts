import { AppError } from '../src/errors/AppError';
import {
  NFC_PATHS,
  assertApprovedNfcWrite,
  confirmNfcAssignment,
  createNfcConfirmationKey,
  deactivateNfcTag,
  nfcConfirmPath,
  nfcDeactivatePath,
  nfcPreparePath,
  prepareNfcAssignment,
  resolveNfcCode,
  resolveNfcTag,
  type WriteClient,
} from '../src/services/wms/nfc';
import { allowsIdempotencyKey, approvedWriteFor } from '../src/api/writeGate';

interface Sent { path: string; method?: string; body?: unknown; headers?: Record<string, string>; }

function spyClient(response: unknown = { data: {} }): { client: WriteClient; sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    client: {
      async request<T>(options: Parameters<WriteClient['request']>[0]) {
        sent.push({ path: options.path, method: options.method, body: options.body, headers: options.headers });
        return { status: 200, data: response as T };
      },
    },
  };
}

describe('GATE_WMS §2j — luồng NFC', () => {
  it('chỉ mở đúng 5 cặp method + path NFC', () => {
    expect(approvedWriteFor('POST', NFC_PATHS.resolveCode)).toBe('nfc.resolveCode');
    expect(approvedWriteFor('POST', nfcPreparePath('item-1'))).toBe('nfc.prepare');
    expect(approvedWriteFor('PATCH', nfcConfirmPath('item-1'))).toBe('nfc.confirm');
    expect(approvedWriteFor('POST', NFC_PATHS.resolveTag)).toBe('nfc.resolveTag');
    expect(approvedWriteFor('POST', nfcDeactivatePath('code-1'))).toBe('nfc.deactivate');
    expect(approvedWriteFor('POST', nfcConfirmPath('item-1'))).toBeUndefined();
    expect(approvedWriteFor('PATCH', '/api/v1/physical-codes')).toBeUndefined();
  });

  it('resolve QR và prepare giữ đúng body, không có header chống trùng', async () => {
    const { client, sent } = spyClient({ data: { assignable: true, item: { id: 'item-1' } } });
    await resolveNfcCode('QR-01', {}, client);
    await prepareNfcAssignment('item-1', {}, client);
    expect(sent).toEqual([
      { path: NFC_PATHS.resolveCode, method: 'POST', body: { raw_code: 'QR-01' }, headers: undefined },
      { path: nfcPreparePath('item-1'), method: 'POST', body: {}, headers: undefined },
    ]);
  });

  it('chỉ confirm sau write-readback ở tầng UI; service gửi đúng UID, payload, reservation và key', async () => {
    const { client, sent } = spyClient({ data: { nfc_status: 'ASSIGNED' } });
    await confirmNfcAssignment('item-1', {
      hardwareUid: '04A1B2C3', writtenPayload: 'HN1:ITEM:item-1', reservationToken: 'reserve-123', idempotencyKey: 'nfc-item1-04A1B2C3-x',
    }, {}, client);
    expect(sent[0]).toEqual({
      path: nfcConfirmPath('item-1'), method: 'PATCH',
      body: { hardware_uid: '04A1B2C3', written_payload: 'HN1:ITEM:item-1', reservation_token: 'reserve-123' },
      headers: { 'Idempotency-Key': 'nfc-item1-04A1B2C3-x' },
    });
    expect(allowsIdempotencyKey('PATCH', nfcConfirmPath('item-1'))).toBe(true);
    expect(allowsIdempotencyKey('POST', nfcPreparePath('item-1'))).toBe(false);
  });

  it('tra cứu NFC là POST read-like và ưu tiên UID thay vì payload có thể bị sao chép', async () => {
    const { client, sent } = spyClient({ data: { resolve_code: 'RESOLVED' } });
    await resolveNfcTag({ hardwareUid: '04010203', rawCode: 'HN1:ITEM:1' }, {}, client);
    await resolveNfcTag({ rawCode: 'HN1:ITEM:1' }, {}, client);
    expect(sent[0]?.body).toEqual({ hardware_uid: '04010203' });
    expect(sent[1]?.body).toEqual({ raw_code: 'HN1:ITEM:1' });
  });

  it('thu hồi chip yêu cầu trạng thái và lý do, không có DELETE', async () => {
    const { client, sent } = spyClient({ data: { status: 'LOST' } });
    await deactivateNfcTag('physical-7', { status: 'LOST', reason: 'Mất thẻ khi giao hàng' }, {}, client);
    expect(sent[0]).toMatchObject({ path: nfcDeactivatePath('physical-7'), method: 'POST', body: { status: 'LOST', reason: 'Mất thẻ khi giao hàng' } });
  });

  it('success:false không được coi là đã map NFC', async () => {
    const { client } = spyClient({ success: false, message: 'UID đã được gán' });
    await expect(resolveNfcCode('X', {}, client)).rejects.toMatchObject({ kind: 'http', message: 'UID đã được gán' });
  });

  it('endpoint NFC ngoài danh sách bị tầng dịch vụ chặn', () => {
    expect(() => assertApprovedNfcWrite('POST', '/api/v1/physical-codes')).toThrow(AppError);
  });

  it('key confirm sạch và chứa item + UID để retry cùng lượt chạm dùng lại key đó', () => {
    const key = createNfcConfirmationKey('item-1/../', '04:A1:B2');
    expect(key).toMatch(/^nfc-item1-04A1B2-/);
  });
});
