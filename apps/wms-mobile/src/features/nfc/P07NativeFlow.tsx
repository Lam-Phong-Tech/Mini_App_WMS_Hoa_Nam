import { P07VerificationContent } from './P07VerificationContent';
import { P07TagDetail,p07TagUpdatedAt } from './P07TagDetail';
import { HN_OPERATIONS } from '../../ui/hnHomeTokens';
import { HN_UI } from '../../theme/uiKitV3';
import { ScannerNativeText as Text } from '../../ui/ScannerNativeText';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ScannerTextInput as TextInput } from '../../ui/ScannerTextInput';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { BottomNav } from '../../ui/BottomNav';
import { Sheet } from '../../ui/Sheet';
import { cancelNfc, copyNfcIdentifier } from '../../native/nfc';
import { useHardwareBack } from '../../app/useHardwareBack';
import { AppError, toAppError } from '../../errors/AppError';
import { fetchCurrentUser } from '../../services/wms/queries';
import {
  p07AssignmentBlock,
  resolveNfcCode,
  type P07AssignmentBlock,
  type NfcTag,
  type NfcResolvedCode,
} from '../../services/wms/nfc';
import {
  readP07Tags,
  readP07Items,
  readP07Tag,
  NFC_TABS,
  type NfcTab,
  type NfcItem,
  type NfcCatalogPage,
} from '../../services/wms/p07Catalog';
import {
  createNativeNfcAssignment,
  currentNfcContext,
} from './nativeNfcAssignment';
import type {
  NfcJournal,
  NfcMappingObservation,
  NfcReadInspection,
} from './nfcAssignment';
import { nfcUserMessage } from './nfcUserMessage';
import { P07Frame, P07Action, p07 } from './P07Frame';
import { P04Icon } from '../inbound/P04Icon';
import { P07_ASSETS } from './p07Assets';
import { formatVietnamDateTime } from '../../time/vietnamTime';
import { P17ScanExceptions, type P17View } from '../scan/P17ScanExceptions';

function Icon({
  name,
  size = 24,
  color = HN_UI.textSecondary,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  return (
    <P04Icon
      name={name === 'time' ? 'clock' : name}
      size={size}
      color={color}
    />
  );
}
const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v : '—');
const date = (v: unknown) => formatVietnamDateTime(v);
const assignmentBlockMessage = (code: P07AssignmentBlock | null) =>
  code === 'ITEM_NOT_ISSUED'
    ? 'Chỉ liên kết NFC cho sản phẩm đã xuất kho.'
    : code === 'ITEM_ALREADY_HAS_NFC'
    ? 'Sản phẩm đã có thẻ NFC; không được gán thêm hoặc ghi đè.'
    : code === 'NFC_ELIGIBILITY_UNVERIFIED'
    ? 'Chưa xác minh đủ điều kiện gán NFC từ WMS.'
    : '';
type Modal =
  | { kind: 'message'; message: string }
  | { kind: 'reader'; title: string; value: string }
  | { kind: 'tag'; tag: NfcTag }
  | { kind: 'items' }
  | { kind: 'filter' }
  | { kind: 'options' }
  | { kind: 'recovery'; receiptId: string }
  | { kind: 'exit' }
  | null;
