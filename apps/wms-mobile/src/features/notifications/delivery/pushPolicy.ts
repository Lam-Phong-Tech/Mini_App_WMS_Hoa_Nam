import { deliveryUuid } from './parse';
import type { DeliveryBinding } from './types';
export const PUSH_TITLE = 'Hoa Nam Scanner';
export const PUSH_BODY = 'Bạn có thông báo nghiệp vụ mới.';
export function bindingMatches(
  a: DeliveryBinding | null,
  b: DeliveryBinding,
): boolean {
  return (
    !!a &&
    a.registrationId === b.registrationId &&
    a.bindingVersion === b.bindingVersion
  );
}
export function pushClientEligible(url: string, origin: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.origin === origin &&
      u.pathname === '/' &&
      u.searchParams.get('hn-frame') === '1' &&
      u.searchParams.get('view') !== 'review'
    );
  } catch {
    return false;
  }
}
export function pushClickUrl(recipientId: string, origin: string): string {
  if (!deliveryUuid(recipientId) || origin !== 'https://appqr.lptech.info.vn')
    throw Error('Invalid notification route');
  return origin + '/?hn-frame=1&notificationRecipientId=' + recipientId;
}
