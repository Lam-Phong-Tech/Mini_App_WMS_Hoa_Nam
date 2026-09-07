import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "zmp-ui";

import {
  SEARCH_DEBOUNCE_MS,
  countActiveFilters,
  createProductDetailPath,
  createProductReturnPath,
  getAvailabilityLabel,
  isPreorderAvailability,
  normalizeProductQuery,
  parseProductQuery,
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
import { PublicImage } from "@/components/catalogue/public-image";
import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { UiIcon } from "@/components/ui-icon";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useProductResults } from "@/hooks/use-product-results";
import { getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { createLoadingState } from "@/state/system-state";
import { ProductCardDto } from "@/types/public-api";

const searchRoute = getFoundationRoute("search");

/** Compact list used for the empty-query "all public products" suggestion state. */
const SearchSuggestions = ({ products, returnPath }: { products: ProductCardDto[]; returnPath: string }) => {
  const navigate = useNavigate();

  return (
    <section className="search-suggestion-results" aria-label="Gợi ý sản phẩm">
      <div className="search-suggestion-results__heading">
        <span>Gợi ý sản phẩm</span>
        <strong>{products.length}</strong>
      </div>
      <div className="search-suggestion-results__list">
        {products.map((product) => (
          <button
            key={product.product_id}
            type="button"
            onClick={() => navigate(createProductDetailPath(product.slug, returnPath), { animate: false })}
            aria-label={`Xem ${product.name}`}
          >
            <PublicImage media={product.cover_media} alt={product.name} className="search-suggestion-results__image" />
            <span className="search-suggestion-results__copy">
              <strong>{visibleText(product.name)}</strong>
              <small>{[visibleText(product.model), visibleText(product.category.display_name)].filter(Boolean).join(" · ")}</small>
            </span>
            <span className={`availability-chip ${isPreorderAvailability(product.availability) ? "availability-chip--preorder" : ""}`}>{getAvailabilityLabel(product.availability)}</span>
          </button>
        ))}
      </div>
    </section>
  );
};

const SearchPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { api, phase, systemState, refresh } = useAppContext();
  const initialQuery = useMemo(() => parseProductQuery(location.search), [location.search]);
  const [filters, setFilters] = useState(initialQuery);
  const [searchInput, setSearchInput] = useState(initialQuery.q ?? "");
  const [filterVisible, setFilterVisible] = useState(false);
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const query = useMemo(
    // The suggestion screen deliberately requests the public page maximum so
    // all approved demo products are immediately visible before a term is typed.
    () => normalizeProductQuery({ ...filters, q: debouncedSearch, limit: 50 }),
    [debouncedSearch, filters],
  );
  const hasSearch = Boolean(visibleText(debouncedSearch));
  const results = useProductResults(api, query);
  const returnPath = createProductReturnPath(
    "/search",
    serializeProductQuery({ ...filters, q: searchInput }),
  );

  useEffect(() => {
    setFilters(initialQuery);
    setSearchInput(initialQuery.q ?? "");
  }, [initialQuery]);

  if (phase === "loading") {
    return <AppShell route={searchRoute} scrollKey={`search:${location.search}`}><SystemStatePanel state={createLoadingState()} /></AppShell>;
  }
  if (systemState) {
    return <AppShell route={searchRoute} scrollKey={`search:${location.search}`}><SystemStatePanel state={systemState} onRetry={() => void refresh()} /></AppShell>;
  }

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => setSearchInput(event.target.value);
  const filterCount = countActiveFilters(query);
  const hasProducts = results.products.length > 0;

  return (
    <AppShell route={searchRoute} scrollKey={`search:${location.search}`}>
      <section className="search-entry search-entry--page" aria-label="Tìm kiếm sản phẩm">
        <UiIcon name="search" size={23} strokeWidth={2} />
        <input
          type="search"
          value={searchInput}
          onChange={handleSearchChange}
          placeholder="Tên sản phẩm, model, công dụng..."
          autoComplete="off"
          maxLength={160}
        />
        {searchInput ? <button type="button" onClick={() => setSearchInput("")}>Xóa</button> : null}
      </section>
      {hasSearch ? <section className="catalogue-toolbar">
        <p>Ưu tiên model/mã hàng chính xác trước tên gần đúng.</p>
        <button type="button" onClick={() => setFilterVisible(true)}>
          Lọc{filterCount ? ` (${filterCount})` : ""}
        </button>
      </section> : null}

      {results.kind === "loading" ? <CatalogueSkeleton /> : null}
      {results.failure ? <CatalogueFailure failure={results.failure} onRetry={() => void results.reload()} /> : null}
      {hasSearch && results.kind === "success-empty" ? (
        <EmptyCatalogue title="Không tìm thấy sản phẩm" message="Kiểm tra lại model, mã hàng hoặc thử từ khóa ngắn hơn." onRetry={() => void results.reload()} />
      ) : null}
      {hasSearch && hasProducts ? <ProductGrid products={results.products} returnPath={returnPath} label="Kết quả tìm kiếm" /> : null}
      {!hasSearch && hasProducts ? <SearchSuggestions products={results.products} returnPath={returnPath} /> : null}
      {hasSearch && hasProducts ? <InfiniteLoadTrigger loading={results.kind === "loading-more"} hasMore={Boolean(results.nextCursor)} onLoadMore={results.loadMore} /> : null}

      <FilterSheet
        api={api}
        visible={filterVisible}
        query={query}
        onClose={() => setFilterVisible(false)}
        onApply={(nextQuery) => {
          setFilterVisible(false);
          setFilters(nextQuery);
          setSearchInput(nextQuery.q ?? "");
          navigate(`/search${serializeProductQuery(nextQuery)}`, { replace: true, animate: false });
        }}
      />
    </AppShell>
  );
};

export default SearchPage;
