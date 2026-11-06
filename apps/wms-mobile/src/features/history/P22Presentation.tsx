import {HN_UI} from '../../theme/uiKitV3';
import React, { useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type TextStyle,
  type StyleProp,
} from 'react-native';
import { Text } from '../../ui/Text';
import {SCANNER_COLORS} from '../../ui/ScannerPalette';
import { HnHomeIcon, type HnHomeIconName } from '../../ui/HnHomeIcon';
import { HN_OPERATIONS } from '../../ui/hnHomeTokens';
import { historyStatus } from './historyPresentation';

export function P22IconTile({
  name = 'nfc',
  large = false,
}: {
  name?: HnHomeIconName;
  large?: boolean;
}) {
  // Sessions palette is locked in UI_STANDARD; native shared tokens do not yet
  // export it. Keep the scoped port here until the parent unifies that token.
  const tone =
    name === 'nfc'
      ? HN_OPERATIONS.nfc
      : name === 'tool'
      ? HN_OPERATIONS.warranty
      : name === 'scan'
      ? { ink: HN_UI.textSecondary, soft: HN_UI.canvas }
      : HN_OPERATIONS.documents;
  return (
    <View
      style={[
        p22.iconTile,
        large && p22.iconLarge,
        { backgroundColor: tone.soft },
      ]}
    >
      <HnHomeIcon
        name={name}
        size={large ? 30 : 26}
        strokeWidth={2}
        color={tone.ink}
      />
    </View>
  );
}

export function P22Outcome({ status }: { status: string | null }) {
  // Result comes only from original owner projection, never action/tag status.
  const kind =
    status === 'SUCCESS' || status === 'SUCCEEDED'
      ? 'success'
      : ['FAILED', 'ERROR', 'REJECTED'].includes(status ?? '')
      ? 'error'
      : 'neutral';
  return (
    <View
      testID={'P22.outcome.' + kind}
      style={[
        p22.badge,
        kind === 'success'
          ? p22.success
          : kind === 'error'
          ? p22.error
          : p22.neutral,
      ]}
    >
      <Text
        style={[
          p22.badgeText,
          kind === 'success'
            ? p22.successText
            : kind === 'error'
            ? p22.errorText
            : p22.neutralText,
        ]}
      >
        {historyStatus(status)}
      </Text>
    </View>
  );
}

/** Measured excerpt, source string unchanged; reader stays in the screen's one
 * existing Dialog so Back, pending copy and scope guards share one overlay.
 */
