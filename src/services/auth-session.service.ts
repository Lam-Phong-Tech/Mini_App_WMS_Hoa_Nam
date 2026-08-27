const MINI_SESSION_TOKEN_KEY = "miniapp_warehouse_session_token";
const MINI_SESSION_EXPIRES_AT_KEY = "miniapp_warehouse_session_expires_at";
const MINI_SESSION_STARTED_AT_KEY = "miniapp_warehouse_session_started_at";
export const MINI_AUTH_SESSION_EXPIRED_EVENT = "miniapp-auth-session-expired";
export const MINI_AUTH_PERMISSION_DENIED_EVENT = "miniapp-auth-permission-denied";
export const MINI_AUTH_SECURITY_RESET_EVENT = "miniapp-auth-security-reset";

export function getMiniSessionToken() {
  try {
    const token = window.localStorage.getItem(MINI_SESSION_TOKEN_KEY);
    const expiresAt = window.localStorage.getItem(MINI_SESSION_EXPIRES_AT_KEY);

    if (!token) return undefined;

    if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
      clearMiniSessionToken();
      return undefined;
    }

    return token;
  } catch {
    return undefined;
  }
}

export function setMiniSessionToken(token?: string, expiresAt?: string) {
  if (!token) return;

  const previousToken = window.localStorage.getItem(MINI_SESSION_TOKEN_KEY);
  window.localStorage.setItem(MINI_SESSION_TOKEN_KEY, token);

  if (!previousToken || previousToken !== token) {
    window.localStorage.setItem(
      MINI_SESSION_STARTED_AT_KEY,
      new Date().toISOString(),
    );
  }

  if (expiresAt) {
    window.localStorage.setItem(MINI_SESSION_EXPIRES_AT_KEY, expiresAt);
  }
}

export function clearMiniSessionToken() {
  try {
    window.localStorage.removeItem(MINI_SESSION_TOKEN_KEY);
    window.localStorage.removeItem(MINI_SESSION_EXPIRES_AT_KEY);
    window.localStorage.removeItem(MINI_SESSION_STARTED_AT_KEY);
  } catch {
    // Không để lỗi storage làm kẹt logout/session gate.
  }
}

export function getMiniSessionStartedAt() {
  try {
    const value = window.localStorage.getItem(MINI_SESSION_STARTED_AT_KEY);
    return value || undefined;
  } catch {
    return undefined;
  }
}

export function notifyMiniSessionExpired() {
  clearMiniSessionToken();
  dispatchAuthEvent(MINI_AUTH_SESSION_EXPIRED_EVENT);
}

export function notifyMiniPermissionDenied() {
  dispatchAuthEvent(MINI_AUTH_PERMISSION_DENIED_EVENT);
}

export function resetMiniAuthSecurityState() {
  dispatchAuthEvent(MINI_AUTH_SECURITY_RESET_EVENT);
}

export function getMiniAuthHeaders(): Record<string, string | undefined> {
  const token = getMiniSessionToken();

  return {
    Authorization: token ? `Bearer ${token}` : undefined,
  };
}

function dispatchAuthEvent(eventName: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(eventName));
}
