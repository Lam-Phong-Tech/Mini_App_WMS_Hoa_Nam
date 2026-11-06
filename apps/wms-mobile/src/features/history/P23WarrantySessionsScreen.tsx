import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { HistoryFilterBar } from './HistoryFilterBar';
import { p08DateLabel } from './p08Dates';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { toAppError, type AppError } from '../../errors/AppError';
import {
  createLinkedHistoryRead,
  type ScanSessionRow,
} from '../../services/wms/linkedHistoryRead';
import {
  createP09Service,
  type P09Case,
  type P09Filters,
  type P09Event,
} from '../../services/wms/p09Warranty';
import type { P08Context } from '../../services/wms/p08Types';
import { useOwnerRead } from './useOwnerRead';
import { useHardwareBack } from '../../app/useHardwareBack';
import { captureSessionScope } from '../../auth/session';
import { HistoryFrame } from './HistoryFrame';
import {
  P23CaseCard,
  P23SessionCard,
  P23WarrantyDetail,
  P23SessionDetail,
  P23Tabs,
  p23Styles as s,
  p23WarrantyStatus,
} from './P23Presentation';
import {
  historyCount as show,
  historyInstant as instant,
  historyStatus,
  historySource,
  historyDay,
} from './historyPresentation';
import { P08FilterDialog } from './P08FilterDialog';
import { Dialog } from '../../ui/Dialog';
import type { P08Filters } from '../../services/wms/p08Types';
import { verifiedHistoryPage, type HistoryWindow } from './historyPaging';
const canRetainHistory = (error?: AppError) =>
  !error ||
  ['network', 'timeout'].includes(error.kind) ||
  (error.kind === 'http' && (error.status ?? 0) >= 500);
