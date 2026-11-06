import React, { useState } from 'react';
import R, { act } from 'react-test-renderer';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { NotificationDeliverySettings } from '../src/features/notifications/delivery/NotificationDeliverySettings';
import { Dialog } from '../src/ui/Dialog';
import { Button } from '../src/ui/Button';

const base = {
  state: { phase: 'unavailable', message: 'Thông báo đang OFF' },
  enable: () => {},
  disable: () => {},
  refresh: () => {},
  selfTest: () => {},
};
test('OFF native diagnostic is explicit and keeps settings open with the readback result', async () => {
  let tree!: R.ReactTestRenderer,
    count = 0;
  function Host() {
    const [message, setMessage] = useState('');
    const model: any = {
      ...base,
      diagnose: () => {
        count++;
        setMessage('Đã xác minh chẩn đoán · Request-ID TEST-RID');
      },
      diagnosticMessage: message,
    };
    return (
      <ThemeProvider>
        <NotificationDeliverySettings model={model} />
      </ThemeProvider>
    );
  }
  await act(async () => {
    tree = R.create(<Host />);
  });
  expect(count).toBe(0);
  await act(async () => {
    tree.root
      .findAll(
        n =>
          n.props.accessibilityLabel === 'Thông báo thiết bị' &&
          typeof n.props.onPress === 'function',
      )[0]
      .props.onPress();
  });
  await act(async () => {
    tree.root
      .findAllByType(Button)
      .find(n => n.props.label === 'Chẩn đoán FCM (chỉ đọc)')!
      .props.onPress();
  });
  expect(count).toBe(1);
  expect(tree.root.findByType(Dialog).props.visible).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain('Request-ID TEST-RID');
  await act(async () => tree.unmount());
});
test('diagnostic cannot be tapped during its own pending read', async () => {
  let tree!: R.ReactTestRenderer;
  await act(async () => {
    tree = R.create(
      <ThemeProvider>
        <NotificationDeliverySettings
          model={{ ...base, diagnose: () => {}, diagnosticBusy: true } as any}
        />
      </ThemeProvider>,
    );
  });
  await act(async () => {
    tree.root
      .findAll(
        n =>
          n.props.accessibilityLabel === 'Thông báo thiết bị' &&
          typeof n.props.onPress === 'function',
      )[0]
      .props.onPress();
  });
  expect(
    tree.root
      .findAllByType(Button)
      .find(n => n.props.label === 'Chẩn đoán FCM (chỉ đọc)')?.props.disabled,
  ).toBe(true);
  await act(async () => tree.unmount());
});
test('legacy Web model has no native diagnostic action', async () => {
  let tree!: R.ReactTestRenderer;
  await act(async () => {
    tree = R.create(
      <ThemeProvider>
        <NotificationDeliverySettings model={base as any} />
      </ThemeProvider>,
    );
  });
  await act(async () => {
    tree.root
      .findAll(
        n =>
          n.props.accessibilityLabel === 'Thông báo thiết bị' &&
          typeof n.props.onPress === 'function',
      )[0]
      .props.onPress();
  });
  expect(
    tree.root
      .findAllByType(Button)
      .some(n => n.props.label === 'Chẩn đoán FCM (chỉ đọc)'),
  ).toBe(false);
  await act(async () => tree.unmount());
});
test('OFF settings exposes GET-only reconciliation for a verified pending original TEST', async () => {
  let tree!: R.ReactTestRenderer;
  await act(async () => {
    tree = R.create(
      <ThemeProvider>
        <NotificationDeliverySettings
          model={
            {
              ...base,
              state: {
                phase: 'unavailable',
                message: 'OFF',
                canDisable: true,
                canReconcile: true,
                selfTestEnabled: false,
              },
            } as any
          }
        />
      </ThemeProvider>,
    );
  });
  await act(async () => {
    tree.root
      .findAll(
        n =>
          n.props.accessibilityLabel === 'Thông báo thiết bị' &&
          typeof n.props.onPress === 'function',
      )[0]
      .props.onPress();
  });
  const labels = tree.root.findAllByType(Button).map(n => n.props.label);
  expect(labels).toContain('Đối chiếu lần gửi thử');
  expect(labels).not.toContain('Gửi thử đến thiết bị này');
  await act(async () => tree.unmount());
});
