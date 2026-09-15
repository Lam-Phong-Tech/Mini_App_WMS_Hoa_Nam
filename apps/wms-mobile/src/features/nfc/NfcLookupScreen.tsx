import React, { useEffect, useState } from 'react';
import { Banner } from '../../ui/Banner';
import { Box } from '../../ui/Box';
import { Button } from '../../ui/Button';
import { DefinitionRow } from '../../ui/DefinitionRow';
import { Page } from '../../ui/Page';
import { Text } from '../../ui/Text';
import { toAppError, type AppError } from '../../errors/AppError';
import { cancelNfc, readNfcTag } from '../../native/nfc';
import { lookupInventoryByCode } from '../lookup/inventoryLookup';
import { resolveNfcTag, type NfcTagResolution } from '../../services/wms/nfc';
import { nfcUserMessage } from './nfcUserMessage';

function display(
  record: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
  }
  return undefined;
}

export function nfcSkuCode(result: NfcTagResolution): string | undefined {
  return result.item?.sku_code ?? result.sku?.sku_code ?? undefined;
}

/** API resolve-tag đôi lúc chỉ trả sku_code. Trace là GET đã được xác nhận. */
export function nfcSkuName(
  result: NfcTagResolution,
  traceName?: string,
): string | undefined {
  return result.item?.sku_name ?? result.sku?.name ?? traceName;
}

export interface NfcLookupScreenProps { onBack: () => void; }

/** Tra cứu bằng UID chip thật; không tạo chứng từ hoặc đổi tồn kho. */
export function NfcLookupScreen({ onBack }: NfcLookupScreenProps): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError>();
  const [result, setResult] = useState<NfcTagResolution>();
  const [resolvedSkuName, setResolvedSkuName] = useState<string>();

  useEffect(() => () => cancelNfc(), []);

  const lookup = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    setResolvedSkuName(undefined);

    try {
      const tag = await readNfcTag();
      const resolved = await resolveNfcTag({
        hardwareUid: tag.hardwareUid,
        rawCode: tag.rawCode,
      });

      // `resolve-tag` đã resolve hiện vật nhưng có thể chỉ trả sku_code. Hỏi
      // trace bằng đúng SKU đó để lấy tên server đã có; lookup bổ sung thất bại
      // không được làm phủ nhận kết quả UID đã resolve thành công.
      const skuCode = nfcSkuCode(resolved);
      const directName = nfcSkuName(resolved);
      const trace =
        resolved.resolve_code === 'RESOLVED' && skuCode !== undefined && directName === undefined
          ? await lookupInventoryByCode(skuCode).catch(() => undefined)
          : undefined;

      setResult(resolved);
      setResolvedSkuName(trace?.product_name ?? undefined);
    } catch (cause) {
      setError(toAppError(cause));
    } finally {
      setBusy(false);
    }
  };

  const unresolved = result !== undefined && result.resolve_code !== 'RESOLVED';
  const displayedSkuName = result === undefined ? undefined : nfcSkuName(result, resolvedSkuName);

  return (
    <Page title="Tra cứu NFC" subtitle="Chạm thẻ để xem sản phẩm" onBack={onBack} scroll headerVariant="brand">
      <Banner
        tone="info"
        title="Tra cứu không làm đổi tồn kho"
        message="Chạm thẻ NFC trên sản phẩm. WMS trả thông tin hiện vật, lịch sử xuất gần nhất và bảo hành đang hiệu lực theo quyền của bạn."
      />
      <Button label="Chạm thẻ NFC để tra cứu" loading={busy} disabled={busy} onPress={lookup} />
      {error === undefined ? null : (
        <Banner tone="danger" title="Không tra cứu được" message={nfcUserMessage(error)}>
          <Button label="Thử lại" variant="secondary" onPress={lookup} />
        </Banner>
      )}
      {unresolved ? (
        <Banner
          tone="warning"
          title="Thẻ chưa được liên kết"
          message={'WMS trả về: ' + (result?.resolve_code ?? 'NFC_TAG_NOT_REGISTERED') + '. Không suy đoán sản phẩm từ thẻ này.'}
        />
      ) : null}
      {result === undefined || unresolved ? null : (
        <>
          <Banner tone="success" title="Đã nhận diện sản phẩm" message="Dữ liệu được truy vấn theo UID của thẻ NFC." />
          <Box card padding="lg" gap="sm">
            <Text variant="cardTitle" tone="strong">Sản phẩm</Text>
            <DefinitionRow label="Item / serial" value={result.item?.serial_number ?? result.item?.serial ?? result.item?.item_unique} />
            <DefinitionRow label="SKU" value={nfcSkuCode(result)} />
            <DefinitionRow label="Tên SKU" value={displayedSkuName} />
            <DefinitionRow label="UID NFC" value={result.nfc?.hardware_uid} last />
          </Box>
          <Box card padding="lg" gap="sm">
            <Text variant="cardTitle" tone="strong">Bảo hành</Text>
            <DefinitionRow label="Trạng thái" value={display(result.active_warranty, ['status', 'warranty_status'])} />
            <DefinitionRow label="Hạn bảo hành" value={display(result.active_warranty, ['expires_at', 'warranty_until', 'end_date'])} last />
          </Box>
          <Box card padding="lg" gap="sm">
            <Text variant="cardTitle" tone="strong">Lần xuất gần nhất</Text>
            <DefinitionRow label="Phiếu" value={display(result.last_issue, ['doc_no', 'document_no', 'outbound_document_no'])} />
            <DefinitionRow label="Thời điểm" value={display(result.last_issue, ['issued_at', 'posted_at', 'created_at'])} last />
          </Box>
        </>
      )}
    </Page>
  );
}
