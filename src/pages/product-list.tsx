import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "zmp-ui";

import {
  createProductReturnPath,
  parseProductQuery,
  productQueryCacheKey,
  serializeProductQuery,
  visibleText,
} from "@/catalogue/catalogue-utils";
import {
  CatalogueFailure,
  CatalogueSkeleton,
  EmptyCatalogue,
  InfiniteLoadTrigger,
} from "@/components/catalogue/catalogue-feedback";
import { FilterSheet } from "@/components/catalogue/filter-sheet";
import { AvailabilityFilter, AvailabilityFilterValue } from "@/components/catalogue/availability-filter";
import { ProductGrid } from "@/components/catalogue/product-grid";
import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { UiIcon } from "@/components/ui-icon";
import { useProductResults } from "@/hooks/use-product-results";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { createLoadingState } from "@/state/system-state";

const productsRoute = getFoundationRoute("products");
const DOMAIN_TITLES = {
  POWER_TOOLS: "Máy và thiết bị động lực",
  HAND_TOOLS: "Dụng cụ cầm tay",
  ACCESSORIES: "Phụ tùng và phụ kiện",
} as const;

export const ProductListPage = ({ openFilter = false }: { openFilter?: boolean }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { api, home, phase, systemState, refresh } = useAppContext();
  const [filterVisible, setFilterVisible] = useState(openFilter);
  const [availability, setAvailability] = useState<AvailabilityFilterValue>("ALL");
  const query = useMemo(() => parseProductQuery(location.search), [location.search]);
  const results = useProductResults(api, query);
  const returnPath = createProductReturnPath(location.pathname, location.search);
  const scrollKey = `products:${productQueryCacheKey(query)}`;
  useScrollRestoration(scrollKey, results.kind === "success-data" || results.kind === "success-empty" || results.kind === "load-more-error");

  useEffect(() => {
    if (openFilter) setFilterVisible(true);
  }, [openFilter]);

  if (phase === "loading") {
    return <AppShell route={productsRoute} scrollKey={scrollKey}><SystemStatePanel state={createLoadingState()} /></AppShell>;
  }
  if (systemState) {
    return <AppShell route={productsRoute} scrollKey={scrollKey}><SystemStatePanel state={systemState} onRetry={() => void refresh()} /></AppShell>;
  }

  const hasProducts = results.products.length > 0;
  const visibleProducts = results.products.filter((product) =>
    availability === "ALL" || product.availability === availability,
  );
  const title = query.category
    ? "Sản phẩm trong danh mục"
    : query.domain
      ? DOMAIN_TITLES[query.domain]
      : "Tất cả sản phẩm";

  return (
    <AppShell route={productsRoute} scrollKey={scrollKey}>
      <section className="catalogue-screen" aria-labelledby="catalogue-screen-title">
        <button className="catalogue-screen__back" type="button" onClick={() => navigate("/categories", { animate: false })}>
          <UiIcon name="arrowLeft" size={19} /> Danh mục theo nhóm
        </button>
        <header className="catalogue-screen__title">
          <span>KHÁM PHÁ DANH MỤC</span>
          <h1 id="catalogue-screen-title">{title}</h1>
          <p>Chọn sản phẩm để xem thông tin và gửi yêu cầu tư vấn.</p>
        </header>
        <div className="catalogue-screen__toolbar" aria-label="Điều khiển danh sách sản phẩm">
          <button type="button" onClick={() => setFilterVisible(true)}>
            <UiIcon name="sliders" size={19} /> Bộ lọc & sắp xếp
          </button>
          <output aria-live="polite">{results.kind === "loading" ? "Đang tải…" : `${visibleProducts.length} sản phẩm`}</output>
        </div>
        <AvailabilityFilter value={availability} onChange={setAvailability} />
      </section>
      {visibleText(query.q) ? <p className="result-caption">Kết quả cho “{visibleText(query.q)}”</p> : null}

      {results.kind === "loading" ? <CatalogueSkeleton /> : null}
      {!hasProducts && results.failure ? <CatalogueFailure failure={results.failure} onRetry={() => void results.reload()} /> : null}
      {results.kind === "success-empty" ? <EmptyCatalogue onRetry={() => void results.reload()} /> : null}
      {hasProducts && visibleProducts.length ? <ProductGrid products={visibleProducts} loadedCount={visibleProducts.length} returnPath={returnPath} label="Danh sách sản phẩm" /> : null}
      {hasProducts && !visibleProducts.length ? <p className="catalogue-filter-empty" role="status">Chưa có sản phẩm phù hợp với trạng thái hàng đã chọn.</p> : null}
      {hasProducts ? <InfiniteLoadTrigger loading={results.kind === "loading-more"} failure={results.kind === "load-more-error" ? results.failure : null} hasMore={results.renderedCount < results.loadedCount || Boolean(results.nextCursor)} onLoadMore={results.loadMore} /> : null}

      <FilterSheet
        api={api}
        visible={filterVisible}
        query={query}
        availability={availability}
        domains={home?.domains ?? []}
        productCount={results.loadedProducts.filter((product) => availability === "ALL" || product.availability === availability).length}
        onClose={() => {
          setFilterVisible(false);
          if (openFilter) navigate(`/products${serializeProductQuery(query)}`, { replace: true, animate: false });
        }}
        onApply={(nextQuery, nextAvailability) => {
          setFilterVisible(false);
          setAvailability(nextAvailability);
          navigate(`/products${serializeProductQuery(nextQuery)}`, { animate: false });
        }}
      />
    </AppShell>
  );
};

export default ProductListPage;
