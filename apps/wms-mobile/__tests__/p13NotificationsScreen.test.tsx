jest.mock('../src/services/wms/notifications', () => ({
  ...jest.requireActual('../src/services/wms/notifications'),
  fetchNotifications: jest.fn(),
  fetchNotification: jest.fn(),
  fetchUnreadNotificationCount: jest.fn(),
  markNotificationRead: jest.fn(),
  reconcileNotificationRead: jest.fn(),
}));
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { ScrollView, Text } from 'react-native';
import { P13NotificationFrame } from '../src/features/notifications/P13NotificationFrame';
import {
  P13NotificationDetail,
  P13NotificationRow,
  P13NotificationFilters,
} from '../src/features/notifications/P13NotificationPresentation';
import {
  P13NotificationsScreen,
  type P13Retained,
} from '../src/features/notifications/P13NotificationsScreen';
import { AppProviders } from '../src/app/App';
import { Button } from '../src/ui/Button';
import * as api from '../src/services/wms/notifications';
import { AppError } from '../src/errors/AppError';
import { clearSession, setSession,captureSessionScope } from '../src/auth/session';
let freshness:any={};try{freshness=require('../src/features/notifications/delivery/freshness');}catch(e){if(!String((e as any)?.message??e).includes('delivery/freshness'))throw e;}
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
const id = (n: number) =>
  '13000000-0000-4000-8000-' + String(n).padStart(12, '0');
const item = {
  id: id(1),
  title: 'Thông báo từ owner',
  message: null,
  severity: null,
  read: false,
  readAt: null,
  createdAt: null,
  type: null,
  subject: null,
};
test('TC20 keeps device settings on the list and removes the extra header action from detail', async () => {
  const delivery = { state: { phase: 'off' as const, message: 'Off' }, enable: jest.fn(), disable: jest.fn(), refresh: jest.fn(), selfTest: jest.fn() };
  await act(async () => {
    tree = Renderer.create(<AppProviders><P13NotificationsScreen onBack={() => {}} onOpenDocument={() => {}} notificationDelivery={delivery} /></AppProviders>);
  });
  expect(tree.root.findByType(P13NotificationFrame).props.headerAction).toBeDefined();
  await press(item.title);
  expect(tree.root.findByType(P13NotificationFrame).props.headerAction).toBeUndefined();
  expect(api.fetchNotification).toHaveBeenCalledWith(item.id);
  expect(api.markNotificationRead).toHaveBeenCalledWith(item.id);
  await act(async () => tree.root.findByType(P13NotificationFrame).props.onBack());
  expect(tree.root.findByType(P13NotificationFrame).props.headerAction).toBeDefined();
  expect(delivery.enable).not.toHaveBeenCalled();
});
let tree: Renderer.ReactTestRenderer;
test('FCM freshness updates scoped count and notice while retaining loaded rows',async()=>{expect(typeof freshness.publishNotificationFreshness).toBe('function');await visit();const before=tree.root.findAllByType(P13NotificationRow).length;await act(async()=>freshness.publishNotificationFreshness(captureSessionScope(),17,true));expect(tree.root.findByType(P13NotificationFilters).props.count).toBe(17);expect(tree.root.findAllByType(P13NotificationRow)).toHaveLength(before);expect(JSON.stringify(tree.toJSON())).toContain('Có thông báo mới');});
test('push recipient opens protected detail without marking read or resetting retained feed',async()=>{
 await act(async()=>{tree=Renderer.create(<AppProviders><P13NotificationsScreen onBack={()=>{}} onOpenDocument={()=>{}} initialRecipientId={id(42)} /></AppProviders>);});
 expect(api.fetchNotification).toHaveBeenCalledWith(id(42));expect(api.markNotificationRead).not.toHaveBeenCalled();expect(tree.root.findAllByType(P13NotificationDetail)).toHaveLength(1);
 await act(async()=>tree.root.findByType(P13NotificationFrame).props.onBack());expect(api.fetchNotifications).toHaveBeenCalledTimes(1);
});
const visit = async (
  retained?: P13Retained,
  footer?: React.ReactNode,
  warehouseNamesById?: Readonly<Record<string, string>>,
) =>
  act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P13NotificationsScreen
          onBack={() => {}}
          onOpenDocument={() => {}}
          retained={retained}
          footer={footer}
          warehouseNamesById={warehouseNamesById}
        />
      </AppProviders>,
    );
  });
