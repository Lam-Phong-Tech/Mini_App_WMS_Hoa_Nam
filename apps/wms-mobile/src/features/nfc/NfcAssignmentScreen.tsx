import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner } from '../../ui/Banner';
import { Box } from '../../ui/Box';
import { Button } from '../../ui/Button';
import { CodeInput } from '../../ui/CodeInput';
import { DefinitionRow } from '../../ui/DefinitionRow';
import { Page } from '../../ui/Page';
import { Text } from '../../ui/Text';
import { messageForUser, toAppError, type AppError } from '../../errors/AppError';
import { cancelNfc, writeNfcText } from '../../native/nfc';
import {
  confirmNfcAssignment,
  createNfcConfirmationKey,
  prepareNfcAssignment,
  resolveNfcCode,
  type NfcConfirmation,
  type NfcPreparation,
  type NfcResolvedCode,
} from '../../services/wms/nfc';

const styles = StyleSheet.create({
  actions: { gap: 12 },
});

function nfcMessage(error: AppError): string {
  switch (error.code) {
    case 'ITEM_ALREADY_HAS_NFC': return 'Sản phẩm này đã có thẻ NFC. Không ghi đè thẻ cũ.';
    case 'NFC_WRITE_RESERVED_BY_OTHER': return 'Sản phẩm đang được một nhân viên khác gán NFC. Thử lại sau.';
    case 'NFC_UID_ALREADY_ASSIGNED': return 'Thẻ NFC này đã được gán cho sản phẩm khác.';
    case 'NFC_PAYLOAD_ITEM_MISMATCH': return 'Nội dung thẻ không khớp sản phẩm đã chọn. Không lưu mapping.';
    case 'NFC_DISABLED': return 'NFC đang tắt. Bật NFC trong cài đặt rồi thử lại.';
    case 'NFC_UNSUPPORTED': return 'Thiết bị này không có NFC.';
    case 'NFC_READ_ONLY': return 'Thẻ đã bị khoá, không thể ghi. Dùng thẻ mới.';
    case 'NFC_TAG_TOO_SMALL': return 'Thẻ không đủ dung lượng. Dùng thẻ NFC khác.';
    case 'NFC_VERIFY_FAILED': return 'Không đọc lại được đúng nội dung sau khi ghi. Không có mapping nào được lưu.';
    default: return messageForUser(error);
  }
}

function itemId(value: NfcResolvedCode | NfcPreparation): string | undefined {
  return value.item?.id ?? value.item?.item_id;
}

function itemLabel(value: NfcResolvedCode | NfcPreparation): string {
  return value.item?.serial_number ?? value.item?.serial ?? value.item?.item_unique ?? value.sku?.sku_code ?? '—';
}

export interface NfcAssignmentScreenProps {
  initialCode?: string;
  onBack: () => void;
  onScanCode?: () => void;
  onManageTags?: () => void;
}

