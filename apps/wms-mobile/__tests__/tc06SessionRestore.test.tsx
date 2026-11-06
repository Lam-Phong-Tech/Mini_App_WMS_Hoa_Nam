import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { AppProviders } from '../src/app/App';
import { SessionConfirmationScreen } from '../src/features/auth/SessionConfirmationScreen';
import { Button } from '../src/ui/Button';
import { AppError } from '../src/errors/AppError';
import type { CurrentUser } from '../src/services/wms/types';
import type { WorkShift } from '../src/services/wms/workShift';

const warehouse = '11111111-1111-4111-8111-111111111111';
const user: CurrentUser = {
  id: '22222222-2222-4222-8222-222222222222',
  auth_session_id: '33333333-3333-4333-8333-333333333333',
  active_warehouse_id: warehouse,
  warehouse_context: { status: 'READY' },
  name: 'Người kiểm thử',
};
const shift: WorkShift = {
  shift_id: '44444444-4444-4444-8444-444444444444',
  actor_id: user.id!,
  auth_session_id: user.auth_session_id!,
  warehouse_id: warehouse,
  status: 'ACTIVE',
  preview_ready: true,
  started_at: '2026-10-18T09:00:00+07:00',
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let tree: Renderer.ReactTestRenderer | undefined;
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
});

async function mount(restoring = true) {
  const me = deferred<CurrentUser>();
  const current = deferred<WorkShift | null>();
  const start = jest.fn();
  const context = jest.fn();
  const ready = jest.fn();
  const fetchMe = () => me.promise;
  const fetchCurrent = () => current.promise;
  const warehouses = async () => ({
    items: [{ id: warehouse, name: 'Kho TEST', status: 'ACTIVE' }],
  });
  function Harness() {
    const [home, setHome] = React.useState(false);
    return home ? (
      <Text>Home đã được owner xác nhận</Text>
    ) : (
      <SessionConfirmationScreen
        restoring={restoring}
        fetchUser={fetchMe}
        fetchShift={fetchCurrent}
        fetchWarehouses={warehouses}
        startShift={start}
        switchContext={context}
        onContinue={value => {
          ready(value);
          setHome(true);
        }}
        onLoggedOut={() => undefined}
      />
    );
  }
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <Harness />
      </AppProviders>,
    );
  });
  return { me, current, start, context, ready };
}
const text = () => JSON.stringify(tree!.toJSON());
const startButtons = () =>
  tree!.root
    .findAllByType(Button)
    .filter(b => b.props.accessibilityLabel === 'Bắt đầu ca');

test('TC06 restore waits neutrally for both owner reads, then opens exact ACTIVE without a new START', async () => {
  const v = await mount();
  expect(text()).toContain('Đang khôi phục ca làm việc');
  expect(text()).not.toContain('Sẵn sàng bắt đầu');
  expect(startButtons()).toHaveLength(0);
  await act(async () => v.me.resolve(user));
  expect(text()).toContain('Đang khôi phục ca làm việc');
  await act(async () => v.current.resolve(shift));
  expect(text()).toContain('Home đã được owner xác nhận');
  expect(v.ready).toHaveBeenCalledWith(shift);
  expect(v.start).not.toHaveBeenCalled();
  expect(v.context).not.toHaveBeenCalled();
});

test('TC06 current null reveals the real confirmation; it is not ACTIVE proof or auto START', async () => {
  const v = await mount();
  await act(async () => {
    v.me.resolve(user);
    v.current.resolve(null);
  });
  expect(text()).not.toContain('Đang khôi phục ca làm việc');
  expect(startButtons()).toHaveLength(1);
  expect(v.ready).not.toHaveBeenCalled();
  expect(v.start).not.toHaveBeenCalled();
});

test('TC06 owner failure stays visible and does not open Home or dispatch commands', async () => {
  const v = await mount();
  await act(async () => v.me.resolve(user));
  await act(async () =>
    v.current.reject(
      new AppError({ kind: 'network', message: 'Owner đang mất kết nối' }),
    ),
  );
  expect(text()).toContain('Không tải được thông tin tài khoản');
  expect(v.ready).not.toHaveBeenCalled();
  expect(v.start).not.toHaveBeenCalled();
});

test('TC06 foreign current cannot restore Home', async () => {
  const v = await mount();
  await act(async () => {
    v.me.resolve(user);
    v.current.resolve({ ...shift, auth_session_id: 'another-family' });
  });
  expect(v.ready).not.toHaveBeenCalled();
  expect(text()).not.toContain('Home đã được owner xác nhận');
  expect(v.start).not.toHaveBeenCalled();
});

test('TC06 fresh login keeps the locked confirmation, not the saved-session loading view', async () => {
  const v = await mount(false);
  expect(text()).toContain('Sẵn sàng bắt đầu');
  expect(text()).not.toContain('Đang khôi phục ca làm việc');
  expect(startButtons()).toHaveLength(1);
  expect(v.start).not.toHaveBeenCalled();
});

test('TC06 an unmounted restore never publishes a late Home', async () => {
  const v = await mount();
  await act(async () => tree!.unmount());
  tree = undefined;
  await act(async () => {
    v.me.resolve(user);
    v.current.resolve(shift);
  });
  expect(v.ready).not.toHaveBeenCalled();
});
