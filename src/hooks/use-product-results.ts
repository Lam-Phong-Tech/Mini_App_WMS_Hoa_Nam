import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearProductListCache,
  getCatalogueGeneration,
  getProductListCache,
  getProductViewCount,
  setProductListCache,
  setProductViewCount,
} from "@/catalogue/catalogue-session";
import {
  getNextRenderedProductCount,
  mergeUniqueProducts,
  normalizeProductQuery,
  PROGRESSIVE_BATCH_SIZE,
  PROGRESSIVE_INITIAL_BATCH,
  productQueryCacheKey,
} from "@/catalogue/catalogue-utils";
import { PublicApiAdapter } from "@/services/public-api";
import { ApiFailure, ProductCardDto, ProductPageInfo, ProductQuery, isApiSuccess } from "@/types/public-api";

export type ProductResultsKind =
  | "idle"
  | "loading"
  | "success-empty"
  | "success-data"
  | "loading-more"
  | "load-more-error"
  | "error"
  | "no-network"
  | "maintenance"
  | "rate-limit";

export interface ProductResultsState {
  kind: ProductResultsKind;
  /** Cards currently rendered. This is intentionally a subset of loadedProducts. */
  products: ProductCardDto[];
  /** Eligible records retained from completed server cursor pages. */
  loadedProducts: ProductCardDto[];
  loadedCount: number;
  renderedCount: number;
  /** Exact API total, or loaded count once the last cursor page is complete. */
  totalCount: number | null;
  nextCursor: string | null;
  hasMore: boolean;
  failure: ApiFailure | null;
}

const idleState: ProductResultsState = {
  kind: "idle",
  products: [],
  loadedProducts: [],
  loadedCount: 0,
  renderedCount: 0,
  totalCount: null,
  nextCursor: null,
  hasMore: false,
  failure: null,
};

const getFailureKind = (failure: ApiFailure): "error" | "no-network" | "maintenance" | "rate-limit" => {
  if (failure.error_code === "UPSTREAM_UNAVAILABLE" && failure.meta.transport_error !== false) return "no-network";
  if (failure.error_code === "MAINTENANCE" || failure.error_code === "SERVICE_UNAVAILABLE") return "maintenance";
  if (failure.error_code === "RATE_LIMITED" || failure.error_code === "RATE_LIMIT_EXCEEDED") return "rate-limit";
  return "error";
};

const createFailureState = (failure: ApiFailure): ProductResultsState => ({
  kind: getFailureKind(failure),
  products: [],
  loadedProducts: [],
  loadedCount: 0,
  renderedCount: 0,
  totalCount: null,
  nextCursor: null,
  hasMore: false,
  failure,
});

const createSuccessState = (
  loadedProducts: ProductCardDto[],
  pageInfo: ProductPageInfo,
  renderedCount = PROGRESSIVE_INITIAL_BATCH,
): ProductResultsState => {
  const safeRenderedCount = Math.min(Math.max(0, renderedCount), loadedProducts.length);
  const totalCount = typeof pageInfo.total === "number" && Number.isInteger(pageInfo.total) && pageInfo.total >= loadedProducts.length
    ? pageInfo.total
    : !pageInfo.has_more ? loadedProducts.length : null;
  return loadedProducts.length
    ? {
        kind: "success-data",
        products: loadedProducts.slice(0, safeRenderedCount),
        loadedProducts,
        loadedCount: loadedProducts.length,
        renderedCount: safeRenderedCount,
        totalCount,
        nextCursor: pageInfo.next_cursor,
        hasMore: pageInfo.has_more,
        failure: null,
      }
    : {
        kind: "success-empty",
        products: [],
        loadedProducts: [],
        loadedCount: 0,
        renderedCount: 0,
        totalCount,
        nextCursor: pageInfo.next_cursor,
        hasMore: pageInfo.has_more,
        failure: null,
      };
};

const toCacheEntry = (state: ProductResultsState) => ({
  products: state.loadedProducts,
  nextCursor: state.nextCursor,
  hasMore: state.hasMore,
  totalCount: state.totalCount,
});

const getPageInfo = (response: { page_info?: ProductPageInfo }): ProductPageInfo =>
  response.page_info ?? { next_cursor: null, has_more: false };

