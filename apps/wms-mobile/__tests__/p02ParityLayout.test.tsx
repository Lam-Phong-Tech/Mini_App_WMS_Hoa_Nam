import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { HomeScreen } from '../src/features/home/HomeScreen';
import { Text } from '../src/ui/Text';
import { clearSession, setSession } from '../src/auth/session';
import { resetShiftState } from '../src/shift/shiftState';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import type { UseHomeSummaryDeps } from '../src/features/home/useHomeSummary';

const warehouse = '02020202-0202-4202-8202-000000000003';
const user = {
  id: 'ui-actor',
  auth_session_id: 'ui-family',
  active_warehouse_id: warehouse,
  name: 'Nguyễn Minh Anh',
  warehouse_scope_ids: [warehouse],
  permissions: [
    'warehouse.view',
    'inbound.view',
    'outbound.view',
    'warranty.view',
  ],
};
const deps: UseHomeSummaryDeps = {
  fetchUser: async () => user,
  fetchWarehouse: async () => ({
    id: warehouse,
    name: 'Kho TEST UI',
    status: 'ACTIVE',
  }),
  fetchShift: async () => null,
  fetchUnread: async () => 3,
  fetchStockSummary: async () => ({
    warehouseId: warehouse,
    authorizationScope: 'WAREHOUSE_SCOPED',
    inbound: { pending: 3, posted: 0 },
    outbound: { pending: 2, posted: 0 },
    warranty: { open: 4, ownershipComplete: false },
  }),
  fetchRecentDocuments: async () => [
    {
      id: '02020202-0202-4202-8202-000000000005',
      number: 'PN-TEST-UI',
      type: 'inbound',
      status: 'SCANNING',
      createdAt: '2026-10-28T08:15:00+07:00',
    },
  ],
  capabilities: {
    stockSummary: true,
    warehouseListFilter: true,
    stableCreatedAtSort: true,
    warrantyWarehouseScope: false,
    recentAggregate: true,
  },
};
let tree: Renderer.ReactTestRenderer | undefined;
beforeEach(() => {
  // Layout/callback assertions must not race the real one-second display clock.
  // Clock progression/cleanup has its own vietnamClock.test.tsx coverage.
  jest.useFakeTimers({
    doNotFake: ['queueMicrotask', 'setImmediate', 'nextTick'],
  });
  jest.setSystemTime(new Date('2026-10-29T03:00:00Z'));
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  resetShiftState();
  setSession({
    accessToken: 'offline-only',
    userId: user.id,
    authSessionId: user.auth_session_id,
    activeWarehouseId: warehouse,
  });
});
afterEach(async () => {
  if (tree) await act(() => tree!.unmount());
  tree = undefined;
  clearSession();
  resetShiftState();
  jest.useRealTimers();
});
async function mount(
  props: Partial<React.ComponentProps<typeof HomeScreen>> = {},
) {
  await act(async () => {
    tree = Renderer.create(
      <SafeAreaProvider>
        <ThemeProvider>
          <HomeScreen deps={deps} {...props} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  return tree!;
}
test('TC06 v5 Home has no extra component-resume shortcut in the brand or scroll content', async () => {
  const resume = jest.fn();
  const view = await mount({ onOpenComponentResume: resume });
  expect(
    view.root
      .findByProps({ testID: 'hn-home-hero' })
      .findAllByProps({ testID: 'hn-home-component-resume' }),
  ).toHaveLength(0);
  expect(
    view.root
      .findByProps({ testID: 'hn-home-scroll' })
      .findAllByProps({ testID: 'hn-home-component-resume' }).length,
  ).toBe(0);
  expect(JSON.stringify(view.toJSON())).toContain('HOA NAM SCANNER');
  expect(JSON.stringify(view.toJSON())).toContain(
    'WMS - Vận hành chuyên nghiệp',
  );
  expect(resume).not.toHaveBeenCalled();
});

test('no resume callback adds no empty shortcut; task guide still routes only to existing chooser', async () => {
  const choose = jest.fn(),
    write = jest.fn();
  const view = await mount({ onChooseTask: choose, onSelectTask: write });
  expect(
    view.root.findAllByProps({ testID: 'hn-home-component-resume' }),
  ).toHaveLength(0);
  await act(async () =>
    view.root.findByProps({ testID: 'hn-home-task-guide' }).props.onPress(),
  );
  expect(choose).toHaveBeenCalledTimes(1);
  expect(write).not.toHaveBeenCalled();
});

test('task heading keeps its width while the full guide has bounded wrapping and a scaled touch target', async () => {
  const view = await mount({ onChooseTask: jest.fn() });
  const guide = view.root.findByProps({ testID: 'hn-home-task-guide' });
  const label = guide.findByType(Text);
  const heading = view.root
    .findAllByType(Text)
    .find(n => n.props.children === 'Tác vụ kho')!;
  expect(StyleSheet.flatten(heading.props.style).flexShrink).toBe(0);
  expect(label.props.numberOfLines).toBe(2);
  const pressedStyle = guide.props.style({ pressed: false });
  expect(StyleSheet.flatten(pressedStyle).minHeight).toBeGreaterThan(0);
  expect(label.props.children).toBe('Chọn nghiệp vụ để bắt đầu');
});
