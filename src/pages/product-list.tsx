import { useEffect, useMemo, useState } from "react";
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
import {
  CatalogueFailure,
  CatalogueSkeleton,
  EmptyCatalogue,
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

const DOMAIN_FILTER_LABELS = {
  POWER_TOOLS: "Máy công cụ",
  HAND_TOOLS: "Dụng cụ cầm tay",
  ACCESSORIES: "Phụ kiện",
} as const;

const CATEGORY_FILTER_LABELS: Record<string, string> = {
  CLAMPING_TOOLS: "Dụng cụ kẹp giữ",
  CUTTING_TOOLS: "Dụng cụ cắt",
  ELECTRICAL_TOOLS: "Dụng cụ điện",
  FASTENING_TOOLS: "Dụng cụ siết/vặn",
  PT_DRILL_DRIVER: "Máy khoan & vặn vít",
  PT_CONCRETE: "Dụng cụ bê tông & xây nề",
};

export const ProductListPage = ({ openFilter = false }: { openFilter?: boolean }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { api, home, phase, systemState, refresh } = useAppContext();
  const [filterVisible, setFilterVisible] = useState(openFilter);
  const [availability, setAvailability] = useState<AvailabilityFilterValue>("ALL");
  const query = useMemo(() => parseProductQuery(location.search), [location.search]);
  const results = useProductResults(
    api,
    { ...query, limit: PRODUCT_PAGE_LIMIT },
    true,
    PRODUCT_PAGE_LIMIT,
  );
  const returnPath = createProductReturnPath(location.pathname, location.search);
  const scrollKey = `products:${productQueryCacheKey(query)}`;
  useScrollRestoration(scrollKey, results.kind === "success-data" || results.kind === "success-empty" || results.kind === "load-more-error");

  /* Availability is a presentation filter because the public endpoint does
     not expose an availability query.  Continue the existing cursor flow
     until the selected state has a visible card instead of falsely rendering
     an empty PREORDER result when it falls on a later page. */
  useEffect(() => {
    const hasVisibleAvailability = availability === "ALL" || results.products.some((product) => product.availability === availability);
    const canLoadMore = results.renderedCount < results.loadedCount || Boolean(results.nextCursor);
    if (availability !== "ALL" && !hasVisibleAvailability && canLoadMore && results.kind === "success-data") {
      void results.loadMore();
    }
  }, [availability, results.kind, results.loadedCount, results.loadMore, results.nextCursor, results.products, results.renderedCount]);

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
  const isLoadingAvailability = availability !== "ALL"
    && !visibleProducts.length
    && (results.renderedCount < results.loadedCount || Boolean(results.nextCursor));
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
          <output aria-live="polite">{results.kind === "loading" ? "Đang tải…" : `${visibleProducts.length} sản phẩm`}</output>
        </div>
        <AvailabilityFilter value={availability} onChange={setAvailability} />
        {query.domain || query.category ? (
          <div className="catalogue-active-filters" aria-label="Bộ lọc đang áp dụng">
            {query.domain ? <button type="button" onClick={() => navigate(`/products${serializeProductQuery({ ...query, domain: undefined, category: undefined })}`, { replace: true, animate: false })}>{DOMAIN_FILTER_LABELS[query.domain]} <UiIcon name="x" size={14} /></button> : null}
            {query.category ? <button type="button" onClick={() => navigate(`/products${serializeProductQuery({ ...query, category: undefined })}`, { replace: true, animate: false })}>{CATEGORY_FILTER_LABELS[query.category] ?? query.category} <UiIcon name="x" size={14} /></button> : null}
            <button type="button" className="catalogue-active-filters__clear" onClick={clearAppliedFilters}>Xóa bộ lọc</button>
          </div>
        ) : null}
      </section>
      {visibleText(query.q) ? <p className="result-caption">Kết quả cho “{visibleText(query.q)}”</p> : null}

      {results.kind === "loading" ? <CatalogueSkeleton /> : null}
      {!hasProducts && results.failure ? <CatalogueFailure failure={results.failure} onRetry={() => void results.reload()} /> : null}
      {results.kind === "success-empty" ? <EmptyCatalogue onRetry={() => void results.reload()} /> : null}
      {hasProducts && visibleProducts.length ? <ProductGrid products={visibleProducts} loadedCount={visibleProducts.length} returnPath={returnPath} label="Danh sách sản phẩm" /> : null}
      {hasProducts && !visibleProducts.length ? <p className="catalogue-filter-empty" role="status">{isLoadingAvailability ? "Đang tìm thêm sản phẩm theo trạng thái đã chọn…" : "Chưa có sản phẩm phù hợp với trạng thái hàng đã chọn."}</p> : null}
      {hasProducts && visibleProducts.length ? (
        <footer className="catalogue-list-footer">
          <p>Đã hiển thị {visibleProducts.length}/{visibleProducts.length} sản phẩm</p>
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
        productCount={visibleProducts.length}
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
