import type { P03Scope } from '../../../services/wms/p03Drafts';
export interface P05ResolverContext {
  scope: P03Scope;
  draftId: string;
  scanSessionId: string;
  version: number;
  sourceId?: string;
  sourceVersion?: number;
}
export interface P05ResolverBinding extends P05ResolverContext {
  contract: 'p05-resolver-owner-v1';
  requestId: string;
  shiftId?: string;
  purpose: 'SCAN' | 'REVALIDATE';
  body: { warehouse_id: string; raw_code: string };
  outcome: 'IN_FLIGHT' | 'UNKNOWN' | 'SUCCEEDED' | 'FAILED';
}
export type P05ResolverAdmission = (
  scope: P03Scope,
  version: number,
) => Promise<{ shiftId?: string }>;
export function p05ChecksPending(state: {
  ownerChecks?: P05ResolverBinding[];
}): boolean;
export function restoreP05Checks(
  state: { ownerChecks?: P05ResolverBinding[] },
  context: P05ResolverContext,
): void;
export function createP05OwnerChecks(options: {
  state(): { ownerChecks?: P05ResolverBinding[] };
  capture(): P05ResolverContext & { runtime: string };
  persist(): boolean;
  admit: P05ResolverAdmission;
  uuid(): string;
}): (
  adapter: {
    resolve(
      raw: string,
      binding?: P05ResolverBinding,
    ): Promise<Record<string, unknown>>;
  },
  raw: string,
  purpose: 'SCAN' | 'REVALIDATE',
) => Promise<Record<string, unknown>>;
export function reconcileP05OwnerCheck(
  options: {
    state(): { ownerChecks?: P05ResolverBinding[] };
    capture(): P05ResolverContext & { runtime: string };
    persist(): boolean;
  },
  adapter: {
    resolve(
      raw: string,
      binding?: P05ResolverBinding,
    ): Promise<Record<string, unknown>>;
  },
): Promise<boolean>;
