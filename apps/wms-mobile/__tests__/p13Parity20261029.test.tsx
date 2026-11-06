import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { ScrollView, Text as NativeText, StyleSheet } from 'react-native';
import { AppProviders } from '../src/app/App';
import { Text } from '../src/ui/Text';
import { Button } from '../src/ui/Button';
import { Dialog } from '../src/ui/Dialog';
import { P13NotificationFrame } from '../src/features/notifications/P13NotificationFrame';
import {
  P13NotificationDetail,
  P13NotificationFilters,
  P13ReadableText,
} from '../src/features/notifications/P13NotificationPresentation';
import {
  P13WebQueueDetail,
  P13WebQueueRow,
} from '../src/features/notifications/P13WebQueuePresentation';
import { P13WebQueueScreen } from '../src/features/notifications/P13WebQueueScreen';
import type { NotificationItem } from '../src/services/wms/notifications';
import type { BeReleasedReads } from '../src/services/wms/beReleasedReads';
import { parseWebQueue, webQueueQuery } from '../src/services/wms/p13WebQueue';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { setSession, clearSession } from '../src/auth/session';
import {
  queueBody,
  scope,
  user,
  actor,
  session,
  warehouse,
} from './fixtures/beReleasedReads20261024';

const trees: Renderer.ReactTestRenderer[] = [];
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  setSession({
    accessToken: 'offline-only',
    userId: actor,
    authSessionId: session,
    activeWarehouseId: warehouse,
  });
});
afterEach(async () => {
  await act(async () => trees.splice(0).forEach(tree => tree.unmount()));
  clearSession();
});
async function mount(child: React.ReactElement) {
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<AppProviders>{child}</AppProviders>);
  });
  trees.push(tree);
  return tree;
}
const noAction = () => undefined;
const event: NotificationItem = {
  id: '13000000-0013-4013-8013-000000000001',
  title: 'Thông báo TEST',
  message: 'Nội dung cần đọc trước.',
  createdAt: '2026-10-29T02:20:00Z',
  read: false,
  readAt: null,
  severity: null,
  subject: null,
  type: null,
  actorName: 'Người tạo TEST',
  warehouseNameSnapshot: 'Kho TEST',
  actorJobTitleSnapshot: 'Chức danh nguồn TEST',
};

test('r06 message precedes collapsed metadata; disclosure never marks read and time appears once', async () => {
  const mark = jest.fn();
  const tree = await mount(
    <P13NotificationDetail
      item={event}
      busy={false}
      canOpen={false}
      unknown={false}
      onOpen={noAction}
      onMark={mark}
    />,
  );
  expect(
    tree.root.findAllByProps({ testID: 'P13.detail.metadata' }),
  ).toHaveLength(0);
  const times = tree.root
    .findAllByType(Text)
    .filter(n => n.props.children === '29/10/2026 09:20');
  expect(times).toHaveLength(1);
  const summary = tree.root.findAll(
    n =>
      n.props.accessibilityLabel === 'Thông tin chi tiết' &&
      typeof n.props.onPress === 'function',
  )[0];
  await act(async () => summary.props.onPress());
  expect(
    tree.root.findAllByProps({ testID: 'P13.detail.metadata' }).length,
  ).toBeGreaterThan(0);
  const json = JSON.stringify(tree.toJSON());
  expect(json.indexOf('P13.detail.content')).toBeLessThan(
    json.indexOf('P13.detail.metadata'),
  );
  expect(json).toContain('Chức danh nguồn TEST');
  expect(mark).not.toHaveBeenCalled();
});

test('reader is offered only after measured overflow; full Unicode/newlines preserved in one shared modal', async () => {
  const raw =
    '<script>không thực thi</script> 🌸\n\n' + 'ChuỗiKhôngCắt_'.repeat(180);
  const tree = await mount(
    <P13ReadableText
      text={raw}
      label="Nội dung TEST"
      testID="long"
      style={{ fontSize: 18, lineHeight: 27 }}
    />,
  );
  expect(tree.root.findAllByType(Dialog)).toHaveLength(0);
  const measure = tree.root
    .findAllByType(Text)
    .find(n => n.props.testID === 'long.measure')!;
  await act(async () =>
    measure.props.onTextLayout({ nativeEvent: { lines: [{}, {}, {}] } }),
  );
  expect(
    tree.root.findAll(
      n => n.props.accessibilityLabel === 'Xem đầy đủ Nội dung TEST',
    ),
  ).toHaveLength(0);
  await act(async () =>
    measure.props.onTextLayout({ nativeEvent: { lines: [{}, {}, {}, {}] } }),
  );
  const trigger = tree.root.findAll(
    n =>
      n.props.accessibilityLabel === 'Xem đầy đủ Nội dung TEST' &&
      typeof n.props.onPress === 'function',
  )[0];
  await act(async () => trigger.props.onPress());
  const dialog = tree.root.findByType(Dialog);
  expect(dialog.props.dismissOnBackdrop).toBe(false);
  expect(dialog.findAllByType(Text).some(n => n.props.children === raw)).toBe(
    true,
  );
  expect(tree.root.findAllByType(Dialog)).toHaveLength(1);
  await act(async () => dialog.props.onDismiss());
  expect(tree.root.findAllByType(Dialog)).toHaveLength(0);
});

