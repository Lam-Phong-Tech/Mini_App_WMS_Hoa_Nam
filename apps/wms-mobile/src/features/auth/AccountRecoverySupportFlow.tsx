import {HN_UI} from '../../theme/uiKitV3';
import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '../../ui/Text';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { SCANNER_COLORS } from '../../ui/ScannerPalette';
import { useHardwareBack } from '../../app/useHardwareBack';
import { P04Icon } from '../inbound/P04Icon';
import { P14RecoveryIcon } from './P14RecoveryIcon';
import { copyNfcIdentifier } from '../../native/nfc';
import {
  createP14RecoveryService,
  RecoveryRequestError,
  type RecoveryCommand,
  type RecoveryReceipt,
  type P14RecoveryService,
} from '../../services/wms/p14Recovery';
import {
  documentTimestampParts,
  parseDocumentTimestamp,
} from '../../services/wms/documentTimestamps';

const s = StyleSheet.create({
  fill: { flex: 1, minWidth: 0, minHeight: 0 },
  root: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    maxWidth: 494,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: HN_UI.shell,
  },
  header: {
    minHeight: 88,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  back: { width: 44, height: 44, justifyContent: 'center' },
  headerTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    color: HN_UI.onBrand,
  },
  subtitle: { fontSize: 16, lineHeight: 23, color: HN_UI.selected },
  paper: {
    backgroundColor: HN_UI.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 24,
    gap: 28,
  },
  hero: { alignItems: 'center', gap: 18 },
  circle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HN_UI.selected,
  },
  heading: {
    fontSize: 26,
    lineHeight: 34,
    color: HN_UI.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
  },
  hint: { fontSize: 16, lineHeight: 26, color: HN_UI.textMuted, textAlign: 'center' },
  info: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: HN_UI.canvas,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoTitle: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    color: HN_UI.textLink,
  },
  infoText: { fontSize: 15, lineHeight: 24, color: HN_UI.textSecondary },
  footer: { paddingHorizontal: 24, paddingBottom: 24, paddingTop: 12, gap: 10 },
  action: {
    minHeight: 56,
    borderRadius: 10,
    backgroundColor: SCANNER_COLORS.primary,
  },
  summary: {
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: HN_UI.canvas,
  },
  row: {
    minHeight: 78,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  line: { borderBottomWidth: 1, borderBottomColor: HN_UI.border },
  tile: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: HN_UI.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 14, lineHeight: 21, color: HN_UI.textSecondary },
  value: { fontSize: 16, lineHeight: 24, color: HN_UI.textPrimary },
  copy: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: HN_UI.border,
    backgroundColor: HN_UI.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { fontSize: 14, lineHeight: 22, color: HN_UI.danger },
  status: { fontSize: 14, lineHeight: 22, color: HN_UI.textSecondary },
});
function Frame({
  received = false,
  onBack,
  disabled = false,
  footer,
  children,
}: {
  received?: boolean;
  onBack(): void;
  disabled?: boolean;
  footer: ReactNode;
  children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  useHardwareBack(() => {
    if (!disabled) onBack();
    return true;
  });
  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      testID={received ? 'P14.S02' : 'P14.S01'}
      style={s.root}
    >
      <View style={s.header}>
        <Svg
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          width={Math.min(width, 494)}
          height="100%"
        >
          <Defs>
            <LinearGradient id="p14-support-header" x1="0%" x2="100%">
              <Stop stopColor={HN_UI.shell} />
              <Stop offset="1" stopColor={HN_UI.shell} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#p14-support-header)" />
        </Svg>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại đăng nhập"
          style={s.back}
          disabled={disabled}
          onPress={onBack}
        >
          <P04Icon name="arrow-left" size={24} color={HN_UI.onBrand} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.headerTitle}>
            {received ? 'Yêu cầu đã tiếp nhận' : 'Khôi phục tài khoản'}
          </Text>
          <Text style={s.subtitle}>Kho Hoa Nam</Text>
        </View>
      </View>
      <KeyboardAvoidingView
        style={[s.fill, s.paper]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          style={s.fill}
          contentContainerStyle={s.content}
        >
          {children}
        </ScrollView>
        <View style={s.footer}>{footer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
function Hero({ received = false }: { received?: boolean }) {
  return (
    <View style={s.hero}>
      <View style={[s.circle, received && { backgroundColor: HN_UI.successSoft }]}>
        {received ? (
          <P04Icon name="check" size={50} color={HN_UI.success} />
        ) : (
          <P14RecoveryIcon kind="user" size={48} color={HN_UI.textLink} />
        )}
      </View>
      <Text accessibilityRole="header" style={s.heading}>
        {received ? 'Yêu cầu đã tiếp nhận' : 'Khôi phục tài khoản'}
      </Text>
      <Text style={s.hint}>
        {received
          ? 'Yêu cầu hỗ trợ khôi phục quyền truy cập đã được ghi nhận.'
          : 'Nhập tên đăng nhập để gửi yêu cầu hỗ trợ khôi phục quyền truy cập hệ thống.'}
      </Text>
    </View>
  );
}
export function P14RecoveryReceived({
  username,
  receipt,
  onDone,
  copy = copyNfcIdentifier,
}: {
  username: string;
  receipt: RecoveryReceipt;
  onDone(): void;
  copy?: (value: string) => Promise<void>;
}) {
  const [copyState, setCopyState] = useState(''),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const parts = documentTimestampParts(
    parseDocumentTimestamp(receipt.receivedAt),
  );
  const time = parts
    ? `${parts.hour}:${parts.minute} · ${parts.day}/${parts.month}/${parts.year}`
    : 'Chưa có thời điểm được xác minh';
  return (
    <Frame
      received
      onBack={onDone}
      footer={<Button label="Về Đăng nhập" onPress={onDone} style={s.action} />}
    >
      <Hero received />
      <View style={[s.info, { backgroundColor: HN_UI.warningSoft }]}>
        <P04Icon name="info" color={HN_UI.warning} size={24} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.infoTitle, { color: HN_UI.warning }]}>
            Chờ quản trị viên xác minh
          </Text>
          <Text style={[s.infoText, { color: HN_UI.warning }]}>
            Quyền truy cập chỉ được cấp lại sau khi thông tin được xác minh.
          </Text>
        </View>
      </View>
      <View style={s.summary}>
        {[
          ['Tên đăng nhập', username, 'user'],
          ['Thời gian gửi yêu cầu', time, 'calendar'],
          ['Mã yêu cầu', receipt.operationId, 'document'],
        ].map(([label, value, icon], i) => (
          <View key={label} style={[s.row, i < 2 && s.line]}>
            <View style={s.tile}>
              <P04Icon name={icon} assetPack size={24} color={HN_UI.textMuted} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={s.label}>{label}</Text>
              <Text selectable style={s.value}>
                {value}
              </Text>
            </View>
            {i === 2 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sao chép mã yêu cầu"
                style={s.copy}
                onPress={() => {
                  void copy(receipt.operationId)
                    .then(() => {
                      if (live.current) setCopyState('Đã sao chép mã yêu cầu.');
                    })
                    .catch(() => {
                      if (live.current)
                        setCopyState(
                          'Chưa sao chép được mã. Bạn có thể chọn và sao chép nội dung.',
                        );
                    });
                }}
              >
                <P04Icon name="copy" size={22} color={HN_UI.textMuted} />
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      {!!copyState && (
        <Text accessibilityLiveRegion="polite" style={s.status}>
          {copyState}
        </Text>
      )}
    </Frame>
  );
}
export function AccountRecoverySupportFlow({
  onBack,
  onDone,
  service: injected,
}: {
  onBack(): void;
  onDone(): void;
  service?: P14RecoveryService;
}) {
  const service = useRef(injected ?? createP14RecoveryService()).current,
    [username, setUsername] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [fieldError,setFieldError]=useState(''),
    [uncertain, setUncertain] = useState(false),
    [receipt, setReceipt] = useState<RecoveryReceipt>(),
    [exit, setExit] = useState(false),
    [cooldown, setCooldown] = useState(0),
    [clock, setClock] = useState(Date.now());
  const command = useRef<RecoveryCommand | undefined>(undefined),
    active = useRef(true),
    flight = useRef(false),
    unknownRef = useRef(false),
    controller = useRef<AbortController | undefined>(undefined),
    ticket = useRef(0);
  useEffect(() => {
    active.current = true;
    const sub = AppState.addEventListener('change', next => {
      if (next !== 'active') controller.current?.abort();
    });
    return () => {
      active.current = false;
      ticket.current++;
      controller.current?.abort();
      command.current = undefined;
      sub.remove();
    };
  }, []);
  useEffect(() => {
    if (cooldown <= Date.now()) return;
    const id = setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (now >= cooldown) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown]);
  const wait = Math.max(0, Math.ceil((cooldown - clock) / 1000));
  const leave = () => {
    if (flight.current) return;
    if (unknownRef.current) {
      setExit(true);
      return;
    }
    onBack();
  };
  async function run(check = false) {
    if (flight.current || !active.current || (!check && wait > 0)) return;
    flight.current = true;
    setBusy(true);
    setError('');
    setFieldError('');
    const id = ++ticket.current,
      c = new AbortController(),
      reconciling = check || unknownRef.current;
    controller.current = c;
    try {
      const frozen = command.current ?? (await service.prepare(username));
      if (!active.current || id !== ticket.current) return;
      command.current = frozen;
      const received = await (reconciling
        ? service.check(frozen, c.signal)
        : service.submit(frozen, c.signal));
      if (active.current && id === ticket.current) {
        unknownRef.current = false;
        setUncertain(false);
        setReceipt(received);
      }
    } catch (e) {
      if (active.current && id === ticket.current) {
        const failure =
          e instanceof RecoveryRequestError
            ? e
            : new RecoveryRequestError(
                'RECOVERY_UNAVAILABLE',
                'Không chuẩn bị được yêu cầu hỗ trợ an toàn.',
              );
        if(failure.code==='RECOVERY_USERNAME_INVALID')setFieldError(failure.message);
        else setError(failure.message+(failure.requestId?'\nMã đối chiếu: '+failure.requestId:''));
        unknownRef.current = reconciling || failure.uncertain;
        setUncertain(unknownRef.current);
        if (!reconciling && !failure.uncertain) command.current = undefined;
        if (failure.retryAfterSeconds) {
          setCooldown(Date.now() + failure.retryAfterSeconds * 1000);
          setClock(Date.now());
        }
      }
    } finally {
      if (active.current && id === ticket.current) {
        flight.current = false;
        setBusy(false);
      }
    }
  }
  if (receipt && command.current)
    return (
      <P14RecoveryReceived
        username={command.current.username}
        receipt={receipt}
        onDone={onDone}
      />
    );
  return (
    <Frame
      onBack={leave}
      disabled={busy}
      footer={
        <>
          <Button
            label={
              uncertain
                ? 'Kiểm tra kết quả'
                : wait > 0
                ? `Thử lại sau ${wait}s`
                : 'Gửi yêu cầu hỗ trợ'
            }
            loading={busy}
            disabled={busy || (!uncertain && wait > 0)}
            onPress={() => void run(uncertain)}
            style={s.action}
          />
        </>
      }
    >
      <Hero />
      <Input
        label="Tên đăng nhập"
        value={username}
        errorText={fieldError||undefined}
        editable={!busy && !uncertain}
        maxLength={200}
        autoCapitalize="none"
        autoCorrect={false}
        fieldHeight={58}
        restingBorderColor={HN_UI.border}
        labelStyle={{
          fontSize: 18,
          lineHeight: 27,
          fontWeight: '700',
          color: HN_UI.textPrimary,
        }}
        fieldStyle={{ borderRadius: 12, backgroundColor: HN_UI.surface }}
        leftAdornment={<P04Icon name="user" size={24} color={HN_UI.textMuted} />}
        placeholder="Nhập tên đăng nhập của bạn"
        onChangeText={value => {
          setUsername(value);
          setError('');
          setFieldError('');
        }}
        onSubmitEditing={() => void run(uncertain)}
      />
      <View style={s.info}>
        <P04Icon name="info" color={HN_UI.textSecondary} size={24} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.infoTitle}>Hỗ trợ truy cập</Text>
          <Text style={s.infoText}>
            Liên hệ quản trị viên để xác minh và cấp lại quyền truy cập.
          </Text>
        </View>
      </View>
      {!!error && (
        <Text accessibilityLiveRegion="polite" style={s.error}>
          {error}
        </Text>
      )}
      <Dialog
        visible={exit}
        title="Kết quả gửi chưa xác minh"
        message="Yêu cầu có thể đã được tiếp nhận. Bạn có thể tiếp tục kiểm tra kết quả trước khi rời màn hình."
        onDismiss={() => setExit(false)}
        footer={
          <>
            <Button label="Tiếp tục kiểm tra" onPress={() => setExit(false)} />
            <Button variant="secondary" label="Về Đăng nhập" onPress={onBack} />
          </>
        }
      />
    </Frame>
  );
}
