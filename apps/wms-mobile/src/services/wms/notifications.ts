/**
 * Thông báo cá nhân từ WMS.
 *
 * Contract DEV đã kiểm chứng 2026-09-16:
 * - GET   /api/v1/notifications
 * - GET   /api/v1/notifications/unread-count
 * - GET   /api/v1/notifications/{id}
 * - PATCH /api/v1/notifications/{id}/read
 * - POST  /api/v1/notifications/read-all
 *
 * Không có polling nền, WebSocket hay thao tác tự động đánh dấu đã đọc. App chỉ
 * nạp khi vào Home/màn Thông báo; cờ đọc chỉ đổi sau thao tác chủ động của người
 * dùng trên màn hình.
 */

import { AppError } from '../../errors/AppError';
import { apiClient, type ApiResponse, type RequestOptions } from '../../api/client';
import { approvedWriteFor } from '../../api/writeGate';
import { WMS_READ_PATHS } from './queries';
import { readOne, readPage, type ReadClient } from './readOnlyClient';
import type { ApiEnvelope, Page } from './types';

export const NOTIFICATION_PATHS = {
  list: WMS_READ_PATHS.notifications,
  unreadCount: WMS_READ_PATHS.notificationUnreadCount,
} as const;

export function notificationDetailPath(notificationId: string): string {
  return NOTIFICATION_PATHS.list + '/' + encodeURIComponent(notificationId);
}

export function notificationReadPath(notificationId: string): string {
  return notificationDetailPath(notificationId) + '/read';
}

export const NOTIFICATIONS_READ_ALL_PATH =
  '/api/v1/notifications/read-all' as const;

export interface NotificationItem {
  readonly id: string;
  readonly title: string;
  readonly message?: string;
  readonly severity?: string;
  readonly read: boolean;
  readonly createdAt?: string;
  readonly type?: string;
  readonly raw: Record<string, unknown>;
}

export interface NotificationListOptions {
  readonly unread?: boolean;
  readonly severity?: string;
  readonly page?: number;
  readonly perPage?: number;
  readonly signal?: AbortSignal;
}

export interface NotificationWriteClient {
  request<T>(options: RequestOptions): Promise<ApiResponse<T>>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function firstText(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function isRead(record: Record<string, unknown>): boolean {
  if (typeof record.read === 'boolean') return record.read;
  if (typeof record.is_read === 'boolean') return record.is_read;
  if (record.read_at !== null && record.read_at !== undefined && record.read_at !== '') {
    return true;
  }
  const status = firstText(record.status)?.toUpperCase();
  return status === 'READ' || status === 'READ_AT';
}

/** Adapter chịu được payload notification Laravel và biến thể response WMS. */
export function mapNotification(value: unknown): NotificationItem {
  const raw = asRecord(value);
  const data = asRecord(raw.data);
  const id = firstText(raw.id, raw.notification_id) ?? '';
  const title =
    firstText(raw.title, raw.subject, data.title, data.subject, raw.type) ??
    'Thông báo WMS';
  return {
    id,
    title,
    message: firstText(
      raw.message,
      raw.body,
      raw.content,
      data.message,
      data.body,
      data.content,
      data.description,
    ),
    severity: firstText(raw.severity, raw.level, raw.priority, data.severity),
    read: isRead(raw),
    createdAt: firstText(raw.created_at, raw.sent_at, raw.published_at),
    type: firstText(raw.type, raw.notification_type),
    raw,
  };
}

/** `/unread-count` từng có hai dạng envelope khác nhau ở môi trường DEV. */
export function unreadCountFrom(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  const record = asRecord(value);
  for (const candidate of [
    record.count,
    record.unread_count,
    record.total,
    asRecord(record.data).count,
    asRecord(record.data).unread_count,
  ]) {
    const count = typeof candidate === 'number' ? candidate : Number(candidate);
    if (Number.isFinite(count)) return Math.max(0, Math.floor(count));
  }
  return 0;
}

export async function fetchNotifications(
  options: NotificationListOptions = {},
  client: ReadClient = apiClient,
): Promise<Page<NotificationItem>> {
  const page = await readPage<unknown>(
    NOTIFICATION_PATHS.list,
    {
      signal: options.signal,
      query: {
        unread: options.unread,
        severity: options.severity,
        page: options.page,
        per_page: options.perPage ?? 25,
      },
    },
    client,
  );
  return {
    ...page,
    // Không đưa một record không có id vào UI: nó không thể được đánh dấu đọc
    // đúng bản ghi, và không có key ổn định cho danh sách React Native.
    items: page.items.map(mapNotification).filter(item => item.id !== ''),
  };
}

export async function fetchUnreadNotificationCount(
  options: { readonly signal?: AbortSignal } = {},
  client: ReadClient = apiClient,
): Promise<number> {
  return unreadCountFrom(
    await readOne<unknown>(NOTIFICATION_PATHS.unreadCount, options, client),
  );
}

export async function fetchNotification(
  notificationId: string,
  options: { readonly signal?: AbortSignal } = {},
  client: ReadClient = apiClient,
): Promise<NotificationItem> {
  const notification = mapNotification(
    await readOne<unknown>(notificationDetailPath(notificationId), options, client),
  );
  if (notification.id === '') {
    throw new AppError({
      kind: 'parse',
      message: 'Thông báo không có mã định danh.',
    });
  }
  return notification;
}

function assertApprovedNotificationWrite(method: 'POST' | 'PATCH', path: string): void {
  if (approvedWriteFor(method, path) === undefined) {
    throw new AppError({
      kind: 'blocked_by_gate',
      message: 'Thao tác thông báo ' + method + ' "' + path + '" chưa được duyệt.',
    });
  }
}

async function writeNotification(
  method: 'POST' | 'PATCH',
  path: string,
  client: NotificationWriteClient,
): Promise<void> {
  assertApprovedNotificationWrite(method, path);
  const response = await client.request<ApiEnvelope<unknown>>({
    path,
    method,
    // Swagger khai body object rỗng cho cả hai route; gửi `{}` để nhất quán
    // Content-Type JSON của client và không đoán thêm field nào.
    body: {},
  });
  if (response.data?.success === false) {
    throw new AppError({
      kind: 'http',
      status: response.status,
      message: firstText(asRecord(response.data).message) ?? 'Không cập nhật được trạng thái thông báo.',
    });
  }
}

/** Chỉ gọi từ nút người dùng bấm trong NotificationsScreen. */
export function markNotificationRead(
  notificationId: string,
  client: NotificationWriteClient = apiClient,
): Promise<void> {
  return writeNotification('PATCH', notificationReadPath(notificationId), client);
}

/** Chỉ gọi từ nút “Đánh dấu tất cả đã đọc”. */
export function markAllNotificationsRead(
  client: NotificationWriteClient = apiClient,
): Promise<void> {
  return writeNotification('POST', NOTIFICATIONS_READ_ALL_PATH, client);
}
