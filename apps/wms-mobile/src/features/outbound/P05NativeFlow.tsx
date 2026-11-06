import { HN_UI } from '../../theme/uiKitV3';
import { ScannerNativeText as Text } from '../../ui/ScannerNativeText';
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useHardwareBack } from '../../app/useHardwareBack';
import { Sheet } from '../../ui/Sheet';
import { Dialog } from '../../ui/Dialog';
import { P03Dialog } from '../scan/P03Dialog';
import { BottomNav } from '../../ui/BottomNav';
import { Input } from '../../ui/Input';
import { P04Frame, P04Action, P04Info, p04 } from '../inbound/P04Frame';
import { P04Icon } from '../inbound/P04Icon';
import {
  BusinessScanScreen,
  type ScanFeedback,
} from '../scan/BusinessScanScreen';
import { P05Information } from './P05Information';
import { P05ResultContent, useP05ResultActions } from './P05ResultContent';
import { P05ReviewContent } from './P05ReviewContent';
import { canP05ReviewHandoff } from './p05ReviewPolicy';
import { P05Exceptions, p05ExceptionView } from './P05Exceptions';
import { createP05NativeOwner } from './p05NativeOwner';
import { p05ChecksPending } from './linked/p05-owner-checks';
import type { Snapshot, Flow } from './linked/types';
import { getAppStorage } from '../../storage/storage';
import { p03Scope } from '../../services/wms/p03Drafts';
import { createP05Service } from '../../services/wms/p05Outbound';
import { createP05Journal } from './linked/p05-journal';
import { P05CreateNativeFlow } from './P05CreateNativeFlow';
import type { P04ViewState } from '../inbound/p04View';
const styles = StyleSheet.create({
  actions: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  quantity: { fontSize: 30, color: HN_UI.textPrimary, fontWeight: '700' },
  summary: {
    padding: 12,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 12,
    backgroundColor: HN_UI.surface,
  },
  source: { gap: 8, paddingVertical: 8 },
  empty: { padding: 20, textAlign: 'center', color: HN_UI.textSecondary },
  draftStatus: {
    fontSize: 12,
    lineHeight: 18,
    color: HN_UI.textMuted,
    textAlign: 'center',
  },
});
interface Props {
  onExit: () => void;
  onViewDocument?: (id: string) => void;
  onHistory?: (id: string) => void;
  returnDocumentId?: string;
  resumeDraftId?: string;
  owner?: Flow;
  onSelectTab?: (key: string) => void;
  footerActiveKey?: string;
  onAssignNfc?: (rawCode: string, productLabel: string) => void;
}
const fingerprint = (s: Snapshot) =>
  JSON.stringify([
    s.document,
    s.accepted,
    s.attempts,
    s.request,
    s.recorded,
    s.unknown,
    s.busy,
  ]);
