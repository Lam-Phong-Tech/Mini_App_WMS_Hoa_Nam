export const DELIVERY_CONTRACT = 'notification-delivery-v1' as const;
export const FCM_PROJECT_ID = 'hoa-nam-scanner-devtest';
export const FCM_ANDROID_PACKAGE = 'vn.info.lptech.wmshoanam';
export interface DeliveryBinding {
  registrationId: string;
  bindingVersion: number;
}
export interface PushPayload extends DeliveryBinding {
  deliveryId: string;
  recipientId: string;
  expiresAt: string;
}
export interface InstallationIdentity {
  installationId: string;
  proof: string;
}
export interface DeliveryRuntimeIdentity {
  sha: string;
  tier: string;
  origin: string;
}
export interface NativeDeliveryDiagnostic {
  schema: 'hn-fcm-native-diagnostic-v1';
  contract: typeof DELIVERY_CONTRACT;
  http_status: 200;
  request_id: string;
  timestamp: string;
  runtime: DeliveryRuntimeIdentity;
  installation_id: string;
  registration_id: string | null;
  binding_version: number;
  etag: string;
  ownership: 'OWN' | 'UNBOUND';
  active: boolean;
  canary_diagnostic: {
    contract: 'notification-delivery-android-canary-v1';
    actor_id: string;
    auth_session_id: string;
    installation_id: string;
    proof_fingerprint: string;
    proof_status: 'UNBOUND_CLIENT_PROPOSED' | 'SERVER_PROOF_VERIFIED';
    hardware_attestation: 'NOT_PROVIDED';
    canary_active: boolean;
    diagnostic_only: true;
    max_window_seconds: 1200;
  };
}
export interface Registration {
  exists: boolean;
  registrationId: string | null;
  bindingVersion: number;
  active: boolean;
  ownership: 'OWN' | 'OTHER_SESSION' | 'UNBOUND';
  state: string;
}
export interface DeliveryCapabilities {
  enabled: boolean;
  configurationStatus: string;
  projectId: string;
  webConfig: Readonly<Record<string, string>>;
  vapidPublicKey: string | null;
  allowedWebOrigins: readonly string[];
  androidPackage: string;
  platforms: readonly string[];
  selfTestEnabled: boolean;
}
export interface SelfTestReceipt {
  requestKey: string;
  recipientId: string;
  registrationId: string;
  bindingVersion: number;
  state: string;
  deliveryId: string | null;
  providerAcceptedAt: string | null;
}
export type PushPermission =
  | 'granted'
  | 'denied'
  | 'default'
  | 'unsupported'
  | 'not-configured';
export interface PushPlatform {
  configurationReady?(cap: DeliveryCapabilities): boolean;
  readonly platform: 'WEB' | 'ANDROID' | 'IOS';
  support(): Promise<PushPermission>;
  requestPermission(): Promise<PushPermission>;
  identity(): Promise<InstallationIdentity>;
  token(capabilities: DeliveryCapabilities): Promise<string>;
  getBinding(): Promise<DeliveryBinding | null>;
  storeBinding(binding: DeliveryBinding): Promise<void>;
  clearBinding(expected: DeliveryBinding): Promise<boolean>;
  onMessage(listener: (data: unknown) => void): () => void;
  onClick(listener: (data: unknown) => void): () => void;
  newRequestKey(): Promise<string>;
  onTokenChange?(listener: () => void): () => void;
  readTestIntent?(): Promise<{
    requestKey: string;
    binding: DeliveryBinding;
  } | null>;
  storeTestIntent?(value: {
    requestKey: string;
    binding: DeliveryBinding;
  }): Promise<void>;
}
export interface DeliveryService {
  capabilities(identity?: InstallationIdentity): Promise<DeliveryCapabilities>;
  diagnose?(identity: InstallationIdentity): Promise<NativeDeliveryDiagnostic>;
  read(identity: InstallationIdentity): Promise<Registration>;
  register(
    identity: InstallationIdentity,
    token: string,
    version: number,
    platform: 'WEB' | 'ANDROID',
  ): Promise<Registration>;
  unregister(
    identity: InstallationIdentity,
    version: number,
  ): Promise<Registration>;
  test(
    identity: InstallationIdentity,
    binding: DeliveryBinding,
    requestKey: string,
  ): Promise<SelfTestReceipt>;
  readTest(
    identity: InstallationIdentity,
    requestKey: string,
  ): Promise<SelfTestReceipt>;
}
