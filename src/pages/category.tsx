import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "zmp-ui";

import {
  getVisibleCategories,
  parseProductQuery,
  serializeProductQuery,
  visibleText,
} from "@/catalogue/catalogue-utils";
import { CatalogueFailure, CatalogueSkeleton, EmptyCatalogue } from "@/components/catalogue/catalogue-feedback";
import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { UiIcon } from "@/components/ui-icon";
import { getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { createLoadingState } from "@/state/system-state";
import { ApiFailure, CategoryDto, isApiSuccess } from "@/types/public-api";

const categoryRoute = getFoundationRoute("categories");
// Use the verified shared icon set here. The installed Lucide build does not
// expose FolderOpen reliably in the ZMP iframe bundle, which previously made
// the category route crash once the fifth live category rendered.
const CATEGORY_ICONS = ["hammer", "wrench", "ruler", "sliders"] as const;

type CategoryState =
  | { kind: "loading" | "success-empty"; categories: []; failure: null }
  | { kind: "success-data"; categories: CategoryDto[]; failure: null }
  | { kind: "error"; categories: []; failure: ApiFailure };

const CategoryPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { api, home, phase, systemState, refresh } = useAppContext();
  const requestedDomain = useMemo(() => parseProductQuery(location.search).domain, [location.search]);
  const selectedDomain = requestedDomain ?? home?.domains[0]?.code;
  const [categoryState, setCategoryState] = useState<CategoryState>({ kind: "loading", categories: [], failure: null });

  const loadCategories = useCallback(async () => {
    if (!selectedDomain) {
      setCategoryState({ kind: "success-empty", categories: [], failure: null });
      return;
    }
    setCategoryState({ kind: "loading", categories: [], failure: null });
    const response = await api.getCategories(selectedDomain);
    if (isApiSuccess(response)) {
      const categories = getVisibleCategories(response.data);
      setCategoryState(categories.length
        ? { kind: "success-data", categories, failure: null }
        : { kind: "success-empty", categories: [], failure: null });
    } else {
      setCategoryState({ kind: "error", categories: [], failure: response });
    }
  }, [api, selectedDomain]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  if (phase === "loading") {
    return <AppShell route={categoryRoute}><SystemStatePanel state={createLoadingState()} /></AppShell>;
  }
  if (systemState) {
    return <AppShell route={categoryRoute}><SystemStatePanel state={systemState} onRetry={() => void refresh()} /></AppShell>;
  }

  const selectedDomainLabel = home?.domains.find((domain) => domain.code === selectedDomain)?.display_name ?? "Danh mục";

  return (
    <AppShell route={categoryRoute}>
      <section className="catalogue-toolbar catalogue-toolbar--domains" aria-label="Chọn nhóm sản phẩm">
        {(home?.domains ?? []).map((domain) => (
          <button
            key={domain.code}
            type="button"
            className={domain.code === selectedDomain ? "is-active" : ""}
            onClick={() => navigate(`/categories?domain=${domain.code}`, { animate: false })}
          >
            {visibleText(domain.display_name)}
          </button>
        ))}
      </section>

      <section className="category-intro">
        <div>
          <span>ĐANG XEM</span>
          <h2>{visibleText(selectedDomainLabel)}</h2>
          <p>Danh mục chỉ hiển thị khi đã được publish từ Catalogue.</p>
        </div>
        <span className="category-intro__icon"><UiIcon name="hammer" size={28} /></span>
      </section>

      {categoryState.kind === "loading" ? <CatalogueSkeleton /> : null}
      {categoryState.failure ? <CatalogueFailure failure={categoryState.failure} onRetry={() => void loadCategories()} /> : null}
      {categoryState.kind === "success-empty" ? <EmptyCatalogue onRetry={() => void loadCategories()} /> : null}
      {categoryState.kind === "success-data" ? (
        <section className="category-list" aria-label="Danh mục công khai">
          <button
            className="category-card category-card--all"
            type="button"
            onClick={() => navigate(`/products${serializeProductQuery({ domain: selectedDomain })}`, { animate: false })}
          >
            <span className="category-avatar"><UiIcon name="grid" size={21} /></span>
            <span className="category-card__copy">
              <strong>Tất cả sản phẩm</strong>
              <small>Danh sách đã publish</small>
            </span>
            <UiIcon className="category-card__arrow" name="chevronRight" size={22} />
          </button>
          {categoryState.categories.map((category) => (
            <button
              className="category-card"
              key={category.code}
              type="button"
              onClick={() => navigate(`/products${serializeProductQuery({ domain: category.domain, category: category.code })}`, { animate: false })}
            >
              <span className={`category-avatar category-avatar--${(category.sort_order - 1) % 4}`}><UiIcon name={CATEGORY_ICONS[(category.sort_order - 1) % CATEGORY_ICONS.length]} size={20} /></span>
              <span className="category-card__copy">
                <strong>{visibleText(category.display_name)}</strong>
                <small>Tra cứu sản phẩm còn hàng</small>
              </span>
              <UiIcon className="category-card__arrow" name="chevronRight" size={22} />
            </button>
          ))}
        </section>
      ) : null}
    </AppShell>
  );
};

export default CategoryPage;
