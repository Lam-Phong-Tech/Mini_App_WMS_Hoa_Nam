import {HN_UI} from '../../theme/uiKitV3';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { P13NotificationFrame, type P13ScrollSnapshot } from './P13NotificationFrame';
import {NotificationDeliverySettings} from './delivery/NotificationDeliverySettings';
import type {NotificationDeliveryModel} from './delivery/useNotificationDelivery';
import {deliveryUuid} from './delivery/parse';
import {subscribeNotificationFreshness} from './delivery/freshness';
import {isDeliveryOwnerCurrent} from './delivery/ownerScope';
import {
  P13NotificationDetail,
  P13NotificationActions,
  P13NotificationFilters,
  P13NotificationRow,
} from './P13NotificationPresentation';
import { useHardwareBack } from '../../app/useHardwareBack';
import {
  notificationDocumentTarget,
  type OwnerDocumentTarget,
} from '../../app/ownerNavigation';
import {
  captureSessionScope,
  isSessionScopeCurrent,
  getSession,
  subscribeSession,
} from '../../auth/session';
import { toAppError } from '../../errors/AppError';
import {
  fetchNotifications,
  fetchNotification,
  fetchUnreadNotificationCount,
  markNotificationRead,
  reconcileNotificationRead,
  type NotificationItem,
  type NotificationPage,
} from '../../services/wms/notifications';

