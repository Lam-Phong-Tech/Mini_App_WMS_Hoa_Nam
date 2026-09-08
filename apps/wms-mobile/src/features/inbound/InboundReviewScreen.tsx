/**
 * Nhập kho — bước 3: kiểm tra trước khi ghi nhận. Mã màn **IN-04**.
 *
 * 🎨 Nguồn: ảnh **20, 21, 22**.
 *
 * ## Một màn, hai nguồn dữ liệu
 *
 * Bộ ảnh cho thấy cùng tiêu đề *"Xác nhận hàng nhập"* và cùng nhãn `IN-04` ở hai
 * hoàn cảnh khác nhau:
 *
 * | Ảnh | Nguồn | Dấu hiệu nhận biết |
 * |:--:|---|---|
 * | 20 | **Phiếu nháp cục bộ** | mã `local-e61804b9-…`, 0 mã, nút ghi nhận mờ |
 * | 21, 22 | **Phiếu thật từ WMS** | mã `PN-COV-P00060`, banner xanh *"Phiếu đã phê duyệt"*, nút *Đã ghi nhận* **mờ** + *Quay lại lịch sử* |
 *
 * ⇒ Không tách thành hai màn. Cùng khuôn, khác dữ liệu và khác hành động cuối.
 *
 * Bấm *Ghi nhận nhập* sẽ đưa phiếu vào hàng đợi trước, rồi gửi `inbound/record`
 * với khoá idempotency ổn định. Nếu không gửi được, phiếu vẫn nằm lại để người
 * dùng đối chiếu/gửi lại, không mất danh sách mã vừa quét.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Banner } from '../../ui/Banner';
import { Stepper } from '../../ui/Stepper';
import { StatCard } from '../../ui/StatCard';
import { AppIcon } from '../../ui/AppIcon';
import { SwipeToDelete } from '../../ui/SwipeToDelete';
import { useTheme } from '../../theme/ThemeProvider';
import {
  INBOUND_STEPS,
  MESSAGE_NO_CODE_BODY,
  MESSAGE_NO_CODE_TITLE,
  MESSAGE_POST_ONLY_BODY,
  MESSAGE_POST_ONLY_TITLE,
  canRecord,
  groupBySku,
  totals,
  type InboundDraft,
} from './inboundDraft';

const styles = StyleSheet.create({
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardHeadBody: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupIconLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export interface InboundReviewScreenProps {
  draft: InboundDraft;
  /** Xoá mã mới nhất của SKU. Phiếu đã ghi nhận thì không truyền callback. */
  onRemoveNewestSku?: (sku: string | undefined) => void;
  /** Mã hiển thị ở đầu thẻ. Phiếu nháp dùng `local-…`, phiếu thật dùng `doc_no`. */
  documentRef: string;
  /** Đã ghi nhận lên WMS chưa. `true` ⇒ hiện banner xanh và khoá nút (ảnh 21, 22). */
  recorded?: boolean;
  recording?: boolean;
  onRecord: () => void;
  onBackToScan?: () => void;
  onBackToHistory?: () => void;
}

