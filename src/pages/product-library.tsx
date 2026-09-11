import { useMemo } from "react";
import { useNavigate } from "zmp-ui";

import { CatalogueSkeleton, EmptyCatalogue } from "@/components/catalogue/catalogue-feedback";
import { ProductGrid } from "@/components/catalogue/product-grid";
import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { UiIcon } from "@/components/ui-icon";
import { useLibraryProducts } from "@/hooks/use-library-products";
import { getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { useProductLibrary } from "@/state/product-library-context";
import { getSystemStateForFailure } from "@/state/system-state";

export type ProductLibraryPageKind = "recent" | "saved";

const copy: Record<ProductLibraryPageKind, { title: string; description: string; emptyTitle: string; emptyMessage: string }> = {
  recent: {
    title: "Sản phẩm đã xem",
    description: "Tiếp tục tìm hiểu những sản phẩm bạn vừa quan tâm.",
    emptyTitle: "Chưa có sản phẩm đã xem",
    emptyMessage: "Sản phẩm bạn mở sẽ xuất hiện tại đây trên thiết bị này.",
  },
  saved: {
    title: "Sản phẩm đã lưu",
    description: "Giữ lại sản phẩm quan tâm để xem và gửi yêu cầu khi bạn cần.",
    emptyTitle: "Chưa có sản phẩm đã lưu",
    emptyMessage: "Nhấn biểu tượng lưu tại sản phẩm để xem lại sau.",
  },
};

const ProductLibraryPage = ({ kind }: { kind: ProductLibraryPageKind }) => {
  const navigate = useNavigate();
  const { api } = useAppContext();
  const { recentIds, savedIds, storageAvailable, clearRecent, reconcileMissing } = useProductLibrary();
  const ids = kind === "recent" ? recentIds : savedIds;
  const library = useLibraryProducts(api, ids, reconcileMissing);
  const route = getFoundationRoute(kind === "recent" ? "recent" : "saved");
  const pageCopy = copy[kind];
  const returnPath = useMemo(() => kind === "recent" ? "/recent" : "/saved", [kind]);

  const confirmClearRecent = () => {
    if (typeof window === "undefined" || window.confirm("Xóa toàn bộ lịch sử sản phẩm đã xem trên thiết bị này?")) clearRecent();
  };

  return (
    <AppShell route={route}>
      <section className="library-heading">
        <div>
          <p className="info-card__eyebrow">THƯ VIỆN CỦA BẠN</p>
          <h1>{pageCopy.title}</h1>
          <p className="library-heading__description">{pageCopy.description}</p>
        </div>
        <div className="library-heading__actions">
          <output>{library.products.length} sản phẩm</output>
          {kind === "recent" && ids.length ? <button type="button" className="library-clear" onClick={confirmClearRecent}>Xóa lịch sử</button> : null}
        </div>
      </section>
      {!storageAvailable ? <p className="library-storage-note"><UiIcon name="info" size={16} />Thiết bị đang giới hạn lưu trữ; danh sách chỉ giữ trong phiên mở app này.</p> : null}
      {library.phase === "loading" ? <CatalogueSkeleton cards={2} /> : null}
      {library.failure ? <SystemStatePanel state={getSystemStateForFailure(library.failure)} onRetry={library.reload} /> : null}
      {!library.failure && library.phase === "ready" && !library.products.length ? <>
        <EmptyCatalogue title={pageCopy.emptyTitle} message={pageCopy.emptyMessage} />
        <button type="button" className="library-browse" onClick={() => navigate("/products", { animate: false })}>Xem sản phẩm</button>
      </> : null}
      {library.products.length ? <ProductGrid products={library.products} returnPath={returnPath} label={pageCopy.title} loadedCount={library.products.length} /> : null}
    </AppShell>
  );
};

export default ProductLibraryPage;
