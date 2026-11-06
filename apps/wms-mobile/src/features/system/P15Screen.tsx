import {HN_UI} from '../../theme/uiKitV3';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Dialog } from '../../ui/Dialog';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';
import {
  P15Action,
  P15_COLORS as C,
  P15Frame,
  P15Glyph,
  P15Hint,
  P15StateCard,
  useP15Scale,
  type P15GlyphName,
} from './P15Presentation';

export type P15ActionCallback = () => void | Promise<void>;
export interface P15BoundaryProps {
  active?: boolean;
  /** Stable route/actor/auth-session/warehouse identity supplied by owner. */
  ownerKey?: string;
  isCurrent?: () => boolean;
  busy?: boolean;
  onBack?: P15ActionCallback;
  onActionError?: (error: unknown) => void;
  footer?: React.ReactNode;
}
export interface P15DocumentContext {
  label: string;
  number: string;
  status: string;
}

/** No result interpretation or retry loop. Parent callbacks retain the request. */
function useActions(props: P15BoundaryProps) {
  const latest = useRef(props);
  latest.current = props;
  const renderTicket = Symbol('p15-render');
  const latestRender = useRef(renderTicket);
  latestRender.current = renderTicket;
  const mounted = useRef(true);
  const pending = useRef<{ key?: string; token: symbol } | undefined>(
    undefined,
  );
  const [running, setRunning] = useState<{ key?: string; name: string }>();
  const [guide, setGuide] = useState<{
    key?: string;
    title: string;
    message: string;
  }>();
  const visibleGuide = guide?.key === props.ownerKey ? guide : undefined;
  const guideRef = useRef(visibleGuide);
  guideRef.current = visibleGuide;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current = undefined;
    };
  }, []);
  const current = (key = props.ownerKey) =>
    mounted.current &&
    latest.current.active !== false &&
    latest.current.ownerKey === key &&
    (latest.current.isCurrent?.() ?? true);
  const openGuide = (title: string, message: string) => {
    if (
      current() &&
      latestRender.current === renderTicket &&
      !latest.current.busy &&
      !(pending.current && pending.current.key === props.ownerKey)
    )
      setGuide({ key: props.ownerKey, title, message });
  };
  const closeGuide = () => setGuide(undefined);
  const run = (name: string, action?: P15ActionCallback) => {
    const key = props.ownerKey;
    if (
      !action ||
      !current(key) ||
      latestRender.current !== renderTicket ||
      latest.current.busy ||
      guideRef.current ||
      (pending.current && pending.current.key === key)
    )
      return;
    const token = Symbol(name);
    pending.current = { key, token };
    setRunning({ key, name });
    void (async () => {
      try {
        await action();
      } catch (error) {
        if (current(key)) {
          if (latest.current.onActionError) latest.current.onActionError(error);
          else
            setGuide({
              key,
              title: 'Chưa hoàn tất thao tác',
              message:
                'Chưa xác minh được kết quả. Giữ nguyên công việc và yêu cầu gốc; quay lại màn đang làm để kiểm tra. Không gửi lại phiếu.',
            });
        }
      } finally {
        if (pending.current?.token === token) {
          pending.current = undefined;
          if (mounted.current) setRunning(undefined);
        }
      }
    })();
  };
  const navigateBack = () => {
    if (!current()) return;
    if (guideRef.current) {
      closeGuide();
      return;
    }
    // Owner's Back handler cancels/invalidates its read; no request is replayed.
    if (!latest.current.busy) void latest.current.onBack?.();
  };
  return {
    run,
    openGuide,
    navigateBack,
    busy: !!props.busy || (running?.key === props.ownerKey && !!running),
    running: running?.key === props.ownerKey ? running?.name : undefined,
    guide: (
      <Dialog
        visible={props.active !== false && !!visibleGuide}
        title={visibleGuide?.title ?? ''}
        message={visibleGuide?.message}
        dismissOnBackdrop={false}
        onDismiss={closeGuide}
        footer={<Button label="Đóng" onPress={closeGuide} />}
      />
    ),
  };
}

