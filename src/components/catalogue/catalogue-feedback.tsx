import { Button, Spinner } from "zmp-ui";
import { useEffect, useRef } from "react";

import { SafeSystemState, getSystemStateForFailure } from "@/state/system-state";
import { ApiFailure } from "@/types/public-api";

import { SystemStatePanel } from "@/components/system-state-panel";

export const CatalogueSkeleton = ({ cards = 4 }: { cards?: number }) => (
  <div className="catalogue-skeleton" aria-label="Đang tải sản phẩm" aria-busy="true">
    {Array.from({ length: cards }, (_, index) => (
      <div className="catalogue-skeleton__card" key={index}>
        <span></span>
        <i></i>
        <i></i>
      </div>
    ))}
  </div>
);

export const CatalogueFailure = ({
  failure,
  onRetry,
}: {
  failure: ApiFailure;
  onRetry: () => void;
}) => <SystemStatePanel state={getSystemStateForFailure(failure)} onRetry={onRetry} />;

export const InfiniteLoadTrigger = ({
  loading,
  hasMore,
  onLoadMore,
  failure = null,
}: {
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => Promise<void>;
  failure?: ApiFailure | null;
}) => {
  const triggerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const trigger = triggerRef.current;
    // A failed append must wait for the explicit retry control below. Leaving
    // the observer active here turns an in-viewport sentinel into a retry
    // loop, which can hide the error state and repeatedly call the API.
    if (!trigger || !hasMore || loading || failure || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void onLoadMore();
    }, {
      // The G2 measurement establishes ZaUI Page as the scroll root. Using it
      // avoids a window observer that never reaches the sentinel in Mini App.
      root: trigger.closest<HTMLElement>(".hn-page"),
      rootMargin: "160px 0px",
    });
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [failure, hasMore, loading, onLoadMore]);

  if (!hasMore) return null;

  return (
    <div className="infinite-load" ref={triggerRef}>
      {loading ? <Spinner /> : null}
      {failure ? <p className="infinite-load__error" role="status">Không thể tải thêm. Nội dung đã hiển thị vẫn được giữ lại.</p> : null}
      <Button variant="secondary" onClick={() => void onLoadMore()} disabled={loading}>
        {loading ? "Đang tải thêm" : failure ? "Thử tải lại" : "Xem thêm sản phẩm"}
      </Button>
    </div>
  );
};

export const EmptyCatalogue = ({
  title = "Hiện chưa có sản phẩm phù hợp.",
  message = "Dữ liệu sản phẩm đang được cập nhật.",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) => {
  const state: SafeSystemState = { kind: "empty", title, message };
  return <SystemStatePanel state={state} onRetry={onRetry} />;
};
