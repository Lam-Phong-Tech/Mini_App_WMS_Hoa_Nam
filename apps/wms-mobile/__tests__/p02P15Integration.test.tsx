import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, Modal, Text as NativeText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { HomeScreen } from '../src/features/home/HomeScreen';
import { P15ConnectionScreen } from '../src/features/system/P15Screen';
import { VietnamClock } from '../src/features/home/VietnamClock';
import { Sheet } from '../src/ui/Sheet';
import { AppError } from '../src/errors/AppError';
import { clearSession, getSession, setSession } from '../src/auth/session';
import { resetShiftState, getShiftState } from '../src/shift/shiftState';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import type { UseHomeSummaryDeps } from '../src/features/home/useHomeSummary';

// Shared-host cold native/SVG initialization only, not a product/API timeout.
jest.setTimeout(180000);
const wid = '02020202-0202-4202-8202-000000000003';
const user = {
  id: 'ui-actor',
  auth_session_id: 'ui-family',
  active_warehouse_id: wid,
  warehouse_scope_ids: [wid],
  name: 'TEST UI',
  permissions: [
    'warehouse.view',
    'inbound.view',
    'outbound.view',
    'warranty.view',
  ],
};
let tree: Renderer.ReactTestRenderer | undefined;
let read: jest.Mock;
let currentFailure: AppError;
const viewState = { scrollY: 73 };
beforeEach(() => {
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
    activeWarehouseId: wid,
  });
  currentFailure = new AppError({
    kind: 'network',
    message: 'TEST connection',
    route: '/api/v1/auth/me',
  });
  read = jest.fn(async () => {
    throw currentFailure;
  });
  viewState.scrollY = 73;
});
afterEach(async () => {
  if (tree) await act(() => tree!.unmount());
  tree = undefined;
  clearSession();
  resetShiftState();
  jest.useRealTimers();
  jest.restoreAllMocks();
});
const deps = (): UseHomeSummaryDeps => ({
  readSession: getSession,
  readSharedShift: getShiftState,
  fetchUser: read,
  fetchWarehouse: async () => ({
    id: wid,
    name: 'Kho TEST UI',
    status: 'ACTIVE',
  }),
  fetchShift: async () => null,
  fetchUnread: async () => 3,
  fetchStockSummary: async () => ({
    warehouseId: wid,
    authorizationScope: 'WAREHOUSE_SCOPED',
    inbound: { pending: 3, posted: 0 },
    outbound: { pending: 2, posted: 0 },
    warranty: { open: 4, ownershipComplete: false },
  }),
  fetchRecentDocuments: async () => [],
  capabilities: {
    stockSummary: true,
    warehouseListFilter: true,
    stableCreatedAtSort: true,
    warrantyWarehouseScope: false,
    recentAggregate: true,
  },
});
async function mount(footer?: React.ReactNode) {
  await act(async () => {
    tree = Renderer.create(
      <SafeAreaProvider>
        <ThemeProvider>
          <HomeScreen
            deps={deps()}
            sessionKey="P02-UI-family"
            viewState={viewState}
            systemFooter={footer}
          />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  return tree!;
}
const connection = () =>
  tree!.root.findAllByType(P15ConnectionScreen).find(n => n.props.active);
const modal = () =>
  tree!.root
    .findAllByType(Modal)
    .find(n => n.props.testID === 'hn-home-connection-modal');
const errorSheets = () =>
  tree!.root
    .findAllByType(Sheet)
    .filter(
      n =>
        n.props.visible && n.props.title === 'Không tải được dữ liệu trang chủ',
    );

test.each(['network', 'timeout'] as const)(
  '%s Home read shows one real P15 Modal, no error Sheet and no mount retry',
  async kind => {
    currentFailure = new AppError({ kind, message: 'TEST read failure' });
    const footer = (
      <NativeText testID="parent-locked-footer">Parent footer</NativeText>
    );
    await mount(footer);
    expect(modal()?.props.visible).toBe(true);
    expect(modal()?.props.transparent).toBe(false);
    expect(modal()?.props.presentationStyle).toBe('fullScreen');
    expect(errorSheets()).toHaveLength(0);
    expect(connection()?.props.intent).toBe('read');
    expect(connection()?.props.unknown).not.toBe(true);
    expect(connection()?.props.footer).toBe(footer);
    expect(typeof connection()?.props.onRead).toBe('function');
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(5000));
    expect(read).toHaveBeenCalledTimes(1);
  },
);

test.each(['parse', 'unknown', 'http', 'blocked_by_gate'] as const)(
  '%s is not turned into P15 read retry or a writer reconciliation',
  async kind => {
    currentFailure = new AppError({
      kind,
      message: 'TEST owner outcome',
      status: kind === 'http' ? 403 : undefined,
    });
    await mount();
    expect(connection()).toBeUndefined();
    expect(errorSheets()).toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(1);
  },
);

test('native Modal Back dismisses only P15, keeps Home/scroll and old Back/read callbacks cannot act again', async () => {
  await mount();
  expect(tree!.root.findAllByType(VietnamClock)).toHaveLength(0);
  const old = connection()!.props;
  await act(async () => modal()!.props.onRequestClose());
  expect(connection()).toBeUndefined();
  expect(tree!.root.findAllByType(VietnamClock)).toHaveLength(1);
  expect(
    tree!.root.findAllByProps({ testID: 'hn-home-screen' }).length,
  ).toBeGreaterThan(0);
  expect(viewState.scrollY).toBe(73);
  const count = read.mock.calls.length;
  await act(async () => {
    old.onRead();
    old.onBack();
    old.onHome();
  });
  expect(read).toHaveBeenCalledTimes(count);
  expect(connection()).toBeUndefined();
});

test('explicit read is single-flight, clears the Modal while loader runs, and uses only Home GET deps', async () => {
  await mount();
  let finish!: (value: typeof user) => void;
  read.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  const old = connection()!.props;
  await act(async () => {
    old.onRead();
    old.onRead();
    old.onBack();
  });
  expect(read).toHaveBeenCalledTimes(2);
  expect(connection()).toBeUndefined();
  await act(async () => {
    old.onRead();
    old.onHome();
  });
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => finish(user));
  expect(connection()).toBeUndefined();
  expect(viewState.scrollY).toBe(73);
  expect(getShiftState().phase).not.toBe('ACTIVE');
});

test('same Error object after an explicit retry creates a new connection boundary; old callbacks stay rejected', async () => {
  await mount();
  const old = connection()!.props;
  await act(async () => old.onRead());
  expect(read).toHaveBeenCalledTimes(2);
  const next = connection()!.props;
  expect(next.ownerKey).not.toBe(old.ownerKey);
  await act(async () => {
    old.onRead();
    old.onBack();
  });
  expect(read).toHaveBeenCalledTimes(2);
  expect(connection()).toBeDefined();
  await act(async () => next.onHome());
  expect(connection()).toBeUndefined();
});

test('auth family change and disposed Home reject captured connection callbacks', async () => {
  await mount();
  const old = connection()!.props;
  await act(async () =>
    setSession({
      accessToken: 'offline-next',
      userId: 'other-actor',
      authSessionId: 'other-family',
      activeWarehouseId: wid,
    }),
  );
  const count = read.mock.calls.length;
  await act(async () => {
    old.onRead();
    old.onBack();
  });
  expect(read).toHaveBeenCalledTimes(count);
  await act(() => tree!.unmount());
  tree = undefined;
  await act(async () => old.onRead());
  expect(read).toHaveBeenCalledTimes(count);
});

test('foreground resume under P15 does not auto-retry the failed read', async () => {
  const change: ((state: any) => void)[] = [];
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, listener) => {
      change.push(listener);
      return { remove: jest.fn() };
    });
  await mount();
  const count = read.mock.calls.length;
  await act(async () => {
    change.forEach(fn => fn('background'));
    change.forEach(fn => fn('active'));
  });
  expect(read).toHaveBeenCalledTimes(count);
  expect(connection()).toBeDefined();
});