function Context({ context }: { context?: P15DocumentContext }) {
  const s = useP15Scale();
  if (!context) return null;
  return (
    <View
      style={{
        flexShrink: 0,
        marginTop: 24 * s,
        paddingVertical: 14 * s,
        paddingHorizontal: 16 * s,
        borderWidth: 1,
        borderColor: HN_UI.border,
        borderRadius: 12 * s,
        backgroundColor: HN_UI.canvas,
      }}
    >
      <Text style={{ color: C.muted, fontSize: 15 * s, lineHeight: 23 * s }}>
        {context.label}
      </Text>
      <Text
        selectable
        style={{
          color: C.ink,
          fontWeight: '700',
          fontSize: 20 * s,
          lineHeight: 28 * s,
        }}
      >
        {context.number}
      </Text>
      <Text style={{ color: C.muted, fontSize: 17 * s, lineHeight: 25.5 * s }}>
        {context.status}
      </Text>
    </View>
  );
}

export interface P15ConnectionScreenProps extends P15BoundaryProps {
  intent: 'read' | 'reconcile' | 'unavailable';
  unknown?: boolean;
  context?: P15DocumentContext;
  onRead?: P15ActionCallback;
  onReconcile?: P15ActionCallback;
  onHome?: P15ActionCallback;
}
export function P15ConnectionScreen(props: P15ConnectionScreenProps) {
  const a = useActions(props);
  if (props.active === false) return null;
  const reconcile = props.unknown || props.intent === 'reconcile';
  const read = reconcile
    ? props.onReconcile
    : props.intent === 'read'
    ? props.onRead
    : undefined;
  const message = reconcile
    ? 'Chưa xác định kết quả gửi. Không gửi lại phiếu trước khi đối chiếu.'
    : props.intent === 'read'
    ? 'Chưa tải được dữ liệu. Thử tải lại khi kết nối ổn định.'
    : 'Chưa thể kiểm tra kết quả lúc này. Xem hướng dẫn để tiếp tục xử lý.';
  const back = props.context ? props.onBack : props.onHome;
  return (
    <P15Frame
      panel="P15.S01"
      title="Kết nối"
      onBack={props.onBack ? a.navigateBack : undefined}
      footer={props.footer}
    >
      <P15StateCard
        glyph="wifi"
        heading="Chưa thể đồng bộ"
        message={message}
        extra={<Context context={props.context} />}
        actions={
          <>
            <P15Action
              glyph="retry"
              busy={a.running === 'read'}
              disabled={a.busy && a.running !== 'read'}
              label={
                !read
                  ? 'Xem cách xử lý'
                  : a.running === 'read'
                  ? reconcile
                    ? 'Đang đối chiếu…'
                    : 'Đang tải…'
                  : reconcile
                  ? 'Đối chiếu kết quả'
                  : 'Tải lại'
              }
              onPress={() =>
                read
                  ? a.run('read', read)
                  : a.openGuide(
                      'Chưa thể đồng bộ',
                      'Chưa có nguồn kiểm tra kết quả được kết nối. Quay lại công việc đang làm để kiểm tra; giữ nguyên phiếu và yêu cầu gốc, không gửi lại khi chưa rõ kết quả.',
                    )
              }
            />
            <P15Action
              secondary
              glyph={props.context ? 'back' : 'home'}
              disabled={!back || a.busy}
              label={props.context ? 'Quay lại phiếu' : 'Về Trang chủ'}
              onPress={() => a.run('back', back)}
            />
          </>
        }
      />
      {a.guide}
    </P15Frame>
  );
}

export interface P15ExpiredScreenProps extends P15BoundaryProps {
  onRelogin: P15ActionCallback;
  reasonCode?: string;
}
export function P15ExpiredScreen(props: P15ExpiredScreenProps) {
  const a = useActions(props);
  if (props.active === false) return null;
  const replaced = props.reasonCode === 'AUTH_SESSION_REPLACED';
  return (
    <P15Frame
      panel="P15.S02"
      title="Phiên hết hạn"
      onBack={props.onBack ? a.navigateBack : undefined}
      footer={props.footer}
    >
      <P15StateCard
        glyph="document"
        clock
        heading={
          replaced
            ? 'Phiên đăng nhập đã được thay thế'
            : 'Phiên đăng nhập hết hạn'
        }
        message={
          replaced
            ? 'Một lần đăng nhập khác đã thay thế phiên này. Vui lòng đăng nhập lại và xác nhận phiên để tiếp tục.'
            : 'Đăng nhập lại và xác nhận phiên để tiếp tục công việc.'
        }
        extra={
          <P15Hint>
            {replaced
              ? 'Dữ liệu chưa gửi được giữ nguyên; không tự gửi lại hoặc tiếp quản bằng phiên mới.'
              : 'Dữ liệu chưa gửi không được tự động gửi lại.'}
          </P15Hint>
        }
        actions={
          <P15Action
            glyph="login"
            label="Đăng nhập lại"
            busy={a.busy}
            onPress={() => a.run('login', props.onRelogin)}
          />
        }
      />
      {a.guide}
    </P15Frame>
  );
}

