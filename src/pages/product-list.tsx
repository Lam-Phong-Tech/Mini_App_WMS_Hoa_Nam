import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "zmp-ui";

import {
  createProductReturnPath,
  countActiveFilters,
  normalizeProductQuery,
  parseProductQuery,
  PRODUCT_PAGE_LIMIT,
  productQueryCacheKey,
  serializeProductQuery,
  visibleText,
} from "@/catalogue/catalogue-utils";
import { getCatalogueCountCopy, getCategoryFilterLabel, getCategoryProductTotal } from "@/catalogue/catalogue-filter-utils";
import {
  CatalogueFailure,
  CatalogueSkeleton,
} from "@/components/catalogue/catalogue-feedback";
import { FilterSheet } from "@/components/catalogue/filter-sheet";
import { AvailabilityFilter, AvailabilityFilterValue } from "@/components/catalogue/availability-filter";
import { ProductGrid } from "@/components/catalogue/product-grid";
import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { UiIcon } from "@/components/ui-icon";
import { useProductResults } from "@/hooks/use-product-results";
import { useCatalogueCategories } from "@/hooks/use-catalogue-categories";
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

const DOMAIN_FILTER_LABELS = {
  POWER_TOOLS: "Máy công cụ",
  HAND_TOOLS: "Dụng cụ cầm tay",
  ACCESSORIES: "Phụ kiện",
} as const;

