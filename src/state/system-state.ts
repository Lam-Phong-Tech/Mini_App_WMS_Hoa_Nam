import {
  ApiFailure,
  ApiMeta,
  PublicConfigDto,
} from "@/types/public-api";

export type SystemStateKind =
  | "loading"
  | "empty"
  | "no-network"
  | "api-error"
  | "rate-limited"
  | "maintenance"
  | "unavailable"
  | "update-required";

export interface SafeSystemState {
  kind: SystemStateKind;
  title: string;
  message: string;
  retryAfterSeconds?: number;
}

const compareVersions = (current: string, minimum: string): number => {
  const toParts = (value: string) =>
    value
      .split("-")[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const currentParts = toParts(current);
  const minimumParts = toParts(minimum);
  const maxLength = Math.max(currentParts.length, minimumParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const difference = (currentParts[index] ?? 0) - (minimumParts[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
};

export const isUpdateRequired = (
  appVersion: string,
  minimumVersion: string | null,
): boolean => Boolean(minimumVersion && compareVersions(appVersion, minimumVersion) < 0);

export const getSystemStateForFailure = (
  failure: ApiFailure,
): SafeSystemState => {
  const retryAfterSeconds = failure.meta.retry_after_seconds;

  switch (failure.error_code) {
    case "RATE_LIMITED":
    case "RATE_LIMIT_EXCEEDED":
      return {
        kind: "rate-limited",
        title: "Thao tác đang được giới hạn",
        message: "Vui lòng chờ một chút rồi thử lại.",
        retryAfterSeconds,
      };
    case "MAINTENANCE":
    case "SERVICE_UNAVAILABLE":
      return {
        kind: "maintenance",
        title: "Hệ thống đang bảo trì",
        message: "Thông tin sản phẩm sẽ sớm hoạt động trở lại.",
      };
    case "PRODUCT_NOT_FOUND":
    case "PRODUCT_NOT_AVAILABLE":
      return {
        kind: "unavailable",
        title: "Sản phẩm hiện không khả dụng",
        message: "Bạn có thể xem danh mục khác hoặc liên hệ Hoa Nam khi cấu hình đã sẵn sàng.",
      };
    case "UPSTREAM_UNAVAILABLE":
      return {
        kind: "no-network",
        title: "Không có kết nối mạng",
        message: "Kiểm tra kết nối và thử lại để tải thông tin sản phẩm.",
      };
    case "IDEMPOTENCY_CONFLICT":
      return {
        kind: "api-error",
        title: "Yêu cầu đã thay đổi",
        message: "Thông tin gửi lại không khớp yêu cầu trước đó. Vui lòng tải lại biểu mẫu rồi thử lại.",
      };
    case "VALIDATION_ERROR":
    case "VALIDATION_FAILED":
      return {
        kind: "api-error",
        title: "Thông tin chưa hợp lệ",
        message: "Vui lòng kiểm tra các trường được đánh dấu và thử lại.",
      };
    default:
      return {
        kind: "api-error",
        title: "Không thể tải dữ liệu",
        message: "Vui lòng thử lại sau ít phút.",
      };
  }
};

export const getBootstrapSystemState = (
  config: PublicConfigDto | null,
  failure: ApiFailure | null,
  appVersion: string,
): SafeSystemState | null => {
  if (config?.maintenance.enabled) {
    return {
      kind: "maintenance",
      title: "Hệ thống đang bảo trì",
      message: config.maintenance.message || "Thông tin sản phẩm sẽ sớm hoạt động trở lại.",
    };
  }

  if (isUpdateRequired(appVersion, config?.min_supported_app_version ?? null)) {
    return {
      kind: "update-required",
      title: "Cần cập nhật ứng dụng",
      message: "Vui lòng cập nhật Zalo Mini App để tiếp tục tra cứu sản phẩm.",
    };
  }

  return failure ? getSystemStateForFailure(failure) : null;
};

export const createLoadingState = (): SafeSystemState => ({
  kind: "loading",
  title: "Đang tải thông tin sản phẩm",
  message: "Vui lòng chờ trong giây lát.",
});

export const createEmptyState = (): SafeSystemState => ({
  kind: "empty",
  title: "Hiện chưa có sản phẩm phù hợp.",
  message: "Dữ liệu sản phẩm đang được cập nhật.",
});

export const createContactUnavailableState = (): SafeSystemState => ({
  kind: "empty",
  title: "Thông tin liên hệ đang được cập nhật",
  message: "Vui lòng thử lại sau. Các kênh hỗ trợ sẽ hiển thị khi được cấu hình.",
});

export const safeRetryMeta = (meta: ApiMeta): number | undefined =>
  meta.retry_after_seconds;
