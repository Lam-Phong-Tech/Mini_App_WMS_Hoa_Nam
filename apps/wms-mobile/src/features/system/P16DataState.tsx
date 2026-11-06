import {HN_UI} from '../../theme/uiKitV3';
import {ScannerNativeText as Text} from '../../ui/ScannerNativeText';
import {SCANNER_ARIAL_FAMILY} from '../../theme/scannerTypography';
/**
 * P16 list-state presentation, owned by P12's existing read lifecycle.
 *
 * Layout/copy: ScannerHNApp docs/flows/data-states/{view.mjs,style.css},
 * P16 r02/r03/r04 + current494x950 reference. No DTO classification, API,
 * navigation, stock command, session, cache or storage lives in this file.
 * Parent keeps the existing scroller/header/footer and supplies guarded actions.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {AccessibilityInfo, ActivityIndicator, Platform, Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent, type StyleProp, type TextStyle} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Button } from '../../ui/Button';

export type P16DataStateKind = 'loading' | 'empty' | 'no-results' | 'error';
export interface P16Condition {
  /** Stable owner filter key; removing date clears its entire range in owner. */
  key: string;
  label: string;
  onRemove?: () => void;
}
export interface P16ReadText {
  title: string;
  text: string;
}
export interface P16DataStateProps {
  /** Already classified by P12 after response/count/query/scope validation. */
  kind: P16DataStateKind;
  /** Reuse the owner's uniform494x950 scale; never scale the app a second time. */
  scale?: number;
  /** Optional measured list viewport, excluding the owner's content padding. */
  availableHeight?: number;
  /** True only while an actual owner read is pending. No timeout/retry here. */
  pending?: boolean;
  /** For loading/error with same-context rows: retain those rows outside here. */
  retained?: boolean;
  busy?: boolean;
  motion?: 'auto' | 'reduced' | 'off';
  /** Owner-verified visible source label; not a warehouse-wide empty claim. */
  sourceLabel?: string | null;
  /** Fail closed: both verified true and a guarded callback are required. */
  canCreate?: boolean | null;
  onCreate?: () => void;
  createLabel?: string;
  query?: string;
  /** All active conditions, with source-aware labels from the owner. */
  conditions?: readonly P16Condition[];
  onRemoveQuery?: () => void;
  onClear?: () => void;
  onEditQuery?: () => void;
  onAdjustFilters?: () => void;
  /** Read-only retry from P12, never a mutation or UNKNOWN replay. */
  onRetry?: () => void;
  retryLabel?: string;
  errorCode?: string | null;
  /** Original trusted message; details go to the existing owner dialog. */
  errorMessage?: string | null;
  onReadError?: (details: {
    code: string | null;
    message: string | null;
  }) => void;
  /** Existing in-app reader; preserve original text and single-overlay policy. */
  onReadText?: (value: P16ReadText) => void;
}

const panelIds: Record<P16DataStateKind, string> = {
  loading: 'P16.S01',
  empty: 'P16.S02',
  'no-results': 'P16.S03',
  error: 'P16.S04',
};
// P12 docs/flows/documents/tokens.css + P16 artwork/skeleton styles;
// these neutral data-state colors do not recolor operation/status/footer UI.
const palette = {
  ink: HN_UI.textSecondary,
  muted: HN_UI.textSecondary,
  primary: HN_UI.textLink,
  line: HN_UI.border,
  art: HN_UI.selected,
  glyph: HN_UI.textSecondary,
  skeleton: HN_UI.selected,
  chip: HN_UI.selected,
  danger: HN_UI.danger,
};
const paths = {
  // Existing data-states/view.mjs code-native geometry; no board/raster trace.
  document: '<path d="M14 2H5v20h14V7zM14 2v5h5M8 11h8M8 15h8M8 18h5"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>',
  refresh:
    '<path d="M20 5v5h-5M4 19v-5h5M20 10a8 8 0 0 0-14-5M4 14a8 8 0 0 0 14 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  ring: `<circle cx="12" cy="12" r="9" stroke="${HN_UI.border}"/><path d="M12 3a9 9 0 0 1 8 4.9"/>`,
};
function Glyph({
  name,
  size,
  color,
}: {
  name: keyof typeof paths;
  size: number;
  color: string;
}) {
  return (
    <SvgXml
      accessible={false}
      width={size}
      height={size}
      xml={
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' +
        color +
        '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
        paths[name] +
        '</svg>'
      }
    />
  );
}

