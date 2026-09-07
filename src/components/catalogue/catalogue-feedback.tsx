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
}: {
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => Promise<void>;
}) => {
  const triggerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger || !hasMore || loading || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void onLoadMore();
    }, { rootMargin: "160px" });
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  if (!hasMore) return null;

  return (
    <div className="infinite-load" ref={triggerRef}>
      {loading ? <Spinner /> : null}
      <Button variant="secondary" onClick={() => void onLoadMore()} disabled={loading}>
        {loading ? "Đang tải thêm" : "Tải thêm sản phẩm"}
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
