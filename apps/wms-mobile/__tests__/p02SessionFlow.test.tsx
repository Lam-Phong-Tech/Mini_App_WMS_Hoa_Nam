jest.mock('../src/auth/tokenTransport', () =>
  jest.requireActual('../src/auth/tokenTransport.web'),
);
jest.mock('../src/api/wmsFetch', () =>
  jest.requireActual('../src/api/wmsFetch.web'),
);

import React from 'react';
import Renderer from 'react-test-renderer';
import { Text } from 'react-native';
import { AppProviders } from '../src/app/App';
import { P02SessionFlow } from '../src/web/P02SessionFlow';
import { SessionConfirmationScreen } from '../src/features/auth/SessionConfirmationScreen';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { Button } from '../src/ui/Button';
import { clearSession, setSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { getShiftState, resetShiftState } from '../src/shift/shiftState';
import { resetServerClock } from '../src/auth/serverClock';
import {
  getOrCreatePendingWorkShiftStart,
  markPendingWorkShiftStart,
  readPendingWorkShiftStart,
} from '../src/services/wms/workShift';

const wid = '11111111-1111-4111-8111-111111111111';
const grant = {
  warehouse_id: wid,
  code: 'OFFLINE',
  name: 'Kho cấp từ API',
  status: 'ACTIVE',
};
const required = {
  id: 'offline-actor',
  auth_session_id: 'offline-family',
  name: 'Nguyễn Minh Anh',
  active_warehouse_id: null,
  warehouse_context: { status: 'REQUIRED' },
  available_warehouses: [grant],
};
const ready = {
  ...required,
  active_warehouse_id: wid,
  warehouse_context: { status: 'READY' },
};
const shift = {
  shift_id: 'offline-shift',
  actor_id: required.id,
  auth_session_id: required.auth_session_id,
  warehouse_id: wid,
  status: 'ACTIVE',
  preview_ready: true,
  started_at: '2026-10-13T08:01:02+07:00',
};
let me: typeof required | typeof ready;
let current: typeof shift | null;
let contextStatus: number;
let currentStatus: number;
let startResult: () => Promise<Response>;
let network: jest.SpyInstance;
let tree: Renderer.ReactTestRenderer;
const calls: {
  path: string;
  method: string;
  body: any;
  headers: Record<string, string>;
}[] = [];

const reply = (data: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    headers: new Headers({ 'X-Request-ID': 'offline-request' }),
    text: async () =>
      JSON.stringify(
        status < 400
          ? {
              success: true,
              data,
              meta: { timestamp: new Date().toISOString() },
            }
          : {
              success: false,
              error: { code: 'ACCESS_DENIED' },
              error_code: 'ACCESS_DENIED',
              message: 'Không được phép',
            },
      ),
  } as Response);

beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline-access',
    userId: required.id,
    authSessionId: required.auth_session_id,
  });
  resetShiftState();
  resetServerClock();
  me = required;
  current = null;
  contextStatus = 200;
  currentStatus = 200;
  calls.length = 0;
  startResult = async () => reply(shift, 201);
  network = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const path = new URL(
        String(input),
        'http://127.0.0.1:8817',
      ).pathname.replace(/^\/wms-api/, '');
      expect(String(input)).toMatch(/^\/wms-api\/api\/v1\//);
      expect(init?.credentials).toBe('include');
      calls.push({
        path,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        headers: (init?.headers as Record<string, string>) ?? {},
      });
      if (path === '/api/v1/auth/me') return reply(me);
      if (path === '/api/v1/warehouses')
        return reply({
          items: [{ id: wid, name: grant.name, status: 'ACTIVE' }],
        });
      if (path === '/api/v1/auth/switch-context') {
        if (contextStatus !== 200) return reply(null, contextStatus);
        me = ready;
        return reply({
          access_token: 'offline-context-access',
          token_type: 'bearer',
          expires_in: 3600,
          active_context: { context_type: 'WAREHOUSE', context_id: wid },
          user: ready,
        });
      }
      if (path === '/api/v1/mini-app/work-shifts/current')
        return reply(current, currentStatus);
      if (path === '/api/v1/mini-app/work-shifts/start') return startResult();
      throw new Error('Unexpected offline request ' + path);
    });
});
afterEach(async () => {
  if (tree) await Renderer.act(() => tree.unmount());
  network.mockRestore();
  clearSession();
  resetShiftState();
  resetServerClock();
});

