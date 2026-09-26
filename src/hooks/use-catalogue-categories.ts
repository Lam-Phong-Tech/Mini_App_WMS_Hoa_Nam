import { useCallback, useEffect, useState } from "react";

import { getVisibleCategories } from "@/catalogue/catalogue-utils";
import { PublicApiAdapter } from "@/services/public-api";
import { ApiFailure, CategoryDto, DomainCode, isApiSuccess } from "@/types/public-api";

interface CategoryState {
  kind: "loading" | "success-data" | "success-empty" | "error";
  categories: CategoryDto[];
  failure: ApiFailure | null;
}

const loadingState: CategoryState = { kind: "loading", categories: [], failure: null };

/** Scope every response to the selected domain. A slower previous request must
 * never replace the taxonomy of the tab/filter the customer selected later. */
export const useCatalogueCategories = (api: PublicApiAdapter, domain?: DomainCode, enabled = true) => {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<CategoryState & { domain?: DomainCode; api?: PublicApiAdapter }>(loadingState);

  useEffect(() => {
    let current = true;
    if (!enabled) return undefined;
    setState({ ...loadingState, domain, api });
    void api.getCategories(domain).then((response) => {
      if (!current) return;
      if (!isApiSuccess(response)) {
        setState({ kind: "error", categories: [], failure: response, domain, api });
        return;
      }
      const categories = getVisibleCategories(response.data)
        .filter((category) => !domain || category.domain === domain);
      setState({ kind: categories.length ? "success-data" : "success-empty", categories, failure: null, domain, api });
    });
    return () => { current = false; };
  }, [api, domain, enabled, reloadToken]);

  const reload = useCallback(() => setReloadToken((value) => value + 1), []);
  const currentState = enabled && state.api === api && state.domain === domain ? state : loadingState;
  return { ...currentState, reload };
};
