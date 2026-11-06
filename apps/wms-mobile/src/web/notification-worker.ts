/// <reference lib="webworker" />
import { decodePushPayload } from '../features/notifications/delivery/parse';
import {
  pushClickUrl,
  pushClientEligible,
} from '../features/notifications/delivery/pushPolicy';
import { bindingMatches } from '../features/notifications/delivery/pushPolicy';
import {
  claimPush,
  readPushBinding,
  storePushClick,
} from './notificationPushStore';
import {
  receiveBackgroundPush,
  handlePushClick,
} from './notificationWorkerHandler';
import config from './firebasePublicConfig.json';
declare const self: ServiceWorkerGlobalScope;
// Install click ownership before Firebase installs its default click handler.
self.addEventListener('notificationclick', event => {
  if (event.notification.data?.type !== 'HN_NOTIFICATION') return;
  event.stopImmediatePropagation();
  event.notification.close();
  event.waitUntil(
    handlePushClick(event.notification.data.payload, {
      origin: self.location.origin,
      readBinding: readPushBinding,
      storeClick: storePushClick,
      clients: async () =>
        (await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        })) as WindowClient[],
      openWindow: url => self.clients.openWindow(url),
    }),
  );
});
// No fetch/cache handlers. The worker never reads or refreshes business auth.
if (self.location.origin === 'https://appqr.lptech.info.vn')
  void (async () => {
    const [{ initializeApp }, { getMessaging, onBackgroundMessage }] =
      await Promise.all([
        import('firebase/app'),
        import('firebase/messaging/sw'),
      ]);
    const app = initializeApp(config, 'hn-notification-worker');
    onBackgroundMessage(getMessaging(app), payload =>
      receiveBackgroundPush(payload, {
        claim: claimPush,
        show: (t, o) => self.registration.showNotification(t, o),
      }),
    );
  })();
