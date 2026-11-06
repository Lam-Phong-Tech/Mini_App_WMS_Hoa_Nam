/** Pinned 4b03fe2 metadata only. Never accepts/stores password values. */
export const P11_CONTRACT = 'p11-existing-routes-v1';
export const P11_SESSION_POLICY = 'RELOGIN_ALL_REFRESH_FAMILIES_REVOKED';
export interface PasswordPolicy {
  readonly version: string;
  readonly minLength: number;
  readonly maxLength: number;
  readonly maxUtf8Bytes: number | null;
  readonly nulAllowed: false;
  readonly confirmationRequired: true;
  readonly confirmationField: 'new_password_confirmation';
  readonly currentPasswordRequired: true;
  readonly lengthUnit: 'UNICODE_CHARACTERS';
  readonly compositionRules: readonly [];
  readonly inputNormalization: 'EXISTING_REQUEST_MIDDLEWARE';
  readonly hasher: string;
  readonly sessionPolicy: typeof P11_SESSION_POLICY;
  readonly keepSessionsSupported: false;
}
export const asRecord = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export function decodePasswordPolicy(
  value: unknown,
): PasswordPolicy | undefined {
  const p = asRecord(value);
  if (
    typeof p.version !== 'string' ||
    !p.version ||
    typeof p.hasher !== 'string' ||
    !p.hasher ||
    !Number.isSafeInteger(p.min_length) ||
    !Number.isSafeInteger(p.max_length) ||
    Number(p.min_length) < 1 ||
    Number(p.max_length) < Number(p.min_length) ||
    !(
      p.max_utf8_bytes === null ||
      (Number.isSafeInteger(p.max_utf8_bytes) && Number(p.max_utf8_bytes) > 0)
    ) ||
    p.length_unit !== 'UNICODE_CHARACTERS' ||
    p.nul_allowed !== false ||
    p.confirmation_required !== true ||
    p.confirmation_field !== 'new_password_confirmation' ||
    p.current_password_required !== true ||
    !Array.isArray(p.composition_rules) ||
    p.composition_rules.length !== 0 ||
    p.input_normalization !== 'EXISTING_REQUEST_MIDDLEWARE' ||
    p.session_policy !== P11_SESSION_POLICY ||
    p.keep_sessions_supported !== false
  )
    return undefined;
  return Object.freeze({
    version: p.version,
    minLength: Number(p.min_length),
    maxLength: Number(p.max_length),
    maxUtf8Bytes: p.max_utf8_bytes as number | null,
    nulAllowed: false,
    confirmationRequired: true,
    confirmationField: 'new_password_confirmation',
    currentPasswordRequired: true,
    lengthUnit: 'UNICODE_CHARACTERS',
    compositionRules: [] as const,
    inputNormalization: 'EXISTING_REQUEST_MIDDLEWARE',
    hasher: p.hasher,
    sessionPolicy: P11_SESSION_POLICY,
    keepSessionsSupported: false,
  });
}
export function decodeSecurityContract(
  value: unknown,
): PasswordPolicy | undefined {
  const c = asRecord(value),
    ops = asRecord(c.operations),
    sessions = asRecord(c.sessions),
    change = asRecord(c.change_password),
    release = asRecord(c.release);
  if (
    c.version !== P11_CONTRACT ||
    release.production_ready !== false ||
    ![
      'durable_receipt_supported',
      'idempotency_supported',
      'reconciliation_supported',
      'revoked_token_can_read',
      'automatic_mutation_retry',
      'readback_proves_original_request',
      'not_found_proves_not_executed',
    ].every(k => ops[k] === false) ||
    ops.url !== null ||
    ops.retention_seconds !== null ||
    ops.request_id_semantics !== 'CORRELATION_ONLY_NOT_A_RECEIPT' ||
    change.method !== 'POST' ||
    change.path !== '/api/v1/auth/change-password' ||
    !Array.isArray(change.fields) ||
    change.fields.length !== 3 ||
    !['current_password', 'new_password', 'new_password_confirmation'].every(
      k => (change.fields as unknown[]).includes(k),
    ) ||
    change.wrong_current_http_status !== 422 ||
    change.wrong_current_code !== 'CURRENT_PASSWORD_INCORRECT' ||
    change.wrong_current_ends_session !== false ||
    sessions.stable_session_id_field !== 'session_id' ||
    sessions.delete_target_field !== 'id' ||
    sessions.current_session_id_path !== 'meta.current_session_id' ||
    sessions.current_family_protected !== true
  )
    return undefined;
  return decodePasswordPolicy(c.password_policy);
}
/** Count Unicode scalar values and UTF-8 bytes; reject unpaired UTF-16 surrogates.
 * Arithmetic runs on Hermes/JSC/Node without an encoder/polyfill dependency. */
export function passwordSize(
  value: string,
): { characters: number; utf8Bytes: number; nul: boolean } | undefined {
  let characters = 0,
    utf8Bytes = 0,
    nul = false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    characters++;
    if (code === 0) nul = true;
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(++i);
      if (!(low >= 0xdc00 && low <= 0xdfff)) return undefined;
      utf8Bytes += 4;
    } else if (code >= 0xdc00 && code <= 0xdfff) return undefined;
    else utf8Bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
  }
  return { characters, utf8Bytes, nul };
}
export interface PasswordInput {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly newPasswordConfirmation: string;
}
export type PasswordFieldErrors = Partial<Record<keyof PasswordInput, string>>;
export function validateSecurityPasswords(
  input: PasswordInput,
  policy: PasswordPolicy,
): PasswordFieldErrors {
  const errors: PasswordFieldErrors = {};
  const current =
    typeof input.currentPassword === 'string'
      ? passwordSize(input.currentPassword)
      : undefined;
  if (!current || current.characters < 1 || current.characters > 255)
    errors.currentPassword =
      'Mật khẩu hiện tại phải có từ 1 đến 255 ký tự Unicode.';
  const next =
    typeof input.newPassword === 'string'
      ? passwordSize(input.newPassword)
      : undefined;
  if (!next) errors.newPassword = 'Mật khẩu chứa Unicode không hợp lệ.';
  else if (
    next.characters < policy.minLength ||
    next.characters > policy.maxLength
  )
    errors.newPassword = `Mật khẩu mới phải có từ ${policy.minLength} đến ${policy.maxLength} ký tự Unicode.`;
  else if (next.nul)
    errors.newPassword = 'Mật khẩu mới không được chứa ký tự NUL.';
  else if (policy.maxUtf8Bytes !== null && next.utf8Bytes > policy.maxUtf8Bytes)
    errors.newPassword = `Mật khẩu mới vượt giới hạn ${policy.maxUtf8Bytes} byte UTF-8.`;
  const confirm =
    typeof input.newPasswordConfirmation === 'string'
      ? passwordSize(input.newPasswordConfirmation)
      : undefined;
  if (!confirm || !confirm.characters)
    errors.newPasswordConfirmation = 'Vui lòng xác nhận mật khẩu mới.';
  else if (confirm.characters > policy.maxLength)
    errors.newPasswordConfirmation = 'Mật khẩu xác nhận vượt giới hạn ký tự.';
  else if (input.newPassword !== input.newPasswordConfirmation)
    errors.newPasswordConfirmation = 'Mật khẩu xác nhận chưa khớp.';
  return errors;
}
