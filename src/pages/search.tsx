import { KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "zmp-ui";

import {
  SEARCH_DEBOUNCE_MS,
  PROGRESSIVE_INITIAL_BATCH,
  PROGRESSIVE_BATCH_SIZE,
  createProductReturnPath,
  countActiveFilters,
  normalizeProductQuery,
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
import { SearchResultList } from "@/components/catalogue/search-result-list";
import { AvailabilityFilter, AvailabilityFilterValue } from "@/components/catalogue/availability-filter";
import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { UiIcon } from "@/components/ui-icon";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useProductResults } from "@/hooks/use-product-results";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { createLoadingState } from "@/state/system-state";

const searchRoute = getFoundationRoute("search");

const SearchPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { api, home, phase, systemState, refresh, catalogueGeneration } = useAppContext();
  const initialQuery = useMemo(() => parseProductQuery(location.search), [location.search]);
  const [filters, setFilters] = useState(initialQuery);
  const [searchInput, setSearchInput] = useState(initialQuery.q ?? "");
  const [filterVisible, setFilterVisible] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityFilterValue>("ALL");
  const [isComposing, setIsComposing] = useState(false);
  const { value: debouncedSearch, flush: flushSearch } = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS, !isComposing);
  const query = useMemo(
    () => normalizeProductQuery({ ...filters, q: debouncedSearch }),
    [debouncedSearch, filters],
  );
  const hasSearch = Boolean(visibleText(debouncedSearch));
  const results = useProductResults(api, query, phase === "ready" && !systemState, PROGRESSIVE_INITIAL_BATCH, PROGRESSIVE_BATCH_SIZE, "search", catalogueGeneration);
  const scrollKey = `search:${productQueryCacheKey(query)}`;
  useScrollRestoration(scrollKey, results.kind === "success-data" || results.kind === "success-empty" || results.kind === "load-more-error");
  const returnPath = createProductReturnPath(
    "/search",
    serializeProductQuery({ ...filters, q: searchInput }),
  );

  useEffect(() => {
    setFilters(initialQuery);
    setSearchInput(initialQuery.q ?? "");
  }, [initialQuery]);

  useEffect(() => {
    const hasVisibleAvailability = availability === "ALL" || results.products.some((product) => product.availability === availability);
    const canLoadMore = results.renderedCount < results.loadedCount || results.hasMore;
    if (availability !== "ALL" && !hasVisibleAvailability && canLoadMore && results.kind === "success-data") {
      void results.loadMore();
    }
  }, [availability, results.hasMore, results.kind, results.loadedCount, results.loadMore, results.products, results.renderedCount]);

  const handleSearchChange = (value: string) => setSearchInput(value);
  const handleCompositionStart = () => setIsComposing(true);
  const handleCompositionEnd = () => setIsComposing(false);
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !isComposing) {
      event.preventDefault();
      flushSearch();
    }
  };
  const searchBarProps = {
    searchValue: searchInput,
    onSearchChange: handleSearchChange,
    onSearchCompositionStart: handleCompositionStart,
    onSearchCompositionEnd: handleCompositionEnd,
    onSearchKeyDown: handleSearchKeyDown,
    onSearchSubmit: flushSearch,
  };

  if (phase === "loading") {
    return <AppShell route={searchRoute} scrollKey={scrollKey} {...searchBarProps}><SystemStatePanel state={createLoadingState()} /></AppShell>;
  }
  if (systemState) {
    return <AppShell route={searchRoute} scrollKey={scrollKey} {...searchBarProps}><SystemStatePanel state={systemState} onRetry={() => void refresh()} /></AppShell>;
  }
  const hasProducts = results.products.length > 0;
  const visibleProducts = results.products.filter((product) =>
    availability === "ALL" || product.availability === availability,
  );
  const isLoadingAvailability = availability !== "ALL"
    && !visibleProducts.length
    && (results.renderedCount < results.loadedCount || results.hasMore);
  // Availability is a customer-visible filter even though the public API
  // filters it locally. Include it in the badge so the toolbar accurately
  // reflects the active "Sẵn hàng"/"Đặt trước" state.
  const activeFilterCount = countActiveFilters(query)
    + Number(Boolean(query.domain))
    + Number(availability !== "ALL");
  const queryPending = !isComposing && searchInput !== debouncedSearch;
  const hasMoreResults = results.renderedCount < results.loadedCount || results.hasMore;
  const displayedTotal = results.totalCount ?? visibleProducts.length;

  return (
    <AppShell route={searchRoute} scrollKey={scrollKey} {...searchBarProps}>
      <section className="search-screen__title" aria-labelledby="search-screen-title">
        <span>TÌM SẢN PHẨM</span>
        <h1 id="search-screen-title">Tìm kiếm sản phẩm</h1>
        <p>Tìm theo tên, model hoặc công dụng sản phẩm.</p>
      </section>
      {queryPending || isComposing ? <p className="search-pending" role="status">Đang cập nhật kết quả tìm kiếm…</p> : null}
      <section className="search-screen__toolbar">
        <button type="button" onClick={() => setFilterVisible(true)}>
          <UiIcon name="sliders" size={18} /> Bộ lọc & sắp xếp{activeFilterCount ? ` (${activeFilterCount})` : ""}
        </button>
        <output aria-live="polite">{results.kind === "loading" ? "Đang tìm…" : `${displayedTotal} sản phẩm`}</output>
      </section>
      <AvailabilityFilter value={availability} onChange={setAvailability} />

      {results.kind === "loading" ? <CatalogueSkeleton /> : null}
      {!hasProducts && results.failure ? <CatalogueFailure failure={results.failure} onRetry={() => void results.reload()} /> : null}
      {hasSearch && results.kind === "success-empty" ? (
        <EmptyCatalogue title="Không tìm thấy sản phẩm" message="Kiểm tra lại model, mã hàng hoặc thử từ khóa ngắn hơn." onRetry={() => void results.reload()} />
      ) : null}
      {hasProducts && visibleProducts.length ? <SearchResultList products={visibleProducts} returnPath={returnPath} /> : null}
      {hasProducts && !visibleProducts.length ? <p className="catalogue-filter-empty" role="status">{isLoadingAvailability ? "Đang tìm thêm sản phẩm theo trạng thái đã chọn…" : "Chưa có sản phẩm phù hợp với trạng thái hàng đã chọn."}</p> : null}
      {hasProducts ? <>
        <InfiniteLoadTrigger loading={results.kind === "loading-more"} failure={results.kind === "load-more-error" ? results.failure : null} hasMore={hasMoreResults} onLoadMore={results.loadMore} />
        {!hasMoreResults ? <p className="search-screen__progress">Đã hiển thị {visibleProducts.length} / {displayedTotal} sản phẩm</p> : null}
      </> : null}

      <FilterSheet
        api={api}
        visible={filterVisible}
        query={query}
        availability={availability}
        domains={home?.domains ?? []}
        productCount={visibleProducts.length}
        onClose={() => setFilterVisible(false)}
        onApply={(nextQuery, nextAvailability) => {
          setFilterVisible(false);
          setAvailability(nextAvailability);
          setFilters(nextQuery);
          setSearchInput(nextQuery.q ?? "");
          navigate(`/search${serializeProductQuery(nextQuery)}`, { replace: true, animate: false });
        }}
      />
    </AppShell>
  );
};

export default SearchPage;
