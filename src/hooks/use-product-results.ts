import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearProductListCache,
  getProductListCache,
  setProductListCache,
} from "@/catalogue/catalogue-session";
import {
  getNextRenderedProductCount,
  mergeUniqueProducts,
  normalizeProductQuery,
  PROGRESSIVE_INITIAL_BATCH,
  productQueryCacheKey,
} from "@/catalogue/catalogue-utils";
import { PublicApiAdapter } from "@/services/public-api";
import { ApiFailure, ProductCardDto, ProductQuery, isApiSuccess } from "@/types/public-api";

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
  nextCursor: string | null;
  failure: ApiFailure | null;
}

const idleState: ProductResultsState = {
  kind: "idle",
  products: [],
  loadedProducts: [],
  loadedCount: 0,
  renderedCount: 0,
  nextCursor: null,
  failure: null,
};

const getFailureKind = (failure: ApiFailure): "error" | "no-network" | "maintenance" | "rate-limit" => {
  if (failure.error_code === "UPSTREAM_UNAVAILABLE") return "no-network";
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
  nextCursor: null,
  failure,
});

const createSuccessState = (
  loadedProducts: ProductCardDto[],
  nextCursor: string | null,
  renderedCount = PROGRESSIVE_INITIAL_BATCH,
): ProductResultsState => {
  const safeRenderedCount = Math.min(Math.max(0, renderedCount), loadedProducts.length);
  return loadedProducts.length
    ? {
        kind: "success-data",
        products: loadedProducts.slice(0, safeRenderedCount),
        loadedProducts,
        loadedCount: loadedProducts.length,
        renderedCount: safeRenderedCount,
        nextCursor,
        failure: null,
      }
    : {
        kind: "success-empty",
        products: [],
        loadedProducts: [],
        loadedCount: 0,
        renderedCount: 0,
        nextCursor: null,
        failure: null,
      };
};

const toCacheEntry = (state: ProductResultsState) => ({
  products: state.loadedProducts,
  nextCursor: state.nextCursor,
  renderedCount: state.renderedCount,
});

export const useProductResults = (
  api: PublicApiAdapter,
  query: ProductQuery,
  enabled = true,
): ProductResultsState & { reload: () => Promise<void>; loadMore: () => Promise<void> } => {
  const normalizedQuery = normalizeProductQuery(query);
  const cacheKey = productQueryCacheKey(normalizedQuery);
  const queryRef = useRef(normalizedQuery);
  queryRef.current = normalizedQuery;
  const requestGeneration = useRef(0);
  const loadingMore = useRef(false);
  const [state, setState] = useState<ProductResultsState>(idleState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const loadFirstPage = useCallback(async (force = false) => {
    const requestId = requestGeneration.current + 1;
    requestGeneration.current = requestId;
    loadingMore.current = false;
    if (!enabled) {
      setState(idleState);
      return;
    }

    if (!force) {
      const cached = getProductListCache(cacheKey);
      if (cached) {
        if (requestGeneration.current === requestId) {
          setState(createSuccessState(cached.products, cached.nextCursor, cached.renderedCount));
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
      nextCursor: null,
      failure: null,
    });
    const firstPageQuery = { ...queryRef.current };
    delete firstPageQuery.cursor;
    const response = await api.getProducts(firstPageQuery);
    if (requestGeneration.current !== requestId) return;
    if (!isApiSuccess(response)) {
      setState(createFailureState(response));
      return;
    }

    const nextState = createSuccessState(
      mergeUniqueProducts([], response.data),
      response.meta.next_cursor ?? null,
    );
    setProductListCache(cacheKey, toCacheEntry(nextState));
    setState(nextState);
  }, [api, cacheKey, enabled]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const reload = useCallback(async () => {
    clearProductListCache(cacheKey);
    await loadFirstPage(true);
  }, [cacheKey, loadFirstPage]);

  const loadMore = useCallback(async () => {
    const current = stateRef.current;
    if (!enabled || loadingMore.current) return;
    if (current.kind !== "success-data" && current.kind !== "load-more-error") return;

    if (current.renderedCount < current.loadedCount) {
      const nextState = createSuccessState(
        current.loadedProducts,
        current.nextCursor,
        getNextRenderedProductCount(current.loadedCount, current.renderedCount),
      );
      setProductListCache(cacheKey, toCacheEntry(nextState));
      setState(nextState);
      return;
    }
    if (!current.nextCursor) return;

    const requestId = requestGeneration.current;
    const cursor = current.nextCursor;
    loadingMore.current = true;
    setState({
      kind: "loading-more",
      products: current.products,
      loadedProducts: current.loadedProducts,
      loadedCount: current.loadedCount,
      renderedCount: current.renderedCount,
      nextCursor: cursor,
      failure: null,
    });
    const response = await api.getProducts({ ...queryRef.current, cursor });
    loadingMore.current = false;
    if (requestGeneration.current !== requestId) return;
    if (!isApiSuccess(response)) {
      setState({
        kind: "load-more-error",
        products: current.products,
        loadedProducts: current.loadedProducts,
        loadedCount: current.loadedCount,
        renderedCount: current.renderedCount,
        nextCursor: cursor,
        failure: response,
      });
      return;
    }

    const mergedProducts = mergeUniqueProducts(current.loadedProducts, response.data);
    const nextState = createSuccessState(
      mergedProducts,
      response.meta.next_cursor ?? null,
      getNextRenderedProductCount(
        mergedProducts.length,
        current.renderedCount,
      ),
    );
    setProductListCache(cacheKey, toCacheEntry(nextState));
    setState(nextState);
  }, [api, cacheKey, enabled]);

  return { ...state, reload, loadMore };
};
