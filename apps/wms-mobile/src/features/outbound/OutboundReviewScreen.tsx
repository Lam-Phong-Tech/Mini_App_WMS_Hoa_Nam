/**
 * Xuất kho — bước 3: kiểm tra trước khi ghi nhận. Mã màn **OUT-RECORD / OUT-04**.
 *
 * 🎨 Nguồn: ảnh **29, 30** (phiếu nháp, chưa đủ mã) và **31, 32, 33** (phiếu
 * thật đã post). Như luồng nhập, đây là **một màn hai nguồn dữ liệu**.
 *
 * ## Card dòng viền đứt nét — ảnh 30
 *
 * Dòng chưa quét hiện *"Dòng #1 · Chờ quét mã"* trong card **viền đứt nét**, khác
 * hẳn card đã quét (viền liền, có badge xanh). Giữ đúng: viền đứt là quy ước thị
 * giác cho *"chỗ này còn trống"*, thủ kho liếc là biết còn thiếu bao nhiêu dòng.
 *
 * ## Trường trống hiện `—`
 *
 * Ảnh 31 có hàng *SĐT* trống hiện dấu gạch. `DefinitionRow` đã lo việc này —
 * ẩn hàng đi sẽ khiến thủ kho tưởng phiếu không có trường đó.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { SwipeToDelete } from '../../ui/SwipeToDelete';
import { Banner } from '../../ui/Banner';
import { DefinitionRow } from '../../ui/DefinitionRow';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import {
  MESSAGE_NOT_DEDUCTED_BODY,
  MESSAGE_NOT_DEDUCTED_TITLE,
  MESSAGE_NOT_ENOUGH_BODY,
  MESSAGE_NOT_ENOUGH_TITLE,
  canRecordOutbound,
  outboundProgress,
  rejectedCodes,
  recipientGroupLabel,
  type OutboundDraft,
} from './outboundDraft';

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headBody: {
    flex: 1,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  /** Viền đứt nét cho dòng chưa quét — ảnh 30. */
  pendingLine: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
  },
  metricRow: {
    flexDirection: 'row',
    borderWidth: 1,
  },
  metric: { flex: 1 },
  metricDivider: { borderLeftWidth: 1 },
  metricBox: { overflow: 'hidden' },
  headerStep: { color: '#ffffff', fontWeight: '600' },
});

export interface OutboundReviewScreenProps {
  draft: OutboundDraft;
  /**
   * Xoá **một** mã đã quét. Bỏ trống ⇒ không cho vuốt xoá (dùng khi xem phiếu
   * đã ghi nhận — lúc đó dữ liệu thuộc về WMS).
   *
   * 🔧 Thêm 2026-09-06. Mô tả luồng xuất của người dùng ghi rõ:
   * *"Hiện chưa có nút xóa riêng từng mã tại màn kiểm tra… Vì vậy yêu cầu 'có
   * thể xóa từng mã' hiện chưa đạt."* Không có nó thì thủ kho quét nhầm một
   * kiện phải **huỷ cả phiên** và quét lại từ đầu — với phiếu 200 mã thì đó là
   * lý do người ta bỏ app đi dùng giấy.
   */
  onRemoveCode?: (key: string) => void;
  documentRef: string;
  /** Đã post lên WMS chưa. `true` ⇒ ảnh 31–33. */
  posted?: boolean;
  recording?: boolean;
  onRecord: () => void;
  onBackToScan?: () => void;
  onNewSession?: () => void;
  /** Gán thẻ cho chính mã QR/SKU vừa được WMS resolve trong phiên xuất. */
  onAssignNfc?: (rawCode: string) => void;
}

