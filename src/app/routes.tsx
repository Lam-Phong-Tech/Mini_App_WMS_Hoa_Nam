import { lazy, Suspense, type ReactNode } from "react";
import {
  createBrowserRouter,
  isRouteErrorResponse,
  useNavigate,
  useParams,
  useRouteError,
} from "react-router-dom";
import AuthGate from "@/app/AuthGate";
import WarehouseApp from "@/app/App";
import {
  loadApprovalQueuePage,
  loadDocumentContextPage,
  loadManualCodePage,
  loadOutboundDocumentDetailPage,
  loadOutboundReviewPage,
  loadOutboundSuccessPage,
  loadProfilePage,
  loadReceiptCreatePage,
  loadReceiptReviewPage,
  loadReceiptSuccessPage,
  loadScannerPage,
  loadScanHistoryPage,
  loadScanResultPage,
  loadWarrantyDetailPage,
  loadWarrantyPage,
  loadWarrantyReceivePage,
} from "@/app/route-modules";
import { AppButton } from "@/components/ui/Button";
import { WmsCard, WmsNotice, WmsPageHeader } from "@/components/ui/WmsRuntime";
import AuthStatePage, { type AuthScreenMode } from "@/pages/AuthStatePage";
import HomePage from "@/pages/HomePage";
import { getBasePath } from "@/utils/zma";

const DocumentContextPage = lazy(loadDocumentContextPage);
const ManualCodePage = lazy(loadManualCodePage);
const ApprovalQueuePage = lazy(loadApprovalQueuePage);
const OutboundDocumentDetailPage = lazy(loadOutboundDocumentDetailPage);
const OutboundReviewPage = lazy(loadOutboundReviewPage);
const OutboundSuccessPage = lazy(loadOutboundSuccessPage);
const ProfilePage = lazy(loadProfilePage);
const ReceiptCreatePage = lazy(loadReceiptCreatePage);
const ReceiptReviewPage = lazy(loadReceiptReviewPage);
const ReceiptSuccessPage = lazy(loadReceiptSuccessPage);
const ScannerPage = lazy(loadScannerPage);
const ScanHistoryPage = lazy(loadScanHistoryPage);
const ScanResultPage = lazy(loadScanResultPage);
const WarrantyDetailPage = lazy(loadWarrantyDetailPage);
const WarrantyPage = lazy(loadWarrantyPage);
const WarrantyReceivePage = lazy(loadWarrantyReceivePage);

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <WarehouseApp />,
      errorElement: <RouteErrorFallback />,
      children: [
        {
          index: true,
          element: (
            <AuthGate>
              <HomePage />
            </AuthGate>
          ),
        },
        {
          path: "auth",
          element: <AuthStatePage mode="flow" />,
        },
        {
          path: "auth/:mode",
          element: <AuthStateRoute />,
        },
        {
          path: "documents/RECEIPT",
          element: (
            <ProtectedLazyRoute>
              <ReceiptCreatePage />
            </ProtectedLazyRoute>
          ),
        },
        {
          path: "documents/:context",
          element: (
            <ProtectedLazyRoute>
              <DocumentContextPage />
            </ProtectedLazyRoute>
          ),
        },
        {
          path: "scanner/:context",
          element: (
            <ProtectedLazyRoute fallback={<ScannerRouteLoading />}>
              <ScannerPage />
            </ProtectedLazyRoute>
          ),
        },
        {
          path: "manual/:context",
          element: (
            <ProtectedLazyRoute>
              <ManualCodePage />
            </ProtectedLazyRoute>
          ),
        },
        {
          path: "result/:id",
          element: (
            <ProtectedLazyRoute>
              <ScanResultPage />
            </ProtectedLazyRoute>
          ),
        },
        {
          path: "receipt-review/:receiptId",
          element: (
            <ProtectedLazyRoute>
              <ReceiptReviewPage />
            </ProtectedLazyRoute>
          ),
        },
        {
          path: "outbound-review/:outboundId",
          element: (
            <ProtectedLazyRoute>
              <OutboundReviewPage />
            </ProtectedLazyRoute>
          ),
        },
        {
          path: "approvals/outbound/:documentId",
          element: (
            <ProtectedLazyRoute>
              <OutboundDocumentDetailPage />
            </ProtectedLazyRoute>
          ),
        },
        {
          path: "outbound-success/:documentId",
          element: (
            <ProtectedLazyRoute>
              <OutboundSuccessPage />
            </ProtectedLazyRoute>
          ),
        },
        {
          path: "receipt-success/:receiptId",
          element: (
            <ProtectedLazyRoute>
              <ReceiptSuccessPage />
            </ProtectedLazyRoute>
          ),
        },
        {
          path: "history",
          element: (
            <ProtectedLazyRoute>
              <ScanHistoryPage />
            </ProtectedLazyRoute>
          ),
        },
        {
          path: "history/OUTBOUND/:documentId",
          element: (
            <ProtectedLazyRoute>
              <OutboundDocumentDetailPage />
            </ProtectedLazyRoute>
          ),
        },
        {
          path: "history/outbound/:documentId",
          element: (
            <ProtectedLazyRoute>
              <OutboundDocumentDetailPage />
            </ProtectedLazyRoute>
          ),
        },
        {
          path: "approvals",
          element: (
            <ProtectedLazyRoute>
              <ApprovalQueuePage />
            </ProtectedLazyRoute>
          ),
        },
        {
          path: "warranty",
          element: (
            <ProtectedLazyRoute>
              <WarrantyPage />
            </ProtectedLazyRoute>
          ),
        },
        {
          path: "warranty/receive",
          element: (
            <ProtectedLazyRoute>
              <WarrantyReceivePage />
            </ProtectedLazyRoute>
          ),
        },
        {
          path: "warranty/:caseId",
          element: (
            <ProtectedLazyRoute>
              <WarrantyDetailPage />
            </ProtectedLazyRoute>
          ),
        },
        {
          path: "profile",
          element: (
            <ProtectedLazyRoute>
              <ProfilePage />
            </ProtectedLazyRoute>
          ),
        },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ],
  {
    basename: getBasePath(),
  },
);

