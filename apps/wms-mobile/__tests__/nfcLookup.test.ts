import { nfcSkuCode, nfcSkuName } from '../src/features/nfc/NfcLookupScreen';
import type { NfcTagResolution } from '../src/services/wms/nfc';

describe('NFC lookup SKU display', () => {
  it('uses the name from resolve-tag when BE returns it', () => {
    const result: NfcTagResolution = {
      resolve_code: 'RESOLVED',
      item: { sku_code: 'DF1234', sku_name: 'Máy Khoan cắt điện' },
    };
    expect(nfcSkuCode(result)).toBe('DF1234');
    expect(nfcSkuName(result)).toBe('Máy Khoan cắt điện');
  });

  it('uses the read-only trace name when resolve-tag only returns a SKU code', () => {
    const result: NfcTagResolution = {
      resolve_code: 'RESOLVED',
      item: { sku_code: 'DF1234' },
    };
    expect(nfcSkuName(result, 'Máy Khoan cắt điện')).toBe('Máy Khoan cắt điện');
  });
});