test('four-panel frame keeps tab dock/actions/footer outside one content scroller and white24 inset', async () => {
  for (const detail of [false, true]) {
    const tree = await mount(
      <P13NotificationFrame
        detail={detail}
        title="TEST"
        restoreKey={String(detail)}
        initialScrollY={0}
        onScrollPositionChange={noAction}
        onBack={noAction}
        busy={false}
        dock={<Text>FIXED_TAB</Text>}
        actions={<Text>FIXED_CTA</Text>}
        footer={<Text>LOCKED_FOOTER</Text>}
      >
        <Text>BODY</Text>
      </P13NotificationFrame>,
    );
    const scroll = tree.root.findByType(ScrollView);
    expect(
      scroll.findAllByType(NativeText).map(n => n.props.children),
    ).not.toContain('LOCKED_FOOTER');
    expect(
      scroll.findAllByType(NativeText).map(n => n.props.children),
    ).not.toContain('FIXED_CTA');
    expect(
      StyleSheet.flatten(scroll.props.contentContainerStyle).paddingHorizontal,
    ).toBe(24);
    expect(JSON.stringify(tree.toJSON())).toContain('LOCKED_FOOTER');
  }
});

test('large unread count is capped visually while accessibility retains authoritative count', async () => {
  const tree = await mount(
    <P13NotificationFilters
      unread
      count={1000}
      busy={false}
      onSelect={noAction}
    />,
  );
  const text = tree.root.findAllByType(Text).map(n => n.props.children);
  expect(text).toContain('Chưa đọc (99+)');
  expect(
    tree.root.findAll(
      n =>
        n.props.accessibilityValue?.text ===
        '1000 thông báo chưa đọc toàn tài khoản',
    ).length,
  ).toBeGreaterThan(0);
});

test('queue uses same white frame and exact validated owner target; missing review stays missing; no approval', async () => {
  const page = parseWebQueue(queueBody(), scope(), webQueueQuery());
  const service = {
    scopeKey: () => 'parity-offline',
    webQueue: jest.fn(async () => page),
  } as unknown as BeReleasedReads;
  const open = jest.fn();
  const tree = await mount(
    <P13WebQueueScreen
      context={{ user: user() }}
      service={service}
      onBack={noAction}
      onOpenDocument={open}
      footer={<Text>SHARED_FOOTER</Text>}
    />,
  );
  expect(tree.root.findByType(P13NotificationFrame).props.panelId).toBe(
    'P13.S03',
  );
  await act(async () =>
    tree.root.findAllByType(P13WebQueueRow)[0].props.onPress(),
  );
  expect(tree.root.findByType(P13NotificationFrame).props.panelId).toBe(
    'P13.S04',
  );
  expect(tree.root.findAllByType(P13WebQueueDetail)).toHaveLength(1);
  const text = JSON.stringify(tree.toJSON());
  expect(text).toContain('Ghi chú');
  const handoff = page.items[0].handoff;
  expect(handoff.supplied && !handoff.value.reviewed.supplied).toBe(true);
  expect(text).toContain('SHARED_FOOTER');
  expect(
    tree.root
      .findAllByType(Button)
      .some(n => /^(Duyệt|Từ chối|Post|Ghi sổ)$/.test(n.props.label)),
  ).toBe(false);
  await act(async () =>
    tree.root
      .findAllByType(Button)
      .find(n => n.props.label === 'Xem chứng từ')!
      .props.onPress(),
  );
  expect(open).toHaveBeenCalledWith(page.items[0].target);
  await act(async () =>
    tree.root
      .findAllByType(Button)
      .find(n => n.props.label === 'Hướng dẫn xử lý trên Web')!
      .props.onPress(),
  );
  expect(tree.root.findByType(Dialog).props.message).toContain(
    'Chưa có URL Web',
  );
});
