import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "zmp-ui";

import {
  getVisibleCategories,
  getCanonicalDomains,
  parseProductQuery,
  serializeProductQuery,
  visibleText,
} from "@/catalogue/catalogue-utils";
import { CatalogueFailure, CatalogueSkeleton } from "@/components/catalogue/catalogue-feedback";
import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { UiIcon } from "@/components/ui-icon";
import { getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { createLoadingState } from "@/state/system-state";
import { ApiFailure, CategoryDto, isApiSuccess } from "@/types/public-api";

const categoryRoute = getFoundationRoute("categories");
const CATEGORY_ICONS = ["hammer", "drill", "ruler", "sliders"] as const;

const DOMAIN_PRESENTATION = {
  POWER_TOOLS: {
    icon: "drill",
    title: "Máy và thiết bị động lực",
    description: "Pin, điện AC, khí nén",
  },
  HAND_TOOLS: {
    icon: "wrench",
    title: "Dụng cụ cầm tay",
    description: "Lắp ráp, đo đạc, sửa chữa",
  },
  ACCESSORIES: {
    icon: "zap",
    title: "Phụ kiện và vật tư",
    description: "Phụ kiện tương thích cho công việc",
  },
} as const;

type CategoryState =
  | { kind: "loading" | "success-empty"; categories: []; failure: null }
  | { kind: "success-data"; categories: CategoryDto[]; failure: null }
  | { kind: "error"; categories: []; failure: ApiFailure };

const CategoryPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { api, home, phase, systemState, refresh } = useAppContext();
  const requestedDomain = useMemo(() => parseProductQuery(location.search).domain, [location.search]);
  const canonicalDomains = useMemo(() => getCanonicalDomains(home?.domains), [home?.domains]);
  const selectedDomain = canonicalDomains.some((domain) => domain.code === requestedDomain)
    ? requestedDomain
    : canonicalDomains[0]?.code;
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

  const selectedDomainLabel = canonicalDomains.find((domain) => domain.code === selectedDomain)?.display_name ?? "Danh mục";
  const selectedPresentation = selectedDomain ? DOMAIN_PRESENTATION[selectedDomain] : undefined;

  return (
    <AppShell route={categoryRoute}>
      <section className="category-browser" aria-labelledby="category-browser-title">
        <header className="category-browser__heading">
          <h1 id="category-browser-title">Danh mục sản phẩm</h1>
          <p>Chọn nhóm dụng cụ bạn đang tìm.</p>
        </header>

        <div className="category-browser__tabs" role="tablist" aria-label="Nhóm sản phẩm">
          {canonicalDomains.map((domain) => {
            const presentation = DOMAIN_PRESENTATION[domain.code];
            const active = domain.code === selectedDomain;
            return (
              <button
                key={domain.code}
                id={`category-domain-${domain.code}`}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? "is-active" : ""}
                onClick={() => navigate(`/categories?domain=${domain.code}`, { animate: false })}
              >
                <span className="category-browser__tab-icon"><UiIcon name={presentation.icon} size={23} /></span>
                <span>{visibleText(domain.display_name)}</span>
                {active ? <UiIcon className="category-browser__tab-check" name="check" size={18} /> : null}
              </button>
            );
          })}
        </div>

        <div
          className="category-browser__panel"
          role="tabpanel"
          aria-labelledby={selectedDomain ? `category-domain-${selectedDomain}` : undefined}
        >
          <section className="category-browser__overview">
            <div className="category-browser__overview-copy">
              <span className="category-browser__overview-icon"><UiIcon name={selectedPresentation?.icon ?? "grid"} size={28} /></span>
              <div>
                <h2>{visibleText(selectedDomainLabel)}</h2>
                <p>{selectedPresentation?.description ?? "Khám phá sản phẩm công khai theo nhóm."}</p>
              </div>
            </div>
            <button
              className="category-browser__all"
              type="button"
              onClick={() => selectedDomain && navigate(`/products${serializeProductQuery({ domain: selectedDomain })}`, { animate: false })}
            >
              <UiIcon name="grid" size={20} />
              <span>Tất cả sản phẩm</span>
              <UiIcon name="arrowRight" size={21} />
            </button>
          </section>

          {categoryState.kind === "success-data" ? (
            <section className="category-browser__directory" aria-label="Khám phá theo danh mục">
              <header>
                <h3>Khám phá theo danh mục</h3>
                <span>{categoryState.categories.length} danh mục</span>
              </header>
              <ul>
                {categoryState.categories.map((category) => (
                  <li key={category.code}>
                    <button
                      type="button"
                      onClick={() => navigate(`/products${serializeProductQuery({ domain: category.domain, category: category.code })}`, { animate: false })}
                    >
                      <span className={`category-browser__directory-icon category-browser__directory-icon--${(category.sort_order - 1) % 4}`}>
                        <UiIcon name={CATEGORY_ICONS[(category.sort_order - 1) % CATEGORY_ICONS.length]} size={20} />
                      </span>
                      <span>{visibleText(category.display_name)}</span>
                      <UiIcon name="chevronRight" size={20} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </section>

      {categoryState.kind === "loading" ? <CatalogueSkeleton /> : null}
      {categoryState.failure ? <CatalogueFailure failure={categoryState.failure} onRetry={() => void loadCategories()} /> : null}
      {categoryState.kind === "success-empty" ? <>
        <section className="category-browser__empty">
          <span><UiIcon name="packageX" size={26} /></span>
          <h3>Chưa có danh mục để hiển thị</h3>
          <p>Liên hệ để được tư vấn sản phẩm phù hợp với công việc của bạn.</p>
          <button type="button" onClick={() => navigate("/contact", { animate: false })}>Tư vấn sản phẩm <UiIcon name="arrowRight" size={18} /></button>
        </section>
      </> : null}
      <aside className="category-browser__help" aria-label="Hỗ trợ chọn sản phẩm">
        <UiIcon name="helpCircle" size={20} />
        <span>Cần giúp chọn dụng cụ?</span>
        <button type="button" onClick={() => navigate("/contact", { animate: false })}>Liên hệ tư vấn <UiIcon name="chevronRight" size={18} /></button>
      </aside>
    </AppShell>
  );
};

export default CategoryPage;
