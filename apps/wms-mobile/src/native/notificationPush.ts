import {
  NativeModules,
  NativeEventEmitter,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import type {
  DeliveryBinding,
  InstallationIdentity,
  PushPlatform,
  PushPermission,
} from '../features/notifications/delivery/types';
import {
  FCM_ANDROID_PACKAGE,
  FCM_PROJECT_ID,
} from '../features/notifications/delivery/types';
type Bridge = {
  support(): Promise<PushPermission>;
  requestPermission(): Promise<PushPermission>;
  identity(): Promise<InstallationIdentity>;
  token(): Promise<string>;
  getBinding(): Promise<DeliveryBinding | null>;
  storeBinding(b: DeliveryBinding): Promise<void>;
  clearBinding(b: DeliveryBinding): Promise<boolean>;
  newRequestKey(): Promise<string>;
  consumeClick(): Promise<unknown>;
  readTestIntent(): Promise<{
    requestKey: string;
    binding: DeliveryBinding;
  } | null>;
  storeTestIntent(value: {
    requestKey: string;
    binding: DeliveryBinding;
  }): Promise<void>;
  addListener(e: string): void;
  removeListeners(n: number): void;
};
const bridge = () => NativeModules.HnNotificationPush as Bridge | undefined;
const required = () => {
  const b = bridge();
  if (!b) throw Error('Notification native module not configured');
  return b;
};
const listen = (name: string, f: (v: unknown) => void) => {
  const b = bridge();
  if (!b) return () => {};
  const event = new NativeEventEmitter(b).addListener(name, f);
  return () => event.remove();
};
export const notificationPush: PushPlatform = {
  platform: 'ANDROID',
  onTokenChange: f => listen('HnNotificationToken', f),
  readTestIntent: async () => bridge()?.readTestIntent() ?? null,
  storeTestIntent: value => required().storeTestIntent(value),
  support: async () => bridge()?.support() ?? 'not-configured',
  requestPermission: async () => {
    if (!bridge()) return 'not-configured';
    if (Number(Platform.Version) >= 33) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) return 'denied';
    }
    return required().support();
  },
  identity: () => required().identity(),
  getBinding: async () => bridge()?.getBinding() ?? null,
  storeBinding: b => required().storeBinding(b),
  clearBinding: async b => bridge()?.clearBinding(b) ?? false,
  newRequestKey: () => required().newRequestKey(),
  token: async c => {
    if (
      !c.enabled ||
      c.projectId !== FCM_PROJECT_ID ||
      c.androidPackage !== FCM_ANDROID_PACKAGE
    )
      throw Error('Notification not configured');
    return required().token();
  },
  onMessage: f => listen('HnNotificationMessage', f),
  onClick: f => {
    const consume = () => {
      void bridge()
        ?.consumeClick()
        .then(d => {
          if (d) f(d);
        })
        .catch(() => undefined);
    };
    const stop = listen('HnNotificationClick', consume);
    void bridge()
      ?.consumeClick()
      .then(d => {
        if (d) f(d);
      })
      .catch(() => undefined);
    return stop;
  },
};