export const useProductResults = (
  api: PublicApiAdapter,
  query: ProductQuery,
  enabled = true,
  initialRenderedCount = PROGRESSIVE_INITIAL_BATCH,
  renderedBatchSize = PROGRESSIVE_BATCH_SIZE,
  viewScope = "default",
  catalogueGeneration = getCatalogueGeneration(),
): ProductResultsState & { reload: () => Promise<void>; loadMore: () => Promise<void> } => {
  const normalizedQuery = normalizeProductQuery(query);
  const cacheKey = productQueryCacheKey(normalizedQuery);
  const queryRef = useRef(normalizedQuery);
  queryRef.current = normalizedQuery;
  const requestGeneration = useRef(0);
  const observedCatalogueGeneration = useRef(catalogueGeneration);
  const activeData = useRef<{ key: string; generation: number } | null>(null);
  const loadingMore = useRef(false);
  const [state, setState] = useState<ProductResultsState>(idleState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const rememberState = useCallback((next: ProductResultsState) => {
    setProductListCache(cacheKey, toCacheEntry(next), catalogueGeneration);
    setProductViewCount(cacheKey, viewScope, next.renderedCount, catalogueGeneration);
  }, [cacheKey, catalogueGeneration, viewScope]);

  const loadFirstPage = useCallback(async (force = false) => {
    const requestId = requestGeneration.current + 1;
    requestGeneration.current = requestId;
    loadingMore.current = false;
    activeData.current = null;
    if (!enabled) {
      setState(idleState);
      return;
    }

    if (!force) {
      const cached = getProductListCache(cacheKey, catalogueGeneration);
      if (cached) {
        if (requestGeneration.current === requestId) {
          const renderedCount = getProductViewCount(cacheKey, viewScope, initialRenderedCount, catalogueGeneration);
          const nextState = createSuccessState(cached.products, {
            next_cursor: cached.nextCursor,
            has_more: cached.hasMore,
            ...(typeof cached.totalCount === "number" ? { total: cached.totalCount } : {}),
          }, renderedCount);
          setProductViewCount(cacheKey, viewScope, nextState.renderedCount, catalogueGeneration);
          activeData.current = { key: cacheKey, generation: catalogueGeneration };
          setState(nextState);
        }
        return;
      }
    }

    setState({
      kind: "loading",
      products: [],
      loadedProducts: [],
      loadedCount: 0,
      renderedCount: 0,
      totalCount: null,
      nextCursor: null,
      hasMore: false,
      failure: null,
    });
    const firstPageQuery = { ...queryRef.current };
    delete firstPageQuery.cursor;
    const response = await api.getProducts(firstPageQuery);
    if (requestGeneration.current !== requestId || catalogueGeneration !== getCatalogueGeneration()) return;
    if (!isApiSuccess(response)) {
      setState(createFailureState(response));
      return;
    }

    const nextState = createSuccessState(
      mergeUniqueProducts([], response.data),
      getPageInfo(response),
      initialRenderedCount,
    );
    rememberState(nextState);
    activeData.current = { key: cacheKey, generation: catalogueGeneration };
    setState(nextState);
  }, [api, cacheKey, catalogueGeneration, enabled, initialRenderedCount, rememberState, viewScope]);

  useEffect(() => {
    const generationChanged = observedCatalogueGeneration.current !== catalogueGeneration;
    observedCatalogueGeneration.current = catalogueGeneration;
    void loadFirstPage(generationChanged);
    return () => { requestGeneration.current += 1; };
  }, [catalogueGeneration, loadFirstPage]);

  const reload = useCallback(async () => {
    clearProductListCache(cacheKey);
    await loadFirstPage(true);
  }, [cacheKey, loadFirstPage]);

  const loadMore = useCallback(async () => {
    const current = stateRef.current;
    if (!enabled || loadingMore.current || catalogueGeneration !== getCatalogueGeneration()
      || activeData.current?.key !== cacheKey || activeData.current.generation !== catalogueGeneration) return;
    if (current.kind !== "success-data" && current.kind !== "success-empty" && current.kind !== "load-more-error") return;

    if (current.renderedCount < current.loadedCount) {
      const nextState = createSuccessState(
        current.loadedProducts,
        { next_cursor: current.nextCursor, has_more: current.hasMore, ...(typeof current.totalCount === "number" ? { total: current.totalCount } : {}) },
        getNextRenderedProductCount(current.loadedCount, current.renderedCount, renderedBatchSize),
      );
      rememberState(nextState);
      setState(nextState);
      return;
    }
    if (!current.hasMore || !current.nextCursor) return;

    const requestId = requestGeneration.current;
    const cursor = current.nextCursor;
    loadingMore.current = true;
    setState({
      ...current,
      kind: "loading-more",
      products: current.products,
      loadedProducts: current.loadedProducts,
      loadedCount: current.loadedCount,
      renderedCount: current.renderedCount,
      nextCursor: cursor,
      hasMore: true,
      failure: null,
    });
    const response = await api.getProducts({ ...queryRef.current, cursor });
    if (requestGeneration.current !== requestId || catalogueGeneration !== getCatalogueGeneration()) return;
    loadingMore.current = false;
    if (!isApiSuccess(response)) {
      setState({
        ...current,
        kind: "load-more-error",
        products: current.products,
        loadedProducts: current.loadedProducts,
        loadedCount: current.loadedCount,
        renderedCount: current.renderedCount,
        nextCursor: cursor,
        hasMore: true,
        failure: response,
      });
      return;
    }

    const mergedProducts = mergeUniqueProducts(current.loadedProducts, response.data);
    const nextState = createSuccessState(
      mergedProducts,
      getPageInfo(response),
      getNextRenderedProductCount(
        mergedProducts.length,
        current.renderedCount,
        renderedBatchSize,
      ),
    );
    rememberState(nextState);
    setState(nextState);
  }, [api, cacheKey, catalogueGeneration, enabled, rememberState, renderedBatchSize]);

  return { ...state, reload, loadMore };
};
