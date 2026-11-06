jest.mock('../src/services/wms/notifications', () => ({
  ...jest.requireActual('../src/services/wms/notifications'),
  fetchNotifications: jest.fn(),
  fetchUnreadNotificationCount: jest.fn(),
  markNotificationRead: jest.fn(),
  reconcileNotificationRead: jest.fn(),
}));
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { NotificationPopover } from '../src/features/notifications/NotificationPopover';
import { AppProviders } from '../src/app/App';
import * as n from '../src/services/wms/notifications';
import { AppError } from '../src/errors/AppError';
import { clearSession, setSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
const id = (index: number) =>
  '13000000-0000-4000-8000-' + String(index).padStart(12, '0');
const item: n.NotificationItem = {
  id: id(1),
  title: 'Nguồn thật',
  message: null,
  severity: null,
  read: false,
  readAt: null,
  createdAt: null,
  type: null,
  subject: null,
};
let tree: Renderer.ReactTestRenderer;
let count: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline',
    userId: id(10),
    authSessionId: id(11),
    activeWarehouseId: id(12),
  });
  count = jest.fn();
  (n.fetchNotifications as jest.Mock).mockResolvedValue({
    items: [item],
    total: 40,
    hasMore: true,
    nextCursor: 'opaque',
    perPage: 5,
  });
  (n.fetchUnreadNotificationCount as jest.Mock).mockResolvedValue(9);
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  clearSession();
});
const render = async () => {
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <NotificationPopover
          visible
          onDismiss={() => {}}
          onUnreadCountChange={count}
        />
      </AppProviders>,
    );
  });
};
const press = async (label: string) =>
  act(async () =>
    tree.root
      .findAll(
        node =>
          node.props.accessibilityLabel === label &&
          typeof node.props.onPress === 'function',
      )[0]
      .props.onPress(),
  );
test('authoritative PATCH count is not old badge minus one; no read-all UI', async () => {
  await render();
  expect(
    tree.root.findAll(
      node => node.props.accessibilityLabel === 'Đánh dấu tất cả đã đọc',
    ),
  ).toHaveLength(0);
  (n.markNotificationRead as jest.Mock).mockResolvedValue({
    item: { ...item, read: true, readAt: '2026-10-14T01:00:00Z' },
    changed: false,
    unreadCount: 3,
  });
  await press('Đánh dấu đã đọc: Nguồn thật');
  expect(count).toHaveBeenLastCalledWith(3);
  expect(count).not.toHaveBeenCalledWith(8);
});
test('timeout keeps badge; explicit check is GET owner result, not another PATCH', async () => {
  await render();
  (n.markNotificationRead as jest.Mock).mockRejectedValue(
    new AppError({ kind: 'timeout', message: 'UNKNOWN' }),
  );
  await press('Đánh dấu đã đọc: Nguồn thật');
  expect(count.mock.calls).toEqual([[9]]);
  (n.reconcileNotificationRead as jest.Mock).mockResolvedValue({
    item: { ...item, read: true, readAt: 'server-time' },
    unreadCount: 4,
  });
  await press('Kiểm tra kết quả đọc');
  expect(n.markNotificationRead).toHaveBeenCalledTimes(1);
  expect(n.reconcileNotificationRead).toHaveBeenCalledWith(id(1));
  expect(count).toHaveBeenLastCalledWith(4);
});
test('empty source error does not display verified-empty success', async () => {
  (n.fetchNotifications as jest.Mock).mockRejectedValue(Error('read failed'));
  await render();
  const content = JSON.stringify(tree.toJSON());
  expect(content).not.toContain('Chưa có thông báo');
  expect(content).toContain('Không tải được thông báo');
});
test('empty page with positive total is not verified-empty source', async () => {
  (n.fetchNotifications as jest.Mock).mockResolvedValue({
    items: [],
    total: 4,
    hasMore: false,
    nextCursor: null,
    perPage: 5,
  });
  await render();
  expect(JSON.stringify(tree.toJSON())).not.toContain('Chưa có thông báo');
  expect(JSON.stringify(tree.toJSON())).toContain('Đọc lại thông báo');
});
test('late PATCH from old caller cannot publish its unread count after modal closes', async () => {
  await render();
  let finish!: (v: unknown) => void;
  (n.markNotificationRead as jest.Mock).mockImplementation(
    () =>
      new Promise(r => {
        finish = r;
      }),
  );
  await press('Đánh dấu đã đọc: Nguồn thật');
  await act(async () =>
    tree.update(
      <AppProviders>
        <NotificationPopover
          visible={false}
          onDismiss={() => {}}
          onUnreadCountChange={count}
        />
      </AppProviders>,
    ),
  );
  await act(async () =>
    finish({
      item: { ...item, read: true, readAt: 'server' },
      changed: true,
      unreadCount: 1,
    }),
  );
  expect(count).not.toHaveBeenCalledWith(1);
});