const press = async (label: string) =>
  act(async () => {
    const action =
      tree.root.findAllByType(Button).find(b => b.props.label === label) ??
      tree.root.findAll(
        n =>
          n.props.accessibilityRole === 'button' &&
          n.props.accessibilityLabel === label &&
          typeof n.props.onPress === 'function',
      )[0];
    if (!action) throw new Error('Missing action ' + label);
    return action.props.onPress();
  });
beforeEach(() => {
  jest.clearAllMocks();
  // Clear per-case response queues without resetting RN's native view mocks.
  [api.fetchNotifications, api.fetchNotification, api.fetchUnreadNotificationCount, api.markNotificationRead, api.reconcileNotificationRead]
    .forEach(mock => (mock as jest.Mock).mockReset());
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline',
    userId: id(10),
    authSessionId: id(11),
    activeWarehouseId: id(12),
  });
  (api.fetchNotifications as jest.Mock).mockResolvedValue({
    items: [item],
    total: 40,
    hasMore: true,
    nextCursor: 'opaque',
    perPage: 10,
  });
  (api.fetchUnreadNotificationCount as jest.Mock).mockResolvedValue(9);
  (api.fetchNotification as jest.Mock).mockResolvedValue(item);
  (api.markNotificationRead as jest.Mock).mockResolvedValue({
    item: { ...item, read: true, readAt: '2026-10-15T01:00:00Z' },
    changed: true,
    unreadCount: 8,
  });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  clearSession();
});
test('TC09 reads beyond ten by exact cursor and stops only when owner has_more is false', async () => {
  const rows = (start: number, count: number) =>
    Array.from({ length: count }, (_, offset) => ({
      ...item,
      id: id(start + offset),
    }));
  (api.fetchNotifications as jest.Mock)
    .mockResolvedValueOnce({
      items: rows(100, 10),
      total: 25,
      hasMore: true,
      nextCursor: 'next-1',
      perPage: 10,
    })
    .mockResolvedValueOnce({
      items: rows(110, 10),
      total: 25,
      hasMore: true,
      nextCursor: 'next-2',
      perPage: 10,
    })
    .mockResolvedValueOnce({
      items: rows(120, 5),
      total: 25,
      hasMore: false,
      nextCursor: null,
      perPage: 10,
    });
  await visit();
  expect(tree.root.findAllByType(P13NotificationRow)).toHaveLength(10);
  await press('Hiển thị thêm 10 thông báo');
  expect(tree.root.findAllByType(P13NotificationRow)).toHaveLength(20);
  expect(api.fetchNotifications).toHaveBeenLastCalledWith({
    cursor: 'next-1',
    perPage: 10,
    unread: true,
  });
  await press('Hiển thị thêm 10 thông báo');
  expect(tree.root.findAllByType(P13NotificationRow)).toHaveLength(25);
  expect(api.fetchNotifications).toHaveBeenLastCalledWith({
    cursor: 'next-2',
    perPage: 10,
    unread: true,
  });
  expect(
    tree.root
      .findAllByType(Button)
      .some(b => b.props.label === 'Hiển thị thêm 10 thông báo'),
  ).toBe(false);
  expect(JSON.stringify(tree.toJSON())).toContain('Đã tải đủ 25 thông báo');
  expect(JSON.stringify(tree.toJSON())).toContain('Chưa đọc (9)');
  expect(api.markNotificationRead).not.toHaveBeenCalled();
});

test('detail retains shared footer and Back restores list position without another PATCH', async () => {
  await visit(undefined, <Text>LIST_FOOTER_PROOF</Text>);
  expect(JSON.stringify(tree.toJSON())).toContain('LIST_FOOTER_PROOF');
  await act(async () =>
    tree.root
      .findByType(ScrollView)
      .props.onScroll({ nativeEvent: { contentOffset: { y: 180 } } }),
  );
  await press(item.title);
  expect(JSON.stringify(tree.toJSON())).toContain('LIST_FOOTER_PROOF');
  await act(async () =>
    tree.root.findByType(P13NotificationFrame).props.onBack(),
  );
  expect(JSON.stringify(tree.toJSON())).toContain('LIST_FOOTER_PROOF');
  expect(tree.root.findByType(P13NotificationFrame).props.initialScrollY).toBe(
    180,
  );
  expect(api.markNotificationRead).toHaveBeenCalledTimes(1);
});

