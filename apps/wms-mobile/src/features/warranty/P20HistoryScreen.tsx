import {HN_UI} from '../../theme/uiKitV3';
/** Native P20 owner read view. Reuses app primitives; never creates/posts/reconciles a write. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { AppIcon } from '../../ui/AppIcon';
import { colors } from '../../theme/tokens';
import {ThemeProvider} from '../../theme/ThemeProvider';
import { HN_OPERATIONS } from '../../ui/hnHomeTokens';
import { P24ClosedCasePresentation } from '../scan/P24StatePresentation';
import { formatVietnamDateTime } from '../../time/vietnamTime';
import { AppError, messageForUser, toAppError } from '../../errors/AppError';
import type { P09Case, P09Service } from '../../services/wms/p09Warranty';
import {
  fetchPostedWarrantyComponentHistoryPage,
  fetchPostedWarrantyComponentHistoryDocument,
  type WarrantyComponentHistoryDocument,
} from '../../services/wms/warrantyComponentRead';
import {
  captureSessionScope,
  isSessionScopeCurrent,
  subscribeSession,
} from '../../auth/session';
import {
  useWarrantyComponentHistory,
  type UseWarrantyComponentHistoryDeps,
} from './useWarrantyComponentHistory';
// Geometry: P20 r03/M20 history.css + DESIGN_TRACE; no board image or shared
// footer overrides. Native/Web use the same cards, groups and source data.
const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: colors.primaryStrong },
  header: {
    height: 86,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerBack: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    color: HN_UI.onBrand,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    textAlign: 'center',
  },
  surface: {
    flex: 1,
    minHeight: 0,
    marginTop: -12,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surfaceCanvas,
    overflow: 'hidden',
  },
  content: { padding: 20, paddingBottom: 24 },
  body: { gap: 14, minWidth: 0 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 12,
    padding: 18,
    gap: 14,
    minWidth: 0,
  },
  receipt: { backgroundColor: HN_UI.canvas, padding: 16, gap: 8 },
  highlighted: { borderColor: colors.primary, borderWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  between: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    minWidth: 0,
  },
  fill: { flex: 1, minWidth: 0 },
  heading: {
    color: colors.textStrong,
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '700',
  },
  caseTitle: {
    color: colors.textStrong,
    fontSize: 21,
    lineHeight: 29,
    fontWeight: '700',
  },
  bodyText: { color: colors.text, fontSize: 15, lineHeight: 23 },
  metadata: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderColor: colors.divider,
    minWidth: 0,
  },
  lineName: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },
  quantity: { width: 110, flexShrink: 0, gap: 4 },
  right: { textAlign: 'right' },
  code: {
    color: colors.textStrong,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '700',
  },
  badge: {
    maxWidth: '46%',
    flexShrink: 1,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: colors.successSoft,
  },
  badgeText: {
    color: colors.successText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  neutralBadge: { backgroundColor: colors.surfaceSubtle },
  neutralBadgeText: { color: colors.textMuted },
  statusBadge: { backgroundColor: colors.infoSoft },
  statusText: { color: colors.infoText },
  tile: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HN_OPERATIONS.warranty.soft,
  },
  docTile: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: HN_OPERATIONS.documents.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divided: { borderTopWidth: 1, borderColor: colors.divider, paddingTop: 14 },
  link: { minHeight: 44, justifyContent: 'center', paddingVertical: 10 },
  linkText: { color: colors.primary, fontSize: 15, lineHeight: 23 },
  readerLink: {
    alignItems: 'flex-start',
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  navigation: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 18,
    borderRadius: 12,
    borderColor: colors.divider,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  loading: {
    minHeight: 78,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    backgroundColor: colors.surfaceSubtle,
    padding: 14,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    backgroundColor: colors.dangerSoft,
    borderRadius: 10,
  },
  errorText: { color: colors.dangerText, fontSize: 14, lineHeight: 22 },
  empty: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 48,
  },
  emptyTile: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: HN_OPERATIONS.documents.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: { textAlign: 'center' },
  footer: {
    flexShrink: 0,
    borderTopWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
  },
  primaryAction: { minHeight: 60, borderRadius: 10 },
  pageAction: { minHeight: 54, borderRadius: 9 },
});

function HistoryFrame({
  onBack,
  footer,
  children,
}: {
  onBack: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <SvgXml
          width="100%"
          height="100%"
          xml={
            `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><defs><linearGradient id="p20-brand" x1="0" y1="0" x2="1" y2="0.5"><stop offset="0" stop-color="${HN_UI.shell}"/><stop offset="1" stop-color="${HN_UI.shell}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#p20-brand)"/></svg>`
          }
        />
      </View>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          onPress={onBack}
          style={styles.headerBack}
        >
          <AppIcon name="chevron-left" color={HN_UI.onBrand} size={24} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>
          Hồ sơ bảo hành
        </Text>
        <View pointerEvents="none" style={styles.headerBack} />
      </View>
      <View style={styles.surface}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {footer ? (
          <View testID="p20-footer" style={styles.footer}>
            {footer}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const statusLabels: Record<string, string> = {
  RECEIVED: 'Đã tiếp nhận',
  CHECKING: 'Đang kiểm tra',
  REPAIRING: 'Đang sửa',
  COMPLETED: 'Chờ bàn giao',
  RETURNED: 'Đã trả khách',
  CANCELLED: 'Đã hủy',
};

function knownText(value?: string | null) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function CountBadge({
  label,
  neutral = false,
}: {
  label: string;
  neutral?: boolean;
}) {
  return (
    <View style={[styles.badge, neutral && styles.neutralBadge]}>
      <Text style={[styles.badgeText, neutral && styles.neutralBadgeText]}>
        {label}
      </Text>
    </View>
  );
}

function ReadError({ message }: { message: string }) {
  return (
    <View style={styles.error} accessibilityLiveRegion="polite">
      <AppIcon name="info" color={colors.danger} size={20} />
      <Text style={[styles.errorText, styles.fill]}>{message}</Text>
    </View>
  );
}

/** Counts of lines/codes/documents are never used as issued quantity. */
function receiptSummary(document: WarrantyComponentHistoryDocument) {
  if (document.detailUnavailable || !document.lines.length)
    return 'Loại linh kiện · Tổng số lượng: Chưa xác minh';
  const codes = document.lines.map(line => knownText(line.skuCode));
  const types = codes.every(Boolean)
    ? new Set(codes).size + ' loại linh kiện'
    : 'Loại linh kiện: Chưa xác minh';
  const complete =
    document.quantityStatus !== 'INCOMPLETE' &&
    document.quantityStatus !== 'MISMATCH' &&
    document.lines.every(
      line =>
        line.quantityStatus === 'CONFIRMED' &&
        line.quantity !== null &&
        Number.isSafeInteger(line.quantity) &&
        line.quantity >= 0,
    );
  if (!complete) return types + ' · Tổng số lượng: Chưa xác minh';
  const sum = document.lines.reduce((n, line) => n + line.quantity!, 0);
  if (
    !Number.isSafeInteger(sum) ||
    (document.quantityTotal !== undefined && document.quantityTotal !== sum)
  )
    return types + ' · Tổng số lượng: Chưa xác minh';
  const units = new Map<string, number>();
  for (const line of document.lines) {
    const unit = knownText(line.unit);
    if (!unit || line.unitSource !== 'CURRENT_SKU_CATALOG')
      return types + ' · Tổng số lượng ' + sum + ' (đơn vị chưa xác minh)';
    units.set(unit, (units.get(unit) ?? 0) + line.quantity!);
  }
  return (
    types +
    ' · Tổng số lượng ' +
    [...units].map(([unit, quantity]) => quantity + ' ' + unit).join(' · ')
  );
}

