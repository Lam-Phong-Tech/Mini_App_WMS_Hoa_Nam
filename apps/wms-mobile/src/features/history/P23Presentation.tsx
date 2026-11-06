import {HN_UI} from '../../theme/uiKitV3';
/** P23 presentation only. All values remain owner-supplied read projections. */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FilterChipRow } from '../../ui/FilterChipRow';
import { Text } from '../../ui/Text';
import { AppIcon, type AppIconName } from '../../ui/AppIcon';
import { HN_HOME, HN_OPERATIONS } from '../../ui/hnHomeTokens';
import { colors } from '../../theme/tokens';
import type { P09Case, P09Event } from '../../services/wms/p09Warranty';
import type {
  ScanSessionRow,
  LinkedHistoryRead,
} from '../../services/wms/linkedHistoryRead';
import {
  historyCount,
  historyInstant,
  historyStatus,
  historySource,
  historyAction,
  historyDay,
} from './historyPresentation';

export const p23Styles = StyleSheet.create({
  stack: { gap: 14 },
  controls: { gap: 8 },
  counts: { alignItems: 'flex-end', maxWidth: '48%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  fill: { flex: 1, minWidth: 0 },
  muted: { fontSize: 14, lineHeight: 21, color: HN_HOME.muted },
  small: { fontSize: 12, lineHeight: 18, color: HN_HOME.muted },
  body: { fontSize: 16, lineHeight: 24, color: HN_HOME.ink },
  title: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '700',
    color: HN_HOME.ink,
  },
  heading: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '700',
    color: HN_HOME.ink,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 12,
    padding: 18,
    gap: 12,
    backgroundColor: colors.surface,
  },
  badge: {
    maxWidth: '56%',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { fontSize: 12, lineHeight: 17, flexShrink: 1 },
  viewed: { fontSize: 11, lineHeight: 17, color: HN_HOME.blue },
  searchRow: { flexDirection: 'row', gap: 12 },
  search: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: HN_UI.borderControl,
    borderRadius: 10,
    backgroundColor: HN_UI.canvas,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 50,
    paddingVertical: 0,
    fontSize: 16,
    color: HN_HOME.ink,
  },
  tap: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filter: {
    width: 54,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: HN_HOME.blue,
  },
  filterDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: HN_UI.surface,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  controlLink: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  controlText: { fontSize: 14, lineHeight: 21, color: HN_HOME.blue },
  dateButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  tabs: { flexGrow: 1, flexDirection: 'row', gap: 6 },
  tab: {
    flexGrow: 1,
    minHeight: 44,
    paddingHorizontal: 15,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: HN_UI.canvas,
  },
  tabActive: { backgroundColor: HN_UI.primary },
  tabText: { color: HN_HOME.ink, fontSize: 15, lineHeight: 22 },
  tabActiveText: { color: HN_UI.onBrand, fontWeight: '700' },
  tabsScroll: { flexGrow: 0, minHeight: 44 },
  operation: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  actionTitle: {
    fontSize: 16,
    lineHeight: 23,
    color: HN_HOME.ink,
    fontWeight: '700',
  },
  notice: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceSubtle,
  },
  timeline: { gap: 0 },
  event: { flexDirection: 'row', gap: 14 },
  rail: { width: 30, alignItems: 'center' },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  line: { width: 1, flex: 1, minHeight: 18, backgroundColor: HN_UI.selected },
  eventBody: { flex: 1, minWidth: 0, gap: 7, paddingBottom: 26 },
  eventTitle: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    color: HN_HOME.ink,
  },
  latest: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.primarySoft,
  },
  latestText: { fontSize: 12, lineHeight: 18, color: HN_HOME.blue },
  reader: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 2,
  },
  readerMeasure: {
    position: 'absolute',
    opacity: 0,
    top: 0,
    left: 0,
    right: 0,
    zIndex: -1,
  },
  metricRow: {
    flexDirection: 'row',
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  metric: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
  },
  metricBorder: { borderLeftWidth: 1, borderColor: colors.divider },
  metricValue: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700',
    color: HN_UI.textLink,
  },
  metricLabel: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    color: HN_HOME.muted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderColor: colors.divider,
  },
  metaLast: { borderBottomWidth: 0 },
  metaLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 21,
    color: HN_HOME.muted,
  },
  metaValue: {
    flex: 1.4,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'right',
    fontWeight: '600',
    color: HN_HOME.ink,
  },
  eventCard: {
    gap: 8,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: colors.divider,
  },
});
const s = p23Styles;

