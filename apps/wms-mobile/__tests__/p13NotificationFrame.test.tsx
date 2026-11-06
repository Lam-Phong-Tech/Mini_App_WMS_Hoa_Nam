import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { ScrollView, Text } from 'react-native';
import { AppProviders } from '../src/app/App';
import { P13NotificationFrame } from '../src/features/notifications/P13NotificationFrame';
import {
  notificationKind,
  notificationTime,
  notificationShortTime,
} from '../src/features/notifications/p13Presentation';
import type { NotificationItem } from '../src/services/wms/notifications';

test('P13 keeps the shared footer in list and detail; append/scroll echoes never schedule scroll restoration', async () => {
  const raf = jest
    .spyOn(global, 'requestAnimationFrame')
    .mockImplementation(callback => {
      callback(0);
      return 1;
    });
  const changed = jest.fn();
  const render = (
    detail: boolean,
    key: string,
    initial: number,
    count: number,
  ) => (
    <AppProviders>
      <P13NotificationFrame
        detail={detail}
        restoreKey={key}
        initialScrollY={initial}
        onScrollPositionChange={changed}
        onBack={() => undefined}
        busy={false}
        footer={<Text>FOOTER_ONLY_LIST</Text>}
      >
        <Text>{'rows:' + count}</Text>
      </P13NotificationFrame>
    </AppProviders>
  );
  let tree!: Renderer.ReactTestRenderer;
  try {
    await act(async () => {
      tree = Renderer.create(render(false, 'owner:list', 0, 10));
    });
    const before = raf.mock.calls.length;
    expect(JSON.stringify(tree.toJSON())).toContain('FOOTER_ONLY_LIST');
    await act(async () =>
      tree.root
        .findByType(ScrollView)
        .props.onScroll({ nativeEvent: { contentOffset: { y: 240 } } }),
    );
    expect(changed).toHaveBeenLastCalledWith(240);
    await act(async () => tree.update(render(false, 'owner:list', 240, 20)));
    expect(raf.mock.calls.length).toBe(before);
    await act(async () =>
      tree.update(render(true, 'owner:detail:recipient', 0, 20)),
    );
    expect(raf.mock.calls.length).toBeGreaterThan(before);
    expect(JSON.stringify(tree.toJSON())).toContain('FOOTER_ONLY_LIST');
  } finally {
    if (tree) await act(async () => tree.unmount());
    raf.mockRestore();
  }
});

test('P13 missing event metadata stays unknown and timestamps use VN without a manual offset', () => {
  const event = {
    title: 'PN-0005 cần duyệt',
    subject: null,
  } as NotificationItem;
  expect(notificationKind(event)).toEqual({ label: '—', icon: 'bell' });
  expect(notificationTime(null)).toBe('Chưa ghi nhận');
  expect(notificationTime('2026-10-14T18:21:00Z')).toBe('15/10/2026 01:21');
  expect(
    notificationShortTime(
      '2026-10-14T18:21:00Z',
      Date.parse('2026-10-15T03:00:00Z'),
    ),
  ).toBe('01:21');
  expect(
    notificationShortTime(
      '2026-10-14T18:21:00Z',
      Date.parse('2026-10-18T03:00:00Z'),
    ),
  ).toBe('15/10');
});
