import { HN_UI } from '../../theme/uiKitV3';
import { ScannerNativeText as Text } from '../../ui/ScannerNativeText';
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useHardwareBack } from '../../app/useHardwareBack';
import { Dialog } from '../../ui/Dialog';
import { BottomNav, BOTTOM_NAV_ITEMS } from '../../ui/BottomNav';
import { P03Dialog } from '../scan/P03Dialog';
import { P17ScanExceptions } from '../scan/P17ScanExceptions';
import { Input } from '../../ui/Input';
import { Sheet } from '../../ui/Sheet';
import type { ScanSource } from '../../scanner/scanPayload';
import type { P04Item, P04Row } from '../../services/wms/p04Inbound';
import {
  BusinessScanScreen,
  type ScanFeedback,
} from '../scan/BusinessScanScreen';
import { InboundCreateScreen } from './InboundCreateScreen';
import { InboundReviewScreen } from './InboundReviewScreen';
import { InboundResultScreen } from './InboundResultScreen';
import { P04Frame, P04Action, P04Info } from './P04Frame';
import {
  createP04Flow,
  type P04Flow,
  type P04FlowState,
  type P04RunBinding,
} from './p04Flow';
import type { P04Service } from '../../services/wms/p04Inbound';
import type { KeyValueStorage } from '../../storage/storage';
import { getActiveSession, type Session } from '../../auth/session';
import type { fetchP04Suppliers } from './p04Directory';
import { P04_INBOUND_CHOICES } from './p04Choices';
import { p04ScanMessage } from './p04ScanMessage';
import { BUILD_PROFILE } from '../../config/buildProfile';
interface Props {
  onExit: () => void;
  onViewDocument?: (id: string) => void;
  onHistory?: (id: string) => void;
  returnDocumentId?: string;
  resumeDraftId?: string;
  initialSeed?: {
    supplierId: string | null;
    supplierName?: string;
    note: string;
    docDate?: string;
  };
  /** Review-only dependency injection. The release path keeps the real service/storage. */
  service?: P04Service;
  storage?: KeyValueStorage;
  getSession?: () => Session | undefined;
  supplierLoader?: typeof fetchP04Suppliers;
  onSelectTab?: (key: string) => void;
  /** Actual caller tab; omitted callers keep the previous footer behavior. */
  footerActiveKey?: string;
  onConfirmSession?: () => void;
  /** Reuse the shell's locked navigation instance, when provided. */
  footerNavigation?: React.ReactNode;
}
type InvalidScan = {
  binding: P04RunBinding;
  eventId: string;
  raw: string;
  reason: string;
};
const exceptionScope = (binding: P04RunBinding, observation: string) =>
  JSON.stringify([
    binding.scope.actorId,
    binding.scope.authSessionId,
    binding.scope.warehouseId,
    binding.id,
    binding.identity.documentId,
    binding.identity.scanSessionId,
    observation,
  ]);
