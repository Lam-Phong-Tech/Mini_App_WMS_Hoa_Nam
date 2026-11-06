/** User-confirmed13/10: unique grant is confirmed by the existing START CTA;
 * no context mutation on mount, no extra warehouse button/picker. */
import React from 'react';
import Renderer from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { SessionConfirmationScreen } from '../src/features/auth/SessionConfirmationScreen';
import { Button } from '../src/ui/Button';
import type { CurrentUser } from '../src/services/wms/types';
import type { WorkShift } from '../src/services/wms/workShift';
import { AppError } from '../src/errors/AppError';
import { clearSession, getSession, setSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  getAppStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { readPendingWorkShiftStart } from '../src/services/wms/workShift';
import { resetShiftState } from '../src/shift/shiftState';

const wid = '11111111-1111-4111-8111-111111111111',
  otherWid = '22222222-2222-4222-8222-222222222222';
const identity = { id: 'actor', auth_session_id: 'stable-session' };
const granted = { warehouse_id: wid, name: 'Kho được cấp', status: 'ACTIVE' };
const required: CurrentUser = {
  ...identity,
  name: 'Minh Anh',
  role: 'Nhân viên kho',
  active_warehouse_id: null,
  warehouse_context: { status: 'REQUIRED' },
  available_warehouses: [granted],
};
const ready: CurrentUser = {
  ...required,
  active_warehouse_id: wid,
  warehouse_context: { status: 'READY' },
};
const shift: WorkShift = {
  shift_id: 'offline-shift',
  actor_id: identity.id,
  auth_session_id: identity.auth_session_id,
  warehouse_id: wid,
  status: 'ACTIVE',
  preview_ready: true,
  started_at: '2026-10-13T08:00:00+07:00',
};
type Owner = { actorId: string; authSessionId: string; warehouseId: string };
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline-only',
    userId: identity.id,
    authSessionId: identity.auth_session_id,
  });
  resetShiftState();
});
afterEach(() => {
  clearSession();
  resetShiftState();
});
async function mount(
  options: {
    fetchUser?: () => Promise<CurrentUser>;
    switchContext?: (input: Owner) => Promise<CurrentUser>;
    fetchShift?: () => Promise<WorkShift | null>;
    startShift?: (input: Owner, key: string) => Promise<WorkShift>;
    contextEnabled?: boolean;
  } = {},
) {
  let me = required;
  const order: string[] = [];
  const fetchUser = jest.fn(async () => {
    order.push('me');
    return options.fetchUser ? options.fetchUser() : me;
  });
  const switchContext = jest.fn(async (input: Owner) => {
    order.push('context');
    const result = options.switchContext
      ? await options.switchContext(input)
      : ready;
    if (
      result.id === identity.id &&
      result.auth_session_id === identity.auth_session_id &&
      result.active_warehouse_id === wid
    ) {
      me = result;
      if (
        getSession()?.userId === identity.id &&
        getSession()?.authSessionId === identity.auth_session_id
      )
        setSession({ ...getSession()!, activeWarehouseId: wid });
    }
    return result;
  });
  const fetchShift = jest.fn(async () => {
    order.push('current');
    return options.fetchShift ? options.fetchShift() : null;
  });
  const startShift = jest.fn(async (input: Owner, key: string) => {
    order.push('start');
    expect(readPendingWorkShiftStart()).toMatchObject({
      ...input,
      idempotencyKey: key,
      body: { warehouse_id: wid },
      outcome: 'IN_FLIGHT',
    });
    return options.startShift ? options.startShift(input, key) : shift;
  });
  const onContinue = jest.fn(),
    onIdentityResolved = jest.fn(),
    onLoggedOut = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <SessionConfirmationScreen
          contextEnabled={options.contextEnabled ?? true}
          fetchUser={fetchUser}
          switchContext={switchContext}
          fetchShift={fetchShift}
          fetchWarehouses={async () => ({
            items: [{ id: wid, name: 'Kho được cấp', status: 'ACTIVE' }],
          })}
          startShift={startShift}
          onContinue={onContinue}
          onIdentityResolved={onIdentityResolved}
          logoutFn={async () => undefined}
          onLoggedOut={onLoggedOut}
        />
      </AppProviders>,
    );
  });
  const button = (label: string) =>
    tree.root
      .findAllByType(Button)
      .find(n => (n.props.accessibilityLabel ?? n.props.label) === label)!;
  const dispose = () => Renderer.act(() => tree.unmount());
  return {
    tree,
    order,
    button,
    dispose,
    fetchUser,
    switchContext,
    fetchShift,
    startShift,
    onContinue,
    onIdentityResolved,
    onLoggedOut,
  };
}
describe('P01 LOCKED S02 unique warehouse, explicit combined CTA', () => {
  it('shows BE grant, only START/logout, no context/current/START/key on mount', async () => {
    const v = await mount(),
      text = JSON.stringify(v.tree.toJSON());
    expect(text).toContain('Kho được cấp');
    expect(text).not.toContain('Chọn kho làm việc');
    expect(text).not.toContain('Xác nhận kho làm việc');
    expect(v.tree.root.findAllByType(Button).map(b => b.props.label)).toEqual([
      'Bắt đầu ca làm việc',
      'Đăng xuất',
    ]);
    expect(v.button('Bắt đầu ca').props.disabled).toBe(false);
    expect(v.switchContext).not.toHaveBeenCalled();
    expect(v.fetchShift).not.toHaveBeenCalled();
    expect(v.startShift).not.toHaveBeenCalled();
    expect(readPendingWorkShiftStart()).toBeUndefined();
    v.dispose();
  });
  it('one deliberate click confirms context, rereads me/current then START once', async () => {
    const v = await mount();
    await Renderer.act(async () => {
      await v.button('Bắt đầu ca').props.onPress();
    });
    expect(v.order).toEqual(['me', 'context', 'me', 'current', 'start']);
    expect(v.switchContext).toHaveBeenCalledWith({
      actorId: identity.id,
      authSessionId: identity.auth_session_id,
      warehouseId: wid,
    });
    expect(v.startShift).toHaveBeenCalledTimes(1);
    expect(v.onContinue).toHaveBeenCalledWith(shift);
    expect(readPendingWorkShiftStart()).toBeUndefined();
    v.dispose();
  });
  it.each([
    ['no grants', { available_warehouses: undefined }],
    ['empty grants', { available_warehouses: [] }],
    [
      'inactive',
      { available_warehouses: [{ ...granted, status: 'INACTIVE' }] },
    ],
    [
      'invalid UUID',
      { available_warehouses: [{ ...granted, warehouse_id: 'bad' }] },
    ],
    ['missing actor', { id: undefined }],
    ['missing session', { auth_session_id: undefined }],
    [
      'two active',
      {
        available_warehouses: [granted, { ...granted, warehouse_id: otherWid }],
      },
    ],
    ['duplicate active rows', { available_warehouses: [granted, granted] }],
    [
      'active malformed extra',
      { available_warehouses: [granted, { ...granted, warehouse_id: 'bad' }] },
    ],
  ] as const)(
    'blocks %s without choosing first or sending writes',
    async (_label, patch) => {
      const v = await mount({
        fetchUser: async () => ({ ...required, ...patch }),
      });
      expect(v.button('Bắt đầu ca').props.disabled).toBe(true);
      await Renderer.act(async () => {
        await v.button('Bắt đầu ca').props.onPress();
      });
      expect(v.switchContext).not.toHaveBeenCalled();
      expect(v.startShift).not.toHaveBeenCalled();
      expect(readPendingWorkShiftStart()).toBeUndefined();
      expect(JSON.stringify(v.tree.toJSON())).not.toContain(
        'Chọn kho làm việc',
      );
      v.dispose();
    },
  );
  it('closed context gate blocks combined CTA', async () => {
    const v = await mount({ contextEnabled: false });
    expect(v.button('Bắt đầu ca').props.disabled).toBe(true);
    expect(v.switchContext).not.toHaveBeenCalled();
    v.dispose();
  });
  it('one ACTIVE grant plus INACTIVE grants uses only the ACTIVE warehouse', async () => {
    let me: CurrentUser = {
      ...required,
      available_warehouses: [
        { ...granted, warehouse_id: otherWid, status: 'INACTIVE' },
        granted,
      ],
    };
    const v = await mount({
      fetchUser: async () => me,
      switchContext: async input => {
        expect(input.warehouseId).toBe(wid);
        me = ready;
        return ready;
      },
    });
    await Renderer.act(async () => {
      await v.button('Bắt đầu ca').props.onPress();
    });
    expect(v.onContinue).toHaveBeenCalledWith(shift);
    v.dispose();
  });
  it('current read failure after confirmed context does not create or send START', async () => {
    const v = await mount({
      fetchShift: async () => {
        throw new AppError({ kind: 'network', message: 'read unavailable' });
      },
    });
    await Renderer.act(async () => {
      await v.button('Bắt đầu ca').props.onPress();
    });
    expect(v.switchContext).toHaveBeenCalledTimes(1);
    expect(v.startShift).not.toHaveBeenCalled();
    expect(readPendingWorkShiftStart()).toBeUndefined();
    v.dispose();
  });
  it('old same-family START intent for another warehouse blocks context mutation', async () => {
    const original = {
      actorId: identity.id,
      authSessionId: identity.auth_session_id,
      warehouseId: otherWid,
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      body: { warehouse_id: otherWid },
      outcome: 'UNKNOWN',
    };
    getAppStorage().setObject('work-shift.start.pending', original);
    const v = await mount();
    await Renderer.act(async () => {
      await v.button('Bắt đầu ca').props.onPress();
    });
    expect(v.switchContext).not.toHaveBeenCalled();
    expect(v.startShift).not.toHaveBeenCalled();
    expect(readPendingWorkShiftStart()).toEqual(original);
    v.dispose();
  });
  it('context failure preserves an existing original START UNKNOWN journal unchanged', async () => {
    const original = {
      actorId: identity.id,
      authSessionId: identity.auth_session_id,
      warehouseId: wid,
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      body: { warehouse_id: wid },
      outcome: 'UNKNOWN',
    };
    getAppStorage().setObject('work-shift.start.pending', original);
    const v = await mount({
      switchContext: async () => {
        throw new AppError({ kind: 'timeout', message: 'context uncertain' });
      },
    });
    await Renderer.act(async () => {
      await v.button('Bắt đầu ca').props.onPress();
    });
    expect(v.startShift).not.toHaveBeenCalled();
    expect(readPendingWorkShiftStart()).toEqual(original);
    v.dispose();
  });
  it('READY context does not switch or insist on choosing again', async () => {
    const v = await mount({ fetchUser: async () => ready });
    await Renderer.act(async () => {
      await v.button('Bắt đầu ca').props.onPress();
    });
    expect(v.switchContext).not.toHaveBeenCalled();
    expect(v.startShift).toHaveBeenCalledTimes(1);
    v.dispose();
  });
  it('ACTIVE current after context confirmation restores same shift, no START/key', async () => {
    const v = await mount({ fetchShift: async () => shift });
    await Renderer.act(async () => {
      await v.button('Bắt đầu ca').props.onPress();
    });
    expect(v.order).toEqual(['me', 'context', 'me', 'current']);
    expect(v.onContinue).toHaveBeenCalledWith(shift);
    expect(v.startShift).not.toHaveBeenCalled();
    expect(readPendingWorkShiftStart()).toBeUndefined();
    v.dispose();
  });
  it('another-session current cannot be used or followed by START', async () => {
    const v = await mount({
      fetchShift: async () => ({ ...shift, auth_session_id: 'other' }),
    });
    await Renderer.act(async () => {
      await v.button('Bắt đầu ca').props.onPress();
    });
    expect(v.startShift).not.toHaveBeenCalled();
    expect(v.onContinue).not.toHaveBeenCalled();
    expect(readPendingWorkShiftStart()).toBeUndefined();
    v.dispose();
  });
  it.each(['ack', 'readback'] as const)(
    'wrong %s owner prevents current/START/key',
    async part => {
      let reads = 0;
      const v = await mount({
        fetchUser: async () =>
          ++reads === 1 ? required : { ...ready, auth_session_id: 'other' },
        switchContext: async () =>
          part === 'ack' ? { ...ready, auth_session_id: 'other' } : ready,
      });
      await Renderer.act(async () => {
        await v.button('Bắt đầu ca').props.onPress();
      });
      expect(v.fetchShift).not.toHaveBeenCalled();
      expect(v.startShift).not.toHaveBeenCalled();
      expect(v.onContinue).not.toHaveBeenCalled();
      expect(readPendingWorkShiftStart()).toBeUndefined();
      v.dispose();
    },
  );
  it.each(['timeout', 'denied'] as const)(
    'context %s is not START result, no START journal',
    async kind => {
      const v = await mount({
        switchContext: async () => {
          throw new AppError({
            kind: kind === 'timeout' ? 'timeout' : 'http',
            status: kind === 'denied' ? 403 : undefined,
            message: 'context failed',
          });
        },
      });
      await Renderer.act(async () => {
        await v.button('Bắt đầu ca').props.onPress();
      });
      expect(v.switchContext).toHaveBeenCalledTimes(1);
      expect(v.fetchShift).not.toHaveBeenCalled();
      expect(v.startShift).not.toHaveBeenCalled();
      expect(readPendingWorkShiftStart()).toBeUndefined();
      v.dispose();
    },
  );
  it('double tap during context sends one context and START', async () => {
    let finish!: (u: CurrentUser) => void;
    const v = await mount({
      switchContext: () =>
        new Promise(r => {
          finish = r;
        }),
    });
    await Renderer.act(async () => {
      const press = v.button('Bắt đầu ca').props.onPress;
      press();
      press();
    });
    expect(v.switchContext).toHaveBeenCalledTimes(1);
    expect(v.startShift).not.toHaveBeenCalled();
    await Renderer.act(async () => {
      finish(ready);
    });
    expect(v.startShift).toHaveBeenCalledTimes(1);
    v.dispose();
  });
  it.each(['logout', 'unmount', 'new-identity'] as const)(
    'late context after %s never STARTs',
    async change => {
      let finish!: (u: CurrentUser) => void;
      const v = await mount({
        switchContext: () =>
          new Promise(r => {
            finish = r;
          }),
      });
      await Renderer.act(async () => {
        v.button('Bắt đầu ca').props.onPress();
      });
      await Renderer.act(async () => {
        if (change === 'logout') v.button('Đăng xuất').props.onPress();
        else if (change === 'unmount') v.tree.unmount();
        else
          setSession({
            accessToken: 'other-offline',
            userId: 'other',
            authSessionId: 'other',
          });
        finish(ready);
      });
      expect(v.fetchShift).not.toHaveBeenCalled();
      expect(v.startShift).not.toHaveBeenCalled();
      expect(v.onContinue).not.toHaveBeenCalled();
      expect(readPendingWorkShiftStart()).toBeUndefined();
      if (change !== 'unmount') v.dispose();
    },
  );
  it('START timeout keeps original key/body; retry never switches again', async () => {
    const v = await mount({
      startShift: async () => {
        throw new AppError({ kind: 'timeout', message: 'unknown' });
      },
    });
    await Renderer.act(async () => {
      await v.button('Bắt đầu ca').props.onPress();
    });
    const original = readPendingWorkShiftStart()!;
    expect(original.outcome).toBe('UNKNOWN');
    expect(original.body).toEqual({ warehouse_id: wid });
    await Renderer.act(async () => {
      await v.button('Bắt đầu ca').props.onPress();
    });
    expect(v.switchContext).toHaveBeenCalledTimes(1);
    expect(v.startShift).toHaveBeenCalledTimes(2);
    expect(v.startShift.mock.calls[0][1]).toBe(v.startShift.mock.calls[1][1]);
    expect(readPendingWorkShiftStart()?.idempotencyKey).toBe(
      original.idempotencyKey,
    );
    v.dispose();
  });
  it('unresolved END blocks before context writes and START', async () => {
    getAppStorage().setObject(
      'shift.end.check-only:' +
        JSON.stringify({
          actorId: identity.id,
          authSessionId: identity.auth_session_id,
          warehouseId: wid,
        }),
      { original: true },
    );
    const v = await mount();
    await Renderer.act(async () => {
      await v.button('Bắt đầu ca').props.onPress();
    });
    expect(v.switchContext).not.toHaveBeenCalled();
    expect(v.startShift).not.toHaveBeenCalled();
    expect(readPendingWorkShiftStart()).toBeUndefined();
    v.dispose();
  });
});
