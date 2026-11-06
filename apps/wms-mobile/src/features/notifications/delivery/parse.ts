import { AppError } from '../../../errors/AppError';
import {
  DELIVERY_CONTRACT,
  FCM_PROJECT_ID,
  FCM_ANDROID_PACKAGE,
  type PushPayload,
  type Registration,
  type DeliveryCapabilities,
  type SelfTestReceipt,
} from './types';
export const deliveryRecord = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export const deliveryUuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
export const recordedInstant = (v: unknown): v is string =>
  typeof v === 'string' &&
  /T.*(?:Z|[+-]\d\d:\d\d)$/.test(v) &&
  Number.isFinite(Date.parse(v));
function invalid(): never {
  throw new AppError({
    kind: 'parse',
    code: 'NOTIFICATION_DELIVERY_INVALID_RESPONSE',
    message: 'Đăng ký thông báo chưa được nguồn xác minh.',
  });
}
export function decodePushPayload(
  input: unknown,
  now = Date.now(),
): PushPayload | undefined {
  const d = deliveryRecord(input);
  if (
    Object.keys(d).some(
      k =>
        ![
          'contract',
          'delivery_id',
          'recipient_id',
          'registration_id',
          'binding_version',
          'expires_at',
        ].includes(k),
    ) ||
    d.contract !== DELIVERY_CONTRACT
  )
    return;
  if (
    !deliveryUuid(d.delivery_id) ||
    !deliveryUuid(d.recipient_id) ||
    !deliveryUuid(d.registration_id) ||
    typeof d.binding_version !== 'string' ||
    !/^[1-9]\d*$/.test(d.binding_version) ||
    !Number.isSafeInteger(Number(d.binding_version))
  )
    return;
  if (!recordedInstant(d.expires_at) || Date.parse(d.expires_at) <= now) return;
  return {
    deliveryId: d.delivery_id,
    recipientId: d.recipient_id,
    registrationId: d.registration_id,
    bindingVersion: Number(d.binding_version),
    expiresAt: d.expires_at,
  };
}
/** Delivery TTL limits new display; a later click still uses protected P13. */
export function decodePushClick(input: unknown): PushPayload | undefined {
  return decodePushPayload(input, Number.NEGATIVE_INFINITY);
}
export function decodeRegistration(
  input: unknown,
  etag: string | undefined,
): Registration {
  const d = deliveryRecord(input),
    v = d.binding_version;
  if (
    typeof d.exists !== 'boolean' ||
    typeof d.active !== 'boolean' ||
    !Number.isSafeInteger(v) ||
    (v as number) < 0 ||
    etag !== `"${String(v)}"` ||
    !['OWN', 'OTHER_SESSION', 'UNBOUND'].includes(String(d.ownership))
  )
    invalid();
  if (d.exists) {
    if (
      !deliveryUuid(d.registration_id) ||
      (v as number) < 1 ||
      d.ownership === 'UNBOUND'
    )
      invalid();
  } else if (
    d.registration_id !== null ||
    v !== 0 ||
    d.active !== false ||
    d.ownership !== 'UNBOUND'
  )
    invalid();
  return {
    exists: d.exists as boolean,
    registrationId: d.registration_id as string | null,
    bindingVersion: v as number,
    active: d.active as boolean,
    ownership: d.ownership as Registration['ownership'],
    state:
      typeof d.state === 'string' ? d.state : d.exists ? 'UNKNOWN' : 'UNBOUND',
  };
}
export function decodeCapabilities(input: unknown): DeliveryCapabilities {
  const d = deliveryRecord(input),
    web = deliveryRecord(d.public_web_config);
  if (
    typeof d.enabled !== 'boolean' ||
    d.project_id !== FCM_PROJECT_ID ||
    typeof d.configuration_status !== 'string' ||
    typeof d.self_test_enabled !== 'boolean' ||
    d.android_package !== FCM_ANDROID_PACKAGE
  )
    invalid();
  if (
    !Array.isArray(d.allowed_web_origins) ||
    d.allowed_web_origins.some(v => typeof v !== 'string') ||
    !Array.isArray(d.platforms) ||
    d.platforms.some(v => !['WEB', 'ANDROID'].includes(String(v))) ||
    !(d.vapid_public_key === null || typeof d.vapid_public_key === 'string')
  )
    invalid();
  if (
    d.enabled &&
    (d.configuration_status !== 'CONFIGURED' ||
      web.projectId !== FCM_PROJECT_ID)
  )
    invalid();
  const config: Record<string, string> = {};
  for (const k of [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
  ])
    if (typeof web[k] === 'string') config[k] = web[k] as string;
  return {
    enabled: d.enabled as boolean,
    configurationStatus: d.configuration_status as string,
    projectId: FCM_PROJECT_ID,
    webConfig: config,
    vapidPublicKey: d.vapid_public_key as string | null,
    allowedWebOrigins: d.allowed_web_origins as string[],
    androidPackage: FCM_ANDROID_PACKAGE,
    platforms: d.platforms as string[],
    selfTestEnabled: d.self_test_enabled as boolean,
  };
}
export function decodeSelfTest(input: unknown): SelfTestReceipt {
  const d = deliveryRecord(input);
  if (
    !deliveryUuid(d.request_key) ||
    !deliveryUuid(d.recipient_id) ||
    !deliveryUuid(d.registration_id) ||
    !Number.isSafeInteger(d.binding_version) ||
    (d.binding_version as number) < 1 ||
    ![
      'PENDING',
      'PROVIDER_ACCEPTED',
      'UNKNOWN',
      'RETRYABLE',
      'CONFIGURATION_ERROR',
      'REJECTED',
      'EXPIRED',
      'SUPPRESSED',
      'SOURCE_UNAVAILABLE',
    ].includes(String(d.state)) ||
    !(d.delivery_id === null || deliveryUuid(d.delivery_id)) ||
    !(
      d.provider_accepted_at === null || recordedInstant(d.provider_accepted_at)
    )
  )
    invalid();
  return {
    requestKey: d.request_key as string,
    recipientId: d.recipient_id as string,
    registrationId: d.registration_id as string,
    bindingVersion: d.binding_version as number,
    state: d.state as string,
    deliveryId: d.delivery_id as string | null,
    providerAcceptedAt: d.provider_accepted_at as string | null,
  };
}
