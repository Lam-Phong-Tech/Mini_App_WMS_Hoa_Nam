import { useEffect, useMemo, useState } from "react";
import { Button } from "zmp-ui";
import { useNavigate } from "zmp-ui";

import {
  getPublicProducts,
  getVisibleCategories,
  getVisibleHomeSections,
  visibleText,
} from "@/catalogue/catalogue-utils";
import { CatalogueSkeleton, EmptyCatalogue } from "@/components/catalogue/catalogue-feedback";
import { ProductGrid } from "@/components/catalogue/product-grid";
import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { UiIcon, UiIconName } from "@/components/ui-icon";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { CategoryDto, ProductCardDto, isApiSuccess } from "@/types/public-api";

const homeRoute = getFoundationRoute("home");

const DOMAIN_COPY = {
  POWER_TOOLS: {
    name: "Máy công cụ",
    description: "Pin, điện AC, khí nén",
  },
  HAND_TOOLS: {
    name: "Dụng cụ cầm tay",
    description: "Kẹp, siết, đo, cắt",
  },
  ACCESSORIES: {
    name: "Phụ kiện",
    description: "Pin, sạc, mũi và lưỡi",
  },
} as const;

const DOMAIN_ICONS: Record<keyof typeof DOMAIN_COPY, UiIconName> = {
  POWER_TOOLS: "hammer",
  HAND_TOOLS: "wrench",
  ACCESSORIES: "zap",
};

const CATEGORY_ICONS: UiIconName[] = ["hammer", "sliders", "ruler", "wrench"];
/* The Home page is a preview, while the full catalogue remains on its routes. */
const HOME_CATEGORY_PREVIEW_LIMIT = 4;
const HOME_PRODUCT_PREVIEW_LIMIT = 4;

const isProductSectionItem = (
  item: CategoryDto | ProductCardDto,
): item is ProductCardDto => "product_id" in item;

