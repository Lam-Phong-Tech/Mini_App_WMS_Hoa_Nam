import {
  ApiEnvelope,
  ApiErrorCode,
  ApiFailure,
  ApiMeta,
  FieldErrors,
} from "@/types/public-api";

export type FetchLike = typeof fetch;

const fallbackMessage = "Không thể tải dữ liệu lúc này. Vui lòng thử lại.";
export const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFieldErrors = (value: unknown): value is FieldErrors | null => {
  if (value === null) return true;
  if (!isRecord(value)) return false;

  return Object.values(value).every(
    (messages) =>
      Array.isArray(messages) && messages.every((message) => typeof message === "string"),
  );
};

const isApiMeta = (value: unknown): value is ApiMeta =>
  isRecord(value) &&
  Object.values(value).every(
    (item) =>
      typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null,
  );

export const createSafeFailure = (
  errorCode: ApiErrorCode = "UPSTREAM_UNAVAILABLE",
  meta: ApiMeta = {},
  errors: FieldErrors | null = null,
): ApiFailure => ({
  success: false,
  message: fallbackMessage,
  data: null,
  meta,
  error_code: errorCode,
  errors,
});

const errorCodeForStatus = (status: number): ApiErrorCode => {
  if (status === 429) return "RATE_LIMITED";
  if (status === 404) return "PRODUCT_NOT_FOUND";
  if (status === 409) return "PRODUCT_NOT_AVAILABLE";
  if (status === 503) return "UPSTREAM_UNAVAILABLE";
  return "INTERNAL_ERROR";
};

export const isApiEnvelope = <T>(value: unknown): value is ApiEnvelope<T> => {
  if (!isRecord(value) || typeof value.success !== "boolean") return false;
  if (typeof value.message !== "string" || !isApiMeta(value.meta)) return false;
  if (
    !Object.prototype.hasOwnProperty.call(value, "data") ||
    !Object.prototype.hasOwnProperty.call(value, "error_code")
  ) {
    return false;
  }
  if (!isFieldErrors(value.errors)) return false;

  if (value.success) {
    return value.error_code === null && value.errors === null;
  }

  return (
    value.data === null &&
    typeof value.error_code === "string" &&
    value.error_code.length > 0
  );
};

export const requestEnvelope = async <T>(
  url: string,
  init: RequestInit = {},
  fetcher: FetchLike = fetch,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<ApiEnvelope<T>> => {
  let response: Response;
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    response = await fetcher(url, {
      ...init,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch {
    return createSafeFailure("UPSTREAM_UNAVAILABLE");
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  const retryAfter = response.headers.get("Retry-After");
  const retryAfterSeconds = retryAfter ? Number.parseInt(retryAfter, 10) : undefined;
  const fallbackMeta = Number.isFinite(retryAfterSeconds)
    ? { retry_after_seconds: retryAfterSeconds }
    : {};

  try {
    const body: unknown = await response.json();
    if (isApiEnvelope<T>(body)) return body;
  } catch {
    // The app intentionally replaces malformed/non-JSON upstream responses with a safe state.
  }

  return createSafeFailure(errorCodeForStatus(response.status), fallbackMeta);
};
