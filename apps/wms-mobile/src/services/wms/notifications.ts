/** P13 revision 2: exact recipient IDs, keyset GETs, no-body PATCH, no read-all. */
import { AppError } from '../../errors/AppError';
import {
  apiClient,
  type ApiResponse,
  type RequestOptions,
} from '../../api/client';
import { approvedWriteFor } from '../../api/writeGate';
import {
  captureSessionScope,
  isSessionScopeCurrent,
  getActiveSession,
} from '../../auth/session';
import type { ReadClient } from './readOnlyClient';
import { parseVietnamTimestamp } from '../../time/vietnamTime';
import {publishNotificationFreshness} from '../../features/notifications/delivery/freshness';
export const P13_CONTRACT = 'p13-notifications-v1';
export const NOTIFICATION_PATHS = {
  list: '/api/v1/notifications',
  unreadCount: '/api/v1/notifications/unread-count',
} as const;
export const NOTIFICATIONS_READ_ALL_PATH =
  '/api/v1/notifications/read-all' as const;
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
type Scope = ReturnType<typeof captureSessionScope>;
function invalid(message: string): never {
  throw new AppError({ kind: 'parse', code: 'P13_INVALID_RESPONSE', message });
}
function object(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function count(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)
    invalid('Số thông báo chưa được nguồn xác nhận.');
  return v;
}
function text(v: unknown): string | null {
  if (v === null) return null;
  if (typeof v !== 'string') invalid('Trường thông báo không đúng contract.');
  return v;
}
function checkScope(s: Scope) {
  if (!getActiveSession() || !isSessionScopeCurrent(s))
    throw new AppError({
      kind: 'cancelled',
      code: 'P13_STALE_SCOPE',
      message: 'Phiên thông báo đã thay đổi.',
    });
}
function envelope(r: ApiResponse<unknown>, s: Scope) {
  checkScope(s);
  const body = object(r.data),
    meta = object(body.meta);
  if (
    r.status !== 200 ||
    body.success !== true ||
    meta.contract !== P13_CONTRACT ||
    meta.projection_revision !== 'p13-notifications-r2' ||
    meta.count_unit !== 'NOTIFICATION_RECIPIENT'
  )
    invalid('Contract thông báo chưa được xác minh.');
  return { body, meta };
}
export interface NotificationItem {
  readonly id: string;
  readonly title: string | null;
  readonly message: string | null;
  readonly severity: string | null;
  readonly read: boolean;
  readonly readAt: string | null;
  readonly createdAt: string | null;
  readonly type: string | null;
  readonly subject: Readonly<Record<string, unknown>> | null;
  /** Plain, persisted event labels only; never current-account/title fallbacks. */
  readonly actorName?: string | null;
  readonly actorJobTitleSnapshot?: string | null;
  readonly warehouseNameSnapshot?: string | null;
  readonly documentNo?: string | null;
  readonly warehouseId?: string | null;
}
export interface NotificationListOptions {
  readonly unread?: boolean;
  readonly severity?: string;
  readonly cursor?: string;
  readonly perPage?: number;
  readonly signal?: AbortSignal;
}
export interface NotificationPage {
  readonly items: readonly NotificationItem[];
  readonly total: number;
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  readonly perPage: number;
}
export interface NotificationReadResult {
  readonly item: NotificationItem;
  readonly changed: boolean;
  readonly unreadCount: number;
}
export interface NotificationWriteClient {
  request<T>(options: RequestOptions): Promise<ApiResponse<T>>;
}
export function notificationDetailPath(recipientId: string): string {
  if (!uuid.test(recipientId))
    throw new AppError({
      kind: 'config',
      code: 'P13_RECIPIENT_ID_REQUIRED',
      message: 'Cần ID recipient thật.',
    });
  return NOTIFICATION_PATHS.list + '/' + encodeURIComponent(recipientId);
}
export function notificationReadPath(recipientId: string) {
  return notificationDetailPath(recipientId) + '/read';
}
export function mapNotification(value: unknown): NotificationItem {
  const raw = object(value);
  if (typeof raw.id !== 'string' || !uuid.test(raw.id))
    invalid('Thiếu ID recipient; không dùng notification_id thay thế.');
  const readAt = text(raw.read_at);
  if (readAt !== null && parseVietnamTimestamp(readAt).status !== 'RECORDED')
    invalid('Thời điểm đã đọc chưa được xác minh.');
  const subject = raw.subject === null ? null : object(raw.subject);
  const payload = object(raw.payload);
  const mapped =
    subject?.mapping_revision === 'p13-notifications-r2' &&
    subject.mapping_status === 'MAPPED' &&
    subject.identity_source === 'PERSISTED_NOTIFICATION_EVENT_AND_PAYLOAD' &&
    typeof subject.business_id === 'string' &&
    uuid.test(subject.business_id) &&
    ['INBOUND', 'OUTBOUND', 'WARRANTY'].includes(String(subject.business_type));
  const sourceId =
    subject?.business_type === 'WARRANTY'
      ? payload.case_id
      : payload.document_id;
  const typeMatches =
    !Object.hasOwn(payload, 'type') ||
    payload.type ===
      (subject?.business_type === 'INBOUND' ? 'receipt' : 'issue');
  const documentNo =
    mapped &&
    typeMatches &&
    sourceId === subject?.business_id &&
    raw.payload_semantics === 'EVENT_SNAPSHOT_NOT_AUTHORIZATION' &&
    typeof payload.doc_no === 'string' &&
    payload.doc_no.trim().length > 0
      ? payload.doc_no
      : null;
  const actorName = raw.actor_name === undefined ? null : text(raw.actor_name);
  const snapshot = object(raw.source_snapshot);
  const hasSnapshot = snapshot.contract === 'notification-source-snapshot-v1' && snapshot.availability === 'RECORDED';
  if(hasSnapshot && (snapshot.actor_id !== raw.actor_id || parseVietnamTimestamp(snapshot.captured_at as string).status !== 'RECORDED'))
    invalid('Snapshot thông báo không khớp actor hoặc thời điểm nguồn.');
  const title = hasSnapshot && snapshot.actor_job_title_status === 'RECORDED'
    ? text(snapshot.actor_job_title_snapshot) : null;
  const warehouseSnapshot = hasSnapshot && snapshot.warehouse_id === subject?.warehouse_id
    ? text(snapshot.warehouse_name_snapshot) : null;
  return {
    id: raw.id,
    title: text(raw.title),
    message: text(raw.body),
    severity: text(raw.severity),
    read: readAt !== null,
    readAt,
    createdAt: text(raw.created_at),
    type: text(raw.event_key),
    subject,
    actorName: actorName?.trim() ? actorName : null,
    actorJobTitleSnapshot: title,
    warehouseNameSnapshot: warehouseSnapshot,
    documentNo,
    warehouseId:
      mapped &&
      typeof subject?.warehouse_id === 'string' &&
      uuid.test(subject.warehouse_id)
        ? subject.warehouse_id
        : null,
  };
}
export function unreadCountFrom(value: unknown): number {
  const raw = object(value);
  return count(
    Object.prototype.hasOwnProperty.call(raw, 'unread_count')
      ? raw.unread_count
      : object(raw.data).unread_count,
  );
}
export async function fetchNotifications(
  options: NotificationListOptions = {},
  client: ReadClient = apiClient,
): Promise<NotificationPage> {
  const s = captureSessionScope();
  checkScope(s);
  if ('page' in options)
    throw new AppError({
      kind: 'config',
      message: 'P13 chỉ dùng cursor, không page.',
    });
  const perPage = options.perPage ?? 20,
    cursor = options.cursor ?? 'start';
  if (
    !Number.isInteger(perPage) ||
    perPage < 1 ||
    perPage > 100 ||
    typeof cursor !== 'string' ||
    !cursor.trim()
  )
    throw new AppError({
      kind: 'config',
      message: 'Phân trang thông báo không hợp lệ.',
    });
  const r = await client.get<unknown>(NOTIFICATION_PATHS.list, {
    signal: options.signal,
    query: {
      cursor,
      per_page: perPage,
      ...(options.unread ? { unread: 1 } : {}),
      ...(options.severity ? { severity: options.severity } : {}),
    },
  });
  const { body, meta } = envelope(r, s);
  if (
    !Array.isArray(body.data) ||
    meta.pagination_mode !== 'keyset' ||
    typeof meta.has_more !== 'boolean' ||
    meta.per_page !== perPage ||
    !(meta.next_cursor === null || typeof meta.next_cursor === 'string')
  )
    invalid('Phân trang chưa được server xác nhận.');
  if (
    meta.has_more
      ? typeof meta.next_cursor !== 'string' ||
        !meta.next_cursor ||
        meta.next_cursor === cursor
      : meta.next_cursor !== null
  )
    invalid('Cursor thông báo không hợp lệ.');
  const items = body.data.map(mapNotification),
    total = count(meta.total);
  if (
    new Set(items.map(x => x.id)).size !== items.length ||
    items.length > perPage ||
    items.length > total
  )
    invalid('Trang thông báo không khớp tổng/định danh nguồn.');
  return {
    items,
    total,
    hasMore: meta.has_more,
    nextCursor: meta.next_cursor as string | null,
    perPage,
  };
}
export async function fetchUnreadNotificationCount(
  options: { readonly signal?: AbortSignal } = {},
  client: ReadClient = apiClient,
): Promise<number> {
  const s = captureSessionScope();
  checkScope(s);
  const { body } = envelope(
    await client.get<unknown>(NOTIFICATION_PATHS.unreadCount, options),
    s,
  );
  const unread=unreadCountFrom(body.data);publishNotificationFreshness(s,unread);return unread;
}
export async function fetchNotification(
  recipientId: string,
  options: { readonly signal?: AbortSignal } = {},
  client: ReadClient = apiClient,
): Promise<NotificationItem> {
  const s = captureSessionScope();
  checkScope(s);
  const { body } = envelope(
    await client.get<unknown>(notificationDetailPath(recipientId), options),
    s,
  );
  const item = mapNotification(body.data);
  if (item.id !== recipientId)
    invalid('Recipient trả về khác ID được yêu cầu.');
  return item;
}
export async function markNotificationRead(
  recipientId: string,
  client: NotificationWriteClient = apiClient,
): Promise<NotificationReadResult> {
  const s = captureSessionScope();
  checkScope(s);
  const path = notificationReadPath(recipientId);
  if (approvedWriteFor('PATCH', path) !== 'notifications.markRead')
    throw new AppError({
      kind: 'blocked_by_gate',
      message: 'Chưa duyệt đọc thông báo.',
    });
  // No body/query, including {}. No synthetic Content-Type.
  const { body, meta } = envelope(
      await client.request<unknown>({ path, method: 'PATCH' }),
      s,
    ),
    item = mapNotification(body.data);
  if (
    item.id !== recipientId ||
    !item.read ||
    typeof meta.changed !== 'boolean'
  )
    invalid('Kết quả đọc chưa được xác minh.');
  const unreadCount=count(meta.unread_count);publishNotificationFreshness(s,unreadCount);return { item, changed: meta.changed, unreadCount };
}
export async function reconcileNotificationRead(
  recipientId: string,
  client: ReadClient = apiClient,
): Promise<{ item: NotificationItem; unreadCount: number }> {
  const s = captureSessionScope();
  checkScope(s);
  const [item, unreadCount] = await Promise.all([
    fetchNotification(recipientId, {}, client),
    fetchUnreadNotificationCount({}, client),
  ]);
  checkScope(s);
  return { item, unreadCount };
}
/** Retained export fails closed; this contract does not enable read-all. */
export async function markAllNotificationsRead(
  _client: NotificationWriteClient = apiClient,
): Promise<never> {
  throw new AppError({
    kind: 'blocked_by_gate',
    code: 'P13_READ_ALL_NOT_SUPPORTED',
    message: 'P13 chưa mở đánh dấu tất cả đã đọc.',
  });
}
