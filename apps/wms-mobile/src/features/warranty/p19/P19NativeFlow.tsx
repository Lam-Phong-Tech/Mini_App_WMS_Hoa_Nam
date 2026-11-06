import {HN_UI} from '../../../theme/uiKitV3';
import {ScannerNativeText as Text} from '../../../ui/ScannerNativeText';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {ScannerTextInput as TextInput} from '../../../ui/ScannerTextInput';
import {Platform,Pressable,ScrollView,StyleSheet,View,useWindowDimensions} from 'react-native';
import {ThemeProvider} from '../../../theme/ThemeProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  P09Dialog,
  P09FrameBounds,
  P09Action,
  P09Value,
  p09Status,
} from '../P09Presentation';
import { P09CameraSurface } from '../P09ScanEntry';
import { P09NativeCamera } from '../P09NativeCamera';
import { P04Icon } from '../../inbound/P04Icon';
import { Input } from '../../../ui/Input';
import { CodeInput } from '../../../ui/CodeInput';
import { P19Icon, P19ResultSummary, P19Tile } from './P19Presentation';
import { P24RejectedCodePresentation } from '../../scan/P24StatePresentation';
import { useHardwareBack } from '../../../app/useHardwareBack';
import type { P19NativeController } from './p19NativeController';
import type { P19Row, P19VerifiedResult } from './p19Types';

export interface P19NativeFlowProps {
  controller: P19NativeController;
  onBack(): void;
  onVerifiedResult?(target: P19VerifiedResult): void;
  scanAvailable?: boolean;
  initialPanel?: 1 | 3;
  canCaptureReadOnly?(): boolean;
}
const styles = (z: number) =>
  StyleSheet.create({
    app: { flex: 1, backgroundColor: HN_UI.shell },
    header: {
      height: 74 * z,
      paddingHorizontal: 20 * z,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12 * z,
    },
    back: {
      width: 44 * z,
      minHeight: 44 * z,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      color: HN_UI.onBrand,
      fontSize: 24 * z,
      lineHeight: 30 * z,
      fontWeight: '700',
      flex: 1,
      textAlign: 'center',
      paddingRight: 44 * z,
    },
    body: {
      flex: 1,
      minHeight: 0,
      borderTopLeftRadius: 22 * z,
      borderTopRightRadius: 22 * z,
      backgroundColor: HN_UI.canvas,
      overflow: 'hidden',
    },
    content: { padding: 20 * z, gap: 14 * z, paddingBottom: 20 * z },
    footer: {
      padding: 20 * z,
      gap: 12 * z,
      borderTopWidth: 1,
      borderColor: HN_UI.border,
      backgroundColor: HN_UI.canvas,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 * z },
    topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 * z },
    context: { minHeight: 96 * z, padding: 18 * z },
    contextTitle: {
      color: HN_UI.textPrimary,
      fontSize: 22 * z,
      lineHeight: 29 * z,
      fontWeight: '700',
    },
    contextDescription: {
      color: HN_UI.textMuted,
      fontSize: 15 * z,
      lineHeight: 23 * z,
    },
    steps: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8 * z,
    },
    stepLine: {
      width: 25 * z,
      height: StyleSheet.hairlineWidth,
      backgroundColor: HN_UI.surfaceSunken,
      marginLeft: 3 * z,
    },
    past: { backgroundColor: HN_UI.successSoft, borderColor: HN_UI.successBorder },
    code: {
      color: HN_UI.textMuted,
      fontSize: 13 * z,
      lineHeight: 20 * z,
      marginTop: 6 * z,
    },
    partMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12 * z,
      marginTop: 8 * z,
    },
    iconButton: {
      minWidth: 44 * z,
      minHeight: 44 * z,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editQuantity: {
      minHeight: 44 * z,
      paddingHorizontal: 12 * z,
      borderWidth: 1,
      borderColor: HN_UI.border,
      borderRadius: 8 * z,
      backgroundColor: HN_UI.canvas,
      justifyContent: 'center',
    },
    warehouse: {
      borderWidth: 1,
      borderColor: HN_UI.border,
      paddingHorizontal: 18 * z,
    },
    fill: { flex: 1, minWidth: 0 },
    card: {
      padding: 16 * z,
      gap: 12 * z,
      borderWidth: 1,
      borderColor: HN_UI.border,
      borderRadius: 12 * z,
      backgroundColor: HN_UI.surface,
    },
    strong: {
      color: HN_UI.textPrimary,
      fontSize: 18 * z,
      lineHeight: 26 * z,
      fontWeight: '700',
      flexShrink: 1,
    },
    text: {
      color: HN_UI.textPrimary,
      fontSize: 15 * z,
      lineHeight: 23 * z,
      flexShrink: 1,
    },
    small: {
      color: HN_UI.textMuted,
      fontSize: 13 * z,
      lineHeight: 20 * z,
      flexShrink: 1,
    },
    hint: {
      padding: 14 * z,
      borderRadius: 12 * z,
      backgroundColor: HN_UI.canvas,
      gap: 8 * z,
    },
    warning: { backgroundColor: HN_UI.warningSoft },
    alert: { color: HN_UI.danger, fontSize: 14 * z, lineHeight: 21 * z },
    badge: {
      backgroundColor: HN_UI.canvas,
      borderRadius: 5 * z,
      padding: 5 * z,
      color: HN_UI.textLink,
      fontSize: 12 * z,
    },
    step: { flexDirection: 'row', alignItems: 'center', gap: 7 * z },
    dot: {
      height: 27 * z,
      width: 27 * z,
      borderWidth: 1,
      borderColor: HN_UI.border,
      borderRadius: 14 * z,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: HN_UI.surface,
    },
    active: { backgroundColor: HN_UI.primary, borderColor: HN_UI.border },
    activeInk: { color: HN_UI.onBrand },
    quantity: {
      color: HN_UI.textLink,
      fontSize: 19 * z,
      lineHeight: 26 * z,
      fontWeight: '700',
    },
    success: {
      alignItems: 'center',
      gap: 16 * z,
      paddingTop: 24 * z,
      paddingBottom: 12 * z,
    },
    successHalo: {
      width: 138 * z,
      height: 138 * z,
      borderRadius: 69 * z,
      backgroundColor: HN_UI.successSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    successMark: {
      backgroundColor: HN_UI.success,
      borderWidth: 16 * z,
      borderColor: HN_UI.successBorder,
      height: 110 * z,
      width: 110 * z,
      borderRadius: 55 * z,
      justifyContent: 'center',
      alignItems: 'center',
    },
    successTitle: {
      color: HN_UI.textPrimary,
      fontSize: 28 * z,
      lineHeight: 38 * z,
      fontWeight: '700',
      textAlign: 'center',
    },
    action: {
      minHeight: 60 * z,
      borderRadius: 10 * z,
      paddingHorizontal: 12 * z,
    },
    actionLabel: { fontSize: 17 * z, lineHeight: 26 * z },
    posted: { color: HN_UI.success, backgroundColor: HN_UI.successSoft },
    successCopy: {
      color: HN_UI.textMuted,
      fontSize: 16 * z,
      lineHeight: 27 * z,
      textAlign: 'center',
    },
  });