async function mount() {
  const onReady = jest.fn(),
    onState = jest.fn();
  await Renderer.act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P02SessionFlow
          onReady={onReady}
          onState={onState}
          renderHome={() => <Text testID="home">P02 Home</Text>}
        />
      </AppProviders>,
    );
  });
  return { onReady, onState };
}
const cta = () =>
  tree.root
    .findAllByType(Button)
    .find(n => n.props.accessibilityLabel === 'Bắt đầu ca')!;
const writes = () => calls.filter(c => c.method === 'POST');
const starts = () => calls.filter(c => c.path.endsWith('/work-shifts/start'));

test('current P01 REQUIRED uses single CTA, with no context/START/key or Home on mount', async () => {
  const v = await mount();
  expect(tree.root.findAllByType(SessionConfirmationScreen)).toHaveLength(1);
  expect(cta().props.disabled).toBe(false);
  expect(writes()).toHaveLength(0);
  expect(readPendingWorkShiftStart()).toBeUndefined();
  expect(v.onReady).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain(grant.name);
});

test('one explicit CTA uses original context/START owners and opens Home from exact ACTIVE receipt', async () => {
  const v = await mount();
  await Renderer.act(async () => {
    await cta().props.onPress();
  });
  expect(writes().map(c => c.path)).toEqual([
    '/api/v1/auth/switch-context',
    '/api/v1/mini-app/work-shifts/start',
  ]);
  expect(writes()[0].body).toEqual({
    context_type: 'WAREHOUSE',
    context_id: wid,
  });
  expect(writes()[0].headers).not.toHaveProperty('Idempotency-Key');
  expect(starts()[0].body).toEqual({ warehouse_id: wid });
  expect(starts()[0].headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  expect(calls.findIndex(c => c.path.endsWith('/current'))).toBeLessThan(
    calls.findIndex(c => c.path.endsWith('/start')),
  );
  expect(getShiftState()).toMatchObject({
    phase: 'ACTIVE',
    shift: { shift_id: shift.shift_id, started_at: shift.started_at },
  });
  expect(v.onReady).toHaveBeenCalledTimes(1);
  expect(v.onReady).toHaveBeenCalledWith(
    expect.objectContaining({
      id: required.id,
      warehouse_context: expect.objectContaining({ status: 'READY' }),
    }),
  );
  expect(readPendingWorkShiftStart()).toBeUndefined();
  expect(tree.root.findAllByType(SessionConfirmationScreen)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('P02 Home');
});

test('READY/current ACTIVE restores without POST and does not erase unresolved original START key', async () => {
  me = ready;
  current = shift;
  setSession({
    accessToken: 'offline-access',
    userId: required.id,
    authSessionId: required.auth_session_id,
    activeWarehouseId: wid,
  });
  const pending = getOrCreatePendingWorkShiftStart(
    required.auth_session_id,
    wid,
    required.id,
  );
  markPendingWorkShiftStart('UNKNOWN');
  const v = await mount();
  expect(v.onReady).toHaveBeenCalledTimes(1);
  expect(writes()).toHaveLength(0);
  expect(readPendingWorkShiftStart()?.idempotencyKey).toBe(
    pending.idempotencyKey,
  );
});

test('READY/current null does not fake ACTIVE; double tap dispatches a single original START', async () => {
  me = ready;
  setSession({
    accessToken: 'offline-access',
    userId: required.id,
    authSessionId: required.auth_session_id,
    activeWarehouseId: wid,
  });
  let finish!: (value: Response) => void;
  startResult = () =>
    new Promise(resolve => {
      finish = resolve;
    });
  const v = await mount();
  expect(getShiftState().phase).toBe('NO_SHIFT');
  expect(v.onReady).not.toHaveBeenCalled();
  expect(readPendingWorkShiftStart()).toBeUndefined();
  let first!: Promise<void>;
  await Renderer.act(async () => {
    const press = cta().props.onPress;
    first = press();
    press();
  });
  expect(starts()).toHaveLength(1);
  expect(readPendingWorkShiftStart()?.outcome).toBe('IN_FLIGHT');
  await Renderer.act(async () => {
    finish(reply(shift, 201));
    await first;
  });
  expect(v.onReady).toHaveBeenCalledTimes(1);
});

test('context403 never dispatches START or creates a START checkpoint', async () => {
  contextStatus = 403;
  const v = await mount();
  await Renderer.act(async () => {
    await cta().props.onPress();
  });
  expect(starts()).toHaveLength(0);
  expect(readPendingWorkShiftStart()).toBeUndefined();
  expect(v.onReady).not.toHaveBeenCalled();
  expect(tree.root.findAllByType(SessionConfirmationScreen)).toHaveLength(1);
});

test('current500 remains on P01 without converting read error to no-shift or enabling START', async () => {
  me = ready;
  currentStatus = 500;
  setSession({
    accessToken: 'offline-access',
    userId: required.id,
    authSessionId: required.auth_session_id,
    activeWarehouseId: wid,
  });
  const v = await mount();
  expect(v.onReady).not.toHaveBeenCalled();
  expect(cta().props.disabled).toBe(true);
  expect(writes()).toHaveLength(0);
});

test('uncertain START preserves original key across remount and never retries on mount', async () => {
  startResult = async () => {
    throw new Error('offline dropped response');
  };
  const v = await mount();
  await Renderer.act(async () => {
    await cta().props.onPress();
  });
  const key = readPendingWorkShiftStart()?.idempotencyKey;
  expect(key).toBeTruthy();
  expect(readPendingWorkShiftStart()?.outcome).toBe('UNKNOWN');
  expect(v.onReady).not.toHaveBeenCalled();
  await Renderer.act(() => tree.unmount());
  const next = await mount();
  expect(starts()).toHaveLength(1);
  expect(readPendingWorkShiftStart()?.idempotencyKey).toBe(key);
  startResult = async () => reply(shift, 201);
  await Renderer.act(async () => {
    await cta().props.onPress();
  });
  expect(starts()).toHaveLength(2);
  expect(starts()[1].headers['Idempotency-Key']).toBe(key);
  expect(next.onReady).toHaveBeenCalledTimes(1);
});

test('receipt of another actor cannot open Home or publish ACTIVE', async () => {
  startResult = async () => reply({ ...shift, actor_id: 'another-actor' }, 201);
  const v = await mount();
  await Renderer.act(async () => {
    await cta().props.onPress();
  });
  expect(v.onReady).not.toHaveBeenCalled();
  expect(getShiftState().phase).not.toBe('ACTIVE');
  expect(tree.root.findAllByType(SessionConfirmationScreen)).toHaveLength(1);
});

test('logout/forced auth teardown hides Home and stale callbacks cannot restore it', async () => {
  me = ready;
  current = shift;
  setSession({
    accessToken: 'offline-access',
    userId: required.id,
    authSessionId: required.auth_session_id,
    activeWarehouseId: wid,
  });
  const v = await mount();
  expect(v.onReady).toHaveBeenCalledTimes(1);
  await Renderer.act(() => clearSession());
  expect(tree.root.findAllByType(LoginScreen)).toHaveLength(1);
  expect(JSON.stringify(tree.toJSON())).not.toContain('P02 Home');
});

test('late auth/me from a previous login family cannot replace the new Home identity', async () => {
  let finishOld!: (value: Response) => void;
  network.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finishOld = resolve;
      }),
  );
  const v = await mount();
  expect(v.onReady).not.toHaveBeenCalled();
  const nextUser = {
    ...ready,
    id: 'next-offline-actor',
    auth_session_id: 'next-offline-family',
  };
  me = nextUser;
  current = {
    ...shift,
    actor_id: nextUser.id,
    auth_session_id: nextUser.auth_session_id,
  };
  await Renderer.act(async () => {
    setSession({
      accessToken: 'offline-next',
      userId: nextUser.id,
      authSessionId: nextUser.auth_session_id,
      activeWarehouseId: wid,
    });
  });
  expect(v.onReady).toHaveBeenCalledTimes(1);
  expect(v.onReady).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: nextUser.id }),
  );
  await Renderer.act(async () => {
    finishOld(reply(required));
  });
  expect(v.onReady).toHaveBeenCalledTimes(1);
  expect(getShiftState().owner?.actorId).toBe(nextUser.id);
  expect(writes()).toHaveLength(0);
});
