/**
 * Xuất kho — bước 1: thông tin phiếu.
 *
 * 🎨 Nguồn: ảnh **25, 26, 27**.
 *
 * Ba ảnh này là **một màn ở ba trạng thái**, không phải ba màn:
 * 25 = đầu form · 26 = cuộn xuống phần địa chỉ · 27 = sau khi bấm mà thiếu trường.
 *
 * Hai hành vi bám sát ảnh:
 *
 * 1. **Lỗi hiện CẢ HAI tầng** (ảnh 27): banner đỏ tổng ở đầu thẻ **và** câu lỗi
 *    dưới từng ô. Chỉ có banner thì người dùng phải tự dò xem ô nào thiếu; chỉ
 *    có lỗi từng ô thì trên form dài họ không thấy vì ô lỗi nằm ngoài màn hình.
 * 2. **Phường/Xã khoá cho tới khi chọn tỉnh** (ảnh 26), và placeholder đổi thành
 *    *"Chọn tỉnh/thành trước"* — khoá mà nói rõ lý do.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Badge } from '../../ui/Badge';
import { Banner } from '../../ui/Banner';
import { Select } from '../../ui/Select';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import {
  MESSAGE_FORM_INVALID_BODY,
  MESSAGE_FORM_INVALID_TITLE,
  changeProvince,
  isWardEnabled,
  updateForm,
  type OutboundDraft,
  MAX_OUTBOUND_QUANTITY,
  RECIPIENT_GROUPS,
  sanitisePhone,
} from './outboundDraft';
import { useWarehouses } from '../inbound/useWarehouses';
import { useProvinces, useWards } from '../../services/geo/useGeo';
import type { GeoState } from '../../services/geo/useGeo';

/** Bốn nhóm đối tượng, dựng sẵn một lần — danh sách cố định, không đổi. */
const RECIPIENT_GROUP_OPTIONS = RECIPIENT_GROUPS.map(group => ({
  value: group.value,
  label: group.label,
}));

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headBody: {
    flex: 1,
  },
  groupLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  readonlyField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  readonlyCopy: { flex: 1 },
  headerStep: { color: '#ffffff', fontWeight: '600' },
});

export interface OutboundCreateScreenProps {
  draft: OutboundDraft;
  onChange: (draft: OutboundDraft) => void;
  onBack?: () => void;
  onStart: () => void;
  /** Tiêm để test không cần mạng. */
  warehouses?: ReturnType<typeof useWarehouses>;
  provinceState?: GeoState;
  wardState?: GeoState;
}

