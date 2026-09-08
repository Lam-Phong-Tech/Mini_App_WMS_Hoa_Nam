import { BUILD_PROFILE } from './buildProfile';
import type { DeploymentTier } from './deployment';

export type EnvironmentName = DeploymentTier;

export interface AppEnvironment {
  readonly name: EnvironmentName;
  readonly label: string;
  readonly apiBaseUrl: string;
  readonly requestTimeoutMs: number;
  readonly expectedTier: DeploymentTier;
  readonly environmentClassVerified: boolean;
  readonly wmsGateApproved: boolean;
  readonly behindEdgeProxy: boolean;
}

/**
 * Vite/preview proxy cùng origin với giao diện, nên browser không gọi chéo
 * thẳng sang API. Đích sau proxy cố định ở vite.config.ts là Green DEV/TEST.
 */
export const ENVIRONMENTS: Readonly<Record<EnvironmentName, AppEnvironment>> = {
  'dev-test': {
    name: 'dev-test',
    label: 'DEV/TEST — Green',
    apiBaseUrl: '/wms-api',
    requestTimeoutMs: 20000,
    expectedTier: 'dev-test',
    environmentClassVerified: true,
    wmsGateApproved: false,
    behindEdgeProxy: false,
  },
  'customer-production': {
    name: 'customer-production',
    label: 'Khách hàng — Blue',
    // Không mở đường browser tới production: profile hiện hành là dev-test.
    apiBaseUrl: '/wms-api',
    requestTimeoutMs: 20000,
    expectedTier: 'customer-production',
    environmentClassVerified: true,
    wmsGateApproved: false,
    behindEdgeProxy: true,
  },
};

export function getCurrentEnvironment(): AppEnvironment {
  return ENVIRONMENTS[BUILD_PROFILE];
}

export function listEnvironments(): readonly AppEnvironment[] {
  return Object.values(ENVIRONMENTS);
}

export interface BuildInfo {
  readonly isDebug: boolean;
  readonly applicationId: string;
  readonly profile: DeploymentTier;
}

export const BUILD_INFO: BuildInfo = {
  isDebug: import.meta.env.DEV,
  applicationId: 'vn.info.lptech.wmshoanam.web',
  profile: BUILD_PROFILE,
};
