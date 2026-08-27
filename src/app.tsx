import React from "react";
import { RouterProvider } from "react-router-dom";
import { App, SnackbarProvider } from "zmp-ui";
import router from "@/app/routes";

export default function MiniApp() {
  return (
    <React.StrictMode>
      <App>
        <SnackbarProvider>
          <RuntimeErrorBoundary>
            <RouterProvider router={router} />
          </RuntimeErrorBoundary>
        </SnackbarProvider>
      </App>
    </React.StrictMode>
  );
}

class RuntimeErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("WMS runtime crashed", error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="wms-runtime-error min-h-screen px-4 pt-[calc(env(safe-area-inset-top)+48px)] text-[var(--wms-text)]">
        <section className="wms-card p-5">
          <div className="grid h-14 w-14 place-items-center rounded-[var(--wms-radius-control)] bg-[var(--wms-danger-soft)] text-lg font-semibold text-[var(--wms-danger-text)]">
            !
          </div>
          <h1 className="mt-4 text-[22px] font-semibold tracking-[-0.03em] text-[var(--wms-text-strong)]">
            Không mở được WMS
          </h1>
          <p className="mt-2 text-sm font-normal leading-6 text-[var(--wms-text-muted)]">
            Ứng dụng gặp lỗi khi khởi tạo. Vui lòng đóng Mini App và mở lại bản
            mới nhất.
          </p>
          <button
            className="wms-button wms-button--primary mt-4 w-full"
            onClick={() => window.location.reload()}
            type="button"
          >
            Tải lại
          </button>
        </section>
      </main>
    );
  }
}
