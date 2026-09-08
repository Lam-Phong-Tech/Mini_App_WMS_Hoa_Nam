/**
 * Nhập kho — bước 4: kết quả.
 *
 * 🎨 Nguồn: ảnh **23, 24**.
 *
 * Bố cục: vòng tròn ✓ xanh → bảng tóm tắt 4 hàng → banner *"Chưa tăng tồn kho"*
 * → hai nút *TRANG CHỦ* / *NHẬP KHO TIẾP*.
 *
 * ⚠️ Trạng thái trong bảng là **"Chờ duyệt nhập kho"**, không phải "Hoàn tất".
 * Ảnh 23 ghi đúng như vậy, và banner ở ảnh 24 giải thích vì sao: phiếu mới chỉ
 * được tạo, tồn kho chưa tăng. Đổi chữ này thành "Hoàn tất" là nói dối thủ kho
 * rằng hàng đã vào kho.
 *
 * 🔒 Vì bước ghi đang bị `GATE_WMS §2d` chặn, màn này còn nhận `queued` — trạng
 * thái *"đã đưa vào hàng đợi trên máy, chưa gửi được lên WMS"*. Đó là sự thật
 * hiện tại và phải nói ra, không được hiện màn thành công giả.
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
  INBOUND_STEPS,
  MESSAGE_NOT_POSTED_BODY,
  MESSAGE_NOT_POSTED_TITLE,
} from './inboundDraft';

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

export interface InboundResultScreenProps {
  documentName: string;
  documentRef: string;
  quantity: number;
  outcome: InboundResultOutcome;
  /** Phản hồi chi tiết của WMS hoặc lý do hàng đợi chưa gửi được. */
  reason?: string;
  onHome: () => void;
  onNext: () => void;
}

/**
 * Kết quả của đúng thao tác "Gửi duyệt".
 *
 * Không gộp mọi lỗi thành `queued`: `failed` nghĩa là WMS đã trả lời từ chối
 * phiếu, còn `reconcile` nghĩa là request có thể đã tới máy chủ và phải kiểm
 * tra trước khi gửi lại. Hai trạng thái này dẫn tới hành động nghiệp vụ khác
 * hẳn nhau.
 */
export type InboundResultOutcome =
  | 'posted'
  | 'queued'
  | 'failed'
  | 'reconcile';

export function InboundResultScreen({
  documentName,
  documentRef,
  quantity,
  outcome,
  reason,
  onHome,
  onNext,
}: InboundResultScreenProps): React.ReactElement {
  const theme = useTheme();
  const presentation = {
    posted: {
      circle: theme.colors.successSoft,
      color: theme.colors.success,
      icon: 'check-circle' as const,
      title: 'Đã gửi duyệt phiếu nhập',
      body: 'Phiếu đã được lưu trên backend và chuyển sang chờ duyệt.',
      status: 'Chờ duyệt nhập kho',
      bannerTone: 'success' as const,
      bannerTitle: undefined,
    },
    queued: {
      circle: theme.colors.warningSoft,
      color: theme.colors.warning,
      icon: 'clock' as const,
      title: 'Đã lưu vào hàng đợi trên máy',
      body: 'Phiếu chưa gửi được lên WMS. Dữ liệu đã quét vẫn còn nguyên trên máy.',
      status: 'Chờ gửi lên WMS',
      bannerTone: 'warning' as const,
      bannerTitle: 'Chưa gửi được lên WMS',
    },
    failed: {
      circle: theme.colors.dangerSoft,
      color: theme.colors.danger,
      icon: 'alert' as const,
      title: 'WMS từ chối phiếu nhập',
      body: 'Phiếu chưa được tạo trên WMS. Sửa dữ liệu theo lý do bên dưới trước khi gửi lại.',
      status: 'Bị từ chối — chưa tạo phiếu',
      bannerTone: 'danger' as const,
      bannerTitle: 'Phản hồi từ WMS',
    },
    reconcile: {
      circle: theme.colors.warningSoft,
      color: theme.colors.warning,
      icon: 'alert' as const,
      title: 'Cần đối chiếu phiếu trên WMS',
      body: 'Request đã rời ứng dụng nhưng chưa xác định WMS đã ghi nhận hay chưa.',
      status: 'Cần đối chiếu trước khi gửi lại',
      bannerTone: 'warning' as const,
      bannerTitle: 'Kết quả chưa xác định',
    },
  }[outcome];

  return (
    <Page title="Kết quả gửi duyệt nhập" subtitle="IN-04" scroll>
      <Stepper steps={INBOUND_STEPS} current={3} />

      <Box card padding="xl" gap="md">
        <View
          style={[
            styles.circle,
            {
              backgroundColor: presentation.circle,
            },
          ]}
        >
          <AppIcon
            name={presentation.icon}
            size={30}
            color={presentation.color}
          />
        </View>

        <Text variant="screenTitle" tone="strong" style={styles.center}>
          {presentation.title}
        </Text>
        <Text variant="caption" tone="muted" style={styles.center}>
          {presentation.body}
        </Text>
      </Box>

      <Box card padding="lg">
        <DefinitionRow label="Tên phiếu" value={documentName} />
        <DefinitionRow label="Mã phiếu" value={documentRef} />
        <DefinitionRow
          label="Số lượng"
          value={String(quantity) + ' sản phẩm'}
        />
        <DefinitionRow
          label="Trạng thái"
          value={presentation.status}
          last
        />
      </Box>

      {reason !== undefined && outcome !== 'posted' ? (
        <Banner
          tone={presentation.bannerTone}
          icon={<AppIcon name={presentation.icon} color={presentation.color} />}
          title={presentation.bannerTitle}
          message={reason}
        />
      ) : null}

      <Banner
        tone="info"
        title={MESSAGE_NOT_POSTED_TITLE}
        message={MESSAGE_NOT_POSTED_BODY}
      />

      <View style={[styles.row, { gap: theme.spacing.md }]}>
        <Button
          label="Trang chủ"
          variant="secondary"
          onPress={onHome}
          style={styles.half}
        />
        <Button label="Nhập kho tiếp" onPress={onNext} style={styles.half} />
      </View>
    </Page>
  );
}
