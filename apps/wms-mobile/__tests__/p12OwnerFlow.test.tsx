import React from 'react';
import Renderer from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { P12OwnerFlow, type P12OwnerFlowProps } from '../src/web/P12OwnerFlow';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { SessionConfirmationScreen } from '../src/features/auth/SessionConfirmationScreen';
import { Button } from '../src/ui/Button';
import { AppError } from '../src/errors/AppError';
import { clearSession, setSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import {
  readPendingWorkShiftStart,
  type WorkShift,
} from '../src/services/wms/workShift';
import type { CurrentUser } from '../src/services/wms/types';

const wid = '11111111-1111-4111-8111-111111111111';
const me: CurrentUser = {
  id: 'actor',
  auth_session_id: 'session',
  active_warehouse_id: wid,
  warehouse_context: { status: 'READY' },
};
const shift = {
  actor_id: 'actor',
  auth_session_id: 'session',
  warehouse_id: wid,
  shift_id: 'shift',
  status: 'ACTIVE',
  preview_ready: true,
  started_at: '2026-10-13T08:00:00+07:00',
} as WorkShift;
const loginSession = () =>
  setSession({
    accessToken: 'synthetic-local-only',
    userId: 'actor',
    authSessionId: 'session',
  });
let tree: Renderer.ReactTestRenderer;
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
});
afterEach(async () => {
  if (tree) await Renderer.act(() => tree.unmount());
  clearSession();
});

