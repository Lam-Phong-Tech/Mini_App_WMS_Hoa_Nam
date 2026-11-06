import {HN_UI} from '../../theme/uiKitV3';
import React from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Input } from '../../ui/Input';
import { AppIcon } from '../../ui/AppIcon';
import {ScannerIcon} from '../../ui/ScannerIcon';
import { P08Text as Text, P08Badge, P08ControlIcon } from './P08Presentation';

/** Shared read controls. The owner retains query, status and paging semantics. */
export function HistoryFilterBar({
  keyword,
  placeholder,
  searchLabel = 'Tìm hoạt động',
  onKeywordChange,
  onSubmit,
  submitLabel = 'Áp dụng tìm kiếm',
  onFilter,
  filterLabel = 'Bộ lọc ngày và trạng thái',
  filtered = false,
  tabs,
  dateLabel,
  dateButtonLabel,
  onDates,
  statusLabel,
  onStatus,
  onSort,
  total,
  loading = false,
  resultLabel,
  status,
  onReload,
  reloadLabel = 'Tải lại dữ liệu',
  onClear,
  meta,
  showSort = true,
}: {
  keyword: string;
  placeholder: string;
  searchLabel?: string;
  onKeywordChange(value: string): void;
  onSubmit?(): void;
  submitLabel?: string;
  onFilter(): void;
  filterLabel?: string;
  filtered?: boolean;
  tabs?: React.ReactNode;
  dateLabel: string;
  dateButtonLabel?: string;
  onDates(): void;
  /** Note-row compact selectors are opt-in; other owners retain their controls. */
  statusLabel?: string;
  onStatus?(): void;
  onSort?(): void;
  total?: number | null;
  loading?: boolean;
  resultLabel?: string;
  status?: React.ReactNode;
  onReload?(): void;
  reloadLabel?: string;
  onClear?(): void;
  meta?: React.ReactNode;
  showSort?: boolean;
}) {
  return (
    <View style={s.stack}>
      <View style={s.searchRow}>
        <Input
          fieldHeight={50}
          containerStyle={s.fill}
          accessibilityLabel={searchLabel}
          placeholder={placeholder}
          value={keyword}
          maxLength={200}
          quietFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          underlineColorAndroid="transparent"
          inputStyle={s.input}
          fieldStyle={s.field}
          onChangeText={onKeywordChange}
          onSubmitEditing={() => {
            Keyboard.dismiss();
            onSubmit?.();
          }}
          leftAdornment={
            onSubmit ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={submitLabel}
                onPress={onSubmit}
              >
                <P08ControlIcon name="search" size={24} />
              </Pressable>
            ) : (
              <P08ControlIcon name="search" size={24} />
            )
          }
          rightAdornment={
            keyword ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Xóa từ khóa"
                onPress={() => onKeywordChange('')}
              >
                <AppIcon name="close" color={HN_UI.textMuted} size={18} />
              </Pressable>
            ) : undefined
          }
        />
        <Pressable
          style={s.filter}
          accessibilityRole="button"
          accessibilityLabel={filterLabel}
          onPress={() => {
            Keyboard.dismiss();
            onFilter();
          }}
        >
          <ScannerIcon name="funnel" color={HN_UI.onBrand} size={25} />
          {filtered ? <View style={s.dot} /> : null}
        </Pressable>
      </View>
      {tabs}
      <View style={s.selectorRow}>
        <Pressable
          style={[s.date, s.fill, onStatus && s.compactDate]}
          accessibilityRole="button"
          accessibilityLabel={dateButtonLabel ?? `Ngày: ${dateLabel}`}
          onPress={() => {
            Keyboard.dismiss();
            onDates();
          }}
        >
          <AppIcon name="calendar" color={HN_UI.textMuted} size={onStatus ? 19 : 22} />
          <Text
            variant={onStatus ? 'caption' : 'body'}
            numberOfLines={1}
            style={s.fill}
          >
            {dateLabel}
          </Text>
          {!onStatus ? status : null}
          <P08ControlIcon name="down" color={HN_UI.textMuted} size={16} />
        </Pressable>
        {onStatus ? (
          <Pressable
            style={[s.date, s.fill, s.compactDate]}
            accessibilityRole="button"
            accessibilityLabel={`Trạng thái: ${
              statusLabel ?? 'Tất cả trạng thái'
            }`}
            onPress={() => {
              Keyboard.dismiss();
              onStatus();
            }}
          >
            <Text variant="caption" numberOfLines={1} style={s.fill}>
              {statusLabel ?? 'Tất cả trạng thái'}
            </Text>
            <P08ControlIcon name="down" color={HN_UI.textMuted} size={16} />
          </Pressable>
        ) : null}
        {showSort && onSort ? (
          <Pressable
            style={s.sort}
            accessibilityRole="button"
            accessibilityLabel="Sắp xếp: Mới nhất trước"
            onPress={() => {
              Keyboard.dismiss();
              onSort();
            }}
          >
            <P08ControlIcon name="sort" color={HN_UI.textPrimary} size={22} />
          </Pressable>
        ) : null}
      </View>
      <View style={s.metaRow}>
        {total != null ? (
          <P08Badge label={resultLabel ?? `${total} kết quả`} />
        ) : loading ? (
          <P08Badge label="Đang tải" />
        ) : (
          <View />
        )}
        <View style={s.actions}>
          {onClear && filtered ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Xóa bộ lọc"
              style={s.action}
              onPress={onClear}
            >
              <Text variant="caption">Xóa lọc</Text>
            </Pressable>
          ) : null}
          {onReload ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={reloadLabel}
              style={s.action}
              disabled={loading}
              onPress={onReload}
            >
              <Text variant="caption">{loading ? 'Đang tải…' : 'Tải lại'}</Text>
            </Pressable>
          ) : showSort && !onSort ? (
            <Text variant="caption" tone="muted">
              Mới nhất trước
            </Text>
          ) : null}
        </View>
      </View>
      {meta}
    </View>
  );
}
const s = StyleSheet.create({
  stack: { gap: 10 },
  fill: { flex: 1, minWidth: 0 },
  searchRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  input: { fontSize: 16, color: HN_UI.textPrimary },
  field: {
    backgroundColor: HN_UI.canvas,
    borderRadius: 10,
    borderColor: HN_UI.borderControl,
    paddingHorizontal: 12,
    gap: 10,
  },
  filter: {
    width: 54,
    height: 50,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HN_UI.primary,
    ...(Platform.OS === 'web'
      ? { backgroundImage: `linear-gradient(120deg,${HN_UI.primary},${HN_UI.primary})` }
      : {}),
  },
  dot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: HN_UI.surface,
  },
  date: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HN_UI.border,
    backgroundColor: HN_UI.canvas,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compactDate: {
    minHeight: 42,
    paddingHorizontal: 9,
    gap: 6,
    borderColor: HN_UI.border,
  },
  sort: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderColor: HN_UI.border,
    backgroundColor: HN_UI.canvas,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  action: { minHeight: 32, justifyContent: 'center' },
});
