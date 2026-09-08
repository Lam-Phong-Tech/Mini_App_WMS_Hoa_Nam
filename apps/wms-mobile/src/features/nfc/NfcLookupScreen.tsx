import React, { useEffect, useState } from 'react';
import { Banner } from '../../ui/Banner';
import { Box } from '../../ui/Box';
import { Button } from '../../ui/Button';
import { DefinitionRow } from '../../ui/DefinitionRow';
import { Page } from '../../ui/Page';
import { Text } from '../../ui/Text';
import { messageForUser, toAppError, type AppError } from '../../errors/AppError';
import { cancelNfc, readNfcTag } from '../../native/nfc';
import { resolveNfcTag, type NfcTagResolution } from '../../services/wms/nfc';

function display(record: Record<string, unknown> | null | undefined, keys: readonly string[]): string | undefined {
  for (const key of keys) { const value = record?.[key]; if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value); }
  return undefined;
}

export interface NfcLookupScreenProps { onBack: () => void; }

/** Tra cứu sau xuất kho bằng UID thật của chip; backend quyết định che PII theo quyền. */
export function NfcLookupScreen({ onBack }: NfcLookupScreenProps): React.ReactElement {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<AppError>(); const [result, setResult] = useState<NfcTagResolution>();
  useEffect(() => () => cancelNfc(), []);
  const lookup = async (): Promise<void> => {
    if (busy) return; setBusy(true); setError(undefined); setResult(undefined);
    try { const tag = await readNfcTag(); setResult(await resolveNfcTag({ hardwareUid: tag.hardwareUid, rawCode: tag.rawCode })); }
    catch (cause) { setError(toAppError(cause)); } finally { setBusy(false); }
  };
  const unresolved = result !== undefined && result.resolve_code !== 'RESOLVED';
  return <Page title="Tra cứu NFC" subtitle="Bảo hành · chạm thẻ để xem sản phẩm" onBack={onBack} scroll>
    <Banner tone="info" title="Tra cứu không làm đổi tồn kho" message="Chạm thẻ NFC trên sản phẩm. WMS trả thông tin hiện vật, lịch sử xuất gần nhất và bảo hành đang hiệu lực theo quyền của bạn." />
    <Button label="Chạm thẻ NFC để tra cứu" loading={busy} disabled={busy} onPress={lookup} />
    {error === undefined ? null : <Banner tone="danger" title="Không tra cứu được" message={messageForUser(error)}><Button label="Thử lại" variant="secondary" onPress={lookup} /></Banner>}
    {unresolved ? <Banner tone="warning" title="Thẻ chưa được liên kết" message={'WMS trả về: ' + (result?.resolve_code ?? 'NFC_TAG_NOT_REGISTERED') + '. Không suy đoán sản phẩm từ thẻ này.'} /> : null}
    {result === undefined || unresolved ? null : <>
      <Banner tone="success" title="Đã nhận diện sản phẩm" message="Dữ liệu được truy vấn theo UID của thẻ NFC." />
      <Box card padding="lg" gap="sm"><Text variant="cardTitle" tone="strong">Sản phẩm</Text><DefinitionRow label="Item / serial" value={result.item?.serial_number ?? result.item?.serial ?? result.item?.item_unique} /><DefinitionRow label="SKU" value={result.item?.sku_code ?? result.sku?.sku_code} /><DefinitionRow label="Tên SKU" value={result.item?.sku_name ?? result.sku?.name} /><DefinitionRow label="UID NFC" value={result.nfc?.hardware_uid} last /></Box>
      <Box card padding="lg" gap="sm"><Text variant="cardTitle" tone="strong">Bảo hành</Text><DefinitionRow label="Trạng thái" value={display(result.active_warranty, ['status', 'warranty_status'])} /><DefinitionRow label="Hạn bảo hành" value={display(result.active_warranty, ['expires_at', 'warranty_until', 'end_date'])} last /></Box>
      <Box card padding="lg" gap="sm"><Text variant="cardTitle" tone="strong">Lần xuất gần nhất</Text><DefinitionRow label="Phiếu" value={display(result.last_issue, ['doc_no', 'document_no', 'outbound_document_no'])} /><DefinitionRow label="Thời điểm" value={display(result.last_issue, ['issued_at', 'posted_at', 'created_at'])} last /></Box>
    </>}
  </Page>;
}
