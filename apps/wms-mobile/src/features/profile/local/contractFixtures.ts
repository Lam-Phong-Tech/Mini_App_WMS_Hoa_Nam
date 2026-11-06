/** Offline data equivalent to pinned local contract tests; never normal app imports. */
import { securityContract } from './policyFixtures';
import type {
  TargetRowId,
  StableSessionId,
} from '../../../services/wms/security';
export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const FAMILY = '22222222-2222-4222-8222-222222222222';
export const ROW = '33333333-3333-4333-8333-333333333333';
export const OTHER = '44444444-4444-4444-8444-444444444444';
export function profileResponse(version = 7) {
  return {
    status: 200,
    data: {
      success: true,
      data: {
        user_id: USER_ID,
        username: 'offline-qa',
        created_at: null,
        updated_at: null,
        display_name: 'QA profile',
        phone: null,
        email: 'qa@example.invalid',
        status: 'ACTIVE',
        version,
        roles: [],
        permissions: [],
        warehouse_scope_ids: [],
        auth_session_id: FAMILY,
        active_warehouse_id: null,
        warehouse_context: {
          status: 'REQUIRED',
          error_code: 'WAREHOUSE_CONTEXT_REQUIRED',
        },
        available_warehouses: [],
      },
      meta: {
        profile_contract: {
          version: 'auth-profile-p10-v1',
          nickname_supported: false,
          avatar: { supported: false },
          ui_permission_groups: { status: 'BA_MAPPING_REQUIRED', groups: null },
          request_reconciliation: {
            supported: false,
            readback_proves_original_request: false,
            automatic_mutation_retry: false,
          },
        },
        security_contract: securityContract(),
      },
    },
    header: (name: string) =>
      name.toLowerCase() === 'etag' ? '"' + version + '"' : undefined,
  };
}
export function authResponse(
  action: 'logout' | 'password' = 'logout',
  scope = 'CURRENT_AUTH_SESSION_FAMILY',
) {
  return {
    status: 200,
    data: {
      success: true,
      data: null,
      meta: {
        auth_result: {
          state: 'SUCCEEDED',
          durable_request_receipt: false,
          request_reconcile_supported: false,
          ...(action === 'logout'
            ? { scope, business_drafts_deleted: false, work_shift_ended: false }
            : {
                session_policy: 'RELOGIN_ALL_REFRESH_FAMILIES_REVOKED',
                relogin_required: true,
                password_changed_at: '2026-10-10T06:01:02Z',
                password_policy_version: 'p11-password-v1-bcrypt',
              }),
        },
      },
    },
  };
}
export const sessionRow = {
  id: ROW,
  auth_session_id: OTHER,
  session_id: OTHER,
  is_current: false,
  can_revoke: true,
  device_label: null,
  location: null,
  user_agent: null,
  ip_address: null,
  last_active_at: null,
  expires_at: null,
  metadata_source: 'STORED_REQUEST_HEADERS_NOT_VERIFIED_DEVICE_OR_LOCATION',
  last_active_semantics: 'LOGIN_OR_TOKEN_REFRESH_NOT_EACH_API_REQUEST',
};
export const sessionItem = {
  id: ROW,
  authSessionId: OTHER,
  targetRowId: ROW as TargetRowId,
  stableSessionId: OTHER as StableSessionId,
  isCurrent: false,
  canRevoke: true,
  deviceLabel: null,
  location: null,
  userAgent: null,
  ipAddress: null,
  lastActiveAt: null,
  expiresAt: null,
  metadataSource: sessionRow.metadata_source,
  lastActiveSemantics: sessionRow.last_active_semantics,
};
export function sessionsResponse() {
  return {
    status: 200,
    data: {
      success: true,
      data: [{ ...sessionRow }],
      meta: {
        total: 21,
        current_page: 1,
        per_page: 20,
        last_page: 2,
        from: 1,
        to: 1,
        current_session_id: FAMILY,
        session_contract: {
          version: 'p11-existing-routes-v1',
          stable_session_id: 'session_id',
          target_id: 'id',
          target_id_kind: 'REFRESH_TOKEN_ROW_UUID',
          stable_family_id: 'auth_session_id',
          current_family_protected: true,
          request_receipt_supported: false,
          count_unit: 'ACTIVE_AUTH_SESSION_FAMILY',
          pagination: 'PAGE_LIVE_NOT_FROZEN',
        },
      },
      links: { first: null, last: null, prev: null, next: null },
    },
  };
}
export function revokeResponse() {
  return {
    status: 200,
    data: {
      success: true,
      data: {
        id: ROW,
        auth_session_id: OTHER,
        session_id: OTHER,
        revoked: true,
        already_revoked: false,
        was_current: false,
        revocation_scope: 'AUTH_SESSION_FAMILY',
        request_receipt_supported: false,
      },
      meta: {},
    },
  };
}
