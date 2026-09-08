/**
 * Nhập mã thủ công — **màn riêng**. Ảnh **15**.
 *
 * ## Khác gì bản modal ở ảnh 14
 *
 * | | Ảnh 14 — modal | Ảnh 15 — màn riêng |
 * |---|---|---|
 * | Bối cảnh | đè lên màn quét đang mở | màn độc lập |
 * | Trường | chỉ mã | mã **+ Ghi chú tuỳ chọn** |
 * | Nút | *Kiểm tra mã* / *Huỷ* | *Huỷ* / *Xác nhận* |
 *
 * Cả hai đều cần. Modal dùng khi thủ kho **đang quét dở** và gặp một mã máy
 * không đọc được — mở màn khác lúc đó là mất phiên quét. Màn riêng dùng khi họ
 * chủ động vào nhập tay, và lúc đó có chỗ ghi chú *vì sao* phải nhập tay —
 * thông tin đó có giá trị khi đối soát sau này.
 *
 * ## Ghi chú đi về đâu
 *
 * ⚠️ Hiện **chưa có endpoint nào nhận ghi chú của một mã lẻ**. Nó được trả về
 * cho bên gọi, và bên gọi quyết định dùng làm gì — luồng bảo hành đưa nó vào
 * mô tả yêu cầu. Không tự bịa ra một trường API để gửi.
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { CodeInput } from '../../ui/CodeInput';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Banner';
import { useTheme } from '../../theme/ThemeProvider';
import { parseScanPayload } from '../../scanner/scanPayload';

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
  },
  half: {
    flex: 1,
  },
});

export const MESSAGE_CODE_REQUIRED = 'Vui lòng nhập mã QR/Barcode.';

export interface ManualCodeResult {
  readonly rawCode: string;
  /** Ghi chú tuỳ chọn — vì sao phải nhập tay. */
  readonly note: string;
}

export interface ManualCodeScreenProps {
  title?: string;
  subtitle?: string;
  /** Câu giải thích riêng của từng luồng. */
  hint?: string;
  onCancel: () => void;
  onSubmit: (result: ManualCodeResult) => void;
  submitting?: boolean;
}

export function ManualCodeScreen({
  title = 'Nhập mã thủ công',
  subtitle = 'Quét mã',
  hint,
  onCancel,
  onSubmit,
  submitting = false,
}: ManualCodeScreenProps): React.ReactElement {
  const theme = useTheme();
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();

  const parsed = code.trim() === '' ? undefined : parseScanPayload(code.trim());

  return (
    <Page title={title} subtitle={subtitle} scroll>
      <Banner
        tone="info"
        icon={<Text>⌨</Text>}
        title="Mã nhập tay đi qua cùng bộ kiểm tra"
        message={
          hint ??
          'Mã gõ tay được chống trùng và đối chiếu với WMS y như mã quét bằng camera.'
        }
      />

      <Box card padding="lg" gap="lg">
        <CodeInput
          label="Mã QR/Barcode*"
          placeholder="VD: HN1|SKU=DCCS20083-2|ITEM=A-001"
          value={code}
          onChangeText={text => {
            setCode(text);
            setError(undefined);
          }}
          errorText={error}
          multiline
        />

        {/* Đọc thử ngay để người dùng thấy máy hiểu mã ra sao TRƯỚC khi xác
            nhận — gõ nhầm một ký tự trong chuỗi dài rất khó tự phát hiện. */}
        {parsed?.sku === undefined && parsed?.item === undefined ? null : (
          <Box gap="sm">
            <Text variant="caption" tone="muted">
              MÁY ĐỌC ĐƯỢC
            </Text>
            {parsed.sku === undefined ? null : (
              <Text variant="body" tone="strong">
                {'SKU: ' + parsed.sku}
              </Text>
            )}
            {parsed.item === undefined ? null : (
              <Text variant="caption" tone="muted">
                {'ITEM: ' + parsed.item}
              </Text>
            )}
          </Box>
        )}

        <Input
          label="Ghi chú"
          placeholder="VD: Tem mờ, máy quét không đọc được"
          value={note}
          onChangeText={setNote}
          multiline
        />
      </Box>

      <View style={[styles.actions, { gap: theme.spacing.md }]}>
        <Button
          label="Huỷ"
          variant="secondary"
          onPress={onCancel}
          disabled={submitting}
          style={styles.half}
        />
        <Button
          label="Xác nhận"
          loading={submitting}
          disabled={submitting}
          onPress={() => {
            const trimmed = code.trim();
            if (trimmed === '') {
              setError(MESSAGE_CODE_REQUIRED);
              return;
            }
            onSubmit({ rawCode: trimmed, note: note.trim() });
          }}
          style={styles.half}
        />
      </View>
    </Page>
  );
}