export function p23WarrantyStatus(status: string | null | undefined): string {
  return status === 'COMPLETED' ? 'Chờ bàn giao' : historyStatus(status);
}
export function P23Status({
  value,
  warranty = false,
}: {
  value: string | null | undefined;
  warranty?: boolean;
}) {
  const tone = [
    'RETURNED',
    'ACCEPTED',
    'VALID',
    'SUCCESS',
    'SUCCEEDED',
  ].includes(value ?? '')
    ? { backgroundColor: colors.successSoft, color: colors.successText }
    : ['REJECTED', 'FAILED', 'ERROR'].includes(value ?? '')
    ? { backgroundColor: colors.dangerSoft, color: colors.dangerText }
    : ['COMPLETED', 'PENDING', 'UNKNOWN', 'WAITING_APPROVAL'].includes(
        value ?? '',
      )
    ? { backgroundColor: colors.warningSoft, color: colors.warningText }
    : { backgroundColor: colors.primarySoft, color: HN_HOME.blue };
  return (
    <View style={[s.badge, { backgroundColor: tone.backgroundColor }]}>
      <Text style={[s.badgeText, { color: tone.color }]}>
        {warranty
          ? p23WarrantyStatus(value)
          : value
          ? historyStatus(value)
          : 'Chưa ghi nhận'}
      </Text>
    </View>
  );
}

export function P23Tabs({
  chips,
  activeKey,
  onSelect,
}: {
  chips: readonly { key: string; label: string }[];
  activeKey: string;
  onSelect(key: string): void;
}) {
  return (
    <FilterChipRow
      chips={chips}
      activeKey={activeKey}
      onSelect={onSelect}
      variant={chips.length > 4 ? 'history-wrap' : 'history'}
    />
  );
}