export interface P15PermissionScreenProps extends P15BoundaryProps {
  onHome?: P15ActionCallback;
  actionLabel?: string;
  context?: P15DocumentContext;
  contact?: { label: string; value: string } | null;
}
export function P15PermissionScreen(props: P15PermissionScreenProps) {
  const a = useActions(props);
  if (props.active === false) return null;
  const contact =
    props.contact?.label.trim() && props.contact?.value.trim()
      ? props.contact
      : null;
  const back = props.onBack ?? props.onHome;
  return (
    <P15Frame
      panel="P15.S03"
      title="Quyền truy cập"
      onBack={props.onBack ? a.navigateBack : undefined}
      footer={props.footer}
    >
      <P15StateCard
        glyph="lock"
        heading="Không có quyền thực hiện"
        message={
          props.actionLabel
            ? `Bạn chưa có quyền ${props.actionLabel}.`
            : 'Tài khoản không được phép thực hiện thao tác này.'
        }
        extra={
          <>
            <Context context={props.context} />
            {!contact && (
              <P15Hint>
                Chưa có kênh quản trị được cấu hình trong ứng dụng.
              </P15Hint>
            )}
          </>
        }
        actions={
          <>
            <P15Action
              glyph="back"
              label={
                props.onBack
                  ? props.context
                    ? 'Quay lại phiếu'
                    : 'Quay lại'
                  : 'Về trang chủ'
              }
              disabled={!back || a.busy}
              onPress={() => a.run('back', back)}
            />
            <P15Action
              secondary={!!contact}
              help={!contact}
              glyph={contact ? 'user' : undefined}
              label={
                contact ? 'Liên hệ quản trị' : 'Hướng dẫn liên hệ quản trị'
              }
              disabled={a.busy}
              onPress={() =>
                a.openGuide(
                  'Liên hệ quản trị',
                  contact
                    ? `${contact.label}: ${contact.value}`
                    : 'Chưa có kênh liên hệ quản trị được cấu hình. Vui lòng dùng kênh hỗ trợ nội bộ do đơn vị cung cấp.',
                )
              }
            />
          </>
        }
      />
      {a.guide}
    </P15Frame>
  );
}

export type P15DeviceState =
  | 'checking'
  | 'not-requested'
  | 'denied'
  | 'blocked'
  | 'granted'
  | 'available'
  | 'disabled'
  | 'unsupported'
  | 'unavailable'
  | 'hardware-error';
