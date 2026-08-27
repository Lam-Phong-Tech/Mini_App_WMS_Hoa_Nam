import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppButton } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageContainer } from "@/components/ui/Page";
import { WmsModal } from "@/components/ui/WmsModal";
import {
  WmsBrand,
  WmsCard,
  WmsField,
  WmsInput,
  WmsNotice,
  WmsPageHeader,
} from "@/components/ui/WmsRuntime";
import { getErrorMessage } from "@/constants/error-messages";
import { RUNTIME_MANIFEST } from "@/constants/runtime";
import { useZaloAuth } from "@/hooks/use-zalo-auth";
import { ApiClientError } from "@/services/api-client";
import { resetMiniAuthSecurityState } from "@/services/auth-session.service";
import { clearWarehouseDashboardCache } from "@/services/warehouse-dashboard-cache";
import { clearWmsLinkContext } from "@/services/wms-link-context";
import { useScanSessionStore } from "@/stores/scan-session.store";

export type AuthScreenMode =
  | "flow"
  | "login"
  | "loading"
  | "validation"
  | "failed"
  | "session"
  | "permission"
  | "logout-confirm"
  | "logout-process"
  | "logged-out";

const AUTH_STEPS: Array<{ title: string; mode: AuthScreenMode }> = [
  { title: "Flow & gates", mode: "flow" },
  { title: "01 Login", mode: "login" },
  { title: "02 Loading", mode: "loading" },
  { title: "03 Validation", mode: "validation" },
  { title: "04 Auth Failed", mode: "failed" },
  { title: "05 Session", mode: "session" },
  { title: "06 Permission", mode: "permission" },
  { title: "07 Logout Confirm", mode: "logout-confirm" },
  { title: "08 Logout Process", mode: "logout-process" },
  { title: "09 Logged Out", mode: "logged-out" },
];

const stateCopy: Record<
  "validation" | "session" | "permission",
  {
    eyebrow: string;
    title: string;
    icon: IconName;
    description: string;
    cta: string;
    tone: "warning" | "danger";
  }
> = {
  validation: {
    eyebrow: "Bảo mật",
    title: "Cần xác thực",
    icon: "shield-check",
    description:
      "Màn này chứa dữ liệu kho nên app đang khóa truy cập khi chưa có phiên hợp lệ.",
    cta: "Đăng nhập",
    tone: "warning",
  },
  session: {
    eyebrow: "Bảo mật",
    title: "Phiên làm việc",
    icon: "clock",
    description:
      "Phiên đăng nhập đã hết hạn. Dữ liệu chưa gửi không được tự động gửi lại.",
    cta: "Đăng nhập lại",
    tone: "warning",
  },
  permission: {
    eyebrow: "403 được chuyển thành copy thân thiện",
    title: "Không có quyền",
    icon: "shield-check",
    description:
      "Bạn không có quyền thực hiện thao tác này. Liên hệ quản lý nếu cần hỗ trợ.",
    cta: "Về trang chủ",
    tone: "danger",
  },
};

export default function AuthStatePage({ mode }: { mode: AuthScreenMode }) {
  let content: JSX.Element;

  if (mode === "flow") {
    content = <AuthFlowPage />;
  } else if (
    mode === "login" ||
    mode === "loading" ||
    mode === "failed" ||
    mode === "logged-out"
  ) {
    content = <LoginRuntime mode={mode} />;
  } else if (mode === "logout-confirm" || mode === "logout-process") {
    content = <LogoutRuntime mode={mode} />;
  } else {
    content = <SecurityRuntime mode={mode} />;
  }

  return (
    <div className="wms-auth-shell fixed inset-0 z-50 touch-auto [-webkit-overflow-scrolling:touch]">
      <div className="mx-auto min-h-full max-w-md">{content}</div>
    </div>
  );
}

function AuthFlowPage() {
  return (
    <PageContainer className="space-y-4">
      <WmsBrand />
      <WmsCard>
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--wms-text-muted)]">
          Authentication
        </p>
        <div className="mt-3 space-y-2">
          {AUTH_STEPS.map((step, index) => (
            <Link
              className="wms-auth-step flex items-center gap-4 px-3 text-sm font-semibold"
              key={step.mode}
              to={`/auth/${step.mode}`}
            >
              <span className="w-7 text-[var(--wms-text-muted)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{step.title}</span>
            </Link>
          ))}
        </div>
      </WmsCard>
    </PageContainer>
  );
}