const bindRun = ({ id, scope, identity }: P04RunBinding): P04RunBinding => ({
  id,
  scope: { ...scope },
  identity: { ...identity },
});
type PendingScan = {
  raw: string;
  source: P04Item['scan_source'];
  row: P04Row;
  eventId: string;
  options: Partial<P04Item>;
};
export function P04NativeFlow({
  onExit,
  onViewDocument,
  onHistory,
  returnDocumentId,
  resumeDraftId,
  initialSeed,
  service,
  storage,
  getSession,
  supplierLoader,
  onSelectTab,
  footerActiveKey,
  onConfirmSession,
  footerNavigation,
}: Props): React.ReactElement {
  const [state, setState] = useState<P04FlowState>({
    phase: 'loading',
    types: [],
    busy: false,
    resume: false,
  });
  const owner = useRef<P04Flow | null>(null);
  if (!owner.current)
    owner.current = createP04Flow({
      onChange: setState,
      autoNameFromDocumentCode: BUILD_PROFILE === 'dev-test',
      ...(service ? { service } : {}),
      ...(storage ? { storage } : {}),
      ...(getSession ? { getSession } : {}),
    });
  const flow = owner.current;
  const [exitOpen, setExitOpen] = useState(false),
    [cancelOpen, setCancelOpen] = useState(false),
    [pending, setPending] = useState<PendingScan>(),
    [quantity, setQuantity] = useState(''),
    [pendingError, setPendingError] = useState<string>();
  const [dependency, setDependency] = useState<string>();
  const [invalidScan, setInvalidScan] = useState<InvalidScan>();
  const exitTarget = useRef<{ key: string; owner: P04RunBinding } | undefined>(
    undefined,
  );
  const footerState = useRef({
    cancelOpen: false,
    p03Visible: false,
    invalidEventId: undefined as string | undefined,
  });
  // Keep the last sheet content during its closing animation. Otherwise clearing
  // pending switches a BOX sheet to the new-SKU title/buttons while it exits.
  const lastPending = useRef<PendingScan | undefined>(undefined);
  if (pending) lastPending.current = pending;
  const displayedPending = pending ?? lastPending.current;
  const actionInFlight = useRef(false);
  const [actionBusy, setActionBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    flow
      .begin(returnDocumentId, initialSeed, resumeDraftId)
      .catch(() => undefined);
    return () => {
      mounted.current = false;
      flow.dispose();
    };
  }, [flow, returnDocumentId, initialSeed, resumeDraftId]);
  const run = state.run,
    request = run?.pending;
  // Bind the display label to the UUID in the saved request, never to another
  // supplier selection or a current directory result after RECORD.
  const savedSupplierId = run?.savedBody
    ? run.savedBody.supplier_id
    : run?.server?.metadata.supplier_id;
  const resultSupplierName =
    savedSupplierId === null
      ? null
      : savedSupplierId && savedSupplierId === run?.ui.supplierId
      ? run.ui.supplierName
      : undefined;
  const checkUnknown = run?.ownerChecks?.some(c =>
    ['UNKNOWN', 'IN_FLIGHT'].includes(c.outcome),
  );
  const mutationException =
    !checkUnknown &&
    !!request &&
    ['UNKNOWN', 'CONFLICT'].includes(request.outcome);
  const invalidException =
    !!invalidScan && !request && !checkUnknown && run?.ui.step === 1;
  const standaloneException = mutationException || invalidException;
  // view() persists without emitting a business state change. Read its latest
  // value when remounting the scanner after a standalone exception.
  const retainedView = flow.snapshot().run?.view;
  const currentNavigationOwner = () => {
    if (!mounted.current) return false;
    if (run) return flow.isCurrent(run);
    const session = (getSession ?? getActiveSession)();
    const context = state.context;
    return !!(
      session &&
      context &&
      session.userId === context.actor_id &&
      session.authSessionId === context.auth_session_id &&
      session.activeWarehouseId === context.active_warehouse_id
    );
  };
  const navigationReady = () =>
    currentNavigationOwner() &&
    !flow.snapshot().busy &&
    !actionInFlight.current &&
    !footerState.current.cancelOpen;
  const finishExit = () => {
    if (!currentNavigationOwner()) return;
    const target = exitTarget.current;
    exitTarget.current = undefined;
    if (target && onSelectTab && flow.isCurrent(target.owner))
      onSelectTab(target.key);
    else onExit();
  };
  const homeKeepingRun = () => {
    if (!onSelectTab || !navigationReady()) return;
    exitTarget.current = undefined;
    onSelectTab('home');
  };
  const selectFooterTab = (key: string) => {
    if (
      !onSelectTab ||
      !navigationReady() ||
      !BOTTOM_NAV_ITEMS.some(tab => tab.key === key)
    )
      return;
    const current = flow.snapshot().run;
    // A stale footer cannot bypass a newly pending command or resolver check.
    if (
      current?.pending ||
      current?.ownerChecks?.some(c =>
        ['UNKNOWN', 'IN_FLIGHT'].includes(c.outcome),
      )
    )
      return;
    if (stopped) {
      onSelectTab(key);
      return;
    }
    if (current?.result) {
      if (flow.finish()) onSelectTab(key);
      return;
    }
    if (
      current &&
      (current.ui.name ||
        current.ui.note ||
        current.items.length ||
        current.server)
    ) {
      exitTarget.current = { key, owner: bindRun(current) };
      footerState.current.invalidEventId = undefined;
      setInvalidScan(undefined);
      setExitOpen(true);
      return;
    }
    onSelectTab(key);
  };
  const requestExit = () => {
    if (state.busy || actionInFlight.current) return;
    exitTarget.current = undefined;
    if (run?.result) {
      if (flow.finish()) onExit();
      return;
    }
    if (request) {
      onExit();
      return;
    }
    if (run && (run.ui.name || run.ui.note || run.items.length || run.server))
      setExitOpen(true);
    else onExit();
  };
  useHardwareBack(() => {
    // The standalone presenter closes its reader before returning to this owner.
    if (standaloneException) return false;
    if (state.busy || actionInFlight.current || request || pending) return true;
    if (cancelOpen) {
      setCancelOpen(false);
      return true;
    }
    if (exitOpen) {
      setExitOpen(false);
      return true;
    }
    if (state.resume) {
      flow.resume();
      return true;
    }
    if (run?.ui.step && !run.result) flow.back();
    else requestExit();
    return true;
  });
  async function saveExit() {
    if (actionInFlight.current || state.busy || request) return;
    actionInFlight.current = true;
    setActionBusy(true);
    try {
      if ((await flow.saveAndLeave()) && mounted.current) {
        setExitOpen(false);
        finishExit();
      }
    } finally {
      actionInFlight.current = false;
      if (mounted.current) setActionBusy(false);
    }
  }
  async function cancel() {
    if (actionInFlight.current || state.busy || request) return;
    actionInFlight.current = true;
    setActionBusy(true);
    try {
      if (
        (await flow.cancel('Người dùng xác nhận bỏ phiếu nhập')) &&
        mounted.current
      ) {
        setCancelOpen(false);
        setExitOpen(false);
        finishExit();
      }
    } finally {
      actionInFlight.current = false;
      if (mounted.current) setActionBusy(false);
    }
  }
  async function scan(raw: string, source: ScanSource): Promise<ScanFeedback> {
    const original = flow.snapshot().run;
    const inputSource = source as P04Item['scan_source'];
    const result = await flow.scan(raw, inputSource);
    if (!mounted.current || !original || !flow.isCurrent(original))
      return {
        accepted: false,
        message: 'Phiên hoặc kho đã thay đổi. Dữ liệu được giữ.',
      };
    if (result.requiresInput) {
      setQuantity('');
      setPendingError(undefined);
      setPending({
        raw,
        source: inputSource,
        row: result.row,
        eventId: result.eventId,
        options: {},
      });
      return { accepted: false, requiresInput: true };
    }
    if (flow.snapshot().run?.pending)
      return {
        accepted: false,
        message:
          'Mã được giữ trong phiếu nhưng chưa xác nhận lưu. Cần đối chiếu kết quả trước khi tiếp tục.',
      };
    // Only an authoritative classified rejection opens S01. DUPLICATE and
    // resolver/network UNKNOWN retain their existing distinct owner paths.
    if (result.row.outcome === 'REJECTED')
      setInvalidScan({
        binding: bindRun(original),
        eventId: result.eventId,
        raw,
        reason: p04ScanMessage(result.row, raw),
      });
    return {
      accepted: result.row.outcome === 'ACCEPTED',
      message:
        result.row.outcome === 'ACCEPTED'
          ? 'Đã thêm mã hợp lệ. Tồn kho chưa thay đổi.'
          : p04ScanMessage(result.row, raw),
    };
  }
  async function completeScan(options: Partial<P04Item>) {
    if (!pending) return;
    const original = flow.snapshot().run;
    try {
      const selected = { ...pending.options, ...options };
      const result = await flow.scan(
        pending.raw,
        pending.source,
        selected,
        pending.eventId,
      );
      if (!mounted.current || !original || !flow.isCurrent(original)) return;
      if (result.requiresInput) {
        setPending({ ...pending, row: result.row, options: selected });
        return;
      }
      if (result.row.outcome !== 'ACCEPTED') {
        if (result.row.outcome === 'REJECTED') {
          setInvalidScan({
            binding: bindRun(original),
            eventId: result.eventId,
            raw: pending.raw,
            reason: p04ScanMessage(result.row, pending.raw),
          });
          setPending(undefined);
          setPendingError(undefined);
          return;
        }
        setPendingError(p04ScanMessage(result.row, pending.raw));
        return;
      }
      setPending(undefined);
      setPendingError(undefined);
    } catch (e) {
      setPendingError(e instanceof Error ? e.message : 'Chưa xác nhận mã.');
    }
  }
  async function viewDocument() {
    if (!run?.result) return;
    const documentId = run.result.data.document_id;
    try {
      await flow.document();
      if (
        !mounted.current ||
        flow.snapshot().run?.result?.data.document_id !== documentId
      )
        return;
      if (onViewDocument) onViewDocument(documentId);
      else
        setDependency(
          `Chưa nối màn chứng từ cho ID ${run.result.data.document_id}. Phiếu được giữ.`,
        );
    } catch (e) {
      if (
        !mounted.current ||
        flow.snapshot().run?.result?.data.document_id !== documentId
      )
        return;
      setDependency(e instanceof Error ? e.message : 'Chưa đọc được chứng từ.');
    }
  }
  const unknown =
    checkUnknown ||
    (!!request &&
      ['UNKNOWN', 'CONFLICT', 'IN_FLIGHT'].includes(request.outcome));
  const rejected = request?.outcome === 'FAILED';
  const admissionBlocked =
    !!state.messageCode &&
    [
      'P04_SHIFT_ADMISSION_REQUIRED',
      'P04_SHIFT_OWNER_CHANGED',
      'P04_ORIGINAL_SHIFT_CHANGED',
      'SHIFT_TRACKING_DOWNGRADE',
    ].includes(state.messageCode);
  const stopped =
    state.context?.warehouse_status === 'INACTIVE' ||
    state.context?.warehouse_context.error_code === 'WAREHOUSE_INACTIVE';
  const p03Busy = state.busy || actionBusy;
  const closeUnfinished = () => {
    if (p03Busy) return;
    exitTarget.current = undefined;
    setExitOpen(false);
    if (state.resume) flow.resume();
  };
  const p03Visible =
    (stopped && !unknown) ||
    ((state.resume || exitOpen || cancelOpen) && !unknown && !rejected);
  footerState.current = {
    cancelOpen: cancelOpen && !!p03Visible && !stopped,
    p03Visible: !!p03Visible,
    invalidEventId: invalidScan?.eventId,
  };
  const dialogues = (
    <>
      <P03Dialog
        visible={!!p03Visible}
        activeKey={footerActiveKey}
        panel={stopped ? 'S03' : cancelOpen ? 'S04' : 'S02'}
        busy={p03Busy}
        serverLinked={!!run?.server}
        message={stopped ? undefined : state.message}
        onBack={cancelOpen ? () => setCancelOpen(false) : closeUnfinished}
        onSelectTab={key => {
          if (!footerState.current.p03Visible) return;
          selectFooterTab(key);
        }}
        actions={
          stopped
            ? [
                {
                  label: 'Về Trang chủ',
                  kind: 'primary',
                  disabled: !onSelectTab,
                  onPress: homeKeepingRun,
                },
              ]
            : cancelOpen
            ? [
                { label: 'Quay lại', onPress: () => setCancelOpen(false) },
                {
                  label: 'Bỏ phiếu',
                  kind: 'danger',
                  disabled: !!request || !!run?.result,
                  onPress: () => {
                    cancel().catch(() => undefined);
                  },
                },
              ]
            : [
                {
                  label: 'Tiếp tục phiếu',
                  kind: 'primary',
                  onPress: closeUnfinished,
                },
                {
                  label: 'Lưu nháp và thoát',
                  onPress: () => {
                    saveExit().catch(() => undefined);
                  },
                },
                {
                  label: 'Bỏ phiếu',
                  kind: 'danger-outline',
                  onPress: () => setCancelOpen(true),
                },
                { label: 'Hủy', kind: 'text', onPress: closeUnfinished },
              ]
        }
      />
      <Dialog
        visible={unknown && !mutationException && !state.busy}
        dismissible={false}
        title="Cần kiểm tra kết quả thao tác"
        message={
          state.message ??
          'Giữ nguyên nháp, phiên quét, mã yêu cầu và dữ liệu. Chưa xác định Web đã ghi nhận hay chưa.'
        }
        onDismiss={() => undefined}
      >
        <View style={{ gap: 8 }}>
          <P04Action
            label={
              checkUnknown ? 'Đối chiếu lượt kiểm tra gốc' : 'Kiểm tra kết quả'
            }
            onPress={() => {
              (checkUnknown ? flow.reconcileOwnerCheck() : flow.check()).catch(
                () => undefined,
              );
            }}
          />
          {request?.retryAllowed && (
            <P04Action
              label="Thử lại cùng yêu cầu"
              onPress={() => {
                flow.retry().catch(() => undefined);
              }}
              secondary
            />
          )}
          <P04Action
            label="Về Trang chủ — giữ phiếu"
            onPress={homeKeepingRun}
            disabled={!onSelectTab}
            secondary
          />
        </View>
      </Dialog>
      <Dialog
        visible={
          (!!state.message || rejected) &&
          !unknown &&
          !state.busy &&
          !state.resume &&
          !exitOpen &&
          !cancelOpen &&
          !stopped &&
          !pending
        }
        title="Thông tin phiếu nhập"
        message={
          state.message ??
          'Yêu cầu lần trước đã bị từ chối. Kiểm tra trạng thái phiếu trước khi tiếp tục.'
        }
        dismissible={!rejected}
        onDismiss={() => flow.dismiss()}
      >
        <View style={{ gap: 8 }}>
          {request?.outcome === 'FAILED' && (
            <>
              <P04Action
                label="Kiểm tra để sửa phiếu"
                onPress={() => {
                  flow.recoverRejected().catch(() => undefined);
                }}
              />
              <P04Action
                label="Nhập lượt mới sau khi đối chiếu"
                onPress={() => {
                  flow.recoverRejected(true).catch(() => undefined);
                }}
                secondary
              />
            </>
          )}
          {rejected ? (
            <P04Action
              label="Về Trang chủ — giữ phiếu"
              onPress={homeKeepingRun}
              disabled={!onSelectTab}
              secondary
            />
          ) : (
            <>
              {admissionBlocked && onConfirmSession ? (
                <P04Action
                  label="Xác nhận phiên làm việc"
                  onPress={onConfirmSession}
                />
              ) : null}
              <P04Action
                label="Đóng"
                onPress={() => flow.dismiss()}
                secondary
              />
            </>
          )}
        </View>
      </Dialog>
      {!unknown && !rejected && !stopped && (
        <Sheet
          visible={!!pending}
          title={
            displayedPending?.row.resolved?.requires_quantity &&
            displayedPending.options.quantity === undefined
              ? 'Số lượng trong hộp'
              : 'Đây là sản phẩm hay linh kiện?'
          }
          onDismiss={() => setPending(undefined)}
        >
          {displayedPending?.row.resolved?.requires_quantity &&
          displayedPending.options.quantity === undefined ? (
            <>
              <Input
                label="Số lượng thực tế"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="number-pad"
                errorText={pendingError}
              />
              <P04Action
                label="Xác nhận số lượng"
                onPress={() => {
                  const n = Number(quantity);
                  if (
                    !/^\d+$/.test(quantity) ||
                    !Number.isSafeInteger(n) ||
                    n < 1 ||
                    n > 100000
                  ) {
                    setPendingError(
                      'Số lượng phải là số nguyên từ 1 đến 100000.',
                    );
                    return;
                  }
                  completeScan({ quantity: n }).catch(() => undefined);
                }}
                loading={state.busy}
              />
            </>
          ) : (
            <>
              <P04Action
                label="Sản phẩm"
                onPress={() => {
                  completeScan({ new_sku_type: 'PRODUCT' }).catch(
                    () => undefined,
                  );
                }}
                loading={state.busy}
              />
              <P04Action
                label="Linh kiện"
                onPress={() => {
                  completeScan({ new_sku_type: 'COMPONENT' }).catch(
                    () => undefined,
                  );
                }}
                secondary
                disabled={state.busy}
              />
              {pendingError && (
                <Text style={{ color: HN_UI.danger }}>{pendingError}</Text>
              )}
            </>
          )}
          <P04Action
            label="Hủy"
            onPress={() => setPending(undefined)}
            secondary
            disabled={state.busy}
          />
        </Sheet>
      )}
      <Dialog
        visible={!!dependency}
        title="Chưa thể mở chứng từ"
        message={dependency}
        onDismiss={() => setDependency(undefined)}
      >
        <P04Action label="Đóng" onPress={() => setDependency(undefined)} />
      </Dialog>
    </>
  );
  if (mutationException && run && request) {
    const original = { ...request };
    const isCurrent = () => {
      const current = flow.snapshot().run?.pending;
      return (
        mounted.current &&
        flow.isCurrent(run) &&
        current?.key === original.key &&
        current.command === original.command &&
        current.version === original.version &&
        current.requestId === original.requestId &&
        current.shiftId === original.shiftId &&
        ['UNKNOWN', 'CONFLICT'].includes(current.outcome)
      );
    };
    return (
      <P17ScanExceptions
        scopeKey={exceptionScope(run, original.key)}
        isCurrent={isCurrent}
        view={{
          panel: 'P17.S04',
          owner: 'P04',
          phase: state.busy
            ? 'checking'
            : state.context?.permissions.read === true && !stopped
            ? 'unknown'
            : 'unavailable',
          identity: {
            operationKey: original.key,
            draftId: run.identity.documentId,
            scanSessionId: run.identity.scanSessionId,
            version: original.version,
            command: original.command,
          },
          context: {
            documentNo: run.server?.document_no,
            acceptedCodeCount: run.ui.codes.length,
          },
          canCheck:
            state.context?.permissions.read === true &&
            state.context.warehouse_context.status === 'READY' &&
            state.context.warehouse_status === 'ACTIVE' &&
            state.context.inbound_supported,
        }}
        busy={state.busy}
        onBack={() => {
          if (isCurrent() && !state.busy) onExit();
        }}
        onCheck={async () => {
          if (!isCurrent() || flow.snapshot().busy) return;
          const checked = await flow.check();
          if (!checked || !mounted.current || !flow.isCurrent(run)) return;
          const current = flow.snapshot().run;
          if (
            original.command === 'CANCEL' &&
            current?.closed &&
            !current.pending
          ) {
            setCancelOpen(false);
            setExitOpen(false);
            finishExit();
          }
        }}
      />
    );
  }
  if (invalidException && invalidScan && run) {
    const isCurrent = () => {
      const current = flow.snapshot();
      return (
        mounted.current &&
        flow.isCurrent(invalidScan.binding) &&
        current.run?.ui.step === 1 &&
        !current.run.pending &&
        !current.run.result &&
        !current.resume &&
        !current.run.ownerChecks?.some(c =>
          ['UNKNOWN', 'IN_FLIGHT'].includes(c.outcome),
        )
      );
    };
    const close = (raw?: string | null) => {
      if (!isCurrent() || flow.snapshot().busy) return;
      const view = flow.snapshot().run?.view;
      const value = raw ?? '';
      const selection =
        raw === undefined || view?.rawInput === value
          ? view?.manualSelection
          : { start: value.length, end: value.length };
      flow.view({
        ...(raw !== undefined ? { manual: true, rawInput: value } : {}),
        exceptionReturn: {
          token: `${invalidScan.eventId}:${
            raw === undefined ? 'previous' : 'manual'
          }`,
          mode: raw === undefined ? 'previous' : 'manual',
          focus: raw !== undefined || view?.manualFocused === true,
          ...(selection ? { selection } : {}),
        },
      });
      setInvalidScan(undefined);
    };
    return (
      <P17ScanExceptions
        scopeKey={exceptionScope(invalidScan.binding, invalidScan.eventId)}
        isCurrent={isCurrent}
        view={{
          panel: 'P17.S01',
          raw: invalidScan.raw,
          reason: invalidScan.reason,
          context: {
            documentNo: run.server?.document_no,
            acceptedCodeCount: run.ui.codes.length,
          },
        }}
        busy={state.busy}
        onBack={() => close()}
        onScanAgain={() => close()}
        onManual={raw => close(raw)}
        footerNavigation={
          footerActiveKey === undefined ? (
            footerNavigation
          ) : (
            <BottomNav
              activeKey={footerActiveKey}
              disabled={p03Busy || cancelOpen || !onSelectTab}
              onSelect={key => {
                if (
                  footerState.current.invalidEventId !== invalidScan.eventId ||
                  !isCurrent()
                )
                  return;
                selectFooterTab(key);
              }}
            />
          )
        }
      />
    );
  }
  if (state.phase !== 'ready' || !run)
    return (
      <>
        <P04Frame
          step={1}
          onBack={onExit}
          footer={
            <>
              {admissionBlocked && onConfirmSession ? (
                <P04Action
                  label="Xác nhận phiên làm việc"
                  onPress={onConfirmSession}
                />
              ) : null}
              <P04Action
                label={
                  state.busy ? 'Đang xác minh…' : 'Tải lại thông tin phiếu'
                }
                onPress={() => {
                  flow
                    .begin(returnDocumentId, initialSeed, resumeDraftId)
                    .catch(() => undefined);
                }}
                loading={state.busy}
              />
            </>
          }
        >
          <P04Info
            title={
              state.phase === 'error'
                ? 'Chưa xác minh được dữ liệu nhập kho'
                : 'Đang tải thông tin phiếu nhập'
            }
          >
            {state.message ?? 'Đang xác minh kho, phiên và quyền từ Web.'}
          </P04Info>
        </P04Frame>
        {dialogues}
      </>
    );
  if (run.result)
    return (
      <>
        <InboundResultScreen
          documentName={run.ui.name}
          documentRef={run.result.data.doc_no}
          quantity={run.items.reduce((n, i) => n + i.quantity, 0)}
          outcome="posted"
          warehouseName={run.ui.warehouseName}
          supplierName={resultSupplierName}
          createdAt={run.server?.created_at}
          codeCount={run.items.length}
          sentAt={run.result.sentAt}
          viewState={run.view}
          onViewChange={patch => flow.view(patch)}
          postedOnWeb={run.result.postedOnWeb}
          onHome={() => {
            if (flow.finish()) {
              if (onSelectTab) onSelectTab('home');
              else onExit();
            }
          }}
          onNext={() => flow.newRun()}
          onDocument={() => {
            viewDocument().catch(() => undefined);
          }}
          onHistory={() => {
            if (onHistory) onHistory(run.result!.data.document_id);
            else setDependency('Chưa nối màn Lịch sử cho phiếu hiện tại.');
          }}
        />
        {dialogues}
      </>
    );
  return (
    <>
      {run.ui.step === 0 ? (
        <InboundCreateScreen
          supplierLoader={supplierLoader}
          draft={run.ui}
          hideNameField={run.nameMode === 'BE_DOCUMENT_NO'}
          documentRef={run.server?.document_no ?? undefined}
          onRequestDocumentNumber={
            run.nameMode === 'BE_DOCUMENT_NO' &&
            !run.server?.document_no &&
            !request &&
            !state.resume &&
            state.context?.document_number_assignment === 'WITH_DRAFT_SAVE'
              ? () => {
                  flow.requestDocumentNumber().catch(() => undefined);
                }
              : undefined
          }
          onChange={ui => {
            try {
              flow.metadata(ui);
            } catch {
              flow.dismiss();
            }
          }}
          onContinue={() => {
            flow.next().catch(() => undefined);
          }}
          onBack={requestExit}
          busy={state.busy}
          locked={!!request}
          viewState={run.view}
          onViewChange={patch => flow.view(patch)}
          typeLabel={
            state.types.find(t => t.id === 'receipt' && t.allowed)?.label
          }
        />
      ) : run.ui.step === 1 ? (
        <BusinessScanScreen
          title="Nhập kho"
          documentName={run.ui.name}
          stepLabel="Bước 2/3"
          sessionLabel="Phiên quét nhập kho"
          layout="board"
          scannedCount={run.ui.codes.length}
          p04Context={{
            typeLabel: P04_INBOUND_CHOICES.find(
              choice => choice.id === run.ui.inboundCategory,
            )?.label,
            documentRef: run.server?.document_no ?? undefined,
            warehouseName: run.ui.warehouseName,
            supplierName: run.ui.supplierName,
            codes: run.ui.codes,
            attempts: run.ui.scanAttempts ?? [],
            processing: state.busy,
            ownerNotice: !!state.message,
            viewState: retainedView,
            onViewChange: patch => flow.view(patch),
          }}
          scanPaused={
            !!pending ||
            (!!request && request.outcome !== 'IN_FLIGHT') ||
            state.resume
          }
          onScan={scan}
          onBack={() => flow.back()}
          onDone={() => {
            flow.next().catch(() => undefined);
          }}
        />
      ) : (
        <InboundReviewScreen
          draft={{
            ...run.ui,
            createdAt: run.server?.created_at,
            codes: state.review
              ? run.ui.codes.filter(code =>
                  state.review!.items.some(
                    row =>
                      row.raw_code === code.raw && row.outcome === 'ACCEPTED',
                  ),
                )
              : run.ui.codes,
          }}
          revalidationErrors={state.review?.items
            .filter(row => row.outcome !== 'ACCEPTED')
            .map(row => ({
              raw: row.raw_code,
              message: p04ScanMessage(row, row.raw_code),
            }))}
          documentRef={run.server?.document_no ?? 'Đang xác nhận số phiếu…'}
          viewState={run.view}
          onViewChange={patch => flow.view(patch)}
          recording={state.busy}
          locked={!!request}
          canSend={
            state.review?.can_record === true &&
            state.context?.permissions.record === true
          }
          onRecord={() => {
            flow.record().catch(() => undefined);
          }}
          onBackToScan={() => flow.back()}
        />
      )}
      {dialogues}
    </>
  );
}