const s = StyleSheet.create({
  art: { width: 244, height: 191, overflow: 'hidden', alignSelf: 'center' },
  image: {
    position: 'absolute',
    width: 1672,
    height: 941,
    left: -512,
    top: -383,
  },
  success: { alignItems: 'center', gap: 10, paddingTop: 6, paddingBottom: 8 },
  check: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 18,
    borderColor: HN_UI.successBorder,
    backgroundColor: HN_UI.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: { paddingHorizontal: 12 },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: HN_UI.canvas,
  },
  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: HN_UI.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
export interface P07Props {
  initialCode?: string;
  onBack: () => void;
  onScanCode?: () => void;
  /**
   * Compatibility for the AppShell child route. P07.S01 is already the
   * canonical tag-management list, so the locked board must not render a
   * second full-width CTA that opens the same list inside itself.
   */
  onManageTags?: () => void;
  onSelectTab?: (key: string) => void;
}
export function P07NativeFlow({
  initialCode,
  onBack,
  onScanCode,
  onSelectTab,
}: P07Props) {
  // Memo is recreated by Fast Refresh; useState would retain a disposed owner.
  // Recreating the owner reads the existing scoped journal and never performs I/O.
  const flow = useMemo(createNativeNfcAssignment, []),
    flowRef = useRef(flow);
  flowRef.current = flow;
  const [journal, setJournal] = useState<NfcJournal | undefined>(() =>
    flow.snapshot(),
  );
  const [inspection, setInspection] = useState<NfcReadInspection>();
  const [mappingConflict, setMappingConflict] =
    useState<NfcMappingObservation>();
  const [readNotice, setReadNotice] = useState<string>();
  const [panel, setPanel] = useState<1 | 2 | 3 | 4>(() =>
    flow.snapshot()?.stage === 'CONFIRMED'
      ? 4
      : flow.snapshot()
      ? 3
      : initialCode
      ? 2
      : 1,
  );
  const [query, setQuery] = useState(''),
    [tab, setTab] = useState<NfcTab>('ALL'),
    [status, setStatus] = useState<string | undefined>(),
    [page, setPage] = useState<NfcCatalogPage<NfcTag>>(),
    [rows, setRows] = useState<readonly NfcTag[]>([]),
    [loading, setLoading] = useState(false),
    [listError, setListError] = useState<AppError>();
  const [modal, setModal] = useState<Modal>(() =>
      initialCode && !flow.snapshot() ? { kind: 'items' } : null,
    ),
    [selected, setSelected] = useState<NfcItem>(),
    [resolved, setResolved] = useState<NfcResolvedCode>(),
    [itemQuery, setItemQuery] = useState(initialCode || ''),
    [items, setItems] = useState<NfcCatalogPage<NfcItem>>(),
    [itemLoading, setItemLoading] = useState(false),
    [itemError, setItemError] = useState<AppError>();
  const incomingCode = useRef(initialCode);
  useEffect(() => {
    if (!initialCode || initialCode === incomingCode.current || flow.snapshot())
      return;
    incomingCode.current = initialCode;
    setItemQuery(initialCode);
    setPanel(2);
    setModal({ kind: 'items' });
  }, [initialCode, flow]);
  const [busy, setBusy] = useState<string>(),
    [warehouse, setWarehouse] = useState<string>(),
    [repeat, setRepeat] = useState(false),
    [currentSkuStatus, setCurrentSkuStatus] = useState<string>(),
    [copied, setCopied] = useState('');
  const lock = useRef(false),
    mounted = useRef(true),
    listEpoch = useRef(0),
    itemEpoch = useRef(0),
    detailEpoch = useRef(0),
    copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const context = currentNfcContext(),
    scope = JSON.stringify(context),
    scopeRef = useRef(scope);
  scopeRef.current = scope;
  const valid = useCallback(
    (saved: string) =>
      mounted.current &&
      flowRef.current === flow &&
      saved === scopeRef.current &&
      saved === JSON.stringify(currentNfcContext()),
    [flow],
  );
  const error = (e: unknown) =>
    setModal({ kind: 'message', message: nfcUserMessage(toAppError(e)) });
  const goHome = () => {
    if (onSelectTab) onSelectTab('home');
    else onBack();
  };
  const load = useCallback(
    async (n = 1, append = false) => {
      const c = currentNfcContext(),
        saved = JSON.stringify(c);
      if (!c) return;
      const epoch = ++listEpoch.current;
      setLoading(true);
      setListError(undefined);
      try {
        const result = await readP07Tags(c.warehouseId, {
          keyword: query,
          tab_status: tab,
          page: n,
          status,
        });
        if (!valid(saved) || epoch !== listEpoch.current) return;
        setPage(result);
        setRows(old =>
          append
            ? [
                ...old,
                ...result.items.filter(
                  t =>
                    !old.some(v => v.physical_code_id === t.physical_code_id),
                ),
              ]
            : result.items,
        );
      } catch (e) {
        if (valid(saved) && epoch === listEpoch.current) {
          setListError(toAppError(e));
          if (!append) {
            setRows([]);
            setPage(undefined);
          }
        }
      } finally {
        if (valid(saved) && epoch === listEpoch.current) setLoading(false);
      }
    },
    [query, tab, status, valid],
  );
  useEffect(() => {
    if (panel !== 1) return;
    // A new query/tab must not expose selectable rows from the prior result.
    setLoading(true);
    setRows([]);
    setPage(undefined);
    setListError(undefined);
    const epochRef = listEpoch;
    const timer = setTimeout(
      () => {
        void load();
      },
      query ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      epochRef.current++;
    };
  }, [panel, load, scope, query]);
  useEffect(() => {
    const c = currentNfcContext(),
      saved = JSON.stringify(c);
    void fetchCurrentUser()
      .then(u => {
        if (valid(saved) && u.active_warehouse_id === c?.warehouseId)
          setWarehouse(
            u.available_warehouses?.find(w => w.warehouse_id === c?.warehouseId)
              ?.name,
          );
      })
      .catch(() => {});
  }, [scope, valid]);
  const loadItems = useCallback(
    async (n = 1, append = false) => {
      const c = currentNfcContext(),
        saved = JSON.stringify(c);
      if (!c) return;
      const epoch = ++itemEpoch.current;
      setItemLoading(true);
      setItemError(undefined);
      try {
        const result = await readP07Items(c.warehouseId, itemQuery, n);
        if (!valid(saved) || epoch !== itemEpoch.current) return;
        setItems(old =>
          append && old
            ? {
                ...result,
                items: [
                  ...old.items,
                  ...result.items.filter(
                    t => !old.items.some(v => v.item_id === t.item_id),
                  ),
                ],
              }
            : result,
        );
      } catch (e) {
        if (valid(saved) && epoch === itemEpoch.current) {
          setItemError(toAppError(e));
          if (!append) setItems(undefined);
        }
      } finally {
        if (valid(saved) && epoch === itemEpoch.current) setItemLoading(false);
      }
    },
    [itemQuery, valid],
  );
  useEffect(() => {
    if (modal?.kind !== 'items') return;
    setItemLoading(true);
    setItems(undefined);
    setItemError(undefined);
    const epochRef = itemEpoch;
    const timer = setTimeout(
      () => {
        void loadItems();
      },
      itemQuery ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      epochRef.current++;
    };
  }, [modal?.kind, loadItems, scope, itemQuery]);
  useEffect(() => {
    const listRef = listEpoch,
      itemRef = itemEpoch,
      detailRef = detailEpoch;
    mounted.current = true;
    lock.current = false;
    const restored = flow.snapshot();
    setJournal(restored);
    setInspection(undefined);
    setMappingConflict(undefined);
    setReadNotice(undefined);
    setBusy(undefined);
    if (restored) setPanel(restored.stage === 'CONFIRMED' ? 4 : 3);
    return () => {
      mounted.current = false;
      listRef.current++;
      itemRef.current++;
      detailRef.current++;
      clearTimeout(copyTimer.current);
      flow.dispose();
      cancelNfc();
    };
  }, [flow]);
  const run = async (label: string, action: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true;
    const saved = scope;
    setBusy(label);
    try {
      await action();
    } catch (e) {
      if (valid(saved)) {
        const issue = toAppError(e);
        if (issue.code === 'NFC_UID_BOUND_WRITE_UNSUPPORTED')
          setReadNotice(nfcUserMessage(issue));
        const observation = flow.mappingSnapshot();
        if (
          issue.code === 'NFC_TAG_ALREADY_ASSIGNED' &&
          observation &&
          JSON.stringify(observation.context) === saved
        ) {
          setModal(null);
          setMappingConflict(observation);
        } else error(issue);
      }
    } finally {
      if (flowRef.current === flow) lock.current = false;
      if (valid(saved)) {
        const next = flow.snapshot();
        setJournal(next);
        setInspection(flow.readSnapshot());
        if (next?.stage === 'CONFIRMED') setPanel(4);
        else if (next && !['PREPARED', 'RELEASED'].includes(next.stage))
          setPanel(3);
        setBusy(undefined);
      }
    }
  };
  const openTag = async (id?: string) => {
    const c = currentNfcContext(),
      saved = JSON.stringify(c);
    if (!id || !c) return;
    const epoch = ++detailEpoch.current;
    try {
      const tag = await readP07Tag(c.warehouseId, id);
      if (valid(saved) && epoch === detailEpoch.current)
        setModal({ kind: 'tag', tag });
    } catch (e) {
      if (valid(saved) && epoch === detailEpoch.current) error(e);
    }
  };
  const start = () => {
    setMappingConflict(undefined);
    setCurrentSkuStatus(undefined);
    if (journal && ['CONFIRMED', 'RELEASED'].includes(journal.stage)) {
      const result = journal.result;
      if (result?.item?.item_id) {
        setSelected({
          item_id: result.item.item_id,
          serial_number: result.item.serial_number,
          nfc_status: result.nfc_status,
          sku: {
            sku_code: result.sku?.sku_code,
            sku_name: result.sku?.sku_name ?? result.sku?.name,
          },
        });
        setResolved(undefined);
      }
      flow.resetConfirmed();
      setJournal(undefined);
      setRepeat(true);
      setPanel(2);
      return;
    }
    setPanel(journal ? 3 : 2);
  };
  const back = () => {
    if (mappingConflict) {
      setMappingConflict(undefined);
      return;
    }
    if (modal) {
      setModal(null);
      return;
    }
    if (lock.current) {
      cancelNfc();
      return;
    }
    if (panel === 1) {
      onBack();
      return;
    }
    if (panel === 4) {
      setPanel(1);
      return;
    }
    if (journal && !['CONFIRMED', 'RELEASED'].includes(journal.stage)) {
      setModal({ kind: 'exit' });
      return;
    }
    setPanel(panel === 3 ? 2 : 1);
  };
  useHardwareBack(() => {
    back();
    return true;
  });
  const prep = journal?.recoveryPrepare?.preparation ?? journal?.preparation,
    receipt = journal?.stage === 'CONFIRMED' ? journal.result : undefined,
    id = prep?.item?.item_id || resolved?.item?.item_id || selected?.item_id;
  const serial =
      prep?.item?.serial_number ??
      resolved?.item?.serial_number ??
      selected?.serial_number,
    sku =
      prep?.sku?.sku_code ?? resolved?.sku?.sku_code ?? selected?.sku?.sku_code,
    name =
      prep?.sku?.sku_name ??
      prep?.sku?.name ??
      resolved?.sku?.sku_name ??
      resolved?.sku?.name ??
      selected?.sku?.sku_name;
  const assignmentBlock = resolved
    ? p07AssignmentBlock(resolved)
    : selected
    ? p07AssignmentBlock(
        {
          item: selected,
          nfc_status: selected.nfc_status,
          nfc: null,
          assignable: true,
        },
        false,
      )
    : 'NFC_ELIGIBILITY_UNVERIFIED';
  const canRead = !!id && !journal && !busy && assignmentBlock === null;
  const physicalRead =
    inspection &&
    inspection.itemId === id &&
    JSON.stringify(inspection.context) === scope
      ? inspection
      : undefined;
  const copy = async (value: string, key: string) => {
    try {
      await copyNfcIdentifier(value);
      if (!mounted.current) return;
      setCopied(key);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(''), 2200);
    } catch (e) {
      error(e);
    }
  };
  const kv = (
    label: string,
    value: unknown,
    key?: string,
    glyph?: string,
    subvalue?: unknown,
    successStatus = false,
  ) => (
    <View
      key={label}
      testID={`P07.field.${label}`}
      style={[
        p07.kv,
        glyph && { gap: 10 },
        label === 'Mã thẻ (UID)' && { borderTopWidth: 0 },
      ]}
    >
      {glyph && (
        <View style={s.summaryIcon}>
          <Icon name={glyph} size={22} />
        </View>
      )}
      <Text
        style={[
          p07.label,
          glyph && { flex: 0.92, fontSize: 16, lineHeight: 22 },
        ]}
      >
        {label}
      </Text>
      <View
        style={[p07.row, { flex: glyph ? 1.25 : 1.2, minWidth: 0, gap: 0 }]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            selectable
            numberOfLines={
              typeof value === 'string' &&
              (value.length > 80 || value.includes('\n'))
                ? 2
                : undefined
            }
            style={[
              p07.value,
              panel === 2 && { textAlign: 'right' },
              glyph && { fontSize: 18, lineHeight: 25, fontWeight: '600' },
              successStatus && p07.successBadge,
              successStatus && {
                alignSelf: 'flex-start',
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: 13,
                overflow: 'hidden',
              },
            ]}
          >
            {txt(value)}
          </Text>
          {typeof value === 'string' &&
            (value.length > 80 || value.includes('\n')) && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Xem đầy đủ ${label}`}
                onPress={() =>
                  setModal({ kind: 'reader', title: label, value })
                }
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={[p07.hint, { color: HN_UI.textLink }]}>
                  Xem đầy đủ
                </Text>
              </Pressable>
            )}
          {typeof subvalue === 'string' && !!subvalue && (
            <Text style={p07.hint}>{subvalue}</Text>
          )}
        </View>
        {key && typeof value === 'string' && !!value && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Sao chép ${label}`}
            onPress={() => {
              void copy(value, key);
            }}
            style={p07.iconButton}
          >
            <Icon name={copied === key ? 'check' : 'copy'} size={20} />
          </Pressable>
        )}
      </View>
    </View>
  );
  const product = () => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Đổi sản phẩm NFC"
      onPress={() => setModal({ kind: 'items' })}
      disabled={!!journal || !!busy}
      style={[p07.inset, p07.row]}
    >
      <Image
        accessibilityLabel="Hình minh họa hộp sản phẩm, không phải ảnh sản phẩm WMS"
        source={P07_ASSETS.productBox}
        style={s.productImage}
        resizeMode="contain"
      />
      <View style={p07.rowBody}>
        <Text style={[p07.strong, { fontSize: 22, lineHeight: 30 }]}>
          {txt(serial)}
        </Text>
        <Text style={p07.text}>
          {id ? txt(name) : 'Chọn sản phẩm cần liên kết'}
        </Text>
        <Text style={p07.hint}>
          SKU: {txt(sku)} | SN: {txt(serial)}
        </Text>
      </View>
      <Icon name="chevron" size={24} />
    </Pressable>
  );
  const warehouseCard = () => (
    <View style={p07.card}>
      <Text style={p07.heading}>Thông tin kho</Text>
      <View
        style={[
          p07.inset,
          p07.row,
          { backgroundColor: HN_UI.canvas, borderWidth: 0 },
        ]}
      >
        <Icon name="pin" />
        <View style={p07.rowBody}>
          <Text style={p07.strong}>{txt(warehouse)}</Text>
          <Text style={p07.hint}>Chỉ xem, không thể thay đổi</Text>
        </View>
        <Icon name="lock" color={HN_UI.textSecondary} />
      </View>
    </View>
  );
  const badge = (t: NfcTag) => (
    <Text
      numberOfLines={1}
      style={[
        p07.badge,
        t.tab_status === 'ASSIGNED' && p07.successBadge,
        t.tab_status === 'UNASSIGNED' && p07.warningBadge,
        t.tab_status === 'LOCKED' && p07.lockedBadge,
        p07.tagBadge,
      ]}
    >
      {t.status_label || 'Chưa rõ trạng thái'}
    </Text>
  );
  const titles = [
      '',
      'Thẻ NFC',
      'Đọc thẻ NFC',
      'Xác minh liên kết',
      'NFC - Hoàn tất',
    ],
    labels = {
      ALL: 'Tất cả',
      ASSIGNED: 'Đã liên kết',
      UNASSIGNED: 'Chưa liên kết',
    };
  const action = (
    label: string,
    onPress: () => void,
    disabled = false,
    secondary = false,
  ) => (
    <P07Action
      label={label}
      onPress={onPress}
      disabled={disabled}
      secondary={secondary}
    />
  );
  const checkConfirmation = () => {
    void run('Đối chiếu', async () => {
      const outcome = await flow.reconcile();
      if (!valid(scope)) return;
      if (outcome === 'SUCCEEDED') return;
      const saved = flow.snapshot();
      if (outcome === 'REJECTED') {
        setModal({
          kind: 'message',
          message: saved?.rejection?.may_create_new_request
            ? 'WMS đã xác nhận lượt cũ bị từ chối. Bạn có thể chuẩn bị phục hồi sau khi xác nhận, rồi dùng thẻ trắng mới có UID khác. Chưa ghi thẻ hoặc gửi lại yêu cầu.'
            : 'WMS đã xác nhận lượt cũ bị từ chối, nhưng hiện chưa cho phép bắt đầu phục hồi. Giữ biên nhận và yêu cầu để kiểm tra.',
        });
        return;
      }
      let currentStatus: string | undefined;
      const rawCode = saved?.preparation.item?.serial_number;
      if (rawCode && context) {
        try {
          const current = await resolveNfcCode(rawCode, {
            warehouseId: context.warehouseId,
          });
          if (!valid(scope)) return;
          if (
            current.resolved === true &&
            current.item?.item_id === saved?.itemId &&
            ['ACTIVE', 'INACTIVE'].includes(current.sku?.status || '')
          ) {
            currentStatus = current.sku!.status!;
            setCurrentSkuStatus(currentStatus);
          }
        } catch {
          /* Current product status never overrides the old request result. */
        }
      }
      if (!valid(scope)) return;
      setModal({
        kind: 'message',
        message:
          (currentStatus === 'ACTIVE' ? 'Sản phẩm hiện đang hoạt động. ' : '') +
          (outcome === 'PROCESSING'
            ? 'WMS đang xử lý yêu cầu cũ. Chưa có xác nhận hoàn tất; giữ nguyên thẻ và yêu cầu.'
            : 'WMS chưa có xác nhận hoàn tất cho yêu cầu này. Mã trên chip khớp chưa có nghĩa đã liên kết. Giữ nguyên thẻ; không ghi lại hoặc tạo yêu cầu mới.'),
      });
    });
  };
  const preparedExtraActions = (
    <View style={[p07.row, { alignItems: 'stretch', gap: 10 }]}>
      <View style={{ flex: 1 }}>
        {action(
          'Hủy giữ chỗ (chưa ghi)',
          () => {
            void run('Hủy giữ chỗ', async () => {
              await flow.release();
              if (flow.snapshot()?.stage === 'REJECTED') return;
              flow.resetConfirmed();
              setJournal(undefined);
              setPanel(2);
            });
          },
          !!busy,
          true,
        )}
      </View>
      <View style={{ flex: 1 }}>
        {action(
          'Về Trang chủ — giữ lượt',
          () => setModal({ kind: 'exit' }),
          !!busy,
          true,
        )}
      </View>
    </View>
  );
  const footer =
    panel === 1 ? (
      <BottomNav
        activeKey="home"
        onSelect={key => {
          if (key === 'home') goHome();
          else onSelectTab?.(key);
        }}
      />
    ) : panel === 2 ? (
      action(
        'Tiếp tục →',
        () => setPanel(3),
        journal?.stage !== 'PREPARED' || !!busy,
      )
    ) : panel === 3 ? (
      <View style={{ gap: 8 }}>
        {journal?.stage === 'PREPARED' ? (
          <>
            {action(
              busy
                ? 'Đang xác nhận…'
                : prep?.sku?.status === 'INACTIVE'
                ? 'SKU ngừng hoạt động'
                : 'Xác nhận liên kết →',
              () => {
                void run('Ghi và xác nhận', () => flow.writeAndConfirm());
              },
              !!busy || prep?.sku?.status === 'INACTIVE',
            )}
            {
              null /* Secondary commands are retained in the header options sheet. */
            }
          </>
        ) : journal?.stage === 'UNKNOWN' || journal?.stage === 'REJECTED' ? (
          <>
            {journal?.stage === 'REJECTED' &&
              journal.rejection?.may_create_new_request === true &&
              !journal.recoveryEligibilityStale &&
              action(
                'Chuẩn bị phục hồi bằng thẻ mới',
                () =>
                  setModal({
                    kind: 'recovery',
                    receiptId: journal.rejection!.receipt.receipt_id,
                  }),
                !!busy,
              )}
            {action(
              'Kiểm tra kết quả liên kết',
              checkConfirmation,
              !!busy,
              journal?.stage === 'REJECTED' &&
                journal.rejection?.may_create_new_request === true &&
                !journal.recoveryEligibilityStale,
            )}
          </>
        ) : journal?.stage === 'RECOVERY_READY' ? (
          action(
            'Đọc thẻ trắng mới',
            () => {
              void run('Đọc thẻ mới', () => flow.readRecoveryChip());
            },
            !!busy,
          )
        ) : journal?.stage === 'RECOVERY_PREPARE_UNKNOWN' ? (
          action(
            'Kiểm tra và nhận lại giữ chỗ phục hồi',
            () =>
              setModal({
                kind: 'recovery',
                receiptId:
                  journal.recoveryPrepare!.source.rejection!.receipt.receipt_id,
              }),
            !!busy,
          )
        ) : ['WRITE_UNKNOWN', 'READBACK_VERIFIED'].includes(
            journal?.stage || '',
          ) ? (
          action(
            'Đọc lại chip, không ghi lại',
            () => {
              void run('Đọc lại', () => flow.verifyWrittenChip());
            },
            !!busy,
          )
        ) : (
          <Text style={p07.hint}>Giữ nguyên yêu cầu để đối chiếu.</Text>
        )}
        {journal &&
          !['CONFIRMED', 'RELEASED', 'PREPARED'].includes(journal.stage) &&
          action(
            'Về Trang chủ — giữ lượt',
            () => setModal({ kind: 'exit' }),
            !!busy,
            true,
          )}
      </View>
    ) : (
      <>
        {action('Xem thông tin thẻ →', () => {
          void openTag(receipt?.nfc?.physical_code_id);
        })}
        <View style={p07.row}>
          <View style={{ flex: 1 }}>
            {action('＋ Liên kết thẻ khác', start, false, true)}
          </View>
          <View style={{ flex: 1 }}>
            {action('Về Trang chủ', goHome, false, true)}
          </View>
        </View>
      </>
    );
  const resolve = () => {
    const c = currentNfcContext();
    if (!c || !itemQuery.trim()) return;
    void run('Nhận diện mã', async () => {
      const result = await resolveNfcCode(itemQuery.trim(), {
        warehouseId: c.warehouseId,
      });
      if (!valid(scope)) return;
      if (result.resolved !== true || !result.item?.item_id)
        throw new AppError({
          kind: 'parse',
          message: 'Không xác định được hiện vật từ mã đã nhập.',
        });
      const block = p07AssignmentBlock(result);
      if (block)
        throw new AppError({
          kind: 'blocked_by_gate',
          code: block,
          message: assignmentBlockMessage(block),
        });
      setSelected(undefined);
      setResolved(result);
      setInspection(undefined);
      setReadNotice(undefined);
      setModal(null);
      Keyboard.dismiss();
    });
  };
  if (mappingConflict) {
    const observation = mappingConflict;
    const conflictScope = JSON.stringify(observation.context);
    const view: P17View = {
      panel: 'P17.S03',
      verification: observation.verification,
      physicalCodeId: observation.physicalCodeId,
      uid: observation.hardwareUid,
      status: observation.status,
      statusLabel: observation.statusLabel,
      product: observation.product,
      canViewLink: observation.canViewLink,
    };
    const isCurrent = () => {
      const latest = flow.mappingSnapshot();
      return (
        valid(conflictScope) &&
        latest?.itemId === observation.itemId &&
        latest.hardwareUid.trim().toUpperCase() ===
          observation.hardwareUid.trim().toUpperCase() &&
        latest.physicalCodeId === observation.physicalCodeId
      );
    };
    const closeConflict = () => setMappingConflict(undefined);
    return (
      <P17ScanExceptions
        scopeKey={JSON.stringify([
          conflictScope,
          observation.itemId,
          observation.hardwareUid,
          observation.physicalCodeId ?? null,
        ])}
        view={view}
        isCurrent={isCurrent}
        onBack={closeConflict}
        onCancel={closeConflict}
        onViewLink={
          observation.verification === 'verified' &&
          observation.canViewLink &&
          observation.physicalCodeId
            ? async physicalCodeId => {
                if (
                  physicalCodeId !== observation.physicalCodeId ||
                  !isCurrent()
                )
                  throw new AppError({
                    kind: 'config',
                    code: 'NFC_SESSION_CHANGED',
                    message: 'Phiên hoặc mapping NFC đã thay đổi.',
                  });
                const current = currentNfcContext();
                if (!current || JSON.stringify(current) !== conflictScope)
                  throw new AppError({
                    kind: 'auth',
                    code: 'NFC_SESSION_CHANGED',
                    message: 'Phiên hoặc kho đã thay đổi.',
                  });
                const tag = await readP07Tag(
                  current.warehouseId,
                  physicalCodeId,
                );
                if (
                  !isCurrent() ||
                  tag.physical_code_id !== physicalCodeId ||
                  !tag.hardware_uid ||
                  tag.hardware_uid.trim().toUpperCase() !==
                    observation.hardwareUid.trim().toUpperCase() ||
                  !['ASSIGNED', 'LOCKED'].includes(tag.tab_status ?? '')
                )
                  throw new AppError({
                    kind: 'parse',
                    code: 'P07_RESPONSE_INVALID',
                    message: 'Chi tiết thẻ không còn khớp UID/mapping đã đọc.',
                  });
                setMappingConflict(undefined);
                setModal({ kind: 'tag', tag });
              }
            : undefined
        }
      />
    );
  }
  return (
    <>
      <P07Frame
        panel={panel}
        onOptions={
          panel === 3 && journal?.stage === 'PREPARED'
            ? () => setModal({ kind: 'options' })
            : undefined
        }
        optionsDisabled={!!busy}
        title={titles[panel]}
        step={panel === 2 ? 'Bước 1/3' : panel === 3 ? 'Bước 2/3' : undefined}
        onBack={back}
        add={panel === 1 ? start : undefined}
        footer={footer}
      >
        {panel === 1 && (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={start}
              style={[
                p07.card,
                p07.row,
                { padding: 8, backgroundColor: HN_UI.canvas },
              ]}
            >
              <View
                style={[p07.tile, { backgroundColor: HN_OPERATIONS.nfc.soft }]}
              >
                <Icon name="nfc" color={HN_OPERATIONS.nfc.ink} size={30} />
              </View>
              <View style={p07.rowBody}>
                <Text style={p07.strong}>Quét hoặc liên kết thẻ NFC</Text>
                <Text style={p07.hint}>Đọc UID, liên kết với sản phẩm</Text>
              </View>
              <Icon name="chevron" size={24} />
            </Pressable>
            <View style={p07.row}>
              <View style={p07.search}>
                <Icon name="search" size={21} />
                <TextInput
                  accessibilityLabel="Tìm thẻ NFC"
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Tìm UID, sản phẩm, serial…"
                  placeholderTextColor={HN_UI.textMuted}
                  returnKeyType="search"
                  onSubmitEditing={() => {
                    void load();
                  }}
                  style={p07.input}
                />
                {!!query && (
                  <Pressable
                    accessibilityLabel="Xóa tìm kiếm"
                    onPress={() => setQuery('')}
                    style={p07.iconButton}
                  >
                    <Text>×</Text>
                  </Pressable>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Bộ lọc NFC"
                style={[p07.iconButton, { backgroundColor: HN_UI.primary }]}
                onPress={() => setModal({ kind: 'filter' })}
              >
                <Icon name="filter" color={HN_UI.onBrand} />
              </Pressable>
            </View>
            <View style={p07.tabs}>
              {NFC_TABS.map(t => (
                <Pressable
                  key={t}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tab === t }}
                  onPress={() => setTab(t)}
                  style={[p07.tab, tab === t && p07.selectedTab]}
                >
                  <Text
                    style={[p07.tabText, tab === t && { color: HN_UI.onBrand }]}
                  >
                    {labels[t]} ({page?.totals?.[t] ?? '—'})
                  </Text>
                </Pressable>
              ))}
            </View>
            {listError ? (
              <>
                <Text style={p07.hint}>{nfcUserMessage(listError)}</Text>
                {action('Thử tải lại', () => {
                  void load();
                })}
              </>
            ) : loading && !rows.length ? (
              <ActivityIndicator />
            ) : !rows.length ? (
              <Text style={p07.hint}>
                Không có thẻ trong kết quả nguồn đã tải.
              </Text>
            ) : (
              rows.map(t => (
                <Pressable
                  key={t.physical_code_id}
                  accessibilityRole="button"
                  onPress={() => {
                    void openTag(t.physical_code_id);
                  }}
                  style={[p07.card, p07.row, { padding: 9 }]}
                >
                  <View
                    style={[
                      p07.tile,
                      {
                        width: 58,
                        height: 58,
                        backgroundColor: HN_OPERATIONS.nfc.soft,
                      },
                    ]}
                  >
                    <Icon name="nfc" color={HN_OPERATIONS.nfc.ink} size={29} />
                  </View>
                  <View style={p07.rowBody}>
                    <View style={p07.tagHeader}>
                      <Text numberOfLines={1} accessibilityLabel={txt(t.code_value)} style={[p07.strong,p07.tagCode]}>{txt(t.code_value)}</Text>
                      {badge(t)}
                    </View>
                    <Text style={p07.text}>{txt(t.sku_name)}</Text>
                    {t.serial_number || t.sku_code ? (
                      <Text
                        style={[p07.hint, { fontSize: 15, lineHeight: 21 }]}
                      >
                        SN: {txt(t.serial_number)} | SKU: {txt(t.sku_code)}
                      </Text>
                    ) : (
                      <Text
                        style={[p07.hint, { fontSize: 15, lineHeight: 21 }]}
                      >
                        UID: {txt(t.hardware_uid)}
                      </Text>
                    )}
                    <Text style={p07.hint}>
                      Cập nhật: {p07TagUpdatedAt(t)}
                    </Text>
                  </View>
                  <Icon name="chevron" size={24} />
                </Pressable>
              ))
            )}
            {page &&
              page.page < page.lastPage &&
              action(
                loading ? 'Đang tải…' : 'Tải thêm thẻ',
                () => {
                  void load(page.page + 1, true);
                },
                loading,
                true,
              )}
          </>
        )}
        {panel === 2 && (
          <>
            <View style={p07.card}>
              <Text style={p07.heading}>Thông tin sản phẩm</Text>
              <View style={[p07.row, { paddingHorizontal: 12, gap: 8 }]}>
                <Text style={[p07.hint, p07.rowBody]}>
                  {repeat
                    ? 'Chọn hiện vật chưa liên kết để gán thẻ tiếp'
                    : 'Kiểm tra sản phẩm trước khi đọc thẻ'}
                </Text>
                <Pressable
                  onPress={() => setModal({ kind: 'items' })}
                  disabled={!!journal || !!busy}
                  style={p07.iconButton}
                >
                  <Text style={p07.hint}>Đổi sản phẩm</Text>
                </Pressable>
              </View>
              {product()}
            </View>
            {warehouseCard()}
            <View style={{ alignItems: 'center', gap: 4 }}>
              <View style={s.art}>
                <Image
                  source={P07_ASSETS.artwork}
                  style={s.image}
                  resizeMode="stretch"
                />
              </View>
              <Text style={[p07.strong, { fontSize: 21, textAlign: 'center' }]}>
                Chạm thẻ NFC vào mặt lưng điện thoại
              </Text>
              <View
                style={[
                  p07.row,
                  { alignSelf: 'stretch', justifyContent: 'center', gap: 8 },
                ]}
              >
                <Text style={[p07.hint, { textAlign: 'center' }]}>
                  {busy
                    ? 'Đang chờ thẻ NFC thật…'
                    : journal
                    ? 'Đã đọc UID · Tiếp tục để xác minh'
                    : 'Giữ thẻ ổn định cho đến khi có thông báo'}
                </Text>
                {busy ? (
                  <ActivityIndicator />
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canRead}
                    onPress={() => {
                      setInspection(undefined);
                      setReadNotice(undefined);
                      void run('Đọc UID', () => flow.prepare(id!));
                    }}
                    style={[p07.iconButton, !canRead && p07.disabled]}
                  >
                    <Text style={{ color: canRead?HN_UI.textLink:HN_UI.disabledForeground, fontWeight: '600' }}>
                      Đọc thẻ NFC
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
            <View style={p07.card}>
              <Text style={p07.heading}>Thông tin thẻ</Text>
              <View
                style={[
                  p07.inset,
                  { paddingVertical: 0, paddingHorizontal: 12 },
                ]}
              >
                {kv(
                  'Mã thẻ (UID)',
                  journal?.hardwareUid ||
                    physicalRead?.hardwareUid ||
                    'Chưa đọc được',
                )}
                <View style={p07.kv} testID="P07.read-status">
                  <Text style={p07.label}>Trạng thái</Text>
                  <View
                    style={[
                      p07.row,
                      { flex: 1.2, justifyContent: 'flex-end', gap: 8 },
                    ]}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: busy
                          ? HN_UI.textLink
                          : journal?.stage === 'PREPARED'
                          ? HN_UI.success
                          : HN_UI.textMuted,
                      }}
                    />
                    <Text
                      style={[
                        p07.hint,
                        {
                          fontSize: 18,
                          lineHeight: 25,
                          textAlign: 'right',
                          color:
                            journal?.stage === 'PREPARED'
                              ? HN_UI.success
                              : HN_UI.textSecondary,
                        },
                      ]}
                    >
                      {busy
                        ? 'Đang đọc…'
                        : journal?.stage === 'PREPARED'
                        ? 'Đã đọc UID'
                        : physicalRead?.hasNdefData === false
                        ? 'NDEF trống · chưa xác minh liên kết'
                        : physicalRead?.hasNdefData === true
                        ? 'Thẻ có dữ liệu'
                        : physicalRead
                        ? 'Chưa xác minh thẻ trống'
                        : 'Chưa đọc'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
            {readNotice && physicalRead && (
              <Text style={p07.hint} testID="P07.read-capability">
                {readNotice}
              </Text>
            )}
            {assignmentBlock !== null && (
              <Text style={p07.hint} testID="P07.assignment-block">
                {assignmentBlockMessage(assignmentBlock)}
              </Text>
            )}
          </>
        )}
        {panel === 3 && (
          <P07VerificationContent
            uid={txt(journal?.hardwareUid)}
            verified={journal?.stage === 'PREPARED'}
            tagDetails={
              <View style={s.summary}>
                {kv('Mã thẻ (UID)', journal?.hardwareUid, 'verify-uid')}
                {kv('Ngày đọc', date(journal?.readAt))}
              </View>
            }
            product={product()}
            warehouse={warehouseCard()}
            statusLabel={
              busy
                ? 'Đang xác nhận…'
                : journal?.stage === 'REJECTED'
                ? journal.rejection?.may_create_new_request &&
                  !journal.recoveryEligibilityStale
                  ? 'Đã từ chối · Có thể chuẩn bị phục hồi'
                  : 'Đã từ chối · Phục hồi đang khóa'
                : journal?.stage === 'PREPARE_UNKNOWN'
                ? 'Chưa xác minh giữ chỗ'
                : journal?.stage === 'RECOVERY_READY'
                ? 'Đã có giữ chỗ phục hồi · Chưa đọc thẻ mới'
                : journal?.stage === 'RECOVERY_PREPARE_UNKNOWN'
                ? 'Chưa xác minh giữ chỗ phục hồi'
                : journal?.confirmationIssue?.code === 'SKU_INACTIVE'
                ? 'WMS từ chối: SKU ngừng hoạt động'
                : prep?.sku?.status === 'INACTIVE'
                ? currentSkuStatus === 'ACTIVE'
                  ? 'SKU đã hoạt động · Lượt cũ chưa xác nhận'
                  : 'SKU ngừng ở lần chuẩn bị trước'
                : journal?.stage === 'PREPARED'
                ? 'Chờ xác nhận'
                : journal?.lastCheck?.state === 'PROCESSING'
                ? 'WMS đang xử lý'
                : journal?.lastCheck?.state === 'UNKNOWN'
                ? 'WMS chưa xác nhận'
                : 'Cần đối chiếu'
            }
            message={
              journal?.stage === 'REJECTED'
                ? 'Lượt cũ bị WMS từ chối vì SKU ngừng hoạt động. Nội dung trên chip cũ vẫn còn. Chỉ chuẩn bị phục hồi khi WMS cho phép; dùng thẻ trắng mới có UID khác.'
                : journal?.stage === 'PREPARE_UNKNOWN'
                ? 'UID đã đọc nhưng chưa xác minh được giữ chỗ từ WMS. Chưa ghi chip hoặc gửi PATCH. Giữ lượt và liên hệ kiểm tra giữ chỗ; không tạo lượt mới.'
                : journal?.stage === 'RECOVERY_READY'
                ? 'Giữ chỗ mới đã được cấp. UID phía trên là thẻ cũ; bấm Đọc thẻ trắng mới để chọn chip khác. Bước này chưa ghi chip hoặc gửi xác nhận.'
                : journal?.stage === 'RECOVERY_PREPARE_UNKNOWN'
                ? 'Chưa xác minh được giữ chỗ phục hồi. Kiểm tra yêu cầu cũ và nhận lại đúng giữ chỗ đã cấp; không tự tạo thêm lượt hoặc ghi thẻ.'
                : journal?.stage === 'PREPARED' &&
                  prep?.sku?.status === 'INACTIVE'
                ? 'SKU trong dữ liệu prepare đã ngừng hoạt động. App chặn ghi chip; hủy giữ chỗ trước khi chọn hiện vật khác.'
                : journal?.stage === 'PREPARED'
                ? 'Chạm lại đúng thẻ đã đọc. Chỉ hoàn tất sau khi ghi, đọc lại và WMS xác nhận.'
                : journal?.confirmationIssue?.code === 'SKU_INACTIVE'
                ? 'Chip đã ghi và đọc lại đúng nội dung, nhưng WMS từ chối liên kết vì SKU ngừng hoạt động. Giữ nguyên chip và yêu cầu để xử lý; không ghi lại.'
                : journal?.writtenPayload
                ? 'Chip đã ghi và đọc lại đúng nội dung. WMS chưa xác nhận liên kết; giữ nguyên chip và yêu cầu để đối chiếu, không ghi lại.'
                : 'Giữ nguyên chip và yêu cầu. Không ghi lại hoặc tạo lượt mới khi chưa rõ kết quả.'
            }
            busy={!!busy}
            tone={
              journal?.stage === 'REJECTED' ||
              journal?.confirmationIssue?.code === 'SKU_INACTIVE'
                ? 'danger'
                : busy
                ? 'info'
                : 'warning'
            }
          />
        )}
        {panel === 4 && receipt && (
          <>
            <View style={s.success}>
              <View style={s.check}>
                <Icon name="check" size={56} color={HN_UI.onBrand} />
              </View>
              <Text
                style={[
                  p07.strong,
                  { fontSize: 28, lineHeight: 36, textAlign: 'center' },
                ]}
              >
                Đã liên kết thẻ NFC
              </Text>
              <Text
                style={[
                  p07.hint,
                  { fontSize: 19, lineHeight: 27, textAlign: 'center' },
                ]}
              >
                Bạn có thể xem thông tin thẻ hoặc liên kết thẻ khác để tiếp tục.
              </Text>
            </View>
            <View style={[p07.card, s.summary]}>
              {kv(
                'Mã thẻ (UID)',
                receipt.nfc?.hardware_uid,
                'success-uid',
                'nfc',
              )}
              {kv(
                'Sản phẩm',
                receipt.sku?.sku_name ?? receipt.sku?.name,
                undefined,
                'box',
                receipt.sku?.sku_code
                  ? `SKU: ${receipt.sku.sku_code}`
                  : undefined,
              )}
              {kv('Serial', receipt.item?.serial_number, undefined, 'scan')}
              {kv(
                'Kho',
                receipt.nfc?.assigned_warehouse?.name,
                undefined,
                'pin',
              )}
              {kv(
                'Ngày liên kết',
                date(receipt.nfc?.assigned_at),
                undefined,
                'time',
              )}
              {kv(
                'Người liên kết',
                receipt.nfc?.linker?.display_name,
                undefined,
                'user',
              )}
              {kv(
                'Trạng thái',
                receipt.nfc?.status_label || 'Đã liên kết',
                undefined,
                'check',
                undefined,
                true,
              )}
            </View>
          </>
        )}
      </P07Frame>
      <P07TagDetail
        tag={modal?.kind === 'tag' ? modal.tag : null}
        onClose={() => {
          detailEpoch.current++;
          setModal(null);
        }}
        onCopy={uid => {
          copy(uid, 'tag-uid').catch(() => undefined);
        }}
      />
      <Sheet
        visible={!!modal && modal.kind !== 'tag'}
        onDismiss={() => {
          detailEpoch.current++;
          setModal(null);
        }}
        title={
          modal?.kind === 'options'
            ? 'Tùy chọn liên kết'
            : modal?.kind === 'reader'
            ? modal.title
            : modal?.kind === 'exit'
            ? 'Giữ lượt NFC và rời màn hình?'
            : modal?.kind === 'recovery'
            ? 'Chuẩn bị phục hồi NFC?'
            : modal?.kind === 'message'
            ? 'Thông báo NFC'
            : modal?.kind === 'tag'
            ? 'Thông tin thẻ NFC'
            : modal?.kind === 'items'
            ? 'Chọn sản phẩm'
            : 'Bộ lọc thẻ NFC'
        }
        message={
          modal?.kind === 'message'
            ? modal.message
            : modal?.kind === 'reader'
            ? modal.value
            : undefined
        }
        keyboardLayout="viewport"
      >
        {modal?.kind === 'options' && journal?.stage === 'PREPARED'
          ? preparedExtraActions
          : null}
        {modal?.kind === 'exit' && (
          <View style={{ gap: 9 }}>
            <Text style={p07.text}>
              Giữ nguyên chip và yêu cầu. Lượt NFC đang dở được giữ để kiểm tra
              khi mở lại. Rời màn hình không xóa yêu cầu, không ghi lại thẻ và
              không hoàn tác liên kết.
            </Text>
            {action('Tiếp tục kiểm tra', () => setModal(null))}
            {action(
              'Về Trang chủ — giữ lượt',
              () => {
                setModal(null);
                cancelNfc();
                goHome();
              },
              false,
              true,
            )}
          </View>
        )}
        {modal?.kind === 'recovery' && (
          <View style={{ gap: 9 }}>
            <Text style={p07.text}>
              Giữ nguyên biên nhận lượt cũ. WMS sẽ kiểm tra điều kiện và cấp giữ
              chỗ phục hồi cho cùng hiện vật. Sau đó bạn cần thẻ trắng mới, có
              UID khác; chưa ghi thẻ ở bước này.
            </Text>
            {action(
              'Xác nhận chuẩn bị phục hồi',
              () => {
                const current = flow.snapshot();
                const receiptId =
                  current?.recoveryPrepare?.source.rejection?.receipt
                    .receipt_id ?? current?.rejection?.receipt.receipt_id;
                if (receiptId !== modal.receiptId || lock.current) return;
                setModal(null);
                void run('Chuẩn bị phục hồi', () => flow.prepareRecovery());
              },
              !!busy,
            )}
            {action('Hủy', () => setModal(null), false, true)}
          </View>
        )}
        {modal?.kind === 'items' && (
          <View style={{ gap: 9 }}>
            <TextInput
              accessibilityLabel="Tìm sản phẩm hoặc nhập mã"
              value={itemQuery}
              onChangeText={setItemQuery}
              placeholder="Mã sản phẩm, tên, SKU, serial…"
              placeholderTextColor={HN_UI.textMuted}
              style={[p07.search, p07.input, { paddingHorizontal: 10 }]}
              returnKeyType="search"
              onSubmitEditing={() => {
                void loadItems();
              }}
            />
            {action(
              'Nhận diện mã đã nhập',
              resolve,
              !itemQuery.trim() || !!busy,
              true,
            )}
            {onScanCode &&
              action(
                'Quét QR/SKU',
                () => {
                  setModal(null);
                  onScanCode();
                },
                false,
                true,
              )}
            {itemError ? (
              <>
                <Text style={p07.hint}>{nfcUserMessage(itemError)}</Text>
                {action('Thử tải lại', () => {
                  void loadItems();
                })}
              </>
            ) : itemLoading && !items ? (
              <ActivityIndicator />
            ) : !items?.items.length ? (
              <Text style={p07.hint}>
                Chưa có sản phẩm đã xuất kho và chưa liên kết NFC.
              </Text>
            ) : (
              items.items.map(i => (
                <Pressable
                  accessibilityRole="button"
                  key={i.item_id}
                  onPress={() => {
                    setSelected(i);
                    setResolved(undefined);
                    setInspection(undefined);
                    setReadNotice(undefined);
                    setModal(null);
                    Keyboard.dismiss();
                  }}
                  style={[p07.card, { padding: 10 }]}
                >
                  <Text style={p07.strong}>{txt(i.serial_number)}</Text>
                  <Text style={p07.text}>{txt(i.sku?.sku_name)}</Text>
                  <Text style={p07.hint}>
                    SKU: {txt(i.sku?.sku_code)} ·{' '}
                    {i.nfc_status === 'ASSIGNED'
                      ? 'Đã có NFC'
                      : i.nfc_status === 'UNASSIGNED'
                      ? 'Đã xuất kho · Chưa liên kết NFC'
                      : 'Chưa rõ trạng thái'}
                  </Text>
                </Pressable>
              ))
            )}
            {items &&
              items.page < items.lastPage &&
              action(
                'Tải thêm sản phẩm',
                () => {
                  void loadItems(items.page + 1, true);
                },
                itemLoading,
                true,
              )}
          </View>
        )}
        {modal?.kind === 'filter' && (
          <View style={{ gap: 8 }}>
            {[
              [undefined, 'Tất cả trạng thái'],
              ['ACTIVE', 'ACTIVE'],
              ['INACTIVE', 'INACTIVE'],
              ['LOST', 'LOST'],
              ['DAMAGED', 'DAMAGED'],
            ].map(([v, label]) => (
              <P07Action
                key={label}
                label={label!}
                secondary
                onPress={() => {
                  setStatus(v);
                  setModal(null);
                }}
              />
            ))}
          </View>
        )}
        {modal?.kind !== 'recovery' &&
          modal?.kind !== 'exit' &&
          action('Đóng', () => setModal(null), false, true)}
      </Sheet>
    </>
  );
}