export function P23WarrantySessionsScreen({
  context,
  kind,
  initialCaseId,
  initialSessionId,
  onBack,
  onComponents,
  footer,
}: {
  context: P08Context;
  kind: 'warranty' | 'sessions';
  initialCaseId?: string;
  initialSessionId?: string;
  onBack(): void;
  onComponents(caseId: string): void;
  footer?: React.ReactNode;
}) {
  const ctx = useRef(context);
  const listScroll = useRef(0);
  ctx.current = context;
  const api = useMemo(() => createLinkedHistoryRead(() => ctx.current), []),
    warranty = useMemo(() => createP09Service(() => ctx.current), []);
  const [caseId, setCaseId] = useState(initialCaseId),
    [sessionId, setSessionId] = useState(initialSessionId),
    [query, setQuery] = useState(''),
    [draftQuery, setDraftQuery] = useState(''),
    [statusFilter, setStatusFilter] = useState('ALL'),
    [sessionSource, setSessionSource] = useState('ALL'),
    [sessionStatus, setSessionStatus] = useState('ALL'),
    [dates, setDates] = useState<{ from: string; to: string }>(),
    [paging, setPaging] = useState<{ page: number } | { cursor: string }>({
      page: 1,
    }),
    [eventCursor, setEventCursor] = useState<string>();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [draftOptions, setDraftOptions] = useState({
    status: 'ALL',
    field: 'created_at',
    sessionStatus: 'ALL',
  });
  const [viewedCaseId, setViewedCaseId] = useState<string>();
  const [viewedSessionId, setViewedSessionId] = useState<string>();
  const [filterOpen, setFilterOpen] = useState(false),
    [reader, setReader] = useState<string>();
  const [caseRows, setCaseRows] = useState<P09Case[]>([]),
    [sessionRows, setSessionRows] = useState<ScanSessionRow[]>([]),
    [rowsBinding, setRowsBinding] = useState('');
  const [pagingBinding, setPagingBinding] = useState('');
  const [eventPaging, setEventPaging] = useState<
      { page: number } | { cursor: string }
    >({ page: 1 }),
    [dateField, setDateField] = useState<
      'created_at' | 'received_at' | 'returned_at'
    >('created_at');
  const scope =
      kind === 'warranty' ? warranty.contextKey() : api.scopeKey('P23'),
    generation = captureSessionScope().generation;
  const listBinding = JSON.stringify([
    scope,
    generation,
    kind,
    query,
    dates,
    dateField,
    statusFilter,
    sessionSource,
    sessionStatus,
  ]);
  const activePaging = pagingBinding === listBinding ? paging : { page: 1 };
  const timelineBinding = JSON.stringify([
    scope,
    generation,
    kind,
    caseId,
    sessionId,
  ]);
  type SessionEvent = Awaited<ReturnType<typeof api.session>>['events'][number];
  const listPages = useRef<{
    binding: string;
    cases?: HistoryWindow<P09Case>;
    sessions?: HistoryWindow<ScanSessionRow>;
  }>({ binding: '' });
  const eventPages = useRef<{
    binding: string;
    cases?: HistoryWindow<P09Event>;
    sessions?: HistoryWindow<SessionEvent>;
  }>({ binding: '' });
  const readKey = JSON.stringify([
    scope,
    generation,
    kind,
    caseId,
    sessionId,
    query,
    statusFilter,
    sessionSource,
    sessionStatus,
    dates,
    dateField,
    activePaging,
    eventPaging,
    eventCursor,
  ]);
  type PageWithWindow<T, P> = Omit<P, 'items'> & {
    items: readonly T[];
    window: HistoryWindow<T>;
  };
  type ReadData = {
    record?: P09Case;
    recordError?: AppError;
    eventsError?: AppError;
    cases?: PageWithWindow<P09Case, Awaited<ReturnType<typeof warranty.list>>>;
    events?: PageWithWindow<
      P09Event,
      Awaited<ReturnType<typeof warranty.events>>
    >;
    sessions?: PageWithWindow<
      ScanSessionRow,
      Awaited<ReturnType<typeof api.sessions>>
    >;
    session?: Omit<Awaited<ReturnType<typeof api.session>>, 'events'> & {
      events: readonly SessionEvent[];
      window: HistoryWindow<SessionEvent>;
    };
  };
  const read = useOwnerRead<ReadData>(readKey, async signal => {
    if (caseId) {
      const [record, events] = await Promise.allSettled([
        warranty.detail(caseId),
        (async () => {
          const result = await warranty.events(caseId, {
            ...eventPaging,
            sort: 'event_at_asc',
            per_page: 20,
          });
          const window = verifiedHistoryPage(
            eventPages.current.binding === timelineBinding
              ? eventPages.current.cases
              : undefined,
            result,
            eventPaging,
            event => event.event_id,
          );
          return { ...result, items: window.items, window };
        })(),
      ]);
      return {
        record: record.status === 'fulfilled' ? record.value : undefined,
        events: events.status === 'fulfilled' ? events.value : undefined,
        recordError:
          record.status === 'rejected' ? toAppError(record.reason) : undefined,
        eventsError:
          events.status === 'rejected' ? toAppError(events.reason) : undefined,
      };
    }
    if (sessionId) {
      const result = await api.session(sessionId, eventCursor, signal);
      const window = verifiedHistoryPage(
        eventPages.current.binding === timelineBinding
          ? eventPages.current.sessions
          : undefined,
        { items: result.events, meta: result },
        { cursor: eventCursor },
        event => event.id,
      );
      return { session: { ...result, events: window.items, window } };
    }
    if (kind === 'warranty') {
      const result = await warranty.list({
        ...activePaging,
        per_page: 20,
        ...(query ? { search: query } : {}),
        ...(statusFilter !== 'ALL'
          ? { status: statusFilter as P09Filters['status'] }
          : {}),
        ...(dates
          ? { date_mode: 'RANGE' as const, date_field: dateField, ...dates }
          : {}),
      } as P09Filters);
      const window = verifiedHistoryPage(
        listPages.current.binding === listBinding
          ? listPages.current.cases
          : undefined,
        result,
        activePaging,
        item => item.warranty_case_id,
      );
      return { cases: { ...result, items: window.items, window } };
    }
    const result = await api.sessions(
      {
        ...activePaging,
        ...(query ? { keyword: query } : {}),
        ...(sessionSource !== 'ALL' ? { source_type: sessionSource } : {}),
        ...(sessionStatus !== 'ALL' ? { status: sessionStatus } : {}),
        ...(dates
          ? { date_mode: 'RANGE', date_field: 'created_at', ...dates }
          : { date_mode: 'ALL' }),
      },
      signal,
    );
    const window = verifiedHistoryPage(
      listPages.current.binding === listBinding
        ? listPages.current.sessions
        : undefined,
      { items: result.items, meta: result },
      activePaging,
      item => item.id,
    );
    return { sessions: { ...result, items: window.items, window } };
  });
  useEffect(() => {
    setReader(undefined);
    setFilterOpen(false);
    setOptionsOpen(false);
    setViewedCaseId(undefined);
    setViewedSessionId(undefined);
  }, [scope, generation]);
  const back = () => {
    if (optionsOpen) {
      setOptionsOpen(false);
      return;
    }
    if (filterOpen) {
      setFilterOpen(false);
      return;
    }
    if (reader) {
      setReader(undefined);
      return;
    }
    if (caseId && !initialCaseId) {
      setCaseId(undefined);
      setEventPaging({ page: 1 });
    } else if (sessionId && !initialSessionId) {
      setSessionId(undefined);
      setEventCursor(undefined);
    } else onBack();
  };
  useHardwareBack(() => {
    back();
    return true;
  });
  const lastList = useRef<
    { binding: string; data: typeof read.data } | undefined
  >(undefined);
  const lastDetail = useRef<
    { binding: string; data: typeof read.data } | undefined
  >(undefined);
  if (read.data?.cases || read.data?.sessions)
    lastList.current = { binding: listBinding, data: read.data };
  const recoverable = canRetainHistory(read.error);
  if (!recoverable) {
    lastList.current = undefined;
    listPages.current = { binding: '' };
    eventPages.current = { binding: '' };
    lastDetail.current = undefined;
  }
  const priorDetail =
    recoverable && lastDetail.current?.binding === timelineBinding
      ? lastDetail.current.data
      : undefined;
  const protectedDetailError =
    !canRetainHistory(read.data?.recordError) ||
    !canRetainHistory(read.data?.eventsError);
  if (protectedDetailError) lastDetail.current = undefined;
  const detailData =
    read.data ?? (!protectedDetailError ? priorDetail : undefined);
  const timelineEvents =
    detailData?.events ??
    (read.data?.eventsError && !protectedDetailError
      ? priorDetail?.events
      : undefined);
  if (read.data?.record || read.data?.session)
    lastDetail.current = {
      binding: timelineBinding,
      data: {
        ...read.data,
        events: protectedDetailError ? read.data.events : timelineEvents,
      },
    };
  const retainedList =
    !caseId &&
    !sessionId &&
    lastList.current?.binding === listBinding &&
    recoverable
      ? lastList.current?.data
      : undefined;
  const cases = read.data?.cases ?? retainedList?.cases;
  const sessions = read.data?.sessions ?? retainedList?.sessions;
  const visibleCaseRows =
    recoverable && rowsBinding === listBinding ? caseRows : [];
  const visibleSessionRows =
    recoverable && rowsBinding === listBinding ? sessionRows : [];
  useEffect(() => {
    setPaging({ page: 1 });
    setEventCursor(undefined);
    setCaseRows([]);
    setSessionRows([]);
  }, [listBinding]);
  useEffect(() => {
    if (caseId || sessionId || draftQuery.trim() === query) return;
    const timer = setTimeout(() => setQuery(draftQuery.trim()), 250);
    return () => clearTimeout(timer);
  }, [draftQuery, query, caseId, sessionId]);
  useEffect(() => {
    if (read.data?.cases) {
      setRowsBinding(listBinding);
      setCaseRows([...read.data.cases.items]);
      listPages.current = {
        binding: listBinding,
        cases: read.data.cases.window,
      };
    }
    if (read.data?.sessions) {
      setRowsBinding(listBinding);
      setSessionRows([...read.data.sessions.items]);
      listPages.current = {
        binding: listBinding,
        sessions: read.data.sessions.window,
      };
    }
    if (read.data?.events)
      eventPages.current = {
        binding: timelineBinding,
        cases: read.data.events.window,
      };
    if (read.data?.session)
      eventPages.current = {
        binding: timelineBinding,
        sessions: read.data.session.window,
      };
  }, [read.data, listBinding, timelineBinding]);
  const record = detailData?.record;
  const sessionData = detailData?.session;
  const eventsMeta = timelineEvents?.meta as
    | Record<string, unknown>
    | undefined;
  const panel = caseId
    ? 'S02'
    : sessionId
    ? 'S04'
    : kind === 'warranty'
    ? 'S01'
    : 'S03';
  const next = cases?.meta ?? sessions ?? timelineEvents?.meta;

  const openDates = () => {
    setQuery(draftQuery.trim());
    setReader(undefined);
    setFilterOpen(true);
  };
  const openOptions = () => {
    setQuery(draftQuery.trim());
    setDraftOptions({ status: statusFilter, field: dateField, sessionStatus });
    setOptionsOpen(true);
  };
  const hasConditions =
    !!dates ||
    statusFilter !== 'ALL' ||
    sessionSource !== 'ALL' ||
    sessionStatus !== 'ALL' ||
    dateField !== 'created_at';
  const reload = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Tải lại dữ liệu"
      accessibilityState={{ disabled: read.loading, busy: read.loading }}
      style={s.controlLink}
      onPress={() => {
        if (!read.loading) read.retry();
      }}
    >
      <Text style={s.controlText}>
        {read.loading ? 'Đang tải…' : 'Tải lại'}
      </Text>
    </Pressable>
  );
  const showSource = () => {
    if (record)
      setReader(
        [
          'Mã hồ sơ: ' + record.warranty_case_id,
          'Trạng thái hiện tại: ' + p23WarrantyStatus(record.status),
          'Mốc mới nhất có thời gian đã ghi nhận: ' +
            instant(
              typeof eventsMeta?.latest_recorded_event_at === 'string'
                ? eventsMeta.latest_recorded_event_at
                : null,
            ),
          'Độ đầy đủ sự kiện mới nhất: ' +
            String(eventsMeta?.latest_completeness ?? 'Chưa công bố'),
          'Không có thời gian: ' + show(eventsMeta?.unknown_time_count),
          'Chính sách lưu giữ: ' +
            String(eventsMeta?.retention_status ?? 'Chưa công bố'),
          ...(timelineEvents?.items ?? []).map(event =>
            [
              event.event_id,
              instant(event.event_at),
              event.from_status ? p23WarrantyStatus(event.from_status) : '—',
              '→',
              event.to_status ? p23WarrantyStatus(event.to_status) : '—',
            ].join(' · '),
          ),
        ].join('\n'),
      );
    else if (sessionData)
      setReader(
        [
          'Mã phiên: ' + sessionData.batch.id,
          'Bắt đầu: ' + instant(sessionData.batch.startedAt),
          'Kết thúc: ' + instant(sessionData.batch.endedAt),
          'Trạng thái phiên: ' +
            (sessionData.batch.status
              ? historyStatus(sessionData.batch.status)
              : '—'),
          'Kết quả chứng từ: Chưa có nguồn xác minh',
          'Tổng lượt: ' + show(sessionData.batch.counts.total),
          'Được chấp nhận: ' + show(sessionData.batch.counts.accepted),
          'Đọc trùng: ' + show(sessionData.batch.counts.duplicate),
          'Từ chối có nguồn: ' +
            show(sessionData.batch.counts.explicitRejected),
          'Tổng từ chối: ' + show(sessionData.batch.counts.rejected),
          'Lượng đã xuất: ' + show(sessionData.batch.counts.issuedQuantity),
          'Sự kiện mới nhất toàn nguồn: ' +
            instant(sessionData.latestEvent?.occurredAt),
          'Kết quả gốc: ' +
            (sessionData.latestEvent?.status
              ? historyStatus(sessionData.latestEvent.status)
              : '—'),
          'Mã gốc: ' + (sessionData.latestEvent?.rawCode ?? '—'),
          'Lý do: ' + (sessionData.latestEvent?.reason ?? '—'),
          'Serial: ' + (sessionData.latestEvent?.serial ?? '—'),
          'SKU: ' + (sessionData.latestEvent?.sku ?? '—'),
          'Người thực hiện sự kiện: ' + (sessionData.latestEvent?.actor ?? '—'),
          'Lượng xuất có nguồn: ' +
            show(sessionData.latestEvent?.issuedQuantity),
          ...sessionData.events.map(event =>
            [event.id, instant(event.time), historyStatus(event.status)].join(
              ' · ',
            ),
          ),
        ].join('\n'),
      );
  };
  return (
    <>
      <HistoryFrame
        footerOverride={footer}
        appearance="locked-history"
        title={
          caseId
            ? 'Quá trình bảo hành'
            : sessionId
            ? 'Chi tiết phiên quét'
            : kind === 'warranty'
            ? 'Lịch sử bảo hành'
            : 'Lịch sử phiên quét'
        }
        onBack={back}
        initialScrollY={caseId || sessionId ? 0 : listScroll.current}
        onScrollPositionChange={y => {
          if (!caseId && !sessionId) listScroll.current = y;
        }}
        restoreKey={
          caseId ??
          sessionId ??
          'list:' +
            scope +
            ':' +
            kind +
            ':' +
            JSON.stringify([query, dates, paging])
        }
        footerLabel={
          initialCaseId || initialSessionId
            ? 'Quay lại'
            : caseId
            ? 'Về lịch sử bảo hành'
            : sessionId
            ? 'Về lịch sử phiên quét'
            : 'Về lịch sử thao tác'
        }
      >
        <View testID={'P23.' + panel} style={s.stack}>
          {!caseId && !sessionId ? (
            <HistoryFilterBar
              keyword={draftQuery}
              placeholder={
                kind === 'warranty'
                  ? 'Tìm mã hồ sơ hoặc serial'
                  : 'Tìm mã phiên hoặc nguồn quét'
              }
              searchLabel={
                kind === 'warranty'
                  ? 'Mã hồ sơ hoặc serial'
                  : 'Mã phiên quét hoặc nghiệp vụ'
              }
              onKeywordChange={value => {
                setDraftQuery(value);
                if (!value) setQuery('');
              }}
              onSubmit={() => {
                setQuery(draftQuery.trim());
                setPaging({ page: 1 });
                listScroll.current = 0;
              }}
              submitLabel="Áp dụng bộ lọc"
              onFilter={openOptions}
              filterLabel={
                hasConditions
                  ? 'Bộ lọc lịch sử, đang áp dụng'
                  : 'Bộ lọc lịch sử'
              }
              filtered={hasConditions}
              dateLabel={
                dates
                  ? p08DateLabel(dates.from) + ' – ' + p08DateLabel(dates.to)
                  : 'Tất cả ngày'
              }
              dateButtonLabel="Bộ lọc ngày lịch sử"
              onDates={openDates}
              total={kind === 'warranty' ? cases?.meta.total : sessions?.total}
              loading={read.loading}
              onReload={read.retry}
              onClear={() => {
                setDates(undefined);
                setStatusFilter('ALL');
                setSessionSource('ALL');
                setSessionStatus('ALL');
                setDateField('created_at');
              }}
              tabs={
                <>
                  {kind === 'warranty' ? (
                    <P23Tabs
                      chips={[
                        { key: 'ALL', label: 'Tất cả' },
                        { key: 'CHECKING', label: 'Đang kiểm tra' },
                        { key: 'RETURNED', label: 'Đã trả khách' },
                        ...(!['ALL', 'CHECKING', 'RETURNED'].includes(
                          statusFilter,
                        )
                          ? [
                              {
                                key: statusFilter,
                                label: p23WarrantyStatus(statusFilter),
                              },
                            ]
                          : []),
                      ]}
                      activeKey={statusFilter}
                      onSelect={setStatusFilter}
                    />
                  ) : (
                    <>
                      <P23Tabs
                        chips={[
                          ...new Set([
                            'ALL',
                            sessionSource,
                            ...visibleSessionRows
                              .map(row => row.sourceType)
                              .filter((value): value is string => !!value),
                          ]),
                        ].map(key => ({
                          key,
                          label: key === 'ALL' ? 'Tất cả' : historySource(key),
                        }))}
                        activeKey={sessionSource}
                        onSelect={setSessionSource}
                      />
                      {visibleSessionRows.some(row => !!row.status) ||
                      sessionStatus !== 'ALL' ? (
                        <P23Tabs
                          chips={[
                            ...new Set([
                              'ALL',
                              sessionStatus,
                              ...visibleSessionRows
                                .map(row => row.status)
                                .filter((value): value is string => !!value),
                            ]),
                          ].map(key => ({
                            key,
                            label:
                              key === 'ALL'
                                ? 'Tất cả trạng thái'
                                : historyStatus(key),
                          }))}
                          activeKey={sessionStatus}
                          onSelect={setSessionStatus}
                        />
                      ) : null}
                    </>
                  )}
                </>
              }
              meta={
                kind === 'sessions' &&
                sessions?.availableTotal !== sessions?.total ? (
                  <Text style={s.small}>
                    Tổng phiên: {show(sessions?.total)} · Nguồn khả dụng:{' '}
                    {show(sessions?.availableTotal)}
                  </Text>
                ) : undefined
              }
            />
          ) : (
            <View style={s.controlRow}>
              <Text style={[s.small, s.fill]}>
                {caseId ? 'Thông tin hồ sơ bảo hành' : 'Thông tin phiên quét'}
              </Text>
              {reload}
            </View>
          )}
          {!caseId && !sessionId && cases ? (
            <>
              {visibleCaseRows.map(row => (
                <P23CaseCard
                  key={row.warranty_case_id}
                  row={row}
                  viewed={viewedCaseId === row.warranty_case_id}
                  onOpen={() => {
                    setViewedCaseId(row.warranty_case_id);
                    setCaseId(row.warranty_case_id);
                    setEventPaging({ page: 1 });
                  }}
                />
              ))}
              {cases.meta.total === 0 ? (
                <Text style={s.muted}>Chưa có hồ sơ trong bộ lọc.</Text>
              ) : null}
            </>
          ) : null}
          {record ? (
            <P23WarrantyDetail
              record={record}
              events={timelineEvents?.items ?? []}
              newestFirst={
                !('cursor' in eventPaging) &&
                eventPaging.page === 1 &&
                !timelineEvents?.meta.hasMore
              }
              meta={eventsMeta}
              onComponents={onComponents}
              onRead={setReader}
            />
          ) : null}
          {!caseId && !sessionId && sessions ? (
            <>
              {visibleSessionRows.map((row, index) => (
                <React.Fragment key={row.id}>
                  {index === 0 ||
                  historyDay(visibleSessionRows[index - 1].createdAt) !==
                    historyDay(row.createdAt) ? (
                    <Text style={s.eventTitle}>
                      {historyDay(row.createdAt)}
                    </Text>
                  ) : null}
                  <P23SessionCard
                    row={row}
                    viewed={viewedSessionId === row.id}
                    onOpen={() => {
                      setViewedSessionId(row.id);
                      setSessionId(row.id);
                      setEventCursor(undefined);
                    }}
                  />
                </React.Fragment>
              ))}
              {sessions.total === 0 ? (
                <Text style={s.muted}>
                  Chưa có phiên trong nguồn và bộ lọc này.
                </Text>
              ) : null}
            </>
          ) : null}
          {sessionData ? (
            <>
              <P23SessionDetail data={sessionData} onRead={setReader} />
              {sessionData.hasMore ? (
                <Button
                  label="Trang sự kiện tiếp theo"
                  disabled={read.loading || !!read.error}
                  onPress={() => setEventCursor(sessionData.nextCursor!)}
                />
              ) : null}
            </>
          ) : null}
          {record || sessionData ? (
            <Pressable
              style={s.controlLink}
              accessibilityRole="button"
              accessibilityLabel="Đọc thông tin nguồn"
              onPress={showSource}
            >
              <Text style={s.controlText}>Thông tin nguồn</Text>
            </Pressable>
          ) : null}
          {read.data?.recordError ? (
            <Text tone="danger">
              Lỗi thông tin hồ sơ: {read.data.recordError.message}
            </Text>
          ) : null}
          {read.data?.eventsError ? (
            <Text tone="danger">
              Lỗi dòng thời gian: {read.data.eventsError.message}
            </Text>
          ) : null}
          {next?.hasMore ? (
            <Button
              label="Trang tiếp theo"
              disabled={
                read.loading || !!read.error || !!read.data?.eventsError
              }
              onPress={() => {
                const nextPage = next.nextCursor
                  ? { cursor: next.nextCursor }
                  : { page: next.nextPage! };
                if (caseId) setEventPaging(nextPage);
                else {
                  setPagingBinding(listBinding);
                  setPaging(nextPage);
                }
              }}
            />
          ) : null}
          {read.loading ? (
            <Text accessibilityLiveRegion="polite">Đang đọc lịch sử…</Text>
          ) : null}
          {(retainedList || priorDetail) &&
          !read.data &&
          (read.loading || read.error) ? (
            <Text tone="muted">Đang giữ kết quả của lần đọc trước.</Text>
          ) : null}
          {read.error ? (
            <Text tone="danger">
              {read.error.message}
              {read.error.requestId ? ' · ' + read.error.requestId : ''}
            </Text>
          ) : null}
          {read.error || read.data?.eventsError ? (
            <Button
              label="Đọc lại từ trang đầu, giữ bộ lọc"
              disabled={read.loading}
              variant="secondary"
              onPress={() => {
                listPages.current = { binding: '' };
                eventPages.current = { binding: '' };
                setPaging({ page: 1 });
                setPagingBinding(listBinding);
                setEventPaging({ page: 1 });
                setEventCursor(undefined);
                read.retry();
              }}
            />
          ) : null}
        </View>
      </HistoryFrame>
      <P08FilterDialog
        visible={filterOpen}
        sourcesVisible={false}
        statusesVisible={false}
        timezone="Asia/Ho_Chi_Minh"
        filters={
          (dates
            ? { date_mode: 'RANGE', ...dates }
            : { date_mode: 'ALL' }) as P08Filters
        }
        onCancel={() => setFilterOpen(false)}
        onApply={f => {
          setDates(
            f.date_mode === 'RANGE'
              ? { from: f.from, to: f.to }
              : f.date_mode === 'DATE'
              ? { from: f.date, to: f.date }
              : undefined,
          );
          setPaging({ page: 1 });
          listScroll.current = 0;
          setFilterOpen(false);
        }}
      />
      <Dialog
        visible={optionsOpen}
        panelMaxWidth={428}
        titleStyle={{ fontSize: 22, lineHeight: 28 }}
        title="Bộ lọc lịch sử"
        dismissOnBackdrop={false}
        onDismiss={() => setOptionsOpen(false)}
        footer={
          <View style={s.row}>
            <Button
              label="Đặt lại"
              style={{ flex: 1, minWidth: 0 }}
              onPress={() =>
                setDraftOptions({
                  status: 'ALL',
                  field: 'created_at',
                  sessionStatus: 'ALL',
                })
              }
            />
            <Button
              label="Hủy"
              style={{ flex: 1, minWidth: 0 }}
              variant="secondary"
              onPress={() => setOptionsOpen(false)}
            />
            <Button
              label="Áp dụng"
              style={{ flex: 1, minWidth: 0 }}
              onPress={() => {
                setStatusFilter(draftOptions.status);
                setDateField(draftOptions.field as typeof dateField);
                setSessionStatus(draftOptions.sessionStatus);
                setOptionsOpen(false);
                listScroll.current = 0;
              }}
            />
          </View>
        }
      >
        <View style={s.stack}>
          {kind === 'warranty' ? (
            <>
              <Text style={s.eventTitle}>Trạng thái hồ sơ</Text>
              <P23Tabs
                chips={[
                  'ALL',
                  'RECEIVED',
                  'CHECKING',
                  'REPAIRING',
                  'COMPLETED',
                  'RETURNED',
                  'CANCELLED',
                ].map(key => ({
                  key,
                  label:
                    key === 'ALL'
                      ? 'Tất cả trạng thái'
                      : p23WarrantyStatus(key),
                }))}
                activeKey={draftOptions.status}
                onSelect={status =>
                  setDraftOptions(value => ({ ...value, status }))
                }
              />
              <Text style={s.eventTitle}>Lọc ngày theo</Text>
              <P23Tabs
                chips={[
                  { key: 'created_at', label: 'Ngày tạo' },
                  { key: 'received_at', label: 'Ngày tiếp nhận' },
                  { key: 'returned_at', label: 'Ngày trả khách' },
                ]}
                activeKey={draftOptions.field}
                onSelect={field =>
                  setDraftOptions(value => ({ ...value, field }))
                }
              />
            </>
          ) : (
            <>
              <Text style={s.eventTitle}>Trạng thái phiên</Text>
              <P23Tabs
                chips={[
                  ...new Set([
                    'ALL',
                    sessionStatus,
                    ...visibleSessionRows
                      .map(row => row.status)
                      .filter((value): value is string => !!value),
                  ]),
                ].map(key => ({
                  key,
                  label:
                    key === 'ALL' ? 'Tất cả trạng thái' : historyStatus(key),
                }))}
                activeKey={draftOptions.sessionStatus}
                onSelect={sessionStatusValue =>
                  setDraftOptions(value => ({
                    ...value,
                    sessionStatus: sessionStatusValue,
                  }))
                }
              />
            </>
          )}
          <Text style={s.muted}>
            Chọn khoảng ngày tại hàng ngày của danh sách. Hủy giữ nguyên các bộ
            lọc đang áp dụng.
          </Text>
        </View>
      </Dialog>
      <Dialog
        visible={!!reader}
        title="Thông tin nguồn"
        message={reader}
        dismissOnBackdrop={false}
        onDismiss={() => setReader(undefined)}
        footer={<Button label="Đóng" onPress={() => setReader(undefined)} />}
      />
    </>
  );
}
