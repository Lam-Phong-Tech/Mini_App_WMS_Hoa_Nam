import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
let publish: any;
try {
  publish =
    require('../src/features/notifications/delivery/ForegroundNotification').publishForegroundNotification;
} catch (e) {
  if (!String((e as any)?.message ?? e).includes('ForegroundNotification'))
    throw e;
}
test('foreground signal shows generic feedback and opens only after explicit click', async () => {
  expect(typeof publish).toBe('function');
  const open = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <></>
      </AppProviders>,
    );
  });
  await act(async () => publish(open));
  expect(open).not.toHaveBeenCalled();
  const button = tree.root.findAll(
    n =>
      n.props.accessibilityLabel === 'Xem thông báo mới' &&
      typeof n.props.onPress === 'function',
  )[0];
  expect(button).toBeDefined();
  await act(async () => button.props.onPress());
  expect(open).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
});
