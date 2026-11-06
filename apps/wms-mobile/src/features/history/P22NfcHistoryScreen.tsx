import {HN_UI} from '../../theme/uiKitV3';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { HistoryFilterBar } from './HistoryFilterBar';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';
import { Dialog } from '../../ui/Dialog';
import { useHardwareBack } from '../../app/useHardwareBack';
import { copyNfcIdentifier } from '../../native/nfc';
import type { P08Context } from '../../services/wms/p08Types';
import {
  createLinkedHistoryRead,
  type NfcHistoryEvent,
} from '../../services/wms/linkedHistoryRead';
import { useOwnerRead } from './useOwnerRead';
import { captureSessionScope, isSessionScopeCurrent } from '../../auth/session';
import { AppIcon } from '../../ui/AppIcon';
import { P22Frame } from './P22Frame';
import { P22IconTile, P22Outcome, P22Value, p22 as s } from './P22Presentation';
import {
  historyClock,
  historyDay,
  historyInstant,
  historyStatus,
} from './historyPresentation';
import { P08FilterDialog } from './P08FilterDialog';
import type { P08Filters } from '../../services/wms/p08Types';
import { AppError, toAppError } from '../../errors/AppError';
import { FilterChipRow } from '../../ui/FilterChipRow';
type Selection = { recordId: string; activityId: string } | { eventId: string };
export function P22NfcHistoryScreen({
  context,
  onBack,
  initial,
  footer,
}: {
  context: P08Context;
  onBack(): void;
  initial?: Selection;
  footer?: React.ReactNode;
}) {
  const ctx = useRef(context);
  const listScroll = useRef(0);
  ctx.current = context;
  const api = useMemo(() => createLinkedHistoryRead(() => ctx.current), []),
    scope = api.scopeKey('P22'),
    generation = captureSessionScope().generation;
  const [keyword, setKeyword] = useState(''),
    [type, setType] = useState('ALL'),
    [query, setQuery] = useState<Record<string, string>>({}),
    [cursor, setCursor] = useState<string>(),
    [previous, setPrevious] = useState<NfcHistoryEvent[]>([]),
    [selected, setSelected] = useState<Selection | undefined>(initial),
    [notice, setNotice] = useState<string>();
  const [filterOpen, setFilterOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false),
    [resultDraft, setResultDraft] = useState('ALL');
  const [expanded, setExpanded] = useState(false),
    [viewedId, setViewedId] = useState<string>();
  const copyBusy = useRef(false);
  const copyGeneration = useRef(0);
  const [copying, setCopying] = useState(false);
  const cursorTrail = useRef(new Set<string>());
  const [cursorStopped, setCursorStopped] = useState(false);
  const binding = scope + ':' + generation + ':' + JSON.stringify(query),
    previousBinding = useRef(binding);
  const initialKey = JSON.stringify(initial),
    initialRef = useRef(initial),
    selection = useRef(''),
    alive = useRef(true);
  initialRef.current = initial;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setPrevious([]);
    setCursor(undefined);
    if (initialKey === JSON.stringify(initialRef.current))
      setSelected(initialRef.current);
    setNotice(undefined);
    setResultOpen(false);
    setExpanded(false);
    setViewedId(undefined);
    cursorTrail.current.clear();
    setCursorStopped(false);
    previousBinding.current = binding;
  }, [binding, initialKey]);
  const selectionKey = JSON.stringify(selected),
    read = useOwnerRead(
      binding + ':' + (cursor ?? 'first') + ':' + selectionKey,
      async signal => {
        if (selected) {
          const detail =
            'eventId' in selected
              ? await api.nfcEvent(selected.eventId, signal)
              : await api.nfcDetail(
                  selected.recordId,
                  selected.activityId,
                  signal,
                );
          return { detail };
        }
        const [pageResult, summaryResult] = await Promise.allSettled([
          api.nfcList({ ...query, ...(cursor ? { cursor } : {}) }, signal),
          api.nfcSummary(query, signal),
        ]);
        if (pageResult.status === 'rejected') throw pageResult.reason;
        const page = pageResult.value;
        const old = previousBinding.current === binding ? previous : [];
        if (
          page.items.some(item =>
            old.some(
              prior =>
                prior.activityId === item.activityId &&
                JSON.stringify(prior) !== JSON.stringify(item),
            ),
          )
        )
          throw new AppError({
            kind: 'parse',
            code: 'NFC_HISTORY_IDENTITY_CONFLICT',
            message:
              'Sự kiện NFC cùng ID có nội dung mâu thuẫn. Giữ trang đã xác minh và đọc lại từ đầu.',
          });
        if (page.hasMore && (!page.nextCursor || page.nextCursor === cursor))
          throw new AppError({
            kind: 'parse',
            code: 'NFC_HISTORY_CURSOR_INVALID',
            message:
              'Cursor NFC không tiến tới trang mới. Đọc lại từ đầu, giữ bộ lọc.',
          });
        return {
          page,
          summary:
            summaryResult.status === 'fulfilled'
              ? summaryResult.value
              : undefined,
          summaryError:
            summaryResult.status === 'rejected'
              ? toAppError(summaryResult.reason)
              : undefined,
        };
      },
    );
  const copySelection =
    binding + ':' + selectionKey + ':' + JSON.stringify(read.data?.detail);
  selection.current = copySelection;
  useEffect(() => {
    if (read.error && [401, 403].includes(read.error.status ?? 0))
      setPrevious([]);
  }, [read.error]);
  const back = () => {
    copyGeneration.current++;
    if (resultOpen) setResultOpen(false);
    else if (filterOpen) setFilterOpen(false);
    else if (notice) setNotice(undefined);
    else if (selected && !initial) setSelected(undefined);
    else onBack();
  };
  useHardwareBack(() => {
    back();
    return true;
  });
  const rows =
    read.error && [401, 403].includes(read.error.status ?? 0)
      ? []
      : read.data?.page
      ? [
          ...new Map(
            [
              ...(previousBinding.current === binding ? previous : []),
              ...read.data.page.items,
            ].map(x => [x.activityId, x]),
          ).values(),
        ]
      : previousBinding.current === binding
      ? previous
      : [];
  async function copy(value: string, label: string, expected: string) {
    if (copyBusy.current || selection.current !== expected) return;
    const operation = ++copyGeneration.current;
    copyBusy.current = true;
    setCopying(true);
    const captured = captureSessionScope(),
      key = selection.current;
    try {
      await copyNfcIdentifier(value);
      if (
        alive.current &&
        operation === copyGeneration.current &&
        isSessionScopeCurrent(captured) &&
        selection.current === key
      )
        setNotice('Đã sao chép ' + label);
    } catch {
      if (
        alive.current &&
        operation === copyGeneration.current &&
        isSessionScopeCurrent(captured) &&
        selection.current === key
      )
        setNotice('Chưa sao chép được mã.');
    } finally {
      copyBusy.current = false;
      if (alive.current) setCopying(false);
    }
  }
  const detail = read.data?.detail;
  const sourceUnavailable = read.error?.status === 503;
  useEffect(() => {
    if (selected || keyword.trim() === (query.keyword ?? '')) return;
    const timer = setTimeout(() => applySearch(), 250);
    return () => clearTimeout(timer);
    // applySearch is intentionally driven only by the draft keyword.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, selected, query.keyword]);
  const applySearch = () => {
    setCursor(undefined);
    setPrevious([]);
    listScroll.current = 0;
    setQuery(old => {
      const next = { ...old };
      delete next.keyword;
      if (keyword.trim()) next.keyword = keyword.trim();
      return next;
    });
  };
  const typeLabel = (value: string) =>
    ((
      { Gán: 'Gán thẻ', Thay: 'Thay thẻ', 'Thu hồi': 'Thu hồi thẻ' } as Record<
        string,
        string
      >
    )[value] ?? value);
  const readValue = (value: string) => {
    copyGeneration.current++;
    setNotice(value);
  };
  const chooseType = (key: string) => {
    setType(key);
    setCursor(undefined);
    setPrevious([]);
    listScroll.current = 0;
    setQuery(old => {
      const q = { ...old };
      delete q.type;
      if (key !== 'ALL') q.type = key;
      return q;
    });
  };
  const dateLabel =
    query.date_mode === 'DATE' && query.date
      ? query.date.split('-').reverse().join('/')
      : query.date_mode === 'RANGE' && query.from && query.to
      ? query.from.split('-').reverse().join('/') +
        ' – ' +
        query.to.split('-').reverse().join('/')
      : 'Tất cả ngày';
  const metadata = (
    label: string,
    value: string | null | undefined,
    copyKind?: string,
    lines: 2 | 3 = 2,
  ) => (
    <View key={label} style={s.metadataRow}>
      <Text style={s.metadataLabel}>{label}</Text>
      <View style={s.copyValue}>
        <P22Value
          label={copyKind ?? label}
          value={value}
          lines={lines}
          onRead={readValue}
        />
        {copyKind && value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Sao chép ' + copyKind}
            accessibilityState={{ disabled: copying, busy: copying }}
            disabled={copying}
            style={s.copy}
            onPress={() => copy(value, copyKind, copySelection)}
          >
            <Text style={s.copyText}>Sao chép</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
  const replacement = detail?.type === 'Thay' || detail?.type === 'REPLACE';
  const resultOptions = [
    ...new Set([
      'ALL',
      'UNKNOWN',
      query.status ?? 'ALL',
      ...(read.data?.summary?.statusTotals ?? []).map(
        item => item.status ?? 'UNKNOWN',
      ),
    ]),
  ];
  const dock =
    !selected && !sourceUnavailable ? (
      <View style={s.dock}>
        <HistoryFilterBar
          keyword={keyword}
          placeholder="Tìm UID hoặc serial"
          searchLabel="UID, UID cũ hoặc serial"
          onKeywordChange={value => {
            setKeyword(value);
            if (!value) {
              setCursor(undefined);
              setPrevious([]);
              listScroll.current = 0;
              setQuery(old => {
                const next = { ...old };
                delete next.keyword;
                return next;
              });
            }
          }}
          onSubmit={applySearch}
          onFilter={() => {
            setResultDraft(query.status ?? 'ALL');
            setResultOpen(true);
          }}
          filterLabel="Bộ lọc kết quả NFC"
          filtered={
            !!query.status ||
            (!!query.date_mode && query.date_mode !== 'ALL') ||
            type === 'UNKNOWN'
          }
          dateLabel={dateLabel}
          dateButtonLabel="Bộ lọc lịch sử NFC"
          onDates={() => setFilterOpen(true)}
          total={read.data?.page?.total}
          loading={read.loading}
          onReload={read.retry}
          reloadLabel="Đọc lại"
          tabs={
            <FilterChipRow
              variant="history"
              chips={[
                { key: 'ALL', label: 'Tất cả' },
                { key: 'ASSIGN', label: 'Gán thẻ' },
                { key: 'REPLACE', label: 'Thay thẻ' },
                { key: 'REVOKE', label: 'Thu hồi thẻ' },
              ]}
              activeKey={type}
              onSelect={chooseType}
            />
          }
        />
        {query.status || type === 'UNKNOWN' ? (
          <View style={s.chips}>
            {query.status ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Bỏ lọc kết quả"
                style={s.chip}
                onPress={() => {
                  setCursor(undefined);
                  setPrevious([]);
                  setQuery(old => {
                    const q = { ...old };
                    delete q.status;
                    return q;
                  });
                }}
              >
                <Text style={s.small}>{historyStatus(query.status)} ×</Text>
              </Pressable>
            ) : null}
            {type === 'UNKNOWN' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Bỏ lọc loại chưa xác định"
                style={s.chip}
                onPress={() => chooseType('ALL')}
              >
                <Text style={s.small}>Loại chưa xác định ×</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <Text style={s.readStatus} accessibilityLiveRegion="polite">
          {read.error && rows.length
            ? 'Không tải lại được · đang hiển thị kết quả lần đọc trước.'
            : read.loading && rows.length
            ? 'Đang tải lại · vẫn hiển thị kết quả lần đọc trước.'
            : ''}
        </Text>
      </View>
    ) : undefined;
  return (
    <>
      <P22Frame
        footerOverride={footer}
        title={
          selected && !sourceUnavailable
            ? 'Chi tiết thao tác NFC'
            : 'Lịch sử NFC'
        }
        onBack={back}
        dock={dock}
        initialScrollY={selected ? 0 : listScroll.current}
        onScrollPositionChange={y => {
          if (!selected) listScroll.current = y;
        }}
        restoreKey={selected ? JSON.stringify(selected) : 'list:' + binding}
        footerLabel={
          initial
            ? 'Quay lại nguồn lịch sử'
            : selected
            ? 'Về lịch sử NFC'
            : 'Về lịch sử thao tác'
        }
        footerAction={
          sourceUnavailable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tải lại nguồn NFC"
              accessibilityState={{ disabled: read.loading }}
              disabled={read.loading}
              onPress={read.retry}
              style={s.primary}
            >
              <Text style={s.primaryText}>Tải lại lịch sử</Text>
            </Pressable>
          ) : undefined
        }
      >
        <View
          testID={
            sourceUnavailable ? 'P22.S04' : selected ? 'P22.S03' : 'P22.S02'
          }
          style={s.stack}
        >
          {sourceUnavailable ? (
            <>
              <View style={s.empty}>
                <P22IconTile name="history" large />
                <Text style={[s.title, s.center]}>Chưa có dữ liệu lịch sử</Text>
                <Text style={[s.muted, s.center]}>
                  Danh sách thao tác hiện chưa khả dụng. Bạn có thể kiểm tra lại
                  sau.
                </Text>
              </View>
              <View style={s.notice}>
                <AppIcon name="info" size={24} color={HN_UI.textLink} />
                <Text style={s.noticeText}>
                  Bạn vẫn có thể sử dụng các chức năng quét mã.
                </Text>
              </View>
            </>
          ) : !selected ? (
            <>
              {rows.map((event, index) => (
                <React.Fragment key={event.activityId}>
                  {index === 0 ||
                  historyDay(rows[index - 1].time) !==
                    historyDay(event.time) ? (
                    <View style={s.group}>
                      <Text style={s.groupTitle}>{historyDay(event.time)}</Text>
                      <Text style={s.muted}>
                        {
                          rows.filter(
                            row =>
                              historyDay(row.time) === historyDay(event.time),
                          ).length
                        }{' '}
                        thao tác đã tải
                      </Text>
                    </View>
                  ) : null}
                  <Pressable
                    testID={'P22.event.' + event.activityId}
                    accessibilityRole="button"
                    accessibilityLabel="Xem thao tác NFC"
                    style={[
                      s.card,
                      s.event,
                      viewedId === event.activityId && s.viewed,
                    ]}
                    onPress={() => {
                      setViewedId(event.activityId);
                      setExpanded(false);
                      setSelected({
                        recordId: event.recordId,
                        activityId: event.activityId,
                      });
                    }}
                  >
                    <View style={s.row}>
                      <P22IconTile />
                      <Text style={s.eventTitle}>{typeLabel(event.type)}</Text>
                      <P22Outcome status={event.status} />
                    </View>
                    <View>
                      <View style={s.field}>
                        <Text style={s.fieldLabel}>UID</Text>
                        <Text style={s.identifier} numberOfLines={1}>
                          {event.uid ?? 'Chưa xác minh'}
                        </Text>
                      </View>
                      <View style={s.field}>
                        <Text style={s.fieldLabel}>Serial</Text>
                        <Text style={s.identifier} numberOfLines={1}>
                          {event.serial ?? 'Chưa xác minh'}
                        </Text>
                      </View>
                    </View>
                    <View style={s.row}>
                      <Text style={[s.muted, s.fill]}>
                        {historyClock(event.time)}
                        {viewedId === event.activityId ? ' · Vừa xem' : ''}
                      </Text>
                      <Text style={[s.muted, s.actor]} numberOfLines={2}>
                        {event.actor ?? 'Chưa xác minh'} →
                      </Text>
                    </View>
                  </Pressable>
                </React.Fragment>
              ))}
              {read.data?.page?.total === 0 ? (
                <View style={s.empty}>
                  <P22IconTile name="history" large />
                  <Text style={[s.title, s.center]}>
                    {Object.keys(query).some(key => key !== 'date_mode') ||
                    (query.date_mode && query.date_mode !== 'ALL')
                      ? 'Không có kết quả phù hợp'
                      : 'Chưa có thao tác'}
                  </Text>
                  <Text style={[s.muted, s.center]}>
                    Nguồn đã xác nhận kết quả đọc. Bạn có thể thay đổi bộ lọc
                    hoặc tải lại.
                  </Text>
                </View>
              ) : null}
              {read.data?.page?.hasMore && !cursorStopped ? (
                <Button
                  label="Tải thêm sự kiện NFC"
                  disabled={read.loading}
                  onPress={() => {
                    const next = read.data!.page!.nextCursor!;
                    if (cursorTrail.current.has(next)) {
                      setCursorStopped(true);
                      setNotice(
                        'Cursor NFC bị lặp. Đọc lại trang đầu, giữ bộ lọc.',
                      );
                      return;
                    }
                    cursorTrail.current.add(next);
                    setPrevious(rows);
                    setCursor(next);
                  }}
                />
              ) : null}
              {read.data?.page ? (
                <Text style={s.end}>
                  Đã tải {rows.length} sự kiện · Tổng nguồn{' '}
                  {read.data.page.total ?? '—'}
                </Text>
              ) : null}
              {read.data?.summary ? (
                <Text style={s.end}>
                  Tổng hợp NFC: {read.data.summary.grandTotal} sự kiện trong
                  phạm vi nguồn
                </Text>
              ) : null}
              {read.data?.summaryError ? (
                <Text style={s.small}>
                  Chưa đọc được tổng hợp NFC; danh sách vẫn là dữ liệu đã xác
                  minh.
                </Text>
              ) : null}
            </>
          ) : detail ? (
            <>
              <View style={[s.card, s.hero]}>
                <P22IconTile />
                <Text style={s.heroTitle}>{typeLabel(detail.type)}</Text>
                <P22Outcome status={detail.status} />
              </View>
              {replacement ? (
                <View style={[s.card, s.stack]}>
                  <Text style={s.title}>Thay đổi thẻ NFC</Text>
                  <View style={s.uid}>
                    {metadata('Thẻ trước', detail.previousUid, 'UID trước')}
                  </View>
                  <Text style={s.transition}>↓</Text>
                  <View style={s.uid}>
                    {metadata('Thẻ thay thế', detail.uid, 'UID')}
                  </View>
                </View>
              ) : null}
              <View testID="P22.metadata" style={[s.card, s.metadata]}>
                {!replacement ? metadata('UID thẻ', detail.uid, 'UID') : null}
                {metadata('Serial sản phẩm', detail.serial, 'Serial')}
                {metadata('Sản phẩm', detail.product, undefined, 3)}
                {metadata('Người thực hiện', detail.actor)}
                {metadata('Thời điểm', historyInstant(detail.time))}
                {metadata('Kho', detail.warehouse)}
                {detail.reason !== null && detail.reason !== undefined
                  ? metadata('Lý do', detail.reason)
                  : null}
              </View>
              <View style={[s.card, s.stack]}>
                <Text style={s.title}>Nội dung thao tác</Text>
                <Text style={s.description}>Chưa xác minh</Text>
              </View>
              <View style={[s.card, s.stack]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Thông tin đối chiếu"
                  accessibilityState={{ expanded }}
                  onPress={() => setExpanded(v => !v)}
                  style={[s.row, s.tap]}
                >
                  <AppIcon
                    name={expanded ? 'arrow-down' : 'chevron-right'}
                    color={HN_UI.textMuted}
                    size={20}
                  />
                  <Text style={[s.body, s.fill]}>Thông tin đối chiếu</Text>
                </Pressable>
                {expanded ? (
                  <>
                    {metadata('ID sự kiện', detail.eventId)}
                    {metadata('ID hoạt động', detail.activityId)}
                    {metadata(
                      'Trạng thái chip tại sự kiện',
                      detail.tagStatus ? historyStatus(detail.tagStatus) : null,
                    )}
                  </>
                ) : null}
              </View>
              <View style={s.notice}>
                <AppIcon name="info" size={24} color={HN_UI.textLink} />
                <Text style={s.noticeText}>
                  Lịch sử chỉ dùng để xem lại thao tác, không thay đổi trạng
                  thái thẻ.
                </Text>
              </View>
            </>
          ) : null}
          {read.loading ? (
            <Text accessibilityLiveRegion="polite" style={s.muted}>
              Đang đọc nguồn NFC…
            </Text>
          ) : null}
          {read.error && !sourceUnavailable ? (
            <View style={s.notice}>
              <Text tone="danger" style={s.fill}>
                {read.error.message}
                {read.error.requestId ? ' · ' + read.error.requestId : ''}
              </Text>
            </View>
          ) : null}
          {(selected && !sourceUnavailable) ||
          (read.error && !sourceUnavailable && !rows.length) ? (
            <Button
              label="Đọc lại"
              variant="secondary"
              disabled={read.loading}
              onPress={read.retry}
            />
          ) : null}
          {(cursor && read.error) || cursorStopped ? (
            <Button
              label="Đọc lại trang đầu, giữ bộ lọc"
              onPress={() => {
                setCursor(undefined);
                setPrevious([]);
                cursorTrail.current.clear();
                setCursorStopped(false);
              }}
            />
          ) : null}
        </View>
      </P22Frame>
      <P08FilterDialog
        visible={filterOpen}
        sourcesVisible={false}
        statusesVisible={false}
        filters={{ date_mode: 'ALL', ...query } as P08Filters}
        onCancel={() => setFilterOpen(false)}
        onApply={filters => {
          setCursor(undefined);
          setPrevious([]);
          listScroll.current = 0;
          setQuery(old => {
            const next = { ...old };
            delete next.from;
            delete next.to;
            delete next.date;
            if (filters.date_mode === 'RANGE') {
              next.from = filters.from;
              next.to = filters.to;
            }
            if (filters.date_mode === 'DATE') next.date = filters.date;
            next.date_mode = filters.date_mode;
            return next;
          });
          setFilterOpen(false);
        }}
        timezone="Asia/Ho_Chi_Minh"
      />
      <Dialog
        visible={resultOpen}
        panelMaxWidth={428}
        titleStyle={{ fontSize: 22, lineHeight: 28 }}
        title="Bộ lọc kết quả NFC"
        onDismiss={() => setResultOpen(false)}
        dismissOnBackdrop={false}
        footer={
          <View style={s.row}>
            <Button
              label="Đặt lại"
              style={{ flex: 1, minWidth: 0 }}
              onPress={() => setResultDraft('ALL')}
            />
            <Button
              label="Hủy"
              style={{ flex: 1, minWidth: 0 }}
              variant="secondary"
              onPress={() => setResultOpen(false)}
            />
            <Button
              label="Áp dụng"
              style={{ flex: 1, minWidth: 0 }}
              onPress={() => {
                setCursor(undefined);
                setPrevious([]);
                listScroll.current = 0;
                setQuery(old => {
                  const q = { ...old };
                  delete q.status;
                  if (resultDraft !== 'ALL') q.status = resultDraft;
                  return q;
                });
                setResultOpen(false);
              }}
            />
          </View>
        }
      >
        <FilterChipRow
          variant="history-wrap"
          chips={resultOptions.map(key => ({
            key,
            label:
              key === 'ALL'
                ? 'Tất cả kết quả'
                : key === 'UNKNOWN'
                ? 'Chưa ghi nhận kết quả'
                : historyStatus(key) === 'Chưa có nhãn trạng thái'
                ? key
                : historyStatus(key),
          }))}
          activeKey={resultDraft}
          onSelect={setResultDraft}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chưa xác định"
          style={s.chip}
          onPress={() => {
            chooseType('UNKNOWN');
            setResultOpen(false);
          }}
        >
          <Text style={s.body}>Loại thao tác chưa xác định</Text>
        </Pressable>
      </Dialog>
      <Dialog
        visible={!!notice}
        title="Thông báo"
        message={notice}
        dismissOnBackdrop={false}
        onDismiss={() => setNotice(undefined)}
        footer={<Button label="Đóng" onPress={() => setNotice(undefined)} />}
      />
    </>
  );
}
