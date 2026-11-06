jest.mock('../src/services/wms/notifications', () => ({
  ...jest.requireActual('../src/services/wms/notifications'),
  fetchNotifications: jest.fn(),
  fetchNotification: jest.fn(),
  fetchUnreadNotificationCount: jest.fn(),
  markNotificationRead: jest.fn(),
  reconcileNotificationRead: jest.fn(),
}));
jest.mock('../src/services/wms/linkedHistoryRead', () => ({
  createLinkedHistoryRead: jest.fn(),
}));
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { P13NotificationsScreen } from '../src/features/notifications/P13NotificationsScreen';
import {
  P13NotificationFilters,
  P13NotificationRow,
} from '../src/features/notifications/P13NotificationPresentation';
import { P13NotificationFrame } from '../src/features/notifications/P13NotificationFrame';
import { P22NfcHistoryScreen } from '../src/features/history/P22NfcHistoryScreen';
import { useAttachments } from '../src/features/warranty/useAttachments';
import { createLinkedHistoryRead } from '../src/services/wms/linkedHistoryRead';
import * as notifications from '../src/services/wms/notifications';
import { clearSession, setSession } from '../src/auth/session';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { AppError } from '../src/errors/AppError';
import { context, id } from './fixtures/p09Mock';
const note = {
  id: id(70),
  title: 'REPAIR-A',
  message: null,
  severity: null,
  read: false,
  readAt: null,
  createdAt: null,
  type: null,
  subject: null,
};
let tree: Renderer.ReactTestRenderer;
const render = async (node: React.ReactElement) =>
  act(async () => {
    tree = Renderer.create(<AppProviders>{node}</AppProviders>);
  });