const HomePage = () => {
  const navigate = useNavigate();
  const { api, phase, home, systemState, usingDevMock, refresh } = useAppContext();
  const pullToRefresh = usePullToRefresh(refresh);
  const [apiCategories, setApiCategories] = useState<CategoryDto[]>([]);

  const sections = getVisibleHomeSections(home?.sections);
  const homeCategoryHighlights = useMemo(() => sections.reduce<CategoryDto[]>((categories, section) => {
    if (section.kind !== "CATEGORY_HIGHLIGHTS") return categories;
    return categories.concat(getVisibleCategories(section.items.filter((item): item is CategoryDto => !isProductSectionItem(item))));
  }, []), [sections]);

  useEffect(() => {
    let isActive = true;
    if (phase !== "ready" || systemState || homeCategoryHighlights.length) {
      setApiCategories([]);
      return () => { isActive = false; };
    }

    void api.getCategories().then((response) => {
      if (isActive && isApiSuccess(response)) {
        setApiCategories(getVisibleCategories(response.data));
      }
    });

    return () => { isActive = false; };
  }, [api, homeCategoryHighlights.length, phase, systemState]);

  if (phase === "loading") {
    return (
      <AppShell route={homeRoute} onContentTouchStart={pullToRefresh.onTouchStart} onContentTouchEnd={pullToRefresh.onTouchEnd}>
        <section className="hero-card hero-card--compact">
          <p className="hero-card__eyebrow">HOA NAM</p>
          <h2>Product Viewer</h2>
          <p>Đang kiểm tra dữ liệu công khai.</p>
        </section>
        <CatalogueSkeleton />
      </AppShell>
    );
  }

  if (systemState) {
    return (
      <AppShell route={homeRoute}>
        <SystemStatePanel state={systemState} onRetry={() => void refresh()} />
      </AppShell>
    );
  }

  const categoryHighlights = homeCategoryHighlights.length ? homeCategoryHighlights : apiCategories;
  const productSections = sections.filter((section) => section.kind !== "CATEGORY_HIGHLIGHTS");
  const heroProducts = productSections.reduce<ProductCardDto[]>((products, section) =>
    products.concat(section.items.filter(isProductSectionItem)), []);
  const heroMedia = heroProducts
    .map((product) => product.cover_media?.type === "IMAGE" ? product.cover_media.url : null)
    .find((url): url is string => Boolean(url));

  return (
    <AppShell route={homeRoute} onContentTouchStart={pullToRefresh.onTouchStart} onContentTouchEnd={pullToRefresh.onTouchEnd}>
      <button className="home-search" type="button" onClick={() => navigate("/search", { animate: false })}>
        <UiIcon name="search" size={26} strokeWidth={2} />
        <span>Tìm theo tên, model hoặc công dụng</span>
      </button>

      <section className="hero-card home-hero">
        <div className="hero-copy">
          <p className="hero-card__eyebrow"><UiIcon name="sparkles" size={16} strokeWidth={2} /> DỮ LIỆU CATALOGUE</p>
          <h2>Tìm đúng dụng cụ cho công việc</h2>
          <p>Tra cứu nhanh sản phẩm đã công khai và đang sẵn sàng.</p>
          <Button variant="primary" onClick={() => navigate("/products", { animate: false })}>Xem sản phẩm <UiIcon name="chevronRight" size={20} /></Button>
        </div>
        <div className={`hero-visual ${heroMedia ? "hero-visual--image" : ""}`} style={heroMedia ? { backgroundImage: `url("${heroMedia.replace(/"/g, "%22")}")` } : undefined} aria-hidden="true">
          {heroMedia ? null : <><span className="hero-visual__ring hero-visual__ring--one"></span><span className="hero-visual__ring hero-visual__ring--two"></span><span className="hero-visual__tool"><UiIcon name="sparkles" size={42} /></span></>}
        </div>
      </section>

      {pullToRefresh.pulling ? <p className="pull-refresh-hint" aria-live="polite">Đang tải lại thông tin công khai…</p> : null}

      <section aria-labelledby="domain-title" className="content-section">
        <div className="section-heading">
          <h2 id="domain-title">Nhóm sản phẩm</h2>
          <span>3 domain</span>
        </div>
        <div className="domain-grid">
          {(home?.domains ?? []).map((domain) => (
            <button
              key={domain.code}
              className="domain-card"
              type="button"
              onClick={() => navigate(`/categories?domain=${domain.code}`, { animate: false })}
            >
              <span className="domain-icon"><UiIcon name={DOMAIN_ICONS[domain.code]} size={27} /></span>
              <strong>{DOMAIN_COPY[domain.code].name}</strong>
              <span>{DOMAIN_COPY[domain.code].description}</span>
            </button>
          ))}
        </div>
      </section>

      {categoryHighlights.length ? (
        <section className="content-section home-category-section" aria-labelledby="main-category-title">
          <div className="section-heading home-section-heading">
            <h2 id="main-category-title">Danh mục chính</h2>
            <button type="button" onClick={() => navigate("/categories", { animate: false })}>Xem tất cả <UiIcon name="chevronRight" size={20} /></button>
          </div>
          <div className="home-category-strip">
            {categoryHighlights.slice(0, HOME_CATEGORY_PREVIEW_LIMIT).map((category, index) => (
              <button
                className="home-category-item"
                key={category.code}
                type="button"
                onClick={() => navigate(`/products?domain=${category.domain}&category=${category.code}`, { animate: false })}
              >
                <UiIcon name={CATEGORY_ICONS[index % CATEGORY_ICONS.length]} size={29} />
                <span>{visibleText(category.display_name)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {productSections.map((section) => {
        const products = getPublicProducts(section.items.filter(isProductSectionItem));
        if (!products.length) return null;
        const previewProducts = products.slice(0, HOME_PRODUCT_PREVIEW_LIMIT);

        return (
          <section className="content-section home-product-section" key={`${section.kind}:${section.title}`}>
            <div className="section-heading home-section-heading">
              <h2>{visibleText(section.title)}</h2>
              <button type="button" onClick={() => navigate("/products", { animate: false })}>Xem tất cả <UiIcon name="chevronRight" size={20} /></button>
            </div>
            <ProductGrid products={previewProducts} returnPath="/home" label={section.title} />
          </section>
        );
      })}

      {!categoryHighlights.length && !productSections.some((section) => getPublicProducts(section.items.filter(isProductSectionItem)).length) ? <EmptyCatalogue onRetry={() => void refresh()} /> : null}
      {usingDevMock ? <p className="dev-fixture-note">DEMO DEV: dữ liệu mẫu chỉ để xem giao diện, không phải Catalogue UAT hoặc Production.</p> : null}
    </AppShell>
  );
};

export default HomePage;
