import { approvedWriteFor } from '../src/api/writeGate';
import { clearSession, setSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import {
  fetchNotifications,
  fetchNotification,
  fetchUnreadNotificationCount,
  mapNotification,
  markNotificationRead,
  markAllNotificationsRead,
  reconcileNotificationRead,
  notificationReadPath,
  unreadCountFrom,
  P13_CONTRACT,
  NOTIFICATIONS_READ_ALL_PATH,
} from '../src/services/wms/notifications';
import { AppError } from '../src/errors/AppError';
import type { RequestOptions } from '../src/api/client';
const id = (n: number) =>
  '13000000-0000-4000-8000-' + String(n).padStart(12, '0');
const row = (extra: Record<string, unknown> = {}) => ({
  id: id(1),
  notification_id: id(99),
  title: 'Có phiếu mới',
  body: 'Nội dung thật',
  severity: null,
  read_at: null,
  created_at: '2026-10-14T01:00:00Z',
  event_key: 'STOCK_RECORD',
  subject: null,
  ...extra,
});
const result = (data: unknown, meta: Record<string, unknown> = {}) => ({
  status: 200,
  data: {
    success: true,
    data,
    meta: {
      contract: P13_CONTRACT,
      projection_revision: 'p13-notifications-r2',
      count_unit: 'NOTIFICATION_RECIPIENT',
      ...meta,
    },
  },
});
const page = (rows: unknown[], extra: Record<string, unknown> = {}) =>
  result(rows, {
    pagination_mode: 'keyset',
    per_page: 20,
    total: rows.length,
    has_more: false,
    next_cursor: null,
    ...extra,
  });
const client = (respond: (path: string, options?: unknown) => unknown) =>
  ({
    get: jest.fn(async (path: string, options?: unknown) =>
      respond(path, options),
    ),
  } as any);
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline',
    userId: id(10),
    authSessionId: id(11),
    activeWarehouseId: id(12),
  });
});
afterEach(() => clearSession());
test('recipient ID only; missing notification_id never becomes a route', () => {
  expect(mapNotification(row()).id).toBe(id(1));
  expect(() =>
    mapNotification(row({ id: undefined, notification_id: id(99) })),
  ).toThrow('recipient');
  expect(() => notificationReadPath('number-or/foreign')).toThrow();
});
test('source null remains null; no title/time/result from other fields', () => {
  expect(
    mapNotification(
      row({
        title: null,
        body: null,
        created_at: null,
        sent_at: 'fake',
        type: 'fake',
      }),
    ),
  ).toMatchObject({ title: null, message: null, createdAt: null, read: false });
});
test('unread count accepts only source unread_count, including exact zero', () => {
  expect(unreadCountFrom({ unread_count: 0 })).toBe(0);
  expect(unreadCountFrom({ data: { unread_count: 4 } })).toBe(4);
  for (const v of [
    {},
    { count: 3 },
    { unread_count: null },
    { unread_count: '3' },
    { unread_count: -1 },
  ])
    expect(() => unreadCountFrom(v)).toThrow();
});