// User09/10/2026: new entries use the full create form. Existing linked work
// must keep its source, request and P03 versions until it is resolved.
export function P05NativeFlow(props: Props) {
  const [resumeAvailable] = useState(() => {
    if (!props.resumeDraftId || props.owner) return true;
    try {
      const store = getAppStorage(),
        scope = p03Scope();
      return ['hn-p05-create-v1:', 'hn-p05-linked-v1:'].some(prefix => {
        const state = createP05Journal(
          {
            getItem: k => store.getString(k) ?? null,
            setItem: (k, v) => store.setString(k, v),
            removeItem: k => store.remove(k),
          },
          scope,
          createP05Service().baseUrl,
          prefix,
        ).read() as any;
        return (
          (state?.draftId ?? state?.document?.documentId) ===
          props.resumeDraftId
        );
      });
    } catch {
      return false;
    }
  });
  const [retainLinked] = useState(() => {
    if (props.owner) return true;
    try {
      const storage = getAppStorage(),
        journal = createP05Journal(
          {
            getItem: k => storage.getString(k) ?? null,
            setItem: (k, v) => storage.setString(k, v),
            removeItem: k => storage.remove(k),
          },
          p03Scope(),
          createP05Service().baseUrl,
        );
      const saved = journal.read() as {
        source?: { source_document_id?: string };
        recorded?: boolean;
        pending?: unknown;
        unknown?: boolean;
      } | null;
      if (props.resumeDraftId) {
        const manual = createP05Journal(
          {
            getItem: k => storage.getString(k) ?? null,
            setItem: (k, v) => storage.setString(k, v),
            removeItem: k => storage.remove(k),
          },
          p03Scope(),
          createP05Service().baseUrl,
          'hn-p05-create-v1:',
        ).read() as any;
        if (manual?.draftId === props.resumeDraftId) return false;
      }
      return (
        !!saved &&
        (!saved.recorded ||
          !!saved.pending ||
          !!saved.unknown ||
          saved.source?.source_document_id === props.returnDocumentId)
      );
    } catch {
      return true;
    }
  });
  if (!resumeAvailable)
    return (
      <P04Frame
        title="Xuất kho"
        onBack={props.onExit}
        footer={<P04Action label="Quay lại" onPress={props.onExit} />}
      >
        <P04Info title="Chưa mở được đúng nháp">
          Không có nháp tương ứng trên thiết bị trong phiên/kho này. Giữ dữ
          liệu; chưa mở hoặc tạo phiếu khác.
        </P04Info>
      </P04Frame>
    );
  return retainLinked ? (
    <P05LinkedNativeFlow {...props} />
  ) : (
    <P05CreateNativeFlow
      onExit={props.onExit}
      onViewDocument={props.onViewDocument}
      onHistory={props.onHistory}
      returnDocumentId={props.returnDocumentId}
      resumeDraftId={props.resumeDraftId}
      onSelectTab={props.onSelectTab}
      footerActiveKey={props.footerActiveKey}
      onAssignNfc={props.onAssignNfc}
    />
  );
}
export function P05LinkedNativeFlow({
  onExit,
  onViewDocument,
  onHistory,
  returnDocumentId,
  owner: provided,
  onSelectTab,
  footerActiveKey,
  onAssignNfc,
}: Props) {
  const ref = useRef<Flow | null>(null),
    [state, setState] = useState<Snapshot | null>(null);
  if (!ref.current)
    ref.current = provided ?? createP05NativeOwner({ onChange: setState });
  const flow = ref.current,
    s = state ?? flow.snapshot();
  const resultActionsReady = useP05ResultActions(
    s.step,
    s.document?.documentId,
  );
  const [picker, setPicker] = useState(false),
    [query, setQuery] = useState(''),
    [replace, setReplace] = useState<string>(),
    [exit, setExit] = useState(false),
    [cancel, setCancel] = useState(false),
    [info, setInfo] = useState<string>(),
    [resume, setResume] = useState(false),
    [view, setView] = useState<P04ViewState>({});
  const [legacy] = useState(() => {
    const entries = getAppStorage().getObject<unknown>('workflow.drafts.v1');
    return (
      Array.isArray(entries) &&
      entries.some(d => d?.kind === 'outbound' && d?.status === 'DRAFT')
    );
  });
  const changeView = (patch: P04ViewState) => {
    flow.setViewState(patch);
    setView(v => ({
      ...v,
      ...patch,
      scroll: patch.scroll ? { ...v.scroll, ...patch.scroll } : v.scroll,
    }));
  };
  useEffect(() => {
    let current = true;
    flow.start();
    flow
      .initialize()
      .then(() => {
        if (!current) return;
        const restored = flow.snapshot();
        setView(restored.nativeView ?? {});
        if (restored.recorded && !returnDocumentId)
          flow.start({}, { newAttempt: true });
        else if (restored.source && !restored.pending && !returnDocumentId)
          setResume(true);
        if (provided) setState(flow.snapshot());
      })
      .catch(e => {
        if (current)
          setInfo(
            e instanceof Error ? e.message : 'Không xác minh được phiên/kho.',
          );
      });
    return () => {
      current = false;
      flow.leave();
      if (!provided) flow.dispose();
    };
  }, [flow, provided, returnDocumentId]);
  const locked = s.busy || s.scanBusy || s.unknown || !!s.pending;
  const exceptionActive = !!p05ExceptionView(s);
  const refresh = () => {
    if (provided) setState(flow.snapshot());
  };
  const home = () => {
    if (s.busy || s.scanBusy) return;
    flow.leave();
    onExit();
  };
  const back = () => {
    if (locked) return;
    if (s.step === 4 || !s.source) {
      home();
      return;
    }
    if (s.step > 1) flow.back();
    else setExit(true);
  };
  useHardwareBack(() => {
    if (exceptionActive) return false;
    if (picker) {
      setPicker(false);
      return true;
    }
    if (info) {
      setInfo(undefined);
      return true;
    }
    if (cancel) {
      if (!s.busy && !s.scanBusy) setCancel(false);
      return true;
    }
    if (exit || resume) {
      if (!locked) {
        setExit(false);
        setCancel(false);
        setResume(false);
      }
      return true;
    }
    back();
    return true;
  });
  async function scan(
    raw: string,
    source: import('../../scanner/scanPayload').ScanSource,
  ): Promise<ScanFeedback> {
    const bound = flow.bindScan(source);
    const result = bound ? await bound(raw) : false;
    const next = flow.snapshot();
    refresh();
    if (result === 'valid' && !next.pending && !next.dirty)
      return { accepted: true };
    return {
      accepted: false,
      retained: result === 'valid',
      message:
        next.message ||
        next.error?.message ||
        (result === 'duplicate'
          ? 'Mã này đã được quét. Không cộng số lượng.'
          : 'Chưa xác minh mã; dữ liệu đang nhập được giữ.'),
    };
  }
  const openPicker = () => {
    setQuery(s.sources.q);
    setPicker(true);
    flow.searchSources(s.sources.q);
  };
  async function select(id: string) {
    setPicker(false);
    if (s.source && s.source.source_document_id !== id) {
      setReplace(id);
      return;
    }
    await flow.selectSource(id);
  }
  async function discard() {
    const expected = fingerprint(flow.snapshot());
    if (await flow.discardServer(expected)) {
      setCancel(false);
      setExit(false);
      setResume(false);
    }
  }
  async function saveExit() {
    if (await flow.save()) {
      setExit(false);
      setResume(false);
      home();
    }
  }
  async function currentDocument(history = false) {
    if (!s.document) return;
    const id = s.document.documentId;
    if (await flow.refreshCurrent()) {
      if (history && onHistory) onHistory(id);
      else if (onViewDocument) onViewDocument(id);
      else
        setInfo(
          'Chứng từ ' +
            s.document.number +
            ' · ' +
            flow.snapshot().current?.status,
        );
    }
  }

  const footer = (
    <View style={styles.row}>
      {s.step === 3 && (
        <P04Action
          label="Quay lại soạn hàng"
          secondary
          compact={s.step === 3}
          disabled={locked}
          onPress={() => flow.back()}
          style={styles.half}
        />
      )}
      <P04Action
        compact={s.step === 3}
        label={
          s.step === 1
            ? 'Bắt đầu soạn hàng'
            : s.step === 2
            ? 'Kiểm tra phiếu'
            : 'Gửi duyệt'
        }
        disabled={
          locked ||
          !!s.error ||
          !s.source ||
          s.dirty ||
          (s.step === 2 && !s.accepted.length) ||
          (s.step === 3 && !flow.canRecord())
        }
        loading={s.busy && !!s.context}
        trailing={
          s.step === 1 || s.step === 3 ? (
            <P04Icon
              name={s.step === 3 ? 'send' : 'arrow'}
              size={20}
              color={HN_UI.onBrand}
            />
          ) : undefined
        }
        onPress={() => {
          if (s.step === 3) flow.send();
          else flow.next();
        }}
        style={styles.half}
      />
    </View>
  );
  const notices = (
    <>
      {s.dirty && !s.pending && !s.error && (
        <P04Info
          title="Nháp chưa được lưu"
          actions={
            <P04Action
              label="Lưu nháp"
              disabled={s.busy || s.scanBusy}
              onPress={() => {
                flow.save().catch(() => undefined);
              }}
            />
          }
        />
      )}
      {s.pending && (
        <P04Info
          title="Cần kiểm tra kết quả"
          actions={
            <>
              <P04Action
                label="Kiểm tra kết quả"
                disabled={s.busy}
                onPress={() => flow.check()}
              />
              {s.retry === 'SAME_REQUEST_ONLY' && (
                <P04Action
                  label="Thử lại cùng yêu cầu"
                  secondary
                  disabled={s.busy}
                  onPress={() => flow.retrySame()}
                />
              )}
              <P04Action
                label="Về Trang chủ — giữ phiếu"
                secondary
                disabled={s.busy}
                onPress={home}
              />
            </>
          }
        >
          Giữ nguyên nháp và yêu cầu {s.pending.command}. Chưa gửi thao tác mới.
        </P04Info>
      )}
      {s.error && !s.pending && (
        <P04Info
          title="Chưa thể tiếp tục"
          actions={
            <>
              <P04Action
                label={
                  p05ChecksPending(s)
                    ? 'Đối chiếu lượt kiểm mã gốc'
                    : 'Đọc lại nguồn và phiên'
                }
                secondary
                disabled={s.busy}
                onPress={() =>
                  p05ChecksPending(s)
                    ? flow.reconcileResolverCheck()
                    : flow.initialize()
                }
              />
              {s.source && s.context?.permissions.cancel && (
                <P04Action
                  label="Hủy nháp"
                  secondary
                  onPress={() => setCancel(true)}
                />
              )}
            </>
          }
        >
          {s.error.message}
        </P04Info>
      )}
    </>
  );
  let screen: React.ReactNode;
  if (s.step === 2 && s.document) {
    screen = (
      <BusinessScanScreen
        title="Xuất kho"
        documentName={s.document.number}
        stepLabel="Bước 2/3"
        sessionLabel="Phiếu xuất đang quét"
        layout="board"
        scannedCount={s.accepted.length}
        progressLabel={`${s.accepted.length}/${s.document.planned}`}
        scanPaused={
          s.unknown ||
          !!s.pending ||
          !!s.error ||
          picker ||
          exit ||
          cancel ||
          resume
        }
        onScan={scan}
        onBack={back}
        onDone={() => flow.next()}
        p05Context={{
          documentRef: s.document.number,
          documentNumber: s.document.number,
          warehouseName: s.document.warehouseName,
          supplierName: s.document.recipient,
          typeLabel: 'Xuất kho',
          planned: s.document.planned,
          snapshotSaved: !s.dirty && !s.pending && !s.error,
          processing: s.busy || s.scanBusy,
          ownerNotice: !!info,
          viewState: view,
          onViewChange: changeView,
          codes: s.accepted.map(a => ({
            raw: a.raw,
            sku: a.sku,
            quantity: 1,
            at: 0,
          })),
          attempts: s.attempts.map(a => ({
            raw: a.raw,
            at: 0,
            kind: a.kind,
            reason: a.reason,
            timeLabel: a.time,
          })),
          notices,
        }}
      />
    );
  } else if (s.step === 4 && s.document) {
    screen = (
      <P04Frame
        assetPack
        title="Xuất kho"
        appearance="outbound-result"
        onBack={back}
        initialScrollY={view.scroll?.[4] ?? 0}
        onScrollPositionChange={y => changeView({ scroll: { 4: y } })}
        footer={
          <>
            <P04Action
              label="Xem chứng từ"
              disabled={!resultActionsReady || s.busy}
              leading={
                <P04Icon
                  name="document"
                  assetPack
                  size={20}
                  color={HN_UI.onBrand}
                />
              }
              trailing={
                <P04Icon name="arrow" size={20} color={HN_UI.onBrand} />
              }
              onPress={() => currentDocument()}
            />
            <P04Action
              label="Về Trang chủ"
              disabled={!resultActionsReady || s.busy}
              secondary
              leading={<P04Icon name="house" assetPack size={20} />}
              onPress={home}
            />
          </>
        }
      >
        <P05ResultContent
          documentNo={s.document.number}
          warehouseName={s.document.warehouseName}
          recipient={s.document.recipient}
          count={s.accepted.length}
          planned={s.document.planned}
          sentAt={s.sentAt}
          current={s.current}
          currentError={s.error?.message}
          onRead={(label, value) => setInfo(label + '\n' + value)}
        />
        {notices}
      </P04Frame>
    );
  } else {
    screen = (
      <P04Frame
        assetPack
        title="Xuất kho"
        step={undefined}
        stepLabels={undefined}
        headerRight={<Text style={p04.step}>{`Bước ${s.step}/3`}</Text>}
        onBack={back}
        initialScrollY={view.scroll?.[s.step] ?? 0}
        onScrollPositionChange={y => changeView({ scroll: { [s.step]: y } })}
        footer={footer}
      >
        <View style={p04.heading}>
          <Text style={p04.h2}>
            {s.step === 3 ? 'Kiểm tra phiếu xuất' : 'Thông tin phiếu xuất'}
          </Text>
          <Text style={p04.hint}>
            {s.step === 3
              ? 'Xem lại thông tin, số lượng và danh sách sản phẩm trước khi gửi duyệt.'
              : s.source
              ? 'Thông tin theo phiếu nguồn'
              : 'Chọn phiếu nguồn trong kho đã xác nhận.'}
          </Text>
        </View>
        {s.step === 1 && (
          <>
            <P05Information
              state={s}
              locked={locked}
              onChoose={openPicker}
              onRead={(label, value) => setInfo(label + '\n' + value)}
              hasLegacy={legacy}
              onLegacy={() =>
                setInfo(
                  'Bản nháp trước vẫn được giữ.\nDữ liệu của luồng cũ chưa liên kết với phiếu nguồn. Chọn nguồn mới không xóa nháp cũ hoặc tự chuyển mã vào nguồn.',
                )
              }
            />
            {!s.context && (
              <P04Action
                label="Thử lại"
                secondary
                disabled={s.busy}
                onPress={() => flow.initialize()}
              />
            )}
          </>
        )}
        {s.step === 3 && s.document && (
          <P05ReviewContent
            documentNo={s.document.number}
            warehouse={s.document.warehouseName}
            recipient={s.document.recipient}
            phone={s.document.phone}
            address={s.document.address}
            group={s.document.group}
            planned={s.document.planned}
            accepted={s.accepted}
            sourceLines={s.source?.lines}
            note={s.document.note}
            onRead={(label, value) => setInfo(label + '\n' + value)}
            onAssignNfc={
              onAssignNfc
                ? (raw, label) => {
                    const latest = flow.snapshot();
                    if (canP05ReviewHandoff(latest, s, raw))
                      onAssignNfc(raw, label);
                  }
                : undefined
            }
            nfcDisabled={!canP05ReviewHandoff(s, s)}
          />
        )}

        {notices}
      </P04Frame>
    );
  }
  if (exceptionActive)
    return (
      <P05Exceptions
        state={s}
        owner={flow}
        refresh={refresh}
        onHome={home}
        onViewDocument={onViewDocument}
      />
    );
  return (
    <>
      {screen}
      {s.step === 4 && s.document && onSelectTab ? (
        <BottomNav
          activeKey={footerActiveKey ?? 'scan'}
          onSelect={key => {
            if (resultActionsReady && !locked) onSelectTab(key);
          }}
          disabled={!resultActionsReady || locked}
        />
      ) : null}
      <Sheet
        visible={picker}
        onDismiss={() => setPicker(false)}
        title="Chọn phiếu nguồn"
        keyboardLayout="viewport"
      >
        <Input
          label="Tìm mã phiếu/người nhận"
          value={query}
          maxLength={200}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={() => flow.searchSources(query)}
        />
        <P04Action
          label="Tìm kiếm"
          disabled={s.sources.loading}
          onPress={() => flow.searchSources(query)}
        />
        <Text accessibilityLiveRegion="polite" style={p04.text}>
          {s.sources.loading
            ? 'Đang tải phiếu nguồn…'
            : s.sources.error?.message ??
              (s.sources.meta
                ? `${s.sources.meta.total} phiếu · Trang ${s.sources.meta.page}/${s.sources.meta.last_page}`
                : 'Chưa tải nguồn')}
        </Text>
        {!s.sources.loading && !s.sources.items.length && !s.sources.error && (
          <Text style={p04.text}>Không có phiếu nguồn phù hợp.</Text>
        )}
        {!s.sources.loading &&
          s.sources.items.map(source => (
            <P04Action
              key={source.source_document_id}
              label={`${source.doc_no} · ${
                source.recipient.name ?? 'Chưa có người nhận'
              } · ${source.planned_total_qty} sản phẩm`}
              secondary
              onPress={() => select(source.source_document_id)}
            />
          ))}
        {s.sources.error && (
          <P04Action
            label="Thử lại"
            onPress={() => flow.searchSources(query)}
          />
        )}
        <View style={styles.row}>
          <P04Action
            label="Trước"
            secondary
            disabled={
              s.sources.loading || !s.sources.meta || s.sources.meta.page <= 1
            }
            onPress={() =>
              flow.searchSources(query, (s.sources.meta?.page ?? 1) - 1)
            }
            style={styles.half}
          />
          <P04Action
            label="Sau"
            secondary
            disabled={
              s.sources.loading ||
              !s.sources.meta ||
              s.sources.meta.page >= s.sources.meta.last_page
            }
            onPress={() =>
              flow.searchSources(query, (s.sources.meta?.page ?? 1) + 1)
            }
            style={styles.half}
          />
        </View>
        <P04Action label="Đóng" secondary onPress={() => setPicker(false)} />
      </Sheet>
      <Dialog
        visible={!!replace}
        title="Đổi phiếu nguồn?"
        message="Server phải xác nhận lưu và hủy nháp hiện tại trước khi mở phiếu nguồn mới."
        onDismiss={() => setReplace(undefined)}
        dismissible={!s.busy}
      >
        <View style={styles.actions}>
          <P04Action
            label="Đổi phiếu"
            disabled={locked}
            loading={s.busy}
            onPress={() => {
              const id = replace;
              if (id)
                flow.selectSource(id, { replace: true }).then(ok => {
                  if (ok) setReplace(undefined);
                });
            }}
          />
          <P04Action
            label="Hủy"
            secondary
            disabled={s.busy}
            onPress={() => setReplace(undefined)}
          />
        </View>
      </Dialog>
      <P03Dialog
        activeKey={footerActiveKey}
        visible={
          resume || exit || cancel || s.error?.code === 'WAREHOUSE_INACTIVE'
        }
        panel={
          s.error?.code === 'WAREHOUSE_INACTIVE'
            ? 'S03'
            : cancel
            ? 'S04'
            : 'S02'
        }
        busy={s.busy || s.scanBusy}
        serverLinked={!!s.draftVersion}
        message={
          s.error?.code === 'WAREHOUSE_INACTIVE'
            ? undefined
            : s.error?.message || s.message || undefined
        }
        onBack={() => {
          if (cancel) setCancel(false);
          else {
            setExit(false);
            setResume(false);
          }
        }}
        onSelectTab={key => {
          if (onSelectTab) {
            flow.leave();
            onSelectTab(key);
          } else if (key === 'home') home();
        }}
        actions={
          s.error?.code === 'WAREHOUSE_INACTIVE'
            ? [{ label: 'Về Trang chủ', kind: 'primary', onPress: home }]
            : cancel
            ? [
                { label: 'Quay lại', onPress: () => setCancel(false) },
                {
                  label: 'Bỏ phiếu',
                  kind: 'danger',
                  disabled: locked,
                  onPress: () => {
                    discard().catch(() => undefined);
                  },
                },
                ...(s.pending
                  ? [
                      {
                        label: 'Kiểm tra kết quả hủy',
                        onPress: () => {
                          flow
                            .check()
                            .then(ok => {
                              if (ok && !flow.snapshot().source) {
                                setCancel(false);
                                setExit(false);
                                setResume(false);
                              }
                            })
                            .catch(() => undefined);
                        },
                      },
                    ]
                  : []),
              ]
            : [
                {
                  label: 'Tiếp tục phiếu',
                  kind: 'primary',
                  disabled: locked,
                  onPress: () => {
                    setResume(false);
                    setExit(false);
                  },
                },
                {
                  label: 'Lưu nháp và thoát',
                  disabled: locked,
                  onPress: () => {
                    saveExit().catch(() => undefined);
                  },
                },
                {
                  label: 'Bỏ phiếu',
                  kind: 'danger-outline',
                  disabled: locked,
                  onPress: () => setCancel(true),
                },
                {
                  label: 'Hủy',
                  kind: 'text',
                  onPress: () => {
                    setResume(false);
                    setExit(false);
                  },
                },
              ]
        }
      />
      <Dialog
        visible={!!info}
        title="Thông tin phiếu xuất"
        message={info}
        onDismiss={() => setInfo(undefined)}
      >
        <P04Action label="Đóng" onPress={() => setInfo(undefined)} />
      </Dialog>
    </>
  );
}