/** Presentation handoff only. The supplying owner must retain/revalidate the
 * original UNKNOWN request and expose a GET-only check, never a new writer.
 */
export interface P20OriginalRequestCheck {
  caseId: string;
  requestId: string;
  state: 'UNKNOWN';
  onCheck: () => void;
  disabled?: boolean;
}

export function P20HistoryScreen(props:React.ComponentProps<typeof P20HistoryScreenContent>){
  return <ThemeProvider fontFamily={Platform.OS==='web'?'Public Sans':undefined}><P20HistoryScreenContent {...props}/></ThemeProvider>;
}
function P20HistoryScreenContent({
  caseId,
  service,
  onBack,
  historyLoad,
  selectedLoad,
  selectedDocumentId,
  onIssueNew,
  onResume,
  onTimeline,
  onOpenCase,
  originalRequestCheck,
  initialScrollY,
  onScrollPositionChange,
}: {
  caseId: string;
  service: P09Service;
  onBack: () => void;
  historyLoad?: UseWarrantyComponentHistoryDeps['load'];
  selectedLoad?: typeof fetchPostedWarrantyComponentHistoryDocument;
  selectedDocumentId?: string;
  onIssueNew?: (record: P09Case) => void;
  onResume?: (caseId: string) => void;
  onTimeline?: (caseId: string) => void;
  onOpenCase?: (caseId: string) => void;
  originalRequestCheck?: P20OriginalRequestCheck;
  initialScrollY?: number;
  onScrollPositionChange?: (offset: number) => void;
}) {
  const [record, setRecord] = useState<P09Case>(),
    [error, setError] = useState<string>(),
    [revision, setRevision] = useState(0);
  const context = service.contextKey();
  const verifiedContext = useRef<string | undefined>(undefined);
  const scopedLoad = useMemo<
    NonNullable<UseWarrantyComponentHistoryDeps['load']>
  >(
    () => async (id, options) => {
      if (!context || service.contextKey() !== context)
        throw new AppError({
          kind: 'cancelled',
          message: 'Quyền/ngữ cảnh lịch sử đã thay đổi.',
        });
      const result = await (
        historyLoad ?? fetchPostedWarrantyComponentHistoryPage
      )(id, options);
      if (service.contextKey() !== context)
        throw new AppError({
          kind: 'cancelled',
          message: 'Quyền/ngữ cảnh lịch sử đã thay đổi.',
        });
      return result;
    },
    [service, context, historyLoad],
  );
  useEffect(() => {
    let active = true;
    verifiedContext.current = undefined;
    setRecord(undefined);
    setError(undefined);
    service
      .detail(caseId)
      .then(value => {
        if (!active || service.contextKey() !== context) return;
        if (value.warranty_case_id !== caseId)
          throw new AppError({
            kind: 'parse',
            message: 'Hồ sơ trả về khác ID được yêu cầu.',
          });
        if (value.capabilities?.posted_component_issues_read !== true)
          throw new AppError({
            kind: 'blocked_by_gate',
            message: 'Quyền đọc linh kiện đã xuất chưa được xác nhận.',
          });
        verifiedContext.current = context;
        setRecord(value);
      })
      .catch(cause => {
        if (active && service.contextKey() === context)
          setError(messageForUser(toAppError(cause)));
      });
    return () => {
      active = false;
    };
  }, [caseId, service, context, revision]);
  if (
    !record ||
    record.warranty_case_id !== caseId ||
    verifiedContext.current !== context
  )
    return (
      <HistoryFrame onBack={onBack}>
        <View style={styles.card}>
          {error ? (
            <ReadError message={error} />
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.metadata}>Đang đọc hồ sơ bảo hành…</Text>
            </View>
          )}
          {error ? (
            <Button
              label="Tải lại hồ sơ"
              onPress={() => setRevision(v => v + 1)}
            />
          ) : null}
        </View>
      </HistoryFrame>
    );
  return (
    <VerifiedHistory
      key={context + caseId}
      record={record}
      onBack={onBack}
      historyLoad={scopedLoad}
      selectedLoad={selectedLoad}
      selectedDocumentId={selectedDocumentId}
      onIssueNew={onIssueNew}
      onResume={onResume}
      onTimeline={onTimeline}
      onOpenCase={onOpenCase}
      originalRequestCheck={
        originalRequestCheck && {
          ...originalRequestCheck,
          onCheck: () => {
            if (service.contextKey() === context)
              originalRequestCheck.onCheck();
          },
        }
      }
      initialScrollY={initialScrollY}
      onScrollPositionChange={onScrollPositionChange}
    />
  );
}
function VerifiedHistory({
  record,
  onBack,
  historyLoad,
  selectedLoad = fetchPostedWarrantyComponentHistoryDocument,
  selectedDocumentId,
  onIssueNew,
  onResume,
  onTimeline,
  onOpenCase,
  originalRequestCheck,
  initialScrollY,
  onScrollPositionChange,
}: {
  record: P09Case;
  onBack: () => void;
  historyLoad?: UseWarrantyComponentHistoryDeps['load'];
  selectedLoad?: typeof fetchPostedWarrantyComponentHistoryDocument;
  selectedDocumentId?: string;
  onIssueNew?: (record: P09Case) => void;
  onResume?: (caseId: string) => void;
  onTimeline?: (caseId: string) => void;
  onOpenCase?: (caseId: string) => void;
  originalRequestCheck?: P20OriginalRequestCheck;
  initialScrollY?: number;
  onScrollPositionChange?: (offset: number) => void;
}) {
  const history = useWarrantyComponentHistory(record.warranty_case_id, {
    load: historyLoad,
  });
  const [direct, setDirect] = useState<WarrantyComponentHistoryDocument>(),
    [directBinding, setDirectBinding] = useState(''),
    [directError, setDirectError] = useState<string>(),
    [directRevision, setDirectRevision] = useState(0);
  const directScope = captureSessionScope();
  const directScopeKey = JSON.stringify([
    directScope.userId,
    directScope.authSessionId,
    directScope.warehouseId,
    directScope.generation,
    selectedDocumentId,
    history.accessDenied,
  ]);
  useEffect(() => {
    const captured = captureSessionScope(),
      abort = new AbortController();
    let active = true;
    setDirect(undefined);
    setDirectBinding('');
    setDirectError(undefined);
    if (selectedDocumentId && !history.accessDenied)
      selectedLoad(record.warranty_case_id, selectedDocumentId, {
        signal: abort.signal,
      })
        .then(value => {
          if (value.id !== selectedDocumentId)
            throw new AppError({
              kind: 'parse',
              message: 'Phiếu trả về không khớp liên kết được chọn.',
            });
          if (active && isSessionScopeCurrent(captured)) {
            setDirect(value);
            setDirectBinding(directScopeKey);
          }
        })
        .catch(cause => {
          if (active && isSessionScopeCurrent(captured)) {
            setDirectError(messageForUser(toAppError(cause)));
            setDirectBinding(directScopeKey);
          }
        });
    return () => {
      active = false;
      abort.abort();
    };
  }, [
    record.warranty_case_id,
    selectedDocumentId,
    directRevision,
    directScopeKey,
    selectedLoad,
    history.accessDenied,
  ]);
  const [selected, setSelected] = useState<{
      documentId: string;
    }>(),
    scope = useRef(captureSessionScope());
  const [caseReader, setCaseReader] = useState(false);
  const [fullRead, setFullRead] = useState<{
    label: string;
    original: string;
  }>();
  const originalCheckScope = useRef(captureSessionScope()).current;
  const originalCheckAction = useRef({
    check: originalRequestCheck,
    denied: history.accessDenied,
  });
  originalCheckAction.current = {
    check: originalRequestCheck,
    denied: history.accessDenied,
  };
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  useEffect(
    () =>
      subscribeSession(() => {
        if (!isSessionScopeCurrent(scope.current)) {
          scope.current = captureSessionScope();
          setSelected(undefined);
          setCaseReader(false);
          setFullRead(undefined);
          setExpanded(new Set());
        }
      }),
    [],
  );
  useEffect(() => {
    if (history.loading || history.accessDenied) {
      setSelected(undefined);
      setCaseReader(false);
      setFullRead(undefined);
    }
  }, [history.loading, history.accessDenied]);
  const visibleDocuments = history.accessDenied
    ? []
    : selectedDocumentId
    ? [
        ...(direct && directBinding === directScopeKey ? [direct] : []),
        ...history.documents.filter(d => d.id !== selectedDocumentId),
      ]
    : history.documents;
  const selectedDocument = visibleDocuments.find(
    d => d.id === selected?.documentId,
  );
  const panel = history.loadingMore
    ? 'S02'
    : history.error && history.documents.length
    ? 'S03'
    : !history.loading &&
      !history.error &&
      !history.documents.length &&
      history.total === 0 &&
      !selectedDocumentId
    ? 'S04'
    : 'S01';
  const canIssue =
    !!onIssueNew &&
    ['CHECKING', 'REPAIRING'].includes(record.status) &&
    !history.accessDenied;
  const showEmpty = panel === 'S04';
  const countKnown =
    !history.loading && !history.accessDenied && history.total !== null;
  const footer = canIssue ? (
    <Button
      label="Xuất linh kiện mới"
      style={styles.primaryAction}
      onPress={() => onIssueNew?.(record)}
    />
  ) : (
    <Button
      label="Quay lại"
      variant="secondary"
      style={styles.primaryAction}
      onPress={onBack}
    />
  );
  const returned = record.status === 'RETURNED';
  const content = (
    <View testID={'p20-' + panel} style={styles.body}>
      {!returned ? (
        <>
          <View testID="p20-case-context" style={styles.card}>
            <View style={styles.row}>
              <View style={styles.tile}>
                <AppIcon
                  name="warranty"
                  color={HN_OPERATIONS.warranty.ink}
                  size={26}
                />
              </View>
              <View style={styles.fill}>
                <Text style={styles.caseTitle} numberOfLines={2}>
                  {knownText(record.warranty_case_code) ??
                    record.warranty_case_id}
                </Text>
                <Text style={styles.metadata} numberOfLines={2}>
                  {knownText(record.sku_name) ??
                    knownText(record.manual_product_description) ??
                    'Sản phẩm chưa xác minh'}
                </Text>
              </View>
              <View style={[styles.badge, styles.statusBadge]}>
                <Text style={[styles.badgeText, styles.statusText]}>
                  {statusLabels[record.status] ?? 'Trạng thái chưa xác minh'}
                </Text>
              </View>
            </View>
            <Text style={styles.metadata} numberOfLines={2}>
              SN: {knownText(record.serial_number) ?? 'Chưa xác minh'}
            </Text>
            <View style={[styles.between, styles.divided]}>
              <Text style={styles.metadata}>Khách hàng</Text>
              <Text
                style={[styles.bodyText, styles.fill, styles.right]}
                numberOfLines={2}
              >
                {knownText(record.customer_name) ?? 'Chưa xác minh'}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xem thông tin hồ sơ"
            style={styles.navigation}
            onPress={() => {
              if (onOpenCase) {
                onOpenCase(record.warranty_case_id);
                return;
              }
              setSelected(undefined);
              setFullRead(undefined);
              setCaseReader(true);
            }}
          >
            <Text style={[styles.linkText, styles.fill]}>
              Xem thông tin hồ sơ
            </Text>
            <AppIcon name="chevron-right" color={colors.textStrong} size={22} />
          </Pressable>
        </>
      ) : null}
      <View
        testID="p20-history-card"
        style={returned ? styles.body : styles.card}
      >
        {!returned ? (
          <>
            <View style={styles.between}>
              <Text
                accessibilityRole="header"
                style={[styles.heading, styles.fill]}
              >
                Linh kiện đã xuất
              </Text>
              <CountBadge
                neutral={!countKnown}
                label={
                  countKnown
                    ? history.documents.length + ' phiếu đã tải'
                    : 'Chưa xác minh'
                }
              />
            </View>
            <Text style={styles.metadata}>
              Phiếu đã xác nhận xuất kho cho hồ sơ này.
            </Text>
          </>
        ) : null}
        {countKnown ? (
          <Text style={styles.metadata}>
            Đã tải {history.documents.length} phiếu · Tổng {history.total} phiếu
          </Text>
        ) : null}
        {selectedDocumentId ? (
          <View style={styles.body}>
            <Text style={styles.metadata} selectable>
              Phiếu được chọn: {selectedDocumentId}
            </Text>
            {history.accessDenied ? (
              <Text style={styles.metadata}>
                Quyền đọc chưa được xác nhận lại. Chi tiết phiếu đã được ẩn.
              </Text>
            ) : directError && directBinding === directScopeKey ? (
              <>
                <ReadError message={directError} />
                <Button
                  label="Tải lại đúng phiếu đã chọn"
                  variant="secondary"
                  style={styles.pageAction}
                  onPress={() => setDirectRevision(n => n + 1)}
                />
              </>
            ) : !direct || directBinding !== directScopeKey ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.metadata}>
                  Đang đọc đúng phiếu đã chọn…
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {history.loading ? (
          <View testID="p20-initial-loading" style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.metadata}>Đang tải lịch sử…</Text>
          </View>
        ) : null}
        {visibleDocuments.map(d => (
          <View
            testID={'p20-receipt-' + d.id}
            key={d.id}
            style={[
              styles.card,
              styles.receipt,
              d.id === selectedDocumentId && styles.highlighted,
            ]}
          >
            <View style={styles.row}>
              <View style={styles.docTile}>
                <AppIcon
                  name="document"
                  color={HN_OPERATIONS.documents.ink}
                  size={20}
                />
              </View>
              <Text style={[styles.heading, styles.fill]} numberOfLines={2}>
                {knownText(d.documentNumber) ?? d.id}
              </Text>
              <CountBadge label="Đã xuất" />
            </View>
            <Text style={styles.metadata}>{postedTime(d.postedAt)}</Text>
            <Text testID={'p20-summary-' + d.id} style={styles.metadata}>
              {receiptSummary(d)}
            </Text>
            {d.detailUnavailable ? (
              <Text style={styles.metadata}>
                Chưa tải được chi tiết của phiếu này; lịch sử được giữ lại.
              </Text>
            ) : (
              <>
                {(expanded.has(d.id) ? d.lines : d.lines.slice(0, 3)).map(l => (
                  <View key={l.id} style={styles.line}>
                    <View style={styles.fill}>
                      <Text style={styles.code} numberOfLines={2}>
                        {knownText(l.skuCode) ?? 'SKU chưa xác minh'}
                      </Text>
                      <Text style={styles.lineName} numberOfLines={3}>
                        {knownText(l.skuName) ?? 'Tên linh kiện chưa xác minh'}
                      </Text>
                    </View>
                    <View style={styles.quantity}>
                      <Text style={[styles.code, styles.right]}>
                        {lineQuantity(l)}
                      </Text>
                      <Text style={[styles.metadata, styles.right]}>
                        {lineCodeCount(l)}
                      </Text>
                    </View>
                  </View>
                ))}
                {d.lines.length > 3 ? (
                  <Button
                    label={
                      expanded.has(d.id)
                        ? 'Thu gọn linh kiện'
                        : 'Xem tất cả ' + d.lines.length + ' dòng linh kiện'
                    }
                    variant="secondary"
                    onPress={() =>
                      setExpanded(current => {
                        const next = new Set(current);
                        if (next.has(d.id)) next.delete(d.id);
                        else next.add(d.id);
                        return next;
                      })
                    }
                  />
                ) : null}
              </>
            )}
            <Button
              label="Xem mã đã xuất"
              variant="secondary"
              accessibilityLabel={
                'Xem đầy đủ phiếu ' + (knownText(d.documentNumber) ?? d.id)
              }
              style={[styles.link, styles.readerLink]}
              labelStyle={styles.linkText}
              onPress={() => {
                setCaseReader(false);
                setFullRead(undefined);
                setSelected({ documentId: d.id });
              }}
            />
          </View>
        ))}
        {history.loadingMore ? (
          <View
            testID="p20-loading-more"
            style={styles.loading}
            accessibilityLiveRegion="polite"
          >
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.metadata}>Đang tải thêm…</Text>
          </View>
        ) : null}
        {history.error ? <ReadError message={history.error} /> : null}
        {showEmpty ? (
          <View testID="p20-verified-empty" style={styles.empty}>
            <View style={styles.emptyTile}>
              <AppIcon
                name="box"
                color={HN_OPERATIONS.documents.ink}
                size={30}
              />
            </View>
            <Text style={[styles.heading, styles.centered]}>
              Chưa có linh kiện đã xuất
            </Text>
            <Text style={[styles.metadata, styles.centered]}>
              Phiếu xuất sẽ xuất hiện ở đây sau khi được xác nhận.
            </Text>
          </View>
        ) : null}
        {!history.loading &&
        !history.error &&
        !history.documents.length &&
        history.total !== null &&
        history.total > 0 ? (
          <View style={styles.body}>
            <Text style={styles.metadata}>
              Trang hiện tại rỗng nhưng tổng nguồn vẫn có dữ liệu.
            </Text>
            <Button
              label="Đọc lại trang đầu"
              variant="secondary"
              style={styles.pageAction}
              onPress={history.refresh}
            />
          </View>
        ) : null}
        {history.error || history.hasMore ? (
          <Button
            label={
              history.loadingMore
                ? 'Đang tải thêm…'
                : history.error
                ? history.documents.length
                  ? 'Thử lại tải thêm'
                  : 'Tải lại lịch sử'
                : 'Tải thêm'
            }
            variant="secondary"
            style={styles.pageAction}
            disabled={history.loadingMore}
            onPress={
              history.documents.length
                ? history.loadMore
                : history.error
                ? history.refresh
                : history.loadMore
            }
          />
        ) : null}
      </View>
      {record.status === 'CANCELLED' ? (
        <Text style={styles.metadata}>
          Hồ sơ chỉ đọc. Không xuất linh kiện mới; phiếu đang đối chiếu vẫn
          thuộc yêu cầu gốc.
        </Text>
      ) : null}
      {!returned && (onResume || onTimeline) ? (
        <View style={styles.card}>
          {onResume ? (
            <Button
              label="Tiếp tục phiếu linh kiện"
              variant="secondary"
              onPress={() => onResume(record.warranty_case_id)}
            />
          ) : null}
          {onTimeline ? (
            <Button
              label="Xem quá trình bảo hành"
              variant="secondary"
              onPress={() => onTimeline(record.warranty_case_id)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
  const reader = (
    <Dialog
      visible={!!selectedDocument || caseReader || !!fullRead}
      title={fullRead?.label ?? (caseReader ? 'Thông tin hồ sơ' : 'Mã đã xuất')}
      dismissOnBackdrop={false}
      onDismiss={() => {
        setSelected(undefined);
        setCaseReader(false);
        setFullRead(undefined);
      }}
      footer={
        <Button
          label="Đóng"
          onPress={() => {
            setSelected(undefined);
            setCaseReader(false);
            setFullRead(undefined);
          }}
        />
      }
    >
      <View style={styles.body}>
        {fullRead ? (
          <Text selectable>{fullRead.original}</Text>
        ) : caseReader ? (
          <>
            <Text selectable>
              {record.warranty_case_code ?? record.warranty_case_id}
            </Text>
            <Text selectable>ID hồ sơ: {record.warranty_case_id}</Text>
            <Text selectable>
              Sản phẩm:{' '}
              {knownText(record.sku_name) ??
                knownText(record.manual_product_description) ??
                'Chưa xác minh'}
            </Text>
            <Text selectable>
              SN: {knownText(record.serial_number) ?? 'Chưa xác minh'}
            </Text>
            <Text selectable>
              Khách hàng: {knownText(record.customer_name) ?? 'Chưa xác minh'}
            </Text>
            <Text>
              Trạng thái: {statusLabels[record.status] ?? 'Chưa xác minh'}
            </Text>
          </>
        ) : selectedDocument ? (
          <>
            <Text selectable>
              {selectedDocument.documentNumber ?? selectedDocument.id}
            </Text>
            <Text selectable>ID phiếu: {selectedDocument.id}</Text>
            <Text>{postedTime(selectedDocument.postedAt)}</Text>
            <Text>{receiptSummary(selectedDocument)}</Text>
            {selectedDocument.detailUnavailable ? (
              <Text>
                Chưa tải được chi tiết của phiếu này; không có bằng chứng mã
                được xác minh.
              </Text>
            ) : null}
            {selectedDocument.lines.map(line => (
              <View key={line.id} style={styles.body}>
                <Text selectable>
                  {knownText(line.skuCode) ?? 'SKU chưa xác minh'} ·{' '}
                  {knownText(line.skuName) ?? 'Tên chưa xác minh'}
                </Text>
                <Text>
                  {lineQuantity(line)} ·{' '}
                  {line.unitSource === 'CURRENT_SKU_CATALOG'
                    ? 'Đơn vị từ catalog hiện tại'
                    : 'Đơn vị chưa ghi nhận'}
                </Text>
                {line.codes.length === 0 ? (
                  <Text>Chưa có bằng chứng mã đã xuất.</Text>
                ) : (
                  line.codes.map((code, i) => (
                    <Text selectable key={i}>
                      {code.rawCode ?? 'Chưa xác minh'} · {code.status}
                    </Text>
                  ))
                )}
              </View>
            ))}
          </>
        ) : null}
      </View>
    </Dialog>
  );
  // All hooks and the single P20 read owner above are unconditional. P24 is a
  // presentation shell only, not another frame/store/history request.
  const closedCount =
    history.loading ||
    history.accessDenied ||
    (history.total === null && !visibleDocuments.length)
      ? null
      : new Set(visibleDocuments.map(document => document.id)).size;
  const originalCheck =
    returned &&
    isSessionScopeCurrent(originalCheckScope) &&
    originalRequestCheck?.state === 'UNKNOWN' &&
    originalRequestCheck.caseId === record.warranty_case_id &&
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
      originalRequestCheck.requestId,
    )
      ? {
          label: 'Đối chiếu yêu cầu gốc',
          disabled: !!originalRequestCheck.disabled || !!history.accessDenied,
          onPress: () => {
            const latest = originalCheckAction.current;
            if (
              latest.check?.state === 'UNKNOWN' &&
              latest.check.caseId === originalRequestCheck.caseId &&
              latest.check.requestId === originalRequestCheck.requestId &&
              !latest.check.disabled &&
              !latest.denied &&
              isSessionScopeCurrent(originalCheckScope)
            )
              originalRequestCheck.onCheck();
          },
        }
      : undefined;
  return (
    <>
      {returned ? (
        <P24ClosedCasePresentation
          context={{
            caseId: record.warranty_case_id,
            caseLabel: knownText(record.warranty_case_code) ?? null,
            productName:
              knownText(record.sku_name) ??
              knownText(record.manual_product_description) ??
              null,
            status: 'RETURNED',
            serial: knownText(record.serial_number) ?? null,
            customerName: knownText(record.customer_name) ?? null,
          }}
          loadedDocumentCount={closedCount}
          onBack={onBack}
          onOpenCase={() => {
            if (onOpenCase) {
              onOpenCase(record.warranty_case_id);
              return;
            }
            setSelected(undefined);
            setFullRead(undefined);
            setCaseReader(true);
          }}
          onTimeline={() => {
            if (onTimeline) {
              onTimeline(record.warranty_case_id);
              return;
            }
            setSelected(undefined);
            setCaseReader(false);
            setFullRead({
              label: 'Quá trình bảo hành',
              original: 'Chưa có nguồn quá trình bảo hành trong ngữ cảnh này.',
            });
          }}
          originalRequestCheck={originalCheck}
          onReadFull={(label, original) => {
            if (!isSessionScopeCurrent(originalCheckScope)) return;
            setSelected(undefined);
            setCaseReader(false);
            setFullRead({ label, original });
          }}
          initialScrollY={initialScrollY}
          onScrollPositionChange={onScrollPositionChange}
        >
          {content}
        </P24ClosedCasePresentation>
      ) : (
        <HistoryFrame onBack={onBack} footer={footer}>
          {content}
        </HistoryFrame>
      )}
      {reader}
    </>
  );
}
function postedTime(raw: string | null) {
  return formatVietnamDateTime(raw, { missing: 'Chưa xác minh thời điểm' });
}

function lineQuantity(line: WarrantyComponentHistoryDocument['lines'][number]) {
  return line.quantityStatus !== 'CONFIRMED' ||
    line.quantity === null ||
    !Number.isSafeInteger(line.quantity) ||
    line.quantity < 0
    ? 'Số lượng: Chưa xác minh'
    : line.quantity +
        ' ' +
        (line.unitSource === 'CURRENT_SKU_CATALOG'
          ? knownText(line.unit) ?? 'đơn vị chưa xác minh'
          : 'đơn vị chưa xác minh');
}

function lineCodeCount(
  line: WarrantyComponentHistoryDocument['lines'][number],
) {
  const raw = line.codes.map(code => code.rawCode);
  return line.scannedCodeCount === null ||
    !Number.isSafeInteger(line.scannedCodeCount) ||
    !raw.length ||
    line.codes.some(
      code => code.status !== 'RECORDED' || !knownText(code.rawCode),
    ) ||
    line.scannedCodeCount !== new Set(raw).size
    ? 'Mã quét: Chưa xác minh'
    : line.scannedCodeCount + ' mã/hộp';
}
