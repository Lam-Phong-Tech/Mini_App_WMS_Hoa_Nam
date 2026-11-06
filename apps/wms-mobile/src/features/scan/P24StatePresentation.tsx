import {HN_UI} from '../../theme/uiKitV3';
import {ScannerNativeText as Text} from '../../ui/ScannerNativeText';
/**
 * P24 state presenters. UI only: owners retain case/scope/version/request/receipt.
 * S01 mounts inside the caller's single bounded Sheet; no Modal is created here.
 * S02/S04 replace the caller body while active, never overlay the live camera.
 * S03 continues to use the approved waiting-Web presentation.
 */
import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import {ScannerTextInput as TextInput} from '../../ui/ScannerTextInput';
import {Platform,Pressable,ScrollView,StyleSheet,View} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { P04Icon } from '../inbound/P04Icon';
import { HN_OPERATIONS } from '../../ui/hnHomeTokens';
import {SCANNER_COLORS} from '../../ui/ScannerPalette';

export { InboundResultScreen as P24WaitingWebPresentation } from '../inbound/InboundResultScreen';

export const P24_PANEL_IDS = [
  'P24.S01',
  'P24.S02',
  'P24.S03',
  'P24.S04',
] as const;
export type P24ReadFull = (label: string, original: string) => void;
type Action = { label: string; onPress(): void; disabled?: boolean };
type CaseContext = {
  caseId: string;
  caseLabel: string | null;
  productName: string | null;
};
export interface P24RejectedCodeProps {
  context: CaseContext & { statusLabel: string };
  itemKind: 'BOX' | 'UNIT' | 'UNKNOWN';
  rawCode: string;
  /** Exact owner/server reason. Do not infer BOX_NOT_RECEIVED from a UID. */
  reason: string | null;
  warehouseName: string | null;
  draftLabel: string | null;
  acceptedCodeCount: number | null;
  busy?: boolean;
  onBack(): void;
  onScanAnother(): void;
  onEditRaw(rawCode: string): void;
  onReadFull: P24ReadFull;
}
export interface P24ClosedCaseProps {
  context: CaseContext & {
    /** Caller selects S04 only after its exact P09 case status is RETURNED. */
    status: 'RETURNED';
    serial: string | null;
    customerName: string | null;
  };
  loadedDocumentCount: number | null;
  onBack(): void;
  onOpenCase(): void;
  onTimeline(): void;
  /** Only bind an existing original UNKNOWN check; never new issue/resume writer. */
  originalRequestCheck?: Action;
  onReadFull: P24ReadFull;
  /** P20-owned verified POSTED list, paging/error/loading and readers stay intact. */
  children: ReactNode;
  initialScrollY?: number;
  onScrollPositionChange?(offset: number): void;
}
export interface P24QuantityProps {
  box: { skuCode: string | null; name: string | null; rawCode: string };
  caseLabel: string | null;
  availability:
    | { status: 'VERIFIED'; quantity: number; selectableLimit: number }
    | { status: 'UNAVAILABLE' };
  value: string;
  validationMessage: string | null;
  canConfirm: boolean;
  canDecrease: boolean;
  canIncrease: boolean;
  busy?: boolean;
  /** Owner revalidates the same pending line for every input/stepper callback. */
  onChangeText(value: string): void;
  onDecrease(): void;
  onIncrease(): void;
  onConfirm(): void;
  onCancel(): void;
}