/** Measure the full source string at the displayed width, never by character count. */
export function P23Readable({
  text,
  label,
  lines = 2,
  onRead,
}: {
  text: string;
  label: string;
  lines?: number;
  onRead(text: string): void;
}) {
  const [overflow, setOverflow] = useState(false);
  useEffect(() => setOverflow(false), [text, lines]);
  return (
    <View style={s.fill}>
      <Text style={s.muted} numberOfLines={lines}>
        {text}
      </Text>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={s.readerMeasure}
      >
        <Text
          style={s.muted}
          onTextLayout={event =>
            setOverflow(event.nativeEvent.lines.length > lines)
          }
        >
          {text}
        </Text>
      </View>
      {overflow ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Đọc đầy đủ ' + label}
          style={s.reader}
          onPress={() => onRead(text)}
        >
          <Text style={s.controlText}>Xem đầy đủ</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function P23CaseCard({
  row,
  viewed,
  onOpen,
}: {
  row: P09Case;
  viewed?: boolean;
  onOpen(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Xem quá trình bảo hành"
      testID={'P23.case.' + row.warranty_case_id}
      style={s.card}
      onPress={onOpen}
    >
      <View style={s.row}>
        <Text style={[s.title, s.fill]} numberOfLines={2}>
          {row.warranty_case_code ?? row.warranty_case_id}
        </Text>
        <P23Status value={row.status} warranty />
      </View>
      <Text style={s.body} numberOfLines={2}>
        {row.sku_name ??
          row.manual_product_description ??
          'Sản phẩm chưa ghi nhận'}
      </Text>
      <Text style={s.muted} numberOfLines={2}>
        Serial: {row.serial_number ?? '—'}
      </Text>
      <View style={s.wrap}>
        <Text style={[s.muted, s.fill]}>{historyInstant(row.created_at)}</Text>
        {viewed ? <Text style={s.viewed}>Vừa xem</Text> : null}
      </View>
    </Pressable>
  );
}

function P23Operation({ source }: { source: string | null }) {
  const operation =
    source === 'COMPONENT_ISSUE' || source === 'WARRANTY'
      ? 'warranty'
      : ['RECEIPT_DOCUMENT', 'INBOUND'].includes(source ?? '')
      ? 'inbound'
      : ['ISSUE_DOCUMENT', 'OUTBOUND'].includes(source ?? '')
      ? 'outbound'
      : 'lookup';
  const icon: AppIconName =
    operation === 'warranty'
      ? 'wrench'
      : operation === 'inbound'
      ? 'arrow-down'
      : operation === 'outbound'
      ? 'arrow-up'
      : 'scan';
  return (
    <View
      style={[s.operation, { backgroundColor: HN_OPERATIONS[operation].soft }]}
    >
      <AppIcon name={icon} color={HN_OPERATIONS[operation].ink} size={24} />
    </View>
  );
}

export function P23SessionCard({
  row,
  viewed,
  onOpen,
}: {
  row: ScanSessionRow;
  viewed?: boolean;
  onOpen(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Xem thông tin phiên quét"
      testID={'P23.session.' + row.id}
      style={s.card}
      onPress={onOpen}
    >
      <View style={s.row}>
        <P23Operation source={row.sourceType} />
        <Text style={[s.eventTitle, s.fill]}>
          {historySource(row.sourceType)}
        </Text>
        <P23Status value={row.status} />
      </View>
      <Text style={s.eventTitle} numberOfLines={2}>
        {row.number ?? row.id}
      </Text>
      <Text style={s.muted}>Ngày tạo: {historyInstant(row.createdAt)}</Text>
      <Text style={s.muted}>
        Được chấp nhận {historyCount(row.counts.accepted)} · Trùng{' '}
        {historyCount(row.counts.duplicate)} · Từ chối có nguồn{' '}
        {historyCount(row.counts.explicitRejected)}
      </Text>
      {row.latestEvent?.occurredAt ? (
        <Text style={s.small}>
          Sự kiện mới nhất: {historyInstant(row.latestEvent.occurredAt)}
        </Text>
      ) : null}
      {row.latestEventStatus === 'PARTIAL_SOURCE' ? (
        <Text style={s.small}>
          Nguồn sự kiện chưa đầy đủ; chưa xác định sự kiện mới nhất.
        </Text>
      ) : null}
      <View style={s.row}>
        <Text style={[s.small, s.fill]}>
          Xem chi tiết{viewed ? ' · Vừa xem' : ''}
        </Text>
        <AppIcon name="chevron-right" size={18} color={HN_HOME.blue} />
      </View>
    </Pressable>
  );
}

/** Reverse only a fully timed, unambiguous page; unknown times retain source order. */
export function p23TimelineOrder(
  events: readonly P09Event[],
): readonly P09Event[] {
  const times = events.map(event =>
    event.event_at &&
    /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(event.event_at) &&
    /^\d{2}\/\d{2}\/\d{4}/.test(historyInstant(event.event_at))
      ? Date.parse(event.event_at)
      : NaN,
  );
  if (
    times.some(time => !Number.isFinite(time)) ||
    new Set(times).size !== times.length
  )
    return events;
  return [...events].sort(
    (a, b) => Date.parse(b.event_at!) - Date.parse(a.event_at!),
  );
}

export function P23WarrantyDetail({
  record,
  events,
  newestFirst = true,
  meta,
  onComponents,
  onRead,
}: {
  record: P09Case;
  events: readonly P09Event[];
  newestFirst?: boolean;
  meta?: Record<string, unknown>;
  onComponents(caseId: string): void;
  onRead(text: string): void;
}) {
  const timeline = newestFirst ? p23TimelineOrder(events) : events;
  return (
    <>
      <View style={s.card}>
        <View style={s.row}>
          <Text style={[s.title, s.fill]} selectable>
            {record.warranty_case_code ?? record.warranty_case_id}
          </Text>
          <P23Status value={record.status} warranty />
        </View>
        <Text style={s.eventTitle}>
          {record.sku_name ??
            record.manual_product_description ??
            'Sản phẩm chưa ghi nhận'}
        </Text>
        <Text style={s.muted}>Serial:</Text>
        <Text selectable style={s.body}>
          {record.serial_number ?? '—'}
        </Text>
      </View>
      <Text accessibilityRole="header" style={s.heading}>
        Quá trình xử lý
      </Text>
      <View style={s.timeline}>
        {timeline.map((event, index) => (
          <View
            key={event.event_id}
            style={s.event}
            testID={'P23.event.' + event.event_id}
          >
            <View style={s.rail}>
              <View style={s.dot}>
                <AppIcon name="clock" size={17} color={HN_HOME.blue} />
              </View>
              {index < timeline.length - 1 ? <View style={s.line} /> : null}
            </View>
            <View style={s.eventBody}>
              <Text style={s.eventTitle}>
                {event.to_status
                  ? p23WarrantyStatus(event.to_status)
                  : 'Sự kiện đã ghi nhận'}
              </Text>
              {meta?.latest_recorded_event_id === event.event_id ? (
                <View style={s.latest}>
                  <Text style={s.latestText}>Sự kiện mới nhất đã ghi nhận</Text>
                </View>
              ) : null}
              <View style={s.wrap}>
                <Text style={s.small}>{historyInstant(event.event_at)}</Text>
                <Text style={s.small}>
                  {event.actor?.display_name ?? 'Người thao tác chưa ghi nhận'}
                </Text>
              </View>
              <P23Readable
                label="nội dung sự kiện"
                text={
                  event.message_redacted
                    ? 'Nội dung được che theo quyền'
                    : event.message ?? 'Chưa có nội dung sự kiện'
                }
                onRead={onRead}
              />
            </View>
          </View>
        ))}
      </View>
      {record.capabilities?.posted_component_issues_read ? (
        <Pressable
          style={s.action}
          accessibilityRole="button"
          accessibilityLabel="Linh kiện đã xuất"
          onPress={() => onComponents(record.warranty_case_id)}
        >
          <P23Operation source="COMPONENT_ISSUE" />
          <View style={s.fill}>
            <Text style={s.actionTitle}>Linh kiện đã xuất</Text>
            <Text style={s.small}>Xem phiếu đã xuất theo hồ sơ</Text>
          </View>
          <AppIcon name="chevron-right" size={20} color={HN_HOME.blue} />
        </Pressable>
      ) : null}
      <View style={s.notice}>
        <Text style={s.muted}>
          Thông tin được xem lại từ hồ sơ bảo hành hiện có.
        </Text>
      </View>
    </>
  );
}

function P23MetaRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[s.metaRow, last && s.metaLast]}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text selectable style={s.metaValue}>
        {value}
      </Text>
    </View>
  );
}

type SessionDetail = Awaited<ReturnType<LinkedHistoryRead['session']>>;
export function P23SessionDetail({
  data,
  onRead,
}: {
  data: Omit<SessionDetail, 'events'> & {
    events: readonly SessionDetail['events'][number][];
  };
  onRead(text: string): void;
}) {
  const batch = data.batch;
  const metrics = [
    { label: 'Lượt được chấp nhận', value: batch.counts.accepted },
    { label: 'Từ chối có nguồn', value: batch.counts.explicitRejected },
    { label: 'Linh kiện đã xuất', value: batch.counts.issuedQuantity },
  ];
  return (
    <>
      <View style={s.card}>
        <View style={s.row}>
          <Text style={[s.title, s.fill]} selectable>
            {batch.number ?? batch.id}
          </Text>
          <P23Status value={batch.status} />
        </View>
        <Text style={s.muted}>
          {historySource(batch.sourceType)} · {historyDay(batch.createdAt)}
        </Text>
      </View>
      <View style={s.card}>
        <P23MetaRow label="Ngày tạo" value={historyInstant(batch.createdAt)} />
        <P23MetaRow
          label="Thời gian phiên"
          value={
            historyInstant(batch.startedAt) +
            ' – ' +
            historyInstant(batch.endedAt)
          }
        />
        <P23MetaRow
          label="Trạng thái phiên"
          value={batch.status ? historyStatus(batch.status) : '—'}
        />
        <P23MetaRow
          label="Kết quả chứng từ"
          value="Chưa có nguồn xác minh"
          last
        />
      </View>
      <View style={s.metricRow}>
        {metrics.map((metric, index) => (
          <View
            style={[s.metric, index > 0 && s.metricBorder]}
            key={metric.label}
          >
            <Text style={s.metricValue}>{historyCount(metric.value)}</Text>
            <Text style={s.metricLabel}>{metric.label}</Text>
          </View>
        ))}
      </View>
      <Text style={s.muted}>
        Lượt đọc trùng: {historyCount(batch.counts.duplicate)} · Không cộng vào
        lượt được chấp nhận.
      </Text>
      <Text style={s.small}>
        Tổng lượt đã ghi nhận: {historyCount(batch.counts.total)}. Phiên quét
        không xác nhận chứng từ đã ghi sổ.
      </Text>
      <Text accessibilityRole="header" style={s.heading}>
        Lượt quét đã ghi nhận
      </Text>
      <View style={s.card}>
        <Text style={s.small}>
          Mã gốc, người thao tác và số lượng từng lượt chưa có nguồn được duyệt.
        </Text>
        {data.events.map(event => (
          <View key={event.id} style={s.eventCard}>
            <View style={s.row}>
              <Text style={[s.eventTitle, s.fill]}>
                {historyAction(event.action)}
              </Text>
              <P23Status value={event.status} />
            </View>
            <Text style={s.muted}>{historyInstant(event.time)}</Text>
          </View>
        ))}
        {!data.events.length ? (
          <Text style={s.muted}>
            Chưa có lượt quét trong phần nguồn đã tải.
          </Text>
        ) : null}
      </View>
      <Text accessibilityRole="header" style={s.heading}>
        Sự kiện mới nhất toàn nguồn
      </Text>
      <View style={s.card}>
        <Text style={s.muted}>
          {data.latestEventStatus === 'PARTIAL_SOURCE'
            ? 'Chưa xác định — nguồn không đầy đủ'
            : historyInstant(data.latestEvent?.occurredAt)}
        </Text>
        <Text style={s.eventTitle}>
          {data.latestEvent?.status
            ? historyStatus(data.latestEvent.status)
            : 'Kết quả chưa ghi nhận'}
        </Text>
        {data.latestEvent?.rawCode ? (
          <P23Readable
            text={data.latestEvent.rawCode}
            label="mã gốc"
            onRead={onRead}
          />
        ) : null}
        {data.latestEvent?.reason ? (
          <P23Readable
            text={data.latestEvent.reason}
            label="lý do"
            lines={3}
            onRead={onRead}
          />
        ) : null}
      </View>
    </>
  );
}
