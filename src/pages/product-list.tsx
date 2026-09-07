import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "zmp-ui";

import {
  countActiveFilters,
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
import { ProductGrid } from "@/components/catalogue/product-grid";
import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { useProductResults } from "@/hooks/use-product-results";
import { getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { createLoadingState } from "@/state/system-state";

const productsRoute = getFoundationRoute("products");

export const ProductListPage = ({ openFilter = false }: { openFilter?: boolean }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { api, phase, systemState, refresh } = useAppContext();
  const [filterVisible, setFilterVisible] = useState(openFilter);
  const query = useMemo(() => parseProductQuery(location.search), [location.search]);
  const results = useProductResults(api, query);
  const returnPath = createProductReturnPath(location.pathname, location.search);

  useEffect(() => {
    if (openFilter) setFilterVisible(true);
  }, [openFilter]);

  if (phase === "loading") {
    return <AppShell route={productsRoute} scrollKey={`products:${productQueryCacheKey(query)}`}><SystemStatePanel state={createLoadingState()} /></AppShell>;
  }
  if (systemState) {
    return <AppShell route={productsRoute} scrollKey={`products:${productQueryCacheKey(query)}`}><SystemStatePanel state={systemState} onRetry={() => void refresh()} /></AppShell>;
  }

  const filterCount = countActiveFilters(query);
  const hasProducts = results.products.length > 0;

  return (
    <AppShell route={productsRoute} scrollKey={`products:${productQueryCacheKey(query)}`}>
      <section className="catalogue-toolbar" aria-label="Điều khiển danh sách sản phẩm">
        <button type="button" onClick={() => navigate(`/search${location.search}`, { animate: false })}>Tìm kiếm</button>
        <button type="button" onClick={() => setFilterVisible(true)}>
          Lọc & sắp xếp{filterCount ? ` (${filterCount})` : ""}
        </button>
      </section>
      {visibleText(query.q) ? <p className="result-caption">Kết quả cho “{visibleText(query.q)}”</p> : null}

      {results.kind === "loading" ? <CatalogueSkeleton /> : null}
      {results.failure ? <CatalogueFailure failure={results.failure} onRetry={() => void results.reload()} /> : null}
      {results.kind === "success-empty" ? <EmptyCatalogue onRetry={() => void results.reload()} /> : null}
      {hasProducts ? <ProductGrid products={results.products} returnPath={returnPath} label="Danh sách sản phẩm" /> : null}
      {hasProducts ? <InfiniteLoadTrigger loading={results.kind === "loading-more"} hasMore={Boolean(results.nextCursor)} onLoadMore={results.loadMore} /> : null}

      <FilterSheet
        api={api}
        visible={filterVisible}
        query={query}
        onClose={() => {
          setFilterVisible(false);
          if (openFilter) navigate(`/products${serializeProductQuery(query)}`, { replace: true, animate: false });
        }}
        onApply={(nextQuery) => {
          setFilterVisible(false);
          navigate(`/products${serializeProductQuery(nextQuery)}`, { animate: false });
        }}
      />
    </AppShell>
  );
};

export default ProductListPage;