export function OutboundReviewScreen({
  draft,
  onRemoveCode,
  documentRef,
  posted = false,
  recording = false,
  onRecord,
  onBackToScan,
  onNewSession,
  onAssignNfc,
}: OutboundReviewScreenProps): React.ReactElement {
  const theme = useTheme();
  const rejected = rejectedCodes(draft);
  const progress = outboundProgress(draft);
  const ready = canRecordOutbound(draft);

  /** Số dòng còn chờ quét — chỉ để vẽ card viền đứt nét (ảnh 30). */
  const pendingLines = Math.max(0, progress.target - progress.scanned);

  return (
    <Page
      title="Xuất kho"
      onBack={onBackToScan}
      scroll
      headerVariant="brand"
      headerRight={
        posted ? undefined : (
          <Text variant="caption" style={styles.headerStep}>
            Bước 3/3
          </Text>
        )
      }
    >
      <Box card padding="lg" gap="md">
        <View style={[styles.head, { gap: theme.spacing.md }]}>
          <View style={styles.headBody}>
            <Text variant="cardTitle" tone="strong">
              Kiểm tra phiếu xuất
            </Text>
            <Text variant="caption" tone="muted">
              Xem lại thông tin, số lượng và danh sách sản phẩm trước khi gửi duyệt.
            </Text>
          </View>
          <Badge label={posted ? 'Đã gửi' : progress.label} tone={posted || ready ? 'success' : 'warning'} />
        </View>
        <DefinitionRow label="Mã phiếu" value={documentRef} />
        <DefinitionRow label="Kho xuất" value="Kho đã chọn" />
        <DefinitionRow label="Người nhận" value={draft.form.recipientName} />
        <DefinitionRow label="Số điện thoại" value={draft.form.phone} />
        <DefinitionRow
          label="Địa chỉ giao"
          value={[draft.form.address, draft.form.wardName, draft.form.provinceName]
            .filter(Boolean)
            .join(', ')}
        />
        <DefinitionRow
          label="Nhóm hàng"
          value={recipientGroupLabel(draft.form.recipientGroup)}
          last
        />
      </Box>

      <View
        style={[
          styles.metricRow,
          {
            borderColor: theme.colors.divider,
            borderRadius: theme.radius.card,
            backgroundColor: theme.colors.surface,
          },
          styles.metricBox,
        ]}
      >
        <View style={[styles.metric, { padding: theme.spacing.lg, gap: theme.spacing.xs }]}>
          <Text variant="caption" tone="muted">Số lượng yêu cầu</Text>
          <Text variant="metric" tone="strong">{String(progress.target)}</Text>
          <Text variant="caption" tone="muted">sản phẩm</Text>
        </View>
        <View
          style={[
            styles.metric,
            styles.metricDivider,
            {
              padding: theme.spacing.lg,
              gap: theme.spacing.xs,
              borderLeftColor: theme.colors.divider,
            },
          ]}
        >
          <Text variant="caption" tone="muted">Số lượng đã soạn</Text>
          <Text variant="metric" style={{ color: ready ? theme.colors.success : theme.colors.primary }}>
            {String(progress.scanned)}
          </Text>
          <Text variant="caption" tone="muted">sản phẩm</Text>
        </View>
      </View>

      {posted ? (
        <Banner
          tone="warning"
          icon={<AppIcon name="clock" color={theme.colors.warningText} />}
          title="Phiếu xuất đang chờ duyệt"
          message="Hàng xuất đã được ghi nhận lên WMS và chờ Post Issue. Tồn kho chưa giảm cho đến khi duyệt/Post Issue thành công."
        />
      ) : (
        <>
          {ready ? null : (
            <Banner
              tone="warning"
              icon={<AppIcon name="clock" color={theme.colors.warningText} />}
              title={MESSAGE_NOT_ENOUGH_TITLE}
              message={MESSAGE_NOT_ENOUGH_BODY}
            />
          )}
          <Banner
            tone="info"
            icon={<AppIcon name="shield-check" color={theme.colors.infoText} />}
            title={MESSAGE_NOT_DEDUCTED_TITLE}
            message={MESSAGE_NOT_DEDUCTED_BODY}
          />
        </>
      )}

      <View style={styles.sectionHead}>
        <Text variant="cardTitle" tone="strong">
          Danh sách sản phẩm
        </Text>
        <Text variant="caption" tone="muted">
          {posted || onRemoveCode === undefined
            ? progress.label + ' mã đã resolve'
            : 'Vuốt trái để xoá'}
        </Text>
      </View>

      {rejected.length === 0 ? null : (
        <Banner
          tone="danger"
          icon={<AppIcon name="alert" color={theme.colors.dangerText} />}
          title={'Có ' + String(rejected.length) + ' mã không xuất được'}
          message="Những mã này sẽ KHÔNG được gửi lên phiếu. Vuốt trái để gỡ ra, hoặc quét bù cho đủ số lượng."
        />
      )}

      {draft.codes.map((code, index) => {
        // Nhãn phải nói ĐÚNG trạng thái. Gắn "Đã quét" cho một mã WMS đã từ
        // chối là nói dối ở đúng chỗ thủ kho dựa vào để quyết định ghi nhận.
        const badge =
          code.status === 'rejected'
            ? { label: 'Không xuất được', tone: 'danger' as const }
            : code.status === 'checking'
              ? { label: 'Đang kiểm tra', tone: 'warning' as const }
              : { label: 'Đã kiểm tra', tone: 'success' as const };

        const card = (
          <Box card padding="lg" gap="sm">
            <View style={styles.rowHead}>
              <Text variant="caption" tone="muted">
                {'Dòng #' + String(index + 1)}
              </Text>
              <Badge label={badge.label} tone={badge.tone} />
            </View>
            <Text variant="body" tone="strong">
              {code.skuName ?? code.item ?? code.raw}
            </Text>
            {code.sku === undefined ? null : (
              <Text variant="caption" tone="muted">
                {code.sku}
              </Text>
            )}
            {code.reason === undefined ? null : (
              // Lý do đi kèm ngay dưới mã, không gom vào một banner chung: thủ
              // kho cần biết KIỆN NÀO hỏng, không phải "có gì đó hỏng".
              <Text variant="caption" style={{ color: theme.colors.dangerText }}>
                {code.reason}
              </Text>
            )}
            {posted || code.status === 'rejected' || onAssignNfc === undefined ? null : (
              <Button
                label="Gán NFC cho hiện vật này"
                variant="secondary"
                onPress={() => onAssignNfc(code.raw)}
              />
            )}
          </Box>
        );

        // Phiếu đã ghi nhận thì dữ liệu thuộc về WMS — không sửa từ máy nữa.
        if (posted || onRemoveCode === undefined) {
          return <View key={code.key}>{card}</View>;
        }

        return (
          <SwipeToDelete
            key={code.key}
            accessibilityLabel={
              'Dòng ' + String(index + 1) + ', mã ' + (code.item ?? code.raw)
            }
            onDelete={() => onRemoveCode(code.key)}
          >
            {card}
          </SwipeToDelete>
        );
      })}

      {/* Dòng còn trống — viền đứt nét như ảnh 30. */}
      {Array.from({ length: pendingLines }, (_, offset) => (
        <View
          key={'pending-' + String(offset)}
          style={[
            styles.pendingLine,
            {
              borderColor: theme.colors.divider,
              padding: theme.spacing.lg,
              gap: theme.spacing.sm,
            },
          ]}
        >
          <Text variant="caption" tone="muted">
            {'Dòng #' + String(draft.codes.length + offset + 1)}
          </Text>
          <Text variant="body" tone="muted">
            Chờ quét mã
          </Text>
        </View>
      ))}

      {posted ? (
        onNewSession === undefined ? null : (
          <Button label="Tạo phiên xuất mới" onPress={onNewSession} />
        )
      ) : (
        <>
          <Button
            label="Gửi duyệt"
            onPress={onRecord}
            loading={recording}
            disabled={!ready || recording}
          />
          {onBackToScan === undefined ? null : (
            <Button
              label="Quay lại soạn hàng"
              variant="secondary"
              onPress={onBackToScan}
            />
          )}
        </>
      )}
    </Page>
  );
}
