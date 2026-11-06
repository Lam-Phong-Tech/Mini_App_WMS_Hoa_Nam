import {HN_UI} from '../../theme/uiKitV3';
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { Dialog } from '../../ui/Dialog';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { P08Text as Text, P08Badge } from './P08Presentation';
import { historyStatus } from './historyPresentation';
import { FilterChipRow } from '../../ui/FilterChipRow';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import type { P08Filters, P08Source } from '../../services/wms/p08Types';
import {
  p08CalendarDays,
  p08DateLabel,
  p08PickerBounds,
  p08QuickDate,
  p08ValidDate,
} from './p08Dates';

const sources = [
  { key: 'ALL', label: 'Tất cả nguồn' },
  { key: 'DOCUMENT', label: 'Chứng từ' },
  { key: 'WARRANTY', label: 'Bảo hành' },
  { key: 'NFC', label: 'NFC' },
  { key: 'SCAN', label: 'Phiên quét' },
];
const modes = [
  { key: 'ALL', label: 'Tất cả ngày' },
  { key: 'DATE', label: 'Một ngày' },
  { key: 'RANGE', label: 'Khoảng ngày' },
];
const styles = StyleSheet.create({
  body: { gap: 20 },
  section: { gap: 12 },
  footer: { gap: 10, paddingTop: 16, borderTopWidth: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldDisabled: { opacity: 0.6 },
  fill: { flex: 1 },
  centered: { textAlign: 'center' },
  disabledDay: { opacity: 1,backgroundColor:HN_UI.disabled,borderColor:HN_UI.border },
  todayBorder: { borderWidth: 1 },
  selectedText: { color: HN_UI.onBrand },
  rangeDates: { gap: 16 },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  month: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, padding: 2 },
  day: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
});
type DateField = 'date' | 'from' | 'to';
export function P08FilterDialog({
  visible,
  filters,
  timezone,
  onCancel,
  onApply,
  sourcesVisible = true,
  statusesVisible = true,
  section = 'all',
  statusOptions = [],
}: {
  visible: boolean;
  filters: P08Filters;
  timezone?: string;
  onCancel: () => void;
  onApply: (value: P08Filters) => void;
  sourcesVisible?: boolean;
  statusesVisible?: boolean;
  section?: 'all' | 'dates' | 'status';
  /** Observed source values only; free exact-status entry remains available. */
  statusOptions?: readonly string[];
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState(filters);
  const [date, setDate] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const [calendar, setCalendar] = useState<DateField>();
  const [month, setMonth] = useState('');
  const [error, setError] = useState<string>();
  const opened = useRef(false);
  let today: string | undefined;
  try {
    if (timezone) {
      const current = p08QuickDate(1, timezone);
      if (current.date_mode === 'DATE') today = current.date;
    }
  } catch {
    /* Invalid or unverified timezone fails closed for calendar shortcuts. */
  }
  useEffect(() => {
    if (!visible) {
      opened.current = false;
      return;
    }
    if (opened.current) return;
    opened.current = true;
    Keyboard.dismiss();
    setDraft(filters);
    setDate(filters.date_mode === 'DATE' ? filters.date : today || '');
    setFrom(filters.date_mode === 'RANGE' ? filters.from : today || '');
    setTo(filters.date_mode === 'RANGE' ? filters.to : today || '');
    setCalendar(undefined);
    setError(undefined);
  }, [visible, filters, today]);
  const close = () => (calendar ? setCalendar(undefined) : onCancel());
  const commit = () => {
    const dates =
      draft.date_mode === 'DATE'
        ? [date]
        : draft.date_mode === 'RANGE'
        ? [from, to]
        : [];
    if (
      dates.some(value => !p08ValidDate(value)) ||
      (draft.date_mode === 'RANGE' && from > to)
    ) {
      setError(
        'Từ ngày phải nhỏ hơn hoặc bằng Đến ngày. Hãy chọn đủ ngày hợp lệ.',
      );
      return;
    }
    if (
      dates.length &&
      (!today ||
        dates.some(
          value => value > today || value < p08PickerBounds(today!, 'date').min,
        ))
    ) {
      setError(
        today
          ? 'Ngày đã chọn nằm ngoài phạm vi cho phép.'
          : 'Chưa xác minh được ngày hiện tại của nguồn lịch sử.',
      );
      return;
    }
    onApply({
      source: draft.source,
      business: draft.business,
      keyword: draft.keyword,
      status: draft.status,
      ...(draft.date_mode === 'DATE'
        ? { date_mode: 'DATE', date }
        : draft.date_mode === 'RANGE'
        ? { date_mode: 'RANGE', from, to }
        : { date_mode: 'ALL' }),
    });
  };
  const quick = (days: 1 | 7 | 30 | 90) => {
    if (!timezone || !today) return;
    const selected = p08QuickDate(days, timezone);
    setDraft({
      source: draft.source,
      business: draft.business,
      keyword: draft.keyword,
      status: draft.status,
      ...selected,
    });
    if (selected.date_mode === 'DATE') setDate(selected.date);
    if (selected.date_mode === 'RANGE') {
      setFrom(selected.from);
      setTo(selected.to);
    }
    setError(undefined);
  };
  const reset = () => {
    if (section === 'status') {
      setDraft({ ...draft, status: undefined });
      setError(undefined);
      return;
    }
    if (!today) return;
    setDate(today);
    setFrom(today);
    setTo(today);
    setDraft({
      source: sourcesVisible && section === 'all' ? 'ALL' : draft.source,
      business: draft.business,
      keyword: draft.keyword,
      status: section === 'dates' ? draft.status : undefined,
      date_mode: 'RANGE',
      from: today,
      to: today,
    });
    setError(undefined);
  };
  const pick = (field: DateField) => {
    if (!today) return;
    const value = field === 'from' ? from : field === 'to' ? to : date;
    const bounds = p08PickerBounds(today, field, from, to);
    const selected =
      p08ValidDate(value) && value >= bounds.min && value <= bounds.max
        ? value
        : bounds.max;
    setMonth(selected.slice(0, 7));
    setCalendar(field);
    setError(undefined);
  };
  const field = (key: DateField, label: string, value: string) => (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Pressable
        hitSlop={2}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${p08DateLabel(value)}`}
        accessibilityState={{ disabled: !today }}
        disabled={!today}
        onPress={() => pick(key)}
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.divider,
          },
          !today && styles.fieldDisabled,
        ]}
      >
        <Text style={styles.fill}>{p08DateLabel(value)}</Text>
        <AppIcon name="calendar" color={theme.colors.primary} />
      </Pressable>
    </View>
  );
  const bounds =
    calendar && today ? p08PickerBounds(today, calendar, from, to) : undefined;
  const selected = calendar === 'from' ? from : calendar === 'to' ? to : date;
  const shiftMonth = (step: number) => {
    const at = new Date(month + '-01T00:00:00Z');
    at.setUTCMonth(at.getUTCMonth() + step);
    return at.toISOString().slice(0, 7);
  };
  return (
    <Dialog
      visible={visible}
      panelMaxWidth={428}
      titleStyle={{ fontSize: 22, lineHeight: 28 }}
      footer={
        <View style={styles.actions}>
          {calendar ? (
            <>
              <Button
                label="Hôm nay"
                disabled={!today}
                style={styles.action}
                onPress={() => {
                  if (today) setMonth(today.slice(0, 7));
                }}
              />
              <Button
                label="Quay lại"
                variant="secondary"
                style={styles.action}
                onPress={() => setCalendar(undefined)}
              />
            </>
          ) : (
            <>
              <Button
                label="Đặt lại"
                disabled={section !== 'status' && !today}
                style={styles.action}
                onPress={reset}
              />
              <Button
                label="Hủy"
                style={styles.action}
                variant="secondary"
                onPress={onCancel}
              />
              <Button label="Áp dụng" style={styles.action} onPress={commit} />
            </>
          )}
        </View>
      }
      title={
        calendar === 'from'
          ? 'Chọn ngày bắt đầu'
          : calendar === 'to'
          ? 'Chọn ngày kết thúc'
          : calendar
          ? 'Chọn ngày'
          : section === 'dates'
          ? 'Chọn thời gian'
          : section === 'status'
          ? 'Chọn trạng thái'
          : 'Bộ lọc lịch sử'
      }
      onDismiss={close}
      dismissOnBackdrop={false}
    >
      {calendar && bounds ? (
        <View style={styles.body}>
          <View style={styles.month}>
            <Button
              label="‹"
              accessibilityLabel="Tháng trước"
              variant="secondary"
              disabled={shiftMonth(-1) < bounds.min.slice(0, 7)}
              onPress={() => setMonth(shiftMonth(-1))}
            />
            <Text variant="cardTitle">
              Tháng {Number(month.slice(5))} / {month.slice(0, 4)}
            </Text>
            <Button
              label="›"
              accessibilityLabel="Tháng sau"
              variant="secondary"
              disabled={shiftMonth(1) > bounds.max.slice(0, 7)}
              onPress={() => setMonth(shiftMonth(1))}
            />
          </View>
          <View style={styles.grid}>
            {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(label => (
              <View style={styles.cell} key={label}>
                <Text variant="caption" tone="muted" style={styles.centered}>
                  {label}
                </Text>
              </View>
            ))}
            {p08CalendarDays(month).map((value, i) => {
              const disabled =
                !value || value < bounds.min || value > bounds.max;
              const active = value === selected;
              return (
                <View style={styles.cell} key={value || `blank-${i}`}>
                  {value ? (
                    <Pressable
                      hitSlop={2}
                      accessibilityRole="button"
                      accessibilityLabel={`Chọn ${p08DateLabel(value)}`}
                      accessibilityState={{ disabled, selected: active }}
                      disabled={disabled}
                      onPress={() => {
                        if (disabled) return;
                        if (calendar === 'from') setFrom(value);
                        else if (calendar === 'to') setTo(value);
                        else setDate(value);
                        setError(undefined);
                        setCalendar(undefined);
                      }}
                      style={[
                        styles.day,
                        {
                          backgroundColor: active
                            ? theme.colors.primary
                            : theme.colors.primarySoft,
                          borderColor: theme.colors.primary,
                        },
                        disabled && styles.disabledDay,
                        value === today && styles.todayBorder,
                      ]}
                    >
                      <Text
                        style={[
                          { color: theme.colors.primaryStrong },
                          active && styles.selectedText,
                          disabled && {color:HN_UI.disabledForeground},
                        ]}
                      >
                        {Number(value.slice(-2))}
                      </Text>
                    </Pressable>
                  ) : (
                    <View style={styles.day} />
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={styles.body}>
          {sourcesVisible && section === 'all' ? (
            <View style={styles.section}>
              <Text variant="cardTitle">Nguồn hoạt động</Text>
              <FilterChipRow
                variant="history-wrap"
                chips={sources}
                activeKey={draft.source || 'ALL'}
                onSelect={source => {
                  setDraft({
                    ...draft,
                    source: source as P08Source | 'ALL',
                    status: undefined,
                  });
                  setError(undefined);
                }}
              />
            </View>
          ) : null}
          {section !== 'status' ? (
            <View style={styles.section}>
              <Text variant="cardTitle">Khoảng thời gian</Text>
              <FilterChipRow
                variant="history"
                chips={modes}
                activeKey={draft.date_mode}
                onSelect={mode => {
                  setDraft({
                    source: draft.source,
                    business: draft.business,
                    keyword: draft.keyword,
                    status: draft.status,
                    ...(mode === 'DATE'
                      ? { date_mode: 'DATE', date }
                      : mode === 'RANGE'
                      ? { date_mode: 'RANGE', from, to }
                      : { date_mode: 'ALL' }),
                  });
                  setError(undefined);
                }}
              />
              <View style={styles.shortcuts}>
                {([1, 7, 30, 90] as const).map(days => (
                  <Button
                    key={days}
                    label={days === 1 ? 'Hôm nay' : `${days} ngày`}
                    variant="secondary"
                    style={styles.action}
                    disabled={!today}
                    onPress={() => quick(days)}
                  />
                ))}
              </View>
              {draft.date_mode === 'DATE' ? field('date', 'Ngày', date) : null}
              {draft.date_mode === 'RANGE' ? (
                <View style={styles.rangeDates}>
                  {field('from', 'Từ ngày', from)}
                  {field('to', 'Đến ngày', to)}
                </View>
              ) : null}
            </View>
          ) : null}
          {statusesVisible && section !== 'dates' ? (
            <View style={styles.section}>
              <Text variant="cardTitle">Trạng thái</Text>
              {[...new Set(['', ...statusOptions, draft.status ?? ''])].map(
                value => (
                  <Pressable
                    key={value || 'ALL'}
                    accessibilityRole="radio"
                    accessibilityLabel={
                      value
                        ? `Lọc trạng thái: ${historyStatus(value)}`
                        : 'Tất cả trạng thái'
                    }
                    accessibilityState={{
                      checked: (draft.status ?? '') === value,
                    }}
                    onPress={() => {
                      setDraft({ ...draft, status: value || undefined });
                      setError(undefined);
                    }}
                    style={[
                      styles.field,
                      {
                        borderColor:
                          (draft.status ?? '') === value
                            ? theme.colors.primary
                            : theme.colors.divider,
                        backgroundColor:
                          (draft.status ?? '') === value
                            ? theme.colors.primarySoft
                            : theme.colors.surface,
                      },
                    ]}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        borderWidth: 2,
                        borderColor:
                          (draft.status ?? '') === value
                            ? theme.colors.primary
                            : theme.colors.textMuted,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {(draft.status ?? '') === value ? (
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: theme.colors.primary,
                          }}
                        />
                      ) : null}
                    </View>
                    {value ? (
                      <P08Badge label={historyStatus(value)} />
                    ) : (
                      <Text>Tất cả trạng thái</Text>
                    )}
                  </Pressable>
                ),
              )}
              <Input
                label="Trạng thái chính xác của nguồn"
                placeholder="Tất cả trạng thái"
                value={draft.status || ''}
                maxLength={100}
                autoCorrect={false}
                autoCapitalize="none"
                onChangeText={status => {
                  setDraft({ ...draft, status });
                  setError(undefined);
                }}
              />
            </View>
          ) : null}
          {error ? (
            <Text tone="danger" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </View>
      )}
    </Dialog>
  );
}
