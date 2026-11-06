/// <reference lib="dom" />
import {
  decodePushPayload,
  deliveryRecord,
} from '../features/notifications/delivery/parse';
import {
  PUSH_TITLE,
  PUSH_BODY,
} from '../features/notifications/delivery/pushPolicy';
import type { PushPayload } from '../features/notifications/delivery/types';
import { decodePushClick } from '../features/notifications/delivery/parse';
import {
  bindingMatches,
  pushClientEligible,
  pushClickUrl,
} from '../features/notifications/delivery/pushPolicy';
import type { DeliveryBinding } from '../features/notifications/delivery/types';
export async function handlePushClick(
  raw: unknown,
  deps: {
    origin: string;
    readBinding(): Promise<DeliveryBinding | null>;
    storeClick(d: unknown): Promise<void>;
    clients(): Promise<
      readonly {
        url: string;
        postMessage(d: unknown): void;
        focus(): Promise<unknown>;
      }[]
    >;
    openWindow(url: string): Promise<unknown>;
  },
) {
  const p = decodePushClick(raw);
  if (
    !p ||
    deps.origin !== 'https://appqr.lptech.info.vn' ||
    !bindingMatches(await deps.readBinding(), p)
  )
    return;
  await deps.storeClick(raw);
  const target = (await deps.clients()).find(c =>
    pushClientEligible(c.url, deps.origin),
  );
  if (target) {
    target.postMessage({ type: 'HN_NOTIFICATION_CLICK', data: raw });
    try {
      await target.focus();
    } catch {
      /* Persisted intent remains available after login. */
    }
  } else await deps.openWindow(pushClickUrl(p.recipientId, deps.origin));
}
export async function receiveBackgroundPush(
  input: unknown,
  deps: {
    claim(p: PushPayload): Promise<boolean>;
    show(title: string, options: NotificationOptions): Promise<void>;
  },
): Promise<void> {
  const data = deliveryRecord(input);
  if (data.notification) return;
  const p = decodePushPayload(data.data);
  if (!p || !(await deps.claim(p))) return;
  await deps.show(PUSH_TITLE, {
    body: PUSH_BODY,
    tag: 'hn:' + p.recipientId,
    data: { type: 'HN_NOTIFICATION', payload: data.data },
  });
}
