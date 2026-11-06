import { NativeModules, DeviceEventEmitter } from 'react-native';
let platform: any;
try {
  platform = require('../src/native/notificationPush').notificationPush;
} catch (e) {
  if (!String((e as any)?.message ?? e).includes('native/notificationPush'))
    throw e;
}
test('missing native FCM is unavailable; no automatic prompt or fake token', async () => {
  expect(platform).toBeDefined();
  delete NativeModules.HnNotificationPush;
  expect(await platform.support()).toBe('not-configured');
  await expect(platform.token({ enabled: true })).rejects.toThrow();
});
test('native click consumes persisted intent exactly once instead of relying on an unobserved event', async () => {
  const received: any[] = [];
  let pending: any = null;
  NativeModules.HnNotificationPush = {
    addListener: () => {},
    removeListeners: () => {},
    consumeClick: jest.fn(async () => {
      const d = pending;
      pending = null;
      return d;
    }),
  };
  const stop = platform.onClick((v: any) => received.push(v));
  await Promise.resolve();
  pending = {
    contract: 'notification-delivery-v1',
    recipient_id: 'TEST-UUID-ONLY-FIXTURE',
  };
  DeviceEventEmitter.emit('HnNotificationClick', {});
  await Promise.resolve();
  await Promise.resolve();
  expect(received).toEqual([
    {
      contract: 'notification-delivery-v1',
      recipient_id: 'TEST-UUID-ONLY-FIXTURE',
    },
  ]);
  expect(pending).toBeNull();
  stop();
  delete NativeModules.HnNotificationPush;
});
