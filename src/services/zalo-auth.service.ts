import { getJson, postJson } from "@/services/api-client";
import {
  clearMiniSessionToken,
  setMiniSessionToken,
} from "@/services/auth-session.service";
import { getWmsApiBaseUrl, getWmsAuthHeaders } from "@/services/wms-link-context";
import type { WarehouseStaff } from "@/types/scan.types";

const STAFF_STORAGE_KEY = "miniapp_warehouse_staff";
export const WAREHOUSE_STAFF_STORAGE_EVENT = "warehouse-staff-storage-changed";
let currentUserInFlight: Promise<WarehouseStaff> | undefined;

interface WmsLoginRequest {
  email?: string;
  password?: string;
}

interface WmsAuthEnvelope {
  success?: boolean;
  message?: string;
  staff?: WarehouseStaff;
  user?: WmsAuthUser;
  data?: WmsAuthUser & {
    staff?: WarehouseStaff;
    user?: WmsAuthUser;
    access_token?: string;
    token?: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    expires_at?: string;
  };
  session_token?: string;
  session_expires_at?: string;
  access_token?: string;
  token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  expires_at?: string;
}

interface WmsAuthUser {
  id?: number | string;
  zalo_user_id?: number | string;
  user_id?: number | string;
  username?: string;
  name?: string;
  full_name?: string;
  display_name?: string;
  email?: string;
  role?: string;
  avatar_url?: string | null;
  roles?: Array<{
    role_code?: string;
    role_name?: string;
  }>;
  permissions?: string[];
  warehouse_scope_ids?: string[] | null;
}

export function getStoredWarehouseStaff(): WarehouseStaff | null {
  try {
    const raw = window.localStorage.getItem(STAFF_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WarehouseStaff) : null;
  } catch {
    return null;
  }
}

export function setStoredWarehouseStaff(staff: WarehouseStaff) {
  window.localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(staff));
  window.dispatchEvent(new Event(WAREHOUSE_STAFF_STORAGE_EVENT));
}

export function clearStoredWarehouseStaff() {
  currentUserInFlight = undefined;
  window.localStorage.removeItem(STAFF_STORAGE_KEY);
  clearMiniSessionToken();
  window.dispatchEvent(new Event(WAREHOUSE_STAFF_STORAGE_EVENT));
}

export async function loginWithWmsCredentials(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  currentUserInFlight = undefined;

  const response = await postJson<WmsLoginRequest, WmsAuthEnvelope>(
    "/api/v1/auth/login",
    {
      email: normalizedEmail,
      password,
    },
    {
      baseUrl: getWmsApiBaseUrl(),
    },
  );

  return persistAuthResponse(response);
}

export async function getCurrentWmsUser() {
  if (currentUserInFlight) return currentUserInFlight;

  currentUserInFlight = getJson<WmsAuthEnvelope>("/api/v1/auth/me", {
    baseUrl: getWmsApiBaseUrl(),
    headers: getWmsAuthHeaders(),
  })
    .then(persistAuthResponse)
    .finally(() => {
      currentUserInFlight = undefined;
    });

  return currentUserInFlight;
}

export async function logoutWmsBackend() {
  currentUserInFlight = undefined;
  await postJson<Record<string, never>, WmsAuthEnvelope>(
    "/api/v1/auth/logout",
    {},
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  ).catch(() => undefined);
}

function persistAuthResponse(response: WmsAuthEnvelope) {
  if (!response.success || !response.staff) {
    const mappedStaff = mapWmsUserToStaff(response);
    if (!mappedStaff) {
      throw new Error(response.message || "ZALO_LOGIN_FAILED");
    }

    persistToken(response);
    setStoredWarehouseStaff(mappedStaff);
    return mappedStaff;
  }

  persistToken(response);
  setStoredWarehouseStaff(response.staff);
  return response.staff;
}

function persistToken(response: WmsAuthEnvelope) {
  const expiresAt =
    response.session_expires_at ||
    response.expires_at ||
    response.data?.expires_at ||
    resolveExpiresAt(response.expires_in || response.data?.expires_in);

  setMiniSessionToken(
    response.session_token ||
      response.access_token ||
      response.token ||
      response.data?.access_token ||
      response.data?.token,
    expiresAt,
  );
}

function mapWmsUserToStaff(response: WmsAuthEnvelope): WarehouseStaff | null {
  const user: WmsAuthUser | undefined =
    response.data?.staff ||
    response.staff ||
    response.data?.user ||
    response.user ||
    response.data;
  if (!user) return null;
  const primaryRole = Array.isArray(user.roles) ? user.roles[0] : undefined;
  const rawId = user.id || user.user_id || user.email || user.username || "wms-user";

  return {
    id: typeof rawId === "number" ? rawId : stableNumericId(String(rawId)),
    zalo_user_id: String(
      user.zalo_user_id || user.user_id || user.id || user.email || user.username || "wms-user",
    ),
    name:
      user.name ||
      user.display_name ||
      user.full_name ||
      user.username ||
      user.email ||
      "Nhân viên kho",
    avatar_url: user.avatar_url,
    role: user.role || primaryRole?.role_name || primaryRole?.role_code || "Warehouse Operator",
    zalo_verified: true,
  };
}

function resolveExpiresAt(expiresInSeconds?: number) {
  if (!expiresInSeconds) return undefined;
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

function stableNumericId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash || 1;
}
