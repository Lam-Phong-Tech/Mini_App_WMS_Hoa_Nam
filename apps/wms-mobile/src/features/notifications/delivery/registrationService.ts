import {
  apiClient,
  type ApiResponse,
  type RequestOptions,
} from '../../../api/client';
import {
  captureSessionScope,
  isSessionScopeCurrent,
  getActiveSession,
} from '../../../auth/session';
import { BUILD_PROFILE } from '../../../config/buildProfile';
import { captureDeliveryOwner, isDeliveryOwnerCurrent } from './ownerScope';
import { getCurrentEnvironment } from '../../../config/env';
import { isDevRuntimeIdentity } from '../../../config/runtimePolicy';
import { AppError } from '../../../errors/AppError';
import { ANDROID_CANARY_CONTRACT, nativeDiagnosticReport } from './diagnostic';
import {
  decodeCapabilities,
  decodeRegistration,
  decodeSelfTest,
  deliveryRecord,
  deliveryUuid,
  recordedInstant,
} from './parse';
import {
  DELIVERY_CONTRACT,
  FCM_ANDROID_PACKAGE,
  type DeliveryService,
  type InstallationIdentity,
  type DeliveryRuntimeIdentity,
} from './types';
const root = '/api/v1/notification-delivery';
type Client = { request<T>(options: RequestOptions): Promise<ApiResponse<T>> };
export async function verifyDeliveryRuntime(
  client: Client,
): Promise<DeliveryRuntimeIdentity> {
  const e = getCurrentEnvironment();
  if (
    BUILD_PROFILE !== 'dev-test' ||
    e.name !== 'dev-test' ||
    e.expectedTier !== 'dev-test' ||
    !e.environmentClassVerified ||
    e.apiBaseUrl !== 'https://khohoanamdev.lptech.info.vn'
  )
    throw new AppError({
      kind: 'wrong_environment',
      message: 'Thông báo chỉ bật trên DEV/TEST đã xác minh.',
    });
  const r = await client.request<unknown>({ path: '/api/v1/health' }),
    d = deliveryRecord(deliveryRecord(r.data).data);
  if (
    r.status !== 200 ||
    !isDevRuntimeIdentity(
      deliveryRecord(d.build).sha,
      r.header?.('X-WMS-Deployment-Tier'),
    )
  )
    throw new AppError({
      kind: 'wrong_environment',
      message: 'Chưa xác minh được máy chủ thông báo DEV/TEST.',
    });
  return {
    sha: deliveryRecord(d.build).sha as string,
    tier: r.header?.('X-WMS-Deployment-Tier')!,
    origin: e.apiBaseUrl,
  };
}
export function createDeliveryService(
  deps: {
    client?: Client;
    verifyRuntime?: () => Promise<void | DeliveryRuntimeIdentity>;
    platform?: 'WEB' | 'ANDROID';
  } = {},
): DeliveryService {
  const client = deps.client ?? apiClient,
    scope = captureDeliveryOwner();
  const check = () => {
    if (
      !getActiveSession() ||
      !scope.userId ||
      !scope.authSessionId ||
      !isDeliveryOwnerCurrent(scope)
    )
      throw new AppError({
        kind: 'cancelled',
        code: 'NOTIFICATION_DELIVERY_STALE_SCOPE',
        message: 'Phiên thông báo đã thay đổi.',
      });
  };
  const path = (i: InstallationIdentity) => {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        i.installationId,
      ) ||
      !/^[A-Za-z0-9_-]{43}$/.test(i.proof)
    )
      throw new AppError({
        kind: 'config',
        message: 'Chưa xác minh được định danh thiết bị.',
      });
    return root + '/installations/' + i.installationId;
  };
  const version = (v: number) => {
    if (!Number.isSafeInteger(v) || v < 0)
      throw new AppError({
        kind: 'config',
        message: 'Phiên bản đăng ký không hợp lệ.',
      });
    return v;
  };
  const request = async (o: RequestOptions) => {
    check();
    const runtime = await (deps.verifyRuntime?.() ??
      verifyDeliveryRuntime(client));
    check();
    const r = await client.request<unknown>(o);
    check();
    const b = deliveryRecord(r.data),
      m = deliveryRecord(b.meta);
    if (
      ![200, 201].includes(r.status) ||
      b.success !== true ||
      m.contract !== DELIVERY_CONTRACT ||
      !deliveryUuid(m.request_id) ||
      !recordedInstant(m.timestamp)
    )
      throw new AppError({
        kind: 'parse',
        message: 'Contract thông báo chưa được xác minh.',
      });
    return {
      data: b.data,
      etag: r.header?.('ETag'),
      meta: m,
      status: r.status,
      runtime,
    };
  };
  const headers = (i: InstallationIdentity) => ({
    'X-Installation-Proof': i.proof,
    ...(deps.platform === 'ANDROID'
      ? {
          'X-Notification-Installation-ID': i.installationId,
          'X-Notification-App-Package': FCM_ANDROID_PACKAGE,
        }
      : {}),
  });
  return {
    capabilities: async i => {
      if (deps.platform === 'ANDROID' && !i)
        throw new AppError({
          kind: 'config',
          message: 'Chưa có định danh riêng của thiết bị.',
        });
      if (i) path(i);
      return decodeCapabilities(
        (
          await request({
            path: root + '/capabilities',
            ...(deps.platform === 'ANDROID' && i
              ? { headers: headers(i) }
              : {}),
          })
        ).data,
      );
    },
    diagnose: async i => {
      if (deps.platform !== 'ANDROID')
        throw new AppError({
          kind: 'config',
          message: 'Chẩn đoán chỉ dành cho Android DEV/TEST.',
        });
      const r = await request({
        path: path(i),
        headers: {
          ...headers(i),
          'X-Notification-Canary-Diagnostic': ANDROID_CANARY_CONTRACT,
        },
      });
      return nativeDiagnosticReport(r, i, scope);
    },
    read: async i => {
      const r = await request({ path: path(i), headers: headers(i) });
      return decodeRegistration(r.data, r.etag);
    },
    register: async (i, token, v, platform) => {
      if (
        !['WEB', 'ANDROID'].includes(platform) ||
        typeof token !== 'string' ||
        token.length < 20 ||
        token.length > 4096 ||
        /[\x00-\x20\x7f]/.test(token)
      )
        throw new AppError({
          kind: 'config',
          message: 'Chưa lấy được token thông báo hợp lệ.',
        });
      const r = await request({
        method: 'PUT',
        path: path(i),
        headers: {
          ...headers(i),
          ...(platform === 'ANDROID'
            ? { 'X-Notification-App-Package': FCM_ANDROID_PACKAGE }
            : {}),
        },
        body: {
          platform,
          fcm_token: token,
          consent: 'GRANTED',
          expected_version: version(v),
        },
      });
      return decodeRegistration(r.data, r.etag);
    },
    unregister: async (i, v) => {
      const r = await request({
        method: 'DELETE',
        path: path(i),
        headers: { ...headers(i), 'If-Match': `"${version(v)}"` },
      });
      return decodeRegistration(r.data, r.etag);
    },
    test: async (i, b, k) => {
      path(i);
      if (!deliveryUuid(k) || !deliveryUuid(b.registrationId))
        throw new AppError({
          kind: 'config',
          message: 'Thiếu định danh gửi thử.',
        });
      return decodeSelfTest(
        (
          await request({
            method: 'POST',
            path: root + '/test-self',
            headers: headers(i),
            body: {
              request_key: k,
              registration_id: b.registrationId,
              binding_version: version(b.bindingVersion),
            },
          })
        ).data,
      );
    },
    readTest: async (i, k) => {
      path(i);
      if (!deliveryUuid(k))
        throw new AppError({
          kind: 'config',
          message: 'Thiếu mã gửi thử cần đối chiếu.',
        });
      return decodeSelfTest(
        (await request({ path: root + '/test-self/' + k, headers: headers(i) }))
          .data,
      );
    },
  };
}
