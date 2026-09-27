import { useMemo, useState } from "react";
import { useNavigate } from "zmp-ui";

import { createProductSelectionSnapshot } from "@/catalogue/product-identity";
import { CatalogueSkeleton, EmptyCatalogue } from "@/components/catalogue/catalogue-feedback";
import { ProductGrid } from "@/components/catalogue/product-grid";
import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { UiIcon } from "@/components/ui-icon";
import { useLibraryProducts } from "@/hooks/use-library-products";
import { getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { useProductLibrary } from "@/state/product-library-context";
import { useQuoteWorkflow } from "@/state/quote-workflow-context";
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
  const { api, catalogueGeneration } = useAppContext();
  const { recentIds, savedIds, storageAvailable, clearRecent, reconcileMissing } = useProductLibrary();
  const { setSelectedItems, rememberSelectedProducts } = useQuoteWorkflow();
  const ids = kind === "recent" ? recentIds : savedIds;
  const library = useLibraryProducts(api, ids, reconcileMissing, catalogueGeneration);
  const route = getFoundationRoute(kind === "recent" ? "recent" : "saved");
  const pageCopy = copy[kind];
  const returnPath = useMemo(() => kind === "recent" ? "/recent" : "/saved", [kind]);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const isReadyEmpty = !library.failure && library.phase === "ready" && !library.products.length;

  const confirmClearRecent = () => setClearConfirmOpen(true);
  const clearRecentHistory = () => {
    clearRecent();
    setClearConfirmOpen(false);
  };
  const requestSavedProducts = () => {
    setSelectedItems(library.products.map((product) => ({ product_id: product.product_id, variant_id: null, quantity: null })));
    rememberSelectedProducts(library.products.map(createProductSelectionSnapshot));
    navigate("/quote", { animate: false });
  };

  return (
    <AppShell route={route}>
      {kind === "recent" ? <button className="library-back" type="button" onClick={() => navigate("/home", { animate: false })}><UiIcon name="arrowLeft" size={19} /> Trang chủ</button> : null}
      <section className={`library-heading library-heading--${kind}`}>
        <div>
          {kind === "saved" ? <p className="info-card__eyebrow">THƯ VIỆN CỦA BẠN</p> : null}
          <h1>{pageCopy.title}</h1>
          <p className="library-heading__description">{pageCopy.description}</p>
        </div>
      </section>
      <p className={`library-storage-note library-storage-note--${kind}`}>Danh sách được lưu trong trình duyệt trên thiết bị này, không đồng bộ sang thiết bị khác. Xóa dữ liệu trình duyệt sẽ xóa danh sách.</p>
      {kind === "recent" ? <div className="library-heading__actions library-heading__actions--recent">
        <output>{library.products.length} sản phẩm</output>
        {ids.length ? <button type="button" className="library-clear" onClick={confirmClearRecent}><UiIcon name="trash" size={20} />Xóa lịch sử xem</button> : null}
      </div> : null}
      {kind === "saved" ? <div className="library-heading__actions library-heading__actions--saved">
        <output>{library.products.length} sản phẩm</output>
        {library.products.length ? <button type="button" className="library-request" onClick={requestSavedProducts}>Gửi yêu cầu cho danh sách <UiIcon name="arrowRight" size={20} /></button> : null}
      </div> : null}
      {kind === "saved" && !storageAvailable ? <p className="library-storage-note"><UiIcon name="info" size={16} />Thiết bị đang giới hạn lưu trữ; danh sách chỉ giữ trong phiên mở app này.</p> : null}
      {library.phase === "loading" ? <CatalogueSkeleton cards={2} /> : null}
      {library.failure ? <SystemStatePanel state={getSystemStateForFailure(library.failure)} onRetry={library.reload} /> : null}
      {kind === "recent" && isReadyEmpty ? <section className="library-empty" aria-label="Chưa có sản phẩm đã xem">
        <UiIcon name="package" size={32} />
        <h2>Bạn chưa xem sản phẩm nào</h2>
        <p>Mở một sản phẩm trong danh mục để bắt đầu.</p>
        <button type="button" onClick={() => navigate("/products", { animate: false })}>Khám phá sản phẩm <UiIcon name="arrowRight" size={20} /></button>
      </section> : null}
      {kind === "saved" && isReadyEmpty ? <>
        <EmptyCatalogue title={pageCopy.emptyTitle} message={pageCopy.emptyMessage} />
        <button type="button" className="library-browse" onClick={() => navigate("/products", { animate: false })}>Xem sản phẩm</button>
      </> : null}
      {library.products.length ? <>
        <ProductGrid products={library.products} returnPath={returnPath} label={pageCopy.title} loadedCount={library.products.length} />
        <p className="library-progress">Đã hiển thị {library.products.length} / {library.products.length} sản phẩm</p>
      </> : null}
      {kind === "recent" && clearConfirmOpen ? <div className="library-clear-dialog" role="presentation">
        <button className="library-clear-dialog__backdrop" type="button" aria-label="Giữ lịch sử xem" onClick={() => setClearConfirmOpen(false)} />
        <section className="library-clear-dialog__card" role="dialog" aria-modal="true" aria-labelledby="clear-recent-title">
          <button type="button" aria-label="Đóng xác nhận xóa lịch sử xem" onClick={() => setClearConfirmOpen(false)}><UiIcon name="x" size={24} /></button>
          <h2 id="clear-recent-title">Xóa lịch sử xem?</h2>
          <p>Danh sách đã lưu vẫn được giữ nguyên.</p>
          <div>
            <button type="button" onClick={() => setClearConfirmOpen(false)}>Giữ lại</button>
            <button type="button" onClick={clearRecentHistory}>Xóa lịch sử xem</button>
          </div>
        </section>
      </div> : null}
    </AppShell>
  );
};

export default ProductLibraryPage;