type Retained = {
  scope: string;
  unread: boolean;
  page?: NotificationPage;
  items: readonly NotificationItem[];
  selected?: NotificationItem;
  scroll: number;
  count: number | null;
  unknownId?: string;
  detailScroll?: number;
  listRevision?: number;
  restartRequired?: boolean;
  filteredTotalStale?: boolean;
  metadataExpanded?: Record<string, boolean>;
};
export interface P13Retained {
  current?: Retained;
}
const styles = StyleSheet.create({
  content: { gap: 0 },
  detailContent: { flexGrow: 1 },
  counts: {
    fontSize: 15,
    lineHeight: 22.5,
    color: HN_UI.textMuted,
    textAlign: 'center',
    marginVertical: 20,
  },
});
const scopeKey = () => {
  const s = captureSessionScope();
  return JSON.stringify([
    s.userId,
    s.authSessionId,
    s.warehouseId,
    s.generation,
  ]);
};
export function P13NotificationsScreen({
  onBack,
  onOpenDocument,
  onOpenQueue,
  warehouseNamesById,
  retained,
  footer,
  initialRecipientId,
  notificationDelivery,
}: {
  onBack(): void;
  onOpenDocument(target: OwnerDocumentTarget): void;
  onOpenQueue?(): void;
  warehouseNamesById?: Readonly<Record<string, string>>;
  retained?: P13Retained;
  footer?: React.ReactNode;
  initialRecipientId?: string;
  notificationDelivery?: NotificationDeliveryModel;
}) {
  const [state, setState] = useState<Retained>(() =>
    retained?.current?.scope === scopeKey()
      ? retained.current
      : { scope: scopeKey(), unread: true, items: [], scroll: 0, count: null },
  );
  const [loading, setLoading] = useState(false),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>();
  const generation = useRef(0),
    latch = useRef(false),
    alive = useRef(true),
    current = useRef(state);
  current.current = state;
  const listScroll = useRef(state.scroll);
  const frameScroll = useRef<P13ScrollSnapshot>(null);
  const detailScroll = useRef(state.detailScroll ?? 0);
  const valid = state.scope === scopeKey();
  const invalidateRequests = useCallback(() => {
    alive.current = false;
    generation.current++;
  }, []);
  useEffect(() => {
    alive.current = true;
    const off = subscribeSession(() => {
      if (current.current.scope !== scopeKey()) {
        listScroll.current = 0;
        detailScroll.current = 0;
        generation.current++;
        latch.current = false;
        setState({
          scope: scopeKey(),
          unread: true,
          items: [],
          scroll: 0,
          count: null,
        });
        setError(undefined);
        setNotice(undefined);
        setLoading(false);
      }
    });
    return () => {
      invalidateRequests();
      off();
      if (retained)
        retained.current =
          current.current.scope === scopeKey()
            ? {
                ...current.current,
                scroll: listScroll.current,
                detailScroll: detailScroll.current,
              }
            : undefined;
    };
  }, [retained, invalidateRequests]);
  const run = useCallback(async (
    action: (
      scope: ReturnType<typeof captureSessionScope>,
      ticket: number,
    ) => Promise<void>,
  ) => {
    if (latch.current || !valid) return;
    latch.current = true;
    setLoading(true);
    setError(undefined);
    const scope = captureSessionScope(),
      ticket = ++generation.current;
    try {
      await action(scope, ticket);
    } catch (cause) {
      if (
        alive.current &&
        ticket === generation.current &&
        isSessionScopeCurrent(scope)
      ) {
        const e = toAppError(cause);
        const cursorError =
          [409, 410, 422].includes(e.status ?? 0) &&
          [
            'NOTIFICATION_CURSOR_INVALID',
            'NOTIFICATION_CURSOR_EXPIRED',
            'NOTIFICATION_CURSOR_SCOPE_MISMATCH',
          ].includes(e.code ?? '');
        if (cursorError) setState(s => ({ ...s, restartRequired: true }));
        else if ([401, 403].includes(e.status ?? 0))
          setState(s => ({
            ...s,
            items: [],
            selected: undefined,
            page: undefined,
            count: null,
          }));
        setError(e.message);
      }
    } finally {
      if (alive.current && ticket === generation.current) {
        latch.current = false;
        setLoading(false);
      }
    }
  }, [valid]);
  const accepts = (
    scope: ReturnType<typeof captureSessionScope>,
    ticket: number,
  ) =>
    alive.current &&
    ticket === generation.current &&
    isSessionScopeCurrent(scope);
  function load(more = false, unread = current.current.unread) {
    return run(async (scope, ticket) => {
      const before = current.current,
        cursor = more ? before.page?.nextCursor : 'start';
      if (!cursor || (more && before.restartRequired)) return;
      if (!more) {
        listScroll.current = 0;
        detailScroll.current = 0;
        setState(s => ({
          ...s,
          scroll: 0,
          detailScroll: 0,
          listRevision: (s.listRevision ?? 0) + 1,
        }));
      }
      const [pageResult, countResult] = await Promise.allSettled([
        fetchNotifications({ cursor, perPage: 10, unread }),
        fetchUnreadNotificationCount(),
      ]);
      if (!accepts(scope, ticket)) return;
      if (pageResult.status === 'rejected') {
        setState(s => ({
          ...s,
          count: countResult.status === 'fulfilled' ? countResult.value : null,
        }));
        throw pageResult.reason;
      }
      const page = pageResult.value;
      setState(s => ({
        ...s,
        unread,
        page,
        count: countResult.status === 'fulfilled' ? countResult.value : null,
        restartRequired: false,
        filteredTotalStale: false,
        selected: undefined,
        items: [
          ...new Map(
            [...(more ? s.items : []), ...page.items].map(x => [x.id, x]),
          ).values(),
        ],
      }));
      if (countResult.status === 'rejected')
        setError(
          'Đã tải danh sách; chưa xác minh được số thông báo chưa đọc. ' +
            toAppError(countResult.reason).message,
        );
    });
  }
  const firstRead = useRef(load);
  firstRead.current = load;
  const initialRead = useRef<string|undefined>(undefined);
  useEffect(()=>subscribeNotificationFreshness(event=>{if(!isDeliveryOwnerCurrent(event.owner)||current.current.scope!==scopeKey())return;setState(s=>({...s,count:event.unreadCount,filteredTotalStale:s.filteredTotalStale||(event.dataChanged&&!!s.page)}));if(event.dataChanged&&!current.current.unknownId)setNotice('Có thông báo mới. Làm mới danh sách để xem.');}),[]);
  useEffect(() => {
    if (!initialRecipientId && valid && !current.current.page)
      firstRead.current().catch(() => undefined);
  }, [state.scope, valid,initialRecipientId]); // owner-scoped first read only
  useEffect(()=>{if(!valid||loading||!initialRecipientId||!deliveryUuid(initialRecipientId)||initialRead.current===initialRecipientId)return;
    run(async(scope,ticket)=>{initialRead.current=initialRecipientId;const detail=await fetchNotification(initialRecipientId);if(accepts(scope,ticket)){detailScroll.current=0;setState(s=>({...s,selected:detail,detailScroll:0}));}}).catch(()=>undefined);
  },[state.scope,valid,initialRecipientId,loading,run]);
  const back = () => {
    if (loading) return;
    if (state.selected) {
      setState(s => ({ ...s, selected: undefined }));
      setError(undefined);
      if(!current.current.page)firstRead.current().catch(()=>undefined);
    } else onBack();
  };
  useHardwareBack(() => {
    back();
    return true;
  });
  const selected = valid ? state.selected : undefined;
  const target = notificationDocumentTarget(
    selected?.subject,
    getSession()?.activeWarehouseId,
  );
  async function open(item: NotificationItem) {
    await run(async (scope, ticket) => {
      const detail = await fetchNotification(item.id);
      if (accepts(scope, ticket)) {
        listScroll.current = frameScroll.current?.read() ?? listScroll.current;
        detailScroll.current = 0;
        setState(s => ({
          ...s,
          selected: detail,
          items: s.items.map(row => row.id === detail.id ? detail : row),
          filteredTotalStale: s.filteredTotalStale || (s.unread && detail.read),
          scroll: listScroll.current,
          detailScroll: 0,
        }));
        // Explicit row-click intent only. Mount/push/restore GETs stay read-only.
        // A pending result remains bound to its original recipient.
        if (!detail.read && !current.current.unknownId)
          await markInRequest(detail, scope, ticket);
      }
    });
  }
  async function markInRequest(
    item: NotificationItem,
    scope: ReturnType<typeof captureSessionScope>,
    ticket: number,
  ) {
    try {
      const r = await markNotificationRead(item.id);
      if (accepts(scope, ticket)) {
        setState(s => ({
          ...s,
          selected: r.item,
          items: s.items.map(x => (x.id === r.item.id ? r.item : x)),
          count: r.unreadCount,
          unknownId: undefined,
          filteredTotalStale:
            s.filteredTotalStale || (s.unread && r.item.read),
        }));
      }
    } catch (cause) {
      const e = toAppError(cause);
      if (
        accepts(scope, ticket) &&
        (['network', 'timeout', 'parse', 'unknown'].includes(e.kind) ||
          (e.status ?? 0) >= 500)
      )
        setState(s => ({ ...s, unknownId: item.id }));
      throw cause;
    }
  }
  async function mark(item: NotificationItem) {
    await run((scope, ticket) => markInRequest(item, scope, ticket));
  }
  async function check(id: string) {
    await run(async (scope, ticket) => {
      const r = await reconcileNotificationRead(id);
      if (accepts(scope, ticket)) {
        setState(s => ({
          ...s,
          selected: s.selected?.id === id ? r.item : s.selected,
          items: s.items.map(x => (x.id === id ? r.item : x)),
          count: r.unreadCount,
          unknownId: r.item.read ? undefined : id,
          filteredTotalStale: s.filteredTotalStale || (s.unread && r.item.read),
        }));
        setNotice(
          r.item.read
            ? 'Đã xác minh thông báo ' + id + ' đã đọc.'
            : 'Thông báo ' +
                id +
                ' chưa được xác nhận đã đọc; giữ nguyên yêu cầu để kiểm tra tiếp.',
        );
      }
    });
  }
  const openSelectedDocument = () => {
    if (
      selected &&
      target &&
      current.current.selected?.id === selected.id &&
      current.current.scope === scopeKey()
    )
      onOpenDocument(target);
  };
  const selectFilter = (unread: boolean) => {
    if (latch.current || unread === current.current.unread) return;
    setState(s => ({ ...s, page: undefined, items: [], scroll: 0, unread }));
    load(false, unread).catch(() => undefined);
  };
  const visibleItems = state.items.filter(item => !state.unread || !item.read);
  return (
    <P13NotificationFrame
      scrollSnapshot={frameScroll}
      headerAction={!selected&&notificationDelivery?<NotificationDeliverySettings model={notificationDelivery}/>:undefined}
      detail={!!selected}
      restoreKey={
        state.scope +
        (selected
          ? ':detail:' + selected.id
          : ':list:' + state.unread + ':' + (state.listRevision ?? 0))
      }
      initialScrollY={selected ? state.detailScroll ?? 0 : state.scroll}
      onScrollPositionChange={y => {
        if (current.current.scope !== scopeKey()) return;
        if (current.current.selected) detailScroll.current = y;
        else listScroll.current = y;
      }}
      onBack={back}
      busy={loading}
      footer={footer}
      dock={
        !selected && valid ? (
          <P13NotificationFilters
            unread={state.unread}
            count={state.count}
            busy={loading}
            onSelect={selectFilter}
          />
        ) : undefined
      }
      actions={
        selected ? (
          <P13NotificationActions
            item={selected}
            busy={loading}
            canOpen={!!target}
            unknown={!!state.unknownId}
            onOpen={openSelectedDocument}
            onMark={() => {
              mark(selected).catch(() => undefined);
            }}
            onOpenQueue={target ? onOpenQueue : undefined}
          />
        ) : undefined
      }
    >
      <View
        testID={selected ? 'P13.S02' : 'P13.S01'}
        style={[styles.content, selected && styles.detailContent]}
      >
        {!valid ? (
          <Text>Cần xác nhận lại phiên và kho.</Text>
        ) : selected ? (
          <P13NotificationDetail
            item={selected}
            warehouseName={
              selected.warehouseId
                ? warehouseNamesById?.[selected.warehouseId] ?? null
                : null
            }
            busy={loading}
            canOpen={!!target}
            unknown={!!state.unknownId}
            onOpen={openSelectedDocument}
            onMark={() => {
              mark(selected).catch(() => undefined);
            }}
            showActions={false}
            expanded={state.metadataExpanded?.[selected.id] ?? false}
            onExpandedChange={expanded =>
              setState(s => ({
                ...s,
                metadataExpanded: {
                  ...s.metadataExpanded,
                  [selected.id]: expanded,
                },
              }))
            }
          />
        ) : (
          <>
            <View>
              {visibleItems.map(item => (
                <P13NotificationRow
                  key={item.id}
                  item={item}
                  busy={loading}
                  onPress={() => open(item).catch(() => undefined)}
                />
              ))}
            </View>
            {state.page?.total === 0 && !loading ? (
              <Text>Chưa có thông báo trong bộ lọc này.</Text>
            ) : null}
            <Text style={styles.counts}>
              {state.page && !state.page.hasMore && !state.filteredTotalStale
                ? `Đã tải đủ ${visibleItems.length} thông báo`
                : `Đã tải ${state.items.length} thông báo · Tổng lọc ${
                    state.filteredTotalStale
                      ? 'Cần đọc lại'
                      : state.page?.total ?? '—'
                  }`}
            </Text>
            {state.page?.hasMore && !state.restartRequired ? (
              <Button
                label="Hiển thị thêm 10 thông báo"
                disabled={loading}
                onPress={() => load(true).catch(() => undefined)}
              />
            ) : null}
            <Button
              label={
                state.restartRequired
                  ? 'Đọc lại từ đầu, giữ bộ lọc'
                  : 'Tải lại thông báo'
              }
              variant="secondary"
              disabled={loading}
              onPress={() => load().catch(() => undefined)}
            />
          </>
        )}
        {loading ? (
          <Text accessibilityLiveRegion="polite">Đang đọc dữ liệu…</Text>
        ) : null}
        {error ? <Text tone="danger">{error}</Text> : null}
        {state.unknownId ? (
          <View style={styles.content}>
            <Text>
              Đang đối chiếu thông báo: {state.unknownId}. Chưa gửi lại thao tác
              đánh dấu.
            </Text>
            <Button
              label="Kiểm tra kết quả đọc"
              disabled={loading}
              onPress={() => check(state.unknownId!).catch(() => undefined)}
            />
          </View>
        ) : null}
      </View>
      <Dialog
        visible={!!notice}
        title="Kết quả kiểm tra"
        message={notice}
        dismissOnBackdrop={false}
        onDismiss={() => setNotice(undefined)}
        footer={<Button label="Đóng" onPress={() => setNotice(undefined)} />}
      />
    </P13NotificationFrame>
  );
}