export function P22Value({
  label,
  value,
  lines = 2,
  textStyle,
  onRead,
}: {
  label: string;
  value: string | null | undefined;
  lines?: 2 | 3;
  textStyle?: StyleProp<TextStyle>;
  onRead(value: string): void;
}) {
  const raw = value ?? 'Chưa xác minh';
  const current = useRef(raw);
  current.current = raw;
  const [measured, setMeasured] = useState({ value: '', clipped: false });
  const style = [p22.value, textStyle];
  const lineHeight = StyleSheet.flatten(style)?.lineHeight ?? 21;
  const update = (clipped: boolean) => {
    if (current.current !== raw) return;
    setMeasured(old =>
      old.value === raw && old.clipped === clipped
        ? old
        : { value: raw, clipped },
    );
  };
  return (
    <View style={p22.valueBox}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'Đọc đầy đủ ' + label}
        onPress={() => onRead(raw)}
      >
        <Text numberOfLines={lines} style={style}>
          {raw}
        </Text>
      </Pressable>
      <Text
        testID={'P22.measure.' + label}
        accessible={false}
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[style, p22.measurement]}
        onTextLayout={e => {
          if (Platform.OS !== 'web') update(e.nativeEvent.lines.length > lines);
        }}
        onLayout={e => {
          if (Platform.OS === 'web')
            update(e.nativeEvent.layout.height > lineHeight * lines + 0.5);
        }}
      >
        {raw}
      </Text>
      {measured.value === raw && measured.clipped ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Xem đầy đủ ' + label}
          style={p22.reader}
          onPress={() => onRead(raw)}
        >
          <Text style={p22.link}>Xem đầy đủ</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const p22 = StyleSheet.create({
  stack: { gap: 14, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fill: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 22,
    lineHeight: 30.8,
    fontWeight: '700',
    color: HN_UI.textPrimary,
  },
  body: { fontSize: 16, lineHeight: 24, color: HN_UI.textPrimary },
  muted: { fontSize: 14, lineHeight: 21, color: HN_UI.textMuted },
  small: { fontSize: 13, lineHeight: 19.5, color: HN_UI.textMuted },
  card: {
    minWidth: 0,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 12,
    backgroundColor: HN_UI.surface,
    padding: 18,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconLarge: { width: 56, height: 56, borderRadius: 12 },
  hero: { alignItems: 'center', paddingVertical: 24, gap: 14 },
  heroTitle: {
    textAlign: 'center',
    fontSize: 22,
    lineHeight: 31,
    color: HN_UI.textPrimary,
    fontWeight: '700',
  },
  badge: {
    borderRadius: 9,
    paddingVertical: 5,
    paddingHorizontal: 10,
    maxWidth: '100%',
    flexShrink: 1,
  },
  badgeText: { fontSize: 13, lineHeight: 19.5 },
  success: { backgroundColor: HN_UI.successSoft },
  error: { backgroundColor: HN_UI.dangerSoft },
  neutral: { backgroundColor: HN_UI.canvas },
  successText: { color: HN_UI.success },
  errorText: { color: HN_UI.danger },
  neutralText: { color: HN_UI.textMuted },
  event: { paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  eventTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    color: HN_UI.textPrimary,
  },
  viewed: {
    borderColor: HN_UI.border,
    borderLeftWidth: 3,
    borderLeftColor: HN_UI.border,
  },
  field: { flexDirection: 'row', gap: 4, alignItems: 'flex-start' },
  fieldLabel: { width: 42, fontSize: 13, lineHeight: 22.5, color: HN_UI.textMuted },
  identifier: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 22.5,
    color: HN_UI.textPrimary,
  },
  actor: { maxWidth: '60%', textAlign: 'right' },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 18,
    marginBottom: -2,
  },
  groupTitle: {
    fontSize: 17,
    lineHeight: 25.5,
    color: HN_UI.textPrimary,
    fontWeight: '700',
    flexShrink: 1,
  },
  metadata: { paddingVertical: 10 },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderBottomWidth: 1,
    borderColor: HN_UI.border,
    paddingVertical: 10,
    minHeight: 48,
  },
  metadataLabel: {
    width: 130,
    flexShrink: 1,
    color: HN_UI.textMuted,
    fontSize: 14,
    lineHeight: 21,
    paddingTop: 3,
  },
  valueBox: { flex: 1, minWidth: 0 },
  value: {
    fontSize: 14,
    lineHeight: 21,
    color: HN_UI.textPrimary,
    textAlign: 'right',
    fontWeight: '600',
  },
  copyValue: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  copy: {
    minWidth: 76,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  copyText: { fontSize: 13, lineHeight: 19.5, color: HN_UI.textLink },
  reader: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-end' },
  link: { fontSize: 14, lineHeight: 21, color: HN_UI.textLink, fontWeight: '600' },
  measurement: { position: 'absolute', opacity: 0, top: 0, left: 0, right: 0 },
  description: {
    fontSize: 15,
    lineHeight: 24,
    color: HN_UI.textMuted,
    textAlign: 'left',
    fontWeight: '400',
  },
  uid: {
    borderRadius: 10,
    backgroundColor: HN_OPERATIONS.nfc.soft,
    padding: 12,
    gap: 6,
  },
  transition: {
    textAlign: 'center',
    color: HN_UI.textMuted,
    fontSize: 24,
    lineHeight: 36,
  },
  notice: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 12,
    padding: 14,
    backgroundColor: HN_UI.canvas,
  },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 21, color: HN_UI.textLink },
  empty: {
    minHeight: 350,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 20,
    paddingVertical: 36,
  },
  center: { textAlign: 'center' },
  primary: {
    minHeight: 56,
    backgroundColor: SCANNER_COLORS.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  primaryText: {
    color: HN_UI.onBrand,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  dock: { gap: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  search: {
    flex: 1,
    minWidth: 0,
    height: 50,
    borderWidth: 1,
    borderColor: HN_UI.borderControl,
    borderRadius: 10,
    backgroundColor: HN_UI.canvas,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    fontSize: 16,
    lineHeight: 24,
    color: HN_UI.textPrimary,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  tap: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchTap: { minHeight: 44, minWidth: 28, justifyContent: 'center' },
  filter: {
    height: 50,
    width: 54,
    borderRadius: 10,
    backgroundColor: HN_UI.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterDot: {
    position: 'absolute',
    right: 5,
    top: 5,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: HN_UI.surface,
    backgroundColor: HN_UI.success,
  },
  tabs: { flexDirection: 'row', gap: 6 },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: HN_UI.canvas,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedTab: { backgroundColor: HN_UI.primary },
  tabText: {
    fontSize: 14,
    lineHeight: 21,
    color: HN_UI.textPrimary,
    textAlign: 'center',
  },
  selectedTabText: { color: HN_UI.onBrand, fontWeight: '600' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  date: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: HN_UI.canvas,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  dateText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 17,
    color: HN_UI.textMuted,
  },
  reload: {
    minHeight: 44,
    minWidth: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reloadText: { fontSize: 13, lineHeight: 19.5, color: HN_UI.textLink },
  readStatus: { minHeight: 18, fontSize: 12, lineHeight: 18, color: HN_UI.warning },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 10,
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: HN_UI.surface,
  },
  end: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19.5,
    color: HN_UI.textMuted,
    marginVertical: 8,
  },
});
