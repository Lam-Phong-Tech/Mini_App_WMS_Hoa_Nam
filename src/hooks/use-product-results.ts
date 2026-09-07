import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearProductListCache,
  getProductListCache,
  setProductListCache,
} from "@/catalogue/catalogue-session";
import {
  mergeUniqueProducts,
  normalizeProductQuery,
  productQueryCacheKey,
} from "@/catalogue/catalogue-utils";
import { PublicApiAdapter } from "@/services/public-api";
import { ApiFailure, ProductCardDto, ProductQuery, isApiSuccess } from "@/types/public-api";

export type ProductResultsState =
  | {
      kind: "idle" | "loading" | "success-empty";
      products: [];
      nextCursor: null;
      failure: null;
    }
  | {
      kind: "success-data" | "loading-more";
      products: ProductCardDto[];
      nextCursor: string | null;
      failure: null;
    }
  | {
      kind: "error" | "no-network" | "maintenance" | "rate-limit";
      products: [];
      nextCursor: null;
      failure: ApiFailure;
    };

const idleState: ProductResultsState = {
  kind: "idle",
  products: [],
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
  nextCursor: null,
  failure,
});

const createSuccessState = (
  products: ProductCardDto[],
  nextCursor: string | null,
): ProductResultsState => (
  products.length
    ? { kind: "success-data", products, nextCursor, failure: null }
    : { kind: "success-empty", products: [], nextCursor: null, failure: null }
);

export const useProductResults = (
  api: PublicApiAdapter,
  query: ProductQuery,
  enabled = true,
): ProductResultsState & { reload: () => Promise<void>; loadMore: () => Promise<void> } => {
  const normalizedQuery = normalizeProductQuery(query);
  const cacheKey = productQueryCacheKey(normalizedQuery);
  const queryRef = useRef(normalizedQuery);
  queryRef.current = normalizedQuery;
  const firstLoadRequest = useRef(0);
  const [state, setState] = useState<ProductResultsState>(idleState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const loadFirstPage = useCallback(async (force = false) => {
    const requestId = firstLoadRequest.current + 1;
    firstLoadRequest.current = requestId;
    if (!enabled) {
      setState(idleState);
      return;
    }

    if (!force) {
      const cached = getProductListCache(cacheKey);
      if (cached) {
        if (firstLoadRequest.current === requestId) {
          setState(createSuccessState(cached.products, cached.nextCursor));
        }
        return;
      }
    }

    setState({ kind: "loading", products: [], nextCursor: null, failure: null });
    const firstPageQuery = { ...queryRef.current };
    delete firstPageQuery.cursor;
    const response = await api.getProducts(firstPageQuery);
    if (firstLoadRequest.current !== requestId) return;
    if (!isApiSuccess(response)) {
      setState(createFailureState(response));
      return;
    }

    const nextState = createSuccessState(
      mergeUniqueProducts([], response.data),
      response.meta.next_cursor ?? null,
    );
    setProductListCache(cacheKey, nextState);
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
    if (!enabled || current.kind !== "success-data" || !current.nextCursor) return;

    setState({
      kind: "loading-more",
      products: current.products,
      nextCursor: current.nextCursor,
      failure: null,
    });
    const response = await api.getProducts({ ...queryRef.current, cursor: current.nextCursor });
    if (!isApiSuccess(response)) {
      setState(createFailureState(response));
      return;
    }

    const nextState = createSuccessState(
      mergeUniqueProducts(current.products, response.data),
      response.meta.next_cursor ?? null,
    );
    setProductListCache(cacheKey, nextState);
    setState(nextState);
  }, [api, cacheKey, enabled]);

  return { ...state, reload, loadMore };
};
