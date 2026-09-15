/**
 * Nhập kho — bước 1: tạo phiếu.
 *
 * 🎨 Nguồn: ảnh **18**.
 *
 * Bố cục theo đúng thứ tự trong ảnh:
 * 1. `Stepper` 4 bước, đang ở bước 1
 * 2. Banner **info**: *"Luồng nhập theo mã quét thực tế"*
 * 3. Thẻ *"Tạo phiếu nhập mới"* + ô **Tên phiếu\***
 * 4. Banner **cam**: *"Chưa tăng tồn ở bước quét"*
 * 5. Nút *TIẾP TỤC QUÉT* — **disabled** khi ô tên còn trống
 *
 * ⚠️ Nút disabled ở đây là **có chủ đích và khác màn Đăng nhập**: ảnh 02 cho
 * thấy nút Đăng nhập luôn bấm được (bấm mới hiện lỗi), còn ảnh 18 cho thấy nút
 * này mờ. Giữ đúng từng màn thay vì "thống nhất cho gọn" — bộ ảnh là chuẩn.
 *
 * Kho nhận vẫn được lấy ngầm từ WMS và chọn kho active đầu tiên, đúng source
 * Mini App; nó không có trường chọn trên giao diện.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Banner } from '../../ui/Banner';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import {
  canContinueToScan,
  setDraftName,
  setDraftWarehouse,
  type InboundDraft,
} from './inboundDraft';
import { useWarehouses, warehouseLabel } from './useWarehouses';

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headBody: {
    flex: 1,
  },
  headerStep: { color: '#ffffff', fontWeight: '600' },
});

export interface InboundCreateScreenProps {
  draft: InboundDraft;
  onChange: (draft: InboundDraft) => void;
  onContinue: () => void;
  onBack?: () => void;
  /** Tiêm để test không cần mạng. */
  warehouses?: ReturnType<typeof useWarehouses>;
}

export function InboundCreateScreen({
  draft,
  onChange,
  onContinue,
  onBack,
  warehouses,
}: InboundCreateScreenProps): React.ReactElement {
  const theme = useTheme();
  // Gọi hook vô điều kiện — quy tắc hook. Bản tiêm chỉ ghi đè kết quả.
  const loaded = useWarehouses();
  const warehouseState = warehouses ?? loaded;
  const [pausedNoticeOpen, setPausedNoticeOpen] = useState(false);

  // Mini App lấy kho đang hoạt động rồi tự chọn kho đầu tiên trong nền. Màn
  // không hiển thị bộ chọn kho; giữ nguyên vậy để số thao tác và bố cục trùng
  // bản gốc, nhưng vẫn không thể tạo phiếu thiếu `dst_warehouse_id`.
  useEffect(() => {
    const first = warehouseState.warehouses[0];
    if (draft.warehouseId === undefined && first !== undefined) {
      onChange(setDraftWarehouse(draft, first.id, warehouseLabel(first)));
    }
  }, [draft, onChange, warehouseState.warehouses]);

  useEffect(() => {
    if (warehouseState.phase === 'ready' && warehouseState.warehouses.length === 0) {
      setPausedNoticeOpen(true);
    }
  }, [warehouseState.phase, warehouseState.warehouses.length]);

  return (
    <Page
      title="Nhập kho"
      onBack={onBack}
      scroll
      headerVariant="brand"
      headerRight={<Text variant="caption" style={styles.headerStep}>Bước 1/3</Text>}
    >

      <Box card padding="lg" gap="lg">
        <View style={[styles.head, { gap: theme.spacing.md }]}>
          <View
            style={[
              styles.headIcon,
              {
                borderRadius: theme.radius.control,
                backgroundColor: theme.colors.primarySoft,
              },
            ]}
          >
            <AppIcon name="package-plus" color={theme.colors.primaryStrong} />
          </View>
          <View style={styles.headBody}>
            <Text variant="cardTitle" tone="strong">
              Thông tin phiếu nhập
            </Text>
            <Text variant="caption" tone="muted">
              Kiểm tra kho nhận và tạo phiên trước khi quét mã hàng
            </Text>
          </View>
        </View>

        <Input
          label="Tên phiếu*"
          placeholder="VD: Nhập lô hàng sáng"
          value={draft.name}
          onChangeText={text => onChange(setDraftName(draft, text))}
          errorText={draft.nameError}
          returnKeyType="next"
          leftAdornment={<AppIcon name="document" color={theme.colors.primary} size={18} />}
        />

      </Box>

      <Banner
        tone="warning"
        icon={<AppIcon name="clock" color={theme.colors.warningText} />}
        title="Chưa tăng tồn ở bước quét"
        message="Scan chỉ lưu danh sách mã tạm. Khi bấm Ghi nhận nhập, app tạo phiếu WMS, ghi scan evidence và chuyển sang chờ duyệt."
      />

      <Button
        label="Bắt đầu quét hàng"
        onPress={onContinue}
        disabled={!canContinueToScan(draft)}
      />

      <Dialog
        visible={pausedNoticeOpen}
        dismissible={false}
        title="Kho tạm dừng"
        message="Các thao tác trong kho đang tạm dừng. Vui lòng liên hệ quản trị viên."
        onDismiss={() => setPausedNoticeOpen(false)}
      >
        <Button label="Đã hiểu" onPress={() => setPausedNoticeOpen(false)} />
      </Dialog>
    </Page>
  );
}