test('TC20 row click is read intent; PATCH result owns read_at/count and the old total is not decremented', async () => {
  await visit();
  expect(api.fetchNotifications).toHaveBeenCalledWith({
    cursor: 'start',
    perPage: 10,
    unread: true,
  });
  await press('Hiển thị thêm 10 thông báo');
  expect(api.fetchNotifications).toHaveBeenLastCalledWith({
    cursor: 'opaque',
    perPage: 10,
    unread: true,
  });
  (api.markNotificationRead as jest.Mock).mockResolvedValue({
    item: { ...item, read: true, readAt: '2026-10-15T01:00:00Z' },
    changed: true,
    unreadCount: 3,
  });
  await press(item.title);
  expect(api.fetchNotification).toHaveBeenCalledWith(item.id);
  expect(api.markNotificationRead).toHaveBeenCalledTimes(1);
  expect(api.markNotificationRead).toHaveBeenCalledWith(item.id);
  expect(tree.root.findByType(P13NotificationDetail).props.item.readAt).toBe('2026-10-15T01:00:00Z');
  expect(tree.root.findAllByType(Button).some(b => b.props.label === 'Đánh dấu đã đọc')).toBe(false);
  await act(async () => tree.root.findByType(P13NotificationFrame).props.onBack());
  expect(tree.root.findByType(P13NotificationFilters).props.count).toBe(3);
  expect(JSON.stringify(tree.toJSON()).includes('Tổng lọc 39')).toBe(false);
  expect(api.markNotificationRead).toHaveBeenCalledTimes(1);
});

test('TC_UAT_02 renders creator in two lines and maps the exact warehouse id to its name', async () => {
  const detail = {
    ...item,
    actorName: 'Thủ kho 01',
    warehouseId: id(12),
  };
  let detailTree!: Renderer.ReactTestRenderer;
  await act(async () => {
    detailTree = Renderer.create(
      <AppProviders>
        <P13NotificationDetail
          item={detail}
          warehouseName="Kho tổng Hoa Nam"
          actorRole={null}
          busy={false}
          canOpen={false}
          unknown={false}
          onOpen={() => {}}
          onMark={() => {}}
        />
      </AppProviders>,
    );
  });

  expect(
    detailTree.root.findAllByProps({ testID: 'P13.detail.metadata' }),
  ).toHaveLength(0);
  await act(async () =>
    detailTree.root
      .findAll(
        n =>
          n.props.accessibilityLabel === 'Thông tin chi tiết' &&
          typeof n.props.onPress === 'function',
      )[0]
      .props.onPress(),
  );
  const content = JSON.stringify(detailTree.toJSON());
  expect(content).toContain('Thủ kho 01');
  expect(content).toContain('—');
  const warehouse = detailTree.root
    .findAllByType(Text)
    .find(n => n.props.testID === 'P13.detail.warehouse')!;
  expect(warehouse.props.children).toBe('Kho tổng Hoa Nam');
  expect(JSON.stringify(detailTree.toJSON())).not.toContain(id(12));

  await act(async () => detailTree.unmount());
});

