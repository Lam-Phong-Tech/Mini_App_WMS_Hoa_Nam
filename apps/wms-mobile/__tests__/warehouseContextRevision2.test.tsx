import React from 'react';
import Renderer from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { SessionConfirmationScreen } from '../src/features/auth/SessionConfirmationScreen';
import {
  switchWarehouseContext,
  SWITCH_CONTEXT_PATH,
  type ContextDeps,
} from '../src/services/wms/warehouseContext';
import {
  contextReleaseVerified,
  CONTEXT_RELEASE,
} from '../src/config/homeContextRelease';
import { AppError } from '../src/errors/AppError';
import { clearSession, setSession, type Session } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import type { ApiResponse, RequestOptions } from '../src/api/client';
const wid = '11111111-1111-4111-8111-111111111111',
  sid = '22222222-2222-4222-8222-222222222222',
  actor = 'actor';
const selected = { actorId: actor, authSessionId: sid, warehouseId: wid };
const ready = {
  id: actor,
  auth_session_id: sid,
  active_warehouse_id: wid,
  warehouse_context: { status: 'READY', error_code: null },
};
const release = {
  artifactSha: '59313aaa1956c446f78b4adb84264d51ac1891ef',
  containsContextCommit: true,
  contextMigrationApplied: true,
  smokePassed: true,
};
const response = {
  success: true,
  data: {
    access_token: 'new-access-test-only',
    token_type: 'bearer',
    expires_in: 120,
    active_context: { context_type: 'WAREHOUSE', context_id: wid },
    user: ready,
  },
};
function session() {
  return {
    accessToken: 'old-access-test-only',
    refreshToken: 'refresh-stays-test-only',
    userId: actor,
    authSessionId: sid,
  } as Session;
}
function client(value: unknown = response) {
  return {
    request: jest.fn(
      async <T,>(_o: RequestOptions) =>
        ({ status: 200, data: value as T } as ApiResponse<T>),
    ),
  };
}
describe('Warehouse context pinned59313 code; rollout gate remains closed', () => {
  it('a pushed SHA alone or health200 does not satisfy migration/smoke evidence', async () => {
    expect(contextReleaseVerified()).toBe(true);
    expect(CONTEXT_RELEASE.artifactSha).toBe(
      '6f6a4d3464226ff52a045e70acddc69698ff4307',
    );
    expect(
      contextReleaseVerified({ ...release, contextMigrationApplied: false }),
    ).toBe(false);
    const c = client();
    await expect(
      switchWarehouseContext(
        selected,
        {},
        {
          release: {
            ...CONTEXT_RELEASE,
            artifactSha: null,
            containsContextCommit: false,
            contextMigrationApplied: false,
            smokePassed: false,
          },
          client: c as NonNullable<ContextDeps['client']>,
          readSession: session,
        },
      ),
    ).rejects.toMatchObject({ kind: 'blocked_by_gate' });
    expect(c.request).not.toHaveBeenCalled();
  });
  it('sends exactly WAREHOUSE/context_id, preserves refresh, replaces access+serverTTL, rereads me and never starts a shift', async () => {
    let s = session();
    const c = client(),
      readMe = jest.fn(async () => ready);
    const actual = await switchWarehouseContext(
      selected,
      {},
      {
        release,
        client: c as ContextDeps['client'],
        readSession: () => s,
        writeSession: x => {
          s = x;
        },
        readMe,
      },
    );
    expect(c.request).toHaveBeenCalledWith({
      path: SWITCH_CONTEXT_PATH,
      method: 'POST',
      body: { context_type: 'WAREHOUSE', context_id: wid },
      signal: undefined,
      timeoutMs: undefined,
    });
    expect(s.refreshToken).toBe('refresh-stays-test-only');
    expect(s.accessToken).toBe('new-access-test-only');
    expect(s.expiresAtMs! - s.issuedAtMs!).toBe(120000);
    expect(actual).toEqual(ready);
    expect(readMe).toHaveBeenCalledTimes(1);
  });
  it('timeout only reconciles me; no automatic second POST or start', async () => {
    let s = session();
    const c = {
      request: jest.fn(async <T,>(): Promise<ApiResponse<T>> => {
        throw new AppError({ kind: 'timeout', message: 'unknown' });
      }),
    };
    const me = jest.fn(async () => ready);
    await expect(
      switchWarehouseContext(
        selected,
        {},
        {
          release,
          client: c as ContextDeps['client'],
          readSession: () => s,
          writeSession: x => {
            s = x;
          },
          readMe: me,
        },
      ),
    ).resolves.toEqual(ready);
    expect(c.request).toHaveBeenCalledTimes(1);
    expect(s.accessToken).toBe('old-access-test-only');
    expect(me).toHaveBeenCalledTimes(1);
  });
  it('business errors branch by error.code and do not read me or pretend context success', async () => {
    const c = {
        request: jest.fn(async <T,>(): Promise<ApiResponse<T>> => {
          throw new AppError({
            kind: 'http',
            status: 409,
            code: 'SHIFT_WAREHOUSE_CONFLICT',
            message: 'server',
          });
        }),
      },
      me = jest.fn(async () => ready);
    await expect(
      switchWarehouseContext(
        selected,
        {},
        {
          release,
          client: c as ContextDeps['client'],
          readSession: session,
          readMe: me,
        },
      ),
    ).rejects.toMatchObject({ code: 'SHIFT_WAREHOUSE_CONFLICT' });
    expect(me).not.toHaveBeenCalled();
  });
  it('old-session response never replaces credentials after a new login', async () => {
    let s = session(),
      finish!: (v: ApiResponse<unknown>) => void;
    const c = {
        request: jest.fn(
          <T,>() =>
            new Promise<ApiResponse<T>>(r => {
              finish = r as typeof finish;
            }),
        ),
      },
      write = jest.fn();
    const task = switchWarehouseContext(
      selected,
      {},
      {
        release,
        client: c as ContextDeps['client'],
        readSession: () => s,
        writeSession: write,
        readMe: async () => ready,
      },
    );
    s = { ...s, userId: 'other' };
    finish({ status: 200, data: response });
    await expect(task).rejects.toMatchObject({ kind: 'cancelled' });
    expect(write).not.toHaveBeenCalled();
  });
  it('one ACTIVE grant is confirmed only by the START CTA, never on mount', async () => {
    setAppStorageForTesting(createStorage(createMemoryBackend()));
    clearSession();
    let user = {
      ...ready,
      active_warehouse_id: null,
      warehouse_context: { status: 'REQUIRED', error_code: null },
      available_warehouses: [
        { warehouse_id: wid, name: 'Kho được cấp', status: 'ACTIVE' },
      ],
    };
    const change = jest.fn(async () => {
      user = {
        ...user,
        active_warehouse_id: wid as any,
        warehouse_context: { status: 'READY', error_code: null },
      };
      return user;
    });
    const start = jest.fn(async () => ({
        shift_id: 'offline-shift',
        actor_id: actor,
        auth_session_id: sid,
        warehouse_id: wid,
        status: 'ACTIVE',
        preview_ready: true,
        started_at: '2026-10-13T08:00:00+07:00',
      })),
      current = jest.fn(async () => null);
    let tree!: Renderer.ReactTestRenderer;
    await Renderer.act(async () => {
      tree = Renderer.create(
        <AppProviders>
          <SessionConfirmationScreen
            contextEnabled
            switchContext={change}
            fetchUser={async () => user}
            fetchShift={current}
            fetchWarehouses={async () => ({ items: [] })}
            onContinue={jest.fn()}
            onLoggedOut={jest.fn()}
            startShift={start}
          />
        </AppProviders>,
      );
    });
    const button = (label: string) =>
      tree.root.find(
        n =>
          n.props.accessibilityLabel === label &&
          typeof n.props.onPress === 'function',
      );
    expect(change).not.toHaveBeenCalled();
    await Renderer.act(async () => {
      await button('Bắt đầu ca').props.onPress();
    });
    expect(change).toHaveBeenCalledWith(selected);
    expect(start).toHaveBeenCalledTimes(1);
    expect(current).toHaveBeenCalledTimes(1);
    await Renderer.act(() => tree.unmount());
  });
  it('foreign warehouse change while context is pending cannot replace local credentials', async () => {
    let s = session(),
      finish!: (r: ApiResponse<unknown>) => void;
    const c = {
      request: <T,>() =>
        new Promise<ApiResponse<T>>(r => {
          finish = r as typeof finish;
        }),
    };
    const write = jest.fn();
    const task = switchWarehouseContext(
      selected,
      {},
      {
        release,
        client: c,
        readSession: () => s,
        writeSession: write,
        readMe: async () => ready,
      },
    );
    s = { ...s, activeWarehouseId: '33333333-3333-4333-8333-333333333333' };
    finish({ status: 200, data: response });
    await expect(task).rejects.toMatchObject({ kind: 'cancelled' });
    expect(write).not.toHaveBeenCalled();
  });
  it('logout/relogin with the same sid cannot admit a late context response', async () => {
    setAppStorageForTesting(createStorage(createMemoryBackend()));
    clearSession();
    setSession(session());
    let finish!: (r: ApiResponse<unknown>) => void;
    const c = {
      request: <T,>() =>
        new Promise<ApiResponse<T>>(r => {
          finish = r as typeof finish;
        }),
    };
    const write = jest.fn();
    const task = switchWarehouseContext(
      selected,
      {},
      { release, client: c, writeSession: write, readMe: async () => ready },
    );
    clearSession();
    setSession(session());
    finish({ status: 200, data: response });
    await expect(task).rejects.toMatchObject({ kind: 'cancelled' });
    expect(write).not.toHaveBeenCalled();
    clearSession();
  });
});
