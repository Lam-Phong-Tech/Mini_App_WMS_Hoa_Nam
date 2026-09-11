import { Button, Sheet } from "zmp-ui";
import { useEffect, useMemo, useState } from "react";

import {
  getFacetOptions,
  normalizeProductQuery,
  visibleText,
} from "@/catalogue/catalogue-utils";
import { AvailabilityFilter, AvailabilityFilterValue } from "@/components/catalogue/availability-filter";
import { PublicApiAdapter } from "@/services/public-api";
import {
  ApiFailure,
  DomainDto,
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
  availability: AvailabilityFilterValue;
  domains: DomainDto[];
  productCount?: number;
  onClose: () => void;
  onApply: (query: ProductQuery, availability: AvailabilityFilterValue) => void;
}

const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: "featured", label: "Mặc định" },
  { value: "name_asc", label: "Tên sản phẩm A–Z" },
];

type FacetLoadState =
  | { kind: "idle" | "loading" | "success-empty"; facets: []; failure: null }
  | { kind: "success-data"; facets: FacetDto[]; failure: null }
  | { kind: "error"; facets: []; failure: ApiFailure };

/** The approved reference only exposes the catalogue default and A–Z order.
 * Keep legacy updated_desc URLs valid in the data contract, but normalize this
 * UI back to the reference default as soon as the customer changes a filter. */
const toReferenceQuery = (query: ProductQuery): ProductQuery =>
  normalizeProductQuery({ ...query, sort: query.sort === "updated_desc" ? "featured" : query.sort });

export const FilterSheet = ({
  visible,
  api,
  query,
  availability,
  domains,
  productCount,
  onClose,
  onApply,
}: FilterSheetProps) => {
  const [draft, setDraft] = useState<ProductQuery>(() => toReferenceQuery(query));
  const [draftAvailability, setDraftAvailability] = useState<AvailabilityFilterValue>(availability);
  const [facetState, setFacetState] = useState<FacetLoadState>({ kind: "idle", facets: [], failure: null });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setDraft(toReferenceQuery(query));
    setDraftAvailability(availability);
  }, [availability, query, visible]);

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

  const categoryFacet = useMemo(
    () => facetState.kind === "success-data" ? facetState.facets.find((facet) => facet.type === "CATEGORY") ?? null : null,
    [facetState],
  );
  const categoryOptions = categoryFacet ? getFacetOptions(categoryFacet) : [];
  const applyLabel = typeof productCount === "number" ? `Áp dụng · ${productCount} sản phẩm` : "Áp dụng";
  const clearFilters = () => {
    setDraft(normalizeProductQuery({ q: query.q, sort: "featured" }));
    setDraftAvailability("ALL");
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Lọc và sắp xếp" autoHeight unmountOnClose modalClassName="catalogue-filter-sheet">
      <div className="filter-sheet__content">
        <p className="filter-sheet__intro">Chọn sản phẩm phù hợp với nhu cầu của bạn.</p>

        <section className="filter-group">
          <h3>Trạng thái hàng</h3>
          <AvailabilityFilter value={draftAvailability} onChange={setDraftAvailability} />
        </section>

        <label className="filter-select-field">
          <span>Nhóm sản phẩm</span>
          <select
            value={draft.domain ?? ""}
            onChange={(event) => {
              const domain = domains.find((candidate) => candidate.code === event.target.value)?.code;
              setDraft((current) => normalizeProductQuery({
                ...current,
                domain,
                category: undefined,
              }));
            }}
          >
            <option value="">Tất cả nhóm</option>
            {domains.map((domain) => <option key={domain.code} value={domain.code}>{visibleText(domain.display_name)}</option>)}
          </select>
        </label>

        <label className="filter-select-field">
          <span>Danh mục</span>
          <select
            value={draft.category ?? ""}
            disabled={facetState.kind === "loading"}
            onChange={(event) => setDraft((current) => normalizeProductQuery({
              ...current,
              category: event.target.value || undefined,
            }))}
          >
            <option value="">Tất cả danh mục</option>
            {categoryOptions.map((option) => <option key={option.value} value={option.value}>{visibleText(option.label)}</option>)}
          </select>
        </label>

        <label className="filter-select-field">
          <span>Sắp xếp</span>
          <select
            value={draft.sort ?? "featured"}
            onChange={(event) => setDraft((current) => normalizeProductQuery({
              ...current,
              sort: event.target.value as ProductSort,
            }))}
          >
            {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        {facetState.kind === "loading" ? <CatalogueSkeleton cards={1} /> : null}
        {facetState.failure ? <CatalogueFailure failure={facetState.failure} onRetry={() => setReloadToken((current) => current + 1)} /> : null}

        <footer className="filter-sheet__footer">
          <Button variant="secondary" onClick={clearFilters}>Xóa bộ lọc</Button>
          <Button variant="primary" onClick={() => onApply(toReferenceQuery(draft), draftAvailability)}>{applyLabel}</Button>
        </footer>
      </div>
    </Sheet>
  );
};
