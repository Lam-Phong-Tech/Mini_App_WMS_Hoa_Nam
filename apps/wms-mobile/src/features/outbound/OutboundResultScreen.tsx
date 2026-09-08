/**
 * Xuất kho — bước 4: kết quả.
 *
 * 🎨 Nguồn: ảnh **34, 35**.
 *
 * ⚠️ Tiêu đề là **"Đã gửi duyệt phiếu xuất"**, không phải "Xuất kho thành công".
 * Ảnh 34 ghi đúng như vậy, và trạng thái trong bảng là *"Chờ duyệt xuất kho"*.
 * Hàng **chưa rời kho** ở mốc này — nói khác đi là thủ kho tưởng đã giao xong.
 *
 * 🔒 Như luồng nhập, bước ghi đang bị `GATE_WMS §2d` chặn nên màn này còn nhận
 * `queued`.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Banner';
import { Stepper } from '../../ui/Stepper';
import { DefinitionRow } from '../../ui/DefinitionRow';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import {
  MESSAGE_NOT_ISSUED_BODY,
  MESSAGE_NOT_ISSUED_TITLE,
  OUTBOUND_STEPS,
} from './outboundDraft';

const styles = StyleSheet.create({
  circle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontSize: 30,
  },
  center: {
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  half: {
    flex: 1,
  },
});

export interface OutboundResultScreenProps {
  documentName: string;
  documentRef: string;
  recipientName: string;
  quantity: number;
  outcome: 'posted' | 'queued';
  queuedReason?: string;
  onHome: () => void;
  onNext: () => void;
}

export function OutboundResultScreen({
  documentName,
  documentRef,
  recipientName,
  quantity,
  outcome,
  queuedReason,
  onHome,
  onNext,
}: OutboundResultScreenProps): React.ReactElement {
  const theme = useTheme();
  const queued = outcome === 'queued';

  return (
    <Page title="Kết quả xuất kho" subtitle="Đã ghi nhận mã" scroll>
      <Stepper steps={OUTBOUND_STEPS} current={3} />

      <Box card padding="xl" gap="md">
        <View
          style={[
            styles.circle,
            {
              backgroundColor: queued
                ? theme.colors.warningSoft
                : theme.colors.successSoft,
            },
          ]}
        >
          <AppIcon
            name={queued ? 'clock' : 'check-circle'}
            size={30}
            color={queued ? theme.colors.warning : theme.colors.success}
          />
        </View>

        <Text variant="screenTitle" tone="strong" style={styles.center}>
          {queued
            ? 'Đã lưu vào hàng đợi trên máy'
            : 'Đã gửi duyệt phiếu xuất'}
        </Text>
        <Text variant="caption" tone="muted" style={styles.center}>
          {queued
            ? 'Phiếu chưa gửi được lên WMS. Mã đã quét vẫn còn nguyên trên máy.'
            : 'Phiếu đã được lưu trên backend và chuyển sang chờ duyệt/Post Issue.'}
        </Text>
      </Box>

      <Box card padding="lg">
        <DefinitionRow
          label="Tên phiếu"
          value={documentName === '' ? 'Phiếu xuất' : documentName}
        />
        <DefinitionRow label="Mã phiếu" value={documentRef} />
        <DefinitionRow label="Người nhận" value={recipientName} />
        <DefinitionRow
          label="Số lượng"
          value={String(quantity) + ' sản phẩm'}
        />
        <DefinitionRow
          label="Trạng thái"
          // "Chờ duyệt xuất kho" — hàng CHƯA rời kho. Xem chú thích đầu tệp.
          value={queued ? 'Chờ gửi lên WMS' : 'Chờ duyệt xuất kho'}
          last
        />
      </Box>

      {queued && queuedReason !== undefined ? (
        <Banner
          tone="warning"
          icon={<AppIcon name="clock" color={theme.colors.warningText} />}
          title="Chưa gửi được lên WMS"
          message={queuedReason}
        />
      ) : null}

      <Banner
        tone="warning"
        title={MESSAGE_NOT_ISSUED_TITLE}
        message={MESSAGE_NOT_ISSUED_BODY}
      />

      <View style={[styles.row, { gap: theme.spacing.md }]}>
        <Button
          label="Trang chủ"
          variant="secondary"
          onPress={onHome}
          style={styles.half}
        />
        <Button label="Xuất kho tiếp" onPress={onNext} style={styles.half} />
      </View>
    </Page>
  );
}
