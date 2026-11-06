import {HN_UI} from '../../theme/uiKitV3';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {SCANNER_COLORS} from '../../ui/ScannerPalette';
import {
  Pressable,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { Text } from '../../ui/Text';
import { Button, type ButtonProps } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { HnHomeIcon } from '../../ui/HnHomeIcon';
import { HN_OPERATIONS } from '../../ui/hnHomeTokens';
import {ThemeProvider} from '../../theme/ThemeProvider';
import { copyNfcIdentifier as copyTextToClipboard } from '../../native/nfc';
import { P04Icon } from '../inbound/P04Icon';
import { useHardwareBack } from '../../app/useHardwareBack';
import { captureSessionScope } from '../../auth/session';
import type { P08Context } from '../../services/wms/p08Types';
import {
  createLinkedHistoryRead,
  type ResumeTask,
  type LinkedPage,
} from '../../services/wms/linkedHistoryRead';
import { useOwnerRead } from '../history/useOwnerRead';
import {
  createP09Service,
  type P09Service,
} from '../../services/wms/p09Warranty';
import {
  p19OriginalRecovery,
  p19LocalPendingTasks,
} from './p19/p19OriginalRecovery';
import {
  p19UnsubmittedLocalDrafts,
  prepareP19LocalDraftResume,
  type P19LocalDraftChoice,
} from './p19/p19LocalDrafts';
import type { WarrantyCase } from '../../services/wms/types';
import { messageForUser, toAppError } from '../../errors/AppError';

// Locked P21 r03 geometry. Snapshot inputs are not verified/issued lines.
const ui = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: HN_UI.shell },
  header: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 6,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: HN_UI.onBrand,
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    flex: 1,
    minHeight: 0,
    marginTop: -12,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: HN_UI.canvas,
    overflow: 'hidden',
  },
  content: { padding: 20, gap: 14, flexGrow: 1 },
  dock: {
    flexShrink: 0,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    gap: 10,
    borderTopWidth: 1,
    borderColor: HN_UI.border,
    backgroundColor: HN_UI.canvas,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  fill: { flex: 1, minWidth: 0 },
  card: {
    padding: 18,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 12,
    backgroundColor: HN_UI.surface,
    gap: 12,
  },
  line: { height: 1, backgroundColor: HN_UI.surfaceSunken },
  heading: {
    color: HN_UI.textPrimary,
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '700',
    flexShrink: 1,
  },
  text: { color: HN_UI.textPrimary, fontSize: 17, lineHeight: 25, flexShrink: 1 },
  small: { color: HN_UI.textMuted, fontSize: 14, lineHeight: 22, flexShrink: 1 },
  caption: { color: HN_UI.textMuted, fontSize: 15, lineHeight: 23, flexShrink: 1 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: HN_UI.warningSoft,
    maxWidth: '57%',
  },
  badgeText: { fontSize: 12, lineHeight: 19, color: HN_UI.warning },
  neutralBadge: { backgroundColor: HN_UI.canvas },
  neutralBadgeText: { color: HN_UI.textLink },
  tile: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HN_OPERATIONS.warranty.soft,
  },
  notice: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: HN_UI.canvas,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  warning: { backgroundColor: HN_UI.warningSoft },
  noticeText: {
    fontSize: 14,
    lineHeight: 23,
    color: HN_UI.textLink,
    flex: 1,
    minWidth: 0,
  },
  warningText: { color: HN_UI.warning },
  hero: { alignItems: 'center', paddingTop: 32, paddingBottom: 18, gap: 28 },
  heroTile: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HN_UI.canvas,
  },
  heroTitle: {
    color: HN_UI.textPrimary,
    fontSize: 25,
    lineHeight: 34,
    fontWeight: '700',
    textAlign: 'center',
  },
  heroText: {
    color: HN_UI.textMuted,
    fontSize: 16,
    lineHeight: 26,
    textAlign: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 14,
  },
  valueLabel: { width: '39%', color: HN_UI.textMuted, fontSize: 15, lineHeight: 23 },
  value: {
    flex: 1,
    minWidth: 0,
    color: HN_UI.textPrimary,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
    textAlign: 'right',
  },
  link: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  linkText: {
    color: HN_UI.textLink,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    flexShrink: 1,
  },
  action: {
    minHeight: 60,
    borderRadius: 12,
    backgroundColor: SCANNER_COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondary: {
    minHeight: 58,
    borderRadius: 12,
    borderColor: HN_UI.border,
    backgroundColor: HN_UI.surface,
  },
  actionLabel: {
    fontSize: 17,
    lineHeight: 25,
    textAlign: 'center',
    flexShrink: 1,
  },
  reader: { gap: 12, minWidth: 0 },
});
const policies: Record<string, string> = {
  OWNER_PREFLIGHT_REQUIRED:
    'Cần chủ phiếu xác minh mã và điều kiện xuất trước khi tiếp tục quét.',
  READ_ONLY_CASE_STATE:
    'Hồ sơ không cho phép xuất mới. Phiếu và yêu cầu cũ vẫn được giữ để đối chiếu.',
  OPEN_EXISTING_RESULT:
    'Phiếu đã ghi nhận chỉ được mở để xem. Không xuất thêm lần nữa.',
  RECORDED_RESULT_UNAVAILABLE:
    'Đã ghi nhận nhưng chưa đọc được kết quả. Giữ phiếu để đối chiếu, không tạo phiếu bù.',
  READ_ONLY_INCOMPLETE_SNAPSHOT:
    'Chưa xác minh được mã đã quét. Không quét hoặc gửi lại phiếu lúc này.',
  READ_ONLY_CANCELLED: 'Phiếu đã hủy chỉ được xem lại. Không tiếp tục quét.',
  READ_ONLY_LINK_CONFLICT:
    'Thông tin phiếu chưa khớp. Giữ nguyên phiếu để đối chiếu.',
  LOCAL_ORIGINAL_REQUEST_ONLY:
    'Yêu cầu cũ chưa rõ kết quả. Kiểm tra đúng yêu cầu trước khi thao tác tiếp.',
};
const statuses: Record<string, string> = {
  DRAFT: 'Đang thực hiện',
  RECORDED: 'Đã ghi nhận',
  CANCELLED: 'Đã hủy',
  UNKNOWN: 'Chưa rõ kết quả',
};
const caseStatuses: Record<string, string> = {
  RECEIVED: 'Đã tiếp nhận',
  CHECKING: 'Đang kiểm tra',
  REPAIRING: 'Đang sửa chữa',
  COMPLETED: 'Chờ bàn giao',
  RETURNED: 'Đã trả khách',
  CANCELLED: 'Đã hủy',
};
const sources: Record<string, string> = {
  CAMERA: 'Camera',
  SCANNER: 'Máy quét',
  HARDWARE: 'Thiết bị quét',
  MANUAL: 'Nhập tay',
};
type Command = 'SAVE' | 'RECORD' | 'CANCEL';
type Retained = {
  binding: string;
  page: number;
  status: string;
  selected?: ResumeTask;
  check?: { key: string; command: Command };
  readonlySnapshot?: boolean;
  scroll: number;
};
export interface P21Retained {
  current?: Retained;
}
type Overlay = {
  binding: string;
  taskId?: string;
  title: string;
  text?: string;
  kind: 'details' | 'guidance' | 'reader' | 'filter' | 'feedback';
};

