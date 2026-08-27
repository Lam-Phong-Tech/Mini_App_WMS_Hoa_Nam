import {
  getMiniAuthHeaders,
  notifyMiniPermissionDenied,
  notifyMiniSessionExpired,
} from "@/services/auth-session.service";
import type { ApiClientOptions, ApiJsonResult } from "@/types/api.types";

const DEFAULT_TIMEOUT_MS = 12000;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export class ApiClientError extends Error {
  status: number;
  errorCode?: string;
  userMessage: string;
  payload?: Record<string, unknown>;

  constructor(
    status: number,
    userMessage: string,
    errorCode?: string,
    payload?: Record<string, unknown>,
  ) {
    super(errorCode || userMessage || "API_ERROR");
    this.name = "ApiClientError";
    this.status = status;
    this.errorCode = errorCode;
    this.userMessage = userMessage;
    this.payload = payload;
  }
}

export async function postJson<TRequest, TResponse>(
  endpoint: string,
  body: TRequest,
  options: ApiClientOptions = {},
): Promise<TResponse> {
  const result = await postJsonWithMeta<TRequest, TResponse>(
    endpoint,
    body,
    options,
  );

  return result.data;
}

export async function postJsonWithMeta<TRequest, TResponse>(
  endpoint: string,
  body: TRequest,
  options: ApiClientOptions = {},
): Promise<ApiJsonResult<TResponse>> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeoutMs || DEFAULT_TIMEOUT_MS,
  );

  try {
    const url = `${options.baseUrl || API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      method: "POST",
      headers: buildRequestHeaders(options.headers),
      body: JSON.stringify(body),
      signal: controller.signal,
    }).catch((error) => {
      logFetchError(url, error);
      throw error;
    });

    const payload = await parseJsonResponse(response);

    if (!response.ok) {
      throwApiError(url, response.status, payload);
    }

    return {
      data: payload as TResponse,
      headers: response.headers,
      status: response.status,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function postFormDataWithMeta<TResponse>(
  endpoint: string,
  body: FormData,
  options: ApiClientOptions = {},
): Promise<ApiJsonResult<TResponse>> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeoutMs || DEFAULT_TIMEOUT_MS,
  );

  try {
    const url = `${options.baseUrl || API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      method: "POST",
      headers: buildRequestHeaders(options.headers, false),
      body,
      signal: controller.signal,
    }).catch((error) => {
      logFetchError(url, error);
      throw error;
    });
    const payload = await parseJsonResponse(response);

    if (!response.ok) {
      throwApiError(url, response.status, payload);
    }

    return {
      data: payload as TResponse,
      headers: response.headers,
      status: response.status,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getJson<TResponse>(
  endpoint: string,
  options: ApiClientOptions = {},
): Promise<TResponse> {
  const result = await getJsonWithMeta<TResponse>(endpoint, options);
  return result.data;
}

export async function getJsonWithMeta<TResponse>(
  endpoint: string,
  options: ApiClientOptions = {},
): Promise<ApiJsonResult<TResponse>> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeoutMs || DEFAULT_TIMEOUT_MS,
  );

  try {
    const url = `${options.baseUrl || API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      method: "GET",
      headers: buildRequestHeaders(options.headers),
      signal: controller.signal,
    }).catch((error) => {
      logFetchError(url, error);
      throw error;
    });

    const payload = await parseJsonResponse(response);

    if (!response.ok) {
      throwApiError(url, response.status, payload);
    }

    return {
      data: payload as TResponse,
      headers: response.headers,
      status: response.status,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getBlobWithMeta(
  endpoint: string,
  options: ApiClientOptions = {},
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeoutMs || DEFAULT_TIMEOUT_MS,
  );

  try {
    const url = `${options.baseUrl || API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      method: "GET",
      headers: buildRequestHeaders(options.headers, false),
      signal: controller.signal,
    }).catch((error) => {
      logFetchError(url, error);
      throw error;
    });

    if (!response.ok) {
      const payload = await parseJsonResponse(response);
      throwApiError(url, response.status, payload);
    }

    return {
      data: await response.blob(),
      headers: response.headers,
      status: response.status,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function patchJsonWithMeta<TRequest, TResponse>(
  endpoint: string,
  body: TRequest,
  options: ApiClientOptions = {},
): Promise<ApiJsonResult<TResponse>> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeoutMs || DEFAULT_TIMEOUT_MS,
  );

  try {
    const url = `${options.baseUrl || API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: buildRequestHeaders(options.headers),
      body: JSON.stringify(body),
      signal: controller.signal,
    }).catch((error) => {
      logFetchError(url, error);
      throw error;
    });

    const payload = await parseJsonResponse(response);

    if (!response.ok) {
      throwApiError(url, response.status, payload);
    }

    return {
      data: payload as TResponse,
      headers: response.headers,
      status: response.status,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function deleteJson<TResponse>(
  endpoint: string,
  options: ApiClientOptions = {},
): Promise<TResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeoutMs || DEFAULT_TIMEOUT_MS,
  );

  try {
    const url = `${options.baseUrl || API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: buildRequestHeaders(options.headers),
      signal: controller.signal,
    }).catch((error) => {
      logFetchError(url, error);
      throw error;
    });

    const payload = await parseJsonResponse(response);

    if (!response.ok) {
      throwApiError(url, response.status, payload);
    }

    return payload as TResponse;
  } finally {
    window.clearTimeout(timeout);
  }
}

function buildRequestHeaders(
  headers?: Record<string, string | undefined>,
  includeJsonContentType = true,
) {
  return cleanHeaders({
    "Content-Type": includeJsonContentType ? "application/json" : undefined,
    ...getMiniAuthHeaders(),
    ...cleanHeaders(headers || {}),
  });
}

function cleanHeaders(headers: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(headers).filter(([, value]) => Boolean(value)),
  ) as Record<string, string>;
}

function logFetchError(url: string, error: unknown) {
  if (isAbortError(error)) return;

  console.error("[WMS API] Fetch failed", {
    url,
    apiBaseUrl: API_BASE_URL,
    error,
  });
}

function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { name?: unknown; message?: unknown };

  return (
    record.name === "AbortError" ||
    (typeof record.message === "string" &&
      record.message.toLowerCase().includes("signal is aborted"))
  );
}

function throwApiError(
  url: string,
  status: number,
  payload: Record<string, unknown> | undefined,
): never {
  const errorCode =
    stringValue(payload?.error_code) ||
    stringValue((payload?.error as Record<string, unknown> | undefined)?.code);
  const message =
    stringValue(payload?.message) ||
    stringValue(payload?.error) ||
    errorCode ||
    "API_ERROR";

  console.error("[WMS API] HTTP error", {
    url,
    status,
    errorCode,
    message,
    payload,
  });

  const isLoginRequest = url.includes("/api/v1/auth/login");

  if (!isLoginRequest && status === 401) {
    notifyMiniSessionExpired();
  }

  if (!isLoginRequest && status === 403) {
    notifyMiniPermissionDenied();
  }

  throw new ApiClientError(status, message, errorCode, payload);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      message: text,
      error_code: "INVALID_JSON_RESPONSE",
    };
  }
}