export function InboundReviewScreen({
  draft,
  onRemoveNewestSku,
  documentRef,
  recorded = false,
  recording = false,
  onRecord,
  onBackToScan,
  onBackToHistory,
}: InboundReviewScreenProps): React.ReactElement {
  const theme = useTheme();
  const summary = totals(draft);
  const groups = groupBySku(draft.codes);
  const empty = !canRecord(draft);

  return (
    <Page
      title="Xác nhận hàng nhập"
      subtitle="IN-04"
      onBack={recorded ? onBackToHistory : onBackToScan}
      scroll
    >
      <Stepper steps={INBOUND_STEPS} current={2} />

      <Box card padding="lg" gap="md">
        <View style={[styles.cardHead, { gap: theme.spacing.md }]}>
          <View style={styles.cardHeadBody}>
            <Text variant="caption" tone="muted">
              {documentRef}
            </Text>
            <Text variant="cardTitle" tone="strong">
              {draft.name}
            </Text>
            <Text variant="caption" tone="muted">
              {draft.warehouseName ?? 'Kho nhận theo phiếu WMS'}
            </Text>
          </View>
          <Badge
            label={String(summary.totalScanned) + ' mã'}
            tone={empty ? 'warning' : 'primary'}
          />
        </View>

        <View style={[styles.row, { gap: theme.spacing.md }]}>
          <StatCard
            label="Tổng đã quét"
            uppercaseLabel
            tone="primary"
            value={String(summary.totalScanned)}
          />
          <StatCard
            label="Số SKU"
            uppercaseLabel
            tone="success"
            value={String(summary.skuCount)}
          />
        </View>
      </Box>

      {recorded ? (
        <Banner
          tone="success"
          icon={<AppIcon name="check-circle" color={theme.colors.success} />}
          title="Phiếu đã phê duyệt"
          message="Phiếu nhập đã được Post Receipt và cập nhật tồn kho."
        />
      ) : (
        <>
          {empty ? (
            <Banner
              tone="warning"
              icon={<AppIcon name="clock" color={theme.colors.warningText} />}
              title={MESSAGE_NO_CODE_TITLE}
              message={MESSAGE_NO_CODE_BODY}
            />
          ) : null}
          <Banner
            tone="info"
            icon={<AppIcon name="shield-check" color={theme.colors.infoText} />}
            title={MESSAGE_POST_ONLY_TITLE}
            message={MESSAGE_POST_ONLY_BODY}
          />
        </>
      )}

      <View style={styles.sectionHead}>
        <Text variant="cardTitle" tone="strong">
          SKU đã quét
        </Text>
        <Text variant="caption" tone="muted">
          {recorded || onRemoveNewestSku === undefined
            ? 'Tổng ' + String(summary.totalScanned) + ' sản phẩm'
            : 'Vuốt trái để xoá'}
        </Text>
      </View>

      {groups.length === 0 ? (
        <Box card padding="lg">
          <Text variant="caption" tone="muted">
            Chưa có sản phẩm nào trong phiếu.
          </Text>
        </Box>
      ) : (
        groups.map(group => {
          const skuName = group.codes.find(
            code => code.skuName !== undefined,
          )?.skuName;
          const manualCodeCount = group.codes.filter(
            code => code.source === 'MANUAL',
          ).length;
          const groupQuantity = group.codes.reduce(
            (total, code) => total + code.quantity,
            0,
          );
          const componentBoxCount = group.codes.filter(
            code => code.boxNumber !== undefined,
          ).length;
          const itemType = group.codes.find(
            code => code.itemType !== undefined,
          )?.itemType;
          const card = (
            <Box card padding="lg" gap="sm">
              <View style={[styles.groupHead, { gap: theme.spacing.sm }]}>
                <View style={[styles.groupIconLabel, { gap: theme.spacing.sm }]}>
                  <AppIcon name="check-circle" color={theme.colors.success} />
                  <Text variant="caption" tone="muted">
                    SKU
                  </Text>
                </View>
                <Badge label={'SL: ' + String(groupQuantity)} tone="primary" />
              </View>
              <Text variant="cardTitle" tone="strong">
                {/* Mã không mang SKU vẫn phải hiện — nuốt đi là giấu mất hàng. */}
                {group.sku ?? 'Không đọc được SKU'}
              </Text>
              {skuName === undefined ? null : (
                <Text variant="caption" tone="muted">
                  {skuName}
                </Text>
              )}
              <View style={styles.groupHead}>
                <Text variant="caption" tone="muted">
                  {componentBoxCount > 0
                    ? String(componentBoxCount) + ' hộp linh kiện'
                    : manualCodeCount > 0
                      ? String(manualCodeCount) + ' mã nhập tay'
                      : 'Camera'}
                </Text>
                <Text variant="caption" tone="muted">
                  {itemType === 'COMPONENT'
                    ? 'Linh kiện'
                    : itemType === 'PRODUCT'
                      ? 'Sản phẩm'
                      : String(group.codes.length) + ' mã'}
                </Text>
              </View>
              {recorded || onRemoveNewestSku === undefined ? null : (
                <Text variant="caption" tone="muted">
                  {'Mã mới nhất: ' +
                    (group.codes.at(-1)?.item ?? group.codes.at(-1)?.raw ?? '')}
                </Text>
              )}
            </Box>
          );

          // Phiếu đã ghi nhận thì dữ liệu thuộc về WMS — không vuốt xoá được nữa.
          if (recorded || onRemoveNewestSku === undefined) {
            return <View key={group.sku ?? '(không có SKU)'}>{card}</View>;
          }

          return (
            <SwipeToDelete
              key={group.sku ?? '(không có SKU)'}
              accessibilityLabel={
                'SKU ' +
                (group.sku ?? 'không đọc được') +
                ', ' +
                String(group.codes.length) +
                ' mã'
              }
              deleteLabel="Xoá 1"
              onDelete={() => onRemoveNewestSku(group.sku)}
            >
              {card}
            </SwipeToDelete>
          );
        })
      )}

      {recorded ? (
        <>
          <Button label="Đã ghi nhận" onPress={() => undefined} disabled />
          {onBackToHistory === undefined ? null : (
            <Button
              label="Quay lại lịch sử"
              variant="secondary"
              onPress={onBackToHistory}
            />
          )}
        </>
      ) : (
        <>
          <Button
            label="Ghi nhận nhập"
            onPress={onRecord}
            loading={recording}
            disabled={empty || recording}
          />
          {onBackToScan === undefined ? null : (
            <Button
              label="Quay lại quét"
              variant="secondary"
              onPress={onBackToScan}
            />
          )}
        </>
      )}
    </Page>
  );
}
