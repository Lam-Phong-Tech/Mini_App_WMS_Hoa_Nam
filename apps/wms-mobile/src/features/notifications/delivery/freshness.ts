import {
  isDeliveryOwnerCurrent,
  type captureDeliveryOwner,
} from './ownerScope';
export interface NotificationFreshness {
  owner: ReturnType<typeof captureDeliveryOwner>;
  unreadCount: number;
  dataChanged: boolean;
}
const listeners = new Set<(event: NotificationFreshness) => void>();
export function publishNotificationFreshness(
  owner: ReturnType<typeof captureDeliveryOwner>,
  unreadCount: number,
  dataChanged = false,
) {
  if (
    !isDeliveryOwnerCurrent(owner) ||
    !Number.isSafeInteger(unreadCount) ||
    unreadCount < 0
  )
    return;
  const event = {
    owner: {
      generation: owner.generation,
      userId: owner.userId,
      authSessionId: owner.authSessionId,
    },
    unreadCount,
    dataChanged,
  };
  listeners.forEach(f => f(event));
}
export function subscribeNotificationFreshness(
  f: (event: NotificationFreshness) => void,
) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}
