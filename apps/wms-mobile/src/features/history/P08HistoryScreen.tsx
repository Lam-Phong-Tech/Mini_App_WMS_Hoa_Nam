import {HN_UI} from '../../theme/uiKitV3';
import {HN_OPERATIONS} from '../../ui/hnHomeTokens';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import {
  P08Text as Text,
  P08Badge as Badge,
  P08OperationIcon,
  P08_OPERATIONS,
  P08ControlIcon,
} from './P08Presentation';
import { Button } from '../../ui/Button';
import { HistoryFilterBar } from './HistoryFilterBar';
import { Dialog } from '../../ui/Dialog';
import type { BadgeTone } from '../../ui/Badge';
import { FilterChipRow } from '../../ui/FilterChipRow';
import { AppIcon, type AppIconName } from '../../ui/AppIcon';
import { messageForUser } from '../../errors/AppError';
import { P15PermissionScreen } from '../system/P15Screen';
import { useHardwareBack } from '../../app/useHardwareBack';
import { useTheme } from '../../theme/ThemeProvider';
import {
  createP08History,
  p08ContextKey,
  p08Identity,
} from '../../services/wms/p08History';
import type {
  P08Context,
  P08Event,
  P08Filters,
  P08HistoryService,
  P08PageMeta,
  P08Source,
} from '../../services/wms/p08Types';
import { createP08Controller, type P08State } from './p08HistoryController';
import { p08DateLabel, p08QuickDate, p08TimeLabel } from './p08Dates';
import { P08FilterDialog } from './P08FilterDialog';
import {
  historyAction,
  historyStatus,
  historySource,
} from './historyPresentation';

export interface P08HistoryScreenProps {
  context: P08Context;
  service?: P08HistoryService;
  retainedState?: { current: P08State | undefined };
  initialFilters?: P08Filters;
  initialMode?: 'records' | 'summary';
  initialRecordId?: string;
  onBack: () => void;
  onHome?: () => void;
  onOpenDocument: (
    kind: 'inbound' | 'outbound',
    id: string,
    tab?: 'files',
  ) => void;
  onOpenNfc?: (recordId: string, activityId: string) => void;
  onOpenWarranty?: (id: string, tab?: 'files') => void;
  onOpenSession?: (sessionId: string) => void;
}
const names = {
  S01: 'Lịch sử',
  S02: 'Chi tiết lịch sử',
  S03: 'Phiên quét',
  S04: 'Hoạt động theo ngày',
};
const businesses = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'INBOUND', label: 'Nhập kho' },
  { key: 'OUTBOUND', label: 'Xuất kho' },
  { key: 'WARRANTY', label: 'Bảo hành' },
  { key: 'NFC', label: 'NFC' },
  { key: 'SCAN', label: 'Quét' },
  { key: 'OTHER', label: 'Khác' },
];
/** The approved P08 list filter has five visible business choices.
 * SCAN/OTHER remain readable in records and summary drill-down, but do not
 * create extra horizontal chips that are absent from the canonical panel.
 */
const listBusinesses = businesses.filter(item =>
  ['ALL', 'INBOUND', 'OUTBOUND', 'WARRANTY', 'NFC'].includes(item.key),
);
type BusinessKey = (typeof businesses)[number]['key'];
const presentation: Record<
  Exclude<BusinessKey, 'ALL'>,
  { icon: AppIconName; color: string; soft: string }
