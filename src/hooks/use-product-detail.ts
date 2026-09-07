import { useCallback, useEffect, useState } from "react";

import { PublicApiAdapter } from "@/services/public-api";
import { ApiFailure, ProductCardDto, ProductDetailDto, isApiSuccess } from "@/types/public-api";

interface DetailState {
  phase: "loading" | "ready" | "error";
  product: ProductDetailDto | null;
  failure: ApiFailure | null;
}

const initialState: DetailState = { phase: "loading", product: null, failure: null };

export const useProductDetail = (
  api: PublicApiAdapter,
  slug: string | undefined,
): DetailState & { reload: () => Promise<void> } => {
  const [state, setState] = useState<DetailState>(initialState);

  const load = useCallback(async () => {
    if (!slug) {
      setState({ phase: "error", product: null, failure: { success: false, message: "", data: null, meta: {}, error_code: "PRODUCT_NOT_FOUND", errors: null } });
      return;
    }
    setState(initialState);
    const response = await api.getProduct(slug);
    if (isApiSuccess(response)) setState({ phase: "ready", product: response.data, failure: null });
    else setState({ phase: "error", product: null, failure: response });
  }, [api, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
};

interface RelatedState {
  phase: "loading" | "ready" | "error";
  products: ProductCardDto[];
  failure: ApiFailure | null;
}

export const useRelatedProducts = (
  api: PublicApiAdapter,
  slug: string | undefined,
): RelatedState => {
  const [state, setState] = useState<RelatedState>({ phase: "loading", products: [], failure: null });

  useEffect(() => {
    let active = true;
    if (!slug) {
      setState({ phase: "ready", products: [], failure: null });
      return () => { active = false; };
    }
    setState({ phase: "loading", products: [], failure: null });
    void api.getRelatedProducts(slug).then((response) => {
      if (!active) return;
      if (isApiSuccess(response)) setState({ phase: "ready", products: response.data, failure: null });
      else setState({ phase: "error", products: [], failure: response });
    });
    return () => { active = false; };
  }, [api, slug]);

  return state;
};
