import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "@/constants/error-messages";
import { ApiClientError } from "@/services/api-client";
import {
  getMiniSessionToken,
  MINI_AUTH_PERMISSION_DENIED_EVENT,
  MINI_AUTH_SECURITY_RESET_EVENT,
  MINI_AUTH_SESSION_EXPIRED_EVENT,
} from "@/services/auth-session.service";
import {
  clearStoredWarehouseStaff,
  getCurrentWmsUser,
  getStoredWarehouseStaff,
  loginWithWmsCredentials,
  logoutWmsBackend,
  WAREHOUSE_STAFF_STORAGE_EVENT,
} from "@/services/zalo-auth.service";
import { clearWarehouseDashboardCache } from "@/services/warehouse-dashboard-cache";
import type { WarehouseStaff } from "@/types/scan.types";

const AUTH_BOOTSTRAP_CACHE_MS = 60_000;
let lastAuthBootstrapOkAt = 0;

export interface ZaloUser {
  id: string;
  name: string;
  avatar: string;
  idByOA?: string;
}

interface UseZaloAuthReturn {
  user: ZaloUser | null;
  staff: WarehouseStaff | null;
  isLoading: boolean;
  isAuthorized: boolean;
  error?: string;
  securityMode?: "session" | "permission";
  login: (email: string, password: string) => Promise<WarehouseStaff | null>;
  logout: () => void;
}

export function useZaloAuth(): UseZaloAuthReturn {
  const [staff, setStaff] = useState<WarehouseStaff | null>(() =>
    getStoredWarehouseStaff(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState<string>();
  const [securityMode, setSecurityMode] = useState<"session" | "permission">();

  useEffect(() => {
    let mounted = true;

    const syncStoredSession = () => {
      const token = getMiniSessionToken();
      const storedStaff = getStoredWarehouseStaff();

      if (!token || !storedStaff) {
        if (mounted) {
          setStaff(null);
          setIsAuthorized(false);
        }
        return;
      }

      if (mounted) {
        setStaff(storedStaff);
        setIsAuthorized(true);
        setError(undefined);
        setSecurityMode(undefined);
      }
    };

    (async () => {
      const token = getMiniSessionToken();
      const storedStaff = getStoredWarehouseStaff();

      if (!token) {
        clearStoredWarehouseStaff();
        if (mounted) {
          setStaff(null);
          setIsAuthorized(false);
          setSecurityMode(undefined);
          setIsLoading(false);
        }
        return;
      }

      if (storedStaff && Date.now() - lastAuthBootstrapOkAt < AUTH_BOOTSTRAP_CACHE_MS) {
        if (mounted) {
          setStaff(storedStaff);
          setIsAuthorized(true);
          setError(undefined);
          setSecurityMode(undefined);
          setIsLoading(false);
        }
        return;
      }

      try {
        const currentStaff = await getCurrentWmsUser();
        if (!mounted) return;
        lastAuthBootstrapOkAt = Date.now();
        setStaff(currentStaff);
        setIsAuthorized(true);
        setError(undefined);
        setSecurityMode(undefined);
      } catch (bootstrapError) {
        console.warn("WMS auth bootstrap failed", bootstrapError);
        clearStoredWarehouseStaff();
        if (mounted) {
          setStaff(null);
          setIsAuthorized(false);
          setError(getErrorMessage("SESSION_EXPIRED"));
          setSecurityMode("session");
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    const handleSessionExpired = () => {
      clearStoredWarehouseStaff();
      clearWarehouseDashboardCache();
      if (!mounted) return;
      setStaff(null);
      setIsAuthorized(false);
      setError(getErrorMessage("SESSION_EXPIRED"));
      setSecurityMode("session");
      setIsLoading(false);
    };

    const handlePermissionDenied = () => {
      if (!mounted) return;
      setError("Tài khoản chưa có quyền truy cập dữ liệu này.");
      setSecurityMode("permission");
      setIsLoading(false);
    };

    const handleSecurityReset = () => {
      if (!mounted) return;
      setError(undefined);
      setSecurityMode(undefined);
      syncStoredSession();
    };

    window.addEventListener("storage", syncStoredSession);
    window.addEventListener(WAREHOUSE_STAFF_STORAGE_EVENT, syncStoredSession);
    window.addEventListener(MINI_AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    window.addEventListener(MINI_AUTH_PERMISSION_DENIED_EVENT, handlePermissionDenied);
    window.addEventListener(MINI_AUTH_SECURITY_RESET_EVENT, handleSecurityReset);

    return () => {
      mounted = false;
      window.removeEventListener("storage", syncStoredSession);
      window.removeEventListener(WAREHOUSE_STAFF_STORAGE_EVENT, syncStoredSession);
      window.removeEventListener(MINI_AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
      window.removeEventListener(
        MINI_AUTH_PERMISSION_DENIED_EVENT,
        handlePermissionDenied,
      );
      window.removeEventListener(MINI_AUTH_SECURITY_RESET_EVENT, handleSecurityReset);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(undefined);
    setIsLoading(true);

    try {
      const loggedInStaff = await loginWithWmsCredentials(email, password);
      lastAuthBootstrapOkAt = Date.now();
      setStaff(loggedInStaff);
      setIsAuthorized(true);
      setSecurityMode(undefined);
      return loggedInStaff;
    } catch (loginError) {
      const message =
        loginError instanceof ApiClientError
          ? formatAuthApiError(loginError)
          : isAbortError(loginError)
            ? "Máy chủ phản hồi quá lâu. Vui lòng thử lại."
          : loginError instanceof TypeError
            ? "Không kết nối được backend WMS. Nếu đang chạy local, kiểm tra CORS hoặc dùng proxy dev."
            : loginError instanceof Error
          ? getErrorMessage(loginError.message, "Sai tài khoản hoặc mật khẩu.")
          : "Sai tài khoản hoặc mật khẩu.";
      setError(message);
      throw loginError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    void logoutWmsBackend().finally(() => {
      clearStoredWarehouseStaff();
      clearWarehouseDashboardCache();
    });
    lastAuthBootstrapOkAt = 0;
    setStaff(null);
    setIsAuthorized(false);
    setError(undefined);
    setSecurityMode(undefined);
  }, []);

  return {
    user: null,
    staff,
    isLoading,
    isAuthorized,
    error,
    securityMode,
    login,
    logout,
  };
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function formatAuthApiError(error: ApiClientError) {
  if (error.status === 401 || error.status === 422) {
    return "Sai tài khoản hoặc mật khẩu.";
  }

  if (error.status === 403) {
    return "Tài khoản chưa có quyền truy cập Mini App kho.";
  }

  return error.userMessage || getErrorMessage(error.errorCode, "Không thể đăng nhập.");
}
