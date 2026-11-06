/** Offline security contract specimen only. */
/** Source-shaped, synthetic metadata for offline tests; no credentials. */
export function passwordPolicy(hasher = 'bcrypt') {
  return {
    version: 'p11-password-v1-' + hasher,
    min_length: 8,
    max_length: 128,
    length_unit: 'UNICODE_CHARACTERS',
    max_utf8_bytes: hasher === 'bcrypt' ? 72 : null,
    nul_allowed: false,
    confirmation_required: true,
    confirmation_field: 'new_password_confirmation',
    current_password_required: true,
    composition_rules: [],
    input_normalization: 'EXISTING_REQUEST_MIDDLEWARE',
    hasher,
    session_policy: 'RELOGIN_ALL_REFRESH_FAMILIES_REVOKED',
    keep_sessions_supported: false,
  };
}
export function securityContract(hasher = 'bcrypt') {
  return {
    version: 'p11-existing-routes-v1',
    readiness: 'PARTIAL_RECEIPT_AND_RECONCILIATION_UNSUPPORTED',
    password_policy: passwordPolicy(hasher),
    change_password: {
      method: 'POST',
      path: '/api/v1/auth/change-password',
      fields: ['current_password', 'new_password', 'new_password_confirmation'],
      auth: 'CURRENT_VALID_ACCESS_TOKEN_ACTIVE_ACCOUNT',
      result_path: 'meta.auth_result',
      legacy_data: null,
      wrong_current_http_status: 422,
      wrong_current_code: 'CURRENT_PASSWORD_INCORRECT',
      wrong_current_ends_session: false,
    },
    sessions: {
      method: 'GET',
      path: '/api/v1/auth/sessions',
      items_path: 'data',
      current_session_id_path: 'meta.current_session_id',
      stable_session_id_field: 'session_id',
      legacy_family_field: 'auth_session_id',
      delete_target_field: 'id',
      delete_target_kind: 'REFRESH_TOKEN_ROW_UUID',
      delete_path: '/api/v1/auth/sessions/{id}',
      current_family_protected: true,
      ownership: 'AUTHENTICATED_USER_ONLY',
      pagination: 'PAGE_LIVE_NOT_FROZEN',
      per_page_default: 20,
      per_page_max: 100,
      missing_device_or_location: null,
    },
    operations: {
      durable_receipt_supported: false,
      idempotency_supported: false,
      request_id_semantics: 'CORRELATION_ONLY_NOT_A_RECEIPT',
      reconciliation_supported: false,
      url: null,
      retention_seconds: null,
      revoked_token_can_read: false,
      automatic_mutation_retry: false,
      readback_proves_original_request: false,
      not_found_proves_not_executed: false,
    },
    release: {
      production_ready: false,
      remaining: [
        'DURABLE_RECEIPT',
        'IDEMPOTENCY',
        'OPERATION_RECONCILIATION',
        'DEPLOYMENT_AND_SMOKE',
      ],
      legacy_access_only_tokens: 'IAT_SECOND_PRECISION_REQUIRES_RELEASE_REVIEW',
    },
  };
}