export default router;

const validAuthModes: AuthScreenMode[] = [
  "flow",
  "login",
  "loading",
  "validation",
  "failed",
  "session",
  "permission",
  "logout-confirm",
  "logout-process",
  "logged-out",
];

function AuthStateRoute() {
  const { mode } = useParams();

  return (
    <AuthStatePage
      mode={
        validAuthModes.includes(mode as AuthScreenMode)
          ? (mode as AuthScreenMode)
          : "flow"
      }
    />
  );
}

function ProtectedLazyRoute({
  children,
  fallback = <RouteLoadingSkeleton />,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (
    <AuthGate>
      <Suspense fallback={fallback}>{children}</Suspense>
    </AuthGate>
  );
}

function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <main className="wms-page min-h-screen px-4 pb-8 pt-[calc(env(safe-area-inset-top)+28px)] text-[var(--wms-text)]">
      <div className="mx-auto max-w-md space-y-4">
        <WmsPageHeader
          title="Không tìm thấy màn hình"
          onBack={() => navigate("/")}
        />
        <WmsNotice
          tone="warning"
          title="Đường dẫn không hợp lệ"
          description="Màn này không còn tồn tại hoặc bản app đang mở chưa được cập nhật route."
        />
        <AppButton fullWidth onClick={() => navigate("/")}>
          Về trang chủ
        </AppButton>
      </div>
    </main>
  );
}

function ScannerRouteLoading() {
  return (
    <main className="wms-page min-h-screen px-4 pb-8 pt-[calc(env(safe-area-inset-top)+28px)] text-[var(--wms-text)]">
      <WmsCard className="mx-auto max-w-md p-5 text-center" role="status">
        <span className="wms-loading-spinner mx-auto block" />
        <h1 className="mt-4 text-[17px] font-semibold tracking-[-0.03em] text-[var(--wms-text-strong)]">
          Đang chuẩn bị máy quét
        </h1>
        <p className="mt-2 text-sm font-normal leading-6 text-[var(--wms-text-muted)]">
          Đang tải công cụ quét mã. Camera chỉ được yêu cầu sau khi màn quét sẵn
          sàng.
        </p>
      </WmsCard>
    </main>
  );
}

function RouteLoadingSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Đang chuẩn bị màn hình"
      className="wms-page min-h-screen px-4 pb-8 pt-[calc(env(safe-area-inset-top)+28px)] text-[var(--wms-text)]"
      role="status"
    >
      <div className="mx-auto max-w-md space-y-4">
        <div className="wms-skeleton h-5 w-24" />
        <WmsCard className="space-y-4 p-4">
          <div className="wms-skeleton h-6 w-3/5" />
          <div className="wms-skeleton h-4 w-full" />
          <div className="wms-skeleton h-4 w-4/5" />
        </WmsCard>
        <div className="grid grid-cols-2 gap-3">
          <WmsCard className="space-y-3 p-4">
            <div className="wms-skeleton h-5 w-1/2" />
            <div className="wms-skeleton h-8 w-2/5" />
          </WmsCard>
          <WmsCard className="space-y-3 p-4">
            <div className="wms-skeleton h-5 w-1/2" />
            <div className="wms-skeleton h-8 w-2/5" />
          </WmsCard>
        </div>
      </div>
    </main>
  );
}

function RouteErrorFallback() {
  const error = useRouteError();
  const navigate = useNavigate();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Ứng dụng gặp lỗi không xác định.";

  return (
    <main className="wms-page min-h-screen px-4 pb-8 pt-[calc(env(safe-area-inset-top)+28px)] text-[var(--wms-text)]">
      <div className="mx-auto max-w-md space-y-4">
        <WmsPageHeader title="Ứng dụng gặp lỗi" onBack={() => navigate("/")} />
        <WmsNotice
          tone="danger"
          title="Không mở được màn hình"
          description={message}
        />
        <AppButton fullWidth onClick={() => navigate("/")}>
          Về trang chủ
        </AppButton>
      </div>
    </main>
  );
}