async function mount(props: Partial<P12OwnerFlowProps> = {}, loggedIn = true) {
  if (loggedIn) loginSession();
  const fetchUser = props.fetchUser ?? jest.fn(async () => me);
  const fetchShift = props.fetchShift ?? jest.fn(async () => null);
  const onReady = jest.fn();
  const onState = jest.fn();
  const onReadContextReady = jest.fn();
  await Renderer.act(async () => {
    tree = Renderer.create(
      <SafeAreaProvider>
        <ThemeProvider>
          <P12OwnerFlow
            fetchUser={fetchUser}
            fetchShift={fetchShift}
            fetchWarehouseList={async () => ({ items: [] })}
            onReady={onReady}
            onState={onState}
            onReadContextReady={onReadContextReady}
            renderDocuments={() => (
              <Text testID="documents">P12 documents</Text>
            )}
          />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  const button = (label: string) =>
    tree.root
      .findAllByType(Button)
      .find(
        node => (node.props.accessibilityLabel ?? node.props.label) === label,
      )!;
  return {
    fetchUser,
    fetchShift,
    onReady,
    onState,
    onReadContextReady,
    button,
  };
}

it('login success mounts real confirmation even if GET me fails500; it does not stay on login', async () => {
  const fetchUser = jest.fn(async () => {
    throw new AppError({
      kind: 'http',
      status: 500,
      route: '/api/v1/auth/me',
      message: 'Server failure',
    });
  });
  const v = await mount({ fetchUser }, false);
  expect(tree.root.findAllByType(SessionConfirmationScreen)).toHaveLength(0);
  await Renderer.act(async () => {
    loginSession();
    tree.root.findByType(LoginScreen).props.onSuccess();
  });
  expect(tree.root.findAllByType(LoginScreen)).toHaveLength(0);
  expect(tree.root.findAllByType(SessionConfirmationScreen)).toHaveLength(1);
  expect(JSON.stringify(tree.toJSON())).toContain(
    'Không tải được thông tin tài khoản',
  );
  expect(v.button('Bắt đầu ca').props.disabled).toBe(true);
  expect(v.fetchShift).not.toHaveBeenCalled();
  expect(v.onReady).not.toHaveBeenCalled();
});

it('REQUIRED retains confirmation, disables context/START and never reads P12', async () => {
  const v = await mount({
    fetchUser: jest.fn(async () => ({
      ...me,
      active_warehouse_id: null,
      warehouse_context: { status: 'REQUIRED' },
      available_warehouses: [{ warehouse_id: wid, status: 'ACTIVE' }],
    })),
  });
  expect(tree.root.findAllByType(SessionConfirmationScreen)).toHaveLength(1);
  // P01 owner now uses a single START CTA for its explicit one-warehouse
  // confirmation. This reader must keep that CTA closed and expose no read
  // callback for REQUIRED; it must not depend on the owner's former label.
  expect(
    v.onReadContextReady.mock.calls.some(([fn]) => typeof fn === 'function'),
  ).toBe(false);
  expect(v.button('Bắt đầu ca').props.disabled).toBe(true);
  expect(v.fetchShift).not.toHaveBeenCalled();
  expect(v.onReady).not.toHaveBeenCalled();
  expect(readPendingWorkShiftStart()).toBeUndefined();
});

it('READY/current:null stays on confirmation, without a local START intent', async () => {
  const v = await mount();
  expect(v.fetchShift).toHaveBeenCalledTimes(1);
  expect(v.button('Bắt đầu ca').props.disabled).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain('Trang kiểm thử P12 chỉ đọc');
  expect(readPendingWorkShiftStart()).toBeUndefined();
  expect(v.onReady).not.toHaveBeenCalled();
});

it('matching owner + READY + ACTIVE preview_ready opens documents once; logout conceals them', async () => {
  const v = await mount({ fetchShift: jest.fn(async () => shift) });
  expect(v.onReady).toHaveBeenCalledTimes(1);
  expect(v.onReady).toHaveBeenCalledWith(me);
  expect(tree.root.findAllByType(SessionConfirmationScreen)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('P12 documents');
  await Renderer.act(() => clearSession());
  expect(tree.root.findAllByType(LoginScreen)).toHaveLength(1);
  expect(JSON.stringify(tree.toJSON())).not.toContain('P12 documents');
});

it('a different GET identity remains blocked before shift/P12', async () => {
  const v = await mount({
    fetchUser: jest.fn(async () => ({ ...me, id: 'another-actor' })),
  });
  expect(v.fetchShift).not.toHaveBeenCalled();
  expect(v.onReady).not.toHaveBeenCalled();
  expect(v.button('Bắt đầu ca').props.disabled).toBe(true);
});

it('retry after500 stays on confirmation with a fresh GET and no render loop', async () => {
  const fetchUser = jest
    .fn()
    .mockRejectedValueOnce(
      new AppError({
        kind: 'http',
        status: 500,
        route: '/api/v1/auth/me',
        message: 'failed',
      }),
    )
    .mockResolvedValue({
      ...me,
      warehouse_context: { status: 'REQUIRED' },
      active_warehouse_id: null,
    });
  const v = await mount({ fetchUser });
  expect(fetchUser).toHaveBeenCalledTimes(1);
  await Renderer.act(async () => v.button('Thử lại').props.onPress());
  expect(fetchUser).toHaveBeenCalledTimes(2);
  expect(tree.root.findAllByType(SessionConfirmationScreen)).toHaveLength(1);
  expect(v.onReady).not.toHaveBeenCalled();
});

it('late GET from a previous generation never opens documents', async () => {
  let complete!: (user: CurrentUser) => void;
  const v = await mount({
    fetchUser: () =>
      new Promise(resolve => {
        complete = resolve;
      }),
  });
  await Renderer.act(async () => {
    setSession({
      accessToken: 'different-local-only',
      userId: 'other',
      authSessionId: 'other-session',
    });
    complete(me);
  });
  expect(v.onReady).not.toHaveBeenCalled();
  expect(v.fetchShift).not.toHaveBeenCalled();
  expect(tree.root.findAllByType(SessionConfirmationScreen)).toHaveLength(1);
});

it('P14 current503 does not require a new shift for explicitly requested P12 context-only GET review', async () => {
  const v = await mount({
    fetchShift: async () => {
      throw new AppError({
        kind: 'http',
        status: 503,
        code: 'P14_SHIFT_NOT_ENABLED',
        message: 'P14 OFF',
      });
    },
  });
  expect(tree.root.findAllByType(SessionConfirmationScreen)).toHaveLength(1);
  expect(v.onReady).not.toHaveBeenCalled();
  const openRead = v.onReadContextReady.mock.calls.at(-1)?.[0];
  expect(typeof openRead).toBe('function');
  await Renderer.act(async () => openRead());
  expect(v.onReady).toHaveBeenCalledTimes(1);
  expect(v.onReady).toHaveBeenCalledWith(me);
  expect(readPendingWorkShiftStart()).toBeUndefined();
});

it('the separate context-read callback cannot open P12 after logout or a new generation', async () => {
  const v = await mount();
  const openRead = v.onReadContextReady.mock.calls.at(-1)?.[0];
  expect(typeof openRead).toBe('function');
  await Renderer.act(async () => clearSession());
  expect(() => openRead()).toThrow('Phiên');
  expect(v.onReady).not.toHaveBeenCalled();
});

it('a late GET failure from an unmounted entry cannot clear a fresh READY reader', async () => {
  let failOld!: (cause: Error) => void;
  const v = await mount({
    fetchUser: () =>
      new Promise((_, reject) => {
        failOld = reject;
      }),
  });
  await Renderer.act(async () => {
    tree.update(
      <SafeAreaProvider>
        <ThemeProvider>
          <P12OwnerFlow
            key="fresh"
            fetchUser={async () => me}
            fetchShift={async () => null}
            fetchWarehouseList={async () => ({ items: [] })}
            onReady={v.onReady}
            onState={v.onState}
            onReadContextReady={v.onReadContextReady}
            renderDocuments={() => <Text>P12 read</Text>}
          />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  const fresh = v.onReadContextReady.mock.calls.at(-1)?.[0];
  expect(typeof fresh).toBe('function');
  await Renderer.act(async () =>
    failOld(
      new AppError({ kind: 'http', status: 500, message: 'old failure' }),
    ),
  );
  expect(v.onReadContextReady.mock.calls.at(-1)?.[0]).toBe(fresh);
});

it('first owner GET may bind a missing login auth-session ID without invalidating its READY read proof', async () => {
  setSession({accessToken:'synthetic-minimal-login',userId:'actor'});
  const v = await mount({}, false);
  const openRead = v.onReadContextReady.mock.calls.at(-1)?.[0];
  expect(typeof openRead).toBe('function');
  await Renderer.act(async()=>openRead());
  expect(v.onReady).toHaveBeenCalledTimes(1);
  expect(v.onReady).toHaveBeenCalledWith(me);
});