test.each([true, false])(
  'TC_UAT_02 uses only a warehouse directory name with the same event warehouse id (%s)',
  async matches => {
    (api.fetchNotification as jest.Mock).mockResolvedValue({
      ...item,
      read: true,
      warehouseId: id(12),
      actorName: 'Thủ kho 01',
    });
    await visit(undefined, undefined, {
      [matches ? id(12) : id(13)]: 'Kho xác minh theo ID',
    });
    await press(item.title);
    const text = JSON.stringify(tree.toJSON());
    if (matches) expect(text).toContain('Kho xác minh theo ID');
    else expect(text).not.toContain('Kho xác minh theo ID');
    expect(text).not.toContain(id(12));
    expect(api.markNotificationRead).not.toHaveBeenCalled();
  },
);
test('PATCH timeout exposes GET reconciliation, never automatic PATCH replay', async () => {
  await visit();
  (api.markNotificationRead as jest.Mock).mockRejectedValue(
    new AppError({ kind: 'timeout', message: 'Timeout' }),
  );
  await press(item.title);
  expect(
    tree.root
      .findAllByType(Button)
      .some(b => b.props.label === 'Kiểm tra kết quả đọc'),
  ).toBe(true);
  (api.reconcileNotificationRead as jest.Mock).mockResolvedValue({
    item: { ...item, read: true, readAt: '2026-10-15T01:00:00Z' },
    unreadCount: 4,
  });
  await press('Kiểm tra kết quả đọc');
  expect(api.reconcileNotificationRead).toHaveBeenCalledWith(item.id);
  expect(api.markNotificationRead).toHaveBeenCalledTimes(1);
});
test('Back to notification retains selected recipient, another login cannot reuse it', async () => {
  const retained: P13Retained = {};
  await visit(retained);
  await press(item.title);
  await act(async () => tree.unmount());
  await visit(retained);
  expect(api.fetchNotification).toHaveBeenCalledTimes(1);
  expect(tree.root.findByType(P13NotificationDetail).props.item.read).toBe(true);
  expect(api.markNotificationRead).toHaveBeenCalledTimes(1);
  await act(async () =>
    setSession({
      accessToken: 'different',
      userId: id(10),
      authSessionId: id(99),
      activeWarehouseId: id(12),
    }),
  );
  expect(
    tree.root
      .findAllByType(Button)
      .some(b => b.props.label === 'Đánh dấu đã đọc'),
  ).toBe(false);
  expect(tree.root.findAllByType(P13NotificationDetail)).toHaveLength(0);
  expect(api.markNotificationRead).toHaveBeenCalledTimes(1);
});

test('TC20 already-read detail and failed GET never send PATCH', async () => {
  (api.fetchNotification as jest.Mock).mockResolvedValue({ ...item, read: true, readAt: '2026-10-15T01:00:00Z' });
  await visit();
  await press(item.title);
  expect(api.markNotificationRead).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
  (api.fetchNotification as jest.Mock).mockRejectedValue(new AppError({ kind: 'http', status: 403, message: 'Denied' }));
  await visit();
  await press(item.title);
  expect(api.markNotificationRead).not.toHaveBeenCalled();
});

test('TC20 double click is single-flight and a late PATCH cannot restore the old login', async () => {
  let resolvePatch!: (value: unknown) => void;
  (api.markNotificationRead as jest.Mock).mockReturnValue(new Promise(resolve => { resolvePatch = resolve; }));
  await visit();
  const row = tree.root.findByType(P13NotificationRow);
  let first!: Promise<void>, second!: Promise<void>;
  await act(async () => { first = row.props.onPress(); second = row.props.onPress(); });
  expect(api.fetchNotification).toHaveBeenCalledTimes(1);
  expect(api.markNotificationRead).toHaveBeenCalledTimes(1);
  await act(async () => setSession({ accessToken: 'new-offline', userId: id(10), authSessionId: id(99), activeWarehouseId: id(12) }));
  await act(async () => {
    resolvePatch({ item: { ...item, read: true }, changed: true, unreadCount: 1 });
    await Promise.all([first, second]);
  });
  expect(tree.root.findAllByType(P13NotificationDetail)).toHaveLength(0);
  expect(api.markNotificationRead).toHaveBeenCalledTimes(1);
});

test('TC20 an unresolved mark stays bound to its recipient when another notification is opened', async () => {
  const another = { ...item, id: id(2), title: 'Another notification' };
  (api.fetchNotifications as jest.Mock).mockResolvedValue({ items: [item, another], total: 2, hasMore: false, nextCursor: null, perPage: 10 });
  (api.fetchNotification as jest.Mock).mockImplementation(async recipient => recipient === item.id ? item : another);
  (api.markNotificationRead as jest.Mock).mockRejectedValue(new AppError({ kind: 'timeout', message: 'Timeout' }));
  await visit();
  await press(item.title);
  await act(async () => tree.root.findByType(P13NotificationFrame).props.onBack());
  await press(another.title);
  expect(tree.root.findByType(P13NotificationDetail).props.item.id).toBe(another.id);
  expect(api.markNotificationRead).toHaveBeenCalledTimes(1);
  expect(api.markNotificationRead).toHaveBeenCalledWith(item.id);
  (api.reconcileNotificationRead as jest.Mock).mockResolvedValue({ item: { ...item, read: true }, unreadCount: 1 });
  await press('Kiểm tra kết quả đọc');
  expect(api.reconcileNotificationRead).toHaveBeenCalledWith(item.id);
});