/** OS query/subscription only in auto mode; no layout animation or timers. */
function useReducedMotion(mode: NonNullable<P16DataStateProps['motion']>) {
  const [osReduced, setOsReduced] = useState(true);
  useEffect(() => {
    if (mode !== 'auto') return;
    let active = true;
    let receivedChange = false;
    AccessibilityInfo.isReduceMotionEnabled().then(
      value => {
        if (active && !receivedChange) setOsReduced(value);
      },
      () => {
        if (active && !receivedChange) setOsReduced(true);
      },
    );
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      value => {
        receivedChange = true;
        if (active) setOsReduced(value);
      },
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, [mode]);
  return mode !== 'auto' || osReduced;
}

function layout(scale: number) {
  const p = (n: number) => n * scale;
  return StyleSheet.create({
    root: {
      flexGrow: 1,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 0,
      minHeight: p(440),
      paddingTop: p(20),
      paddingHorizontal: p(12),
      paddingBottom: p(44),
    },
    title: {
      fontSize: p(25),
      lineHeight: p(33.75),
      fontWeight: '700',
      color: palette.ink,
      textAlign: 'center',
      marginBottom: p(12),
    },
    description: {
      fontSize: p(18),
      lineHeight: p(27),
      color: palette.muted,
      textAlign: 'center',
      flexShrink: 1,
    },
    textBlock: { width: '100%', minWidth: 0 },
    measure: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
    strong: { fontWeight: '700', color: palette.ink },
    art: {
      width: p(128),
      height: p(128),
      borderRadius: p(64),
      backgroundColor: palette.art,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: p(22),
      flexShrink: 0,
    },
    compactArt: {
      width: p(104),
      height: p(104),
      borderRadius: p(52),
      marginBottom: p(16),
    },
    overlay: {
      position: 'absolute',
      right: p(19),
      bottom: p(21),
      width: p(44),
      height: p(44),
      borderRadius: p(22),
      backgroundColor: palette.art,
    },
    errorOverlay: { backgroundColor: HN_UI.dangerSoft },
    actions: {
      flexDirection: 'row',
      width: '100%',
      minWidth: 0,
      gap: p(12),
      marginTop: p(30),
      position: 'relative',
    },
    button: {
      flex: 1,
      minWidth: 0,
      minHeight: Math.max(44, p(56)),
      paddingHorizontal: p(12),
      paddingVertical: p(12),
      borderRadius: p(12),
      borderWidth: 1,
      borderColor: palette.primary,
      backgroundColor: palette.primary,
      gap: p(12),
    },
    secondary: { backgroundColor: HN_UI.surface },
    buttonText: {
      fontSize: p(18),
      lineHeight: p(24.3),
      fontWeight: '600',
      fontFamily: SCANNER_ARIAL_FAMILY,
    },
    secondaryText: { color: palette.primary },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      width: '100%',
      gap: p(8),
      marginTop: p(18),
    },
    chip: {
      flexGrow: 1,
      flexBasis: '46%',
      minWidth: 0,
      minHeight: Math.max(44, p(44)),
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: p(12),
      backgroundColor: palette.chip,
      paddingHorizontal: p(12),
      flexDirection: 'row',
      alignItems: 'center',
      gap: p(10),
    },
    chipContent: { flex: 1, minWidth: 0, paddingVertical: p(9) },
    chipRemove: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipLabel: {
      flex: 1,
      minWidth: 0,
      fontSize: p(16),
      lineHeight: p(22.4),
      color: palette.ink,
      textAlign: 'left',
    },
    reader: {
      minHeight: 44,
      paddingVertical: p(6),
      paddingHorizontal: p(10),
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: p(8),
    },
    readerText: { fontSize: p(16), lineHeight: p(24), color: palette.primary },
    code: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: '100%',
      marginTop: p(10),
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: p(2),
      paddingVertical: p(5),
    },
    codeText: {
      fontSize: p(15),
      lineHeight: p(21),
      color: palette.muted,
      textAlign: 'center',
    },
    codeFlow: { width: '100%', marginTop: p(10) },
    loading: { width: '100%', flexGrow: 1, paddingBottom: p(16), gap: p(10) },
    skeletons: { width: '100%', gap: p(10) },
    skeleton: {
      minHeight: p(62),
      flexDirection: 'row',
      alignItems: 'center',
      gap: p(14),
      paddingVertical: p(10),
      paddingHorizontal: p(14),
      backgroundColor: HN_UI.surface,
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: p(12),
    },
    avatar: {
      width: p(40),
      height: p(40),
      borderRadius: p(20),
      flexShrink: 0,
      backgroundColor: palette.skeleton,
    },
    skeletonText: { flex: 1, gap: p(8), minWidth: 0 },
    bar: {
      height: p(12),
      width: '76%',
      borderRadius: p(6),
      backgroundColor: palette.skeleton,
    },
    shortBar: { width: '57%' },
    badge: {
      width: p(58),
      height: p(16),
      borderRadius: p(6),
      backgroundColor: palette.skeleton,
      alignSelf: 'flex-start',
      marginTop: p(2),
    },
    loadingCopy: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: p(16),
      marginTop: p(14),
    },
    loadingText: { fontSize: p(18), lineHeight: p(27), color: palette.ink },
    loadingHint: { fontSize: p(15), lineHeight: p(22.5), color: palette.muted },
    inline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: p(12),
      padding: p(14),
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: p(12),
      backgroundColor: palette.chip,
    },
    stale: { borderColor: HN_UI.warningBorder, backgroundColor: HN_UI.warningSoft },
    inlineText: { flex: 1, minWidth: 0 },
    staleText: { color: HN_UI.warning },
    inlineButton: { flex: 0, minHeight: Math.max(44, p(46)), padding: p(10) },
  });
}