function LoginRuntime({
  mode,
}: {
  mode: "login" | "loading" | "failed" | "logged-out";
}) {
  const navigate = useNavigate();
  const { login } = useZaloAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [showLogoutNotice, setShowLogoutNotice] = useState(
    mode === "logged-out",
  );
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const showLoggedOut =
    mode === "logged-out" &&
    showLogoutNotice &&
    !submitError &&
    !touched &&
    !email &&
    !password;
  const showLoading = mode === "loading" || isSubmitting;
  const showFailed = mode === "failed" || Boolean(submitError);

  useEffect(() => {
    if (mode !== "logged-out") {
      setShowLogoutNotice(false);
      return;
    }

    setShowLogoutNotice(true);
    const timeout = window.setTimeout(() => {
      setShowLogoutNotice(false);
      navigate("/auth/login", { replace: true });
    }, 1400);

    return () => window.clearTimeout(timeout);
  }, [mode, navigate]);

  const handleLogin = async () => {
    setTouched(true);
    setShowLogoutNotice(false);
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !isValidLoginEmail(normalizedEmail) || !password) {
      window.requestAnimationFrame(() => {
        if (!normalizedEmail || !isValidLoginEmail(normalizedEmail)) {
          emailInputRef.current?.focus();
          return;
        }
        passwordInputRef.current?.focus();
      });
      return;
    }

    setIsSubmitting(true);
    setSubmitError(undefined);

    try {
      await login(normalizedEmail, password);
      navigate("/", { replace: true });
    } catch (loginError) {
      setSubmitError(formatLoginError(loginError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageContainer className="flex min-h-screen flex-col">
      <div className="pt-12">
        <WmsBrand />
      </div>

      <WmsCard className="mt-5">
        <h2 className="text-[22px] font-semibold tracking-[-0.03em] text-[var(--wms-text-strong)]">
          Đăng nhập
        </h2>
        <p className="mt-2 text-[13px] font-normal leading-5 text-[var(--wms-text-muted)]">
          Sử dụng tài khoản được cấp để tiếp tục.
        </p>

        <div className="mt-4 space-y-3">
          {showLoggedOut && (
            <WmsNotice
              tone="success"
              title="Bạn đã đăng xuất an toàn"
              description="Phiên làm việc trước đã kết thúc trên thiết bị này."
            />
          )}

          {showFailed && (
            <WmsNotice
              tone="danger"
              title="Không thể đăng nhập"
              description={
                submitError ||
                (mode === "failed"
                  ? "Sai tài khoản hoặc mật khẩu."
                  : undefined) ||
                "Kiểm tra lại tài khoản hoặc mật khẩu."
              }
            />
          )}

          <WmsField
            label="Email"
            required
            error={
              touched && !email.trim()
                ? "Vui lòng nhập email."
                : touched && !isValidLoginEmail(email.trim())
                  ? "Vui lòng nhập đúng định dạng email."
                  : undefined
            }
          >
            <WmsInput
              aria-label="Email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect="off"
              disabled={showLoading}
              inputMode="email"
              placeholder="admin@gmail.com"
              ref={emailInputRef}
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setSubmitError(undefined);
                setShowLogoutNotice(false);
              }}
            />
          </WmsField>

          <WmsField
            label="Mật khẩu"
            required
            error={touched && !password ? "Vui lòng nhập mật khẩu." : undefined}
          >
            <div className="relative">
              <WmsInput
                aria-label="Mật khẩu"
                autoComplete="current-password"
                className="pr-20"
                disabled={showLoading}
                placeholder="Nhập mật khẩu"
                ref={passwordInputRef}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setSubmitError(undefined);
                  setShowLogoutNotice(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleLogin();
                }}
              />
              <button
                className="wms-auth-password-toggle absolute inset-y-0 right-1 px-3 text-[12px] font-semibold disabled:text-[var(--wms-text-muted)]"
                disabled={showLoading}
                type="button"
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? "Ẩn" : "Hiện"}
              </button>
            </div>
          </WmsField>

          <AppButton fullWidth loading={showLoading} onClick={handleLogin}>
            {showFailed ? "Thử lại" : "Đăng nhập"}
          </AppButton>

          {showLoading && (
            <WmsNotice
              title="Đang xác thực tài khoản"
              description="Không đóng ứng dụng trong lúc xác thực."
            />
          )}
        </div>
      </WmsCard>

      <p className="mt-auto pb-2 text-center text-[10px] font-normal text-[var(--wms-text-muted)]">
        WMS Hoa Nam · Môi trường {RUNTIME_MANIFEST.env} · v
        {RUNTIME_MANIFEST.version}
      </p>
    </PageContainer>
  );
}

function formatAuthApiError(error: ApiClientError) {
  if (error.status === 401 || error.status === 422) {
    return "Sai tài khoản hoặc mật khẩu.";
  }

  if (error.status === 403) {
    return "Tài khoản chưa có quyền truy cập Mini App kho.";
  }

  return (
    error.userMessage ||
    getErrorMessage(error.errorCode, "Không thể đăng nhập.")
  );
}

function formatLoginError(loginError: unknown) {
  if (loginError instanceof ApiClientError) {
    return formatAuthApiError(loginError);
  }

  if (isAbortError(loginError)) {
    return "Máy chủ phản hồi quá lâu. Vui lòng thử lại.";
  }

  if (loginError instanceof TypeError) {
    return "Không kết nối được backend WMS. Nếu đang chạy local, kiểm tra CORS hoặc dùng proxy dev.";
  }

  return loginError instanceof Error
    ? getErrorMessage(loginError.message, "Sai tài khoản hoặc mật khẩu.")
    : "Sai tài khoản hoặc mật khẩu.";
}

function isValidLoginEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function SecurityRuntime({
  mode,
}: {
  mode: "validation" | "session" | "permission";
}) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const meta = stateCopy[mode];

  const handlePrimary = async () => {
    setIsSubmitting(true);
    if (mode === "permission") {
      resetMiniAuthSecurityState();
    }
    navigate(mode === "permission" ? "/" : "/auth/login", { replace: true });
    setIsSubmitting(false);
  };

  return (
    <PageContainer className="space-y-4">
      <WmsPageHeader
        eyebrow={meta.eyebrow}
        title={meta.title}
        onBack={() => navigate(-1)}
      />

      <section className="flex min-h-[58vh] items-center">
        <WmsCard className="w-full text-center">
          <div
            className={`wms-security-icon mx-auto ${
              meta.tone === "danger"
                ? "wms-security-icon--danger"
                : "wms-security-icon--warning"
            }`}
          >
            <Icon name={meta.icon} size={28} />
          </div>
          <h2 className="mt-4 text-[20px] font-semibold leading-7 tracking-[-0.03em] text-[var(--wms-text-strong)]">
            {mode === "permission"
              ? "Bạn không có quyền thực hiện thao tác này"
              : mode === "session"
                ? "Phiên đăng nhập đã hết hạn"
                : "Vui lòng xác thực để tiếp tục"}
          </h2>
          <p className="mx-auto mt-3 max-w-[260px] text-[13px] font-normal leading-5 text-[var(--wms-text-muted)]">
            {meta.description}
          </p>
          <AppButton
            className="mt-5"
            fullWidth
            loading={isSubmitting}
            onClick={handlePrimary}
          >
            {meta.cta}
          </AppButton>
          {mode === "permission" && (
            <button
              className="mt-3 min-h-11 text-sm font-semibold text-[var(--wms-primary)]"
              type="button"
              onClick={() => {
                resetMiniAuthSecurityState();
                navigate(-1);
              }}
            >
              Quay lại
            </button>
          )}
        </WmsCard>
      </section>
    </PageContainer>
  );
}

function LogoutRuntime({
  mode,
}: {
  mode: "logout-confirm" | "logout-process";
}) {
  const navigate = useNavigate();
  const { logout } = useZaloAuth();
  const clearScanSession = useScanSessionStore((state) => state.clearHistory);
  const closeLogoutConfirm = () => {
    const historyIndex = (window.history.state as { idx?: number } | null)
      ?.idx;

    if (typeof historyIndex === "number" && historyIndex > 0) {
      navigate(-1);
      return;
    }

    navigate("/profile", { replace: true });
  };

  useEffect(() => {
    if (mode !== "logout-process") return;

    logout();
    clearWmsLinkContext();
    clearScanSession();
    clearWarehouseDashboardCache();

    const timeout = window.setTimeout(() => {
      navigate("/auth/logged-out", { replace: true });
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [clearScanSession, logout, mode, navigate]);

  if (mode === "logout-process") {
    return (
      <PageContainer className="grid min-h-screen place-items-center">
        <WmsCard className="w-full max-w-[300px] text-center">
          <span
            aria-hidden="true"
            className="wms-loading-spinner mx-auto block h-9 w-9 border-[3px]"
          />
          <h1 className="mt-4 text-[22px] font-semibold tracking-[-0.03em] text-[var(--wms-text-strong)]">
            Đang đăng xuất...
          </h1>
          <p className="mt-2 text-[13px] font-normal leading-5 text-[var(--wms-text-muted)]">
            WMS đang kết thúc phiên và xóa dữ liệu truy cập trên thiết bị này.
          </p>
          <div className="mt-4 rounded-[var(--wms-radius-control)] bg-[var(--wms-surface-subtle)] px-3 py-2 text-[11px] font-normal text-[var(--wms-text-muted)]">
            Vui lòng chờ, không đóng ứng dụng.
          </div>
        </WmsCard>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-4">
      <WmsPageHeader
        eyebrow="Tài khoản & bảo mật"
        title="Cá nhân"
        onBack={closeLogoutConfirm}
      />

      <WmsModal
        ariaLabel="Xác nhận đăng xuất WMS"
        className="wms-modal-sheet p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
        closeOnBackdrop
        open
        onClose={closeLogoutConfirm}
      >
        <div className="wms-sheet-handle mx-auto mb-4" />
        <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-[var(--wms-text-strong)]">
          Đăng xuất khỏi WMS?
        </h1>
        <p className="mt-2 text-[13px] font-normal leading-5 text-[var(--wms-text-muted)]">
          Bạn sẽ cần đăng nhập lại để tiếp tục sử dụng hệ thống.
        </p>
        <div className="mt-4 space-y-2">
          <AppButton
            fullWidth
            variant="danger"
            onClick={() => navigate("/auth/logout-process", { replace: true })}
          >
            Đăng xuất
          </AppButton>
          <AppButton fullWidth variant="secondary" onClick={closeLogoutConfirm}>
            Hủy
          </AppButton>
        </div>
      </WmsModal>
    </PageContainer>
  );
}