function P21Action(props: ButtonProps) {
  return (
    <Button
      {...props}
      style={[
        props.variant === 'secondary' ? ui.secondary : ui.action,
        props.style,
      ]}
      labelStyle={[
        ui.actionLabel,
        props.variant === 'secondary' && { color: HN_UI.textLink },
        props.labelStyle,
      ]}
    />
  );
}
function Badge({
  label,
  neutral = false,
}: {
  label: string;
  neutral?: boolean;
}) {
  return (
    <View style={[ui.badge, neutral && ui.neutralBadge]}>
      <Text style={[ui.badgeText, neutral && ui.neutralBadgeText]}>
        {label}
      </Text>
    </View>
  );
}
function Notice({
  children,
  warning = false,
}: {
  children: string;
  warning?: boolean;
}) {
  return (
    <View style={[ui.notice, warning && ui.warning]}>
      <P04Icon name="info" size={18} color={warning ? HN_UI.warning : HN_UI.textLink} />
      <Text style={[ui.noticeText, warning && ui.warningText]}>{children}</Text>
    </View>
  );
}
function Value({ label, value }: { label: string; value: string }) {
  return (
    <View style={ui.valueRow}>
      <Text style={ui.valueLabel}>{label}</Text>
      <Text selectable style={ui.value}>
        {value}
      </Text>
    </View>
  );
}
function Link({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={ui.link}
    >
      <Text style={ui.linkText}>{label}</Text>
    </Pressable>
  );
}
function Readable({
  value,
  label,
  open,
  style,
}: {
  value: string;
  label: string;
  open(title: string, value: string): void;
  style?: StyleProp<TextStyle>;
}) {
  const [truncated, setTruncated] = useState(false);
  return (
    <View style={ui.fill}>
      <Text
        selectable
        numberOfLines={2}
        onTextLayout={e =>
          setTruncated(
            e.nativeEvent.lines.length >= 2 &&
              e.nativeEvent.lines
                .map(line => line.text)
                .join('')
                .replace(/\s/gu, '') !== value.replace(/\s/gu, ''),
          )
        }
        style={style ?? ui.text}
      >
        {value}
      </Text>
      {(truncated || value.length > 55 || value.split('\n').length > 2) && (
        <Link
          label={'Xem đầy đủ · ' + label}
          onPress={() => open(label, value)}
        />
      )}
    </View>
  );
}