async function press(label: string) {
  await act(async () => {
    const b = tree.root.findAll(
      n =>
        typeof n.props.onPress === 'function' &&
        (n.props.label === label || n.props.accessibilityLabel === label),
    )[0];
    if (!b) throw Error('Missing ' + label);
    return b.props.onPress();
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession(context().session!);
  (notifications.fetchNotifications as jest.Mock).mockResolvedValue({
    items: [note],
    total: 1,
    hasMore: false,
    nextCursor: null,
    perPage: 10,
  });
  (notifications.fetchNotification as jest.Mock).mockResolvedValue(note);
  (notifications.fetchUnreadNotificationCount as jest.Mock).mockResolvedValue(
    1,
  );
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  clearSession();
});

test('N13-03: verified read leaves unread membership without inventing a filtered total', async () => {
  await render(
    <P13NotificationsScreen onBack={() => {}} onOpenDocument={() => {}} />,
  );
  await act(async () =>
    tree.root.findByType(P13NotificationFilters).props.onSelect(true),
  );
  (notifications.markNotificationRead as jest.Mock).mockResolvedValue({
    item: { ...note, read: true, readAt: '2026-10-22T01:00:00Z' },
    changed: true,
    unreadCount: 0,
  });
  await press('REPAIR-A');
  expect(notifications.markNotificationRead).toHaveBeenCalledWith(note.id);
  expect(notifications.markNotificationRead).toHaveBeenCalledTimes(1);
  await act(async () =>
    tree.root.findByType(P13NotificationFrame).props.onBack(),
  );
  expect(tree.root.findByType(P13NotificationFilters).props.unread).toBe(true);
  expect(tree.root.findAllByType(P13NotificationRow)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('Cần đọc lại');
});
test('N13-02: invalid cursor keeps rows and requires an explicit start restart', async () => {
  (notifications.fetchNotifications as jest.Mock).mockResolvedValueOnce({
    items: [note],
    total: 3,
    hasMore: true,
    nextCursor: 'bad-cursor',
    perPage: 10,
  });
  await render(
    <P13NotificationsScreen onBack={() => {}} onOpenDocument={() => {}} />,
  );
  (notifications.fetchNotifications as jest.Mock).mockRejectedValueOnce(
    new AppError({
      kind: 'http',
      status: 422,
      code: 'NOTIFICATION_CURSOR_INVALID',
      message: 'cursor-invalid',
    }),
  );
  await press('Hiển thị thêm 10 thông báo');
  expect(tree.root.findAllByType(P13NotificationRow)).toHaveLength(1);
  expect(
    tree.root.findAll(n => n.props.label === 'Hiển thị thêm 10 thông báo'),
  ).toHaveLength(0);
  await press('Đọc lại từ đầu, giữ bộ lọc');
  expect(
    (notifications.fetchNotifications as jest.Mock).mock.calls.map(
      c => c[0].cursor,
    ),
  ).toEqual(['start', 'bad-cursor', 'start']);
});
test('N13-05: count failure retains independently verified list with unknown count', async () => {
  (notifications.fetchUnreadNotificationCount as jest.Mock).mockRejectedValue(
    new AppError({ kind: 'network', message: 'count-offline' }),
  );
  await render(
    <P13NotificationsScreen onBack={() => {}} onOpenDocument={() => {}} />,
  );
  expect(tree.root.findAllByType(P13NotificationRow)).toHaveLength(1);
  expect(tree.root.findByType(P13NotificationFilters).props.count).toBeNull();
});
const event = (n: number) => ({
  recordId: 'NFC:' + id(n),
  activityId: 'NFC:' + id(n + 1),
  type: 'Gán',
  status: null,
  uid: 'REPAIR-UID-' + n,
  serial: null,
  time: null,
});
test('P22-N01: failed next page then retry retains earlier verified events', async () => {
  const nfcList = jest
    .fn()
    .mockResolvedValueOnce({
      items: [event(10)],
      total: 2,
      hasMore: true,
      nextCursor: 'page2',
    })
    .mockRejectedValueOnce(
      new AppError({ kind: 'network', message: 'page2-offline' }),
    )
    .mockResolvedValueOnce({
      items: [event(20)],
      total: 2,
      hasMore: false,
      nextCursor: null,
    });
  (createLinkedHistoryRead as jest.Mock).mockReturnValue({
    scopeKey: () => 'scope',
    nfcList,
    nfcSummary: jest.fn().mockResolvedValue({ grandTotal: 2 }),
  });
  const c = context();
  await render(
    <P22NfcHistoryScreen
      context={{ session: c.session, user: c.user }}
      onBack={() => {}}
    />,
  );
  await press('Tải thêm sự kiện NFC');
  expect(JSON.stringify(tree.toJSON())).toContain('REPAIR-UID-10');
  await press('Đọc lại');
  expect(nfcList.mock.calls[2][0]).toEqual({ cursor: 'page2' });
  expect(JSON.stringify(tree.toJSON())).toContain('REPAIR-UID-20');
  expect(JSON.stringify(tree.toJSON())).toContain('REPAIR-UID-10');
});
test('P22-N02: optional summary failure does not discard a valid list', async () => {
  (createLinkedHistoryRead as jest.Mock).mockReturnValue({
    scopeKey: () => 'scope',
    nfcList: jest
      .fn()
      .mockResolvedValue({
        items: [event(10)],
        total: 1,
        hasMore: false,
        nextCursor: null,
      }),
    nfcSummary: jest
      .fn()
      .mockRejectedValue(
        new AppError({ kind: 'network', message: 'summary-offline' }),
      ),
  });
  const c = context();
  await render(
    <P22NfcHistoryScreen
      context={{ session: c.session, user: c.user }}
      onBack={() => {}}
    />,
  );
  expect(JSON.stringify(tree.toJSON())).toContain('REPAIR-UID-10');
});
test('P18-F01: same-render upload actions dispatch one file exactly once', async () => {
  let hook: ReturnType<typeof useAttachments>;
  const send = jest.fn().mockResolvedValue({}),
    load = jest.fn().mockResolvedValue({ items: [] });
  const pick = jest
    .fn()
    .mockResolvedValue({
      kind: 'picked',
      items: [
        {
          file: {
            uri: 'offline://repair-one',
            name: 'repair.jpg',
            type: 'image/jpeg',
          },
          bytes: 5,
          isVideo: false,
        },
      ],
    });
  function Harness() {
    hook = useAttachments(id(4), { load, upload: send, pick });
    return null;
  }
  await render(<Harness />);
  await act(async () => hook!.addFromLibrary());
  await act(async () => {
    await Promise.all([hook!.uploadAll('OTHER'), hook!.uploadAll('OTHER')]);
  });
  expect(send).toHaveBeenCalledTimes(1);
});