export interface P15DeviceScreenProps extends P15BoundaryProps {
  camera: Exclude<P15DeviceState, 'available' | 'disabled'>;
  nfc: Exclude<P15DeviceState, 'granted'>;
  onRequestCamera?: P15ActionCallback;
  onCheckCamera?: P15ActionCallback;
  onOpenScanner?: P15ActionCallback;
  onOpenNfc?: P15ActionCallback;
}
const deviceLabels: Record<P15DeviceState, string> = {
  checking: 'Đang kiểm tra…',
  'not-requested': 'Chưa yêu cầu quyền',
  denied: 'Chưa cho phép',
  blocked: 'Quyền đang bị chặn',
  granted: 'Đã cho phép camera',
  available: 'Có thể kiểm tra tại màn NFC',
  disabled: 'NFC đang tắt',
  unsupported: 'Không khả dụng trên thiết bị này',
  unavailable: 'Thiết bị tạm chưa sẵn sàng',
  'hardware-error': 'Chưa truy cập được thiết bị',
};
const guides = {
  camera:
    'Cho phép Camera trong cài đặt quyền của ứng dụng, sau đó quay lại kiểm tra. Nếu đã cấp quyền mà camera chưa hoạt động, kiểm tra ứng dụng đang dùng camera và thử lại. Ứng dụng không tự cấp quyền.',
  nfc: 'Dùng thiết bị có phần cứng NFC và bản ứng dụng hỗ trợ đọc thẻ. Nếu NFC đang tắt, bật trong cài đặt rồi quay lại màn NFC để kiểm tra. Khả năng hỗ trợ chưa xác nhận thẻ đã liên kết; không ghi hoặc xác nhận lại yêu cầu cũ.',
};
function DeviceCard({
  name,
  state,
  glyph,
  explanation,
  children,
  last = false,
}: {
  name: string;
  state: P15DeviceState;
  glyph: P15GlyphName;
  explanation: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  const s = useP15Scale();
  const neutral = ['not-requested', 'checking', 'available'].includes(state);
  return (
    <View
      style={{
        flexShrink: 0,
        padding: 20 * s,
        borderRadius: 16 * s,
        backgroundColor: HN_UI.surface,
        marginBottom: last ? 0 : 16 * s,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 14 * s,
          marginBottom: 18 * s,
        }}
      >
        <View
          style={{
            width: 56 * s,
            height: 56 * s,
            flexShrink: 0,
            borderRadius: 12 * s,
            backgroundColor: HN_UI.canvas,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <P15Glyph name={glyph} size={30 * s} color={HN_UI.textLink} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            accessibilityRole="header"
            style={{
              fontSize: 21 * s,
              lineHeight: 28 * s,
              fontWeight: '700',
              color: C.ink,
            }}
          >
            {name}
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            style={{
              fontSize: 17 * s,
              lineHeight: 24 * s,
              fontWeight: '600',
              color:
                state === 'granted' ? C.success : neutral ? C.muted : C.danger,
            }}
          >
            {deviceLabels[state]}
          </Text>
          <Text
            style={{
              fontSize: 16 * s,
              lineHeight: 23 * s,
              marginTop: 5 * s,
              color: C.muted,
            }}
          >
            {explanation}
          </Text>
        </View>
      </View>
      <View style={{ gap: 12 * s }}>{children}</View>
    </View>
  );
}
function DeviceContent(
  props: P15DeviceScreenProps & { actions: ReturnType<typeof useActions> },
) {
  const s = useP15Scale(),
    a = props.actions;
  const cameraDenied = props.camera === 'denied' || props.camera === 'blocked';
  const cameraUnsupported = props.camera === 'unsupported';
  const nfcUnsupported = props.nfc === 'unsupported';
  const nfcDenied = props.nfc === 'denied' || props.nfc === 'blocked';
  const requestable = props.camera === 'not-requested';
  const cameraAction = requestable
    ? props.onRequestCamera
    : props.camera === 'granted' && props.onOpenScanner
    ? props.onOpenScanner
    : props.onCheckCamera;
  const cameraGuide = () =>
    a.openGuide(
      cameraUnsupported
        ? 'Thiết bị hỗ trợ camera'
        : cameraDenied
        ? 'Hướng dẫn cấp quyền camera'
        : 'Hướng dẫn camera',
      guides.camera,
    );
  const cameraExplanation =
    props.camera === 'granted'
      ? 'Camera đã được cho phép. Quay lại màn quét để tiếp tục.'
      : cameraDenied
      ? 'Cho phép Camera trong cài đặt quyền, sau đó quay lại kiểm tra.'
      : props.camera === 'hardware-error' || props.camera === 'unavailable'
      ? 'Camera có thể đang bận hoặc chưa truy cập được. Kiểm tra thiết bị rồi thử lại.'
      : cameraUnsupported
      ? 'Môi trường hiện tại chưa hỗ trợ truy cập camera. Xem hướng dẫn để tiếp tục.'
      : 'Cấp quyền để quét mã vạch, QR code và chụp hình sản phẩm.';
  return (
    <ScrollView
      testID="p15-device-scroll"
      style={{ flex: 1, minHeight: 0 }}
      contentContainerStyle={{ paddingBottom: 0 }}
    >
      <View style={{ marginBottom: 20 * s }}>
        <Text
          accessibilityRole="header"
          style={{
            fontSize: 25 * s,
            lineHeight: 34 * s,
            fontWeight: '700',
            color: C.ink,
          }}
        >
          Quyền thiết bị
        </Text>
        <Text
          style={{
            marginTop: 5 * s,
            fontSize: 17 * s,
            lineHeight: 25.5 * s,
            color: C.muted,
          }}
        >
          Cấp quyền cần thiết để tiếp tục quét mã.
        </Text>
      </View>
      <DeviceCard
        name="Camera"
        state={props.camera}
        glyph="camera"
        explanation={cameraExplanation}
      >
        {(cameraDenied || cameraUnsupported) && (
          <P15Action
            disabled={a.busy}
            glyph={cameraUnsupported ? 'phone' : 'document'}
            label={
              cameraUnsupported
                ? 'Hướng dẫn thiết bị hỗ trợ'
                : 'Hướng dẫn cấp quyền'
            }
            onPress={cameraGuide}
          />
        )}
        {!cameraUnsupported && (
          <P15Action
            secondary={cameraDenied}
            glyph="camera"
            busy={a.running === 'camera'}
            disabled={
              !cameraAction ||
              (a.busy && a.running !== 'camera') ||
              props.camera === 'checking'
            }
            label={
              requestable
                ? 'Cho phép camera'
                : props.camera === 'granted' && props.onOpenScanner
                ? 'Quay lại màn quét'
                : 'Kiểm tra lại camera'
            }
            onPress={() => a.run('camera', cameraAction)}
          />
        )}
        {!cameraDenied && !cameraUnsupported && (
          <P15Action
            secondary
            disabled={a.busy}
            glyph="document"
            label="Mở hướng dẫn"
            onPress={cameraGuide}
          />
        )}
      </DeviceCard>
      <DeviceCard
        name="NFC"
        last
        state={props.nfc}
        glyph="nfc"
        explanation={
          nfcUnsupported
            ? 'Môi trường hiện tại không hỗ trợ đọc NFC. Xem yêu cầu về thiết bị để tiếp tục.'
            : props.nfc === 'disabled'
            ? 'Bật NFC trong cài đặt rồi quay lại màn NFC để kiểm tra.'
            : 'Khả năng đọc thẻ cần được kiểm tra tại màn NFC. Chưa xác nhận phần cứng đã sẵn sàng.'
        }
      >
        {nfcUnsupported ? (
          <P15Action
            disabled={a.busy}
            glyph="phone"
            label="Hướng dẫn thiết bị hỗ trợ"
            onPress={() => a.openGuide('Thiết bị hỗ trợ NFC', guides.nfc)}
          />
        ) : (
          <>
            {nfcDenied && (
              <P15Action
                disabled={a.busy}
                glyph="document"
                label="Hướng dẫn cấp quyền NFC"
                onPress={() =>
                  a.openGuide('Hướng dẫn cấp quyền NFC', guides.nfc)
                }
              />
            )}
            <P15Action
              secondary={nfcDenied}
              glyph="nfc"
              label="Về màn NFC để kiểm tra"
              disabled={!props.onOpenNfc || a.busy || props.nfc === 'checking'}
              onPress={() => a.run('nfc', props.onOpenNfc)}
            />
            {!nfcDenied && (
              <P15Action
                secondary
                disabled={a.busy}
                glyph="document"
                label="Mở hướng dẫn"
                onPress={() => a.openGuide('Hướng dẫn NFC', guides.nfc)}
              />
            )}
          </>
        )}
      </DeviceCard>
    </ScrollView>
  );
}
export function P15DeviceScreen(props: P15DeviceScreenProps) {
  const a = useActions(props);
  if (props.active === false) return null;
  return (
    <P15Frame
      panel="P15.S04"
      title="Quyền thiết bị"
      onBack={props.onBack ? a.navigateBack : undefined}
      footer={props.footer}
    >
      <DeviceContent {...props} actions={a} />
      {a.guide}
    </P15Frame>
  );
}

export type P15ScreenProps =
  | ({ panel: 'P15.S01' } & P15ConnectionScreenProps)
  | ({ panel: 'P15.S02' } & P15ExpiredScreenProps)
  | ({ panel: 'P15.S03' } & P15PermissionScreenProps)
  | ({ panel: 'P15.S04' } & P15DeviceScreenProps);

/** Public product entry; callers still own classification and all commands. */
export function P15Screen(props: P15ScreenProps) {
  switch (props.panel) {
    case 'P15.S01':
      return <P15ConnectionScreen {...props} />;
    case 'P15.S02':
      return <P15ExpiredScreen {...props} />;
    case 'P15.S03':
      return <P15PermissionScreen {...props} />;
    case 'P15.S04':
      return <P15DeviceScreen {...props} />;
  }
}