const colors = {
  ink: HN_UI.textPrimary,
  muted: HN_UI.textMuted,
  brand: HN_UI.shell,
  primary: SCANNER_COLORS.primary,
  canvas: HN_UI.canvas,
  line: HN_UI.border,
  warning: HN_UI.warning,
  warningBg: HN_UI.warningSoft,
  error: HN_UI.danger,
  info: HN_UI.textSecondary,
  infoBg: HN_UI.selected,
};
const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0, minHeight: 0 },
  frame: { flex: 1, backgroundColor: colors.brand },
  header: {
    minHeight: 86,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    color: HN_UI.onBrand,
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '600',
    textAlign: 'center',
  },
  back: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -12,
    overflow: 'hidden',
  },
  scroll: { padding: 20, gap: 14, flexGrow: 1 },
  footer: {
    flexShrink: 0,
    backgroundColor: HN_UI.surface,
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    backgroundColor: HN_UI.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 18,
    gap: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  strong: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 27,
    fontWeight: '600',
    flexShrink: 1,
  },
  title: { color: colors.ink, fontSize: 24, lineHeight: 31, fontWeight: '600' },
  text: { color: colors.ink, fontSize: 15, lineHeight: 23, flexShrink: 1 },
  muted: { color: colors.muted, fontSize: 15, lineHeight: 23, flexShrink: 1 },
  read: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  readText: {
    color: colors.primary,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  measure: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 0,
    overflow: 'hidden',
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HN_OPERATIONS.warranty.soft,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: HN_UI.canvas,
  },
  badgeText: { color: colors.primary, fontSize: 12, lineHeight: 18 },
  returnedBadge: { backgroundColor: HN_UI.successSoft },
  returnedText: { color: HN_UI.success },
  metadata: {
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  label: { flex: 1, minWidth: 0 },
  value: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  right: { textAlign: 'right' },
  hero: { paddingTop: 22, paddingBottom: 22, gap: 14, alignItems: 'center' },
  center: { textAlign: 'center' },
  notice: {
    borderRadius: 12,
    backgroundColor: colors.infoBg,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  noticeText: {
    flex: 1,
    minWidth: 0,
    color: colors.info,
    fontSize: 15,
    lineHeight: 23,
  },
  warning: { backgroundColor: colors.warningBg },
  warningText: { color: colors.warning },
  action: {
    minHeight: 60,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  secondary: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: HN_UI.surface,
  },
  actionText: {
    color: HN_UI.onBrand,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
  secondaryText: { color: colors.primary },
  disabled: { opacity: 1,backgroundColor:HN_UI.disabled,borderColor:HN_UI.border },
  linkRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  divider: { borderTopWidth: 1, borderColor: colors.line },
  sectionTitle: {
    fontSize: 21,
    lineHeight: 28,
    color: colors.ink,
    fontWeight: '600',
  },
  sheet: { minHeight: 0, flexShrink: 1, backgroundColor: HN_UI.surface },
  grabber: {
    width: 50,
    height: 4,
    borderRadius: 2,
    backgroundColor: HN_UI.surfaceSunken,
    alignSelf: 'center',
    marginTop: 14,
    marginBottom: 12,
  },
  sheetHeader: {
    paddingHorizontal: 24,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sheetScroll: { flexShrink: 1, minHeight: 0 },
  sheetContent: { paddingHorizontal: 24, paddingBottom: 18, gap: 18 },
  sheetFooter: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 2,
    gap: 8,
    flexShrink: 0,
  },
  sheetIdentity: {
    paddingTop: 14,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  stockRow: {
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingTop: 18,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  stock: { color: HN_UI.success, fontSize: 15, lineHeight: 23, fontWeight: '600' },
  stepper: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 70,
  },
  stepperError: { borderColor: colors.error, borderWidth: 2 },
  step: {
    width: 58,
    minHeight: 70,
    backgroundColor: HN_UI.canvas,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 70,
    paddingHorizontal: 10,
    paddingVertical: 10,
    textAlign: 'center',
    color: colors.ink,
    fontSize: 28,
    fontWeight: '600',
  },
  inputError: { color: colors.error },
  error: { color: colors.error, fontSize: 14, lineHeight: 22 },
  hint: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  inputGroup: { gap: 8 },
  stretch: { alignSelf: 'stretch' },
});

function safeCount(value: number | null): string | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : null;
}
function display(value: string | null): string {
  return value !== null && value.trim() ? value : 'Chưa xác minh';
}
function Readable({
  label,
  value,
  onRead,
  strong = false,
  right = false,
}: {
  label: string;
  value: string | null;
  onRead: P24ReadFull;
  strong?: boolean;
  right?: boolean;
}) {
  const [truncated, setTruncated] = useState(false);
  const shown = display(value);
  const textStyle = [
    strong ? styles.strong : styles.muted,
    right && styles.right,
  ];
  return (
    <View style={styles.grow}>
      <Text selectable numberOfLines={2} style={textStyle}>
        {shown}
      </Text>
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.measure}
      >
        <Text
          accessible={false}
          style={textStyle}
          onTextLayout={event =>
            setTruncated(event.nativeEvent.lines.length > 2)
          }
          onLayout={
            Platform.OS === 'web'
              ? event =>
                  setTruncated(
                    event.nativeEvent.layout.height >
                      (strong ? 27 : 23) * 2 + 1,
                  )
              : undefined
          }
        >
          {shown}
        </Text>
      </View>
      {truncated && value !== null && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Xem đầy đủ ' + label}
          style={styles.read}
          onPress={() => onRead(label, value)}
        >
          <Text style={styles.readText}>Xem đầy đủ</Text>
        </Pressable>
      )}
    </View>
  );
}
function Button({
  label,
  onPress,
  disabled,
  secondary = false,
}: Action & { secondary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        if (!disabled) onPress();
      }}
      style={[
        styles.action,
        secondary && styles.secondary,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.actionText, secondary && styles.secondaryText,disabled&&{color:HN_UI.disabledForeground}]}>
        {label}
      </Text>
    </Pressable>
  );
}
function Notice({
  children,
  warning = false,
}: {
  children: ReactNode;
  warning?: boolean;
}) {
  return (
    <View style={[styles.notice, warning && styles.warning]}>
      <P04Icon
        name="info"
        size={19}
        color={warning ? colors.warning : colors.info}
      />
      <Text style={[styles.noticeText, warning && styles.warningText]}>
        {children}
      </Text>
    </View>
  );
}
function ContextCard({
  context,
  statusLabel,
  returned = false,
  onRead,
  extra,
}: {
  context: CaseContext;
  statusLabel: string;
  returned?: boolean;
  onRead: P24ReadFull;
  extra?: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.tile}>
          <P04Icon name="tool" size={25} color={HN_OPERATIONS.warranty.ink} />
        </View>
        <View style={styles.grow}>
          <Readable
            label="Mã hồ sơ"
            value={context.caseLabel ?? context.caseId}
            strong
            onRead={onRead}
          />
          <Readable
            label="Sản phẩm"
            value={context.productName}
            onRead={onRead}
          />
        </View>
        <View style={[styles.badge, returned && styles.returnedBadge]}>
          <Text style={[styles.badgeText, returned && styles.returnedText]}>
            {statusLabel}
          </Text>
        </View>
      </View>
      {extra}
    </View>
  );
}
function Frame({
  title,
  onBack,
  footer,
  children,
  initialScrollY,
  onScrollPositionChange,
}: {
  title: string;
  onBack(): void;
  footer: ReactNode;
  children: ReactNode;
  initialScrollY?: number;
  onScrollPositionChange?(offset: number): void;
}) {
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  const pendingOffset = useRef(initialScrollY);
  useEffect(() => {
    pendingOffset.current = initialScrollY;
  }, [initialScrollY]);
  const restore = () => {
    const offset = pendingOffset.current;
    if (
      offset === undefined ||
      contentHeight.current - viewportHeight.current < offset
    )
      return;
    scroll.current?.scrollTo({ y: offset, animated: false });
    pendingOffset.current = undefined;
  };
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.frame}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          style={styles.back}
          onPress={onBack}
        >
          <P04Icon name="arrow-left" color={HN_UI.onBrand} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <View style={styles.body}>
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          onLayout={event => {
            viewportHeight.current = event.nativeEvent.layout.height;
            restore();
          }}
          onContentSizeChange={(_width, height) => {
            contentHeight.current = height;
            restore();
          }}
          onScroll={event =>
            onScrollPositionChange?.(event.nativeEvent.contentOffset.y)
          }
          scrollEventThrottle={16}
        >
          {children}
        </ScrollView>
        <View style={styles.footer}>{footer}</View>
      </View>
    </SafeAreaView>
  );
}

