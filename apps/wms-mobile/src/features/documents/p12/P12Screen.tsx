import {P12DocumentRow} from './P12DocumentRow';
import {HN_UI} from '../../../theme/uiKitV3';
import {STOCK_WAITING_WEB_FILTER,STOCK_WAITING_WEB_LABEL} from '../../../ui/stockWorkflowLabels';
import {ScannerNativeText as Text} from '../../../ui/ScannerNativeText';
import { p12Layout } from './styles';
import { documentFileMetadata, documentListState } from './uiPresentation';
import { P16DataState, type P16Condition } from '../../system/P16DataState';
import { productGroups } from './products';
import {futureMilestones, warrantyIntakeSource, futureEventDescription} from './futureEventEvidence';
import { ownerProjectionPresentation } from './ownerProjection';
import { useProductPhotos } from './useProductPhotos';
import { ProductPhoto } from './ProductPhoto';
import { timelineTime as time, timelineEventTitle } from './timeline';
import { P12_TIMELINE_CONTRACT } from './timelineHandoff';
import { p12TimelineReadOptions } from '../../../config/p12TimelineRelease';
import { documentScanQuery } from './scannedQuery';
import { DocumentSearchCamera } from './DocumentSearchCamera';
import {
  canonicalStatusPresentation,
  documentStatusPresentation,
  documentOwnerStatusPresentation,
  documentPartnerLabel,
  documentSnapshotCaption,
  warrantyOwnerPresentation,
} from './presentation';
import {
  parseDocumentTimestamp,
  formatDocumentTimestamp,
  type DocumentTimestamp,
} from '../../../services/wms/documentTimestamps';
import { type MixedPage } from './mixed';
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {ScannerTextInput as TextInput} from '../../../ui/ScannerTextInput';
import {ActivityIndicator,AppState,Dimensions,Keyboard,Platform,Pressable,ScrollView,View,useWindowDimensions} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getActiveSession, getSessionGeneration } from '../../../auth/session';
import { fetchCurrentUser } from '../../../services/wms/queries';
import type { CurrentUser } from '../../../services/wms/types';
import { Dialog } from '../../../ui/Dialog';
import { Button } from '../../../ui/Button';
import { P04Icon } from '../../inbound/P04Icon';
import { AppIcon } from '../../../ui/AppIcon';
import { SvgXml } from 'react-native-svg';
import { copyNfcIdentifier } from '../../../native/nfc';
import { HN_OPERATIONS } from '../../../ui/hnHomeTokens';
import { useHardwareBack } from '../../../app/useHardwareBack';
import { P18ViewerScreen } from '../../warranty/P18ViewerScreen';
import {
  p08CalendarDays,
  p08MoveDay,
  p08ValidDate,
  p08QuickDate,
} from '../../history/p08Dates';
import { createP12Service, type Context, type P12Service } from './service';
import {
  createP12Controller,
  hasNextPage,
  initialFilters,
  type State,
  type Tab,
  type Filters,
  type Slot,
} from './controller';
import {
  p04Seed,
  type Source,
  type Document,
  type File,
  type Raw,
  type Page,
} from './contract';
import {
  saveP12Binary,
  openP12File,
  cancelP12Save,
  p12SaveTitle,
  p12SaveMessage,
} from '../../../native/p12Files';

const names = {
  inbound: 'Nhập kho',
  outbound: 'Xuất kho',
  warranty: 'Bảo hành',
};
interface CameraRequest {
  id: number;
  scope: string;
  generation: number;
  filters: Filters;
}
interface FileViewer {
  parent: Document;
  file: File;
  scope: string;
  generation: number;
}
interface AttachmentListEntry {
  parentId: string;
  parentType: Source;
  scope: string;
  generation: number;
  returnTab: Tab;
  epoch: number;
  parentVersion: unknown;
}
// Compare the exact attachment revision; never reuse bytes under a new name/ACL.
const fileRevision = (file: File) => JSON.stringify([
  file.id, file.attachment_id, file.document_id, file.document_type,
  file.warranty_case_id, file.version, file.updated_at, file.checksum,
  file.checksum_sha256, file.sha256, file.file_name, file.content_type,
  file.file_size_bytes, file.status, file.can_download, file.download_url,
]);
const previewMimeTypes = ['application/pdf','image/png','image/jpeg','image/webp'];
const fileMetadataText = (file: File) => documentFileMetadata(
  previewMimeTypes.includes(file.content_type) ? file.content_type : 'Chưa rõ định dạng',
  file.file_size_bytes,
);
const text = (v: unknown) =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : 'Chưa xác minh';
const raw = (v: unknown): Raw =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {};
const number = (d: Document) =>
  text(d.number ?? d.source.warranty_case_code ?? d.source.doc_no);
export const documentTime = (value: unknown) =>
  formatDocumentTimestamp(
    value && typeof value === 'object' && 'status' in value
      ? (value as DocumentTimestamp)
      : parseDocumentTimestamp(value),
    { timeFirst: false },
  );
const today = () => {
  const d = p08QuickDate(1, 'Asia/Ho_Chi_Minh');
  return d.date_mode === 'DATE' ? d.date : '';
};
const validBusinessDate = (value?: string) =>
  !!value && p08ValidDate(value) && value >= '2000-01-01' && value <= today();
const businessDateLabel = (value?: string) =>
  value ? value.split('-').reverse().join('/') : 'Chọn ngày chứng từ';
type ModalState =
  | { kind: 'reader'; title: string; message: string }
  | { kind: 'filter'; section: 'date' | 'status' }
  | { kind: 'search' }
  | { kind: 'document-actions' }
  | { kind: 'business-date' }
  | { kind: 'product-search' }
  | { kind: 'product-filter' }
  | { kind: 'supplier' }
  | { kind: 'file'; file: File }
  | { kind: 'saved'; uri: string; message: string }
  | { kind: 'notice'; title: string; message: string }
  | null;
export interface OwnerIntent {
  type: Source;
  seed: {
    supplierId: string | null;
    supplierName?: string;
    note: string;
    docDate?: string;
  } | null;
  scope: string;
}
export interface P12ScreenProps {
  onBack: () => void;
  onOwnerIntent: (intent: OwnerIntent) => void;
  retained?: { current?: State };
  initialDocument?: { type: Source; id: string; tab?: Tab };
  initialQueue?: { source: Source; key: string; status?: string };
  user?: CurrentUser;
  onIdentity?: (u: CurrentUser) => void;
  service?: P12Service;
  copyText?: (value: string) => Promise<void>;
  onCreateModeChange?: (active: boolean) => void;
  onScannerModeChange?: (active: boolean) => void;
  rootRequest?: number;
  onRootRequestHandled?: (id: number) => void;
}

