import { Button, Sheet } from "zmp-ui";
import { useEffect, useMemo, useState } from "react";

import {
  countActiveFilters,
  getFacetOptions,
  normalizeProductQuery,
  resetProductFilters,
  visibleText,
} from "@/catalogue/catalogue-utils";
import { PublicApiAdapter } from "@/services/public-api";
import {
  ApiFailure,
  FacetDto,
  ProductQuery,
  ProductSort,
  isApiSuccess,
} from "@/types/public-api";

import { CatalogueFailure, CatalogueSkeleton } from "./catalogue-feedback";

interface FilterSheetProps {
  visible: boolean;
  api: PublicApiAdapter;
  query: ProductQuery;
  onClose: () => void;
  onApply: (query: ProductQuery) => void;
}

const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: "featured", label: "Nổi bật" },
  { value: "updated_desc", label: "Mới cập nhật" },
  { value: "name_asc", label: "Tên A–Z" },
];

type FacetLoadState =
  | { kind: "idle" | "loading" | "success-empty"; facets: []; failure: null }
  | { kind: "success-data"; facets: FacetDto[]; failure: null }
  | { kind: "error"; facets: []; failure: ApiFailure };

const updateMultiValue = (current: string[] | undefined, value: string): string[] | undefined => {
  const next = new Set(current ?? []);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  const values = Array.from(next);
  return values.length ? values : undefined;
};

export const FilterSheet = ({ visible, api, query, onClose, onApply }: FilterSheetProps) => {
  const [draft, setDraft] = useState<ProductQuery>(() => normalizeProductQuery(query));
  const [facetState, setFacetState] = useState<FacetLoadState>({ kind: "idle", facets: [], failure: null });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setDraft(normalizeProductQuery(query));
  }, [query, visible]);

  useEffect(() => {
    let current = true;
    if (!visible) return () => { current = false; };
    setFacetState({ kind: "loading", facets: [], failure: null });
    void api.getFacets(normalizeProductQuery(query)).then((response) => {
      if (!current) return;
      if (isApiSuccess(response)) {
        const facets = response.data.filter((facet) => getFacetOptions(facet).length);
        setFacetState(facets.length
          ? { kind: "success-data", facets, failure: null }
          : { kind: "success-empty", facets: [], failure: null });
      } else {
        setFacetState({ kind: "error", facets: [], failure: response });
      }
    });
    return () => { current = false; };
  }, [api, query, reloadToken, visible]);

  useEffect(() => {
    const page = document.querySelector<HTMLElement>(".hn-page");
    if (!visible || !page) return undefined;

    page.classList.add("disable-scrolling");
    return () => page.classList.remove("disable-scrolling");
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, visible]);

  const activeCount = useMemo(() => countActiveFilters(draft), [draft]);
  const selectValue = (facet: FacetDto, value: string) => {
    if (facet.type === "CATEGORY") {
      setDraft((current) => normalizeProductQuery({ ...current, category: current.category === value ? undefined : value }));
      return;
    }
    if (facet.type === "POWER_SOURCE") {
      setDraft((current) => normalizeProductQuery({ ...current, power_source: current.power_source === value ? undefined : value as ProductQuery["power_source"] }));
      return;
    }
    if (facet.type === "FEATURE") {
      setDraft((current) => normalizeProductQuery({ ...current, feature: updateMultiValue(current.feature, value) }));
      return;
    }
    setDraft((current) => {
      const existing = Array.isArray(current.spec?.[facet.code])
        ? current.spec?.[facet.code] as string[]
        : current.spec?.[facet.code] ? [current.spec[facet.code] as string] : undefined;
      const nextValues = updateMultiValue(existing, value);
      const nextSpec = { ...(current.spec ?? {}) };
      if (nextValues?.length) nextSpec[facet.code] = nextValues;
      else delete nextSpec[facet.code];
      return normalizeProductQuery({ ...current, spec: nextSpec });
    });
  };

  const isSelected = (facet: FacetDto, value: string): boolean => {
    if (facet.type === "CATEGORY") return draft.category === value;
    if (facet.type === "POWER_SOURCE") return draft.power_source === value;
    if (facet.type === "FEATURE") return draft.feature?.includes(value) ?? false;
    const specValue = draft.spec?.[facet.code];
    return Array.isArray(specValue) ? specValue.includes(value) : specValue === value;
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Lọc & sắp xếp" autoHeight unmountOnClose modalClassName="catalogue-filter-sheet">
      <div className="filter-sheet__content">
        <section className="filter-group">
          <h3>Sắp xếp</h3>
          <div className="filter-options">
            {SORT_OPTIONS.map((option) => (
              <button className={draft.sort === option.value ? "is-selected" : ""} key={option.value} type="button" onClick={() => setDraft((current) => normalizeProductQuery({ ...current, sort: option.value }))}>
                {option.label}
              </button>
            ))}
          </div>
        </section>

        {facetState.kind === "loading" ? <CatalogueSkeleton cards={2} /> : null}
        {facetState.failure ? <CatalogueFailure failure={facetState.failure} onRetry={() => setReloadToken((current) => current + 1)} /> : null}
        {facetState.kind === "success-data" ? facetState.facets.map((facet) => (
          <section className="filter-group" key={`${facet.type}:${facet.code}`}>
            <h3>{visibleText(facet.label)}</h3>
            <div className="filter-options">
              {getFacetOptions(facet).map((option) => (
                <button
                  className={isSelected(facet, option.value) ? "is-selected" : ""}
                  key={option.value}
                  type="button"
                  onClick={() => selectValue(facet, option.value)}
                >
                  {visibleText(option.label)}
                </button>
              ))}
            </div>
          </section>
        )) : null}

        <footer className="filter-sheet__footer">
          <Button variant="secondary" onClick={() => setDraft(resetProductFilters(query))}>Đặt lại</Button>
          <Button variant="primary" onClick={() => onApply(normalizeProductQuery(draft))}>
            Áp dụng{activeCount ? ` (${activeCount})` : ""}
          </Button>
        </footer>
      </div>
    </Sheet>
  );
};