type Styles = ReturnType<typeof layout>;

/** Measure natural text height on RN/RNWeb without DOM or char-count guesses.
 * No reader supplied => no clipping. Parent owns the single existing dialog.
 */
function Description({
  text,
  children,
  styles: s,
  scale,
  onReadText,
  title,
  maxLines = 3,
  lineHeight = 27,
  testID = 'P16.description',
  textStyle,
}: {
  text: string;
  children?: React.ReactNode;
  styles: Styles;
  scale: number;
  title: string;
  onReadText?: P16DataStateProps['onReadText'];
  maxLines?: number;
  lineHeight?: number;
  testID?: string;
  textStyle?: StyleProp<TextStyle>;
}) {
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const [measurement, setMeasurement] = useState({ key: '', height: 0 });
  const key = JSON.stringify([text, width, scale, fontScale]);
  const overflow =
    measurement.key === key &&
    measurement.height > maxLines * lineHeight * scale * fontScale + 1;
  const clipped = overflow && !!onReadText;
  const onLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setWidth(value => (Math.abs(value - nextWidth) > 0.5 ? nextWidth : value));
  };
  return (
    <View style={s.textBlock} onLayout={onLayout}>
      <Text
        key={key}
        testID={testID + '.measure'}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[s.description, textStyle, s.measure]}
        onLayout={event =>
          setMeasurement({
            key,
            height: event.nativeEvent.layout.height,
          })
        }
      >
        {children ?? text}
      </Text>
      <Text
        testID={testID}
        style={[s.description, textStyle]}
        numberOfLines={clipped ? maxLines : undefined}
      >
        {children ?? text}
      </Text>
      {clipped ? (
        <Pressable
          accessibilityRole="button"
          style={s.reader}
          accessibilityLabel={'Xem đầy đủ ' + title.toLowerCase()}
          onPress={() => onReadText?.({ title, text })}
        >
          <Text style={s.readerText}>Xem đầy đủ</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Pure presentation; callbacks must recheck scope/rights in their owner. */
export function P16DataState({
  kind,
  scale: suppliedScale,
  availableHeight,
  pending = false,
  retained = false,
  busy = false,
  motion = 'auto',
  sourceLabel,
  canCreate,
  onCreate,
  createLabel = 'Tạo chứng từ',
  query = '',
  conditions,
  onRemoveQuery,
  onClear,
  onEditQuery,
  onAdjustFilters,
  onRetry,
  retryLabel = 'Thử lại',
  errorCode,
  errorMessage,
  onReadError,
  onReadText,
}: P16DataStateProps): React.ReactElement {
  const { width } = useWindowDimensions();
  const scale =
    Number.isFinite(suppliedScale) && suppliedScale! > 0
      ? Math.min(1, suppliedScale!)
      : Math.min(1, Math.max(0.1, width / 494));
  const s = useMemo(() => layout(scale), [scale]);
  const reduced = useReducedMotion(motion);
  const run = (action?: () => void) => {
    if (!busy) action?.();
  };
  const indicator =
    pending && !reduced ? (
      <ActivityIndicator
        testID="P16.pending.indicator"
        color={palette.primary}
      />
    ) : (
      <View testID="P16.static.indicator">
        <Glyph name="ring" size={26 * scale} color={palette.primary} />
      </View>
    );
  const button = (
    label: string,
    action: (() => void) | undefined,
    secondary = false,
    icon?: 'plus' | 'refresh',
    inline = false,
  ) => (
    <Button
      label={label}
      onPress={() => run(action)}
      disabled={busy || !action}
      variant={secondary ? 'secondary' : 'primary'}
      leading={
        icon ? (
          <Glyph
            name={icon}
            size={24 * scale}
            color={secondary ? palette.primary : HN_UI.onBrand}
          />
        ) : undefined
      }
      style={[s.button, secondary && s.secondary, inline && s.inlineButton]}
      labelStyle={[s.buttonText, secondary && s.secondaryText]}
    />
  );
  if (retained && (kind === 'loading' || kind === 'error')) {
    const failed = kind === 'error';
    return (
      <View
        testID={failed ? 'P16.stale' : 'P16.refreshing'}
        style={[s.inline, failed && s.stale]}
        accessibilityLiveRegion="polite"
      >
        <View style={s.inlineText}>
          <Text style={[s.loadingText, failed && s.staleText]}>
            {failed ? 'Chưa cập nhật được dữ liệu.' : 'Đang cập nhật chứng từ…'}
          </Text>
          <Text style={s.loadingHint}>
            Đang hiển thị dữ liệu đã tải trước đó.
          </Text>
        </View>
        {failed
          ? button(retryLabel, onRetry, false, undefined, true)
          : indicator}
      </View>
    );
  }
  if (kind === 'loading')
    return (
      <View
        testID={panelIds[kind]}
        style={s.loading}
        accessibilityLiveRegion="polite"
        accessibilityState={{ busy: pending }}
      >
        <View
          testID="P16.skeletons"
          style={s.skeletons}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <View
              key={i}
              testID={'P16.skeleton.' + i}
              style={s.skeleton}
              accessible={false}
            >
              <View style={s.avatar} />
              <View style={s.skeletonText}>
                <View style={s.bar} />
                <View style={[s.bar, s.shortBar]} />
              </View>
              <View style={s.badge} />
            </View>
          ))}
        </View>
        <View style={s.loadingCopy}>
          {indicator}
          <View>
            <Text style={s.loadingText}>
              {pending ? 'Đang tải chứng từ…' : 'Đang chờ nguồn dữ liệu'}
            </Text>
            <Text style={s.loadingHint}>Vui lòng chờ trong giây lát</Text>
          </View>
        </View>
      </View>
    );

  const hasQuery = query.trim().length > 0;
  const code =
    typeof errorCode === 'string' && errorCode.length > 0 ? errorCode : null;
  const message =
    typeof errorMessage === 'string' && errorMessage.length > 0
      ? errorMessage
      : null;
  const chips =
    conditions ??
    (hasQuery
      ? [{ key: 'q', label: 'Từ khóa: ' + query, onRemove: onRemoveQuery }]
      : []);
  const hasChips = kind === 'no-results' && chips.length > 0;
  const allowedCreate = canCreate === true && !!onCreate;
  const title =
    kind === 'empty'
      ? 'Chưa có chứng từ'
      : kind === 'no-results'
      ? 'Không tìm thấy kết quả'
      : 'Không tải được dữ liệu';
  const description =
    kind === 'empty'
      ? sourceLabel
        ? 'Nguồn ' +
          sourceLabel +
          ' chưa có chứng từ trong phạm vi được phép xem.'
        : allowedCreate
        ? 'Bạn chưa có chứng từ nào.\nHãy tạo chứng từ mới để bắt đầu.'
        : 'Chưa có chứng từ trong phạm vi được xem.'
      : kind === 'no-results'
      ? 'Không có chứng từ phù hợp' +
        (hasQuery ? ' với “' + query + '”.' : ' với bộ lọc hiện tại.') +
        '\nVui lòng thử lại với điều kiện khác.'
      : 'Dữ liệu chưa được cập nhật.\nVui lòng thử lại sau.';
  const viewportHeight =
    typeof availableHeight === 'number' && Number.isFinite(availableHeight)
      ? Math.max(0, availableHeight)
      : 0;
  return (
    <View
      testID={panelIds[kind]}
      style={[
        s.root,
        {
          minHeight: Math.max(440 * scale, viewportHeight),
          paddingTop: (hasChips ? 18 : 20) * scale,
          paddingBottom: (hasChips ? 24 : kind === 'error' ? 64 : 44) * scale,
        },
      ]}
    >
      <View
        testID="P16.artwork"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[s.art, hasChips && s.compactArt]}
      >
        <Glyph
          name={kind === 'error' ? 'cloud' : 'document'}
          size={64 * scale}
          color={palette.glyph}
        />
        {kind !== 'empty' ? (
          <View style={[s.overlay, kind === 'error' && s.errorOverlay]}>
            <Glyph
              name={kind === 'error' ? 'alert' : 'search'}
              size={44 * scale}
              color={kind === 'error' ? palette.danger : palette.primary}
            />
          </View>
        ) : null}
      </View>
      <View style={s.textBlock} accessibilityLiveRegion="polite">
        <Text accessibilityRole="header" style={s.title}>
          {title}
        </Text>
        <Description
          text={description}
          styles={s}
          scale={scale}
          title={kind === 'no-results' ? 'Từ khóa tìm kiếm' : title}
          onReadText={onReadText}
        >
          {kind === 'no-results' && hasQuery ? (
            <>
              {'Không có chứng từ phù hợp với '}
              <Text style={s.strong}>{'“' + query + '”'}</Text>
              {'.\nVui lòng thử lại với điều kiện khác.'}
            </>
          ) : (
            description
          )}
        </Description>
      </View>
      {hasChips ? (
        <View accessibilityLabel="Điều kiện đang áp dụng" style={s.chips}>
          {chips.map(chip => (
            <View key={chip.key} style={s.chip}>
              <View style={s.chipContent}>
                <Description
                  text={chip.label}
                  title="Điều kiện đang áp dụng"
                  styles={s}
                  textStyle={s.chipLabel}
                  scale={scale}
                  maxLines={1}
                  lineHeight={22.4}
                  testID={'P16.condition.' + chip.key}
                  onReadText={onReadText}
                />
              </View>
              {chip.onRemove ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={'Bỏ điều kiện ' + chip.label}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  style={s.chipRemove}
                  onPress={() => run(chip.onRemove)}
                >
                  <Glyph name="close" size={20 * scale} color={palette.ink} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {kind !== 'empty' || allowedCreate ? (
        <View style={[s.actions, hasChips && { marginTop: 20 * scale }]}>
          {kind === 'empty' ? (
            button(createLabel, onCreate, false, 'plus')
          ) : kind === 'no-results' ? (
            <>
              {button('Xóa bộ lọc', onClear, true)}
              {hasQuery
                ? button('Sửa từ khóa', onEditQuery)
                : button('Điều chỉnh bộ lọc', onAdjustFilters)}
            </>
          ) : (
            button(retryLabel, onRetry, false, 'refresh')
          )}
          {kind === 'error' && (code || message) ? (
            onReadError ? (
              <Pressable
                style={s.code}
                accessibilityRole="button"
                accessibilityLabel={
                  code ? 'Xem chi tiết lỗi ' + code : 'Xem chi tiết lỗi'
                }
                onPress={() =>
                  onReadError({
                    code,
                    message,
                  })
                }
              >
                <Text numberOfLines={1} style={s.codeText}>
                  {code ? 'Mã lỗi: ' + code : 'Xem chi tiết lỗi'}
                </Text>
              </Pressable>
            ) : null
          ) : null}
        </View>
      ) : null}
      {kind === 'error' && (code || message) && !onReadError ? (
        <View style={s.codeFlow}>
          {code ? <Text style={s.codeText}>{'Mã lỗi: ' + code}</Text> : null}
          {message ? <Text style={s.codeText}>{message}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
