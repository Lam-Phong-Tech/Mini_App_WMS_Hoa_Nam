import {HN_UI} from '../../theme/uiKitV3';
/** P17 presentation only. No owner, API, auth/storage, camera or NFC construction. */
import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { AppIcon } from '../../ui/AppIcon';
import { Dialog } from '../../ui/Dialog';
import { useHardwareBack } from '../../app/useHardwareBack';
import { scannerAssets } from '../../theme/scannerAssets';
import { formatVietnamDateTime } from '../../time/vietnamTime';
import { canonicalStatusPresentation } from '../documents/p12/presentation';

function relatedStatusLabel(type: string | null | undefined, status: string | null | undefined) {
  if (!status) return status;
  const label = canonicalStatusPresentation(type?.toUpperCase() === 'WARRANTY' ? 'warranty' : 'outbound', status).label;
  return label === 'Chưa xác minh trạng thái' ? status : label;
}
import {
  P17Action,
  P17Card,
  P17Gradient,
  P17Info,
  P17Readable,
  P17Row,
  P17Tile,
  P17Warning,
  p17Styles,
  type P17ReadRequest,
} from './P17Primitives';

export const P17_PANEL_IDS = [
  'P17.S01',
  'P17.S02',
  'P17.S03',
  'P17.S04',
] as const;
export interface P17Context {
  documentNo?: string | null;
  acceptedCodeCount?: number | null;
}
export interface P17Product {
  code?: string | null;
  name?: string | null;
  sku?: string | null;
  unit?: string | null;
  serial?: string | null;
}
export type P17RelatedDocument =
  | {
      kind: 'visible';
      documentId: string;
      number?: string | null;
      type?: string | null;
      status?: string | null;
      createdAt?: string | null;
      canOpen: boolean;
    }
  | { kind: 'redacted' | 'unavailable' };
export interface P17RequestIdentity {
  /** Frozen Idempotency-Key/pending.key, NEVER the distinct X-Request-ID trace. */
  operationKey?: string | null;
  draftId?: string | null;
  scanSessionId?: string | null;
  version?: number | null;
  command: 'SAVE' | 'RECORD' | 'CANCEL';
}
export type P17View =
  | {
      panel: 'P17.S01';
      raw?: string | null;
      reason?: string | null;
      context?: P17Context;
      camera?: { preview: ReactNode; label: string };
    }
  | {
      panel: 'P17.S02';
      raw?: string | null;
      reason?: string | null;
      reasonCode?: string | null;
      context?: P17Context;
      product?: P17Product | null;
      relatedDocument?: P17RelatedDocument | null;
    }
  | {
      panel: 'P17.S03';
      verification: 'verified' | 'unverified';
      physicalCodeId?: string | null;
      uid?: string | null;
      status: 'ASSIGNED' | 'LOCKED' | null;
      statusLabel?: string | null;
      product?: P17Product | null;
      canViewLink: boolean;
    }
  | {
      panel: 'P17.S04';
      owner: 'P04' | 'P05';
      phase:
        | 'unknown'
        | 'checking'
        | 'unavailable'
        | 'verified-record'
        | 'verified-save'
        | 'verified-cancel';
      context?: P17Context;
      identity: P17RequestIdentity;
      sentAt?: string | null;
      actorName?: string | null;
      canCheck: boolean;
    };

export interface P17ScanExceptionsProps {
  /** Opaque actor/auth-family/warehouse/draft/scan/view generation binding; never displayed or copied. */
  scopeKey: string;
  view: P17View;
  /** Owner must recheck exact scope/permission at action time. False conceals this stale projection. */
  isCurrent: () => boolean;
  onBack: () => void;
  onScanAgain?: () => void;
  onManual?: (raw: string | null) => void;
  onScanOther?: () => void;
  onViewRelated?: (documentId: string) => void | Promise<void>;
  onViewLink?: (physicalCodeId: string) => void | Promise<void>;
  onCancel?: () => void;
  /** Original status read only; never a SAVE/RECORD/confirm or a new key. */
  onCheck?: () => void | Promise<void>;
  /** Existing owner clipboard port returns true only after confirmed copy; no clipboard dependency here. */
  onCopyIdentity?: (
    identity: Readonly<P17RequestIdentity>,
    scopeKey: string,
  ) => Promise<boolean>;
  /** Parent's existing locked Home/P03 nav instance, S01 only. Do not build another navigation owner. */
  footerNavigation?: ReactNode;
  busy?: boolean;
  initialScrollY?: number;
  onScrollPositionChange?: (y: number) => void;
}