export function P21ResumeScreen(props:React.ComponentProps<typeof P21ResumeScreenContent>){
  return <ThemeProvider fontFamily={Platform.OS==='web'?'Public Sans':undefined}><P21ResumeScreenContent {...props}/></ThemeProvider>;
}
function P21ResumeScreenContent({
  context,
  caseId,
  onBack,
  onOpenResult,
  retained,
  onHistory,
  service,
  onResumeLocalDraft,
}: {
  context: P08Context;
  caseId?: string;
  onBack(): void;
  onOpenResult(caseId: string, documentId: string): void;
  retained?: P21Retained;
  onHistory?(): void;
  service?: P09Service;
  onResumeLocalDraft?(row: WarrantyCase, target: P19LocalDraftChoice): void;
}) {
  const ctx = useRef(context);
  ctx.current = context;
  const api = useMemo(() => createLinkedHistoryRead(() => ctx.current), []);
  const warranty = useMemo(
    () => service ?? createP09Service(() => ctx.current),
    [service],
  );
  const binding = JSON.stringify([
    api.scopeKey('P21'),
    captureSessionScope().generation,
    caseId,
  ]);
  const saved =
    retained?.current?.binding === binding ? retained.current : undefined;
  const [page, setPage] = useState(saved?.page ?? 1),
    [status, setStatus] = useState(saved?.status ?? 'ALL');
  const [selected, setSelected] = useState(saved?.selected);
  const [readonlySnapshot, setReadonlySnapshot] = useState(
    saved?.readonlySnapshot ?? false,
  );
  const [check, setCheck] = useState<Retained['check']>(saved?.check);
  // Restore the original identity, but wait for a new click before repeating GET.
  const [checkIntent, setCheckIntent] = useState(0);
  const [overlay, setOverlay] = useState<Overlay>();
  const [copying, setCopying] = useState(false);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const copyBusy = useRef(false),
    copyEpoch = useRef(0),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [recent, setRecent] = useState<string>();
  const memory = useRef<Retained>({
    binding,
    page,
    status,
    selected,
    check,
    readonlySnapshot,
    scroll: saved?.scroll ?? 0,
  });
  memory.current = {
    ...memory.current,
    binding,
    page,
    status,
    selected,
    check,
    readonlySnapshot,
  };
  useEffect(
    () => () => {
      if (retained) retained.current = memory.current;
    },
    [retained],
  );
  const previousBinding = useRef(binding);
  useEffect(() => {
    if (previousBinding.current !== binding) {
      previousBinding.current = binding;
      setSelected(undefined);
      setCheck(undefined);
      setCheckIntent(0);
      setReadonlySnapshot(false);
      setOverlay(undefined);
      setRecent(undefined);
      setPage(1);
      setStatus('ALL');
      memory.current.scroll = 0;
    }
  }, [binding]);
  const read = useOwnerRead<{
    task?: ResumeTask;
    page?: LinkedPage<ResumeTask>;
  }>(
    JSON.stringify([
      binding,
      page,
      status,
      selected?.id,
      selected?.scanSessionId,
    ]),
    signal =>
      selected
        ? api
            .task(selected.id, selected.scanSessionId, signal)
            .then(task => ({ task }))
        : api
            .tasks(
              {
                page,
                per_page: 20,
                ...(caseId ? { warranty_case_id: caseId } : {}),
                ...(status !== 'ALL' ? { status } : {}),
              },
              signal,
            )
            .then(result => ({ page: result })),
  );
  const denied = [401, 403].includes(read.error?.status ?? 0);
  const localResumeBusy = useRef(false);
  const [localOpening, setLocalOpening] = useState<string>();
  const [localError, setLocalError] = useState<string>();
  const localNavigation = useRef({binding,denied});
  localNavigation.current = {binding,denied};
  useEffect(() => setLocalError(undefined), [binding]);
  useEffect(() => {
    if (denied) setOverlay(undefined);
  }, [denied]);
  const localPending = useMemo(() => {
    try {
      return p19LocalPendingTasks(warranty, caseId);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warranty, caseId, binding, read.data, check]);
  const localSelection = localPending.find(
    row =>
      row.id === selected?.id && row.scanSessionId === selected?.scanSessionId,
  );
  const localDrafts = useMemo(() => {
    try { return p19UnsubmittedLocalDrafts(warranty,caseId); }
    catch { return {items:[],unresolved:1}; }
  }, [warranty,caseId,binding,read.data,check]);
  const visibleLocalDrafts = !denied && ['ALL','DRAFT'].includes(status)
    ? localDrafts.items : [];
  const resumeLocal = async (target: P19LocalDraftChoice) => {
    if (!onResumeLocalDraft || denied || localResumeBusy.current) return;
    const ownerBinding = binding;
    localResumeBusy.current = true;
    setLocalOpening(target.draftId);
    setLocalError(undefined);
    try {
      const row = await prepareP19LocalDraftResume(warranty,target);
      if (!alive.current || localNavigation.current.binding !== ownerBinding ||
          localNavigation.current.denied) return;
      onResumeLocalDraft(row,target);
    } catch (cause) {
      if (alive.current && localNavigation.current.binding === ownerBinding)
        setLocalError(messageForUser(toAppError(cause)));
    } finally {
      localResumeBusy.current = false;
      if (alive.current) setLocalOpening(undefined);
    }
  };
  const task = read.data?.task ?? (!denied ? localSelection : undefined);
  const tasks = [
    ...new Map(
      [...(read.data?.page?.items ?? []), ...(!denied ? localPending : [])].map(
        row => [row.id + '/' + row.scanSessionId, row],
      ),
    ).values(),
  ];
  const original = useMemo(() => {
    try {
      return task ? p19OriginalRecovery(warranty, task) : undefined;
    } catch {
      return undefined;
    }
  }, [warranty, task]);
  const recovery = useOwnerRead(
    JSON.stringify([
      binding,
      selected?.id,
      selected?.scanSessionId,
      check,
      checkIntent,
    ]),
    async () =>
      selected &&
      check &&
      checkIntent > 0 &&
      original?.key === check.key &&
      original.command === check.command
        ? original.check()
        : undefined,
  );
  // Labels are from the existing, separately authorized P09 read owner.
  // An unavailable label does not remove a task or grant resume capability.
  const caseRead = useOwnerRead(
    JSON.stringify([binding, task?.caseId, 'P21-case-label']),
    async () => (task ? warranty.detail(task.caseId) : undefined),
  );
  const caseRow =
    task && caseRead.data?.warranty_case_id === task.caseId
      ? caseRead.data
      : undefined;
  const warehouseId = context.session?.activeWarehouseId;
  const warehouse =
    context.user && warehouseId && context.user.active_warehouse_id === warehouseId
      ? context.user.available_warehouses?.find(
          row => row.warehouse_id === warehouseId,
        )
      : undefined;
  const warehouseLabel = warehouse?.name ?? 'Chưa xác minh tên kho';
  const caseLabel = caseRow?.warranty_case_code ?? 'Hồ sơ bảo hành';
  const productLabel = caseRow?.sku_name ?? 'Chưa xác minh tên sản phẩm';
  const policy = task
    ? policies[task.policy] ??
      'Chỉ xem thông tin đã giữ. Cần đối chiếu trước khi thao tác tiếp.'
    : '';
  const sameOriginal =
    !!check &&
    original?.key === check.key &&
    original.command === check.command;
  const verified =
    !!task &&
    sameOriginal &&
    recovery.data?.outcome === 'SUCCEEDED' &&
    recovery.data.caseId === task.caseId;
  const resultId =
    verified && check?.command === 'RECORD'
      ? recovery.data?.businessId
      : undefined;
  const dialogVisible =
    !!overlay &&
    overlay.binding === binding &&
    overlay.taskId === selected?.id &&
    !denied;
  const surface = useRef<React.ComponentRef<typeof View>>(null);
  const [bounds, setBounds] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const cardRefs = useRef(new Map<string, React.ComponentRef<typeof View>>());
  const restoreTarget = useRef<number | undefined>(undefined);
  const restoreCard = useRef<string | undefined>(undefined);
  const viewportHeight = useRef(0);
  const navKey = `${selected?.id ?? 'list'}/${
    check ? 'check' : readonlySnapshot ? 'readonly' : 'info'
  }`;
  useEffect(() => {
    const y = selected ? 0 : memory.current.scroll;
    restoreTarget.current = y > 0 ? y : undefined;
    scroll.current?.scrollTo({ y, animated: false });
    // Arriving reads must not move the user's viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);
  useEffect(() => {
    if (!selected && read.data?.page && restoreCard.current) {
      const id = restoreCard.current;
      restoreCard.current = undefined;
      requestAnimationFrame(() =>
        (cardRefs.current.get(id) as unknown as { focus?(): void })?.focus?.(),
      );
    }
  }, [read.data?.page, selected]);
  const detailText = `ID phiếu: ${task?.id ?? 'Chưa xác minh'}\nID hồ sơ: ${
    task?.caseId ?? 'Chưa xác minh'
  }\nPhiên quét: ${
    task?.scanSessionId ?? 'Chưa xác minh'
  }\nVersion bản nhập hiện tại: ${
    task?.version ?? 'Chưa xác minh'
  }\nVersion phiếu đã ghi nhận: ${
    task?.businessVersion ?? 'Chưa xác minh'
  }\nYêu cầu gốc: ${
    check?.key ?? original?.key ?? 'Không có yêu cầu khớp trên máy'
  }\nLệnh gốc: ${check?.command ?? original?.command ?? 'Chưa xác minh'}`;
  const currentDetails = useRef({ binding, detailText });
  currentDetails.current = { binding, detailText };
  const dismissDialog = () => {
    copyEpoch.current++;
    setOverlay(undefined);
    setCopying(false);
  };
  const copyDetails = async () => {
    const captured = overlayRef.current;
    if (
      copyBusy.current ||
      !captured ||
      !['details', 'guidance'].includes(captured.kind) ||
      captured.binding !== binding
    )
      return;
    if (captured.text !== detailText) {
      setOverlay({
        ...captured,
        kind: 'feedback',
        title: 'Thông tin đã thay đổi',
        text: 'Đóng và mở lại Chi tiết đối chiếu để đọc thông tin hiện tại trước khi sao chép.',
      });
      return;
    }
    const operation = ++copyEpoch.current;
    const copyScope = JSON.stringify(captureSessionScope());
    copyBusy.current = true;
    setCopying(true);
    const stillCurrent = () =>
      alive.current &&
      JSON.stringify(captureSessionScope()) === copyScope &&
      operation === copyEpoch.current &&
      overlayRef.current === captured &&
      currentDetails.current.binding === captured.binding &&
      currentDetails.current.detailText === captured.text;
    try {
      // Existing cross-platform clipboard port; this calls no NFC read/write.
      await copyTextToClipboard(captured.text!);
      if (stillCurrent())
        setOverlay({
          ...captured,
          kind: 'feedback',
          title: 'Đã sao chép thông tin đối chiếu',
          text: 'Bạn có thể dùng thông tin này để đối chiếu đúng phiếu và yêu cầu cũ.',
        });
    } catch {
      if (stillCurrent())
        setOverlay({
          ...captured,
          kind: 'feedback',
          title: 'Chưa sao chép được',
          text: `Bạn có thể chọn và sao chép thủ công:\n\n${captured.text}`,
        });
    } finally {
      copyBusy.current = false;
      if (alive.current && operation === copyEpoch.current) setCopying(false);
    }
  };
  const open = (kind: Overlay['kind'], title: string, text?: string) =>
    setOverlay({
      kind,
      title,
      text: text ?? detailText,
      binding,
      taskId: selected?.id,
    });
  const openReader = (title: string, value: string) =>
    open('reader', title, value);
  const back = () => {
    if (dialogVisible) {
      dismissDialog();
      return;
    }
    if (readonlySnapshot) {
      setReadonlySnapshot(false);
      return;
    }
    if (check) {
      setCheck(undefined);
      setCheckIntent(0);
      read.retry();
      return;
    }
    if (selected) {
      restoreCard.current = selected.id + '/' + selected.scanSessionId;
      setSelected(undefined);
      return;
    }
    onBack();
  };
  useHardwareBack(() => {
    back();
    return true;
  });
  const select = (row: ResumeTask) => {
    setRecent(row.id);
    setSelected(row);
    setCheck(undefined);
    setCheckIntent(0);
    setReadonlySnapshot(false);
  };
  const startCheck = () => {
    if (read.loading || recovery.loading || !original || denied) return;
    setCheck({ key: original.key, command: original.command });
    setReadonlySnapshot(false);
    setCheckIntent(value => value + 1);
  };
  const panel = check
    ? 'P21.S04'
    : readonlySnapshot
    ? 'P21.S03'
    : selected
    ? 'P21.S02'
    : 'P21.S01';
  const title = check
    ? check.command === 'SAVE'
      ? 'Kiểm tra kết quả lưu phiếu'
      : check.command === 'CANCEL'
      ? 'Kiểm tra kết quả hủy phiếu'
      : 'Kiểm tra kết quả xuất'
    : readonlySnapshot
    ? 'Cần đối chiếu trên Web'
    : selected
    ? 'Tiếp tục phiếu linh kiện'
    : 'Phiếu đang thực hiện';
  const codeCount = task?.codeCount;
  const summary = `${codeCount ?? 'Chưa xác minh'} mã · ${
    task?.quantity ?? 'Chưa xác minh'
  } linh kiện`;
  const showGuidance = () => open('guidance', 'Hướng dẫn đối chiếu');
  const documentLabel = task?.number ?? 'Chưa có số phiếu';
  const snapshot = task?.codes ?? [];
  const actionLabel =
    check?.command === 'SAVE'
      ? 'Kiểm tra kết quả lưu phiếu'
      : check?.command === 'CANCEL'
      ? 'Kiểm tra kết quả hủy phiếu'
      : 'Kiểm tra kết quả xuất';
  const footer = !selected ? (
    <P21Action
      label="Về lịch sử"
      variant="secondary"
      onPress={onHistory ?? onBack}
    />
  ) : readonlySnapshot ? (
    <>
      <P21Action
        label="Hướng dẫn đối chiếu"
        onPress={showGuidance}
        trailing={<P04Icon name="monitor" size={22} color={HN_UI.onBrand} />}
      />
      <P21Action
        label="Về phiếu đang thực hiện"
        variant="secondary"
        onPress={() => {
          restoreCard.current = selected.id + '/' + selected.scanSessionId;
          setReadonlySnapshot(false);
          setSelected(undefined);
        }}
      />
    </>
  ) : check ? (
    <>
      <P21Action
        label={resultId ? 'Mở kết quả đã xác minh' : actionLabel}
        loading={recovery.loading}
        disabled={!task || denied || (!resultId && (!sameOriginal || verified))}
        onPress={() => {
          if (task && resultId) onOpenResult(task.caseId, resultId);
          else startCheck();
        }}
        trailing={
          !recovery.loading && !resultId ? (
            <HnHomeIcon name="history" size={22} color={HN_UI.onBrand} />
          ) : undefined
        }
      />
      <P21Action
        label="Đối chiếu trên Web"
        variant="secondary"
        onPress={showGuidance}
      />
    </>
  ) : (
    <>
      <View>
        <Text style={[ui.text, { fontWeight: '700' }]}>{summary}</Text>
        <Text style={ui.small}>
          {read.loading
            ? 'Đang đọc lại phiếu…'
            : original
            ? 'Cần kiểm tra kết quả yêu cầu cũ'
            : 'Số lượng bản nhập · chưa đủ điều kiện quét'}
        </Text>
      </View>
      {original ? (
        <P21Action
          label="Kiểm tra kết quả yêu cầu cũ"
          onPress={startCheck}
          disabled={read.loading || recovery.loading || denied}
        />
      ) : task?.canOpenBusiness && task.businessId ? (
        <P21Action
          label="Mở phiếu đã ghi nhận"
          onPress={() => onOpenResult(task.caseId, task.businessId!)}
        />
      ) : (
        <P21Action
          label="Tiếp tục quét"
          disabled
          onPress={() => undefined}
          trailing={<HnHomeIcon name="arrow" size={24} color={HN_UI.onBrand} />}
        />
      )}
      <P21Action
        label="Kiểm tra phiếu"
        variant="secondary"
        disabled={!task}
        onPress={() => setReadonlySnapshot(true)}
      />
    </>
  );

  const dock =
    selected && !task && read.error ? (
      <>
        <P21Action
          label="Tải lại dữ liệu"
          disabled={read.loading}
          onPress={read.retry}
        />
        <P21Action
          label="Về phiếu đang thực hiện"
          variant="secondary"
          onPress={() => {
            setSelected(undefined);
            setCheck(undefined);
            setReadonlySnapshot(false);
          }}
        />
      </>
    ) : (
      footer
    );
  return (
    <View
      ref={surface}
      style={ui.fill}
      onLayout={() =>
        surface.current?.measureInWindow((left, top, width, height) =>
          setBounds({ left, top, width, height }),
        )
      }
    >
      <SafeAreaView edges={['top', 'bottom']} style={ui.screen} testID={panel}>
        <StatusBar barStyle="light-content" />
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <SvgXml
            width="100%"
            height="100%"
            xml={
              `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><defs><linearGradient id="p21-header" x1="0" y1="0" x2="1" y2=".35"><stop offset="0" stop-color="${HN_UI.shell}"/><stop offset="1" stop-color="${HN_UI.shell}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#p21-header)"/></svg>`
            }
          />
        </View>
        <View style={ui.header}>
          <Pressable
            style={ui.back}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={back}
          >
            <P04Icon name="arrow-left" color={HN_UI.onBrand} size={24} />
          </Pressable>
          <Text accessibilityRole="header" style={ui.title}>
            {title}
          </Text>
        </View>
        <View style={ui.body}>
          <ScrollView
            ref={scroll}
            style={{ flex: 1 }}
            contentContainerStyle={ui.content}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={32}
            showsVerticalScrollIndicator={false}
            onLayout={event => {
              viewportHeight.current = event.nativeEvent.layout.height;
            }}
            onContentSizeChange={(_width, height) => {
              if (restoreTarget.current !== undefined) {
                if (!read.loading && viewportHeight.current > 0)
                  restoreTarget.current = Math.min(
                    restoreTarget.current,
                    Math.max(0, height - viewportHeight.current),
                  );
                scroll.current?.scrollTo({
                  y: restoreTarget.current,
                  animated: false,
                });
              }
            }}
            onScroll={event => {
              const y = event.nativeEvent.contentOffset.y;
              if (restoreTarget.current !== undefined) {
                if (Math.abs(y - restoreTarget.current) > 1) return;
                restoreTarget.current = undefined;
              }
              if (!selected) memory.current.scroll = y;
            }}
          >
            {!selected ? (
              <>
                <View style={ui.between}>
                  <Text style={ui.heading}>Tiếp tục công việc</Text>
                  <Badge label={`${tasks.length} phiếu đã tải`} />
                </View>
                <Text style={ui.caption}>
                  Mở lại phiếu đang giữ để tiếp tục công việc.
                </Text>
                <View style={ui.between}>
                  <Text style={[ui.small, ui.fill]}>
                    Nguồn: {read.data?.page?.total ?? 'Chưa xác minh'} · Trang{' '}
                    {page}
                  </Text>
                  <Link
                    label={
                      status === 'ALL'
                        ? 'Lọc trạng thái'
                        : statuses[status] ?? 'Lọc trạng thái'
                    }
                    onPress={() => open('filter', 'Trạng thái phiếu')}
                  />
                  <Pressable
                    style={ui.back}
                    accessibilityRole="button"
                    accessibilityLabel="Đọc lại dữ liệu hiện tại"
                    accessibilityState={{
                      disabled: read.loading,
                      busy: read.loading,
                    }}
                    disabled={read.loading}
                    onPress={read.retry}
                  >
                    <HnHomeIcon name="history" size={21} color={HN_UI.textLink} />
                  </Pressable>
                </View>
                {!!localPending.length && !denied && (
                  <Notice
                    warning
                  >{`${localPending.length} yêu cầu trên máy chưa rõ kết quả. Cần đối chiếu trước khi gửi tiếp.`}</Notice>
                )}
                {!!visibleLocalDrafts.length && (
                  <View testID="P21.local-drafts" style={{gap:12}}>
                    <Text style={ui.heading}>Nháp trên thiết bị ({visibleLocalDrafts.length})</Text>
                    <Notice>Nháp chưa lưu nằm trên thiết bị này, được liệt kê riêng với nguồn Web. Mở đúng hồ sơ để tiếp tục; chưa có xác nhận xuất kho.</Notice>
                    {visibleLocalDrafts.map(row => (
                      <View key={row.draftId+'/'+row.scanSessionId} style={ui.card}>
                        <View style={ui.between}>
                          <Text style={[ui.heading,ui.fill]}>Phiếu linh kiện trên thiết bị</Text>
                          <Badge label="Chưa lưu" />
                        </View>
                        <Readable label="Hồ sơ của nháp trên thiết bị" value={'Hồ sơ: '+row.caseId} open={openReader} style={ui.small}/>
                        <Readable label="Mã nháp trên thiết bị" value={'Nháp: '+row.draftId} open={openReader} style={ui.small}/>
                        <Text style={ui.text}>{row.codeCount} mã đang giữ · {row.quantity} linh kiện chưa xác nhận</Text>
                        <P21Action
                          label={localOpening===row.draftId?'Đang xác minh hồ sơ…':'Tiếp tục nháp trên thiết bị'}
                          disabled={!onResumeLocalDraft||!!localOpening}
                          onPress={()=>{resumeLocal(row).catch(()=>undefined);}}
                        />
                      </View>
                    ))}
                  </View>
                )}
                {!denied && localDrafts.unresolved>0 && (
                  <Notice warning>Còn dữ liệu trên thiết bị chưa xác minh. Giữ nguyên phiếu và đối chiếu trước khi tiếp tục.</Notice>
                )}
                {!!localError && !denied && <Notice warning>{localError}</Notice>}
                {tasks.map(row => (
                  <View
                    key={row.id + '/' + row.scanSessionId}
                    style={{ gap: 2 }}
                  >
                    <Pressable
                      ref={node => {
                        if (node)
                          cardRefs.current.set(
                            row.id + '/' + row.scanSessionId,
                            node,
                          );
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Xem checkpoint"
                      accessibilityHint={
                        'Mở đúng phiếu ' + (row.number ?? row.id)
                      }
                      onPress={() => select(row)}
                      style={({ pressed }) => [
                        ui.card,
                        pressed && { backgroundColor: HN_UI.canvas },
                      ]}
                    >
                      <View style={ui.between}>
                        <Text numberOfLines={2} style={[ui.heading, ui.fill]}>
                          {row.number ?? 'Phiếu linh kiện'}
                        </Text>
                        <Badge
                          label={
                            row.localOnly
                              ? 'Chưa rõ kết quả'
                              : statuses[row.status] ?? 'Chưa xác minh'
                          }
                        />
                      </View>
                      <Text style={ui.text}>Hồ sơ bảo hành</Text>
                      <View style={ui.between}>
                        <Text style={[ui.small, ui.fill]} numberOfLines={2}>
                          {warehouseLabel}
                        </Text>
                        <Text style={ui.small}>
                          Chưa xác minh thời gian giữ
                        </Text>
                      </View>
                      <View style={[ui.between, { paddingTop: 8 }]}>
                        <Text style={[ui.text, ui.fill]}>
                          {row.codeCount ?? 'Chưa xác minh'} mã ·{' '}
                          {row.quantity ?? 'Chưa xác minh'} linh kiện
                        </Text>
                        <View style={ui.row}>
                          <Text style={ui.linkText}>Xem phiếu</Text>
                          <HnHomeIcon name="arrow" size={22} color={HN_UI.textLink} />
                        </View>
                      </View>
                      {recent === row.id && (
                        <Text style={ui.small}>Vừa xem</Text>
                      )}
                    </Pressable>
                    <Link
                      label="Xem mã phiếu đầy đủ"
                      onPress={() =>
                        openReader(
                          'Mã phiếu và hồ sơ',
                          `ID phiếu: ${row.id}\nID hồ sơ: ${row.caseId}\nPhiên quét: ${row.scanSessionId}`,
                        )
                      }
                    />
                  </View>
                ))}
                {read.data?.page?.total === 0 && !localPending.length && !visibleLocalDrafts.length && !localDrafts.unresolved && (
                  <View style={ui.card}>
                    <Text style={ui.heading}>Chưa có phiếu đang làm</Text>
                    <Text style={ui.caption}>
                      Chưa có công việc trong nguồn, phiên và bộ lọc này.
                    </Text>
                  </View>
                )}
                {read.data?.page?.items.length === 0 &&
                  (read.data.page.total ?? 0) > 0 && (
                    <Notice warning>
                      Trang rỗng nhưng tổng nguồn còn dữ liệu. Hãy đọc lại trang
                      đầu.
                    </Notice>
                  )}
                <Notice>
                  Các mã đang giữ trên phiếu được giữ lại khi bạn mở lại. Cần
                  chủ phiếu xác minh trước khi tiếp tục quét.
                </Notice>
                <View style={ui.card}>
                  <Text style={ui.caption}>
                    Phiếu đã xuất chỉ được mở để xem kết quả và không thể quét
                    tiếp.
                  </Text>
                </View>
                {page > 1 && (
                  <P21Action
                    label="Trang trước"
                    variant="secondary"
                    disabled={read.loading}
                    onPress={() => setPage(value => value - 1)}
                  />
                )}
                {read.data?.page?.hasMore && (
                  <P21Action
                    label="Trang tiếp theo"
                    disabled={read.loading || !read.data.page.nextPage}
                    onPress={() => {
                      if (read.data?.page?.nextPage)
                        setPage(read.data.page.nextPage);
                    }}
                  />
                )}
                {page > 1 && (
                  <P21Action
                    label="Đọc lại trang đầu"
                    variant="secondary"
                    disabled={read.loading}
                    onPress={() => setPage(1)}
                  />
                )}
              </>
            ) : task ? (
              check || readonlySnapshot ? (
                <>
                  <View style={ui.hero}>
                    <View style={[ui.heroTile, readonlySnapshot && ui.warning]}>
                      {readonlySnapshot ? (
                        <P04Icon name="monitor" size={36} color={HN_UI.warning} />
                      ) : (
                        <HnHomeIcon
                          name="clock"
                          size={36}
                          color={HN_UI.textLink}
                          strokeWidth={2}
                        />
                      )}
                    </View>
                    <Text accessibilityRole="header" style={ui.heroTitle}>
                      {readonlySnapshot
                        ? 'Chưa xác minh được mã đã quét'
                        : verified
                        ? check!.command === 'SAVE'
                          ? 'Đã xác minh lưu phiếu'
                          : check!.command === 'CANCEL'
                          ? 'Đã xác minh hủy phiếu'
                          : 'Đã xác minh kết quả xuất'
                        : recovery.error
                        ? 'Chưa kiểm tra được kết quả'
                        : 'Đang chờ xác định kết quả'}
                    </Text>
                    <Text style={ui.heroText}>
                      {readonlySnapshot
                        ? 'Phiếu được giữ lại để đối chiếu.\nKhông quét hoặc gửi lại phiếu lúc này.'
                        : verified
                        ? 'Kết quả của đúng yêu cầu cũ đã được xác minh.\nKhông gửi lại yêu cầu này.'
                        : check!.command === 'SAVE'
                        ? 'Yêu cầu lưu phiếu chưa rõ kết quả.\nKhông gửi lại khi chưa đối chiếu.'
                        : 'Yêu cầu xác nhận chưa rõ kết quả.\nKhông gửi lại khi chưa có kết quả.'}
                    </Text>
                  </View>
                  <View style={[ui.card, { gap: 0, paddingVertical: 16 }]}>
                    <Value label="Phiếu xuất" value={documentLabel} />
                    <View style={ui.line} />
                    <Value label="Hồ sơ" value={caseLabel} />
                    <View style={ui.line} />
                    {readonlySnapshot ? (
                      <>
                        <Value label="Kho" value={warehouseLabel} />
                        <View style={ui.line} />
                        <Value label="Lần giữ gần nhất" value="Chưa xác minh" />
                      </>
                    ) : (
                      <>
                        <Value
                          label="Số mã/hộp đã giữ"
                          value={String(codeCount ?? 'Chưa xác minh')}
                        />
                        <View style={ui.line} />
                        <Value
                          label="Lượng chưa kiểm chứng"
                          value={
                            task.quantity === null ||
                            task.quantity === undefined
                              ? 'Chưa xác minh'
                              : `${task.quantity} linh kiện`
                          }
                        />
                      </>
                    )}
                  </View>
                  <Notice warning>
                    {readonlySnapshot
                      ? 'Mở đúng phiếu trên Web WMS để kiểm tra mã đã ghi nhận và kết quả xuất.'
                      : 'Kiểm tra trạng thái của đúng yêu cầu trước khi tiếp tục để tránh ghi nhận trùng.'}
                  </Notice>
                  {readonlySnapshot && <Text style={ui.caption}>{policy}</Text>}
                  {!!recovery.error && check && (
                    <Notice warning>{recovery.error.message}</Notice>
                  )}
                  <Link
                    label="Chi tiết đối chiếu"
                    onPress={() => open('details', 'Chi tiết đối chiếu')}
                  />
                  {readonlySnapshot && (
                    <Link
                      label="Xem mã đã giữ"
                      onPress={() =>
                        openReader(
                          'Mã đã giữ · chưa xác minh',
                          snapshot
                            .map(
                              (code, index) =>
                                `${index + 1}. ${String(
                                  code.raw_code ?? 'Chưa ghi nhận mã',
                                )}\nSố lượng: ${String(
                                  code.quantity ?? 'Chưa xác minh',
                                )} · Nguồn: ${
                                  sources[String(code.scan_source)] ??
                                  'Chưa ghi nhận'
                                }`,
                            )
                            .join('\n\n') || 'Chưa có dữ liệu mã.',
                        )
                      }
                    />
                  )}
                </>
              ) : (
                <>
                  <View style={ui.card}>
                    <View style={ui.between}>
                      <Readable
                        value={documentLabel}
                        label="Số phiếu"
                        open={openReader}
                        style={ui.heading}
                      />
                      <Badge
                        label={
                          task.canOpenBusiness
                            ? 'Đã ghi nhận'
                            : 'Chưa xác nhận xuất'
                        }
                        neutral={task.canOpenBusiness}
                      />
                    </View>
                    <View style={ui.line} />
                    <View style={ui.row}>
                      <View style={ui.tile}>
                        <HnHomeIcon
                          name="tool"
                          size={25}
                          color={HN_OPERATIONS.warranty.ink}
                          strokeWidth={2}
                        />
                      </View>
                      <View style={ui.fill}>
                        <Readable
                          value={caseLabel}
                          label="Hồ sơ"
                          open={openReader}
                          style={ui.heading}
                        />
                        <Readable
                          value={productLabel}
                          label="Sản phẩm"
                          open={openReader}
                          style={ui.caption}
                        />
                      </View>
                      {caseRow && (
                        <Badge
                          label={
                            caseStatuses[caseRow.status] ?? 'Chưa xác minh'
                          }
                          neutral
                        />
                      )}
                    </View>
                    <Text style={ui.small}>
                      Đang giữ · Chưa xác minh thời gian giữ
                    </Text>
                  </View>
                  <View
                    style={[ui.card, ui.row, { backgroundColor: HN_UI.canvas }]}
                  >
                    <P04Icon name="warehouse" color={HN_UI.textLink} size={24} />
                    <View style={ui.fill}>
                      <Text style={ui.small}>Kho xuất</Text>
                      <Readable
                        value={warehouseLabel}
                        label="Kho xuất"
                        open={openReader}
                        style={[ui.text, { fontWeight: '700' }]}
                      />
                    </View>
                    <P04Icon name="lock" size={18} color={HN_UI.textLink} />
                  </View>
                  <View style={ui.between}>
                    <Text style={ui.heading}>Mã đang giữ trên phiếu</Text>
                    <Badge label={`${codeCount ?? '—'} mã`} neutral />
                  </View>
                  {snapshot.map((code, index) => (
                    <View style={ui.card} key={index}>
                      <View style={ui.row}>
                        <View style={ui.tile}>
                          <HnHomeIcon
                            name="tool"
                            color={HN_OPERATIONS.warranty.ink}
                            size={24}
                            strokeWidth={2}
                          />
                        </View>
                        <Readable
                          value={String(code.raw_code ?? 'Chưa ghi nhận mã')}
                          label={`Mã ${index + 1}`}
                          open={openReader}
                        />
                        <P04Icon name="lock" size={20} color={HN_UI.textLink} />
                      </View>
                      <View style={ui.between}>
                        <Badge label="Bản nhập đã giữ" neutral />
                        <Text style={ui.text}>
                          × {String(code.quantity ?? 'Chưa xác minh')}
                        </Text>
                      </View>
                    </View>
                  ))}
                  {!snapshot.length && (
                    <View style={ui.card}>
                      <Text style={ui.caption}>
                        Chưa có dữ liệu mã để hiển thị.
                      </Text>
                    </View>
                  )}
                  <Notice>{policy}</Notice>
                  <View style={{ gap: 6 }}>
                    <View style={ui.row}>
                      <HnHomeIcon name="clock" color={HN_UI.textMuted} size={18} />
                      <Text style={ui.small}>
                        {read.data?.task && !task.localOnly
                          ? 'Đã đọc thông tin phiếu từ nguồn'
                          : 'Đang giữ thông tin yêu cầu trên máy'}
                      </Text>
                    </View>
                    <View style={ui.row}>
                      <P04Icon name="lock" color={HN_UI.textMuted} size={18} />
                      <Text style={ui.small}>
                        Mã chưa được chủ phiếu xác minh lại
                      </Text>
                    </View>
                    <View style={ui.row}>
                      <HnHomeIcon name="clock" color={HN_UI.textMuted} size={18} />
                      <Text style={ui.small}>
                        {task.canOpenBusiness
                          ? 'Có kết quả đã ghi nhận · mở phiếu để xem'
                          : 'Chưa xác nhận xuất kho'}
                      </Text>
                    </View>
                  </View>
                  {!original && (
                    <Text style={ui.small}>
                      Không có yêu cầu gốc khớp trên máy này. Chỉ xem thông tin
                      phiếu; không suy yêu cầu từ lịch sử.
                    </Text>
                  )}
                  <Link
                    label="Chi tiết đối chiếu"
                    onPress={() => open('details', 'Chi tiết đối chiếu')}
                  />
                  <Link
                    label="Đọc lại dữ liệu hiện tại"
                    onPress={() => {
                      if (!read.loading) read.retry();
                    }}
                  />
                </>
              )
            ) : null}
            {read.loading && (
              <Text accessibilityLiveRegion="polite" style={ui.caption}>
                Đang đọc công việc…
              </Text>
            )}
            {read.error && (
              <View style={ui.card}>
                <Text style={ui.heading}>Chưa tải được dữ liệu</Text>
                <Text style={ui.caption}>{read.error.message}</Text>
                <P21Action
                  label="Tải lại dữ liệu"
                  variant="secondary"
                  disabled={read.loading}
                  onPress={read.retry}
                />
              </View>
            )}
          </ScrollView>
          <View testID="P21.dock" style={ui.dock}>
            {dock}
          </View>
        </View>
      </SafeAreaView>
      {dialogVisible && (
        <Dialog
          visible
          title={overlay.title}
          bounds={bounds}
          dismissOnBackdrop={false}
          onDismiss={dismissDialog}
          footer={
            <View style={ui.reader}>
              {['details', 'guidance'].includes(overlay.kind) && (
                <P21Action
                  label="Sao chép thông tin đối chiếu"
                  onPress={copyDetails}
                  loading={copying}
                />
              )}
              <P21Action
                label="Đóng"
                variant="secondary"
                onPress={dismissDialog}
              />
            </View>
          }
        >
          <View style={ui.reader}>
            {overlay.kind === 'filter' ? (
              [
                ['ALL', 'Tất cả'],
                ['DRAFT', 'Đang làm'],
                ['RECORDED', 'Đã ghi nhận'],
                ['CANCELLED', 'Đã hủy'],
              ].map(([value, label]) => (
                <P21Action
                  key={value}
                  label={label!}
                  variant={status === value ? 'primary' : 'secondary'}
                  onPress={() => {
                    setStatus(value!);
                    setPage(1);
                    memory.current.scroll = 0;
                    setOverlay(undefined);
                  }}
                />
              ))
            ) : overlay.kind === 'reader' || overlay.kind === 'feedback' ? (
              <Text selectable style={ui.text}>
                {overlay.text}
              </Text>
            ) : (
              <>
                {overlay.kind === 'guidance' && (
                  <Text style={ui.caption}>
                    1. Mở Web WMS đã được đơn vị cung cấp. Tìm đúng phiếu và hồ
                    sơ theo định danh bên dưới.{'\n\n'}2. Đối chiếu mã, số lượng
                    đã giữ và kết quả của đúng yêu cầu cũ. Chưa rõ kết quả thì
                    giữ nguyên phiếu.{'\n\n'}3. Trở lại app và chọn Kiểm tra kết
                    quả. Không tạo phiếu bù, gửi lại hoặc tự sửa mã để thử lại.
                  </Text>
                )}
                <Text selectable style={ui.text}>
                  {overlay.text}
                </Text>
                <Text style={ui.caption}>
                  Định danh và version bản nhập hiện tại không thay thế key,
                  body hoặc version của yêu cầu gốc. Bản nhập cá nhân không phải
                  bằng chứng mã hợp lệ hoặc đã xuất.
                </Text>
                <Text style={ui.caption}>
                  Chưa có đường dẫn Web WMS được xác minh để mở tự động. Thông
                  tin đối chiếu chỉ gồm định danh được phép, không gồm thông tin
                  đăng nhập.
                </Text>
              </>
            )}
          </View>
        </Dialog>
      )}
    </View>
  );
}
