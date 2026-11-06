import type {
  DeliveryCapabilities,
  PushPlatform,
  PushPermission,
} from '../features/notifications/delivery/types';
import { FCM_PROJECT_ID } from '../features/notifications/delivery/types';
import {
  claimPush,
  clearPushBinding,
  consumePushClick,
  installationIdentity,
  readPushBinding,
  storePushBinding,
  readPushTestIntent,
  storePushTestIntent,
} from '../web/notificationPushStore';
import { decodePushPayload } from '../features/notifications/delivery/parse';
const messages = new Set<(data: unknown) => void>(),
  clicks = new Set<(data: unknown) => void>();
let sdkStop: (() => void) | undefined;
const allowed = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  window.location.origin === 'https://appqr.lptech.info.vn' &&
  window.location.pathname === '/' &&
  new URLSearchParams(window.location.search).get('view') !== 'review';
async function support(): Promise<PushPermission> {
  if (
    !allowed() ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('indexedDB' in window)
  )
    return 'unsupported';
  const { isSupported } = await import('firebase/messaging');
  return (await isSupported()) ? Notification.permission : 'unsupported';
}
let clickListening = false;
function attachClicks() {
  if (
    clickListening ||
    typeof navigator === 'undefined' ||
    !navigator.serviceWorker
  )
    return;
  clickListening = true;
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'HN_NOTIFICATION_CLICK' && clicks.size)
      void consumePushClick()
        .then(d => {
          if (d) clicks.forEach(f => f(d));
        })
        .catch(() => undefined);
  });
}
export const notificationPush: PushPlatform = {
  configurationReady: cap =>
    allowed() &&
    cap.enabled &&
    cap.projectId === FCM_PROJECT_ID &&
    cap.webConfig.projectId === FCM_PROJECT_ID &&
    cap.webConfig.appId === '1:57106079765:web:e996ecac38d01a7b60ee1c' &&
    cap.webConfig.messagingSenderId === '57106079765' &&
    !!cap.webConfig.apiKey &&
    cap.allowedWebOrigins.includes(window.location.origin) &&
    typeof cap.vapidPublicKey === 'string' &&
    /^[A-Za-z0-9_-]{80,100}$/.test(cap.vapidPublicKey),
  platform: 'WEB',
  support,
  requestPermission: () =>
    allowed() && 'Notification' in window
      ? Notification.requestPermission()
      : Promise.resolve('unsupported'),
  identity: installationIdentity,
  getBinding: readPushBinding,
  storeBinding: storePushBinding,
  clearBinding: clearPushBinding,
  newRequestKey: async () => crypto.randomUUID(),
  readTestIntent: readPushTestIntent,
  storeTestIntent: storePushTestIntent,
  token: async (cap: DeliveryCapabilities) => {
    if (
      !allowed() ||
      !cap.enabled ||
      cap.projectId !== FCM_PROJECT_ID ||
      cap.webConfig.projectId !== FCM_PROJECT_ID ||
      !cap.allowedWebOrigins.includes(window.location.origin) ||
      !cap.vapidPublicKey ||
      (await support()) !== 'granted'
    )
      throw Error('Notification not configured');
    const [{ initializeApp, getApps }, { getMessaging, getToken, onMessage }] =
      await Promise.all([import('firebase/app'), import('firebase/messaging')]);
    const app =
      getApps().find(a => a.name === 'hn-notifications') ??
      initializeApp(cap.webConfig, 'hn-notifications');
    if (app.options.appId !== cap.webConfig.appId)
      throw Error('Notification project changed');
    const registration = await navigator.serviceWorker.register(
      '/firebase-messaging-sw.js',
      { scope: '/' },
    );
    await navigator.serviceWorker.ready;
    const messaging = getMessaging(app);
    sdkStop?.();
    sdkStop = onMessage(messaging, async payload => {
      const p = decodePushPayload(payload.data);
      if (p && (await claimPush(p))) messages.forEach(f => f(payload.data));
    });
    return getToken(messaging, {
      vapidKey: cap.vapidPublicKey,
      serviceWorkerRegistration: registration,
    });
  },
  onMessage: f => {
    messages.add(f);
    return () => messages.delete(f);
  },
  onClick: f => {
    clicks.add(f);
    attachClicks();
    if (allowed())
      void consumePushClick()
        .then(d => {
          if (d && clicks.has(f)) f(d);
        })
        .catch(() => undefined);
    return () => clicks.delete(f);
  },
};