export function OutboundCreateScreen({
  draft,
  onChange,
  onBack,
  onStart,
  warehouses,
  provinceState,
  wardState,
}: OutboundCreateScreenProps): React.ReactElement {
  const theme = useTheme();
  const { form, fieldErrors } = draft;

  // Hook gọi vô điều kiện — quy tắc hook. Bản tiêm chỉ ghi đè kết quả.
  const loadedWarehouses = useWarehouses();
  const loadedProvinces = useProvinces();
  const loadedWards = useWards(form.province);
  const warehouseState = warehouses ?? loadedWarehouses;
  const provinces = provinceState ?? loadedProvinces;
  const wards = wardState ?? loadedWards;
  const [pausedNoticeOpen, setPausedNoticeOpen] = useState(false);

  const provinceOptions = useMemo(
    () => provinces.items.map(unit => ({ value: unit.code, label: unit.name })),
    [provinces.items],
  );
  const wardOptions = useMemo(
    () => wards.items.map(unit => ({ value: unit.code, label: unit.name })),
    [wards.items],
  );
  const selectedWarehouse = warehouseState.warehouses.find(
    warehouse => warehouse.id === form.warehouseId,
  );

  // Kho xuất KHÔNG hiện trên form (mô tả 2026-09-06) nhưng bắt buộc hợp lệ.
  // Chọn sẵn kho đầu tiên, giống luồng nhập và giống Mini App đang chạy.
  useEffect(() => {
    const first = warehouseState.warehouses[0];
    if (form.warehouseId === undefined && first !== undefined) {
      onChange(updateForm(draft, { warehouseId: first.id }));
    }
  }, [draft, form.warehouseId, onChange, warehouseState.warehouses]);

  useEffect(() => {
    if (warehouseState.phase === 'ready' && warehouseState.warehouses.length === 0) {
      setPausedNoticeOpen(true);
    }
  }, [warehouseState.phase, warehouseState.warehouses.length]);

  return (
    <Page
      title="Xuất kho"
      onBack={onBack}
      scroll
      headerVariant="brand"
      headerRight={
        <Text variant="caption" style={styles.headerStep}>
          Bước 1/3
        </Text>
      }
    >
      <Box card padding="lg" gap="lg">
        <View style={[styles.head, { gap: theme.spacing.md }]}>
          <View style={styles.headBody}>
            <Text variant="caption" tone="muted" style={styles.groupLabel}>
              Thông tin xuất kho
            </Text>
            <Text variant="cardTitle" tone="strong">
              Thông tin phiếu xuất
            </Text>
            <Text variant="caption" tone="muted">
              Kiểm tra và nhập thông tin giao hàng trước khi soạn
            </Text>
          </View>
          <Badge label="Tạo mới" uppercase tone="warning" />
        </View>

        {draft.showFormError ? (
          <Banner
            tone="danger"
            icon={<AppIcon name="alert" color={theme.colors.dangerText} />}
            title={MESSAGE_FORM_INVALID_TITLE}
            message={MESSAGE_FORM_INVALID_BODY}
          />
        ) : null}

        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="caption" tone="muted">Kho xuất</Text>
          <View
            style={[
              styles.readonlyField,
              {
                minHeight: theme.field.height,
                paddingHorizontal: theme.field.paddingX,
                gap: theme.spacing.sm,
                borderRadius: theme.field.radius,
                borderColor: theme.field.border,
                backgroundColor: theme.field.disabledBackground,
              },
            ]}
          >
            <AppIcon name="box" color={theme.colors.primary} size={18} />
            <View style={styles.readonlyCopy}>
              <Text variant="body" tone="strong">
                {selectedWarehouse?.name ?? 'Đang lấy kho xuất…'}
              </Text>
            </View>
            <AppIcon name="shield-check" color={theme.colors.textMuted} size={16} />
          </View>
        </View>

        {fieldErrors.warehouseId === undefined ? null : (
          <Banner
            tone="danger"
            icon={<AppIcon name="alert" color={theme.colors.dangerText} />}
            title="Chưa có kho xuất"
            message={fieldErrors.warehouseId}
          >
            <Button
              label="Thử lại"
              variant="secondary"
              onPress={warehouseState.reload}
            />
          </Banner>
        )}

        {provinces.stale || wards.stale ? (
          <Banner
            tone="warning"
            icon={<AppIcon name="clock" color={theme.colors.warningText} />}
            title="Danh mục địa chỉ đang dùng bản đã lưu"
            message="Không gọi được dịch vụ danh mục hành chính nên app dùng bản lưu trên máy. Kiểm tra lại tỉnh/phường trước khi tạo phiếu."
          />
        ) : null}

        <Input
          label="Tên phiếu / ghi nhớ"
          placeholder="Ví dụ: Xuất hàng chiều nay"
          value={form.name}
          onChangeText={text => onChange(updateForm(draft, { name: text }))}
          returnKeyType="next"
          leftAdornment={<AppIcon name="document" color={theme.colors.primary} size={18} />}
        />

        <Select
          label="Nhóm đối tượng xuất*"
          placeholder="Chọn nhóm đối tượng"
          value={form.recipientGroup}
          options={RECIPIENT_GROUP_OPTIONS}
          errorText={fieldErrors.recipientGroup}
          onChange={value =>
            onChange(updateForm(draft, { recipientGroup: value }))
          }
        />

        <Input
          label="Tên người nhận / đơn vị*"
          placeholder="Ví dụ: Đại lý Minh Anh"
          value={form.recipientName}
          onChangeText={text =>
            onChange(updateForm(draft, { recipientName: text }))
          }
          errorText={fieldErrors.recipientName}
          returnKeyType="next"
          leftAdornment={<AppIcon name="user" color={theme.colors.primary} size={18} />}
        />

        <Input
          label="Số điện thoại*"
          placeholder="Ví dụ: 0901234567"
          value={form.phone}
          // Lọc ký tự lạ NGAY lúc gõ: người dùng hay dán số có dấu chấm hoặc
          // khoảng trắng, và thấy kết quả ngay thì dễ hiểu hơn một câu lỗi ở
          // cuối form về thứ mình tưởng đã nhập đúng.
          onChangeText={text =>
            onChange(updateForm(draft, { phone: sanitisePhone(text) }))
          }
          errorText={fieldErrors.phone}
          keyboardType="phone-pad"
          maxLength={10}
          returnKeyType="next"
          leftAdornment={<AppIcon name="user" color={theme.colors.primary} size={18} />}
        />

        <Select
          label="Tỉnh/Thành phố*"
          placeholder="Chọn tỉnh/thành phố"
          disabledPlaceholder={
            provinces.phase === 'loading'
              ? 'Đang tải danh mục…'
              : 'Không tải được danh mục tỉnh/thành'
          }
          disabled={provinces.phase !== 'ready'}
          value={form.province}
          options={provinceOptions}
          errorText={fieldErrors.province ?? provinces.error?.message}
          onChange={value =>
            onChange(
              changeProvince(
                draft,
                value,
                provinceOptions.find(option => option.value === value)?.label,
              ),
            )
          }
          sheetTitle="Chọn tỉnh/thành phố"
        />

        <Select
          label="Phường/Xã*"
          placeholder="Chọn phường/xã"
          // Khoá mà nói rõ lý do — ba lý do khác nhau, ba câu khác nhau. Một
          // câu chung chung sẽ khiến người dùng bấm mãi ô đang tải.
          disabledPlaceholder={
            !isWardEnabled(form)
              ? 'Chọn tỉnh/thành trước'
              : wards.phase === 'loading'
                ? 'Đang tải phường/xã…'
                : 'Không tải được phường/xã'
          }
          disabled={!isWardEnabled(form) || wards.phase !== 'ready'}
          value={form.ward}
          options={wardOptions}
          errorText={fieldErrors.ward ?? wards.error?.message}
          onChange={value =>
            onChange(
              updateForm(draft, {
                ward: value,
                wardName: wardOptions.find(option => option.value === value)
                  ?.label,
              }),
            )
          }
          sheetTitle="Chọn phường/xã"
        />

        <Input
          label="Địa chỉ chi tiết"
          placeholder="Số nhà, tên đường, ghi chú địa chỉ"
          value={form.address}
          onChangeText={text => onChange(updateForm(draft, { address: text }))}
          returnKeyType="next"
          leftAdornment={<AppIcon name="document" color={theme.colors.primary} size={18} />}
        />

        <Input
          label="Số lượng cần quét*"
          placeholder={'1 – ' + String(MAX_OUTBOUND_QUANTITY)}
          value={form.quantity}
          onChangeText={text => onChange(updateForm(draft, { quantity: text }))}
          errorText={fieldErrors.quantity}
          keyboardType="number-pad"
          returnKeyType="next"
          leftAdornment={<AppIcon name="box" color={theme.colors.primary} size={18} />}
        />

        <Input
          label="Ghi chú"
          placeholder="Thông tin cần lưu ý khi xuất"
          value={form.note}
          onChangeText={text => onChange(updateForm(draft, { note: text }))}
          returnKeyType="go"
          onSubmitEditing={onStart}
          leftAdornment={<AppIcon name="document" color={theme.colors.primary} size={18} />}
        />

        <Button label="Bắt đầu soạn hàng" onPress={onStart} />
      </Box>

      <Banner
        tone="warning"
        icon={<AppIcon name="clock" color={theme.colors.warningText} />}
        title="Kiểm tra đúng phiếu trước khi quét"
        message="Tạo phiếu xuất trước, sau đó scanner sẽ quét liên tục theo số lượng đã nhập."
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