test('TC09 uses persisted actor/doc labels, not title or current caller; mismatched payload never supplies doc_no', () => {
  const subject = {
    mapping_revision: 'p13-notifications-r2',
    mapping_status: 'MAPPED',
    identity_source: 'PERSISTED_NOTIFICATION_EVENT_AND_PAYLOAD',
    business_type: 'INBOUND',
    business_id: id(20),
    warehouse_id: id(12),
  };
  const original = row({
    subject,
    actor_name: 'Người tạo tại sự kiện',
    payload_semantics: 'EVENT_SNAPSHOT_NOT_AUTHORIZATION',
    payload: {
      document_id: id(20),
      doc_no: 'PN-SOURCE',
      type: 'receipt',
      warehouse_id: id(12),
    },
  });
  expect(mapNotification(original)).toMatchObject({
    actorName: 'Người tạo tại sự kiện',
    documentNo: 'PN-SOURCE',
    warehouseId: id(12),
  });
  expect(
    mapNotification({
      ...original,
      payload: {
        document_id: id(21),
        doc_no: 'WRONG-SOURCE',
        type: 'receipt',
        warehouse_id: id(12),
      },
    }).documentNo,
  ).toBeNull();
  expect(
    mapNotification(row({ title: 'Minh Anh tạo PN-0005 tại Kho A' })),
  ).toMatchObject({ actorName: null, documentNo: null, warehouseId: null });
  expect(
    mapNotification({
      ...original,
      subject: { ...subject, warehouse_id: null },
    }).warehouseId,
  ).toBeNull();
});
test('first cursor and counts preserve server namespace; no page/kho/query guessing', async () => {
  const c = client(() =>
    page([row()], {
      per_page: 5,
      total: 40,
      has_more: true,
      next_cursor: 'opaque',
    }),
  );
  const p = await fetchNotifications({ perPage: 5, unread: true }, c);
  expect(c.get).toHaveBeenCalledWith('/api/v1/notifications', {
    signal: undefined,
    query: { cursor: 'start', per_page: 5, unread: 1 },
  });
  expect(p).toMatchObject({ total: 40, hasMore: true, nextCursor: 'opaque' });
  expect(p.items).toHaveLength(1);
});
test('next request retains original cursor/filters/size and source total, not items length', async () => {
  const c = client(() => page([], { total: 4 }));
  const p = await fetchNotifications(
    { cursor: 'opaque', severity: 'warning', perPage: 20 },
    c,
  );
  expect(c.get.mock.calls[0][1].query).toEqual({
    cursor: 'opaque',
    severity: 'warning',
    per_page: 20,
  });
  expect(p.total).toBe(4);
});
test.each([
  { pagination_mode: 'offset' },
  { has_more: true, next_cursor: null },
  { total: null },
  { has_more: false, next_cursor: 'unexpected' },
  { has_more: true, next_cursor: 'start' },
])('bad metadata cannot become empty %j', async extra => {
  await expect(
    fetchNotifications(
      {},
      client(() => page([], { ...extra })),
    ),
  ).rejects.toMatchObject({ kind: 'parse' });
});
test('malformed recipient fails whole source instead of silently dropping rows/totals', async () => {
  await expect(
    fetchNotifications(
      {},
      client(() => page([row({ id: undefined })])),
    ),
  ).rejects.toMatchObject({ kind: 'parse' });
});
test('PATCH uses no body/query and reads exact server changed/count/read_at', async () => {
  const request = jest.fn(async (_options: RequestOptions) =>
    result(row({ read_at: '2026-10-14T01:01:00Z' }), {
      changed: false,
      unread_count: 8,
    }),
  );
  const r = await markNotificationRead(id(1), { request } as any);
  expect(request).toHaveBeenCalledWith({
    path: notificationReadPath(id(1)),
    method: 'PATCH',
  });
  expect(request.mock.calls[0][0]).not.toHaveProperty('body');
  expect(request.mock.calls[0][0]).not.toHaveProperty('query');
  expect(r).toMatchObject({
    changed: false,
    unreadCount: 8,
    item: { id: id(1), read: true, readAt: '2026-10-14T01:01:00Z' },
  });
});
test('read-all remains blocked in service and common write gate', async () => {
  const request = jest.fn();
  expect(approvedWriteFor('POST', NOTIFICATIONS_READ_ALL_PATH)).toBeUndefined();
  await expect(markAllNotificationsRead({ request })).rejects.toMatchObject({
    code: 'P13_READ_ALL_NOT_SUPPORTED',
  });
  expect(request).not.toHaveBeenCalled();
});
test('wrong recipient or unconfirmed PATCH is not success', async () => {
  for (const body of [row({ id: id(2), read_at: 'now' }), row()]) {
    await expect(
      markNotificationRead(id(1), {
        request: async () => result(body, { changed: true, unread_count: 2 }),
      } as any),
    ).rejects.toMatchObject({ kind: 'parse' });
  }
});
test('timeout does not retry PATCH; explicit reconciliation uses only same-recipient GET and count', async () => {
  const request = jest.fn(async () => {
    throw new AppError({ kind: 'timeout', message: 'unknown' });
  });
  await expect(markNotificationRead(id(1), { request })).rejects.toMatchObject({
    kind: 'timeout',
  });
  expect(request).toHaveBeenCalledTimes(1);
  const c = client(path =>
    path.endsWith('unread-count')
      ? result({ unread_count: 7 })
      : result(row({ read_at: '2026-10-14T01:01:00Z' })),
  );
  const r = await reconcileNotificationRead(id(1), c);
  expect(c.get.mock.calls.map((call: any) => call[0]).sort()).toEqual(
    [
      '/api/v1/notifications/' + id(1),
      '/api/v1/notifications/unread-count',
    ].sort(),
  );
  expect(r.unreadCount).toBe(7);
});
test('detail GET never writes and requires exact recipient', async () => {
  const c = client(() => result(row()));
  await expect(fetchNotification(id(2), {}, c)).rejects.toMatchObject({
    kind: 'parse',
  });
});
test('account unread read uses its own GET and exact server count', async () => {
  const c = client(() => result({ unread_count: 6 }));
  await expect(fetchUnreadNotificationCount({}, c)).resolves.toBe(6);
  expect(c.get).toHaveBeenCalledWith('/api/v1/notifications/unread-count', {});
});
test('late list/count/write responses from another login cannot mutate new UI scope', async () => {
  let finish!: (v: any) => void;
  const c = client(
      () =>
        new Promise(r => {
          finish = r;
        }),
    ),
    p = fetchNotifications({}, c);
  setSession({
    accessToken: 'new',
    userId: id(10),
    authSessionId: id(22),
    activeWarehouseId: id(12),
  });
  finish(page([row()]));
  await expect(p).rejects.toMatchObject({ code: 'P13_STALE_SCOPE' });
});