const s = StyleSheet.create({
  rejectionWarning: { padding: 18 },
  conflictWarning: { padding: 16 },
  s01Sheet: { paddingBottom: 26 },
  root: { flex: 1, minHeight: 0, backgroundColor: HN_UI.shell },
  header: {
    height: 63,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 8,
    paddingRight: 16,
    paddingBottom: 14,
    paddingTop: 4,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: HN_UI.onBrand,
    fontSize: 22,
    lineHeight: 32,
    fontWeight: '700',
    flex: 1,
  },
  sheet: {
    flex: 1,
    minHeight: 0,
    marginTop: -14,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
    backgroundColor: HN_UI.canvas,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
  },
  context: {
    minHeight: 54,
    padding: 10,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 12,
    backgroundColor: HN_UI.canvas,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  contextText: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  contextNumber: {
    color: HN_UI.textPrimary,
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 24,
  },
  count: { color: HN_UI.textMuted, fontSize: 14, lineHeight: 21 },
  scroll: { flex: 1, minHeight: 0 },
  content: { gap: 16, paddingBottom: 1 },
  compactContent: { gap: 12 },
  footer: { paddingTop: 18, gap: 12, flexShrink: 0 },
  camera: {
    height: 212,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: HN_UI.shell,
  },
  cameraImage: { height: '100%', width: '100%' },
  reticle: {
    position: 'absolute',
    width: 350,
    maxWidth: '80%',
    height: 148,
    alignSelf: 'center',
    top: 32,
  },
  topLeft: {
    left: 0,
    top: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 16,
  },
  topRight: {
    right: 0,
    top: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 16,
  },
  bottomLeft: {
    left: 0,
    bottom: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 16,
  },
  bottomRight: {
    right: 0,
    bottom: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 16,
  },
  corner: {
    position: 'absolute',
    width: 74,
    height: 37,
    borderColor: HN_UI.danger,
  },
  cameraLabel: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    borderRadius: 5,
    backgroundColor: HN_UI.scanScrim,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  cameraLabelText: { color: HN_UI.onBrand, fontSize: 13, lineHeight: 18 },
  reason: { marginTop: 8 },
  clock: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: HN_UI.canvas,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  verifying: {
    paddingTop: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 8,
  },
  centered: { textAlign: 'center' },
  disclosure: {
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 12,
    backgroundColor: HN_UI.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  disclosureButton: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  disclosureTitle: { fontSize: 14, lineHeight: 24, color: HN_UI.textPrimary },
  disclosureBody: { paddingTop: 12 },
  hint: { color: HN_UI.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  feedback: { fontSize: 16, lineHeight: 26, color: HN_UI.textPrimary },
});

const hasText = (value: unknown): value is string =>
  typeof value === 'string' && !!value.trim();
const currentOwner = (props: P17ScanExceptionsProps) => {
  try {
    return props.isCurrent();
  } catch {
    return false;
  }
};
const countLabel = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? `Đã giữ ${value} mã hợp lệ`
    : 'Số mã hợp lệ chưa xác định';
const reasons: Record<string, string> = {
  ITEM_ALREADY_MATCHED: 'Sản phẩm đang được giữ cho một phiếu xuất khác.',
  ITEM_NOT_AVAILABLE: 'Sản phẩm chưa đủ điều kiện xuất kho.',
  INSUFFICIENT_STOCK: 'Chưa đủ số lượng tồn khả dụng để xuất.',
  SKU_INACTIVE: 'SKU đã ngừng hoạt động.',
  PHYSICAL_CODE_NOT_FOUND: 'Không tìm thấy mã trong nguồn dữ liệu đang dùng.',
};

/** Only the public identity allowlist can reach the clipboard port. */
export function p17CopyIdentity(
  identity: P17RequestIdentity,
): Readonly<P17RequestIdentity> {
  const clean: P17RequestIdentity = { command: identity.command };
  for (const key of ['operationKey', 'draftId', 'scanSessionId'] as const)
    if (hasText(identity[key])) clean[key] = identity[key];
  if (
    typeof identity.version === 'number' &&
    Number.isSafeInteger(identity.version) &&
    identity.version >= 0
  )
    clean.version = identity.version;
  return Object.freeze(clean);
}

export function P17ScanExceptions(
  props: P17ScanExceptionsProps,
): React.ReactElement {
  // No old reader, copy promise or scroll is carried to another actor/caller/request.
  const v = props.view;
  const id =
    v.panel === 'P17.S04'
      ? v.identity.operationKey
      : v.panel === 'P17.S03'
      ? v.physicalCodeId
      : v.raw;
  return (
    <P17BoundScreen
      key={JSON.stringify([props.scopeKey, v.panel, id])}
      {...props}
    />
  );
}

function P17BoundScreen(props: P17ScanExceptionsProps): React.ReactElement {
  const { view: v, busy, onBack } = props;
  const [overlay, setOverlay] = useState<P17ReadRequest | null>(null);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [task, setTask] = useState<string | null>(null);
  const [bounds, setBounds] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>();
  const frame = useRef<React.ComponentRef<typeof View>>(null);
  const focusFrame = useRef<
    ReturnType<typeof requestAnimationFrame> | undefined
  >(undefined);
  const pending = useRef(false);
  const mounted = useRef(true);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const initialScroll = useRef(props.initialScrollY ?? 0);
  const current = useRef(props);
  current.current = props;
  const ownerIsCurrent = currentOwner(props);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (focusFrame.current !== undefined)
        cancelAnimationFrame(focusFrame.current);
    };
  }, []);
  useEffect(() => {
    if (!ownerIsCurrent) {
      setOverlay(null);
      setTask(null);
    }
  }, [ownerIsCurrent]);
  const valid = () => mounted.current && currentOwner(current.current);
  const read = (request: P17ReadRequest) => {
    if (valid()) setOverlay(request);
  };
  const close = () => {
    const target = overlay;
    setOverlay(null);
    if (focusFrame.current !== undefined)
      cancelAnimationFrame(focusFrame.current);
    if (valid())
      focusFrame.current = requestAnimationFrame(() => {
        focusFrame.current = undefined;
        if (valid()) target?.restoreFocus();
      });
  };
  const back = () => {
    if (overlay) close();
    else if (valid() && !busy) onBack();
  };
  useHardwareBack(() => {
    back();
    return true;
  });
  async function action(
    name: string,
    callback?: () => void | boolean | Promise<void | boolean>,
  ) {
    if (!callback || current.current.busy || pending.current || !valid())
      return;
    pending.current = true;
    setTask(name);
    try {
      const result = await callback();
      if (name === 'copy' && valid())
        read({
          title:
            result === true
              ? 'Đã sao chép thông tin yêu cầu'
              : 'Chưa sao chép được thông tin',
          value:
            result === true
              ? 'Thông tin định danh yêu cầu đã được sao chép.'
              : 'Thông tin yêu cầu vẫn được giữ. Bạn có thể xem đầy đủ các định danh để đối chiếu.',
          restoreFocus: () => {},
        });
    } catch {
      if (valid())
        read({
          title: 'Chưa hoàn tất thao tác',
          value:
            'Dữ liệu và định danh yêu cầu được giữ nguyên. Kiểm tra lại nguồn và quyền của phiên hiện tại.',
          restoreFocus: () => {},
        });
    } finally {
      pending.current = false;
      if (valid()) setTask(null);
    }
  }
  if (!ownerIsCurrent) return <View testID="P17.stale-owner" style={s.root} />;
  const isUnknown = v.panel === 'P17.S04';
  const title =
    v.panel === 'P17.S01'
      ? 'Quét mã sản phẩm'
      : v.panel === 'P17.S02'
      ? 'Kiểm tra mã xuất kho'
      : v.panel === 'P17.S03'
      ? 'Đọc thẻ NFC'
      : (v.identity.command === 'SAVE'
          ? 'Lưu nháp'
          : v.identity.command === 'CANCEL'
          ? 'Hủy nháp'
          : 'Gửi phiếu') + (v.owner === 'P05' ? ' xuất kho' : ' nhập kho');
  const context = 'context' in v ? v.context : undefined;
  const controlsDisabled = !!busy || task !== null;
  let content: ReactNode, footer: ReactNode;
  if (v.panel === 'P17.S01') {
    content = (
      <>
        <View
          style={s.camera}
          accessibilityLabel={
            v.camera ? v.camera.label : 'Ảnh kho minh họa, camera chưa kết nối'
          }
        >
          {v.camera ? (
            v.camera.preview
          ) : (
            <Image
              source={scannerAssets.warehouseMain}
              style={s.cameraImage}
              resizeMode="cover"
              accessible={false}
            />
          )}
          <View pointerEvents="none" style={s.reticle}>
            <View style={[s.corner, s.topLeft]} />
            <View style={[s.corner, s.topRight]} />
            <View style={[s.corner, s.bottomLeft]} />
            <View style={[s.corner, s.bottomRight]} />
          </View>
          <View style={s.cameraLabel}>
            <Text style={s.cameraLabelText}>
              {v.camera?.label ?? 'Camera chưa kết nối'}
            </Text>
          </View>
        </View>
        <P17Warning
          title="Mã không hợp lệ"
          message="Không thể xử lý mã này. Vui lòng kiểm tra và thử lại."
        />
        <P17Card title="Thông tin kiểm tra">
          <P17Row label="Mã đã đọc" value={v.raw} onRead={read} last />
          <View style={s.reason}>
            <P17Readable
              label="Lý do kiểm tra mã"
              value={v.reason}
              lines={3}
              onRead={read}
              muted
            />
          </View>
        </P17Card>
        <P17Info>Mã lỗi không được cộng vào số lượng của phiếu.</P17Info>
      </>
    );
    footer = (
      <>
        <P17Action
          label="Quét lại"
          icon="scan"
          disabled={controlsDisabled || !props.onScanAgain}
          onPress={() => {
            action('scan', props.onScanAgain);
          }}
        />
        <P17Action
          label="Nhập mã"
          icon="keyboard"
          secondary
          disabled={controlsDisabled || !props.onManual}
          onPress={() => {
            action('manual', () => props.onManual?.(v.raw ?? null));
          }}
        />
      </>
    );
  } else if (v.panel === 'P17.S02') {
    const candidate = v.relatedDocument;
    const related =
      candidate?.kind === 'visible' &&
      candidate.canOpen === true &&
      hasText(candidate.documentId)
        ? candidate
        : null;
    // Fail closed on redacted, malformed or revoked holder projections, even
    // when their free-text reason contains a cached private document number.
    const hidden = candidate != null && related === null;
    const reason = hidden
      ? 'Chi tiết nguyên nhân liên quan đến phiếu chưa được cấp quyền xem.'
      : v.reason ??
        reasons[v.reasonCode ?? ''] ??
        'Chưa xác minh được nguyên nhân từ nguồn.';
    content = (
      <>
        <P17Warning
          title="Mã không thể xuất"
          message="Sản phẩm này không thể xuất kho. Vui lòng kiểm tra thông tin bên dưới."
          style={s.rejectionWarning}
        />
        <View>
          <Text
            accessibilityRole="header"
            style={[p17Styles.text, p17Styles.heading]}
          >
            Nguyên nhân
          </Text>
          <View style={s.reason}>
            <P17Readable
              label="Nguyên nhân không thể xuất"
              value={reason}
              lines={3}
              muted
              onRead={read}
            />
          </View>
        </View>
        <P17Card
          title="Thông tin sản phẩm"
          icon="box"
          operation="outbound"
          compact
        >
          <P17Row compact label="Mã đã đọc" value={v.raw} onRead={read} />
          <P17Row
            compact
            label="Mã sản phẩm"
            value={v.product?.code}
            onRead={read}
          />
          <P17Row
            compact
            label="Tên sản phẩm"
            value={v.product?.name}
            onRead={read}
          />
          <P17Row compact label="SKU" value={v.product?.sku} onRead={read} />
          <P17Row
            compact
            label="Đơn vị tính"
            value={v.product?.unit}
            onRead={read}
            last
          />
        </P17Card>
        {related?.kind === 'visible' ? (
          <P17Card title="Phiếu liên quan" icon="document" compact>
            <P17Row
              compact
              label="Số phiếu"
              value={related.number}
              onRead={read}
            />
            {related.type != null && (
              <P17Row
                compact
                label="Loại phiếu"
                value={
                  ({ INBOUND: 'Nhập kho', OUTBOUND: 'Xuất kho', WARRANTY: 'Bảo hành' } as Record<string,string>)[related.type.toUpperCase()] ?? related.type
                }
                onRead={read}
              />
            )}
            <P17Row
              compact
              label="Trạng thái"
              value={relatedStatusLabel(related.type, related.status)}
              onRead={read}
              last={related.createdAt == null}
            />
            {related.createdAt != null && (
              <P17Row
                compact
                label="Ngày tạo"
                value={formatVietnamDateTime(related.createdAt, {
                  missing: 'Chưa xác định',
                })}
                onRead={read}
                last
              />
            )}
            {related.canOpen &&
              hasText(related.documentId) &&
              props.onViewRelated && (
                <P17Action
                  label="Xem phiếu liên quan"
                  secondary
                  disabled={controlsDisabled}
                  onPress={() => {
                    action('related', () =>
                      props.onViewRelated?.(related.documentId),
                    );
                  }}
                />
              )}
          </P17Card>
        ) : (
          <P17Info>
            {hidden
              ? 'Thông tin phiếu liên quan chưa được cấp quyền xem.'
              : 'Chưa có thông tin phiếu giữ hàng từ nguồn.'}
          </P17Info>
        )}
        <P17Info>
          Vui lòng quét mã khác để tiếp tục xuất kho. Các mã hợp lệ và phiếu
          đang soạn được giữ nguyên.
        </P17Info>
      </>
    );
    footer = (
      <P17Action
        label="Quét mã khác"
        icon="scan"
        disabled={controlsDisabled || !props.onScanOther}
        onPress={() => {
          action('other', props.onScanOther);
        }}
      />
    );
  } else if (v.panel === 'P17.S03') {
    const verified =
      v.verification === 'verified' &&
      (v.status === 'ASSIGNED' || v.status === 'LOCKED');
    const p = verified ? v.product : null;
    content = (
      <>
        <P17Warning
          title={
            !verified
              ? 'Chưa xác minh liên kết'
              : v.status === 'LOCKED'
              ? 'Thẻ đã khóa'
              : 'Thẻ đã liên kết'
          }
          message={
            !verified
              ? 'Thông tin liên kết của thẻ chưa được xác minh từ nguồn. Chưa thể xem đây là thẻ chưa liên kết.'
              : v.status === 'LOCKED'
              ? 'Thẻ NFC hiện đang khóa. Vui lòng kiểm tra thông tin trước khi tiếp tục.'
              : 'Thẻ NFC này đã được liên kết với sản phẩm khác trong hệ thống.'
          }
        />
        <P17Card title="Thông tin thẻ NFC" icon="nfc" operation="nfc">
          <P17Row label="UID thẻ" value={v.uid} onRead={read} />
          <P17Row
            label="Trạng thái"
            value={
              verified
                ? v.statusLabel ??
                  (v.status === 'LOCKED' ? 'Đã khóa' : 'Đã liên kết')
                : 'Chưa xác minh'
            }
            onRead={read}
            last
          />
        </P17Card>
        <P17Card
          title={verified ? 'Sản phẩm đã liên kết' : 'Thông tin sản phẩm'}
          icon="box"
        >
          <P17Row label="Mã sản phẩm" value={p?.code} onRead={read} />
          <P17Row label="Tên sản phẩm" value={p?.name} onRead={read} />
          <P17Row label="SKU" value={p?.sku} onRead={read} />
          <P17Row label="Serial" value={p?.serial} onRead={read} last />
        </P17Card>
        <P17Warning
          compact
          message="Không thể tự động ghi đè liên kết. Vui lòng kiểm tra và xử lý theo quyền quản trị liên kết."
          style={s.conflictWarning}
        />
      </>
    );
    footer = (
      <>
        <P17Action
          label="Xem liên kết"
          icon="document"
          disabled={
            controlsDisabled ||
            !verified ||
            !v.canViewLink ||
            !hasText(v.physicalCodeId) ||
            !props.onViewLink
          }
          onPress={() => {
            action('link', () => props.onViewLink?.(v.physicalCodeId!));
          }}
        />
        <P17Action
          label="Hủy"
          secondary
          disabled={controlsDisabled}
          onPress={() => {
            action('cancel', props.onCancel ?? onBack);
          }}
        />
      </>
    );
  } else {
    const reading = v.phase === 'checking' || task === 'check';
    const identity = p17CopyIdentity(v.identity);
    const completeIdentity =
      hasText(identity.operationKey) &&
      hasText(identity.draftId) &&
      hasText(identity.scanSessionId) &&
      identity.version != null;
    const verifiedCommand =
      completeIdentity &&
      ((v.phase === 'verified-record' && v.identity.command === 'RECORD') ||
        (v.phase === 'verified-save' && v.identity.command === 'SAVE') ||
        (v.phase === 'verified-cancel' && v.identity.command === 'CANCEL'));
    const resultName =
      v.identity.command === 'SAVE'
        ? 'lưu nháp'
        : v.identity.command === 'CANCEL'
        ? 'hủy nháp'
        : 'gửi';
    const phaseTitle = reading
      ? 'Đang kiểm tra kết quả ' + resultName
      : verifiedCommand
      ? v.identity.command === 'RECORD'
        ? 'Đã đối chiếu yêu cầu ghi nhận'
        : v.identity.command === 'SAVE'
        ? 'Đã đối chiếu yêu cầu SAVE'
        : 'Đã đối chiếu yêu cầu hủy'
      : 'Chưa xác định kết quả ' + resultName;
    const canCopy = !!props.onCopyIdentity && hasText(identity.operationKey);
    content = (
      <>
        <View style={s.verifying}>
          <View style={s.clock}>
            <AppIcon name="clock" size={44} color={HN_UI.textSecondary} />
          </View>
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole="header"
            style={[p17Styles.text, p17Styles.heading, s.centered]}
          >
            {phaseTitle}
          </Text>
          <Text style={[p17Styles.text, p17Styles.muted, s.centered]}>
            {reading
              ? 'Hệ thống đang kiểm tra trạng thái yêu cầu. Vui lòng chờ.'
              : verifiedCommand
              ? 'Kết quả thuộc yêu cầu đã gửi. Trạng thái chứng từ hiện tại được kiểm tra riêng bởi luồng nghiệp vụ.'
              : v.identity.command === 'RECORD'
              ? 'Chưa xác định phiếu đã được ghi nhận. Kiểm tra trạng thái trước khi gửi lại.'
              : 'Chưa xác định yêu cầu đã được xử lý. Giữ nguyên phiếu và yêu cầu để đối chiếu.'}
          </Text>
        </View>
        <P17Card
          title="Thông tin phiếu"
          icon="document"
          operation={v.owner === 'P05' ? 'outbound' : 'inbound'}
        >
          <P17Row
            label="Số phiếu"
            value={v.context?.documentNo}
            onRead={read}
          />
          <P17Row
            label="Loại phiếu"
            value={v.owner === 'P05' ? 'Xuất kho' : 'Nhập kho'}
            onRead={read}
          />
          <P17Row
            label={
              v.identity.command === 'RECORD' ? 'Ngày gửi' : 'Thời gian yêu cầu'
            }
            value={formatVietnamDateTime(v.sentAt, {
              missing: 'Chưa xác định',
            })}
            onRead={read}
          />
          <P17Row label="Người gửi" value={v.actorName} onRead={read} last />
        </P17Card>
        <P17Info>
          {v.identity.command === 'RECORD'
            ? 'Không gửi lại để tránh tạo trùng phiếu. Mã hợp lệ và định danh của lần gửi được giữ nguyên.'
            : 'Không gửi lại yêu cầu khi chưa đối chiếu. Phiếu, mã hợp lệ và định danh được giữ nguyên.'}
        </P17Info>
        {(!v.canCheck || v.phase === 'unavailable') && (
          <P17Info>
            Chưa có nguồn tra trạng thái khả dụng. Giữ yêu cầu gốc và đối chiếu
            với người phụ trách Web.
          </P17Info>
        )}
        <View style={s.disclosure}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thông tin đối chiếu"
            accessibilityState={{ expanded: identityOpen }}
            onPress={() => {
              if (valid()) setIdentityOpen(!identityOpen);
            }}
            style={s.disclosureButton}
          >
            <AppIcon name="chevron-right" color={HN_UI.textPrimary} size={16} />
            <Text style={s.disclosureTitle}>Thông tin đối chiếu</Text>
          </Pressable>
          {identityOpen && (
            <View style={s.disclosureBody}>
              <P17Row
                label="Request ID"
                value={identity.operationKey}
                onRead={read}
              />
              <P17Row label="ID phiếu" value={identity.draftId} onRead={read} />
              <P17Row
                label="Phiên quét"
                value={identity.scanSessionId}
                onRead={read}
              />
              <P17Row
                label="Version"
                value={
                  identity.version == null ? null : String(identity.version)
                }
                onRead={read}
              />
              <P17Row
                label="Thao tác"
                value={identity.command}
                onRead={read}
                last
              />
              <P17Action
                label="Sao chép thông tin yêu cầu"
                secondary
                disabled={!canCopy || controlsDisabled}
                busy={task === 'copy'}
                onPress={() => {
                  action('copy', () =>
                    props.onCopyIdentity?.(identity, props.scopeKey),
                  );
                }}
              />
            </View>
          )}
        </View>
      </>
    );
    footer = (
      <>
        <P17Action
          label={
            reading
              ? 'Đang kiểm tra…'
              : v.canCheck && v.phase !== 'unavailable'
              ? 'Kiểm tra trạng thái'
              : 'Thông tin đối chiếu'
          }
          icon="clock"
          busy={reading}
          disabled={
            !!busy ||
            (v.canCheck && v.phase !== 'unavailable'
              ? !props.onCheck || task !== null
              : false)
          }
          onPress={() => {
            if (!v.canCheck || v.phase === 'unavailable') {
              setIdentityOpen(true);
            } else {
              action('check', props.onCheck);
            }
          }}
        />
        <P17Action label="Gửi lại" secondary disabled onPress={() => {}} />
        <Text style={s.hint}>
          Chỉ gửi lại khi nguồn xác nhận chưa tạo phiếu và cho phép dùng cùng
          yêu cầu.
        </Text>
      </>
    );
  }
  return (
    <View
      ref={frame}
      style={s.root}
      testID={v.panel}
      onLayout={() =>
        frame.current?.measureInWindow((left, top, width, height) => {
          if (valid() && width > 0 && height > 0)
            setBounds(old =>
              old?.left === left &&
              old.top === top &&
              old.width === width &&
              old.height === height
                ? old
                : { left, top, width, height },
            );
        })
      }
    >
      <P17Gradient start={HN_UI.shell} end={HN_UI.primary} />
      <View style={s.header}>
        <Pressable
          style={s.back}
          accessibilityRole="button"
          accessibilityLabel={
            isUnknown ? 'Về Trang chủ, giữ phiếu để đối chiếu' : 'Quay lại'
          }
          onPress={back}
        >
          <AppIcon name="chevron-left" color={HN_UI.onBrand} size={24} />
        </Pressable>
        <Text accessibilityRole="header" style={[p17Styles.text, s.title]}>
          {title}
        </Text>
      </View>
      <View style={[s.sheet, v.panel === 'P17.S01' && s.s01Sheet]}>
        {context && (
          <View style={s.context}>
            <P17Tile
              operation={
                v.panel === 'P17.S02' ||
                (v.panel === 'P17.S04' && v.owner === 'P05')
                  ? 'outbound'
                  : 'inbound'
              }
              icon="document"
            />
            <View style={s.contextText}>
              <P17Readable
                label="Phiếu đang làm"
                value={context.documentNo}
                onRead={read}
                textStyle={s.contextNumber}
              />
              <Text style={s.count}>
                {countLabel(context.acceptedCodeCount)}
              </Text>
            </View>
          </View>
        )}
        <ScrollView
          ref={scroll}
          style={s.scroll}
          contentContainerStyle={[
            s.content,
            v.panel === 'P17.S02' && s.compactContent,
          ]}
          onContentSizeChange={() => {
            if (initialScroll.current > 0) {
              scroll.current?.scrollTo({
                y: initialScroll.current,
                animated: false,
              });
              initialScroll.current = 0;
            }
          }}
          onScroll={event =>
            props.onScrollPositionChange?.(event.nativeEvent.contentOffset.y)
          }
          scrollEventThrottle={64}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
        <View testID="P17.action-dock" style={s.footer}>
          {footer}
        </View>
      </View>
      {v.panel === 'P17.S01' && props.footerNavigation}
      <Dialog
        visible={overlay !== null}
        title={overlay?.title ?? ''}
        message={overlay?.value}
        onDismiss={close}
        dismissOnBackdrop={false}
        bounds={bounds}
      >
        <P17Action label="Đóng" onPress={close} />
      </Dialog>
    </View>
  );
}