/** S01 content only. Caller supplies the single bounded, bottom-aligned Sheet. */
export function P24QuantityPresentation(
  props: P24QuantityProps,
): React.ReactElement {
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const stock =
    props.availability.status === 'VERIFIED' ? props.availability : null;
  const known =
    stock !== null &&
    safeCount(stock.quantity) !== null &&
    safeCount(stock.selectableLimit) !== null;
  const disabled =
    !!props.busy || !props.canConfirm || !known || !!props.validationMessage;
  return (
    <View testID="P24.S01" style={styles.sheet}>
      <View style={styles.grabber} />
      <View style={styles.sheetHeader}>
        <Text style={[styles.title, styles.grow]}>Hộp linh kiện</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hủy nhập số lượng"
          style={styles.back}
          disabled={props.busy}
          onPress={() => {
            if (!props.busy) props.onCancel();
          }}
        >
          <P04Icon name="x" size={24} color={colors.ink} />
        </Pressable>
      </View>
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.sheetIdentity}>
          <View style={styles.tile}>
            <P04Icon name="box" size={25} color={HN_OPERATIONS.warranty.ink} />
          </View>
          <View style={styles.grow}>
            <Text selectable style={styles.strong}>
              {display(props.box.skuCode)}
            </Text>
            <Text selectable style={styles.muted}>
              {display(props.box.name)}
            </Text>
            <Text selectable style={styles.muted}>
              {props.box.rawCode}
            </Text>
          </View>
        </View>
        <View style={styles.stockRow}>
          <Text style={[styles.text, styles.grow]}>Tồn khả dụng</Text>
          <Text style={styles.stock}>
            {known ? stock!.quantity + ' linh kiện' : 'Chưa xác minh'}
          </Text>
        </View>
        {known && stock!.selectableLimit !== stock!.quantity && (
          <Text style={styles.hint}>
            Còn có thể chọn trong phiếu: {stock!.selectableLimit}
          </Text>
        )}
        <View style={styles.inputGroup}>
          <Text style={styles.text}>
            Số lượng linh kiện cần xuất <Text style={styles.error}>*</Text>
          </Text>
          <View
            style={[
              styles.stepper,
              !!props.validationMessage && styles.stepperError,
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Giảm số lượng"
              accessibilityState={{
                disabled: !!props.busy || !props.canDecrease,
              }}
              disabled={props.busy || !props.canDecrease}
              style={styles.step}
              onPress={() => {
                if (!props.busy && props.canDecrease) {
                  props.onDecrease();
                  input.current?.focus();
                }
              }}
            >
              <Text style={styles.text}>−</Text>
            </Pressable>
            <TextInput
              ref={input}
              accessibilityLabel="Số lượng linh kiện cần xuất"
              invalid={!!props.validationMessage}
              focusFrame="inner"
              value={props.value}
              onChangeText={value => {
                if (!props.busy) props.onChangeText(value);
              }}
              editable={!props.busy}
              keyboardType="number-pad"
              selectTextOnFocus
              style={[
                styles.input,
                !!props.validationMessage && styles.inputError,
              ]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tăng số lượng"
              accessibilityState={{
                disabled: !!props.busy || !props.canIncrease,
              }}
              disabled={props.busy || !props.canIncrease}
              style={styles.step}
              onPress={() => {
                if (!props.busy && props.canIncrease) {
                  props.onIncrease();
                  input.current?.focus();
                }
              }}
            >
              <Text style={styles.text}>+</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>
            Nhập số lượng cần dùng cho hồ sơ {display(props.caseLabel)}.
          </Text>
          {!!props.validationMessage && (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={styles.error}
            >
              {props.validationMessage}
            </Text>
          )}
        </View>
        <Notice>Chỉ xác nhận số lượng. Bước này chưa xuất kho.</Notice>
      </ScrollView>
      <View style={styles.sheetFooter}>
        <Button
          label="Xác nhận số lượng"
          disabled={disabled}
          onPress={props.onConfirm}
        />
        <Button
          label="Hủy"
          secondary
          disabled={props.busy}
          onPress={props.onCancel}
        />
      </View>
    </View>
  );
}

/** S02 replaces the scan surface. Caller keeps accepted rows/request/version. */
export function P24RejectedCodePresentation(
  props: P24RejectedCodeProps,
): React.ReactElement {
  const accepted = safeCount(props.acceptedCodeCount);
  const title =
    props.itemKind === 'BOX'
      ? 'Mã hộp chưa thể xuất'
      : props.itemKind === 'UNIT'
      ? 'Linh kiện chưa thể xuất'
      : 'Mã chưa thể xuất';
  return (
    <View testID="P24.S02" style={styles.fill}>
      <Frame
        title="Kiểm tra mã linh kiện"
        onBack={props.onBack}
        footer={
          <>
            <Button
              label="Quét mã khác"
              disabled={props.busy}
              onPress={props.onScanAnother}
            />
            <Button
              label="Sửa mã vừa nhập"
              secondary
              disabled={props.busy}
              onPress={() => props.onEditRaw(props.rawCode)}
            />
          </>
        }
      >
        <ContextCard
          context={props.context}
          statusLabel={props.context.statusLabel}
          onRead={props.onReadFull}
        />
        <View style={styles.hero}>
          <View style={styles.tile}>
            <P04Icon
              name={props.itemKind === 'UNIT' ? 'tool' : 'box'}
              size={25}
              color={HN_OPERATIONS.warranty.ink}
            />
          </View>
          <Text style={styles.sectionTitle}>{title}</Text>
          <View style={styles.stretch}>
            <Readable
              label="Lý do chưa thể xuất"
              value={props.reason}
              onRead={props.onReadFull}
            />
          </View>
        </View>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={[styles.muted, styles.label]}>Mã đã quét</Text>
            <View style={styles.value}>
              <Readable
                label="Mã đã quét"
                value={props.rawCode}
                strong
                right
                onRead={props.onReadFull}
              />
            </View>
          </View>
          <View style={styles.metadata}>
            <Text style={[styles.muted, styles.label]}>Kho</Text>
            <View style={styles.value}>
              <Readable
                label="Kho"
                value={props.warehouseName}
                strong
                right
                onRead={props.onReadFull}
              />
            </View>
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.strong}>
            {accepted === null
              ? 'Chưa xác minh số mã hợp lệ'
              : 'Đã giữ ' + accepted + ' mã hợp lệ'}
          </Text>
          <Text style={styles.muted}>Trong phiếu</Text>
          <Readable
            label="Phiếu đang làm"
            value={props.draftLabel}
            onRead={props.onReadFull}
          />
        </View>
        <Notice warning>
          Mã này chưa được thêm vào danh sách. Các mã đã quét hợp lệ vẫn đang
          được giữ lại.
        </Notice>
      </Frame>
    </View>
  );
}

/** S04 context/layout only; P20 owns history children and exact-ID read callbacks. */
export function P24ClosedCasePresentation(
  props: P24ClosedCaseProps,
): React.ReactElement {
  const count = safeCount(props.loadedDocumentCount);
  return (
    <View testID="P24.S04" style={styles.fill}>
      <Frame
        title="Hồ sơ bảo hành"
        onBack={props.onBack}
        initialScrollY={props.initialScrollY}
        onScrollPositionChange={props.onScrollPositionChange}
        footer={<Button label="Về lịch sử" secondary onPress={props.onBack} />}
      >
        <ContextCard
          context={props.context}
          statusLabel="Đã trả khách"
          returned
          onRead={props.onReadFull}
          extra={
            <>
              <Readable
                label="Serial"
                value={props.context.serial}
                onRead={props.onReadFull}
              />
              <View style={styles.metadata}>
                <Text style={[styles.muted, styles.label]}>Khách hàng</Text>
                <View style={styles.value}>
                  <Readable
                    label="Khách hàng"
                    value={props.context.customerName}
                    strong
                    right
                    onRead={props.onReadFull}
                  />
                </View>
              </View>
            </>
          }
        />
        <Notice>
          Hồ sơ đã trả khách, chỉ đọc. Bạn vẫn có thể xem các phiếu đã xuất.
        </Notice>
        <View style={styles.card}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xem thông tin hồ sơ"
            style={styles.linkRow}
            onPress={props.onOpenCase}
          >
            <Text style={[styles.text, styles.grow]}>Xem thông tin hồ sơ</Text>
            <P04Icon name="arrow" size={24} color={colors.ink} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xem quá trình bảo hành"
            style={[styles.linkRow, styles.divider]}
            onPress={props.onTimeline}
          >
            <Text style={[styles.text, styles.grow]}>
              Xem quá trình bảo hành
            </Text>
            <P04Icon name="arrow" size={24} color={colors.ink} />
          </Pressable>
        </View>
        {props.originalRequestCheck && (
          <Button {...props.originalRequestCheck} secondary />
        )}
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={[styles.sectionTitle, styles.grow]}>
              Linh kiện đã xuất
            </Text>
            <View style={[styles.badge, styles.returnedBadge]}>
              <Text style={[styles.badgeText, styles.returnedText]}>
                {count === null
                  ? 'Chưa xác minh số phiếu'
                  : count + ' phiếu đã tải'}
              </Text>
            </View>
          </View>
          <Text style={styles.muted}>
            Phiếu đã xác nhận xuất kho cho hồ sơ này.
          </Text>
          {props.children}
        </View>
      </Frame>
    </View>
  );
}