/** Màn gán chip: confirm WMS chỉ chạy sau native write + read-back thành công. */
export function NfcAssignmentScreen({ initialCode, onBack, onScanCode, onManageTags }: NfcAssignmentScreenProps): React.ReactElement {
  const [code, setCode] = useState(initialCode ?? '');
  const [resolved, setResolved] = useState<NfcResolvedCode>();
  const [prepared, setPrepared] = useState<NfcPreparation>();
  const [confirmed, setConfirmed] = useState<NfcConfirmation>();
  const [busy, setBusy] = useState<'resolve' | 'prepare' | 'write' | undefined>();
  const [error, setError] = useState<AppError>();
  const idempotencyKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    setCode(initialCode ?? '');
    setResolved(undefined); setPrepared(undefined); setConfirmed(undefined); setError(undefined);
  }, [initialCode]);
  useEffect(() => () => cancelNfc(), []);

  const resolve = async (): Promise<void> => {
    const raw = code.trim();
    if (raw === '' || busy !== undefined) return;
    setBusy('resolve'); setError(undefined); setPrepared(undefined); setConfirmed(undefined);
    try { setResolved(await resolveNfcCode(raw)); }
    catch (cause) { setResolved(undefined); setError(toAppError(cause)); }
    finally { setBusy(undefined); }
  };

  const prepare = async (): Promise<void> => {
    if (busy !== undefined || resolved?.assignable !== true) return;
    const id = itemId(resolved);
    if (id === undefined) { setError(toAppError(new Error('WMS không trả item_id để gán NFC.'))); return; }
    setBusy('prepare'); setError(undefined);
    try { setPrepared(await prepareNfcAssignment(id)); }
    catch (cause) { setError(toAppError(cause)); }
    finally { setBusy(undefined); }
  };

  const writeAndConfirm = async (): Promise<void> => {
    const current = prepared;
    const id = current === undefined ? undefined : itemId(current);
    const payload = current?.nfc_payload;
    if (busy !== undefined || current === undefined || id === undefined || payload === undefined || payload === null || payload === '') return;
    setBusy('write'); setError(undefined);
    try {
      // Native chỉ resolve sau write + read-back; vì vậy request PATCH dưới đây
      // không bao giờ có đường chạy khi thẻ chưa xác minh vật lý.
      const tag = await writeNfcText(payload);
      idempotencyKey.current ??= createNfcConfirmationKey(id, tag.hardwareUid);
      setConfirmed(await confirmNfcAssignment(id, {
        hardwareUid: tag.hardwareUid,
        writtenPayload: tag.writtenPayload,
        reservationToken: current.reservation_token,
        idempotencyKey: idempotencyKey.current,
      }));
    } catch (cause) { setError(toAppError(cause)); }
    finally { setBusy(undefined); }
  };

  const assignable = resolved?.assignable === true && itemId(resolved) !== undefined;
  return (
    <Page title="Gán NFC" subtitle="Xuất kho · QR/SKU → thẻ NFC" onBack={onBack} scroll>
      <Banner tone="info" title="Gán trong lúc xuất kho" message="Quét/nhập QR hoặc SKU của hiện vật. App giữ chỗ trên WMS, ghi và đọc lại thẻ rồi mới xác nhận liên kết. Thao tác này không làm thay đổi tồn kho." />
      <Box card padding="lg" gap="md">
        <Text variant="cardTitle" tone="strong">1. Nhận diện sản phẩm</Text>
        <CodeInput label="QR / SKU / serial" placeholder="Quét bằng máy quét hoặc nhập mã" value={code} onChangeText={setCode} returnKeyType="done" onSubmitEditing={resolve} />
        {onScanCode === undefined ? null : <Button label="Mở camera quét QR/SKU" variant="secondary" onPress={onScanCode} />}
        <Button label="Nhận diện hiện vật" loading={busy === 'resolve'} disabled={code.trim() === '' || busy !== undefined} onPress={resolve} />
      </Box>
      {error === undefined ? null : <Banner tone="danger" title="Chưa thể gán NFC" message={nfcMessage(error)} />}
      {resolved === undefined ? null : (
        <Box card padding="lg" gap="sm">
          <Text variant="cardTitle" tone="strong">Hiện vật trên WMS</Text>
          <DefinitionRow label="Item / serial" value={itemLabel(resolved)} />
          <DefinitionRow label="SKU" value={resolved.item?.sku_code ?? resolved.sku?.sku_code} />
          <DefinitionRow label="Trạng thái NFC" value={resolved.nfc_status} last />
          {assignable ? <Button label="2. Chuẩn bị ghi thẻ NFC" loading={busy === 'prepare'} disabled={busy !== undefined || prepared !== undefined || confirmed !== undefined} onPress={prepare} /> : <Banner tone="warning" title="Chưa thể gán thẻ" message={resolved.assign_block_code === undefined || resolved.assign_block_code === null ? 'WMS không cho phép gán NFC cho hiện vật này.' : 'Mã chặn: ' + resolved.assign_block_code} />}
        </Box>
      )}
      {prepared === undefined ? null : (
        <Box card padding="lg" gap="md">
          <Text variant="cardTitle" tone="strong">2. Ghi thẻ mới</Text>
          <Text variant="caption" tone="muted">Đặt thẻ NFC mới sát điện thoại. Giữ nguyên tới khi app thông báo đã đọc lại thành công.</Text>
          <DefinitionRow label="Giữ chỗ đến" value={prepared.expires_at} />
          <DefinitionRow label="Payload WMS" value={prepared.nfc_payload} last />
          <Button label="Chạm thẻ NFC để ghi" loading={busy === 'write'} disabled={busy !== undefined || confirmed !== undefined} onPress={writeAndConfirm} />
        </Box>
      )}
      {confirmed === undefined ? null : <Banner tone="success" title="Đã gán NFC thành công" message={'Thẻ ' + (confirmed.nfc?.hardware_uid ?? 'NFC') + ' đã liên kết với ' + itemLabel(confirmed) + '. Có thể đính thẻ lên sản phẩm và hoàn tất phiếu xuất.'} />}
      <View style={styles.actions}>
        {onManageTags === undefined ? null : <Button label="Danh sách chip NFC" variant="secondary" onPress={onManageTags} />}
        <Button label="Quay lại" variant="secondary" onPress={onBack} />
      </View>
    </Page>
  );
}
