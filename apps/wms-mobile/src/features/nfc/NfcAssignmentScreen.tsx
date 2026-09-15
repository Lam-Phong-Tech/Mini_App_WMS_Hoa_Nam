import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner } from '../../ui/Banner';
import { Box } from '../../ui/Box';
import { Button } from '../../ui/Button';
import { CodeInput } from '../../ui/CodeInput';
import { DefinitionRow } from '../../ui/DefinitionRow';
import { Page } from '../../ui/Page';
import { Text } from '../../ui/Text';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import { toAppError, type AppError } from '../../errors/AppError';
import { cancelNfc, writeNfcText } from '../../native/nfc';
import { nfcUserMessage } from './nfcUserMessage';
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
  nfcCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  headerStep: { color: '#ffffff', fontWeight: '600' },
});

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

/** Gán thẻ theo board NFC: nhận diện → xác minh → hoàn tất. */
export function NfcAssignmentScreen({
  initialCode,
  onBack,
  onScanCode,
  onManageTags,
}: NfcAssignmentScreenProps): React.ReactElement {
  const theme = useTheme();
  const [code, setCode] = useState(initialCode ?? '');
  const [resolved, setResolved] = useState<NfcResolvedCode>();
  const [prepared, setPrepared] = useState<NfcPreparation>();
  const [confirmed, setConfirmed] = useState<NfcConfirmation>();
  const [busy, setBusy] = useState<'resolve' | 'prepare' | 'write' | undefined>();
  const [error, setError] = useState<AppError>();
  const idempotencyKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    setCode(initialCode ?? '');
    setResolved(undefined);
    setPrepared(undefined);
    setConfirmed(undefined);
    setError(undefined);
    idempotencyKey.current = undefined;
  }, [initialCode]);
  useEffect(() => () => cancelNfc(), []);

  const resolve = async (): Promise<void> => {
    const raw = code.trim();
    if (raw === '' || busy !== undefined) return;
    setBusy('resolve');
    setError(undefined);
    setPrepared(undefined);
    setConfirmed(undefined);
    try {
      setResolved(await resolveNfcCode(raw));
    } catch (cause) {
      setResolved(undefined);
      setError(toAppError(cause));
    } finally {
      setBusy(undefined);
    }
  };

  const prepare = async (): Promise<void> => {
    if (busy !== undefined || resolved?.assignable !== true) return;
    const id = itemId(resolved);
    if (id === undefined) {
      setError(toAppError(new Error('WMS không trả item_id để gán NFC.')));
      return;
    }
    setBusy('prepare');
    setError(undefined);
    try {
      setPrepared(await prepareNfcAssignment(id));
    } catch (cause) {
      setError(toAppError(cause));
    } finally {
      setBusy(undefined);
    }
  };

  const writeAndConfirm = async (): Promise<void> => {
    const current = prepared;
    const id = current === undefined ? undefined : itemId(current);
    const payload = current?.nfc_payload;
    if (
      busy !== undefined || current === undefined || id === undefined ||
      payload === undefined || payload === null || payload === ''
    ) return;

    setBusy('write');
    setError(undefined);
    try {
      // Chỉ confirm WMS sau write + read-back native thành công.
      const tag = await writeNfcText(payload);
      idempotencyKey.current ??= createNfcConfirmationKey(id, tag.hardwareUid);
      setConfirmed(await confirmNfcAssignment(id, {
        hardwareUid: tag.hardwareUid,
        writtenPayload: tag.writtenPayload,
        reservationToken: current.reservation_token,
        idempotencyKey: idempotencyKey.current,
      }));
    } catch (cause) {
      setError(toAppError(cause));
    } finally {
      setBusy(undefined);
    }
  };

  const assignable = resolved?.assignable === true && itemId(resolved) !== undefined;
  const stepLabel = confirmed === undefined
    ? 'Bước ' + String(prepared === undefined ? 1 : 2) + '/3'
    : undefined;

  return (
    <Page
      title="Thẻ NFC"
      onBack={onBack}
      scroll
      headerVariant="brand"
      headerRight={
        stepLabel === undefined ? undefined : (
          <Text variant="caption" style={styles.headerStep}>{stepLabel}</Text>
        )
      }
    >
      {confirmed === undefined ? null : (
        <Box padding="xl" gap="md">
          <View style={[styles.nfcCircle, { backgroundColor: theme.colors.successSoft }]}>
            <AppIcon name="check-circle" color={theme.colors.success} size={42} />
          </View>
          <Text variant="screenTitle" tone="strong" style={styles.center}>
            Đã liên kết thẻ NFC
          </Text>
          <Text variant="caption" tone="muted" style={styles.center}>
            Thẻ đã được ghi, đọc lại và WMS xác nhận liên kết thành công.
          </Text>
        </Box>
      )}

      {confirmed !== undefined ? (
        <>
          <Box card padding="lg">
            <DefinitionRow label="UID thẻ NFC" value={confirmed.nfc?.hardware_uid} />
            <DefinitionRow label="Item / serial" value={itemLabel(confirmed)} />
            <DefinitionRow label="SKU" value={confirmed.item?.sku_code ?? confirmed.sku?.sku_code} />
            <DefinitionRow label="Trạng thái" value="Đã liên kết" last />
          </Box>
          <View style={styles.actions}>
            {onManageTags === undefined ? null : (
              <Button label="Danh sách thẻ NFC" onPress={onManageTags} />
            )}
            <Button label="Về Trang chủ" variant="secondary" onPress={onBack} />
          </View>
        </>
      ) : (
        <>
          <Box card padding="lg" gap="md">
            <View style={[styles.nfcCircle, { backgroundColor: theme.colors.primarySoft }]}>
              <AppIcon name="nfc" color={theme.colors.primary} size={42} />
            </View>
            <Text variant="cardTitle" tone="strong" style={styles.center}>
              {prepared === undefined ? 'Đọc thẻ NFC' : 'Xác minh liên kết'}
            </Text>
            <Text variant="caption" tone="muted" style={styles.center}>
              {prepared === undefined
                ? 'Quét QR/SKU của hiện vật để WMS kiểm tra có thể gán thẻ.'
                : 'Đặt thẻ NFC mới sát thiết bị. App chỉ xác nhận sau khi ghi và đọc lại thành công.'}
            </Text>

            {resolved !== undefined ? (
              <>
                <DefinitionRow label="Item / serial" value={itemLabel(resolved)} />
                <DefinitionRow label="SKU" value={resolved.item?.sku_code ?? resolved.sku?.sku_code} />
                <DefinitionRow label="Trạng thái NFC" value={resolved.nfc_status} last />
              </>
            ) : (
              <CodeInput
                label="QR / SKU / serial"
                placeholder="Quét bằng máy quét hoặc nhập mã"
                value={code}
                onChangeText={setCode}
                returnKeyType="done"
                onSubmitEditing={resolve}
              />
            )}
          </Box>

          {error === undefined ? null : (
            <Banner tone="danger" title="Chưa thể gán NFC" message={nfcUserMessage(error)} />
          )}

          {resolved === undefined ? (
            <View style={styles.actions}>
              {onScanCode === undefined ? null : (
                <Button label="Quét QR/SKU" variant="secondary" onPress={onScanCode} />
              )}
              <Button
                label="Nhận diện hiện vật"
                loading={busy === 'resolve'}
                disabled={code.trim() === '' || busy !== undefined}
                onPress={resolve}
              />
            </View>
          ) : prepared === undefined ? (
            assignable ? (
              <Button
                label="Xác minh liên kết"
                loading={busy === 'prepare'}
                disabled={busy !== undefined}
                onPress={prepare}
              />
            ) : (
              <Banner
                tone="warning"
                title="Chưa thể gán thẻ"
                message={
                  resolved.assign_block_code === undefined || resolved.assign_block_code === null
                    ? 'WMS không cho phép gán NFC cho hiện vật này.'
                    : 'Mã chặn: ' + resolved.assign_block_code
                }
              />
            )
          ) : (
            <>
              <Box card padding="lg">
                <DefinitionRow label="Giữ chỗ đến" value={prepared.expires_at} />
                <DefinitionRow label="Payload WMS" value={prepared.nfc_payload} last />
              </Box>
              <Banner
                tone="warning"
                title="Chạm thẻ để ghi"
                message="Không rời thẻ khỏi thiết bị cho tới khi app đọc lại và báo xác nhận thành công."
              />
              <Button
                label="Chạm thẻ NFC để ghi"
                loading={busy === 'write'}
                disabled={busy !== undefined}
                onPress={writeAndConfirm}
              />
            </>
          )}
        </>
      )}
    </Page>
  );
}
