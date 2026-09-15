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
import { DefinitionRow } from '../../ui/DefinitionRow';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import {
  MESSAGE_NOT_ISSUED_BODY,
  MESSAGE_NOT_ISSUED_TITLE,
} from './outboundDraft';
import type { OutboundResultOutcome } from './OutboundFlow';

const styles = StyleSheet.create({
  circle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    textAlign: 'center',
  },
  actionStack: {
    gap: 8,
  },
});

export interface OutboundResultScreenProps {
  documentName: string;
  documentRef: string;
  recipientName: string;
  quantity: number;
  outcome: OutboundResultOutcome;
  queuedReason?: string;
  onHome: () => void;
  onNext: () => void;
  onViewDocument?: () => void;
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
  onViewDocument,
}: OutboundResultScreenProps): React.ReactElement {
  const theme = useTheme();
  const posted = outcome === 'posted';
  const resultCopy = {
    queued: {
      title: 'Đã lưu vào hàng đợi trên máy',
      body: 'Phiếu chưa gửi được lên WMS. Mã đã quét vẫn còn nguyên trên máy.',
      status: 'Chờ gửi lên WMS',
      icon: 'clock' as const,
      tone: theme.colors.warning,
      bannerTitle: 'Chưa gửi được lên WMS',
    },
    failed: {
      title: 'Gửi phiếu thất bại',
      body: 'WMS đã từ chối phiếu. Sửa lỗi được nêu rồi gửi lại từ hàng đợi.',
      status: 'Gửi thất bại',
      icon: 'alert' as const,
      tone: theme.colors.danger,
      bannerTitle: 'WMS từ chối phiếu',
    },
    conflict: {
      title: 'Phiếu bị xung đột dữ liệu',
      body: 'Dữ liệu trên WMS đã thay đổi. Không tự ghi đè; cần đối chiếu trước khi gửi lại.',
      status: 'Xung đột — cần đối chiếu',
      icon: 'alert' as const,
      tone: theme.colors.danger,
      bannerTitle: 'Cần đối chiếu trên WMS',
    },
    unknown: {
      title: 'Chưa xác định kết quả gửi',
      body: 'Không thể biết máy chủ đã ghi nhận hay chưa. Không gửi lại tự động.',
      status: 'Chưa xác định máy chủ',
      icon: 'clock' as const,
      tone: theme.colors.warning,
      bannerTitle: 'Chưa xác định kết quả',
    },
  }[outcome === 'posted' ? 'queued' : outcome];

  return (
    <Page title="Xuất kho" scroll headerVariant="brand" backgroundColor="#ffffff">
      <Box padding="xl" gap="md">
        <View
          style={[
            styles.circle,
            {
              backgroundColor: posted
                ? theme.colors.successSoft
                : outcome === 'failed' || outcome === 'conflict'
                  ? theme.colors.dangerSoft
                  : theme.colors.warningSoft,
            },
          ]}
        >
          <AppIcon
            name={posted ? 'check-circle' : resultCopy.icon}
            size={30}
            color={posted ? theme.colors.success : resultCopy.tone}
          />
        </View>

        <Text variant="screenTitle" tone="strong" style={styles.center}>
          {posted ? 'Đã gửi duyệt phiếu xuất' : resultCopy.title}
        </Text>
        <Text variant="caption" tone="muted" style={styles.center}>
          {posted
            ? 'Phiếu đã được lưu trên backend và chuyển sang chờ duyệt/Post Issue.'
            : resultCopy.body}
        </Text>
      </Box>

      <Box card padding="lg">
        <DefinitionRow
          label="Tên phiếu"
          value={documentName === '' ? 'Phiếu xuất' : documentName}
        />
        <DefinitionRow label="Mã phiếu" value={documentRef} />
        <DefinitionRow label="Kho xuất" value="Kho đã chọn" />
        <DefinitionRow label="Người nhận" value={recipientName} />
        <DefinitionRow label="Số lượng đã soạn" value={String(quantity) + '/' + String(quantity)} />
        <DefinitionRow
          label="Thời gian gửi"
          value={posted ? 'Đã gửi duyệt' : 'Chưa xác định'}
        />
        <DefinitionRow
          label="Trạng thái"
          // "Chờ duyệt xuất kho" — hàng CHƯA rời kho. Xem chú thích đầu tệp.
          value={posted ? 'Chờ duyệt xuất kho' : resultCopy.status}
          last
        />
      </Box>

      {!posted && queuedReason !== undefined ? (
        <Banner
          tone={outcome === 'failed' || outcome === 'conflict' ? 'danger' : 'warning'}
          icon={<AppIcon name="clock" color={theme.colors.warningText} />}
          title={resultCopy.bannerTitle}
          message={queuedReason}
        />
      ) : null}

      {posted ? (
        <Banner
          tone="warning"
          title={MESSAGE_NOT_ISSUED_TITLE}
          message={MESSAGE_NOT_ISSUED_BODY}
        />
      ) : null}

      <View style={styles.actionStack}>
        {posted && onViewDocument !== undefined ? (
          <Button label="Xem chứng từ" onPress={onViewDocument} />
        ) : null}
        <Button label="Về Trang chủ" variant="secondary" onPress={onHome} />
        <Button label="Xuất kho tiếp" variant="secondary" onPress={onNext} />
      </View>
    </Page>
  );
}
