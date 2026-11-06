import { HN_UI } from '../../theme/uiKitV3';
import { ScannerNativeText as Text } from '../../ui/ScannerNativeText';
// S01 presentation only. Source metadata is immutable; no SAVE/API policy here.
// Measurements/palette: ScannerHNApp/docs/flows/outbound/outbound.mjs/style.css.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { P04Icon } from '../inbound/P04Icon';
import type { Snapshot } from './linked/types';
import { P05TextMeasure } from './P05TextMeasure';
const styles = StyleSheet.create({
  content: { gap: 0 },
  field: { marginHorizontal: 3, marginBottom: 14 },
  label: {
    color: HN_UI.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  required: { color: HN_UI.danger },
  control: {
    minHeight: 48,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: HN_UI.borderControl,
    borderRadius: 8,
    backgroundColor: HN_UI.canvas,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  select: {
    backgroundColor: HN_UI.canvas,
    borderColor: HN_UI.borderControl,
    borderRadius: 10,
    minHeight: 48,
  },
  valueArea: { flex: 1, minWidth: 0 },
  value: {
    color: HN_UI.textPrimary,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  placeholder: { color: HN_UI.textMuted, fontWeight: '400' },
  hint: { fontSize: 12, lineHeight: 18, color: HN_UI.textMuted, marginTop: 5 },
  reader: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  readerText: {
    color: HN_UI.textLink,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
});
export function P05SourceField({
  label,
  value,
  icon = 'document',
  required = false,
  empty = false,
  onPress,
  disabled = false,
  onRead,
  locked = true,
  accessibilityLabel,
  trailingIcon,
}: {
  label: string;
  value: string;
  icon?: string;
  required?: boolean;
  empty?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  onRead?: (label: string, value: string) => void;
  locked?: boolean;
  accessibilityLabel?: string;
  trailingIcon?: string;
}) {
  const [truncated, setTruncated] = useState(false);
  const body = (
    <>
      <P04Icon name={icon} color={HN_UI.textLink} size={24} />
      <View style={styles.valueArea}>
        <Text
          selectable={!onPress}
          numberOfLines={2}
          style={[styles.value, empty && styles.placeholder]}
        >
          {value}
        </Text>
        <P05TextMeasure
          value={value}
          style={styles.value}
          onTruncated={setTruncated}
        />
      </View>
      {(onPress || locked) && (
        <P04Icon
          name={onPress ? trailingIcon ?? 'chevron-right' : 'lock'}
          color={HN_UI.textSecondary}
          size={17}
        />
      )}
    </>
  );
  return (
    <View testID={`p05-field-${label}`} style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      {onPress ? (
        <Pressable
          testID="p05-source-select"
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? 'Chọn phiếu nguồn'}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onPress}
          style={[styles.control, styles.select]}
        >
          {body}
        </Pressable>
      ) : (
        <View style={styles.control} accessibilityLabel={`${label}: ${value}`}>
          {body}
        </View>
      )}
      {truncated && onRead && !empty && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Xem đầy đủ ${label}`}
          onPress={() => onRead(label, value)}
          style={styles.reader}
        >
          <Text style={styles.readerText}>Xem đầy đủ</Text>
        </Pressable>
      )}
    </View>
  );
}
export function P05Information({
  state,
  locked,
  onChoose,
  onRead,
  onLegacy,
  hasLegacy = false,
}: {
  state: Snapshot;
  locked: boolean;
  onChoose: () => void;
  onRead: (label: string, value: string) => void;
  onLegacy: () => void;
  hasLegacy?: boolean;
}) {
  const d = state.document,
    selected = !!state.source;
  const warehouse =
    d?.warehouseName ??
    state.context?.available_warehouses.find(
      w => w.warehouse_id === state.context?.active_warehouse_id,
    )?.name;
  const value = (v: unknown) =>
    !selected
      ? 'Chưa chọn nguồn'
      : v === '' || v == null
      ? 'Chưa có trên phiếu nguồn'
      : String(v);
  return (
    <View testID="p05-information-form" style={styles.content}>
      <P05SourceField
        label="Kho xuất"
        icon="house"
        value={warehouse ?? 'Chưa xác minh'}
        empty={!warehouse}
        onRead={onRead}
      />
      <P05SourceField
        label="Mã phiếu"
        locked={false}
        icon="document"
        required
        value={state.source?.doc_no ?? 'Chọn phiếu nguồn'}
        empty={!selected}
        onPress={onChoose}
        disabled={
          locked ||
          !state.context?.permissions.save ||
          !state.context?.permissions.record
        }
        onRead={onRead}
      />
      <View style={styles.field}>
        <Text accessibilityLiveRegion="polite" style={styles.hint}>
          {state.busy && !state.source
            ? 'Đang xác minh phiên/kho…'
            : selected
            ? 'Phiếu nguồn đã chọn'
            : 'Chọn phiếu nguồn để xem thông tin giao hàng.'}
        </Text>
        {hasLegacy && !selected && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thông tin bản nháp trước"
            onPress={onLegacy}
            style={styles.reader}
          >
            <Text style={styles.readerText}>Bản nháp trước vẫn được giữ</Text>
          </Pressable>
        )}
      </View>
      <P05SourceField
        label="Người nhận"
        locked={false}
        icon="user"
        value={value(d?.recipient)}
        empty={!selected}
        onRead={onRead}
      />
      <P05SourceField
        label="Số điện thoại"
        locked={false}
        icon="phone"
        value={value(d?.phone)}
        empty={!selected}
        onRead={onRead}
      />
      <P05SourceField
        label="Địa chỉ giao"
        locked={false}
        icon="pin"
        value={value(d?.address)}
        empty={!selected}
        onRead={onRead}
      />
      <P05SourceField
        label="Số lượng cần soạn"
        locked={false}
        icon="box"
        value={value(d?.planned)}
        empty={!selected}
        onRead={onRead}
      />
      <P05SourceField
        label="Nhóm hàng"
        locked={false}
        icon="tag"
        value={value(d?.group)}
        empty={!selected}
        onRead={onRead}
      />
      <P05SourceField
        label="Ghi chú"
        locked={false}
        icon="document"
        value={value(d?.note)}
        empty={!selected}
        onRead={onRead}
      />
    </View>
  );
}
