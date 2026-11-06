import { HN_UI } from '../../theme/uiKitV3';
import { SCANNER_ARIAL_FAMILY } from '../../theme/scannerTypography';
/** Product P14 S03/S04. Uses the P01-owned current shift and the real API adapter. */
import React, {
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { AppIcon, type AppIconName } from '../../ui/AppIcon';
import { HN_OPERATIONS } from '../../ui/hnHomeTokens';
import { createNativeDraftSaver } from '../../shift/nativeDraftSavers';
import type { DraftSavePlan } from '../../shift/saveOpenDrafts';
import { useHardwareBack } from '../../app/useHardwareBack';
import { captureSessionScope, getSession, isSessionScopeCurrent } from '../../auth/session';
import {
  getShiftState,
  subscribeShiftState,
  requestShiftClose,
  cancelShiftClose,
} from '../../shift/shiftState';
import {
  createP14ShiftService,
  type CloseCheck,
  type EndReceipt,
} from '../../shift/p14ShiftService';
import {
  readShiftLocalOwners,
  readShiftLocalOwnerStatus,
} from '../../shift/localOwners';
import { createWorkShiftIdempotencyKey } from '../../services/wms/workShift';
import type { CurrentUser } from '../../services/wms/types';
import { toAppError } from '../../errors/AppError';
import { formatVietnamClock, formatVietnamDate } from '../../time/vietnamTime';
import { establishP09CloseCheckBaseline } from '../../shift/nativeOwnerEvidence';
import {
  p14OperationLabel,
  type P14DraftOverview,
} from '../../shift/p14DraftOverview';

type Service = ReturnType<typeof createP14ShiftService>;
type Modal = {
  title: string;
  message?: string;
  confirm?: 'END' | 'LOGOUT' | 'SAVE';
  savePlan?: DraftSavePlan;
  saved?: true;
  reader?: true;
};
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const instant = (v: unknown, time = false) =>
  time
    ? formatVietnamClock(v, { missing: 'Chưa xác minh' })
    : formatVietnamDate(v, 'Chưa xác minh');
const summaryOperation = (value: unknown) =>
  ({
    INBOUND: 'Nhập kho',
    OUTBOUND: 'Xuất kho',
    WARRANTY: 'Bảo hành',
    COMPONENT_ISSUE: 'Xuất linh kiện',
  }[String(value)] ?? 'Nghiệp vụ chưa xác minh');
const summaryDraftTitle = (raw: unknown) => {
  const item = object(raw);
  if (typeof item.title === 'string' && item.title.trim())
    return item.title.trim();
  try {
    const form =
      typeof item.form === 'string' ? object(JSON.parse(item.form)) : {};
    const p05 = object(form.p05_create);
    for (const candidate of [form.name, p05.name])
      if (typeof candidate === 'string' && candidate.trim())
        return candidate.trim();
  } catch {
    // The service already validates JSON. Keep the fallback fail-closed.
  }
  return typeof item.document_id === 'string'
    ? 'Mã nháp ' + item.document_id.slice(0, 8).toUpperCase()
    : 'Phiếu nháp chưa xác minh mã';
};

export function P14ShiftScreen({
  service,
  user,
  onBack,
  onHistory,
  onLogout,
  footer,
  retained,
  onResumeOwner,
  loadDrafts,
  draftSaver: providedSaver,
}: {
  service: Service;
  user?: CurrentUser;
  onBack: () => void;
  onHistory: () => void;
  onLogout: () => Promise<void>;
  footer: React.ReactNode;
  retained?: { scrollY: number };
  onResumeOwner?: (
    owner: 'P03' | 'P04' | 'P05' | 'P07' | 'P09' | 'P19',
    draft?: P14DraftOverview['items'][number],
  ) => void;
  loadDrafts?: () => Promise<P14DraftOverview>;
  draftSaver?: ReturnType<typeof createNativeDraftSaver>;
}) {
  const draftSaver = useMemo(
    () => providedSaver ?? createNativeDraftSaver(),
    [providedSaver],
  );
  const shared = useSyncExternalStore(
      subscribeShiftState,
      getShiftState,
      getShiftState,
    ),
    session = getSession();
  const { width } = useWindowDimensions(),
    s = Math.min(1, width / 494);
  const [receipt, setReceipt] = useState<EndReceipt | undefined>(
      service.receipt,
    ),
    [summary, setSummary] = useState<Record<string, unknown> | undefined>(
      service.summarySnapshot,
    ),
    [closeCheck, setCloseCheck] = useState<CloseCheck>(),
    [draftOverview, setDraftOverview] = useState<P14DraftOverview>(),
    [draftLoading, setDraftLoading] = useState(false),
    [draftError, setDraftError] = useState(''),
    [draftRetry, setDraftRetry] = useState(0),
    [modal, setModal] = useState<Modal | null>(null),
    [decisionReady, setDecisionReady] = useState(false),
    [busy, setBusy] = useState(false),
    [, setRevision] = useState(0);
  const alive = useRef(true),
    locked = useRef(false),
    scroll = useRef<React.ComponentRef<typeof ScrollView>>(null),
    scrollY = useRef(0),
    epoch = useMemo(() => ({ value: 0 }), []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (retained?.scrollY)
        scroll.current?.scrollTo({ y: retained.scrollY, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [retained]);
  const dismissModal = useCallback(() => {
    if (!locked.current) setModal(null);
  }, []);
  useEffect(() => {
    alive.current = true;
    requestShiftClose();
    return () => {
      alive.current = false;
      epoch.value++;
      service.invalidateCheck();
      if (!service.pending) cancelShiftClose();
    };
  }, [service, epoch]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (alive.current) setRevision(n => n + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setDecisionReady(false);
    if (!modal?.confirm) return;
    // A modal can replace the button under an already active pointer. Arm the
    // irreversible decision only after that original gesture has fully ended;
    // this prevents Android tap-through across END -> summary -> logout.
    const timer = setTimeout(() => {
      if (alive.current) setDecisionReady(true);
    }, 700);
    return () => clearTimeout(timer);
  }, [modal?.confirm]);
  const local = readShiftLocalOwners();
  const shift = shared.shift ?? shared.lastVerifiedShift,
    completed = !!receipt;
  useEffect(() => {
    if (!loadDrafts || completed || !shift) return;
    let current = true;
    setDraftLoading(true);
    setDraftError('');
    loadDrafts()
      .then(value => {
        if (current && alive.current) setDraftOverview(value);
      })
      .catch(error => {
        if (current && alive.current)
          setDraftError(
            toAppError(error).message || 'Chưa tải được phiếu nháp.',
          );
      })
      .finally(() => {
        if (current && alive.current) setDraftLoading(false);
      });
    return () => {
      current = false;
    };
  }, [loadDrafts, completed, shift, draftRetry]);
  const warehouse =
    user?.available_warehouses?.find(
      w => w.warehouse_id === session?.activeWarehouseId,
    )?.name ?? 'Kho chưa xác minh';
  const actor = user?.name ?? session?.userName ?? 'Chưa xác minh';
  const pending = !!service.pending,
    ownerRows = readShiftLocalOwnerStatus(),
    blockedOwners = ownerRows.filter(
      row => row.state !== 'CLEAN' || !row.coverageComplete,
    ),
    draftTotal =
      (draftOverview?.complete ? draftOverview.total : undefined) ??
      closeCheck?.draft_count;
  const partialDraftMessage =
    'Chưa tải đủ nguồn phiếu nháp. Tổng và danh sách hiện tại chưa đầy đủ; hãy tải lại.';
  const ownerName = (owner: (typeof ownerRows)[number]['owner']) =>
    ({
      P03: 'Quản lý nháp',
      P04: 'Nhập kho',
      P05: 'Xuất kho',
      P07: 'Gán NFC',
      P09: 'Bảo hành',
      P19: 'Xuất linh kiện',
    }[owner]);
  const status = pending
    ? 'Chưa xác định ca đã kết thúc hay chưa. Giữ nguyên yêu cầu để đối chiếu trước khi thực hiện tiếp.'
    : !shift
    ? 'Phiên hiện tại chưa có ca được xác minh.'
    : shift.lifecycle?.end_supported !== true
    ? 'Chức năng kết thúc ca chưa khả dụng cho ca hiện tại.'
    : local.state !== 'CLEAN' || !local.coverageComplete
    ? `Cần xử lý tại: ${blockedOwners
        .map(row => ownerName(row.owner))
        .join(', ')}. Nháp đã SAVE vẫn được giữ sau khi kết thúc ca.`
    : 'Kiểm tra điều kiện kết thúc trước khi xác nhận.';
  const hasUnsavedOwners = blockedOwners.some(row => row.state === 'DIRTY');
  const savedClean =
    local.state === 'CLEAN' &&
    local.coverageComplete &&
    !local.busy &&
    !local.pendingRequestIds.length;
  const noticeInk = hasUnsavedOwners
    ? HN_UI.danger
    : pending
    ? HN_UI.warning
    : savedClean
    ? HN_UI.success
    : HN_UI.info;
  const noticeTitle = pending
    ? 'Ca còn chờ kết quả'
    : hasUnsavedOwners
    ? 'Còn phiếu chưa hoàn tất'
    : blockedOwners.length
    ? 'Cần kiểm tra dữ liệu trước khi kết thúc'
    : savedClean
    ? 'Các phiếu dở đã được lưu'
    : 'Kiểm tra trước khi kết thúc';
  const noticeMessage = hasUnsavedOwners
    ? 'Tiếp tục xử lý hoặc lưu nháp các phiếu đang mở trước khi kết thúc ca.'
    : pending
    ? status
    : blockedOwners.length
    ? 'Chưa đủ dữ liệu của các nghiệp vụ. Mở chi tiết để đối chiếu trước khi kết thúc ca.'
    : savedClean
    ? 'Kết thúc ca không đăng xuất tài khoản. ' +
      (service.canEnd
        ? 'Có thể xác nhận kết thúc ca.'
        : 'Kiểm tra điều kiện máy chủ trước khi xác nhận.')
    : status;
  const leave = () => {
    service.invalidateCheck();
    if (!pending) cancelShiftClose();
    onBack();
  };
  useHardwareBack(() => {
    if (modal) {
      if (!busy) setModal(null);
      return true;
    }
    if (!busy) leave();
    return true;
  });
  async function run(
    action:
      | 'check'
      | 'end'
      | 'reconcile'
      | 'summary'
      | 'summary-more'
      | 'logout',
  ) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    const ticket = ++epoch.value;
    const actionScope = captureSessionScope();
    try {
      if (action === 'logout') {
        await onLogout();
        return;
      }
      if (action === 'check') {
        let value = await service.closeCheck();
        if (!alive.current || ticket !== epoch.value || !isSessionScopeCurrent(actionScope)) return;
        const p09 = readShiftLocalOwnerStatus().find(
          row => row.owner === 'P09',
        );
        if (
          value.can_end &&
          p09?.state === 'UNKNOWN' &&
          p09.coverageComplete === false &&
          establishP09CloseCheckBaseline(true)
        ) {
          setRevision(n => n + 1);
          value = await service.closeCheck();
        }
        if (!alive.current || ticket !== epoch.value || !isSessionScopeCurrent(actionScope)) return;
        setCloseCheck(value);
        const ready = service.canEnd;
        setModal({
          title: ready
            ? 'Có thể kết thúc ca'
            : value.can_end
            ? 'Cần xử lý dữ liệu trên thiết bị'
            : 'Chưa thể kết thúc ca',
          message: ready
            ? `Đã kiểm tra server và thiết bị. ${value.draft_count} phiếu nháp vẫn được giữ sau khi kết thúc ca.`
            : value.can_end
            ? 'Server cho phép kết thúc, nhưng còn owner trên thiết bị chưa xác minh CLEAN. Mở danh sách để xử lý.'
            : value.blockers
                .map(
                  b =>
                    ((
                      {
                        SHIFT_TRACKING_INCOMPLETE:
                          'Ca chưa có bằng chứng theo dõi đầy đủ.',
                        OWNER_SNAPSHOT_UNSUPPORTED:
                          'Có nghiệp vụ hoặc yêu cầu đang chờ chưa được xác minh.',
                        DRAFT_RECEIPT_UNCONFIRMED:
                          'Có nháp chưa có kết quả lưu đúng phiên bản.',
                      } as Record<string, string>
                    )[b] ?? 'Còn điều kiện cần kiểm tra tại nghiệp vụ.'),
                )
                .join('\n'),
        });
      }
      if (action === 'end' || action === 'reconcile') {
        const value =
          action === 'end'
            ? await service.end(createWorkShiftIdempotencyKey())
            : await service.reconcile();
        if (!alive.current || ticket !== epoch.value) return;
        setReceipt(value);
        setModal(null);
        try {
          const nextSummary = await service.summary();
          if (alive.current && ticket === epoch.value) setSummary(nextSummary);
        } catch (e) {
          if (alive.current && ticket === epoch.value)
            setModal({
              title: 'Chưa tải được tổng kết',
              message: toAppError(e).message,
            });
        }
      }
      if (action === 'summary' || action === 'summary-more') {
        const value = await service.summary(
          action === 'summary-more'
            ? Number(object(summary?.draft_snapshot).page) + 1
            : 1,
        );
        if (alive.current && ticket === epoch.value) setSummary(value);
      }
    } catch (e) {
      if (alive.current && ticket === epoch.value) {
        const error = toAppError(e);
        if (error.status === 401 || error.status === 403) setSummary(undefined);
        setModal({
          title: service.pending ? 'Ca còn chờ kết quả' : 'Chưa hoàn tất',
          message:
            error.status === 503
              ? 'Chức năng kết thúc ca chưa khả dụng. Giữ dữ liệu và thử đọc lại sau.'
              : error.message,
        });
      }
    } finally {
      locked.current = false;
      if (alive.current && ticket === epoch.value) {
        setBusy(false);
        setRevision(n => n + 1);
      }
    }
  }
  async function prepareSave() {
    if (locked.current || pending) return;
    locked.current = true;
    setBusy(true);
    const ticket = ++epoch.value;
    const saveScope = captureSessionScope();
    try {
      // Only an affirmative current server read may establish the existing
      // legacy P09 empty-journal baseline. No UNKNOWN command is cleared.
      const p09 = readShiftLocalOwnerStatus().find(row => row.owner === 'P09');
      if (p09?.state === 'UNKNOWN' && !p09.coverageComplete) {
        const check = await service.closeCheck();
        if (!alive.current || ticket !== epoch.value || !isSessionScopeCurrent(saveScope)) return;
        if (check.can_end) establishP09CloseCheckBaseline(true);
      }
      const savePlan = draftSaver.plan();
      if (!alive.current || ticket !== epoch.value) return;
      if (!savePlan.owners.length)
        throw Error(
          'Không còn nháp thay đổi cần lưu. Kiểm tra lại điều kiện kết thúc ca.',
        );
      service.invalidateCheck();
      setCloseCheck(undefined);
      setModal({
        title: 'Lưu nháp các phiếu đang mở?',
        message:
          'Giữ nguyên nội dung và định danh phiếu để tiếp tục xử lý. Thao tác này không gửi phiếu lên Web hoặc thay đổi tồn kho.',
        confirm: 'SAVE',
        savePlan,
      });
    } catch (e) {
      if (alive.current && ticket === epoch.value)
        setModal({
          title: 'Chưa thể lưu đủ nháp',
          message: e instanceof Error ? e.message : toAppError(e).message,
        });
    } finally {
      locked.current = false;
      if (alive.current && ticket === epoch.value) {
        setBusy(false);
        setRevision(n => n + 1);
      }
    }
  }
  async function saveOpen() {
    if (locked.current || !modal?.savePlan) return;
    const plan = modal.savePlan,
      ticket = ++epoch.value;
    locked.current = true;
    setBusy(true);
    try {
      await draftSaver.save(plan);
      if (!alive.current || ticket !== epoch.value) return;
      service.invalidateCheck();
      setCloseCheck(undefined);
      setDraftRetry(n => n + 1);
      let checkMessage = '';
      try {
        const check = await service.closeCheck();
        if (alive.current && ticket === epoch.value) setCloseCheck(check);
      } catch {
        checkMessage =
          ' Chưa xác minh điều kiện kết thúc từ máy chủ; cần kiểm tra lại.';
      }
      if (alive.current && ticket === epoch.value)
        setModal({
          title: 'Đã lưu nháp',
          message:
            'Phiếu được giữ nguyên định danh, phiên quét, phiên bản và nội dung để tiếp tục xử lý.' +
            checkMessage,
          saved: true,
        });
    } catch (e) {
      if (alive.current && ticket === epoch.value)
        setModal({
          title: 'Chưa lưu đủ các phiếu',
          message:
            (e instanceof Error ? e.message : toAppError(e).message) +
            ' Các biên nhận SAVE thành công được giữ. Mở đúng nghiệp vụ để kiểm tra phần còn lại.',
        });
    } finally {
      locked.current = false;
      if (alive.current && ticket === epoch.value) {
        setBusy(false);
        setRevision(n => n + 1);
      }
    }
  }
  const label = (
    value: string,
    size = 18,
    weight: '400' | '600' | '700' = '400',
    color = HN_UI.textPrimary,
  ) => (
    <Text
      style={{
        fontFamily: SCANNER_ARIAL_FAMILY,
        fontSize: size * s,
        lineHeight: size * 1.5 * s,
        fontWeight: weight,
        color,
        flexShrink: 1,
        minWidth: 0,
      }}
    >
      {value}
    </Text>
  );
  const badge = (
    name: AppIconName,
    ink = HN_UI.textSecondary,
    soft = HN_UI.canvas,
  ) => (
    <View
      style={{
        width: 44 * s,
        height: 44 * s,
        borderRadius: 10 * s,
        backgroundColor: soft,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <AppIcon name={name} color={ink} size={24 * s} />
    </View>
  );
  const action = (
    title: string,
    press: () => void,
    danger = false,
    disabled = false,
    primary = false,
    icon?: AppIconName,
  ) => (
    <Button
      label={title}
      onPress={press}
      disabled={busy || disabled}
      variant={danger ? 'danger' : primary ? 'primary' : 'secondary'}
      leading={
        icon ? (
          <AppIcon
            name={icon}
            size={24 * s}
            color={danger || primary ? HN_UI.onBrand : HN_UI.textLink}
          />
        ) : undefined
      }
      style={{
        minHeight: 56 * s,
        borderRadius: 12 * s,
        paddingVertical: 12 * s,
        borderColor: HN_UI.border,
        ...(danger
          ? { backgroundColor: HN_UI.danger }
          : primary
          ? { backgroundColor: HN_UI.primary }
          : {}),
        ...(disabled
          ? {
              backgroundColor: HN_UI.surfaceSunken,
              borderColor: HN_UI.border,
              opacity: 1,
            }
          : {}),
      }}
      labelStyle={{
        fontFamily: SCANNER_ARIAL_FAMILY,
        fontSize: 14 * s,
        lineHeight: 20 * s,
        color: disabled
          ? HN_UI.textMuted
          : danger || primary
          ? HN_UI.onBrand
          : HN_UI.textLink,
      }}
    />
  );
  const draft = object(summary?.draft_snapshot),
    items = Array.isArray(draft.items) ? draft.items : [],
    previewItems = items.slice(0, 4),
    draftTotalKnown =
      Number.isSafeInteger(draft.total) && Number(draft.total) >= 0;
  const emptyDraftMessage = !draftTotalKnown
    ? 'Chưa xác minh dữ liệu phiếu nháp khi kết thúc ca. Tải lại tổng kết để kiểm tra.'
    : Number(draft.total) > 0
    ? 'Trang hiện tại chưa có dòng nháp; dùng Xem chi tiết hoặc tải trang tiếp theo.'
    : 'Không có phiếu nháp tại thời điểm kết thúc ca.';
  const docs = object(object(summary?.kpis).recorded_documents);
  const started = summary?.started_at ?? shift?.started_at,
    ended = receipt?.ended_at;
  const startedDate = instant(started),
    endedDate = instant(ended);
  const tiles = [
    ['Nhập kho', 'INBOUND', 'inbound'],
    ['Xuất kho', 'OUTBOUND', 'outbound'],
    ['Bảo hành', 'WARRANTY', 'warranty'],
    ['Thẻ NFC', 'NFC', 'nfc'],
  ] as const;
  return (
    <SafeAreaView
      edges={['top']}
      testID={completed ? 'P14.S04' : 'P14.S03'}
      style={{
        flex: 1,
        minHeight: 0,
        maxWidth: 494,
        width: '100%',
        alignSelf: 'center',
        backgroundColor: HN_UI.shell,
      }}
    >
      <View
        testID="p14-header"
        style={{
          minHeight: 88 * s,
          paddingHorizontal: 24 * s,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8 * s,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          onPress={leave}
          disabled={busy}
          style={{ width: 44 * s, minHeight: 44 * s, justifyContent: 'center' }}
        >
          <AppIcon name="chevron-left" size={24 * s} color={HN_UI.onBrand} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          {label(
            completed ? 'Tổng kết ca' : 'Kết thúc ca',
            22,
            '700',
            HN_UI.onBrand,
          )}
          {label(warehouse, 16, '400', HN_UI.onBrand)}
        </View>
      </View>
      <View
        style={{
          flex: 1,
          minHeight: 0,
          backgroundColor: HN_UI.surface,
          borderTopLeftRadius: 24 * s,
          borderTopRightRadius: 24 * s,
          overflow: 'hidden',
        }}
      >
        <ScrollView
          ref={scroll}
          testID="p14-scroll"
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{
            paddingHorizontal: 24 * s,
            paddingTop: 24 * s,
            paddingBottom: 16 * s,
            gap: 16 * s,
          }}
          onScroll={e => {
            scrollY.current = e.nativeEvent.contentOffset.y;
            if (retained) retained.scrollY = scrollY.current;
          }}
          scrollEventThrottle={16}
        >
          {completed ? (
            <>
              <View
                testID="p14-summary-identity"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12 * s,
                }}
              >
                {badge('user')}
                <View style={{ flex: 1, minWidth: 0 }}>
                  {label(actor, 24, '700')}
                  {label(
                    user?.role ?? 'Vai trò chưa xác minh',
                    16,
                    '400',
                    HN_UI.textMuted,
                  )}
                </View>
              </View>
              <View
                testID="p14-shift-metadata"
                style={{
                  backgroundColor: HN_UI.canvas,
                  borderColor: HN_UI.border,
                  borderWidth: 1,
                  borderRadius: 14 * s,
                  padding: 16 * s,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12 * s,
                  }}
                >
                  {badge('warehouse')}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {label('Kho làm việc', 16, '400', HN_UI.textMuted)}
                    {label(warehouse, 18)}
                  </View>
                </View>
                <View
                  style={{
                    borderTopWidth: 1,
                    borderColor: HN_UI.border,
                    marginTop: 16 * s,
                    paddingTop: 16 * s,
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 12 * s,
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      minWidth: 0,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12 * s,
                    }}
                  >
                    {badge('calendar')}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      {label('Ngày làm việc', 14, '400', HN_UI.textMuted)}
                      {label(instant(started), 16)}
                    </View>
                  </View>
                  <View
                    style={{
                      flex: 1,
                      minWidth: 0,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12 * s,
                    }}
                  >
                    {badge('clock')}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      {label('Thời gian ca', 14, '400', HN_UI.textMuted)}
                      {label(
                        instant(started, true) + ' – ' + instant(ended, true),
                        16,
                      )}
                      {startedDate !== 'Chưa xác minh' &&
                      endedDate !== 'Chưa xác minh' &&
                      startedDate !== endedDate
                        ? label(
                            'Kết thúc ' + endedDate,
                            14,
                            '400',
                            HN_UI.textMuted,
                          )
                        : null}
                    </View>
                  </View>
                </View>
              </View>
              <View testID="p14-summary-results" style={{ gap: 12 * s }}>
                {label('Kết quả công việc', 20, '700')}
                {[0, 2].map(offset => (
                  <View
                    key={offset}
                    style={{ flexDirection: 'row', gap: 12 * s }}
                  >
                    {tiles
                      .slice(offset, offset + 2)
                      .map(([title, key, operation]) => (
                        <View
                          testID={'p14-kpi-' + key}
                          key={key}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            minHeight: 72 * s,
                            borderWidth: 1,
                            borderColor: HN_UI.border,
                            borderRadius: 14 * s,
                            padding: 12 * s,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 12 * s,
                          }}
                        >
                          {badge(
                            operation,
                            HN_OPERATIONS[operation].ink,
                            HN_OPERATIONS[operation].soft,
                          )}
                          <View style={{ flex: 1, minWidth: 0 }}>
                            {label(
                              key === 'NFC'
                                ? '—'
                                : typeof docs[key] === 'number'
                                ? String(docs[key])
                                : '—',
                              24,
                              '700',
                            )}
                            {label(title, 16, '400', HN_UI.textMuted)}
                            {label(
                              key === 'NFC'
                                ? 'Chưa có nguồn tổng hợp'
                                : 'Chứng từ đã ghi nhận',
                              12,
                              '400',
                              HN_UI.textMuted,
                            )}
                          </View>
                        </View>
                      ))}
                  </View>
                ))}
                <View
                  testID="p14-request-count"
                  style={{
                    borderWidth: 1,
                    borderColor: HN_UI.border,
                    borderRadius: 14 * s,
                    padding: 12 * s,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12 * s,
                  }}
                >
                  {badge('document')}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {label(
                      typeof object(summary?.kpis).successful_request_count ===
                        'number'
                        ? String(object(summary?.kpis).successful_request_count)
                        : '—',
                      24,
                      '700',
                    )}
                    {label('Tổng lượt hoạt động', 16, '400', HN_UI.textMuted)}
                    {label(
                      'Số yêu cầu nghiệp vụ đã xác minh',
                      14,
                      '400',
                      HN_UI.textMuted,
                    )}
                  </View>
                </View>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12 * s,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  {label(
                    'Phiếu nháp' +
                      (typeof draft.total === 'number'
                        ? ' (' + String(draft.total) + ')'
                        : ''),
                    20,
                    '700',
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Xem chi tiết phiếu nháp"
                  onPress={() =>
                    setModal({
                      title: 'Nháp của phiên tại thời điểm kết thúc',
                      reader: true,
                    })
                  }
                  style={{
                    minHeight: 44 * s,
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {label('Xem chi tiết', 16, '600', HN_UI.textLink)}
                </Pressable>
              </View>
              <View
                testID="p14-summary-draft-list"
                style={{
                  borderWidth: 1,
                  borderColor: HN_UI.border,
                  borderRadius: 14 * s,
                  paddingHorizontal: 16 * s,
                  backgroundColor: HN_UI.surface,
                }}
              >
                {items.length ? (
                  previewItems.map((raw, index) => {
                    const item = object(raw),
                      operation = String(item.operation),
                      operationIcon: AppIconName =
                        operation === 'INBOUND'
                          ? 'inbound'
                          : operation === 'OUTBOUND'
                          ? 'outbound'
                          : operation === 'WARRANTY'
                          ? 'warranty'
                          : 'wrench';
                    return (
                      <View
                        key={String(item.document_id ?? index)}
                        testID={'p14-summary-draft-' + index}
                        style={{
                          minHeight: 76 * s,
                          paddingVertical: 12 * s,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12 * s,
                          ...(index
                            ? {
                                borderTopWidth: 1,
                                borderTopColor: HN_UI.border,
                              }
                            : {}),
                        }}
                      >
                        {badge(operationIcon)}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          {label(summaryDraftTitle(item), 17, '600')}
                          {label(
                            summaryOperation(item.operation) + ' · Đã lưu nháp',
                            14,
                            '400',
                            HN_UI.textMuted,
                          )}
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <View style={{ paddingVertical: 16 * s }}>
                    {label(emptyDraftMessage, 15, '400', HN_UI.textMuted)}
                  </View>
                )}
                {draftTotalKnown &&
                Number(draft.total) > previewItems.length ? (
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: HN_UI.border,
                      paddingVertical: 12 * s,
                    }}
                  >
                    {label(
                      `Đang hiển thị ${previewItems.length}/${String(
                        draft.total,
                      )} phiếu nháp.`,
                      14,
                      '400',
                      HN_UI.textMuted,
                    )}
                  </View>
                ) : null}
              </View>
              {!summary || !draftTotalKnown
                ? action('Tải lại tổng kết', () => {
                    run('summary').catch(() => undefined);
                  })
                : null}
              {Number(draft.page) < Number(draft.last_page)
                ? action('Xem thêm nháp', () => {
                    run('summary-more').catch(() => undefined);
                  })
                : null}
            </>
          ) : (
            <>
              <View
                testID="p14-close-notice"
                accessibilityLabel={status}
                style={{
                  backgroundColor: hasUnsavedOwners
                    ? HN_UI.dangerSoft
                    : pending
                    ? HN_UI.warningSoft
                    : savedClean
                    ? HN_UI.successSoft
                    : HN_UI.infoSoft,
                  borderRadius: 12 * s,
                  padding: 16 * s,
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 12 * s,
                }}
              >
                <AppIcon
                  name={savedClean ? 'check-circle' : 'info'}
                  color={noticeInk}
                  size={24 * s}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  {label(noticeTitle, 18, '600', noticeInk)}
                  {label(noticeMessage, 16, '400', noticeInk)}
                </View>
              </View>
              <View
                testID="p14-owner-status-card"
                style={{
                  borderWidth: 1,
                  borderColor: HN_UI.border,
                  borderRadius: 14 * s,
                  padding: 16 * s,
                  gap: 12 * s,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12 * s,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {label(
                      'Phiếu đang thực hiện (' +
                        (typeof draftTotal === 'number'
                          ? String(draftTotal)
                          : '—') +
                        ')',
                      20,
                      '700',
                    )}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Xem tất cả nháp và yêu cầu đang chờ"
                    onPress={() =>
                      setModal({
                        title: 'Nháp và yêu cầu đang chờ',
                        reader: true,
                      })
                    }
                    style={{
                      minHeight: 44 * s,
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {label('Xem tất cả', 16, '600', HN_UI.textLink)}
                  </Pressable>
                </View>
                {draftOverview?.items.slice(0, 4).map(item => (
                  <View
                    key={item.document_id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12 * s,
                      paddingVertical: 8 * s,
                      borderTopWidth: 1,
                      borderTopColor: HN_UI.border,
                    }}
                  >
                    {badge(
                      item.operation === 'INBOUND'
                        ? 'inbound'
                        : item.operation === 'OUTBOUND'
                        ? 'outbound'
                        : item.operation === 'WARRANTY'
                        ? 'warranty'
                        : 'wrench',
                      item.operation === 'INBOUND'
                        ? HN_OPERATIONS.inbound.ink
                        : item.operation === 'OUTBOUND'
                        ? HN_OPERATIONS.outbound.ink
                        : HN_OPERATIONS.warranty.ink,
                      item.operation === 'INBOUND'
                        ? HN_OPERATIONS.inbound.soft
                        : item.operation === 'OUTBOUND'
                        ? HN_OPERATIONS.outbound.soft
                        : HN_OPERATIONS.warranty.soft,
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      {label(
                        item.displayTitle?.trim() ||
                          item.title?.trim() ||
                          item.document_id.slice(0, 8).toUpperCase(),
                        17,
                        '600',
                      )}
                      {label(
                        p14OperationLabel(item.operation) +
                          (item.localState === 'DIRTY'
                            ? ' · Đang mở'
                            : ' · Đã lưu nháp'),
                        14,
                        '400',
                        HN_UI.textMuted,
                      )}
                    </View>
                    {onResumeOwner && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          'Tiếp tục ' +
                          (item.displayTitle?.trim() ||
                            item.title?.trim() ||
                            item.document_id.slice(0, 8))
                        }
                        disabled={busy}
                        onPress={() => {
                          service.invalidateCheck();
                          setCloseCheck(undefined);
                          onResumeOwner(
                            item.operation === 'INBOUND'
                              ? 'P04'
                              : item.operation === 'OUTBOUND'
                              ? 'P05'
                              : item.operation === 'COMPONENT_ISSUE'
                              ? 'P19'
                              : 'P09',
                            item,
                          );
                        }}
                        style={{
                          minHeight: 44 * s,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4 * s,
                        }}
                      >
                        {label('Tiếp tục', 14, '400', HN_UI.textLink)}
                        <AppIcon
                          name="chevron-right"
                          size={20 * s}
                          color={HN_UI.textLink}
                        />
                      </Pressable>
                    )}
                  </View>
                ))}
                {draftLoading
                  ? label(
                      'Đang tải phiếu nháp của phiên…',
                      15,
                      '400',
                      HN_UI.textMuted,
                    )
                  : draftError
                  ? label(draftError, 15, '400', HN_UI.danger)
                  : draftOverview?.complete !== true
                  ? label(partialDraftMessage, 15, '400', HN_UI.textMuted)
                  : !draftOverview?.items.length
                  ? label(
                      blockedOwners.length
                        ? 'Không có nháp DRAFT đã xác minh; còn owner cần đối chiếu.'
                        : 'Không có phiếu nháp trong phiên hiện tại.',
                      15,
                      '400',
                      HN_UI.textMuted,
                    )
                  : null}
                {loadDrafts && (draftError || draftOverview?.complete === false)
                  ? action(
                      'Tải lại phiếu nháp',
                      () => setDraftRetry(value => value + 1),
                      false,
                      draftLoading,
                    )
                  : null}
              </View>
            </>
          )}
        </ScrollView>
        <View
          testID="p14-action-dock"
          style={{
            paddingHorizontal: 24 * s,
            paddingBottom: 24 * s,
            paddingTop: 0,
            gap: 12 * s,
            backgroundColor: HN_UI.surface,
          }}
        >
          {completed ? (
            <>
              {action('Xem lịch sử', onHistory, false, false, false, 'history')}
              {action(
                'Đăng xuất',
                () =>
                  setModal({
                    title: 'Đăng xuất',
                    message:
                      'Ca đã kết thúc. Bạn muốn đăng xuất khỏi tài khoản hiện tại?',
                    confirm: 'LOGOUT',
                  }),
                true,
                false,
                false,
                'logout',
              )}
            </>
          ) : (
            <>
              {!pending && blockedOwners.length && onResumeOwner
                ? action(
                    blockedOwners.some(row => row.state === 'DIRTY')
                      ? 'Lưu nháp trước khi kết thúc'
                      : 'Đối chiếu dữ liệu trước khi kết thúc',
                    () => {
                      if (hasUnsavedOwners)
                        prepareSave().catch(() => undefined);
                      else {
                        service.invalidateCheck();
                        setCloseCheck(undefined);
                        run('check').catch(() => undefined);
                      }
                    },
                    false,
                    false,
                    true,
                    blockedOwners.some(row => row.state === 'DIRTY')
                      ? 'document'
                      : 'history',
                  )
                : null}
              {pending || !blockedOwners.length || !onResumeOwner
                ? action(
                    pending
                      ? 'Đối chiếu kết quả'
                      : 'Kiểm tra điều kiện kết thúc ca',
                    () => {
                      run(pending ? 'reconcile' : 'check').catch(
                        () => undefined,
                      );
                    },
                    false,
                    (!shift && !pending) || !!service.blocker,
                    true,
                  )
                : null}
              {action(
                'Kết thúc ca',
                () =>
                  setModal({
                    title: 'Kết thúc ca',
                    message:
                      'Xác nhận kết thúc ca hiện tại sau khi mọi dữ liệu đã được lưu và đối chiếu?',
                    confirm: 'END',
                  }),
                false,
                !service.canEnd,
                service.canEnd,
                'power',
              )}
            </>
          )}
        </View>
      </View>
      <View style={{ backgroundColor: HN_UI.surface }}>{footer}</View>
      <Dialog
        visible={!!modal}
        title={modal?.title ?? ''}
        message={modal?.message}
        dismissOnBackdrop={false}
        onDismiss={dismissModal}
        dismissible={!busy}
        panelMaxWidth={454 * s}
        footer={
          <View
            style={{
              gap: 12 * s,
              flexDirection: modal?.confirm === 'SAVE' ? 'row' : 'column',
            }}
          >
            {modal?.confirm ? (
              <>
                <View
                  style={{ flex: modal.confirm === 'SAVE' ? 1 : undefined }}
                >
                  {action('Hủy', () => setModal(null))}
                </View>
                <View
                  style={{ flex: modal.confirm === 'SAVE' ? 1 : undefined }}
                >
                  {action(
                    modal.confirm === 'END'
                      ? 'Kết thúc ca'
                      : modal.confirm === 'SAVE'
                      ? 'Lưu nháp'
                      : 'Đăng xuất',
                    () => {
                      if (!decisionReady) return;
                      if (modal.confirm === 'SAVE') {
                        saveOpen().catch(() => undefined);
                        return;
                      }
                      run(modal.confirm === 'END' ? 'end' : 'logout').catch(
                        () => undefined,
                      );
                    },
                    modal.confirm === 'LOGOUT',
                    !decisionReady ||
                      (modal.confirm === 'END' && !service.canEnd),
                    modal.confirm === 'SAVE',
                  )}
                </View>
              </>
            ) : (
              action(
                modal?.saved ? 'Đã hiểu' : 'Đóng',
                () => setModal(null),
                false,
                false,
                modal?.saved === true,
              )
            )}
          </View>
        }
      >
        {modal?.reader ? (
          <View style={{ gap: 16 * s }}>
            {completed ? (
              items.length ? (
                items.map((raw, index) => {
                  const item = object(raw);
                  return (
                    <View
                      key={String(item.document_id ?? index)}
                      style={{
                        borderWidth: 1,
                        borderColor: HN_UI.border,
                        padding: 12 * s,
                        borderRadius: 12 * s,
                        gap: 4 * s,
                      }}
                    >
                      {label(summaryDraftTitle(item), 18, '600')}
                      {label(summaryOperation(item.operation), 16)}
                      {label(
                        'Đã lưu nháp · Chỉ đọc',
                        16,
                        '400',
                        HN_UI.textMuted,
                      )}
                    </View>
                  );
                })
              ) : (
                label(emptyDraftMessage, 18)
              )
            ) : (
              <>
                {shift ? (
                  <View
                    testID="p14-current-shift-card"
                    style={{
                      borderWidth: 1,
                      borderColor: HN_UI.border,
                      borderRadius: 14 * s,
                      padding: 16 * s,
                      gap: 8 * s,
                      backgroundColor: HN_UI.canvas,
                    }}
                  >
                    {label(
                      'Ca hiện tại · ' +
                        (shift.status === 'ACTIVE'
                          ? 'Đang hoạt động'
                          : shift.status),
                      18,
                      '700',
                    )}
                    {label(
                      'Bắt đầu ' +
                        instant(shift.started_at, true) +
                        ' · Mã ' +
                        shift.shift_id.slice(0, 8),
                      15,
                      '400',
                      HN_UI.textMuted,
                    )}
                  </View>
                ) : null}
                {label(status, 16)}
                {action(
                  pending
                    ? 'Đối chiếu kết quả'
                    : 'Kiểm tra điều kiện kết thúc ca',
                  () => {
                    run(pending ? 'reconcile' : 'check').catch(() => undefined);
                  },
                  false,
                  (!shift && !pending) || !!service.blocker,
                  true,
                )}
                {label('Phiếu nháp của phiên hiện tại:', 18)}
                {draftOverview?.items.length
                  ? draftOverview.items.map(item => (
                      <View
                        key={item.document_id}
                        style={{
                          borderWidth: 1,
                          borderColor: HN_UI.border,
                          padding: 12 * s,
                          borderRadius: 12 * s,
                          gap: 4 * s,
                        }}
                      >
                        {label(
                          item.displayTitle?.trim() ||
                            item.title?.trim() ||
                            item.document_id.slice(0, 8).toUpperCase(),
                          17,
                          '600',
                        )}
                        {label(
                          p14OperationLabel(item.operation) + ' · Đã lưu nháp',
                          15,
                          '400',
                          HN_UI.textMuted,
                        )}
                      </View>
                    ))
                  : label(
                      draftLoading
                        ? 'Đang tải…'
                        : draftError ||
                            (draftOverview?.complete === true
                              ? 'Không có phiếu DRAFT đã xác minh.'
                              : partialDraftMessage),
                      15,
                    )}
                {!!draftOverview?.items.length && !draftOverview.complete
                  ? label(partialDraftMessage, 15, '400', HN_UI.textMuted)
                  : null}
                {draftOverview &&
                draftOverview.total > draftOverview.items.length
                  ? label(
                      `Còn ${
                        draftOverview.total - draftOverview.items.length
                      } phiếu ở các trang tiếp theo.`,
                      14,
                      '400',
                      HN_UI.textMuted,
                    )
                  : null}
                {label('Trạng thái owner trên thiết bị:', 18)}
                {ownerRows.map(row => (
                  <View key={row.owner} style={{ gap: 4 * s }}>
                    {label(
                      ownerName(row.owner) +
                        ' · ' +
                        (!row.coverageComplete
                          ? 'Chưa đủ thông tin'
                          : row.state === 'CLEAN'
                          ? 'Đã kiểm tra trên thiết bị'
                          : row.state === 'DIRTY'
                          ? 'Cần lưu'
                          : 'Cần đối chiếu'),
                      16,
                    )}
                    {row.state !== 'CLEAN' && onResumeOwner ? (
                      <Button
                        label="Mở nghiệp vụ để xử lý"
                        variant="secondary"
                        onPress={() => {
                          setModal(null);
                          onResumeOwner(row.owner);
                        }}
                      />
                    ) : null}
                  </View>
                ))}
              </>
            )}
          </View>
        ) : null}
      </Dialog>
    </SafeAreaView>
  );
}
