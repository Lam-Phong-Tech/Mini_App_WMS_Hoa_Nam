import { useCallback, useEffect, useMemo, useState } from "react";

import { orderProductsByIds } from "@/library/product-library";
import { createSafeFailure } from "@/services/api-client";
import { PublicApiAdapter } from "@/services/public-api";
import { ApiFailure, ProductCardDto, isApiSuccess } from "@/types/public-api";

interface LibraryProductsState {
  phase: "loading" | "ready";
  products: ProductCardDto[];
  failure: ApiFailure | null;
}

const chunkIds = (ids: string[], size = 50): string[][] => {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size));
  return chunks;
};

const waitForTransientRetry = () => new Promise<void>((resolve) => window.setTimeout(resolve, 300));

/** Rehydrates ID-only persistent lists without scanning catalogue pages. */
export const useLibraryProducts = (
  api: PublicApiAdapter,
  ids: string[],
  onMissing: (productIds: string[]) => void,
) => {
  const idsKey = ids.join("|");
  const [state, setState] = useState<LibraryProductsState>({ phase: "ready", products: [], failure: null });
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    if (!ids.length) {
      setState({ phase: "ready", products: [], failure: null });
      return () => { active = false; };
    }

    setState((current) => ({ ...current, phase: "loading", failure: null }));
    const loadBatches = async () => {
      const batches = chunkIds(ids);
      let responses = await Promise.all(batches.map((batch) => api.getProductsByIds(batch)));
      const transientFailure = responses.find((response): response is ApiFailure => !isApiSuccess(response) && response.error_code === "UPSTREAM_UNAVAILABLE");
      if (transientFailure) {
        await waitForTransientRetry();
        if (!active) return null;
        responses = await Promise.all(batches.map((batch) => api.getProductsByIds(batch)));
      }
      return responses;
    };

    void loadBatches().then((responses) => {
      if (!active) return;
      if (!responses) return;
      const failure = responses.find((response): response is ApiFailure => !isApiSuccess(response));
      if (failure) {
        // Network/validation failures never modify saved/recent IDs.
        setState({ phase: "ready", products: [], failure });
        return;
      }

      const successful = responses.filter(isApiSuccess);
      const products = successful.reduce<ProductCardDto[]>((all, response) => all.concat(response.data.items), []);
      const missing = successful.reduce<string[]>((all, response) => all.concat(response.data.missing_ids), []);
      if (missing.length) onMissing(missing);
      setState({ phase: "ready", products: orderProductsByIds(ids, products), failure: null });
    }).catch(() => {
      // A thrown adapter error is not an empty library. Keep all IDs and
      // surface a retryable state instead of concealing the failure.
      if (active) setState({ phase: "ready", products: [], failure: createSafeFailure("UPSTREAM_UNAVAILABLE") });
    });

    return () => { active = false; };
  }, [api, idsKey, onMissing, refreshToken]);

  const reload = useCallback(() => setRefreshToken((current) => current + 1), []);

  return useMemo(() => ({ ...state, reload }), [reload, state]);
};
