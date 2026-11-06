import { AppError } from '../../../errors/AppError';
import {
  decodeRegistration,
  deliveryRecord,
  deliveryUuid,
  recordedInstant,
} from './parse';
import {
  DELIVERY_CONTRACT,
  type DeliveryRuntimeIdentity,
  type DeliveryService,
  type InstallationIdentity,
  type NativeDeliveryDiagnostic,
  type PushPlatform,
} from './types';

export const ANDROID_CANARY_CONTRACT =
  'notification-delivery-android-canary-v1';
export const NATIVE_DIAGNOSTIC_LOG_PREFIX = 'HN_FCM_CANARY_DIAGNOSTIC_V1 ';

function invalid(): never {
  throw new AppError({
    kind: 'parse',
    code: 'NOTIFICATION_DIAGNOSTIC_INVALID',
    message: 'Chưa xác minh được chẩn đoán của đúng thiết bị và phiên này.',
  });
}

/** Construct an allowlist, never export the raw API response or request identity. */
export function nativeDiagnosticReport(
  response: {
    data: unknown;
    etag: string | undefined;
    meta: Record<string, unknown>;
    status: number;
    runtime: DeliveryRuntimeIdentity | void;
  },
  identity: InstallationIdentity,
  owner: { userId?: string; authSessionId?: string },
): NativeDeliveryDiagnostic {
  const data = deliveryRecord(response.data),
    diagnostic = deliveryRecord(data.canary_diagnostic);
  const registration = decodeRegistration(data, response.etag),
    runtime = response.runtime,
    meta = response.meta;
  if (
    response.status !== 200 ||
    !runtime ||
    runtime.tier !== 'dev-test' ||
    runtime.origin !== 'https://khohoanamdev.lptech.info.vn' ||
    !/^[a-f0-9]{40}$/i.test(runtime.sha) ||
    !deliveryUuid(meta.request_id) ||
    !recordedInstant(meta.timestamp) ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(
      meta.timestamp,
    ) ||
    !owner.userId ||
    !owner.authSessionId ||
    diagnostic.actor_id !== owner.userId ||
    diagnostic.auth_session_id !== owner.authSessionId ||
    diagnostic.installation_id !== identity.installationId ||
    diagnostic.contract !== ANDROID_CANARY_CONTRACT ||
    typeof diagnostic.proof_fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(diagnostic.proof_fingerprint) ||
    diagnostic.proof_status !==
      (registration.exists
        ? 'SERVER_PROOF_VERIFIED'
        : 'UNBOUND_CLIENT_PROPOSED') ||
    diagnostic.hardware_attestation !== 'NOT_PROVIDED' ||
    typeof diagnostic.canary_active !== 'boolean' ||
    diagnostic.diagnostic_only !== true ||
    diagnostic.max_window_seconds !== 1200 ||
    registration.ownership === 'OTHER_SESSION'
  )
    invalid();
  return {
    schema: 'hn-fcm-native-diagnostic-v1',
    contract: DELIVERY_CONTRACT,
    http_status: 200,
    request_id: meta.request_id,
    timestamp: meta.timestamp,
    runtime: { sha: runtime.sha, tier: runtime.tier, origin: runtime.origin },
    installation_id: identity.installationId,
    registration_id: registration.registrationId,
    binding_version: registration.bindingVersion,
    etag: response.etag!,
    ownership: registration.ownership,
    active: registration.active,
    canary_diagnostic: {
      contract: ANDROID_CANARY_CONTRACT,
      actor_id: owner.userId,
      auth_session_id: owner.authSessionId,
      installation_id: identity.installationId,
      proof_fingerprint: diagnostic.proof_fingerprint,
      proof_status:
        diagnostic.proof_status as NativeDeliveryDiagnostic['canary_diagnostic']['proof_status'],
      hardware_attestation: 'NOT_PROVIDED',
      canary_active: diagnostic.canary_active,
      diagnostic_only: true,
      max_window_seconds: 1200,
    },
  };
}

/** Explicit OFF action. Identity can be local; this never asks permission or registers. */
export async function collectNativeDiagnostic(
  platform: PushPlatform,
  service: DeliveryService,
  isCurrent: () => boolean,
): Promise<NativeDeliveryDiagnostic | undefined> {
  if (platform.platform !== 'ANDROID' || !service.diagnose)
    throw new AppError({
      kind: 'config',
      message: 'Chẩn đoán này chỉ dành cho ứng dụng Android DEV/TEST.',
    });
  if (!isCurrent()) return;
  const identity = await platform.identity();
  if (!isCurrent()) return;
  const report = await service.diagnose(identity);
  if (!isCurrent()) return;
  return report;
}