function P19Action({
  label,
  onPress,
  disabled,
  secondary = false,
  link = false,
  scale,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
  secondary?: boolean;
  link?: boolean;
  scale: number;
}) {
  const s = useMemo(() => styles(scale), [scale]);
  return (
    <P09Action
      label={label}
      onPress={onPress}
      disabled={disabled}
      variant={secondary ? 'secondary' : undefined}
      leading={
        link ? (
          <P04Icon name="arrow-left" size={22 * scale} color={HN_UI.textLink} />
        ) : undefined
      }
      style={[
        s.action,
        link
          ? {
              minHeight: 44 * scale,
              backgroundColor: 'transparent',
              borderWidth: 0,
            }
          : undefined,
      ]}
      labelStyle={[
        s.actionLabel,
        link ? { fontWeight: '400', fontSize: 15 * scale } : undefined,
      ]}
    />
  );
}
export function P19NativeFlow(props:React.ComponentProps<typeof P19NativeFlowContent>){
  return <ThemeProvider><P19NativeFlowContent {...props}/></ThemeProvider>;
}
function P19NativeFlowContent({
  controller,
  onBack,
  onVerifiedResult,
  scanAvailable = true,
  initialPanel = 1,
  canCaptureReadOnly,
}: P19NativeFlowProps) {
  const { width } = useWindowDimensions();
  const [hostWidth, setHostWidth] = useState(width);
  const scale = Math.min(hostWidth / 494, 1);
  const s = useMemo(() => styles(scale), [scale]);
  const [state, setState] = useState(controller.snapshot());
  const [panel, setPanel] = useState<1 | 3>(initialPanel);
  const [manual, setManual] = useState(false),
    [code, setCode] = useState('');
  const codeInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const codeRef = useRef(code);
  const alive = useRef(true);
  const [quantity, setQuantity] = useState('2'),
    [quantityError, setQuantityError] = useState('');
  const [confirm, setConfirm] = useState(false),
    [remove, setRemove] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const [localCode, setLocalCode] = useState<string>();
  const [rejected, setRejected] = useState<{
    raw: string;
    reason: string | null;
  }>();
  const [rejectionReader, setRejectionReader] = useState<{
    label: string;
    original: string;
  }>();
  const resultExit = useRef(false);
  const rejectedRef = useRef<typeof rejected>(undefined);
  const scanBusy = useRef(false);
  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  const [requestDetails, setRequestDetails] = useState(false);
  const [bounds, setBounds] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>();
  const surface = useRef<React.ComponentRef<typeof View>>(null);
  const present = controller.presentation;
  const pendingCode = state.pending?.code,
    pendingValue = state.pending?.quantity;
  useEffect(() => {
    alive.current = true;
    setLocalCode(undefined);
    const unsubscribe = controller.subscribe(() =>
      setState(controller.snapshot()),
    );
    controller
      .initialize()
      .then(() => setState(controller.snapshot()))
      .catch(() => setState(controller.snapshot()));
    return () => {
      alive.current = false;
      unsubscribe();
      controller.leave();
    };
  }, [controller]);
  useEffect(() => {
    if (pendingCode && pendingValue !== undefined) {
      setQuantity(String(pendingValue));
      setQuantityError('');
    }
  }, [pendingCode, pendingValue]);
  const actualPanel = state.receipt
    ? 4
    : state.pending
    ? 2
    : state.unknown
    ? 3
    : panel;
  const scopeValid = controller.currentScope();
  const closed = !['CHECKING', 'REPAIRING'].includes(present.status);
  const unavailable = !controller.connected;
  const locked =
    state.busy || state.unknown || !scopeValid || closed || unavailable;
  const ready = !locked && !!state.caseId;
  useEffect(() => {
    if (!scopeValid || state.unknown || state.pending || state.receipt)
      setRejectionReader(undefined);
  }, [scopeValid, state.unknown, state.pending, state.receipt]);
  function changeCode(value: string) {
    codeRef.current = value;
    setCode(value);
  }
  function acceptedCode(raw: string) {
    if (codeRef.current === raw) changeCode('');
    if (manual && panel === 1)
      requestAnimationFrame(() => {
        if (alive.current && controllerRef.current === controller)
          codeInput.current?.focus();
      });
  }
  function readPermission() {
    try {
      return canCaptureReadOnly?.() === true;
    } catch {
      return false;
    }
  }
  const captureReady =
    scanAvailable &&
    !state.busy &&
    !state.unknown &&
    !state.receipt &&
    !state.pending &&
    !rejected &&
    !closed &&
    (ready || readPermission());
  function readCamera(raw: string) {
    if (controllerRef.current !== controller || !raw.trim() || raw.length > 512)
      return;
    const latest = controller.snapshot();
    if (
      latest.busy ||
      latest.unknown ||
      latest.receipt ||
      latest.pending ||
      rejectedRef.current ||
      scanBusy.current ||
      closed
    )
      return;
    if (ready && controller.currentScope()) {
      changeCode(raw);
      scan(raw, 'CAMERA').catch(() => undefined);
    } else if (readPermission()) {
      setLocalCode(raw);
      setFeedback(
        'Đã đọc mã bằng camera. Chưa xác minh điều kiện xuất; chưa thêm linh kiện hoặc ghi dữ liệu.',
      );
    }
  }
  function back() {
    if (rejectionReader) {
      setRejectionReader(undefined);
      return;
    }
    if (state.pending) {
      controller.flow.cancelQuantity();
      return;
    }
    if (confirm) {
      setConfirm(false);
      return;
    }
    if (remove) {
      setRemove(undefined);
      return;
    }
    if (state.receipt) {
      returnVerifiedResult();
      return;
    }
    if (panel === 3 && !state.unknown && !state.receipt) {
      setPanel(1);
      return;
    }
    controller.leave();
    onBack();
  }
  function returnVerifiedResult() {
    if (resultExit.current) return;
    const latest = controller.snapshot();
    const receipt = latest.receipt;
    const shown = state.receipt;
    // The bridge exposes `receipt` only from the strict linkedPostResult result,
    // never from SAVE or canonical current state. Recheck the shown identity at
    // action time; do not redirect using a stale or another owner's receipt.
    if (
      !controller.currentScope() ||
      latest.busy ||
      latest.unknown ||
      !receipt ||
      !shown ||
      receipt.status !== 'POSTED' ||
      receipt.caseId !== latest.caseId ||
      receipt.id !== shown.id ||
      receipt.caseId !== shown.caseId ||
      receipt.requestId !== shown.requestId
    )
      return;
    resultExit.current = true;
    controller.leave();
    if (onVerifiedResult)
      onVerifiedResult({
        caseId: receipt.caseId,
        businessDocumentId: receipt.id,
        requestId: receipt.requestId,
      });
    else onBack();
  }
  useHardwareBack(() => {
    back();
    return true;
  });
  async function scan(raw: string, source: 'CAMERA' | 'MANUAL') {
    if (!ready || scanBusy.current || rejectedRef.current) return;
    scanBusy.current = true;
    try {
      const outcome = await controller.flow.scan(raw, source);
      if (!alive.current || controllerRef.current !== controller) return;
      if (outcome.kind === 'accepted') acceptedCode(raw);
      if (outcome.kind === 'invalid' || outcome.kind === 'duplicate') {
        const value = {
          raw,
          reason: outcome.error ?? null,
        };
        rejectedRef.current = value;
        setRejected(value);
      }
      setFeedback(
        outcome.kind === 'accepted'
          ? 'Đã thêm linh kiện vào danh sách.'
          : outcome.kind === 'quantity'
          ? undefined
          : outcome.error ?? 'Chưa thêm được mã này.',
      );
    } finally {
      scanBusy.current = false;
    }
  }
  async function review() {
    if (!ready || !state.lines.length) return;
    setPanel(3);
    await controller.flow.prepareReview();
  }
  async function footerAction() {
    if (state.receipt) {
      returnVerifiedResult();
      return;
    }
    if (state.unknown) {
      await controller.flow.reconcile();
      return;
    }
    if (!ready) return;
    if (panel === 1) {
      await review();
      return;
    }
    if (state.dirty) {
      await controller.flow.prepareReview();
      return;
    }
    if (state.canPost) setConfirm(true);
  }
  const footerLabel = state.receipt
    ? 'Xem hồ sơ bảo hành →'
    : state.busy
    ? state.request?.command === 'RECORD'
      ? 'Đang xác nhận xuất…'
      : 'Đang lưu nháp…'
    : state.unknown
    ? state.request?.command === 'SAVE'
      ? 'Đối chiếu kết quả lưu nháp'
      : 'Đối chiếu kết quả xuất'
    : actualPanel === 3
    ? state.dirty
      ? 'Lưu thay đổi'
      : 'Xác nhận xuất linh kiện →'
    : 'Kiểm tra linh kiện →';
  const context = (
    <View style={[s.card, s.row, s.context]}>
      <P19Tile name="tool" scale={scale} />
      <View style={s.fill}>
        <Text style={s.contextTitle}>{present.caseLabel}</Text>
        <Text style={s.contextDescription}>
          {present.productName || 'Chưa có dữ liệu sản phẩm'}
        </Text>
      </View>
      <Text style={s.badge}>{p09Status(present.status)}</Text>
    </View>
  );
  function row(rowData: P19Row, edit: boolean) {
    return (
      <View key={rowData.code} style={edit ? [s.card, s.topRow] : s.row}>
        <P19Tile name={rowData.kind === 'BOX' ? 'box' : 'tool'} scale={scale} />
        <View style={s.fill}>
          <View style={s.row}>
            <Text style={[s.strong, s.fill]}>{rowData.sku}</Text>
            {edit && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Xóa ' + rowData.code}
                disabled={locked}
                onPress={() => setRemove(rowData.code)}
                style={s.iconButton}
              >
                <P04Icon name="trash" size={22 * scale} color={HN_UI.textMuted} />
              </Pressable>
            )}
          </View>
          <Text style={s.contextDescription}>{rowData.name}</Text>
          {edit && (
            <>
              <Text style={s.code}>{rowData.code}</Text>
              <View style={s.partMeta}>
                <Text style={s.badge}>
                  {rowData.kind === 'BOX' ? 'Mã hộp' : 'Mã linh kiện'}
                </Text>
                {rowData.kind === 'BOX' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={'Sửa số lượng ' + rowData.code}
                    disabled={locked}
                    onPress={() => controller.flow.editQuantity(rowData.code)}
                    style={s.editQuantity}
                  >
                    <Text style={s.quantity}>× {rowData.quantity} · Sửa</Text>
                  </Pressable>
                ) : (
                  <Text style={s.quantity}>× {rowData.quantity}</Text>
                )}
              </View>
            </>
          )}
        </View>
        {!edit && <Text style={s.quantity}>× {rowData.quantity}</Text>}
      </View>
    );
  }
  function quantityStep(direction: -1 | 1) {
    const n = Number(quantity);
    const valid = Number.isSafeInteger(n);
    const disabled =
      locked ||
      (valid && (direction < 0 ? n <= 1 : n >= (state.pending?.limit ?? 0)));
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={direction < 0 ? 'Giảm' : 'Tăng'}
        accessibilityState={{ disabled }}
        disabled={disabled}
        style={{
          width: 60 * scale,
          height: 68 * scale,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: disabled?HN_UI.disabled:HN_UI.canvas,
          opacity: 1,
        }}
        onPress={() => {
          const value = String(
            direction < 0
              ? Math.max(1, (valid ? n : 2) - 1)
              : Math.min(state.pending?.limit ?? 1, (valid ? n : 0) + 1),
          );
          setQuantity(value);
          setQuantityError(controller.flow.quantityError(value));
        }}
      >
        <Text style={{ color: disabled?HN_UI.disabledForeground:HN_UI.textLink, fontSize: 26 * scale }}>
          {direction < 0 ? '−' : '+'}
        </Text>
      </Pressable>
    );
  }
  if (
    rejected &&
    state.caseId &&
    scopeValid &&
    !state.unknown &&
    !state.receipt &&
    !state.pending
  ) {
    return (
      <P09FrameBounds.Provider value={bounds}>
        <View
          ref={surface}
          style={{ flex: 1 }}
          onLayout={event => {
            setHostWidth(event.nativeEvent.layout.width);
            surface.current?.measureInWindow((left, top, w, h) =>
              setBounds({ left, top, width: w, height: h }),
            );
          }}
        >
          <P24RejectedCodePresentation
            context={{
              caseId: state.caseId,
              caseLabel: present.caseLabel,
              productName: present.productName ?? null,
              statusLabel: p09Status(present.status),
            }}
            itemKind="UNKNOWN"
            rawCode={rejected.raw}
            reason={rejected.reason}
            warehouseName={present.warehouseName ?? null}
            draftLabel={state.document.documentId}
            acceptedCodeCount={state.counts.codes}
            busy={state.busy}
            onBack={back}
            onScanAnother={() => {
              const latest = controller.snapshot();
              if (
                !controller.currentScope() ||
                latest.busy ||
                latest.unknown ||
                latest.pending ||
                latest.receipt
              )
                return;
              rejectedRef.current = undefined;
              setRejected(undefined);
              setFeedback(undefined);
              setRejectionReader(undefined);
              changeCode('');
            }}
            onEditRaw={raw => {
              const latest = controller.snapshot();
              if (
                !controller.currentScope() ||
                latest.busy ||
                latest.unknown ||
                latest.pending ||
                latest.receipt
              )
                return;
              changeCode(raw);
              setManual(true);
              rejectedRef.current = undefined;
              setRejected(undefined);
              setFeedback(undefined);
              setRejectionReader(undefined);
              requestAnimationFrame(() => {
                if (alive.current && controllerRef.current === controller)
                  codeInput.current?.focus();
              });
            }}
            onReadFull={(label, original) => {
              if (controller.currentScope())
                setRejectionReader({ label, original });
            }}
          />
          {rejectionReader && (
            <P09Dialog
              visible
              title={rejectionReader.label}
              onDismiss={() => setRejectionReader(undefined)}
              dismissOnBackdrop={false}
              footer={
                <P19Action
                  scale={scale}
                  label="Đóng"
                  onPress={() => setRejectionReader(undefined)}
                />
              }
            >
              <Text selectable style={s.text}>
                {rejectionReader.original}
              </Text>
            </P09Dialog>
          )}
        </View>
      </P09FrameBounds.Provider>
    );
  }
  return (
    <P09FrameBounds.Provider value={bounds}>
      <View
        ref={surface}
        style={{ flex: 1 }}
        onLayout={event => {
          setHostWidth(event.nativeEvent.layout.width);
          surface.current?.measureInWindow((left, top, w, h) =>
            setBounds({ left, top, width: w, height: h }),
          );
        }}
      >
        <SafeAreaView
          edges={['top', 'bottom']}
          style={s.app}
          testID={'P19.S0' + actualPanel}
        >
          <View style={s.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quay lại hồ sơ"
              onPress={back}
              style={s.back}
            >
              <P04Icon name="arrow-left" size={24 * scale} color={HN_UI.onBrand} />
            </Pressable>
            <Text style={s.title}>
              {state.receipt
                ? 'Đã xuất linh kiện'
                : actualPanel === 3
                ? 'Xác nhận xuất linh kiện'
                : 'Xuất linh kiện bảo hành'}
            </Text>
          </View>
          <View style={s.body}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                s.content,
                actualPanel === 3 ? { gap: 8 * scale } : undefined,
              ]}
            >
              <View style={s.steps}>
                {['Quét mã', 'Kiểm tra', 'Kết quả'].map((label, index) => {
                  const step =
                    actualPanel === 4 ? 3 : actualPanel === 3 ? 2 : 1;
                  return (
                    <View key={label} style={s.step}>
                      <View
                        style={[
                          s.dot,
                          step > index + 1 && s.past,
                          step === index + 1 && s.active,
                        ]}
                      >
                        {step > index + 1 ? (
                          <P19Icon
                            name="check"
                            size={15 * scale}
                            color={HN_UI.success}
                          />
                        ) : (
                          <Text
                            style={[s.small, step === index + 1 && s.activeInk]}
                          >
                            {index + 1}
                          </Text>
                        )}
                      </View>
                      <Text style={s.small}>{label}</Text>
                      {index < 2 && <View style={s.stepLine} />}
                    </View>
                  );
                })}
              </View>
              {!state.receipt && context}
              {(!scopeValid || closed || unavailable) && (
                <View style={[s.hint, s.warning]} accessibilityRole="alert">
                  <Text style={s.strong}>
                    {unavailable
                      ? 'Chưa thể xuất linh kiện lúc này'
                      : !scopeValid
                      ? 'Phiên hoặc kho đã thay đổi'
                      : closed
                      ? 'Hồ sơ chưa ở bước xuất linh kiện'
                      : 'Chưa thể xuất linh kiện lúc này'}
                  </Text>
                  <Text style={s.small}>
                    {closed
                      ? 'Chỉ hồ sơ đang kiểm tra hoặc đang sửa chữa được xuất linh kiện.'
                      : 'Đã giữ hồ sơ hiện tại. Bạn có thể quay lại hồ sơ bảo hành.'}
                  </Text>
                </View>
              )}
              {state.error && !unavailable && (
                <Text accessibilityRole="alert" style={s.alert}>
                  {state.unknown
                    ? 'Chưa xác định được kết quả; giữ yêu cầu gốc để đối chiếu.'
                    : 'Chưa xác minh được dữ liệu hoặc điều kiện xuất linh kiện.'}
                </Text>
              )}
              {(actualPanel === 1 || actualPanel === 2) && (
                <>
                  <View style={s.row}>
                    <P19Tile name="scan" scale={scale} large />
                    <View style={s.fill}>
                      <Text style={s.strong}>Quét linh kiện hoặc mã hộp</Text>
                      <Text style={s.small}>
                        Thêm linh kiện cho hồ sơ {present.caseLabel}.
                      </Text>
                    </View>
                  </View>
                  {captureReady ? (
                    <P09NativeCamera
                      autoStart={ready}
                      manual={manual}
                      disabled={!captureReady}
                      onRead={readCamera}
                      renderSurface={value => (
                        <P09CameraSurface
                          {...value}
                          manual={manual}
                          disabled={!captureReady}
                          onManual={() => setManual(v => !v)}
                          scale={scale}
                          cameraHeight={210}
                        />
                      )}
                    />
                  ) : (
                    <P09CameraSurface
                      manual={manual}
                      disabled={locked}
                      onManual={() => setManual(v => !v)}
                      scale={scale}
                      cameraHeight={210}
                    />
                  )}
                  {manual && (
                    <View style={s.card}>
                      <CodeInput
                        label="Mã linh kiện hoặc mã hộp"
                        preserveCase
                        inputRef={codeInput}
                        blurOnSubmit={false}
                        value={code}
                        maxLength={512}
                        editable={captureReady}
                        onChangeText={changeCode}
                        onSubmitEditing={() =>
                          scan(code, 'MANUAL').catch(() => undefined)
                        }
                      />
                      <P19Action
                        scale={scale}
                        label={state.busy ? 'Đang kiểm tra mã…' : 'Kiểm tra mã'}
                        disabled={!ready || !code.trim()}
                        onPress={() =>
                          scan(code, 'MANUAL').catch(() => undefined)
                        }
                      />
                    </View>
                  )}
                  {feedback && (
                    <Text
                      style={s.small}
                      accessibilityRole="text"
                      accessibilityLiveRegion="polite"
                    >
                      {feedback}
                    </Text>
                  )}
                  {localCode && (
                    <View style={s.card} testID="P19.camera-readonly-result">
                      <Text style={s.strong}>Mã vừa đọc · chưa xác minh</Text>
                      <Text style={s.small} selectable>
                        {localCode}
                      </Text>
                    </View>
                  )}
                  <View style={s.card}>
                    <View style={s.row}>
                      <Text style={s.quantity}>{state.counts.codes}</Text>
                      <Text style={[s.small, s.fill]}>mã đã quét</Text>
                      <Text style={s.small}>
                        {state.counts.quantity} linh kiện
                      </Text>
                    </View>
                    {state.lines.map(line => row(line, false))}
                  </View>
                  <View style={[s.hint, s.topRow]}>
                    <P04Icon name="info" size={20 * scale} color={HN_UI.textSecondary} />
                    <Text style={[s.small, s.fill]}>
                      {ready
                        ? 'Mã hợp lệ mới được thêm vào danh sách. Chỉ biên nhận xuất đã xác minh mới chứng minh thay đổi tồn kho.'
                        : 'Camera chỉ đọc mã trên thiết bị. Chưa mở owner kiểm tra/xuất linh kiện; không có thay đổi tồn kho.'}
                    </Text>
                  </View>
                </>
              )}
              {actualPanel === 3 && (
                <>
                  {state.unknown && (
                    <View style={[s.card, s.warning]}>
                      <Text style={s.strong}>
                        {state.request?.command === 'SAVE'
                          ? 'Chưa xác định đã lưu nháp hay chưa'
                          : 'Chưa xác định đã xuất hay chưa'}
                      </Text>
                      <Text style={s.text}>
                        Giữ nguyên phiếu, mã và số lượng. Đối chiếu kết quả
                        trước khi gửi lại.
                      </Text>
                      <P19Action
                        scale={scale}
                        label="Chi tiết đối chiếu"
                        secondary
                        onPress={() => setRequestDetails(v => !v)}
                      />
                      {requestDetails && (
                        <>
                          <P09Value
                            label="Phiếu đang làm"
                            value={state.document.documentId}
                          />
                          <P09Value label="Yêu cầu" value={state.request?.id} />
                          <P09Value
                            label="Phiên quét"
                            value={state.scanSessionId}
                          />
                          <P09Value
                            label="Version"
                            value={String(state.request?.version)}
                          />
                        </>
                      )}
                    </View>
                  )}
                  <View style={[s.hint, s.row, s.warehouse]}>
                    <P04Icon
                      name="warehouse"
                      size={24 * scale}
                      color={HN_UI.textPrimary}
                    />
                    <View style={s.fill}>
                      <Text style={s.small}>Kho xuất</Text>
                      <Text style={s.strong}>
                        {present.warehouseName || 'Kho đã xác nhận'}
                      </Text>
                    </View>
                    <P04Icon name="lock" size={19 * scale} color={HN_UI.textPrimary} />
                  </View>
                  <View style={s.row}>
                    <Text style={[s.strong, s.fill]}>Danh sách linh kiện</Text>
                    <Text style={s.small}>{state.counts.codes} mã/hộp</Text>
                  </View>
                  {state.lines.map(line => row(line, true))}
                  {!state.lines.length && (
                    <Text style={s.small}>
                      Chưa có linh kiện trong danh sách.
                    </Text>
                  )}
                  {!state.unknown && (
                    <View style={[s.hint, s.topRow]}>
                      <P04Icon name="info" size={20 * scale} color={HN_UI.textSecondary} />
                      <Text style={[s.small, s.fill]}>
                        {state.dirty
                          ? 'Lưu thay đổi trước khi xác nhận xuất linh kiện.'
                          : 'Xác nhận để xuất linh kiện ngay cho hồ sơ này.'}
                      </Text>
                    </View>
                  )}
                </>
              )}
              {state.receipt && (
                <>
                  <View style={s.success}>
                    <View style={s.successHalo}>
                      <View style={s.successMark}>
                        <P19Icon name="check" size={51 * scale} color={HN_UI.onBrand} />
                      </View>
                    </View>
                    <Text style={s.successTitle}>
                      Xuất linh kiện{'\n'}thành công
                    </Text>
                    <Text style={[s.badge, s.posted]}>Đã xuất</Text>
                    <Text style={s.successCopy}>
                      Linh kiện đã được xuất cho hồ sơ {present.caseLabel}.
                      {'\n'}
                      Bạn có thể xem lại trong hồ sơ bảo hành.
                    </Text>
                  </View>
                  <View style={s.card}>
                    <P19ResultSummary
                      scale={scale}
                      rows={[
                        {
                          label: 'Phiếu xuất',
                          value: state.receipt.documentNo,
                        },
                        { label: 'Hồ sơ bảo hành', value: present.caseLabel },
                        {
                          label: 'Số mã/hộp',
                          value: String(state.counts.codes),
                        },
                        {
                          label: 'Tổng số lượng',
                          value: state.receipt.quantity + ' linh kiện',
                        },
                      ]}
                    />
                  </View>
                  <View style={s.row}>
                    <P04Icon name="history" size={22 * scale} color={HN_UI.success} />
                    <Text style={s.small}>
                      Phiếu đã xuất được lưu theo hồ sơ.
                    </Text>
                  </View>
                </>
              )}
            </ScrollView>
            <View style={s.footer}>
              {actualPanel === 3 && (
                <View style={s.row}>
                  <Text style={[s.small, s.fill]}>
                    {state.counts.codes} mã/hộp
                  </Text>
                  <Text style={s.quantity}>
                    {state.counts.quantity} linh kiện
                  </Text>
                </View>
              )}
              <P19Action
                scale={scale}
                label={footerLabel}
                disabled={
                  state.busy ||
                  (!state.receipt &&
                    (unavailable ||
                      !scopeValid ||
                      (!state.unknown &&
                        (!state.lines.length ||
                          (actualPanel === 3 &&
                            !state.dirty &&
                            !state.canPost)))))
                }
                onPress={() => footerAction().catch(() => undefined)}
              />
              {actualPanel === 3 && !state.receipt && !state.unknown && (
                <P19Action
                  scale={scale}
                  label="Quay lại quét"
                  secondary
                  link
                  disabled={state.busy}
                  onPress={() => setPanel(1)}
                />
              )}
            </View>
          </View>
        </SafeAreaView>
        {!!state.pending && (
          <P09Dialog
            visible
            title="Hộp linh kiện"
            placement="bottom"
            panelHeight={Platform.OS==='web'?671*scale:undefined}
            headerAccessory={Platform.OS==='web'?<Pressable accessibilityRole="button" accessibilityLabel="Hủy nhập số lượng" disabled={locked} onPress={()=>{if(!locked)controller.flow.cancelQuantity();}} style={{position:'absolute',right:0,top:20,width:44,height:44,alignItems:'center',justifyContent:'center'}}><P04Icon name="x" size={24} color={HN_UI.textPrimary}/></Pressable>:undefined}
            titleStyle={{
              fontSize: (Platform.OS==='web'?24:22) * scale,
              lineHeight: (Platform.OS==='web'?34:29) * scale,
              fontWeight: '700',
            }}
            onDismiss={() => controller.flow.cancelQuantity()}
            dismissOnBackdrop={false}
            footer={
              <View style={{ gap: 10 }}>
                <P19Action
                  scale={scale}
                  label="Xác nhận số lượng"
                  disabled={locked || !!controller.flow.quantityError(quantity)}
                  onPress={() => {
                    const error = controller.flow.quantityError(quantity);
                    if (error) {
                      setQuantityError(error);
                      return;
                    }
                    const outcome = controller.flow.quantity(quantity);
                    if (outcome.kind === 'accepted' && state.pending)
                      acceptedCode(state.pending.code);
                    else if (outcome.kind === 'invalid')
                      setQuantityError(
                        outcome.error || 'Số lượng chưa hợp lệ.',
                      );
                  }}
                />
                <P19Action
                  scale={scale}
                  label="Hủy"
                  secondary
                  link
                  onPress={() => controller.flow.cancelQuantity()}
                />
              </View>
            }
          >
            <View style={{ gap: 18 * scale,...(Platform.OS==='web'?{paddingTop:33*scale}:{}) }}>
              <View style={s.row}>
                <P19Tile name="box" scale={scale} />
                <View style={s.fill}>
                  <Text style={s.strong}>{state.pending.sku}</Text>
                  <Text style={s.contextDescription}>{state.pending.name}</Text>
                  <Text selectable style={s.contextDescription}>
                    {state.pending.code}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  s.row,
                  {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderColor: HN_UI.border,
                    paddingTop: 18 * scale,
                    ...(Platform.OS==='web'?{marginTop:4*scale}:{}),
                  },
                ]}
              >
                <Text style={[s.small, s.fill]}>Tồn khả dụng</Text>
                <Text style={[s.text, { color: HN_UI.success, fontWeight: '600' }]}>
                  {state.pending.available} linh kiện
                </Text>
              </View>
              {state.pending.limit !== state.pending.available && (
                <Text style={s.small}>
                  Còn có thể chọn trong phiếu: {state.pending.limit} linh kiện
                </Text>
              )}
              <Input
                label={Platform.OS==='web'?'Số lượng linh kiện cần xuất *':'Số lượng linh kiện cần xuất'}
                accessibilityLabel="Số lượng linh kiện cần xuất"
                containerStyle={Platform.OS==='web'?{marginTop:9*scale,gap:18*scale}:undefined}
                keyboardType="number-pad"
                selectTextOnFocus
                fieldHeight={70 * scale}
                fieldStyle={{
                  paddingHorizontal: 0,
                  overflow: 'hidden',
                  borderRadius: 12 * scale,
                  borderColor: HN_UI.borderControl,
                }}
                inputStyle={{
                  textAlign: 'center',
                  fontSize: 30 * scale,
                  lineHeight: 40 * scale,
                  fontWeight: '600',
                  color: HN_UI.textPrimary,
                }}
                labelStyle={{
                  fontSize: 15 * scale,
                  lineHeight: 23 * scale,
                  color: HN_UI.textPrimary,
                }}
                leftAdornment={quantityStep(-1)}
                rightAdornment={quantityStep(1)}
                helperText={
                  'Nhập số lượng cần dùng cho hồ sơ ' + present.caseLabel + '.'
                }
                value={quantity}
                onChangeText={value => {
                  setQuantity(value);
                  setQuantityError(controller.flow.quantityError(value));
                }}
                errorText={quantityError}
              />
              <View style={[s.hint, s.topRow,Platform.OS==='web'&&{marginTop:24*scale}]}>
                <P04Icon name="info" size={20 * scale} color={HN_UI.textSecondary} />
                <Text style={[s.small, s.fill]}>
                  Chỉ xác nhận số lượng. Bước này chưa xuất kho.
                </Text>
              </View>
            </View>
          </P09Dialog>
        )}
        {confirm && (
          <P09Dialog
            visible
            title="Xác nhận xuất linh kiện"
            onDismiss={() => setConfirm(false)}
            dismissOnBackdrop={false}
            footer={
              <View style={{ gap: 10 }}>
                <P19Action
                  scale={scale}
                  label="Xác nhận giảm tồn"
                  disabled={!ready || !state.canPost}
                  onPress={() => {
                    setConfirm(false);
                    controller.flow.post().catch(() => undefined);
                  }}
                />
                <P19Action
                  scale={scale}
                  label="Hủy"
                  secondary
                  onPress={() => setConfirm(false)}
                />
              </View>
            }
          >
            <Text style={s.text}>
              Xuất {state.counts.quantity} linh kiện cho hồ sơ{' '}
              {present.caseLabel}. Thao tác này làm giảm tồn kho sau khi được
              xác nhận.
            </Text>
          </P09Dialog>
        )}
        {!!remove && (
          <P09Dialog
            visible
            title="Bỏ linh kiện khỏi danh sách?"
            onDismiss={() => setRemove(undefined)}
            footer={
              <View style={{ gap: 10 }}>
                <P19Action
                  scale={scale}
                  label="Bỏ linh kiện"
                  disabled={locked}
                  onPress={() => {
                    controller.flow.remove(remove);
                    setRemove(undefined);
                  }}
                />
                <P19Action
                  scale={scale}
                  label="Hủy"
                  secondary
                  onPress={() => setRemove(undefined)}
                />
              </View>
            }
          >
            <Text style={s.text}>{remove}</Text>
          </P09Dialog>
        )}
      </View>
    </P09FrameBounds.Provider>
  );
}