export function P12Screen({
  onBack,
  onOwnerIntent,
  retained,
  initialDocument,
  initialQueue,
  user,
  onIdentity,
  service,
  copyText = copyNfcIdentifier,
  onCreateModeChange,
  onScannerModeChange,
  rootRequest,
  onRootRequestHandled,
}: P12ScreenProps) {
  const { width, height } = useWindowDimensions(),
    // The Web app owns a fixed logical viewport; the host monitor height must
    // not shrink only P12/P16 inside it. Native keeps the physical-screen basis
    // so opening the keyboard does not rescale all existing controls.
    scale = Math.min(1, width / 494, (Platform.OS === 'web' ? height : Dimensions.get('screen').height) / 950),
    s = useMemo(() => p12Layout(scale), [scale]);
  const [identity, setIdentity] = useState(user),
    [identityError, setIdentityError] = useState<string>(),
    [modal, setModal] = useState<ModalState>(null),
    [draft, setDraft] = useState<Filters>(initialFilters()),
    [calendar, setCalendar] = useState<'from' | 'to'>(),
    [month, setMonth] = useState(today().slice(0, 7));
  const [scannedQuery, setScannedQuery] = useState('');
  const [businessDateDraft, setBusinessDateDraft] = useState('');
  const [cameraRequest, setCameraRequest] = useState<CameraRequest>();
  const [viewer, setViewer] = useState<FileViewer>();
  const [attachmentList, setAttachmentList] = useState<AttachmentListEntry>();
  const attachmentEpoch = useRef(0);
  const viewerRef = useRef<FileViewer | undefined>(undefined),
    downloadLatch = useRef(false),
    fileNameTriggers = useRef(new Map<string, React.ComponentRef<typeof Pressable>>()),
    readerFocusFrame = useRef<number | undefined>(undefined),
    readerReturn = useRef<{scope:string;generation:number;parentId:string;parentType:Source;fileId:string;revision:string} | undefined>(undefined);
  const cameraSequence = useRef(0),
    cameraRef = useRef<CameraRequest | undefined>(undefined);
  const ctx = useRef<Context>({ session: getActiveSession(), user: identity });
  const identityCallback = useRef(onIdentity);
  identityCallback.current = onIdentity;
  ctx.current = { session: getActiveSession(), user: identity };
  const api = useMemo(
      () =>
        service ??
        createP12Service(() => ctx.current, {
          ...p12TimelineReadOptions(),
          revalidateUser: async signal => {
            const generation = getSessionGeneration();
            const next = await fetchCurrentUser({ signal });
            if (generation !== getSessionGeneration() || signal?.aborted)
              throw new Error('Phiên đã thay đổi.');
            ctx.current = { ...ctx.current, user: next };
            setIdentity(next);
            identityCallback.current?.(next);
            return next;
          },
        }),
      [service],
    ),
    controller = useMemo(
      () => createP12Controller(api, retained?.current),
      [api, retained],
    );
  const [state, setState] = useState(controller.snapshot()),
    [searchText, setSearchText] = useState(
      controller.snapshot().pendingQuery ?? controller.snapshot().filters.q,
    ),
    [form, setForm] = useState<NonNullable<State['createDraft']>>(
      controller.snapshot().createDraft ?? {
        supplierId: null as string | null,
        supplierName: '',
        note: '',
      },
    ),
    [supplierQuery, setSupplierQuery] = useState(''),
    [supplierDraft, setSupplierDraft] = useState<Raw>(),
    [suppliers, setSuppliers] = useState<Slot<Page<Raw>>>({
      status: 'pending',
    }),
    restoredPendingQuery = useRef(controller.snapshot().pendingQuery),
    [fieldError, setFieldError] = useState(''),
    [fileBusy, setFileBusy] = useState(false),
    [foreground, setForeground] = useState(true),
    [listViewportHeight, setListViewportHeight] = useState(0);
  useLayoutEffect(() => {
    onCreateModeChange?.(state.panel === 4);
  }, [state.panel, onCreateModeChange]);
  useEffect(
    () => () => {
      onCreateModeChange?.(false);
    },
    [onCreateModeChange],
  );
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null),
    queryRef = useRef<React.ComponentRef<typeof TextInput>>(null),
    downloadController = useRef<AbortController | null>(null),
    savingPicker = useRef(false),
    appActive = useRef(true),
    alive = useRef(true),
    ownerLatch = useRef(false),
    copyGeneration = useRef(0),
    readSequence = useRef(0),
    loadedScope = useRef(''),
    opened = useRef(''),
    searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => controller.draft(form), [controller, form]);
  const scope = api.scopeKey(),
    d = state.detail.data,
    scrollKey =
      state.panel === 1
        ? 'list'
        : state.panel === 4
        ? 'create'
        : d?.id + ':' + state.tab;
  const attachmentActive = !!attachmentList && !!d && state.panel === 2 &&
    state.tab === 'files' && state.scope === scope && attachmentList.scope === scope &&
    attachmentList.generation === getSessionGeneration() &&
    attachmentList.parentId === d.id && attachmentList.parentType === d.type;
  const scannerActive =
    !!cameraRequest &&
    !!scope &&
    cameraRequest.scope === scope &&
    cameraRequest.generation === getSessionGeneration();
  const viewerActive = !!viewer && viewerIsCurrent(viewer);
  useLayoutEffect(() => {
    // Both native camera and file viewer own a full-screen child, not the app footer.
    onScannerModeChange?.(scannerActive || viewerActive);
    if (cameraRequest && !scannerActive) {
      cameraRef.current = undefined;
      setCameraRequest(undefined);
    }
    if (viewer && !viewerActive) {
      viewerRef.current = undefined;
      setViewer(undefined);
    }
  }, [scannerActive, viewerActive, cameraRequest, viewer, onScannerModeChange]);
  useEffect(
    () => () => {
      onScannerModeChange?.(false);
    },
    [onScannerModeChange],
  );
  const productView = useMemo(
    () => productGroups(state.scans.data, state.query),
    [state.scans.data, state.query],
  );
  const productPhotos = useProductPhotos(
    (state.scans.data?.items ?? []).map(row =>
      typeof row.sku_id === 'string' ? row.sku_id : null,
    ),
    scope + ':' + (d?.type ?? '') + ':' + (d?.id ?? ''),
    foreground && state.panel === 3 && state.scans.status === 'ready',
  );
  const handledRootRequest = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (!rootRequest || handledRootRequest.current === rootRequest) return;
    handledRootRequest.current = rootRequest;
    Keyboard.dismiss();
    downloadController.current?.abort();
    cancelP12Save();
    readSequence.current++;
    copyGeneration.current++;
    setModal(null);
    attachmentEpoch.current++;
    setAttachmentList(undefined);
    setFileBusy(false);
    cameraRef.current = undefined;
    setCameraRequest(undefined);
    // UI-only navigation. Do not clear business drafts, journals or identity.
    // A reselect while the root list is loading must NOT abort that GET.
    if (controller.snapshot().panel !== 1) controller.back();
    setState({ ...controller.snapshot() });
    onRootRequestHandled?.(rootRequest);
  }, [controller, rootRequest, onRootRequestHandled]);
  useEffect(() => {
    if (
      foreground &&
      scope &&
      state.panel !== 1 &&
      state.panel !== 4 &&
      state.tab === 'info' &&
      state.detail.status === 'ready' &&
      state.files.status === 'pending'
    )
      controller.child('files');
  }, [
    foreground,
    scope,
    state.panel,
    state.tab,
    state.detail.status,
    d?.id,
    state.files.status,
    controller,
  ]);
  useEffect(() => {
    alive.current = true;
    const reads = readSequence;
    const off = controller.subscribe(() =>
      setState({ ...controller.snapshot() }),
    );
    return () => {
      alive.current = false;
      attachmentEpoch.current++;
      cameraRef.current = undefined;
      reads.current++;
      clearTimeout(searchTimer.current);
      if (readerFocusFrame.current !== undefined) cancelAnimationFrame(readerFocusFrame.current);
      downloadController.current?.abort();
      cancelP12Save();
      off();
      controller.hide();
      if (retained) retained.current = controller.snapshot();
      controller.dispose();
    };
  }, [controller, retained]);
  useEffect(() => {
    const pending = restoredPendingQuery.current;
    restoredPendingQuery.current = undefined;
    if (pending === undefined || pending === controller.snapshot().filters.q)
      return;
    setSearchText(pending);
    const timer = setTimeout(() => {
      if (alive.current && controller.snapshot().panel === 1)
        controller.filters({ ...controller.snapshot().filters, q: pending });
    }, 300);
    return () => clearTimeout(timer);
  }, [controller]);
  useEffect(() => {
    if (user) {
      setIdentity(user);
      return;
    }
    const owner = getSessionGeneration();
    let current = true;
    fetchCurrentUser()
      .then(u => {
        if (current && owner === getSessionGeneration()) {
          setIdentity(u);
          onIdentity?.(u);
        }
      })
      .catch(e => {
        if (current) setIdentityError(e.message);
      });
    return () => {
      current = false;
    };
  }, [user, onIdentity]);
  useEffect(() => {
    controller.invalidate();
    if (!scope) {
      if (loadedScope.current) {
        downloadController.current?.abort();
        cancelP12Save();
        setModal(null);
      }
      return;
    }
    if (loadedScope.current && loadedScope.current !== scope) {
      clearTimeout(searchTimer.current);
      setSearchText('');
      setModal(null);
      setForm({ supplierId: null, supplierName: '', note: '' });
      downloadController.current?.abort();
      cancelP12Save();
    }
    loadedScope.current = scope;
    if (initialDocument) {
      const key =
        scope +
        initialDocument.type +
        initialDocument.id +
        (initialDocument.tab ?? 'info');
      if (opened.current !== key) {
        opened.current = key;
        controller.open(
          initialDocument.type,
          initialDocument.id,
          initialDocument.tab,
        );
      }
    } else if (initialQueue) {
      const key = scope + ':queue:' + initialQueue.key;
      if (opened.current !== key) {
        opened.current = key;
        if (controller.snapshot().homeEntryKey === key) return;
        if (initialQueue.source === 'warranty')
          controller.filters(
            {
              ...initialFilters(),
              source: 'warranty',
              status: initialQueue.status ?? 'all',
            },
            key,
          );
        else controller.stockQueue(initialQueue.source, key);
      }
    } else if (controller.snapshot().list.status === 'pending')
      controller.snapshot().panel === 1
        ? controller.load()
        : controller.snapshot().panel !== 4
        ? controller.retry()
        : undefined;
  }, [scope, controller, initialDocument, initialQueue]);
  useEffect(() => {
    if (
      scope &&
      appActive.current &&
      state.panel === 1 &&
      controller.snapshot().list.status === 'pending'
    )
      controller.resumeList();
  }, [scope, state.panel, state.list.status, state.filters.source, controller]);
  useEffect(() => {
    const off = AppState.addEventListener('change', v => {
      appActive.current = v === 'active';
      setForeground(v === 'active');
      if (v !== 'active' && !savingPicker.current) {
        clearTimeout(searchTimer.current);
        setSearchText(controller.snapshot().filters.q);
        controller.hide();
        downloadController.current?.abort();
      } else if (v === 'active' && !savingPicker.current) {
        controller.invalidate();
        const current = controller.snapshot();
        if (current.panel === 1) controller.resumeList();
        else if (current.panel !== 4 && current.detail.status === 'pending')
          controller.retry();
        else if (current.panel !== 4 && current.detail.status === 'ready')
          controller.tab(current.tab);
      }
    });
    return () => off.remove();
  }, [controller]);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      scroll.current?.scrollTo({
        y: controller.snapshot().scroll[scrollKey] ?? 0,
        animated: false,
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [scrollKey, controller]);
  useEffect(() => {
    if (modal?.kind !== 'supplier') return;
    const reads = readSequence;
    const c = new AbortController(),
      sequence = ++readSequence.current;
    setSuppliers({ status: 'loading' });
    const timer = setTimeout(() => {
      api
        .suppliers(
          { q: supplierQuery, status: 'ACTIVE', page: 1, per_page: 20 },
          c.signal,
        )
        .then(v => {
          if (alive.current && sequence === readSequence.current)
            setSuppliers({ status: 'ready', data: v });
        })
        .catch(e => {
          if (
            !c.signal.aborted &&
            alive.current &&
            sequence === readSequence.current
          )
            setSuppliers({ status: 'error', error: e.message });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      c.abort();
      reads.current++;
    };
  }, [modal?.kind, supplierQuery, api]);
  const close = () => {
    const target = modal?.kind === 'reader' ? readerReturn.current : undefined;
    readerReturn.current = undefined;
    if (modal?.kind === 'saved') cancelP12Save();
    setModal(null);
    setCalendar(undefined);
    setFieldError('');
    if(target) readerFocusFrame.current=requestAnimationFrame(()=>{
      const current=controller.snapshot();
      if(alive.current && appActive.current && api.scopeKey()===target.scope &&
        getSessionGeneration()===target.generation && current.panel===2 &&
        current.detail.data?.id===target.parentId && current.detail.data?.type===target.parentType &&
        current.files.data?.items.some(file=>(file.attachment_id??file.id)===target.fileId&&fileRevision(file)===target.revision))
        fileNameTriggers.current.get(target.fileId)?.focus();
    });
  };
  const back = () => {
    copyGeneration.current++;
    Keyboard.dismiss();
    if (modal) {
      close();
      return true;
    }
    if (viewer) {
      closeViewer();
      return true;
    }
    if (attachmentActive && attachmentList) {
      attachmentEpoch.current++;
      setAttachmentList(undefined);
      controller.tab(attachmentList.returnTab);
      return true;
    }
    if (cameraRef.current) {
      cameraRef.current = undefined;
      setCameraRequest(undefined);
      return true;
    }
    if (state.panel === 3) {
      controller.tab('info');
      return true;
    }
    clearTimeout(searchTimer.current);
    downloadController.current?.abort();
    if (initialDocument) {
      onBack();
      return true;
    }
    if (controller.back()) return true;
    onBack();
    return true;
  };
  useHardwareBack(back);
  const reader = (title: string, value: unknown) => {
    if (readerFocusFrame.current !== undefined) cancelAnimationFrame(readerFocusFrame.current);
    readerReturn.current = undefined;
    Keyboard.dismiss();
    setModal({ kind: 'reader', title, message: text(value) });
  };
  const copyNumber = async () => {
    if (!d) return;
    const value = d.number ?? d.source.warranty_case_code ?? d.source.doc_no;
    if (typeof value !== 'string' || !value.trim()) return;
    const ownerScope = api.scopeKey(),
      id = d.id,
      generation = getSessionGeneration(),
      operation = ++copyGeneration.current;
    let message = 'Đã sao chép mã chứng từ.';
    try {
      await copyText(value);
    } catch {
      message = 'Chưa sao chép được. Chạm mã để đọc đầy đủ.';
    }
    const current = controller.snapshot();
    if (
      alive.current &&
      copyGeneration.current === operation &&
      api.scopeKey() === ownerScope &&
      getSessionGeneration() === generation &&
      current.detail.data?.id === id &&
      current.panel !== 1 &&
      current.panel !== 4
    )
      setModal({kind:'notice',title:'Sao chép mã chứng từ',message});
  };
  const action = (
    label: string,
    onPress: () => void,
    selected = false,
    caption = label,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.tab, selected && s.selected]}
    >
      <Text style={[s.tabText, selected && s.selectedText]}>{caption}</Text>
    </Pressable>
  );
  const link = (label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={s.link}
    >
      <Text style={s.linkText}>{label}</Text>
    </Pressable>
  );
  const tile = (type: Source) => (
    <View style={[s.tile, { backgroundColor: HN_OPERATIONS[type].soft }]}>
      <P04Icon
        name={type === 'inbound' ? 'down' : type === 'outbound' ? 'up' : 'tool'}
        color={HN_OPERATIONS[type].ink}
        size={28 * scale}
      />
    </View>
  );
  const badge = (doc: Document, detail = false, ownerAxis=false) => {
    const display = ownerAxis?documentOwnerStatusPresentation(doc):documentStatusPresentation(doc);
    return (
      <View
        style={[
          s.badge,
          detail && s.detailBadge,
          { backgroundColor: display.background },
        ]}
      >
        <Text
          numberOfLines={2}
          style={[
            s.badgeText,
            detail && s.detailBadgeText,
            { color: display.color },
          ]}
        >
          {display.label}
        </Text>
      </View>
    );
  };
  const status = (
    slot: Slot<unknown>,
    retry: () => void,
    retryLabel = 'Thử đọc lại',
  ) =>
    slot.status === 'ready' ? null : (
      <View
        testID={slot.status === 'error' ? 'P12.read.error' : 'P12.read.loading'}
        style={[s.card, s.center]}
        accessibilityLiveRegion="polite"
      >
        {slot.status === 'loading' ? (
          <>
            <ActivityIndicator color={HN_UI.textLink} />
            {Array.from({ length: 6 }, (_, index) => (
              <View
                key={index}
                accessible={false}
                style={{
                  height: 14,
                  width: index % 2 ? '72%' : '92%',
                  borderRadius: 4,
                  backgroundColor: HN_UI.surfaceSunken,
                }}
              />
            ))}
          </>
        ) : null}
        <Text style={s.ink}>
          {slot.error ??
            (slot.status === 'loading'
              ? 'Đang đọc dữ liệu…'
              : 'Đang chờ nguồn dữ liệu')}
        </Text>
        {slot.code ? (
          <Text style={s.label} accessibilityLabel={'Mã lỗi P12 ' + slot.code}>
            Mã kiểm tra: {slot.code}
          </Text>
        ) : null}
        {slot.status === 'error' ? (
          <Button label={retryLabel} onPress={retry} />
        ) : null}
      </View>
    );
  const canMore = (page?: Page<unknown>) => hasNextPage(page?.paging);
  const openFilter = (section: 'date' | 'status') => {
    Keyboard.dismiss();
    clearTimeout(searchTimer.current);
    if (searchText !== controller.snapshot().filters.q)
      controller.filters({ ...controller.snapshot().filters, q: searchText });
    const current = controller.snapshot();
    setDraft({ ...current.filters });
    setFieldError('');
    setCalendar(undefined);
    setModal({ kind: 'filter', section });
  };
  const apply = () => {
    const t = today(),
      min = p08MoveDay(t, -90);
    if (draft.source === 'warranty' && (draft.from || draft.to)) {
      setFieldError('Bộ lọc ngày bảo hành chưa được nối theo mapping riêng.');
      return;
    }
    if (draft.source === 'all' && !!draft.from !== !!draft.to) {
      setFieldError('Chọn đủ Từ ngày và Đến ngày, hoặc Tất cả ngày.');
      return;
    }
    if (
      [draft.from, draft.to].some(
        v => v && (!p08ValidDate(v) || v < min || v > t),
      ) ||
      (draft.from && draft.to && draft.from > draft.to)
    ) {
      setFieldError(
        'Ngày trong 90 ngày gần đây; Từ phải nhỏ hơn hoặc bằng Đến.',
      );
      return;
    }
    clearTimeout(searchTimer.current);
    setSearchText(draft.q);
    controller.filters(draft);
    close();
  };
  const owner = (type: Source) => {
    if (ownerLatch.current) return;
    if (!api.canCreate(type)) {
      setFieldError('Chưa xác minh quyền tạo cho nghiệp vụ này.');
      return;
    }
    if (
      type === 'inbound' &&
      state.panel === 4 &&
      (!form.supplierId || !validBusinessDate(form.docDate))
    ) {
      setFieldError(
        'Chọn nhà cung cấp và ngày chứng từ hợp lệ trước khi tiếp tục.',
      );
      return;
    }
    try {
      const seed =
        type === 'inbound'
          ? p04Seed({
              supplierId: form.supplierId,
              note: form.note,
              ...(form.docDate ? { docDate: form.docDate } : {}),
            })
          : null;
      ownerLatch.current = true;
      onOwnerIntent({
        type,
        seed: seed ? { ...seed, supplierName: form.supplierName } : null,
        scope: api.scopeKey(),
      });
    } catch (e) {
      setFieldError((e as Error).message);
      ownerLatch.current = false;
    }
  };
  const listState = documentListState(state);
  const retainedListRows =
    state.scope === scope && (state.list.data?.items.length ?? 0) > 0;
  const canCreateList = state.filters.source === 'all'
    ? (['inbound', 'outbound', 'warranty'] as Source[]).some(type => api.canCreate(type))
    : api.canCreate(state.filters.source);
  const createFromList = () => {
    const current = controller.snapshot();
    if (!api.scopeKey() || current.scope !== api.scopeKey() || current.panel !== 1) return;
    clearTimeout(searchTimer.current);
    setSearchText(current.filters.q);
    if (current.filters.source !== 'all') owner(current.filters.source);
    else if ((['inbound', 'outbound', 'warranty'] as Source[]).some(type => api.canCreate(type))) controller.create();
  };
  const updateListConditions = (patch: Partial<Filters>) => {
    const current = controller.snapshot();
    if (!api.scopeKey() || current.scope !== api.scopeKey() || current.panel !== 1) return;
    clearTimeout(searchTimer.current);
    const next = { ...current.filters, ...patch };
    setSearchText(next.q);
    controller.filters(next);
  };
  const listConditions: P16Condition[] = [];
  if (state.filters.q.trim()) listConditions.push({key:'q', label:'Từ khóa: ' + state.filters.q, onRemove:()=>updateListConditions({q:''})});
  if (state.filters.status !== 'all') listConditions.push({key:'status', label:'Trạng thái: ' + (
    (state.filters.status===STOCK_WAITING_WEB_FILTER?STOCK_WAITING_WEB_LABEL:undefined)??(state.list.data as MixedPage | undefined)?.mixed?.options.find(o=>o.value===state.filters.status)?.label ??
    (state.filters.source==='all' ? state.filters.status : canonicalStatusPresentation(state.filters.source,state.filters.status).label)
  ), onRemove:()=>updateListConditions({status:'all'})});
  if (state.filters.from || state.filters.to) listConditions.push({key:'date', label:'Ngày: ' + (state.filters.from || '…') + ' → ' + (state.filters.to || '…'), onRemove:()=>updateListConditions({from:'',to:''})});
  if (state.stockQueue) listConditions.push({key:'queue', label:STOCK_WAITING_WEB_LABEL, onRemove:()=>updateListConditions({})});
  const listPresenter = listState ? (
    <P16DataState
      kind={listState}
      scale={scale}
      availableHeight={Math.max(0, listViewportHeight - 42 * scale)}
      pending={state.list.status === 'loading'}
      retained={retainedListRows}
      sourceLabel={state.filters.source === 'all' ? 'Tất cả' : names[state.filters.source]}
      canCreate={canCreateList}
      onCreate={createFromList}
      createLabel={state.filters.source==='all'?'Tạo chứng từ':'Tạo ' + names[state.filters.source]}
      query={state.filters.q}
      conditions={listConditions}
      onClear={()=>updateListConditions({...initialFilters(),source:controller.snapshot().filters.source})}
      onEditQuery={()=>queryRef.current?.focus()}
      onAdjustFilters={()=>openFilter('status')}
      onRetry={()=>{ controller.load(); }}
      retryLabel={retainedListRows?'Đọc lại từ trang đầu':'Thử đọc lại'}
      errorCode={state.list.code ?? null}
      errorMessage={state.list.error ?? null}
      onReadText={({title,text:message})=>setModal({kind:'reader',title,message})}
      onReadError={({code,message})=>setModal({kind:'reader',title:'Chi tiết lỗi đọc chứng từ',message:[code ? 'Mã lỗi: ' + code : null,message].filter(value=>value!==null).join('\n')})}
    />
  ) : null;
  const openSearchCamera = () => {
    Keyboard.dismiss();
    setScannedQuery('');
    setFieldError('');
    const ownerScope = api.scopeKey();
    if (!ownerScope) {
      setModal({kind:'notice', title:'Chưa mở được màn quét', message:'Cần xác nhận phiên và kho đọc chứng từ.'});
      return;
    }
    const request = {id: ++cameraSequence.current, scope: ownerScope,
      generation: getSessionGeneration(), filters: {...controller.snapshot().filters}};
    cameraRef.current = request;
    setCameraRequest(request);
  };
  const documentRow = (doc: Document) => (
    <P12DocumentRow key={doc.type+doc.id} doc={doc} scale={scale} layout={s} number={number(doc)}
      date={documentTime(doc.createdTimestamp??doc.createdAt??doc.source.created_at)}
      showPartner={state.filters.source==='all'} onReadNumber={()=>{
        const current=controller.snapshot();
        if(current.panel===1&&current.pendingQuery===undefined&&current.scope===api.scopeKey())reader('Mã chứng từ',number(doc));
      }}
      onOpen={()=>{
        const current = controller.snapshot();
        if (
          current.pendingQuery !== undefined ||
          current.scope !== api.scopeKey()
        )
          return;
        Keyboard.dismiss();
        clearTimeout(searchTimer.current);
        setSearchText(controller.snapshot().filters.q);
        controller.open(doc.type, doc.id);
      }}/>
  );
  function fileIsCurrent(file: File, parent: Document, context: string, generation: number) {
    const current = controller.snapshot(), currentParent = current.detail.data;
    if (!alive.current || (!appActive.current && !savingPicker.current) ||
      !context || api.scopeKey() !== context || current.scope !== context ||
      getSessionGeneration() !== generation || current.panel !== 2 || current.detail.status !== 'ready' ||
      current.files.status !== 'ready' || !currentParent ||
      currentParent.id !== parent.id || currentParent.type !== parent.type ||
      currentParent.warehouseId !== parent.warehouseId ||
      currentParent.source.version !== parent.source.version ||
      currentParent.source.deleted_at != null) return false;
    const id = file.attachment_id ?? file.id;
    const latest = current.files.data?.items.find(item => (item.attachment_id ?? item.id) === id);
    if (!id || !latest || fileRevision(latest) !== fileRevision(file) ||
      latest.status !== 'ACTIVE' || latest.can_download === false ||
      !previewMimeTypes.includes(latest.content_type) ||
      (parent.type === 'warranty' && latest.can_download !== true)) return false;
    if (parent.type === 'warranty' ? latest.warranty_case_id !== parent.id :
      latest.document_id !== parent.id || latest.document_type !== parent.type.toUpperCase()) return false;
    try {
      const rights = api.scope().rights;
      return parent.type === 'warranty'
        ? (rights.includes('warranty.view') || rights.includes('warranty.manage')) && rights.includes('documents.read') && rights.includes('warranty.pii.view')
        : rights.includes(parent.type + '.view');
    } catch { return false; }
  }
  function viewerIsCurrent(candidate: FileViewer) {
    return viewerRef.current === candidate && fileIsCurrent(candidate.file, candidate.parent, candidate.scope, candidate.generation);
  }
  function closeViewer() {
    viewerRef.current = undefined;
    setViewer(undefined);
    downloadController.current?.abort();
    cancelP12Save();
  }
  function openViewer(file: File) {
    const context = api.scopeKey(), generation = getSessionGeneration();
    if (!['android','ios','web'].includes(Platform.OS) || fileBusy || downloadLatch.current || !d ||
      !fileIsCurrent(file, d, context, generation)) return;
    const next = {parent:d,file,scope:context,generation};
    viewerRef.current = next;
    setViewer(next);
    close();
  }
  function readFileName(file: File) {
    const current=controller.snapshot(), id=file.attachment_id??file.id;
    if(!id || !d || current.panel!==2 || api.scopeKey()!==state.scope ||
      current.detail.data?.id!==d.id || current.detail.data?.type!==d.type ||
      !current.files.data?.items.some(item=>(item.attachment_id??item.id)===id&&fileRevision(item)===fileRevision(file))) return;
    reader('Tên tệp',file.file_name);
    readerReturn.current={scope:state.scope,generation:getSessionGeneration(),parentId:d.id,parentType:d.type,fileId:id,revision:fileRevision(file)};
  }
  const download = async (file: File) => {
    if (downloadLatch.current || fileBusy || !d ||
      !fileIsCurrent(file,d,state.scope,getSessionGeneration())) return;
    downloadLatch.current = true;
    const parent = d,
      context = api.scopeKey(),
      generation = getSessionGeneration(),
      c = new AbortController();
    const current = () => !c.signal.aborted && downloadController.current === c &&
      fileIsCurrent(file,parent,context,generation);
    downloadController.current = c;
    setFileBusy(true);
    close();
    try {
      const result = await api.download(parent, file, c.signal);
      if (!current()) return;
      savingPicker.current = true;
      const saved = await saveP12Binary(result.blob, result.name, result.mime);
      if (!current()) return;
      setModal({
        kind: 'saved',
        uri: saved.uri,
        message: p12SaveMessage,
      });
    } catch (e) {
      if (
        current() &&
        (e as { code?: string }).code !== 'P12_SAVE_CANCELLED'
      )
        setModal({
          kind: 'notice',
          title: 'Chưa tải được chứng từ',
          message: (e as Error).message,
        });
    } finally {
      savingPicker.current = false;
      if (alive.current) setFileBusy(false);
      downloadController.current = null;
      downloadLatch.current = false;
    }
  };
  function info() {
    if (!d) return null;
    const r = d.source,
      ownerInfo = ownerProjectionPresentation(d),
      warrantyInfo = d.type === 'warranty' ? warrantyOwnerPresentation(d) : null,
      note = r.free_text_redacted
        ? 'Nội dung ghi chú được bảo vệ theo quyền'
        : d.note ?? r.note ?? r.description;
    const infoRow = (
      label: string,
      value: unknown,
      accessory?: React.ReactNode,
      content?: React.ReactNode,
      readerDetails?: string | null,
    ) => (
      <View style={[s.infoRow, label === 'Kho' && s.lockedRow]} key={label}>
        <Text style={s.infoLabel}>{label}</Text>
        <Pressable
          style={s.fill}
          accessibilityRole="button"
          accessibilityLabel={'Đọc đầy đủ ' + label}
          onPress={() =>
            reader(
              label,
              readerDetails
                ? `${value == null ? '—' : text(value)}\n\n${readerDetails}`
                : value,
            )
          }
        >
          {content ?? (
            <Text numberOfLines={2} style={s.infoValue}>
              {value == null ? '—' : text(value)}
            </Text>
          )}
        </Pressable>
        {accessory}
      </View>
    );
    return (
      <>
        <View style={s.infoSection}>
          <Text style={s.heading}>Thông tin chung</Text>
          {infoRow(
            'Mã chứng từ',
            number(d),
            <Pressable
              style={s.copyButton}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Sao chép mã chứng từ"
              onPress={() => {
                copyNumber();
              }}
            >
              <SvgXml
                width={20 * scale}
                height={20 * scale}
                xml={
                  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${HN_UI.primary}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v12h5"/></svg>`
                }
              />
            </Pressable>,
          )}
          {infoRow('Loại chứng từ', names[d.type])}
          {infoRow(
            'Kho',
            warrantyInfo?.warehouse ?? raw(r.warehouse).name ?? raw(r.warehouse).code ?? d.warehouseId,
            <View testID="P12.warehouse.lock" style={s.copyButton}>
              <P04Icon name="lock" size={18 * scale} color={HN_UI.textMuted} />
            </View>,
          )}
          {infoRow(
            d.type === 'inbound'
              ? 'Nhà cung cấp'
              : d.type === 'warranty'
              ? 'Khách hàng'
              : 'Đối tác',
            r.customer_name_redacted || r.free_text_redacted
              ? 'Thông tin được bảo vệ theo quyền'
              : d.partnerSnapshot
              ? documentPartnerLabel(d)
              : d.type === 'inbound'
              ? ownerInfo.supplier
              : d.type === 'outbound'
              ? r.recipient_name
              : r.customer_name,
          )}
          {d.type === 'inbound' && !d.partnerSnapshot && ownerInfo.supplierNote ? (
            <Text style={s.muted}>{ownerInfo.supplierNote}</Text>
          ) : null}
          {d.type === 'outbound' ? (
            <>
              {infoRow(
                'Người nhận',
                r.free_text_redacted
                  ? 'Thông tin được bảo vệ theo quyền'
                  : r.recipient_name_snapshot ?? r.recipient_name,
              )}
              {infoRow(
                'Điện thoại',
                r.free_text_redacted
                  ? 'Thông tin được bảo vệ theo quyền'
                  : r.recipient_phone_snapshot ?? r.recipient_contact_phone,
              )}
              {infoRow(
                'Địa chỉ',
                r.free_text_redacted
                  ? 'Thông tin được bảo vệ theo quyền'
                  : r.recipient_address_snapshot ?? r.recipient_address,
              )}
            </>
          ) : null}
          {infoRow(
            'Ngày tạo',
            documentTime(d.createdTimestamp ?? d.createdAt ?? r.created_at),
          )}
          {infoRow(
            warrantyInfo?.creatorLabel ?? 'Người tạo',
            r.free_text_redacted
              ? 'Thông tin được bảo vệ theo quyền'
              : d.type === 'warranty'
              ? warrantyInfo?.creator
              : ownerInfo.creator,
            undefined,
            undefined,
            d.type !== 'warranty' && !r.free_text_redacted
              ? ownerInfo.creatorNote
              : warrantyInfo?.creatorNote,
          )}
          {infoRow(
            'Trạng thái',
            documentStatusPresentation(d).label,
            undefined,
            <View style={s.statusValue}>{badge(d, true)}</View>,
          )}
          {d.webHandoff&&<View testID="P12.persisted-handoff">
            {infoRow('Ghi nhận gửi Web',documentTime(d.webHandoff.submittedAt))}
            {infoRow('Phiên bản đã gửi',d.webHandoff.submittedVersion)}
            {infoRow('Phiên bản nguồn hiện tại',d.webHandoff.currentVersion)}
            {d.webHandoff.versionMatch===false&&<Text style={s.muted}>Phiên bản hiện tại chưa được xác nhận đã gửi. Đối chiếu lại phiên bản chứng từ.</Text>}
            <Text style={s.muted}>Thông tin ghi nhận gửi từ App; chưa xác nhận Web đã tiếp nhận.</Text>
          </View>}
          <View style={s.noteCard} testID="P12.note">
            <Text style={s.noteTitle}>Ghi chú</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đọc đầy đủ ghi chú"
                onPress={() => reader('Ghi chú · ' + number(d), note)}
              >
                <Text numberOfLines={2} style={s.noteValue}>
                  {note == null
                    ? '—'
                    : note === ''
                    ? 'Chưa có ghi chú.'
                    : text(note)}
                </Text>
              </Pressable>
              {typeof note === 'string' &&
              (Array.from(note).length > 60 || note.split('\n').length > 2)
                ? link('Xem đầy đủ ghi chú', () =>
                    reader('Ghi chú · ' + number(d), note),
                  )
                : null}
          </View>
        </View>
        {files(true)}
      </>
    );
  }
  function products() {
    if(d?.type==='warranty') {
      let source;
      try { source=warrantyIntakeSource(d); } catch {
        return <Text style={s.error}>Chưa xác minh được nguồn sản phẩm tiếp nhận.</Text>;
      }
      if(!source || source.availability!=='RECORDED') return <Text style={s.muted}>Chưa có snapshot sản phẩm tại thời điểm tiếp nhận.</Text>;
      const fields=[['Sản phẩm',source.sku_name],['SKU',source.sku_code],['Serial',source.serial_number],
        ['Mã tạm',source.temporary_item_code],['Tiếp nhận lúc',time(source.captured_at)]];
      return <View style={s.infoSection}>
        <Text style={s.heading}>Sản phẩm tiếp nhận</Text>
        {fields.map(([label,value])=><View key={String(label)} style={s.infoRow}>
          <Text style={s.infoLabel}>{String(label)}</Text><Text selectable style={s.infoValue}>{value==null?'—':String(value)}</Text>
        </View>)}
        <Text style={s.muted}>Bản chụp lúc tiếp nhận bảo hành</Text>
      </View>;
    }
    const slot = state.scans,
      sum = slot.data?.summary;
    const scopeLabel = {
      ACTIVE: 'Hiện hành',
      REMOVED: 'Đã loại',
      ALL: 'Tất cả',
    }[state.scanStatus];
    return (
      <>
        <View style={s.row}>
          <Text style={[s.heading, s.fill]}>Sản phẩm</Text>
          <Text style={s.countBadge}>{productView.groups.length} dòng đã tải</Text>
        </View>
        <View style={s.row}>
          <View style={[s.control, s.fill]}>
            <P04Icon name="search" size={22 * scale} />
            <TextInput
              ref={queryRef}
              accessibilityLabel="Tìm trong mã đã tải"
              placeholder="Tìm mã, tên trong phần đã tải…"
              placeholderTextColor={HN_UI.textMuted}
              value={state.query}
              onChangeText={value => controller.search(value)}
              style={s.input}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Nhập mã tìm trong phần đã tải"
            style={s.productScan}
            onPress={() => {
              Keyboard.dismiss();
              setScannedQuery(state.query);
              setFieldError('');
              setModal({ kind: 'product-search' });
            }}
          >
            <P04Icon name="scan" size={24 * scale} />
          </Pressable>
        </View>
        {status(slot, () => {
          controller.child('products');
        })}
        {sum ? (
          <>
            <View style={s.totals}>
              <View style={s.total}>
                <Text style={s.muted}>Tổng lượng quét</Text>
                <Text style={s.quantity}>{sum.quantity_total ?? '—'}</Text>
              </View>
              <View style={s.total}>
                <Text style={s.muted}>Số SKU nguồn</Text>
                <Text style={s.quantity}>{sum.sku_count}</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Phạm vi bằng chứng"
              onPress={() => setModal({ kind: 'product-filter' })}
              style={s.productScope}
            >
              <Text style={s.muted}>
                {productView.loaded}/{productView.total ?? '—'} mã đã tải ·{' '}
                {scopeLabel}
                {state.query
                  ? ' · ' + productView.groups.length + ' thẻ khớp'
                  : ''}
              </Text>
              <P04Icon name="info" size={18 * scale} />
            </Pressable>
            {!productView.complete ||
            sum.quantity_complete !== true ||
            sum.unit_complete !== true ||
            sum.mixed_units ? (
              <Text style={s.muted}>
                Chưa đủ bằng chứng hoặc khác đơn vị: không thay lượng thiếu
                bằng0.{' '}
                {sum.quantity_by_unit
                  .map(
                    g =>
                      (g.unit?.trim() || 'Chưa rõ ĐVT') +
                      ': ' +
                      (g.quantity ?? '—'),
                  )
                  .join(' · ')}
              </Text>
            ) : null}
            {sum.coverage === 'LEGACY_CACHE_PENDING_REFRESH' ? (
              <>
                <Text style={s.muted}>
                  Dữ liệu legacy đang chờ cập nhật từ nguồn.
                </Text>
                {link('Thử đọc lại', () => {
                  controller.child('products');
                })}
              </>
            ) : null}
            {productView.groups.map(group => (
              <Pressable
                key={group.key}
                accessibilityRole="button"
                accessibilityLabel={
                  'Bằng chứng SKU ' + (group.code ?? 'chưa xác minh')
                }
                onPress={() =>
                  reader(
                    'Bằng chứng SKU',
                    group.rows
                      .map(
                        row =>
                          'SKU: ' +
                          text(row.sku_code) +
                          '\nTên: ' +
                          text(row.sku_name) +
                          '\nMã gốc: ' +
                          text(row.raw_code) +
                          '\nSerial đã xác minh: ' +
                          text(row.serial_number) +
                          '\nCandidate chưa xác minh: ' +
                          text(row.candidate_serial_number) +
                          '\nLượng nguồn: ' +
                          (row.quantity ?? '—') +
                          ' ' +
                          text(row.unit),
                      )
                      .join('\n\n'),
                  )
                }
                style={[s.card, s.productRow]}
              >
                <ProductPhoto
                  style={s.productImage}
                  uri={group.skuId ? productPhotos[group.skuId] : undefined}
                  size={34 * scale}
                />
                <View style={s.fill}>
                  <Text numberOfLines={2} style={s.strong}>
                    {group.name ?? 'Chưa rõ tên SKU'}
                  </Text>
                  <Text numberOfLines={1} style={s.muted}>
                    {group.code ?? 'Chưa rõ mã SKU'}
                  </Text>
                  <Text style={s.muted}>
                    {group.serialCount} serial{' '}
                    {group.complete ? 'đã xác minh' : 'đã tải'}
                  </Text>
                </View>
                <View style={s.productQty}>
                  <Text style={s.muted}>SL quét</Text>
                  <Text style={s.productQtyValue}>{group.quantity ?? '—'}</Text>
                  <Text numberOfLines={2} style={s.muted}>
                    {group.unit ??
                      (group.mixedUnits ? 'Nhiều ĐVT' : 'Chưa rõ ĐVT')}
                  </Text>
                </View>
                <P04Icon name="chevron" size={16 * scale} />
              </Pressable>
            ))}
            {!productView.groups.length ? (
              <Text style={s.muted}>
                {state.query
                  ? 'Không có mã/tên khớp trong phần đã tải.'
                  : 'Nguồn không trả bằng chứng phù hợp.'}
              </Text>
            ) : null}
            {canMore(slot.data)
              ? link('Tải thêm mã', () => {
                  controller.moreChild();
                })
              : null}
          </>
        ) : null}
      </>
    );
  }
  function openAttachmentList() {
    const current=controller.snapshot(),parent=current.detail.data;
    if(!alive.current || !appActive.current || !parent || current.panel!==2 ||
      current.detail.status!=='ready' || !scope || api.scopeKey()!==current.scope ||
      parent.id!==d?.id || parent.type!==d.type) return;
    setAttachmentList({parentId:parent.id,parentType:parent.type,scope:current.scope,
      generation:getSessionGeneration(),returnTab:current.tab,epoch:++attachmentEpoch.current,parentVersion:parent.source.version});
    controller.tab('files');
  }
  function readAttachmentDocument(entry: AttachmentListEntry, parent: Document) {
    const current=controller.snapshot(),latest=current.detail.data;
    if(!alive.current || !appActive.current || entry.epoch!==attachmentEpoch.current ||
      api.scopeKey()!==entry.scope || current.scope!==entry.scope ||
      getSessionGeneration()!==entry.generation || current.panel!==2 || current.tab!=='files' ||
      current.detail.status!=='ready' || !latest || latest.id!==entry.parentId ||
      latest.type!==entry.parentType || latest.warehouseId!==parent.warehouseId ||
      latest.source.version!==entry.parentVersion || latest.source.deleted_at!=null) return;
    try {
      const rights=api.scope().rights;
      if(parent.type==='warranty'
        ? !rights.includes('warranty.view')&&!rights.includes('warranty.manage')
        : !rights.includes(parent.type+'.view')) return;
    } catch {return;}
    reader('Mã chứng từ',number(latest));
  }
  function files(preview = false, standalone = false) {
    const slot = state.files;
    return (
      <View testID={preview ? 'P12.files.preview' : 'P18.S01'} style={s.filesGroup}>
        <View style={s.row}>
          <Text style={[s.heading, s.fill]}>
            {standalone ? 'Danh sách tệp đính kèm' : preview ? 'Tài liệu đính kèm' : 'Tài liệu'}
            {slot.data?.paging.total != null
              ? ' (' + slot.data.paging.total + ')'
              : ''}
          </Text>
          {preview
            ? link('Xem tất cả tài liệu →', openAttachmentList)
            : !standalone ? link('Mở danh sách tệp',openAttachmentList) : null}
        </View>
        {status(slot, () => {
          controller.child('files');
        })}
        {slot.data ? (
          <>
            <Text style={s.fileMeta}>Đã tải {slot.data.items.length} tài liệu</Text>
            {!slot.data.items.length ? (
              <View style={s.card}>
                <Text style={s.muted}>{slot.data.paging.total === 0 ? 'Nguồn trả về không có tài liệu.' : 'Chưa có dòng tài liệu để hiển thị; chưa xác minh nguồn rỗng.'}</Text>
              </View>
            ) : (
              (preview ? slot.data.items.slice(0, 2) : slot.data.items).map(
                f => {
                  const pdf = f.content_type === 'application/pdf';
                  const image = typeof f.content_type === 'string' && f.content_type.startsWith('image/');
                  const kind = ({'application/pdf':'PDF','image/png':'PNG','image/jpeg':'JPEG','image/webp':'WebP'} as Record<string,string>)[f.content_type] ?? 'TỆP';
                  const enabled = !!d && !fileBusy && fileIsCurrent(f,d,state.scope,getSessionGeneration());
                  return (
                  <View
                    key={f.id ?? f.attachment_id}
                    testID={'P12.file.' + (f.attachment_id ?? f.id)}
                    style={s.fileRow}
                  >
                    <View style={[s.fileTile,pdf?s.filePdfTile:image?s.fileImageTile:s.fileOtherTile]} accessible={false}>
                      {image ? <AppIcon name="image" size={30 * scale} color={HN_UI.textLink}/> : <P04Icon name="document" size={30 * scale} color={pdf?HN_UI.danger:HN_UI.textMuted}/>}
                      <Text style={[s.fileTileText,pdf?s.filePdfText:image?s.fileImageText:s.fileOtherText]}>{kind}</Text>
                    </View>
                    <View style={s.fill}>
                      <Pressable
                        style={s.fileNameButton}
                        ref={node=>{
                          const id=f.attachment_id??f.id;
                          if(id) {if(node)fileNameTriggers.current.set(id,node);else fileNameTriggers.current.delete(id);}
                        }}
                        onPress={() => readFileName(f)}
                        accessibilityRole="button"
                        accessibilityLabel={'Tài liệu ' + text(f.file_name)}
                      >
                        <Text numberOfLines={2} style={s.fileName}>{text(f.file_name)}</Text>
                      </Pressable>
                      <Text style={s.fileMeta}>
                        {fileMetadataText(f)}
                      </Text>
                      {f.status !== 'ACTIVE' ? (
                        <Text style={s.muted}>{f.status}</Text>
                      ) : null}
                      <View style={s.fileActions}>
                        {!standalone && <>
                        <Pressable accessibilityRole="button" accessibilityLabel={'Xem ' + text(f.file_name)}
                          style={[s.fileAction,!enabled&&s.fileDisabled]} disabled={!enabled}
                            onPress={()=>{if(!d||!fileIsCurrent(f,d,state.scope,getSessionGeneration()))return; if(Platform.OS==='android'||Platform.OS==='ios')openViewer(f);else setModal({kind:'file',file:f});}}>
                            <Text style={s.fileActionText}>{Platform.OS==='android'||Platform.OS==='ios'?'Xem':'Chi tiết'}</Text>
                        </Pressable>
                        </>}
                        <Pressable accessibilityRole="button" accessibilityLabel={'Tải ' + text(f.file_name)}
                          style={[s.fileAction,!enabled&&s.fileDisabled]} disabled={!enabled}
                          onPress={()=>{if(d&&fileIsCurrent(f,d,state.scope,getSessionGeneration()))setModal({kind:'file',file:f});}}>
                          <P04Icon name="down" size={18 * scale} color={HN_UI.textLink}/>
                          <Text style={s.fileActionText}>Tải xuống</Text>
                        </Pressable>
                      </View>
                    </View>
                    {standalone && <Pressable accessibilityRole="button" accessibilityLabel={'Tác vụ tệp '+text(f.file_name)}
                      style={s.fileMenu} onPress={()=>{if(d&&fileIsCurrent(f,d,state.scope,getSessionGeneration()))setModal({kind:'file',file:f});}}
                      disabled={!enabled}>
                      <Text style={s.fileMenuText}>⋮</Text>
                    </Pressable>}
                  </View>
                );},
              )
            )}
            {!preview && canMore(slot.data)
              ? link('Tải thêm tài liệu', () => {
                  controller.moreChild();
                })
              : null}
          </>
        ) : null}
      </View>
    );
  }
  function events() {
    const t = d?.p12.timeline,
      slot = state.events;
    let proof: ReturnType<typeof futureMilestones> = null;
    try { if(d) proof=futureMilestones(d); } catch { /* Keep legacy timeline; never display unverified proof. */ }
    const availability = {
      RECORDED: 'Đã ghi nhận',
      NOT_RECORDED: 'Chưa có thời điểm ghi nhận',
      SOURCE_MAPPING_PENDING: 'Chờ xác minh nguồn',
      NOT_APPLICABLE: 'Không áp dụng cho bảo hành',
    };
    const rail = (checked: boolean, last: boolean) => (
      <View style={s.timelineRail}>
        {!last && <View style={s.timelineLine} />}
        <View
          style={[s.timelinePoint, checked && s.timelineChecked]}
          accessibilityLabel={checked ? 'Mốc ghi sổ có nguồn' : 'Mốc thời gian'}
        >
          <SvgXml
            width={14 * scale}
            height={14 * scale}
            xml={
              checked
                ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${HN_UI.success}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4 10-10"/></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${HN_UI.textMuted}" stroke-width="2"><circle cx="12" cy="12" r="7"/></svg>`
            }
          />
        </View>
      </View>
    );
    return (
      <>
        <Text style={s.heading}>Lịch sử chứng từ</Text>
        {d?.p12.status.canonical === 'POSTED' && d.type !== 'warranty' ? (
          <View style={s.historyBanner}>
            <Text style={s.historyCheck}>✓</Text>
            <View style={s.fill}>
              <Text style={s.strong}>Trạng thái hiện tại: Đã ghi sổ</Text>
              <Text style={s.muted}>
                Phiếu hiện đã được ghi sổ trên Web.
              </Text>
            </View>
          </View>
        ) : null}
        {t ? (
          <View style={[s.card, s.timelineCard]}>
            {[
              ['created', 'Tạo chứng từ'],
              ['checked', 'Kiểm tra sản phẩm'],
              ['sent_to_web', 'Gửi phiếu lên Web'],
              ['posted', 'Đã ghi sổ'],
            ].map(([key, label], i) => {
              const milestone = proof?.[key] ?? t.milestones[key],
                recorded =
                  milestone.availability === 'RECORDED' &&
                  !!milestone.occurred_at &&
                  !!milestone.timestamp_source;
              return (
                <View key={key} style={s.timelineRow}>
                  {rail(key === 'posted' && recorded, i === 3)}
                  <View style={s.timelineContent}>
                    <Text style={s.strong}>{label}</Text>
                    <Text style={s.muted}>
                      {recorded
                        ? time(milestone.occurred_at)
                        : availability[milestone.availability]}
                    </Text>
                    <Text
                      style={s.muted}
                      accessibilityLabel={proof?.[key]?.actor?.name_snapshot ? 'Người thực hiện tại thời điểm sự kiện' : 'Người thực hiện mốc này chưa được nguồn cung cấp'}
                    >
                      {proof?.[key]?.actor?.name_snapshot ?? '—'}
                    </Text>
                    {proof?.[key]?.actor?.job_title_snapshot ? <Text style={s.muted}>{proof[key].actor?.job_title_snapshot}</Text> : null}
                    {proof?.[key]?.description ? <Text style={s.muted}>{futureEventDescription(proof[key].description!)}</Text> : null}
                    {key === 'sent_to_web' && recorded &&
                    t.contract === P12_TIMELINE_CONTRACT ? (
                      <Text style={s.muted}>
                        Yêu cầu gửi đã được ghi nhận; chưa phải xác nhận tiếp nhận từ Web.
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={s.error}>Chưa xác minh được các mốc thời gian.</Text>
        )}
        {status(slot, () => {
          controller.child('events');
        })}
        {slot.data?.items.length ? (
          link('Xem lịch sử chi tiết', () =>
            reader(
              'Lịch sử chi tiết',
              slot.data!.items
                .map(e => {
                  const key = e.label ?? e.event_type,
                    actor = e.actorId ?? raw(e.actor).user_id,
                    message = e.message_redacted
                      ? 'Nội dung được bảo vệ theo quyền'
                      : e.message;
                  const title = timelineEventTitle(key, d?.type);
                  return [
                    title,
                    title === 'Hoạt động khác (chưa có nhãn)' &&
                    typeof key === 'string'
                      ? 'Mã thao tác: ' + key
                      : '',
                    time(e.at ?? e.event_at),
                    typeof actor === 'string' && actor
                      ? 'Mã người thực hiện: ' + actor
                      : 'Chưa có thông tin người thực hiện',
                    typeof message === 'string' ? message : '',
                  ]
                    .filter(Boolean)
                    .join('\n');
                })
                .join('\n\n'),
            ),
          )
        ) : null}
        {slot.status === 'ready' && !slot.data?.items.length ? (
          <Text style={s.muted}>Nguồn sự kiện trả về rỗng.</Text>
        ) : null}
        {canMore(slot.data)
          ? link('Tải thêm sự kiện', () => {
              controller.moreChild();
            })
          : null}
      </>
    );
  }
  const modalTitle =
    modal?.kind === 'reader' || modal?.kind === 'notice'
      ? modal.title
      : modal?.kind === 'filter'
      ? modal.section === 'date'
        ? 'Lọc theo thời gian'
        : 'Trạng thái chứng từ'
      : modal?.kind === 'search'
      ? 'Tìm bằng mã chứng từ'
      : modal?.kind === 'document-actions'
      ? 'Tác vụ chứng từ'
      : modal?.kind === 'business-date'
      ? 'Ngày chứng từ'
      : modal?.kind === 'product-search'
      ? 'Tìm trong bằng chứng đã tải'
      : modal?.kind === 'product-filter'
      ? 'Phạm vi bằng chứng'
      : modal?.kind === 'supplier'
      ? 'Nhà cung cấp'
      : modal?.kind === 'file'
      ? 'Tài liệu chứng từ'
      : modal?.kind === 'saved'
      ? p12SaveTitle
      : '';
  if (scannerActive && cameraRequest) {
    const request = cameraRequest;
    const cancelCamera = () => {
      cameraRef.current = undefined;
      setCameraRequest(undefined);
    };
    const stillCurrent = () =>
      alive.current &&
      appActive.current &&
      cameraRef.current?.id === request.id &&
      api.scopeKey() === request.scope &&
      getSessionGeneration() === request.generation;
    return (
      <DocumentSearchCamera
        disabled={!foreground}
        onCancel={cancelCamera}
        onManual={() => {
          if (!stillCurrent()) {
            cancelCamera();
            return;
          }
          cancelCamera();
          setScannedQuery('');
          setFieldError('');
          setModal({ kind: 'search' });
        }}
        onRead={codeValue => {
          if (!stillCurrent()) return false;
          const query = documentScanQuery(codeValue);
          if ('error' in query) return false;
          // Consume before dispatch, including before a second native callback.
          cancelCamera();
          clearTimeout(searchTimer.current);
          setSearchText(query.value);
          controller.filters({ ...request.filters, q: query.value });
          return true;
        }}
      />
    );
  }
  if (viewer && viewerActive)
    return (
      <>
      <P18ViewerScreen
        name={viewer.file.file_name ?? 'Tài liệu'}
        fileSize={viewer.file.file_size_bytes}
        ownerKey={JSON.stringify([
          viewer.scope,
          viewer.parent.type,
          viewer.parent.id,
          viewer.file.id ?? viewer.file.attachment_id,
          fileRevision(viewer.file),
        ])}
        isCurrent={() => viewerIsCurrent(viewer)}
        load={signal => viewerIsCurrent(viewer)
          ? api.download(viewer.parent, viewer.file, signal)
          : Promise.reject(new Error('Tài liệu hoặc quyền đọc đã thay đổi.'))}
        onDownload={!fileBusy && viewerActive ? ()=>{
          if(viewerIsCurrent(viewer) && !downloadLatch.current) download(viewer.file);
        } : undefined}
        onBack={()=>{back();}}
      />
      <Dialog visible={modal?.kind==='saved'||modal?.kind==='notice'} title={modalTitle}
        onDismiss={close} dismissOnBackdrop={false}
        footer={<Button label={modal?.kind==='saved'?'Đã hiểu':'Đóng'} onPress={close}/>}
      >
        {modal?.kind==='saved' ? <View style={s.modalGap}>
          <Text style={s.ink}>{modal.message}</Text>
          <Button label="Mở tệp" onPress={()=>{
            if(!viewerIsCurrent(viewer))return;
            openP12File(modal.uri).catch(e=>{if(viewerIsCurrent(viewer))setModal({kind:'notice',title:'Chưa mở được tệp',message:e.message});});
          }}/>
        </View> : modal?.kind==='notice' ? <Text style={s.ink}>{modal.message}</Text> : null}
      </Dialog>
      </>
    );
  return (
    <SafeAreaView
      edges={['top']}
      style={s.root}
      testID={attachmentActive ? 'P18.attachments.full' : 'P12.S0' + state.panel}
    >
      <View style={s.header}>
        <Pressable
          style={s.back}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          onPress={back}
        >
          <View style={s.backArrow}>
            <P04Icon name="arrow" size={28 * scale} color={HN_UI.onBrand} />
          </View>
        </Pressable>
        <Text
          numberOfLines={attachmentActive ? 2 : undefined}
          style={[
            s.title,
            state.panel !== 1 && state.panel !== 4 && s.detailTitle,
            attachmentActive && s.attachmentTitle,
          ]}
        >
          {attachmentActive && d ? 'Tệp đính kèm ' + number(d) : state.panel === 1
            ? 'Chứng từ'
            : state.panel === 4
            ? 'Tạo chứng từ'
            : state.panel === 3
            ? 'Chi tiết chứng từ'
            : 'Chi tiết chứng từ'}
        </Text>
        {state.panel === 1 &&
        (['inbound', 'outbound', 'warranty'] as Source[]).some(type =>
          api.canCreate(type),
        ) ? (
          <Pressable
            accessibilityLabel="Tạo chứng từ"
            accessibilityRole="button"
            style={[s.back, s.add]}
            onPress={() => {
              clearTimeout(searchTimer.current);
              setSearchText(controller.snapshot().filters.q);
              controller.create();
            }}
          >
            <Text style={s.addText}>+</Text>
          </Pressable>
        ) : !attachmentActive && state.panel !== 4 && state.panel !== 3 && d ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tác vụ chứng từ"
            style={s.back}
            onPress={() => setModal({ kind: 'document-actions' })}
          >
            <Text style={s.moreText}>•••</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={[s.body,attachmentActive && s.attachmentBody]}>
        {state.panel === 1 ? (
          <View style={s.dock}>
            <View style={s.row}>
              <View style={[s.control, s.fill]}>
                <P04Icon name="search" size={22 * scale} />
                <TextInput
                  placeholderTextColor={HN_UI.textMuted}
                  ref={queryRef}
                  value={searchText}
                  onChangeText={q => {
                    clearTimeout(searchTimer.current);
                    setSearchText(q);
                    controller.previewQuery(q);
                    const searchScope = api.scopeKey();
                    searchTimer.current = setTimeout(() => {
                      if (
                        alive.current &&
                        api.scopeKey() === searchScope &&
                        controller.snapshot().panel === 1
                      )
                        controller.filters({
                          ...controller.snapshot().filters,
                          q,
                        });
                    }, 300);
                  }}
                  onSubmitEditing={() => {
                    clearTimeout(searchTimer.current);
                    controller.filters({
                      ...controller.snapshot().filters,
                      q: searchText,
                    });
                  }}
                  accessibilityLabel="Tìm chứng từ"
                  placeholder="Tìm mã chứng từ, loại, đối tác…"
                  style={s.input}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Lọc theo trạng thái"
                style={s.filterButton}
                onPress={() => openFilter('status')}
              >
                <P04Icon name="funnel" size={26 * scale} color={HN_UI.onBrand} />
              </Pressable>
            </View>
            <View style={s.tabs}>
              {(['all', 'inbound', 'outbound', 'warranty'] as const).map(
                type => (
                  <React.Fragment key={type}>
                    {action(
                      type === 'all' ? 'Tất cả' : names[type],
                      () => {
                        clearTimeout(searchTimer.current);
                        Keyboard.dismiss();
                        controller.filters({
                          ...controller.snapshot().filters,
                          q: searchText,
                          source: type,
                          status: 'all',
                          from: '',
                          to: '',
                        });
                      },
                      state.filters.source === type,
                      type === 'all' ? 'Tất cả' : names[type],
                    )}
                  </React.Fragment>
                ),
              )}
            </View>
            <View style={s.row}>
              <Pressable
                style={[s.dateControl, s.fill]}
                accessibilityRole="button"
                accessibilityLabel="Lọc theo thời gian"
                onPress={() => openFilter('date')}
              >
                <P04Icon name="calendar" size={20 * scale} />
                <Text numberOfLines={1} style={[s.filterText, s.fill]}>
                  {state.filters.from
                    ? state.filters.from + ' → ' + state.filters.to
                    : 'Tất cả ngày'}
                </Text>
                <P04Icon name="chevron-down" size={16 * scale} />
              </Pressable>
            </View>
            <View style={s.listToolbar}>
              <View style={s.fill}>
                <Text style={s.countBadge}>
                  {state.list.data?.paging.total == null ? 'Chưa có tổng nguồn' : state.list.data.paging.total + ' kết quả'}
                </Text>
                {state.filters.status !== 'all' ? <Text numberOfLines={2} style={s.recordDate}>
                  {(state.filters.status===STOCK_WAITING_WEB_FILTER?STOCK_WAITING_WEB_LABEL:undefined)??(state.list.data as MixedPage | undefined)?.mixed?.options.find(o=>o.value===state.filters.status)?.label ??
                    (state.filters.source==='all' ? 'Trạng thái đã chọn' : canonicalStatusPresentation(state.filters.source,state.filters.status).label)}
                </Text> : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Quét mã để tìm chứng từ"
                style={s.scanShortcut} onPress={openSearchCamera}>
                <P04Icon name="scan" size={23 * scale}/>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={state.filters.sort==='desc'?'Mới nhất':'Cũ nhất'}
                style={s.sortControl} onPress={()=>{
                  Keyboard.dismiss(); clearTimeout(searchTimer.current);
                  controller.filters({...controller.snapshot().filters,q:searchText,sort:state.filters.sort==='desc'?'asc':'desc'});
                }}>
                <Text style={s.sortText}>{state.filters.sort==='desc'?'Mới nhất':'Cũ nhất'}</Text>
                <P04Icon name="chevron-down" size={16 * scale}/>
              </Pressable>
            </View>
          </View>
        ) : state.panel === 4 ? (
          <View style={s.steps} accessibilityLabel="Bước 1 trên 3: Thông tin">
            {['Thông tin','Thêm sản phẩm','Kiểm tra'].map((label,index)=><View key={label} style={s.step}>
              <Text style={[s.stepNumber,index===0&&s.stepNumberActive]}>{index+1}</Text>
              <Text style={[s.stepText,index===0&&s.stepTextActive]}>{label}</Text>
            </View>)}
          </View>
        ) : d && !attachmentActive ? (
          <>
            <View style={[s.context, s.row]}>
              {tile(d.type)}
              <View style={s.fill}>
                <Text numberOfLines={2} style={s.docTitle}>
                  {number(d)}
                </Text>
                <Text style={s.ink}>{names[d.type]}</Text>
                <Text style={s.muted}>
                  {documentTime(
                    d.createdTimestamp ?? d.createdAt ?? d.source.created_at,
                  )}
                </Text>
              </View>
              {badge(d, true)}
            </View>
              <View style={s.detailTabs}>
                {(['info', 'products', 'files', 'events'] as Tab[]).map(tab => (
                  <Pressable
                    key={tab}
                    accessibilityRole="tab"
                    accessibilityLabel={
                      {
                        info: 'Thông tin',
                        products: 'Sản phẩm',
                        files: 'Tài liệu',
                        events: 'Lịch sử',
                      }[tab]
                    }
                    accessibilityState={{ selected: state.tab === tab }}
                    onPress={() => {
                      Keyboard.dismiss();
                      clearTimeout(searchTimer.current);
                      setSearchText(controller.snapshot().filters.q);
                      controller.tab(tab);
                    }}
                    style={[
                      s.detailTab,
                      state.tab === tab && s.selectedDetailTab,
                    ]}
                  >
                    <Text style={[s.tabText, state.tab === tab && s.bold]}>
                      {
                        {
                          info: 'Thông tin',
                          products: 'Sản phẩm',
                          files: 'Tài liệu',
                          events: 'Lịch sử',
                        }[tab]
                      }
                    </Text>
                  </Pressable>
                ))}
              </View>
          </>
        ) : null}
        <ScrollView
          ref={scroll}
          style={s.scroll}
          key={scrollKey}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            s.content,
            state.panel === 1 && s.listContent,
            state.panel === 4 && s.createContent,
            attachmentActive && s.attachmentContent,
          ]}
          onLayout={event => {
            if (state.panel === 1) setListViewportHeight(event.nativeEvent.layout.height);
          }}
          onScroll={e =>
            controller.scroll(scrollKey, e.nativeEvent.contentOffset.y)
          }
          onMomentumScrollEnd={e =>
            controller.scroll(scrollKey, e.nativeEvent.contentOffset.y)
          }
          onScrollEndDrag={e =>
            controller.scroll(scrollKey, e.nativeEvent.contentOffset.y)
          }
          scrollEventThrottle={64}
          onContentSizeChange={() =>
            scroll.current?.scrollTo({
              y: controller.snapshot().scroll[scrollKey] ?? 0,
              animated: false,
            })
          }
        >
          {!scope ? (
            <View style={s.card}>
              <Text style={s.muted}>
                {identityError ?? 'Đang xác nhận phiên và quyền đọc…'}
              </Text>
              {identityError ? (
                link('Thử xác nhận lại', () => {
                  setIdentityError(undefined);
                  fetchCurrentUser()
                    .then(u => {
                      setIdentity(u);
                      onIdentity?.(u);
                    })
                    .catch(e => setIdentityError(e.message));
                })
              ) : (
                <ActivityIndicator />
              )}
            </View>
          ) : state.panel === 1 ? (
            <>
              {!retainedListRows ? listPresenter : null}
              {state.list.data?.items.map(documentRow)}
              {retainedListRows ? listPresenter : null}
              {state.list.status === 'ready' && !state.list.data?.items.length && state.list.data?.paging.total == null ? (
                <View testID="P12.list.totalUnknown" style={s.card}>
                  <Text style={s.ink}>Chưa có dòng chứng từ để hiển thị.</Text>
                  <Text style={s.muted}>Chưa xác minh được tổng nguồn; chưa thể kết luận nguồn rỗng.</Text>
                  <Button label="Thử đọc lại" onPress={()=>{ controller.load(); }}/>
                </View>
              ) : null}
              {canMore(state.list.data) && state.list.status !== 'error' ? (
                <Button
                  label={state.list.status === 'loading' ? 'Đang tải thêm…' : 'Tải thêm chứng từ'}
                  accessibilityLabel="Tải thêm chứng từ"
                  loading={state.list.status === 'loading'}
                  disabled={state.list.status === 'loading'}
                  onPress={() => {
                    controller.more();
                  }}
                />
              ) : null}
              {state.list.data?.items.length ? (
                <Text
                  style={s.muted}
                  accessibilityLabel="Tổng chứng từ và số đã tải"
                >
                  {state.list.data.paging.total == null
                    ? 'Chưa có tổng nguồn đầy đủ'
                    : state.list.data.paging.total +
                      (state.filters.source === 'warranty'
                        ? ' hồ sơ bảo hành'
                        : ' chứng từ')}
                  {' · Đã tải ' + state.list.data.items.length}
                </Text>
              ) : null}
            </>
          ) : state.panel === 4 ? (
            <>
              <Text style={s.createLabel}>Loại chứng từ</Text>
              <View style={s.createTypes}>
                {(['inbound', 'outbound', 'warranty'] as Source[])
                  .filter(type => api.canCreate(type))
                  .map(type => (
                    <Pressable
                      key={type}
                      accessibilityRole="button"
                      accessibilityState={{selected:type==='inbound'}}
                      accessibilityLabel={
                        type === 'inbound'
                          ? 'Chọn Nhập kho'
                          : 'Mở ' + names[type]
                      }
                      onPress={() => {
                        if (type !== 'inbound') owner(type);
                      }}
                      style={[
                        s.createType,
                        type === 'inbound' && s.createTypeSelected,
                      ]}
                    >
                      {type==='inbound' ? <Text style={s.createCheck}>✓</Text>:null}
                      <View style={[s.typeIcon,{backgroundColor:HN_OPERATIONS[type].soft}]}>
                        <P04Icon name={type==='inbound'?'down':type==='outbound'?'up':'tool'} size={28 * scale} color={HN_OPERATIONS[type].ink}/>
                      </View>
                      <Text
                        style={[
                          s.createTypeText,
                          type === 'inbound' && s.createTypeTextSelected,
                        ]}
                      >
                        {names[type]}
                      </Text>
                    </Pressable>
                  ))}
              </View>
              <Text style={s.heading}>Thông tin phiếu</Text>
              <View style={s.createMetaCard}>
                <View style={s.row}>
                  <View style={[s.typeIcon,s.typeIconMuted]}><P04Icon name="warehouse" size={24 * scale} color={HN_UI.textMuted}/></View>
                  <View style={s.fill}>
                    <Text style={s.createMetaLabel}>Kho thực hiện</Text>
                    <Text numberOfLines={2} style={s.strong}>
                      {identity?.available_warehouses?.find(w=>w.warehouse_id===getActiveSession()?.activeWarehouseId)?.name ?? getActiveSession()?.activeWarehouseId ?? 'Chưa xác nhận kho'}
                    </Text>
                  </View>
                  <P04Icon name="lock" size={19 * scale} color={HN_UI.textMuted}/>
                </View>
                <View style={s.createMetaDate}>
                  <Text style={[s.createLabel,s.fill]}>Ngày chứng từ<Text style={s.required}> *</Text></Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Chọn ngày chứng từ" style={s.dateValue} onPress={()=>{
                    Keyboard.dismiss(); setBusinessDateDraft(form.docDate ?? ''); setMonth((form.docDate || today()).slice(0,7)); setFieldError(''); setModal({kind:'business-date'});
                  }}><Text style={s.sortText}>{businessDateLabel(form.docDate)}</Text></Pressable>
                  {form.docDate ? <Pressable accessibilityRole="button" accessibilityLabel="Xóa ngày chứng từ" style={s.dateClear} onPress={()=>setForm(v=>({...v,docDate:undefined}))}><P04Icon name="x" size={18 * scale}/></Pressable>:null}
                </View>
              </View>
              <View style={s.createField}>
                <Text style={s.createLabel}>
                  Nhà cung cấp<Text style={s.required}> *</Text>
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Chọn nhà cung cấp"
                  style={s.control}
                  onPress={() => {
                    Keyboard.dismiss();
                    setSupplierDraft(undefined);
                    setSupplierQuery('');
                    setModal({ kind: 'supplier' });
                  }}
                >
                  <P04Icon name="warehouse" size={24 * scale} />
                  <Text numberOfLines={2} style={[s.ink, s.fill]}>
                    {form.supplierName || 'Chọn nhà cung cấp'}
                  </Text>
                  <P04Icon name="chevron" size={18 * scale} />
                </Pressable>
              </View>
              <View style={s.createField}>
                <View style={s.row}><Text style={[s.createLabel,s.fill]}>Ghi chú</Text><Text style={s.recordDate}>Không bắt buộc</Text></View>
                <View style={[s.control, s.createNoteControl]}>
                  <P04Icon name="document" size={24 * scale} />
                  <TextInput
                    placeholderTextColor={HN_UI.textMuted}
                    accessibilityLabel="Ghi chú chứng từ"
                    multiline
                    value={form.note}
                    onChangeText={note => setForm(v => ({ ...v, note }))}
                    placeholder="Thông tin cần lưu ý khi nhận hàng…"
                    style={[s.input, s.createNote]}
                  />
                </View>
                <Text style={s.createCounter}>
                  {Array.from(form.note).length}/1000 ký tự
                </Text>
              </View>
              {Array.from(form.note).length > 1000 ? (
                <Text style={s.error}>Ghi chú nhập kho tối đa 1000 ký tự.</Text>
              ) : null}
              {fieldError ? <Text style={s.error}>{fieldError}</Text> : null}
            </>
          ) : (
            <>
              {status(state.detail, () => {
                controller.retry();
              })}
              {d && state.detail.status === 'ready'
                ? attachmentActive ? <>
                    <View style={s.attachmentContext} testID="P18.attachment.context">
                      <Text style={s.heading}>Thông tin {names[d.type].toLowerCase()}</Text>
                      <View style={s.row}>
                        {tile(d.type)}
                        <View style={s.fill}>
                          <Pressable accessibilityRole="button" accessibilityLabel="Đọc mã chứng từ" onPress={()=>{if(attachmentList)readAttachmentDocument(attachmentList,d);}}>
                            <Text style={s.attachmentNumber} numberOfLines={2}>{number(d)}</Text>
                          </Pressable>
                          <Text style={s.fileMeta}>{documentTime(d.createdTimestamp ?? d.createdAt ?? d.source.created_at)}</Text>
                          <Text style={s.fileMeta} numberOfLines={2}>{d.source.free_text_redacted
                            ? 'Thông tin được bảo vệ theo quyền'
                            : text(d.type==='inbound' ? ownerProjectionPresentation(d).supplier : d.type==='outbound'
                              ? d.source.recipient_name_snapshot ?? d.source.recipient_name
                              : d.source.customer_name)}</Text>
                        </View>
                      </View>
                    </View>
                    {files(false,true)}
                  </> : state.tab === 'info'
                  ? info()
                  : state.tab === 'products'
                  ? products()
                  : state.tab === 'files'
                  ? files()
                  : events()
                : null}
            </>
          )}
        </ScrollView>
        {state.panel === 4 ? (
          <SafeAreaView edges={['bottom']} style={[s.footer, s.createFooter]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tiếp tục thêm sản phẩm"
              accessibilityHint="Chuyển thông tin sang owner Nhập kho để kiểm tra lại; chưa ghi phiếu tại màn này."
              disabled={
                Array.from(form.note).length > 1000 ||
                !scope ||
                !api.canCreate('inbound') ||
                !form.supplierId ||
                !validBusinessDate(form.docDate)
              }
              style={[s.primary, s.createPrimary]}
              onPress={() => owner('inbound')}
            >
              <Text style={s.primaryText}>Tiếp tục thêm sản phẩm</Text>
              <P04Icon name="arrow" size={23 * scale} color={HN_UI.onBrand} />
            </Pressable>
          </SafeAreaView>
        ) : null}
      </View>
      <Dialog
        visible={!!modal}
        title={modalTitle}
        onDismiss={close}
        dismissOnBackdrop={false}
        footer={
          modal?.kind === 'reader' ||
          modal?.kind === 'notice' ||
          modal?.kind === 'document-actions' ? (
            <Button label="Đóng" onPress={close} />
          ) : modal?.kind === 'business-date' ? (
            <View style={s.modalActions}>
              <Button
                label="Hủy"
                variant="secondary"
                style={s.half}
                onPress={close}
              />
              <Button
                label="Chọn ngày"
                style={s.half}
                onPress={() => {
                  if (!validBusinessDate(businessDateDraft)) {
                    setFieldError('Chọn ngày từ 01/01/2000 đến hôm nay.');
                    return;
                  }
                  setForm(v => ({ ...v, docDate: businessDateDraft }));
                  close();
                }}
              />
            </View>
          ) : modal?.kind === 'search' || modal?.kind === 'product-search' ? (
            <View style={s.modalActions}>
              <Button
                label="Hủy"
                variant="secondary"
                style={s.half}
                onPress={close}
              />
              <Button
                label={
                  modal.kind === 'search'
                    ? 'Tìm chứng từ'
                    : 'Tìm trong phần đã tải'
                }
                style={s.half}
                onPress={() => {
                  const query = documentScanQuery(scannedQuery);
                  if ('error' in query) {
                    setFieldError(query.error);
                    return;
                  }
                  const q = query.value;
                  if (modal.kind === 'product-search') controller.search(q);
                  else {
                    setSearchText(q);
                    controller.filters({ ...controller.snapshot().filters, q });
                  }
                  close();
                }}
              />
            </View>
          ) : modal?.kind === 'filter' ? (
            <View style={s.modalActions}>
              <Button
                label="Hủy"
                variant="secondary"
                style={s.half}
                onPress={close}
              />
              <Button label="Áp dụng" style={s.half} onPress={apply} />
            </View>
          ) : modal?.kind === 'supplier' ? (
            <View style={s.modalActions}>
              <Button
                label="Hủy"
                variant="secondary"
                style={s.half}
                onPress={close}
              />
              <Button
                label="Áp dụng"
                disabled={!supplierDraft}
                style={s.half}
                onPress={() => {
                  if (supplierDraft)
                    setForm(v => ({
                      ...v,
                      supplierId: text(supplierDraft.id),
                      supplierName: text(supplierDraft.name),
                    }));
                  close();
                }}
              />
            </View>
          ) : undefined
        }
        headerAccessory={
          modal?.kind === 'supplier' ? (
            <TextInput
              placeholderTextColor={HN_UI.textMuted}
              accessibilityLabel="Tìm nhà cung cấp"
              placeholder="Nhập tên nhà cung cấp"
              value={supplierQuery}
              onChangeText={setSupplierQuery}
              style={s.modalInput}
            />
          ) : undefined
        }
      >
        {modal?.kind === 'business-date' ? (
          <View style={s.modalGap}>
            <Text style={s.muted}>
              Ngày nghiệp vụ, không phải thời điểm tạo phiếu hay thời điểm quét.
            </Text>
            <TextInput
              accessibilityLabel="Ngày chứng từ YYYY-MM-DD"
              placeholder="YYYY-MM-DD"
              style={s.modalInput}
              value={businessDateDraft}
              onChangeText={value => {
                setBusinessDateDraft(value);
                setFieldError('');
              }}
            />
            {link('Hôm nay', () => {
              setBusinessDateDraft(today());
              setMonth(today().slice(0, 7));
              setFieldError('');
            })}
            <View style={s.row}>
              {link('Tháng trước', () => {
                const date = new Date(month + '-01T00:00:00Z');
                date.setUTCMonth(date.getUTCMonth() - 1);
                setMonth(date.toISOString().slice(0, 7));
              })}
              <Text style={s.fill}>{month}</Text>
              {link('Tháng sau', () => {
                const date = new Date(month + '-01T00:00:00Z');
                date.setUTCMonth(date.getUTCMonth() + 1);
                setMonth(date.toISOString().slice(0, 7));
              })}
            </View>
            <View style={s.calendar}>
              {p08CalendarDays(month).map((day, i) => (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={day ? 'Chọn ngày ' + day : 'Ô trống'}
                  disabled={!validBusinessDate(day ?? undefined)}
                  accessibilityState={{ selected: day === businessDateDraft }}
                  style={[s.day, day === businessDateDraft && s.selected]}
                  onPress={() => {
                    if (day) {
                      setBusinessDateDraft(day);
                      setFieldError('');
                    }
                  }}
                >
                  <Text
                    style={
                      !validBusinessDate(day ?? undefined)
                        ? s.disabledDay
                        : day === businessDateDraft
                        ? s.selectedText
                        : s.ink
                    }
                  >
                    {day?.slice(-2) || ''}
                  </Text>
                </Pressable>
              ))}
            </View>
            {fieldError ? <Text style={s.error}>{fieldError}</Text> : null}
          </View>
        ) : null}
        {modal?.kind === 'document-actions' && d ? (
          <View style={s.modalGap}>
            <Text style={s.muted}>
              {documentSnapshotCaption(d)}
            </Text>
            {d.type === 'inbound' ? (
              <Button
                label="Đọc nguồn nhập"
                variant="secondary"
                onPress={() =>
                  reader(
                    'Nguồn nhập',
                    d.source.free_text_redacted
                      ? 'Thông tin được bảo vệ theo quyền'
                      : d.source.source_reference ?? d.source.source_name,
                  )
                }
              />
            ) : null}
            <Button
              label="Sao chép mã"
              variant="secondary"
              onPress={() => {
                close();
                copyNumber();
              }}
            />
            <Button
              label="Tải lại thông tin"
              variant="secondary"
              onPress={() => {
                const target = d;
                close();
                controller.open(target.type, target.id);
              }}
            />
            <Button
              label="Xem tài liệu"
              variant="secondary"
              onPress={() => {
                close();
                controller.tab('files');
              }}
            />
          </View>
        ) : null}
        {modal?.kind === 'search' || modal?.kind === 'product-search' ? (
          <View style={s.modalGap}>
            <Text style={s.muted}>
              {modal.kind === 'search'
                ? 'Nhập mã từ đầu đọc hoặc bàn phím để tìm trên nguồn chứng từ. Không tạo hay ghi phiếu.'
                : 'Đầu đọc hoặc nhập tay; chỉ tìm trong bằng chứng đã tải. Không gọi resolver/scan ghi hoặc tạo phiếu.'}
            </Text>
            <TextInput
              accessibilityLabel={
                modal.kind === 'search'
                  ? 'Mã chứng từ từ đầu đọc'
                  : 'Mã sản phẩm từ đầu đọc'
              }
              placeholder="Nhập hoặc quét mã chứng từ"
              value={scannedQuery}
              onChangeText={setScannedQuery}
              style={s.modalInput}
              autoCapitalize="none"
            />
            {fieldError ? <Text style={s.error}>{fieldError}</Text> : null}
          </View>
        ) : null}
        {modal?.kind === 'product-filter' ? (
          <View style={s.modalGap}>
            <Text style={s.muted}>
              Tổng và số SKU lấy từ toàn bộ bộ lọc trên API. Thẻ SKU được gom từ
              phần đã tải; thiếu trang/quantity/unit/nguồn legacy thì lượng giữ
              —. Không phải snapshot đóng băng hay bằng chứng đã Post.
            </Text>
            {(['ACTIVE', 'REMOVED', 'ALL'] as const).map(value => (
              <Button
                key={value}
                label={
                  {
                    ACTIVE: 'Hiện hành',
                    REMOVED: 'Đã loại',
                    ALL: 'Tất cả bằng chứng',
                  }[value]
                }
                variant={state.scanStatus === value ? 'primary' : 'secondary'}
                onPress={() => {
                  controller.scanFilter(value);
                  close();
                }}
              />
            ))}
            <Button label="Đóng" variant="secondary" onPress={close} />
          </View>
        ) : null}
        {modal?.kind === 'reader' || modal?.kind === 'notice' ? (
          <>
            <Text selectable style={s.ink}>
              {modal.message}
            </Text>
          </>
        ) : null}
        {modal?.kind === 'filter' ? (
          <View style={s.modalGap}>
            {modal.section === 'date' ? (
              draft.source !== 'warranty' ? (
                <>
                  <Text style={s.strong}>Khoảng ngày · theo thời gian tạo</Text>
                  <View style={s.row}>
                    {link('Tất cả ngày', () =>
                      setDraft(v => ({ ...v, from: '', to: '' })),
                    )}
                    {link('Hôm nay', () =>
                      setDraft(v => ({ ...v, from: today(), to: today() })),
                    )}
                  </View>
                  {(['from', 'to'] as const).map(field => (
                    <View key={field}>
                      <Text>{field === 'from' ? 'Từ ngày' : 'Đến ngày'}</Text>
                      <View style={s.row}>
                        <TextInput
                          placeholderTextColor={HN_UI.textMuted}
                          accessibilityLabel={
                            field === 'from'
                              ? 'Từ ngày YYYY-MM-DD'
                              : 'Đến ngày YYYY-MM-DD'
                          }
                          value={draft[field]}
                          placeholder="YYYY-MM-DD"
                          onChangeText={v => {
                            setDraft(dv => ({ ...dv, [field]: v }));
                            setFieldError('');
                          }}
                          style={[s.modalInput, s.fill]}
                        />
                        {link(
                          'Lịch ' + (field === 'from' ? 'Từ' : 'Đến'),
                          () => {
                            setMonth((draft[field] || today()).slice(0, 7));
                            setCalendar(field);
                          },
                        )}
                      </View>
                    </View>
                  ))}
                  {calendar ? (
                    <>
                      <View style={s.row}>
                        {link('Tháng trước', () => {
                          const dte = new Date(month + '-01T00:00:00Z');
                          dte.setUTCMonth(dte.getUTCMonth() - 1);
                          setMonth(dte.toISOString().slice(0, 7));
                        })}
                        <Text>{month}</Text>
                        {link('Tháng sau', () => {
                          const dte = new Date(month + '-01T00:00:00Z');
                          dte.setUTCMonth(dte.getUTCMonth() + 1);
                          setMonth(dte.toISOString().slice(0, 7));
                        })}
                      </View>
                      {link('Hôm nay trong lịch', () =>
                        setMonth(today().slice(0, 7)),
                      )}
                      <View style={s.calendar}>
                        {p08CalendarDays(month).map((day, i) => (
                          <Pressable
                            key={i}
                            accessibilityLabel={day ?? 'Ô trống'}
                            disabled={
                              !day ||
                              day < p08MoveDay(today(), -90) ||
                              day > today()
                            }
                            style={s.day}
                            onPress={() => {
                              if (day)
                                setDraft(v => ({ ...v, [calendar]: day }));
                              setCalendar(undefined);
                            }}
                          >
                            <Text
                              style={
                                !day ||
                                day < p08MoveDay(today(), -90) ||
                                day > today()
                                  ? s.disabledDay
                                  : undefined
                              }
                            >
                              {day?.slice(-2) || ''}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  ) : null}
                </>
              ) : (
                <Text style={s.muted}>Bảo hành hiện lọc theo trạng thái.</Text>
              )
            ) : null}
            {modal.section === 'status' ? (
              <>
                <Text style={s.strong}>Trạng thái nguồn</Text>
                {(draft.source === 'all'
                  ? (
                      (state.list.data as MixedPage | undefined)?.mixed
                        ?.options ?? [
                        {
                          value: 'ALL',
                          label: 'Tất cả',
                          source: null,
                          source_status: null,
                        },
                      ]
                    ).map(o => ({
                      value: o.value === 'ALL' ? 'all' : o.value,
                      label: o.source
                        ? names[o.source.toLowerCase() as Source] +
                          ' · ' +
                          o.label
                        : 'Tất cả trạng thái',
                    }))
                  : [
                      'all',
                      ...(draft.source === 'warranty'
                        ? [
                            'RECEIVED',
                            'CHECKING',
                            'REPAIRING',
                            'COMPLETED',
                            'RETURNED',
                            'CANCELLED',
                          ]
                        : [STOCK_WAITING_WEB_FILTER,'DRAFT', 'SCANNING', 'POSTED', 'CANCELLED']),
                    ].map(value => ({
                      value,
                      label: value === 'all' ? 'Tất cả trạng thái' : value===STOCK_WAITING_WEB_FILTER?STOCK_WAITING_WEB_LABEL:canonicalStatusPresentation(draft.source as Source,value).label,
                    }))
                ).map(o => (
                  <Pressable
                    key={o.value}
                    onPress={() => setDraft(f => ({ ...f, status: o.value }))}
                    style={s.choice}
                    accessibilityRole="radio"
                    accessibilityLabel={'Trạng thái ' + o.value}
                    accessibilityState={{ checked: draft.status === o.value }}
                  >
                    <Text>
                      {draft.status === o.value ? '● ' : '○ '}
                      {o.label}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : null}
            {fieldError ? <Text style={s.error}>{fieldError}</Text> : null}
            {link('Đặt lại', () => {
              setDraft(v => ({
                ...v,
                ...(modal.section === 'status'
                  ? { status: 'all' }
                  : { from: '', to: '' }),
              }));
              setFieldError('');
            })}
          </View>
        ) : null}
        {modal?.kind === 'supplier' ? (
          <View style={s.modalGap}>
            {status(suppliers, () => setSupplierQuery(v => v + ' '))}
            {suppliers.data?.items.map(row => (
              <Pressable
                key={text(row.id)}
                onPress={() => setSupplierDraft(row)}
                style={s.choice}
                accessibilityRole="radio"
                accessibilityLabel={text(row.name)}
                accessibilityState={{ checked: supplierDraft?.id === row.id }}
              >
                <Text>
                  {supplierDraft?.id === row.id ? '● ' : '○ '}
                  {text(row.name)}
                </Text>
              </Pressable>
            ))}
            {suppliers.data ? (
              <Text>
                {suppliers.data.items.length}/{suppliers.data.paging.total} nhà
                cung cấp nguồn
              </Text>
            ) : null}
            {canMore(suppliers.data) && suppliers.status !== 'loading'
              ? link('Tải thêm nhà cung cấp', () => {
                  const previous = suppliers.data!;
                  const sequence = ++readSequence.current,
                    ownerScope = api.scopeKey(),
                    owner = getSessionGeneration();
                  setSuppliers({ status: 'loading', data: previous });
                  const current = () =>
                    alive.current &&
                    sequence === readSequence.current &&
                    owner === getSessionGeneration() &&
                    ownerScope === api.scopeKey();
                  api
                    .suppliers({
                      q: supplierQuery,
                      status: 'ACTIVE',
                      page: previous.paging.page! + 1,
                      per_page: 20,
                    })
                    .then(next => {
                      if (!current()) return;
                      setSuppliers({
                        status: 'ready',
                        data: {
                          ...next,
                          items: [
                            ...previous.items,
                            ...next.items.filter(
                              r => !previous.items.some(a => a.id === r.id),
                            ),
                          ],
                        },
                      });
                    })
                    .catch(e => {
                      if (!current()) return;
                      setSuppliers({
                        status: 'error',
                        data: previous,
                        error: e.message,
                      });
                    });
                })
              : null}
          </View>
        ) : null}
        {modal?.kind === 'file' ? (
          <View style={s.modalGap}>
            <Pressable accessibilityRole="button" accessibilityLabel="Đọc đầy đủ tên tệp" onPress={()=>readFileName(modal.file)}>
              <Text numberOfLines={2} style={s.fileName}>{text(modal.file.file_name)}</Text>
            </Pressable>
            <Text style={s.muted}>
              {fileMetadataText(modal.file)}
            </Text>
            <Text style={s.muted}>
              Tải tệp có sẵn và chọn vị trí lưu trên máy.
            </Text>
            {['android','ios','web'].includes(Platform.OS) ? (
              <Button
                label="Xem trong ứng dụng"
                variant="secondary"
                disabled={
                  fileBusy || !d || !fileIsCurrent(modal.file,d,state.scope,getSessionGeneration())
                }
                onPress={() => {
                  if (modal.kind === 'file') openViewer(modal.file);
                }}
              />
            ) : null}
            <View style={s.modalActions}>
              <Button
                label="Hủy"
                variant="secondary"
                style={s.half}
                onPress={close}
              />
              <Button
                label="Tải chứng từ"
                style={s.half}
                disabled={
                  fileBusy || !d || !fileIsCurrent(modal.file,d,state.scope,getSessionGeneration())
                }
                onPress={() => {
                  if (modal.kind === 'file') download(modal.file);
                }}
              />
            </View>
          </View>
        ) : null}
        {modal?.kind === 'saved' ? (
          <View style={s.modalGap}>
            <Text style={s.ink}>{modal.message}</Text>
            <Button
              label="Mở tệp"
              onPress={() => {
                openP12File(modal.uri).catch(e =>
                  setModal({
                    kind: 'notice',
                    title: 'Chưa mở được tệp',
                    message: e.message,
                  }),
                );
              }}
            />
            <Button label="Đã hiểu" variant="secondary" onPress={close} />
          </View>
        ) : null}
      </Dialog>
    </SafeAreaView>
  );
}
