import React from 'react';
import Renderer from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { ShiftLifecycleScreen } from '../src/features/auth/ShiftLifecycleScreen';
import { Button } from '../src/ui/Button';
import { clearSession, setSession } from '../src/auth/session';
import {
  resetShiftState,
  publishShiftState,
  getShiftState,
} from '../src/shift/shiftState';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
  getAppStorage,
} from '../src/storage/storage';
const warehouse = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline-only',
    userId: 'actor',
    authSessionId: 'family',
    activeWarehouseId: warehouse,
  });
  resetShiftState();
});
afterEach(() => {
  clearSession();
});
test('unrouted technical candidate stays gate OFF; this is not app navigation or LOCKED UI acceptance', async () => {
  publishShiftState(null, {
    actorId: 'actor',
    authSessionId: 'family',
    warehouseId: warehouse,
  });
  const next = jest.fn(),
    back = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <ShiftLifecycleScreen onBack={back} onNewShift={next} />
      </AppProviders>,
    );
  });
  const buttons = tree.root.findAllByType(Button);
  expect(
    buttons.find(b => b.props.label === 'Kết thúc ca')?.props.disabled,
  ).toBe(true);
  expect(
    buttons.find(b => b.props.label === 'Kiểm tra điều kiện kết thúc ca')?.props
      .disabled,
  ).toBe(true);
  expect(
    getAppStorage()
      .keys()
      .some(
        k => k.startsWith('shift.end.') || k === 'work-shift.start.pending',
      ),
  ).toBe(false);
  await Renderer.act(async () => {
    buttons
      .find(b => b.props.label === 'Xác nhận ca tiếp theo')!
      .props.onPress();
  });
  expect(next).toHaveBeenCalledTimes(1);
  expect(getShiftState().phase).toBe('NO_SHIFT');
  expect(getAppStorage().keys()).toHaveLength(1); // auth session only
  await Renderer.act(() => tree.unmount());
});