export const ProductListPage = ({ openFilter = false }: { openFilter?: boolean }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { api, home, phase, systemState, refresh, catalogueGeneration } = useAppContext();
  const [filterVisible, setFilterVisible] = useState(openFilter);
  const [availability, setAvailability] = useState<AvailabilityFilterValue>("ALL");
  const dataEnabled = phase === "ready" && !systemState;
  const query = useMemo(() => parseProductQuery(location.search), [location.search]);
  const results = useProductResults(
    api,
    { ...query, limit: PRODUCT_PAGE_LIMIT },
    dataEnabled,
    PRODUCT_PAGE_LIMIT,
    PRODUCT_PAGE_LIMIT,
    "products",
    catalogueGeneration,
  );
  const categoryState = useCatalogueCategories(api, query.domain, dataEnabled);
  const categoryRefresh = useRef({ generation: catalogueGeneration, enabled: dataEnabled });
  useEffect(() => {
    const previous = categoryRefresh.current;
    categoryRefresh.current = { generation: catalogueGeneration, enabled: dataEnabled };
    // Enabling already loads categories. A refresh while still enabled must
    // also revalidate public category totals, without issuing a double load.
    if (previous.enabled && dataEnabled && previous.generation !== catalogueGeneration) categoryState.reload();
  }, [catalogueGeneration, categoryState.reload, dataEnabled]);
  const returnPath = createProductReturnPath(location.pathname, location.search);
  const scrollKey = `products:${productQueryCacheKey(query)}`;
  useScrollRestoration(scrollKey, results.kind === "success-data" || results.kind === "success-empty" || results.kind === "load-more-error");

  /* Availability is a presentation filter because the public endpoint does
     not expose an availability query.  Continue the existing cursor flow
     until the selected state has a visible card instead of falsely rendering
     an empty PREORDER result when it falls on a later page. */
  useEffect(() => {
    const hasVisibleAvailability = availability === "ALL" || results.products.some((product) => product.availability === availability);
    const canLoadMore = results.renderedCount < results.loadedCount || results.hasMore;
    if (availability !== "ALL" && !hasVisibleAvailability && canLoadMore
      && (results.kind === "success-data" || results.kind === "success-empty")) {
      void results.loadMore();
    }
  }, [availability, results.hasMore, results.kind, results.loadedCount, results.loadMore, results.products, results.renderedCount]);

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
  const hasMore = results.renderedCount < results.loadedCount || results.hasMore;
  const categoryTotal = categoryState.kind === "success-data" || categoryState.kind === "success-empty"
    ? getCategoryProductTotal(query, categoryState.categories) : null;
  const totalCount = availability === "ALL"
    ? results.totalCount ?? categoryTotal
    : !results.hasMore ? results.loadedProducts.filter((product) => product.availability === availability).length : null;
  const countCopy = getCatalogueCountCopy(visibleProducts.length, totalCount, hasMore);
  const isLoadingAvailability = availability !== "ALL"
    && !visibleProducts.length
    && (results.renderedCount < results.loadedCount || results.hasMore);
  const activeFilterCount = countActiveFilters(query) + Number(Boolean(query.domain));
  const clearAppliedFilters = () => {
    setAvailability("ALL");
    navigate(`/products${serializeProductQuery(normalizeProductQuery({ q: query.q, sort: "featured" }))}`, { replace: true, animate: false });
  };
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
            <UiIcon name="sliders" size={19} /> Bộ lọc & sắp xếp{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </button>
          <output aria-live="polite">{results.kind === "loading" ? "Đang tải…" : countCopy.result}</output>
        </div>
        <AvailabilityFilter value={availability} onChange={setAvailability} />
        {query.domain || query.category ? (
          <div className="catalogue-active-filters" aria-label="Bộ lọc đang áp dụng">
            {query.domain ? <button type="button" onClick={() => navigate(`/products${serializeProductQuery({ ...query, domain: undefined, category: undefined })}`, { replace: true, animate: false })}>{DOMAIN_FILTER_LABELS[query.domain]} <UiIcon name="x" size={14} /></button> : null}
            {query.category ? <button type="button" onClick={() => navigate(`/products${serializeProductQuery({ ...query, category: undefined })}`, { replace: true, animate: false })}>{getCategoryFilterLabel(query.category, categoryState.categories, results.loadedProducts)} <UiIcon name="x" size={14} /></button> : null}
            <button type="button" className="catalogue-active-filters__clear" onClick={clearAppliedFilters}>Xóa bộ lọc</button>
          </div>
        ) : null}
      </section>
      {visibleText(query.q) ? <p className="result-caption">Kết quả cho “{visibleText(query.q)}”</p> : null}

      {results.kind === "loading" ? <CatalogueSkeleton /> : null}
      {!hasProducts && results.failure ? <CatalogueFailure failure={results.failure} onRetry={() => void results.reload()} /> : null}
      {results.kind === "success-empty" && !hasMore ? <section className="catalogue-empty-category" aria-label="Danh mục chưa có sản phẩm">
        <span><UiIcon name="search" size={28} /></span>
        <h2>Chưa tìm thấy sản phẩm phù hợp</h2>
        <p>Thử từ khóa khác hoặc xóa bộ lọc để xem thêm sản phẩm.</p>
        <div>
          <button type="button" onClick={clearAppliedFilters}>Xem tất cả sản phẩm <UiIcon name="arrowRight" size={18} /></button>
        </div>
      </section> : null}
      {hasProducts && visibleProducts.length ? <ProductGrid products={visibleProducts} loadedCount={visibleProducts.length} returnPath={returnPath} label="Danh sách sản phẩm" /> : null}
      {hasProducts && !visibleProducts.length ? <p className="catalogue-filter-empty" role="status">{isLoadingAvailability ? "Đang tìm thêm sản phẩm theo trạng thái đã chọn…" : "Chưa có sản phẩm phù hợp với trạng thái hàng đã chọn."}</p> : null}
      {hasProducts || hasMore ? (
        <footer className="catalogue-list-footer">
          <p aria-live="polite">{countCopy.progress}</p>
          {results.kind === "load-more-error" ? <p className="infinite-load__error" role="status">Không thể tải thêm. Nội dung đã hiển thị vẫn được giữ lại.</p> : null}
          {hasMore ? <button type="button" className="catalogue-list-footer__more" disabled={results.kind === "loading-more"} onClick={() => void results.loadMore()}>
            {results.kind === "loading-more" ? "Đang tải thêm…" : results.kind === "load-more-error" ? "Thử tải lại" : "Xem thêm sản phẩm"}
            <UiIcon name="arrowRight" size={18} />
          </button> : null}
          <button type="button" onClick={() => navigate("/categories", { animate: false })}>
            Xem toàn bộ danh mục <UiIcon name="arrowRight" size={18} />
          </button>
        </footer>
      ) : null}

      <FilterSheet
        api={api}
        visible={filterVisible}
        query={query}
        availability={availability}
        domains={home?.domains ?? []}
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
