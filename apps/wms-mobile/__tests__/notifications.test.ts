import { approvedWriteFor } from '../src/api/writeGate';
import {
  NOTIFICATION_PATHS,
  NOTIFICATIONS_READ_ALL_PATH,
  fetchNotifications,
  fetchUnreadNotificationCount,
  mapNotification,
  markAllNotificationsRead,
  markNotificationRead,
  notificationReadPath,
  unreadCountFrom,
  type NotificationWriteClient,
} from '../src/services/wms/notifications';
import type { ReadClient } from '../src/services/wms/readOnlyClient';
import type { ApiResponse, RequestOptions } from '../src/api/client';

describe('thông báo WMS', () => {
  it('chuẩn hoá cả notification Laravel có data lồng và trạng thái read_at', () => {
    expect(mapNotification({
      id: 'notice-1',
      type: 'wms.document.pending',
      read_at: null,
      created_at: '2026-09-16T09:00:00+07:00',
      data: { title: 'Phiếu cần duyệt', body: 'PX-001 đang chờ duyệt', severity: 'warning' },
    })).toMatchObject({
      id: 'notice-1',
      title: 'Phiếu cần duyệt',
      message: 'PX-001 đang chờ duyệt',
      severity: 'warning',
      read: false,
    });

    expect(mapNotification({ id: 'notice-2', title: 'Đã xong', read_at: '2026-09-16 09:01:00' }).read).toBe(true);
  });

  it('đọc được hai shape unread count của BE', () => {
    expect(unreadCountFrom({ unread_count: 4 })).toBe(4);
    expect(unreadCountFrom({ data: { count: '3' } })).toBe(3);
    expect(unreadCountFrom({})).toBe(0);
  });

  it('lấy danh sách theo filter unread và bỏ record không định danh', async () => {
    const calls: { path: string; options?: unknown }[] = [];
    const client: ReadClient = {
      get: async <T,>(
        path: string,
        options?: Omit<RequestOptions, 'path' | 'method'>,
      ): Promise<ApiResponse<T>> => {
        calls.push({ path, options });
        return {
          status: 200,
          data: {
            data: [
              { id: 'n-1', title: 'Có phiếu mới', read_at: null },
              { title: 'không có id' },
            ],
          } as T,
        };
      },
    };
    const page = await fetchNotifications({ unread: true, perPage: 10 }, client);
    expect(calls).toEqual([{
      path: NOTIFICATION_PATHS.list,
      options: { signal: undefined, query: { unread: true, severity: undefined, page: undefined, per_page: 10 } },
    }]);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ id: 'n-1', read: false });
  });

  it('lấy số chưa đọc bằng read-only client', async () => {
    const client: ReadClient = {
      get: async <T,>(): Promise<ApiResponse<T>> => ({ status: 200, data: { data: { unread_count: 6 } } as T }),
    };
    await expect(fetchUnreadNotificationCount({}, client)).resolves.toBe(6);
  });

  it('chỉ mở đúng hai mutation đã duyệt và gửi body rỗng', async () => {
    const calls: { path: string; method?: string; body?: unknown }[] = [];
    const client: NotificationWriteClient = {
      request: async <T,>(request: RequestOptions): Promise<ApiResponse<T>> => {
        calls.push(request);
        return { status: 200, data: { success: true, data: {} } as T };
      },
    };
    const path = notificationReadPath('notice/1');
    expect(approvedWriteFor('PATCH', path)).toBe('notifications.markRead');
    expect(approvedWriteFor('POST', NOTIFICATIONS_READ_ALL_PATH)).toBe('notifications.markAllRead');
    expect(approvedWriteFor('DELETE', path)).toBeUndefined();

    await markNotificationRead('notice/1', client);
    await markAllNotificationsRead(client);
    expect(calls).toEqual([
      { path, method: 'PATCH', body: {} },
      { path: NOTIFICATIONS_READ_ALL_PATH, method: 'POST', body: {} },
    ]);
  });
});