> = {
  INBOUND: { icon: 'inbound', color: HN_UI.success, soft: HN_UI.successSoft },
  OUTBOUND: { icon: 'outbound', color: HN_UI.textLink, soft: HN_UI.canvas },
  WARRANTY: { icon: 'warranty', color: HN_UI.warning, soft: HN_UI.warningSoft },
  NFC: { icon: 'nfc', color: HN_OPERATIONS.nfc.ink, soft: HN_OPERATIONS.nfc.soft },
  SCAN: { icon: 'scan', color: HN_UI.textLink, soft: HN_UI.canvas },
  OTHER: { icon: 'document', color: HN_UI.textMuted, soft: HN_UI.canvas },
};
const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  searchField: { flex: 1, minWidth: 0 },
  filterButton: {
    width: 50,
    height: 50,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBar: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  listMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  /** P08 reference cards use a quiet one-pixel boundary. Box elevation is a
   * shared default, so neutralize it locally rather than changing every board.
   */
  flatCard: {
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBubble: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  eventMain: { flex: 1, minWidth: 0, gap: 2 },
  eventSide: { alignItems: 'flex-end', gap: 7, maxWidth: 150 },
  eventLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  eventTitle: { flex: 1, minWidth: 0 },
  eventTime: { flexShrink: 0, textAlign: 'right', paddingTop: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoRows: { gap: 0 },
  detailHero: {flexDirection:'row',alignItems:'center',gap:12},
  detailIdentity: {flex:1,minWidth:0,gap:3},
  detailDocument: {flexDirection:'row',alignItems:'center',gap:10,padding:10,borderRadius:8,backgroundColor:HN_UI.canvas},
  detailCopy: {minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'},
  detailNote: {padding:12,borderRadius:8,backgroundColor:HN_UI.canvas,gap:6},
  detailLink: {borderWidth:0,borderRadius:8,paddingVertical:6,paddingHorizontal:12,minHeight:48},
  detailLinkLabel: {flex:1,textAlign:'left'},
  infoRow: {
    minHeight: 42,
    paddingVertical: 9,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderColor: HN_UI.border,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { width: 110, flexShrink: 0 },
  infoValue: { flex: 1, minWidth: 0 },
  timeline: { gap: 0 },
  timelineRow: { flexDirection: 'row', gap: 12, minHeight: 76 },
  timelineRail: { width: 18, alignItems: 'center' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  timelineLine: { width: 2, flex: 1, minHeight: 42 },
  timelineBody: { flex: 1, minWidth: 0, paddingBottom: 16, gap: 3 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', margin: -5 },
  metricCell: { width: '50%', padding: 5 },
  metricTile: { minHeight: 88, borderRadius: 12, padding: 12, gap: 4 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', margin: -5 },
  summaryCell: { width: '33.333%', padding: 5 },
  summaryTile: { minHeight: 96, borderRadius: 12, padding: 12, gap: 4 },
  summaryIcon: { alignSelf: 'flex-end' },
  summaryTotalIcon: {color:HN_UI.onBrand,fontSize:24,lineHeight:26},
  whiteText: { color: HN_UI.onBrand },
  groupList: { gap: 0 },
  groupRow: {
    minHeight: 58,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  groupIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, minWidth: 0 },
});
function businessLabel(key: string): string {
  return businesses.find(item => item.key === key)?.label ?? key;
}
function eventPresentation(event: P08Event) {
  const key = (
    presentation[event.business as Exclude<BusinessKey, 'ALL'>]
      ? event.business
      : event.source === 'SCAN'
      ? 'SCAN'
      : 'OTHER'
  ) as Exclude<BusinessKey, 'ALL'>;
  const operation =
    P08_OPERATIONS[key as keyof typeof P08_OPERATIONS] ?? P08_OPERATIONS.OTHER;
  return {
    ...presentation[key],
    color: operation.ink,
    soft: operation.soft,
    label: businessLabel(key),
  };
}
function statusTone(status: string | null): BadgeTone {
  const value = status?.toUpperCase() ?? '';
  if (/FAILED|REJECTED|ERROR|CANCEL/.test(value)) return 'danger';
  if (/PENDING|SCANNING|CHECKING|DUPLICATE|WAIT/.test(value)) return 'warning';
  if (/VALID|ACCEPTED|POSTED|RECEIVED|SUCCESS|COMPLETE|RESOLVED/.test(value))
    return 'success';
  return 'primary';
}
function compactRecord(recordId: string): string {
  const identity = p08Identity(recordId);
  return `${historySource(identity.source)} · ${identity.uuid
    .slice(0, 8)
    .toUpperCase()}`;
}
function groupSource(business: string): P08Source | undefined {
  return business === 'INBOUND' || business === 'OUTBOUND'
    ? 'DOCUMENT'
    : business === 'OTHER'
    ? undefined
    : (business as P08Source);
}
function detailBusinessLabel(
  event: P08Event | null | undefined,
  source: P08Source | undefined,
  filter: P08Filters['business'],
): string {
  if (event) return businessLabel(event.business);
  if (filter && filter !== 'ALL') return businessLabel(filter);
  return source === 'DOCUMENT'
    ? 'Chứng từ'
    : source
    ? businessLabel(source)
    : 'Chưa chọn hoạt động';
}
export function P08HistoryScreen({
  context,
  service,
  retainedState,
  onBack,
  onHome,
  onOpenDocument,
  onOpenWarranty,
  onOpenNfc,
  onOpenSession,
  initialFilters,
  initialMode,
  initialRecordId,
}: P08HistoryScreenProps): React.ReactElement {
  // Initial entry is mount-only. AppShell keys direct entries by owner route;
  // filter objects from callers must not dispose/recreate a live controller.
  const entry = useRef({ initialFilters, initialMode, initialRecordId });
  const theme = useTheme(),
    contextRef = useRef(context);
  contextRef.current = context;
  const api = useMemo(
    () => service ?? createP08History(() => contextRef.current),
    [service],
  );
  const controller = useMemo(
    () => createP08Controller(api, retainedState?.current),
    [api, retainedState],
  );
  const [state, setState] = useState(controller.snapshot());
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterSection, setFilterSection] = useState<
    'all' | 'dates' | 'status'
  >('all');
  const [sortOpen, setSortOpen] = useState(false);
  const [tab, setTab] = useState<'info' | 'timeline' | 'attachments'>('info');
  const scope = p08ContextKey(context);
  const v = state.scope === api.scopeKey() ? state.current : undefined;
  useEffect(() => {
    const off = controller.subscribe(() => setState(controller.snapshot()));
    const entrySettings = entry.current;
    if (!controller.snapshot().current.meta) {
      if (entrySettings.initialRecordId && !retainedState?.current)
        controller.record(
          entrySettings.initialRecordId,
          entrySettings.initialFilters,
        );
      else if (
        entrySettings.initialMode === 'summary' &&
        !retainedState?.current
      )
        controller.summaryRoot(entrySettings.initialFilters);
      else if (!retainedState?.current && entrySettings.initialFilters) {
        controller.filters(entrySettings.initialFilters);
      } else controller.load();
    }
    return () => {
      controller.refreshScope();
      if (retainedState) retainedState.current = controller.snapshot();
      off();
      controller.dispose();
    };
  }, [controller, retainedState]);
  useEffect(() => {
    controller.refreshScope();
    setFilterOpen(false);
    setSortOpen(false);
  }, [controller, scope]);
  const back = () => {
    if (sortOpen) {
      setSortOpen(false);
      return true;
    }
    if (filterOpen) {
      setFilterOpen(false);
      return true;
    }
    if (controller.back()) return true;
    onBack();
    return true;
  };
  useHardwareBack(back);
  if (!v)
    return (
      <Page title="Lịch sử" onBack={onBack}>
        <Text>Cần xác nhận lại phiên và kho làm việc.</Text>
      </Page>
    );
  // A trusted WMS/local admission code is required; an edge/parse403 is not RBAC.
  const permissionDenied =
    v.error?.kind === 'http' &&
    v.error.status === 403 &&
    ['HISTORY_READ_FORBIDDEN', 'PERMISSION_DENIED', 'FORBIDDEN'].includes(
      v.error.code ?? '',
    );
  if (permissionDenied)
    return (
      <P15PermissionScreen
        ownerKey={scope}
        isCurrent={() =>
          p08ContextKey(contextRef.current) === scope &&
          controller.snapshot().scope === api.scopeKey()
        }
        actionLabel="đọc lịch sử"
        onBack={() => {
          back();
        }}
        onHome={onHome}
      />
    );
  const rows =
    v.panel === 'S01'
      ? v.rows
      : v.panel === 'S02'
      ? v.detail?.events || []
      : v.batch?.events || [];
  const paging = v.meta as P08PageMeta | undefined;
  const partial =
    v.meta &&
    Object.values(v.meta.sources).some(s =>
      ['PARTIAL', 'UNAVAILABLE'].includes(s.status),
    );
  const documentUnavailable = v.meta?.sources.DOCUMENT.status === 'UNAVAILABLE';
  const documentScope =
    v.filters.source === 'DOCUMENT' ||
    v.filters.business === 'INBOUND' ||
    v.filters.business === 'OUTBOUND';
  const verifiedWarehouseName =
    context.user?.available_warehouses?.find(
      warehouse =>
        warehouse.warehouse_id === context.session?.activeWarehouseId,
    )?.name?.trim();
  const warehouseName = verifiedWarehouseName || 'Kho hiện tại';
  const dateText =
    v.filters.date_mode === 'ALL'
      ? 'Tất cả ngày'
      : v.filters.date_mode === 'DATE'
      ? p08DateLabel(v.filters.date)
      : `${p08DateLabel(v.filters.from)} – ${p08DateLabel(v.filters.to)}`;
  let compactDateText =
    v.filters.date_mode === 'RANGE' ? 'Khoảng ngày' : dateText;
  if (v.filters.date_mode === 'RANGE' && v.meta?.timezone) {
    try {
      for (const days of [7, 30, 90] as const) {
        const quick = p08QuickDate(days, v.meta.timezone);
        if (
          quick.date_mode === 'RANGE' &&
          quick.from === v.filters.from &&
          quick.to === v.filters.to
        )
          compactDateText = `${days} ngày gần đây`;
      }
    } catch {
      /* Keep the exact range in its accessible label if the clock is unverified. */
    }
  }
  function openFilter(section: 'all' | 'dates' | 'status' = 'all') {
    Keyboard.dismiss();
    setFilterSection(section);
    setFilterOpen(true);
  }
  const openOwner = (e: P08Event) => {
    if (
      e.detail.canOpen &&
      e.source === 'DOCUMENT' &&
      ['INBOUND', 'OUTBOUND'].includes(e.business)
    )
      onOpenDocument(
        e.business === 'INBOUND' ? 'inbound' : 'outbound',
        p08Identity(e.recordId).uuid,
      );
  };
  const eventCard = (e: P08Event, press = false) => {
    const item = eventPresentation(e);
    const title = e.label?.trim() || item.label;
    const action = historyAction(e.action);
    const instant =
      e.time && v.meta
        ? p08TimeLabel(e.time, v.meta.timezone)
        : 'Chưa ghi nhận';
    const time =
      press && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(instant)
        ? instant.slice(0, 16)
        : instant;
    return (
      <Box
        card
        padding="md"
        key={e.activityId}
        style={[styles.flatCard, styles.eventCard]}
      >
        <View style={[styles.iconBubble, { backgroundColor: item.soft }]}>
          <P08OperationIcon business={e.business} />
        </View>
        <View style={styles.eventMain}>
          <View style={styles.eventLine}>
            <Text
              variant="cardTitle"
              numberOfLines={2}
              style={styles.eventTitle}
            >
              {title}
            </Text>
            <Text variant="caption" tone="muted" style={styles.eventTime}>
              {time}
            </Text>
          </View>
          <View style={styles.eventLine}>
            <Text style={styles.flex}>
              {press
                ? e.business === 'NFC'
                  ? 'Quét NFC'
                  : e.business === 'SCAN'
                  ? 'Quét mã'
                  : item.label
                : action}
            </Text>
            <Badge
              label={historyStatus(e.status)}
              tone={statusTone(e.status)}
            />
          </View>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {press && verifiedWarehouseName ? verifiedWarehouseName : compactRecord(e.recordId)}
          </Text>
        </View>
        {press ? (
          <P08ControlIcon
            name="chevron"
            color={theme.colors.primary}
            size={18}
          />
        ) : null}
      </Box>
    );
  };
  const infoRow = (label: string, value: React.ReactNode, last = false,icon?:AppIconName) => (
    <View style={[styles.infoRow, last && styles.infoRowLast]} key={label}>
      {icon ? <AppIcon name={icon} size={18} color={theme.colors.textMuted}/> : null}
      <Text variant="caption" tone="muted" style={styles.infoLabel}>
        {label}
      </Text>
      <View style={styles.infoValue}>
        {typeof value === 'string' ? <Text>{value}</Text> : value}
      </View>
    </View>
  );
  const documentLink=()=>{
    const detail=v.detail;
    const target=detail?.recordTarget?.detail;
    if(target && (target.kind!=='warranty'||onOpenWarranty)) return (
      <Button label="Xem chứng từ" variant="secondary" style={styles.detailLink} labelStyle={styles.detailLinkLabel}
        leading={<AppIcon name="document"/>} trailing={<P08ControlIcon name="chevron"/>}
        onPress={()=>{if(target.kind==='warranty')onOpenWarranty?.(target.id);else onOpenDocument(target.kind,target.id);}}/>
    );
    if(detail && !detail.recordTarget && detail.selectedActivity?.detail.canOpen && detail.selectedActivity.source==='DOCUMENT') return (
      <Button label="Xem chứng từ" variant="secondary" style={styles.detailLink} labelStyle={styles.detailLinkLabel}
        leading={<AppIcon name="document"/>} trailing={<P08ControlIcon name="chevron"/>}
        onPress={()=>openOwner(detail.selectedActivity!)}/>
    );
    return null;
  };
  return (
    <>
      <Page
        title={
          v.panel === 'S01' && v.filters.source === 'DOCUMENT'
            ? 'Lịch sử nhập / xuất'
            : names[v.panel]
        }
        headerVariant="history"
        onBack={back}
        scroll
        initialScrollY={v.scrollY}
        onScrollPositionChange={y => {
          controller.scroll(y);
          if (retainedState) retainedState.current = controller.snapshot();
        }}
        onPullRefresh={() => {
          controller.load();
        }}
        refreshing={v.loading && !!v.meta}
      >
        {v.panel === 'S01' || v.panel === 'S04' ? (
          <HistoryFilterBar
            keyword={v.filters.keyword ?? ''}
            placeholder="Tìm theo mã phiếu, serial, người thao tác"
            onKeywordChange={keyword =>
              controller.filters({ ...v.filters, keyword })
            }
            onFilter={() => openFilter()}
            onDates={() => openFilter('dates')}
            onStatus={() => openFilter('status')}
            statusLabel={
              v.filters.status
                ? historyStatus(v.filters.status)
                : 'Tất cả trạng thái'
            }
            onSort={v.panel === 'S01' ? () => setSortOpen(true) : undefined}
            filtered={!!v.filters.status || v.filters.date_mode !== 'ALL'}
            dateLabel={compactDateText}
            dateButtonLabel={`Thời gian: ${dateText}`}
            total={v.meta?.total}
            loading={v.loading}
            showSort={v.panel === 'S01'}
            status={
              v.filters.status ? (
                <Badge label={historyStatus(v.filters.status)} tone="primary" />
              ) : undefined
            }
            tabs={
              v.panel === 'S01' ? (
                <FilterChipRow
                  variant="history"
                  chips={v.filters.source === 'DOCUMENT'
                    ? listBusinesses.filter(item =>
                        ['ALL', 'INBOUND', 'OUTBOUND'].includes(item.key),
                      )
                    : listBusinesses}
                  activeKey={v.filters.business ?? 'ALL'}
                  onSelect={business =>
                    controller.filters({
                      ...v.filters,
                      business: business as P08Filters['business'],
                    })
                  }
                />
              ) : undefined
            }
          />
        ) : null}
        {v.error ? (
          <Box card padding="lg" gap="sm" style={styles.flatCard}>
            <Text variant="cardTitle">
              {v.error.kind === 'blocked_by_gate'
                ? 'Chưa mở kết nối lịch sử'
                : v.error.status === 503 && documentScope
                ? 'Nguồn chứng từ chưa khả dụng'
                : permissionDenied
                ? 'Không có quyền đọc lịch sử'
                : v.error.status === 404
                ? 'Không tìm thấy đúng định danh'
                : 'Không tải được lịch sử'}
            </Text>
            <Text>
              {permissionDenied
                ? 'Nguồn này chưa được cấp quyền đọc.'
                : v.error.status === 503 && documentScope
                ? 'WMS chưa có ánh xạ kho hợp lệ cho lịch sử nhập/xuất. Không thể kết luận kho không có chứng từ.'
                : v.error.status === 404
                ? 'Không có định danh này trong nguồn được phép.'
                : messageForUser(v.error)}
            </Text>
            {v.error.kind === 'blocked_by_gate' ? null : (
              <Button
                label="Thử lại"
                disabled={v.loading}
                onPress={() => {
                  controller.load();
                }}
              />
            )}
            {v.meta ? (
              <Text>
                Đang xem dữ liệu của lần đọc trước trong cùng phạm vi.
              </Text>
            ) : null}
          </Box>
        ) : null}
        {v.loading ? (
          <View accessibilityLiveRegion="polite">
            <ActivityIndicator color={theme.colors.primary} />
            <Text>Đang đọc lịch sử…</Text>
          </View>
        ) : null}
        {partial ? (
          <Box card padding="lg" style={styles.flatCard}>
            <Text tone="warning">
              {documentUnavailable
                ? 'Dữ liệu một phần: lịch sử chứng từ chưa khả dụng; đang hiển thị các nguồn WMS đọc được.'
                : 'Dữ liệu chưa đầy đủ. Chỉ hiển thị hoạt động của nguồn khả dụng.'}
            </Text>
          </Box>
        ) : null}
        {v.panel === 'S02' && v.detail ? (
          <>
            <Box card padding="md" gap="md" style={styles.flatCard}>
              <View testID="P08.detail.hero" style={styles.detailHero}>
                <View style={[styles.iconBubble,{backgroundColor:v.detail.selectedActivity?eventPresentation(v.detail.selectedActivity).soft:HN_UI.canvas}]}>
                  <P08OperationIcon business={v.detail.selectedActivity?.business??v.detail.recordTarget?.source??'OTHER'}/>
                </View>
                <View style={styles.detailIdentity}>
                  <Text variant="caption" tone="muted">{detailBusinessLabel(v.detail.selectedActivity,v.detail.recordTarget?.source,v.filters.business)}</Text>
                  <Text variant="cardTitle" numberOfLines={2}>{v.detail.selectedActivity?.label?.trim()||compactRecord(v.detail.recordId)}</Text>
                  {!v.detail.selectedActivity ? <Text variant="caption" tone="muted">Chưa chọn hoạt động</Text>:null}
                </View>
                {v.detail.selectedActivity ? <Badge label={historyStatus(v.detail.selectedActivity.status)} tone={statusTone(v.detail.selectedActivity.status)}/>:null}
              </View>
              <View style={styles.detailDocument}>
                <View style={styles.flex}>
                  <Text variant="caption" tone="muted">Chứng từ liên quan</Text>
                  <Text>—</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Sao chép mã chứng từ" accessibilityState={{disabled:true}} disabled style={styles.detailCopy}>
                  <AppIcon name="copy" size={20} color={theme.colors.textMuted}/>
                </Pressable>
              </View>
            </Box>
            {documentLink()}
            <FilterChipRow
              variant="history-tabs"
              chips={[
                { key: 'info', label: 'Thông tin' },
                { key: 'timeline', label: 'Dòng thời gian' },
                { key: 'attachments', label: 'Đính kèm' },
              ]}
              activeKey={tab}
              onSelect={key => setTab(key as typeof tab)}
            />
            {tab === 'info' ? (
              <>
                <Text variant="cardTitle">Thông tin ghi nhận</Text>
                <View testID="P08.detail.info">
                <Box
                  card
                  padding="md"
                  style={[styles.flatCard, styles.infoRows]}
                >
                  {infoRow('Kho', warehouseName,false,'warehouse')}
                  {infoRow('Người thao tác', '—',false,'user')}
                  {infoRow(
                    'Thời gian',
                    v.detail.selectedActivity?.time && v.meta
                      ? p08TimeLabel(
                          v.detail.selectedActivity.time,
                          v.meta.timezone,
                        )
                      : 'Chưa ghi nhận',
                    true,'clock'
                  )}
                </Box>
                </View>
                <View style={styles.detailNote}>
                  <Text variant="caption" tone="muted">Ghi chú</Text>
                  <Text>—</Text>
                </View>
                {v.detail.selectedActivity ? (
                  <>
                    <Text variant="cardTitle">Hoạt động gần nhất</Text>
                    <View testID="P08.detail.latest"><Text tone="muted">Chưa đủ dữ liệu để hiển thị hoạt động gần nhất.</Text></View>
                  </>
                ) : null}
              </>
            ) : null}
            {tab === 'timeline' ? (
              <>
                <Text variant="cardTitle">Lịch sử thao tác</Text>
                <Box
                  card
                  padding="md"
                  style={[styles.flatCard, styles.timeline]}
                >
                  {rows.map((event, index) => {
                    const item = eventPresentation(event);
                    return (
                      <View style={styles.timelineRow} key={event.activityId}>
                        <View style={styles.timelineRail}>
                          <View
                            style={[
                              styles.timelineDot,
                              {
                                borderColor: item.color,
                                backgroundColor: item.soft,
                              },
                            ]}
                          />
                          {index < rows.length - 1 ? (
                            <View
                              style={[
                                styles.timelineLine,
                                { backgroundColor: theme.colors.divider },
                              ]}
                            />
                          ) : null}
                        </View>
                        <View style={styles.timelineBody}>
                          <Text variant="cardTitle">
                            {historyAction(event.action)}
                          </Text>
                          <Text variant="caption" tone="muted">
                            {event.time && v.meta
                              ? p08TimeLabel(event.time, v.meta.timezone)
                              : 'Chưa ghi nhận thời gian'}
                          </Text>
                          <Badge
                            label={historyStatus(event.status)}
                            tone={statusTone(event.status)}
                          />
                        </View>
                      </View>
                    );
                  })}
                </Box>
              </>
            ) : null}
            {tab === 'attachments' ? (
              <Box
                card
                padding="lg"
                gap="sm"
                align="center"
                style={styles.flatCard}
              >
                <AppIcon
                  name="document"
                  color={theme.colors.textMuted}
                  size={30}
                />
                <Text variant="cardTitle">Tệp đính kèm</Text>
                <Text variant="caption" tone="muted">
                  Tệp chỉ được đọc tại màn chủ sở hữu sau khi kiểm tra lại
                  quyền.
                </Text>
                {v.detail.recordTarget?.attachments &&
                v.detail.recordTarget.detail &&
                (v.detail.recordTarget.detail.kind !== 'warranty' ||
                  onOpenWarranty) ? (
                  <Button
                    label="Mở tệp tại chứng từ"
                    onPress={() => {
                      const target = v.detail!.recordTarget!.detail!;
                      if (target.kind === 'warranty')
                        onOpenWarranty?.(target.id, 'files');
                      else onOpenDocument(target.kind, target.id, 'files');
                    }}
                  />
                ) : !v.detail.recordTarget &&
                  v.detail.selectedActivity?.attachments.canOpen &&
                  v.detail.selectedActivity.source === 'DOCUMENT' &&
                  ['INBOUND', 'OUTBOUND'].includes(
                    v.detail.selectedActivity.business,
                  ) ? (
                  <Button
                    label="Mở tệp tại chứng từ"
                    onPress={() => {
                      const event = v.detail!.selectedActivity!;
                      onOpenDocument(
                        event.business === 'INBOUND' ? 'inbound' : 'outbound',
                        p08Identity(event.recordId).uuid,
                        'files',
                      );
                    }}
                  />
                ) : (
                  <Text tone="muted">Nguồn chưa cấp liên kết đọc tệp.</Text>
                )}
              </Box>
            ) : null}
            {(
              v.detail.recordTarget
                ? v.detail.recordTarget.scanSession
                : v.detail.recordId.startsWith('SCAN:')
            ) ? (
              <Button
                label="Xem phiên quét"
                variant="secondary"
                style={styles.detailLink}
                labelStyle={styles.detailLinkLabel}
                leading={<AppIcon name="scan"/>}
                trailing={<P08ControlIcon name="chevron"/>}
                onPress={() => controller.session()}
              />
            ) : null}
            {v.detail.selectedActivity?.source === 'NFC' && onOpenNfc ? (
              <Button
                label="Xem thao tác NFC"
                onPress={() => {
                  const event = v.detail!.selectedActivity!;
                  onOpenNfc(event.recordId, event.activityId);
                }}
              />
            ) : null}
          </>
        ) : null}
        {v.panel === 'S03' && v.batch ? (
          <>
            <Box card padding="lg" gap="sm" style={styles.flatCard}>
              <View style={styles.row}>
                <View
                  style={[
                    styles.iconBubble,
                    { backgroundColor: theme.colors.primarySoft },
                  ]}
                >
                  <P08OperationIcon business="SCAN" />
                </View>
                <View style={styles.flex}>
                  <Text variant="cardTitle">Phiên quét đã lưu</Text>
                  <Text variant="caption" tone="muted">
                    {compactRecord(`SCAN:${v.batch.sessionId}`)}
                  </Text>
                </View>
                <Badge label="Chỉ đọc" tone="primary" />
              </View>
              <Text variant="caption" tone="muted">
                Người quét / bắt đầu / kết thúc / chứng từ: —
              </Text>
            </Box>
            <Text variant="cardTitle">Kết quả phiên</Text>
            {onOpenSession ? (
              <Button
                label="Mở lịch sử phiên quét"
                variant="secondary"
                onPress={() => onOpenSession(v.batch!.sessionId)}
              />
            ) : null}
            <View style={styles.metrics}>
              {[
                ['Tổng lượt', v.batch.total, 'primary' as BadgeTone],
                ['Được chấp nhận', v.batch.accepted, 'success' as BadgeTone],
                ['Trùng', v.batch.duplicate, 'warning' as BadgeTone],
                ['Trạng thái khác', v.batch.other, 'neutral' as BadgeTone],
              ].map(([label, value, tone]) => (
                <View style={styles.metricCell} key={String(label)}>
                  <View
                    style={[
                      styles.metricTile,
                      {
                        backgroundColor:
                          tone === 'success'
                            ? theme.colors.successSoft
                            : tone === 'warning'
                            ? theme.colors.warningSoft
                            : theme.colors.primarySoft,
                      },
                    ]}
                  >
                    <Text variant="metric">{String(value)}</Text>
                    <Text>{String(label)}</Text>
                  </View>
                </View>
              ))}
            </View>
            <Text variant="caption" tone="muted">
              Số lượng: — (nguồn không ghi nhận)
            </Text>
            <Text variant="cardTitle">Danh sách hoạt động</Text>
            {rows.map(e => eventCard(e))}
          </>
        ) : null}
        {v.panel === 'S01'
          ? rows.map(e => (
              <Pressable
                key={e.activityId}
                accessibilityRole="button"
                accessibilityLabel="Xem chi tiết"
                onPress={() => {
                  setTab('info');
                  controller.detail(e);
                }}
              >
                {eventCard(e, true)}
              </Pressable>
            ))
          : null}
        {v.panel === 'S04' && v.summary ? (
          <>
            <Box card padding="lg" gap="md" style={styles.flatCard}>
              <Text variant="cardTitle">Tổng quan hoạt động</Text>
              <Text variant="caption" tone="muted">
                {dateText} · {warehouseName}
              </Text>
              <View style={styles.summaryGrid}>
                {v.summary.groups
                  .filter(group => group.business !== 'OTHER')
                  .map(group => {
                    const source = groupSource(group.business);
                    const sourceState = source
                      ? v.meta?.sources[source].status
                      : undefined;
                    const excluded =
                      sourceState === 'FORBIDDEN' ||
                      sourceState === 'NOT_REQUESTED' ||
                      sourceState === 'UNAVAILABLE' ||
                      (group.business === 'INBOUND' &&
                        !context.user?.permissions?.includes('inbound.view')) ||
                      (group.business === 'OUTBOUND' &&
                        !context.user?.permissions?.includes('outbound.view'));
                    const item = eventPresentation({
                      business: group.business,
                      source:
                        group.business === 'INBOUND' ||
                        group.business === 'OUTBOUND'
                          ? 'DOCUMENT'
                          : (group.business as P08Source),
                    } as P08Event);
                    return (
                      <View style={styles.summaryCell} key={group.business}>
                        <View
                          style={[
                            styles.summaryTile,
                            { backgroundColor: item.soft },
                          ]}
                        >
                          <View style={styles.summaryIcon}>
                            <P08OperationIcon
                              business={group.business}
                              size={23}
                            />
                          </View>
                          <Text variant="metric">
                            {excluded ? '—' : group.availableTotal}
                          </Text>
                          <Text variant="caption">{item.label}</Text>
                        </View>
                      </View>
                    );
                  })}
                <View style={styles.summaryCell}>
                  <View
                    style={[
                      styles.summaryTile,
                      { backgroundColor: theme.colors.primary },
                    ]}
                  >
                    <View style={styles.summaryIcon}>
                      <Text accessible={false} style={styles.summaryTotalIcon}>Σ</Text>
                    </View>
                    <Text variant="metric" style={styles.whiteText}>
                      {v.summary.grandTotal ?? v.summary.availableTotal}
                    </Text>
                    <Text variant="caption" style={styles.whiteText}>
                      {v.summary.grandTotal === null ? 'Khả dụng' : 'Tổng cộng'}
                    </Text>
                  </View>
                </View>
              </View>
              <Text variant="caption" tone="muted">
                Phần khả dụng: {v.summary.availableTotal} hoạt động; không phải
                số lượng hàng hay tổng số phiếu.
              </Text>
            </Box>
            <Box card padding="lg" gap="sm" style={styles.flatCard}>
              <View style={styles.listMeta}>
                <Text variant="cardTitle">Danh sách hoạt động</Text>
                <Badge
                  label={v.summary.grandTotal===null?`Khả dụng ${v.summary.availableTotal}`:`Tổng ${v.summary.grandTotal}`}
                  tone="primary"
                />
              </View>
              <View style={styles.groupList}>
                {v.summary.groups
                  .filter(
                    group =>
                      group.business !== 'OTHER' || group.availableTotal > 0,
                  )
                  .map(group => {
                    const src = groupSource(group.business);
                    const sourceState = src
                      ? v.meta?.sources[src].status
                      : undefined;
                    const excluded =
                      sourceState === 'FORBIDDEN' ||
                      sourceState === 'NOT_REQUESTED' ||
                      sourceState === 'UNAVAILABLE' ||
                      (group.business === 'INBOUND' &&
                        !context.user?.permissions?.includes('inbound.view')) ||
                      (group.business === 'OUTBOUND' &&
                        !context.user?.permissions?.includes('outbound.view'));
                    const item =
                      presentation[
                        (presentation[
                          group.business as Exclude<BusinessKey, 'ALL'>
                        ]
                          ? group.business
                          : 'OTHER') as Exclude<BusinessKey, 'ALL'>
                      ];
                    const forbidden =
                      sourceState === 'FORBIDDEN' ||
                      (group.business === 'INBOUND' &&
                        !context.user?.permissions?.includes('inbound.view')) ||
                      (group.business === 'OUTBOUND' &&
                        !context.user?.permissions?.includes('outbound.view'));
                    return (
                      <Pressable
                        key={group.business}
                        accessibilityRole="button"
                        accessibilityLabel={`Xem ${businessLabel(
                          group.business,
                        )}`}
                        accessibilityState={{ disabled: excluded }}
                        disabled={excluded}
                        onPress={() => controller.drilldown(group.business)}
                        style={[
                          styles.groupRow,
                          { borderColor: theme.colors.divider },
                        ]}
                      >
                        <View
                          style={[
                            styles.groupIcon,
                            { backgroundColor: item.soft },
                          ]}
                        >
                          <P08OperationIcon
                            business={group.business}
                            size={24}
                          />
                        </View>
                        <Text style={styles.flex}>
                          {businessLabel(group.business)}
                        </Text>
                        {excluded ? (
                          <Badge
                            label={
                              forbidden ? 'Không có quyền' : 'Chưa khả dụng'
                            }
                            tone={forbidden ? 'danger' : 'warning'}
                          />
                        ) : (
                          <Badge
                            label={`${group.availableTotal} hoạt động`}
                            tone={group.business==='INBOUND'?'success':group.business==='WARRANTY'?'warning':group.business==='OTHER'||group.business==='SCAN'?'neutral':'primary'}
                            ink={group.business==='NFC'?HN_OPERATIONS.nfc.ink:undefined}
                            soft={group.business==='NFC'?HN_OPERATIONS.nfc.soft:undefined}
                          />
                        )}
                        <AppIcon
                          name="chevron-right"
                          color={theme.colors.textMuted}
                          size={17}
                        />
                      </Pressable>
                    );
                  })}
              </View>
            </Box>
          </>
        ) : null}
        {!v.loading &&
        !v.error &&
        v.meta &&
        v.panel !== 'S04' &&
        !rows.length ? (
          <Box card padding="lg" style={styles.flatCard}>
            <Text>
              {v.filters.keyword ||
              v.filters.status ||
              v.filters.date_mode !== 'ALL' ||
              (v.filters.business && v.filters.business !== 'ALL') ||
              (v.filters.source && v.filters.source !== 'ALL')
                ? documentScope && documentUnavailable
                  ? 'Nguồn chứng từ chưa được đọc; chưa thể kết luận không có chứng từ.'
                  : 'Không có hoạt động khớp bộ lọc.'
                : 'Nguồn đã đọc không có hoạt động.'}
            </Text>
          </Box>
        ) : null}
        {v.panel !== 'S04' && paging?.hasMore ? (
          <Button
            label="Tải thêm hoạt động"
            disabled={v.loading}
            onPress={() => {
              controller.load(true);
            }}
          />
        ) : null}
      </Page>
      <P08FilterDialog
        visible={filterOpen}
        section={filterSection}
        sourcesVisible={v.filters.source !== 'DOCUMENT'}
        statusOptions={[
          ...new Set(
            rows
              .map(row => row.status)
              .filter((value): value is string => !!value),
          ),
        ]}
        filters={v.filters}
        timezone={v.meta?.timezone}
        onCancel={() => setFilterOpen(false)}
        onApply={filters => {
          setFilterOpen(false);
          controller.filters(filters);
        }}
      />
      <Dialog
        visible={sortOpen}
        title="Sắp xếp lịch sử"
        panelMaxWidth={428}
        onDismiss={() => setSortOpen(false)}
        footer={<Button label="Xong" onPress={() => setSortOpen(false)} />}
      >
        <View style={styles.row}>
          <AppIcon name="check-circle" color={theme.colors.primary} size={24} />
          <Text>Mới nhất trước</Text>
        </View>
      </Dialog>
    </>
  );
}
