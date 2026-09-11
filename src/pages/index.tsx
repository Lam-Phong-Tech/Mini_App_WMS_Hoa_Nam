import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "zmp-ui";

import {
  getPublicProducts,
  getVisibleCategories,
  getVisibleHomeSections,
  visibleText,
} from "@/catalogue/catalogue-utils";
import { CatalogueSkeleton, EmptyCatalogue } from "@/components/catalogue/catalogue-feedback";
import { AvailabilityFilter, AvailabilityFilterValue } from "@/components/catalogue/availability-filter";
import { ProductGrid } from "@/components/catalogue/product-grid";
import { AppShell } from "@/components/app-shell";
import { UiButton } from "@/components/ui-button";
import { SystemStatePanel } from "@/components/system-state-panel";
import { UiIcon, UiIconName } from "@/components/ui-icon";
import { useLibraryProducts } from "@/hooks/use-library-products";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useProductResults } from "@/hooks/use-product-results";
import { getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { useProductLibrary } from "@/state/product-library-context";
import { CategoryDto, ProductCardDto, isApiSuccess } from "@/types/public-api";

const homeRoute = getFoundationRoute("home");

const DOMAIN_ICONS: Record<"POWER_TOOLS" | "HAND_TOOLS" | "ACCESSORIES", UiIconName> = {
  POWER_TOOLS: "hammer",
  HAND_TOOLS: "wrench",
  ACCESSORIES: "zap",
};

const DOMAIN_DESCRIPTIONS: Record<"POWER_TOOLS" | "HAND_TOOLS" | "ACCESSORIES", string> = {
  POWER_TOOLS: "Pin, điện AC, khí nén",
  HAND_TOOLS: "Kẹp, siết, đo, cắt",
  ACCESSORIES: "Pin, sạc, mũi và lưỡi",
};

const CATEGORY_ICONS: UiIconName[] = ["hammer", "sliders", "ruler", "wrench"];
const HOME_CATEGORY_PREVIEW_LIMIT = 4;
const HOME_RECENT_PREVIEW_LIMIT = 1;
const HOME_CATALOGUE_PREVIEW_LIMIT = 7;

const isProductSectionItem = (
  item: CategoryDto | ProductCardDto,
): item is ProductCardDto => "product_id" in item;

const HomePage = () => {
  const navigate = useNavigate();
  const { api, phase, home, systemState, usingDevMock, refresh } = useAppContext();
  const { recentIds, reconcileMissing } = useProductLibrary();
  const pullToRefresh = usePullToRefresh(refresh);
  const [apiCategories, setApiCategories] = useState<CategoryDto[]>([]);
  const [catalogueAvailability, setCatalogueAvailability] = useState<AvailabilityFilterValue>("ALL");

  const sections = getVisibleHomeSections(home?.sections);
  const recentLibrary = useLibraryProducts(api, recentIds, reconcileMissing);
  const catalogue = useProductResults(api, { sort: "featured" }, phase === "ready" && !systemState);
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
          <p className="hero-card__eyebrow">HOA NAM TOOLS</p>
          <h2>Tìm đúng dụng cụ.</h2>
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
  const sectionProducts = sections
    .filter((section) => section.kind !== "CATEGORY_HIGHLIGHTS")
    .reduce<ProductCardDto[]>((products, section) =>
    products.concat(section.items.filter(isProductSectionItem)), []);
  const heroMedia = sectionProducts
    .map((product) => product.cover_media?.type === "IMAGE" ? product.cover_media.url : null)
    .find((url): url is string => Boolean(url));
  const recentProducts = getPublicProducts(recentLibrary.products).slice(0, HOME_RECENT_PREVIEW_LIMIT);
  const catalogueProducts = getPublicProducts(catalogue.loadedProducts)
    .filter((product) => catalogueAvailability === "ALL" || product.availability === catalogueAvailability);
  const displayedCatalogueProducts = catalogueProducts.slice(0, HOME_CATALOGUE_PREVIEW_LIMIT);

  return (
    <AppShell route={homeRoute} onContentTouchStart={pullToRefresh.onTouchStart} onContentTouchEnd={pullToRefresh.onTouchEnd}>
      <section className="hero-card home-hero">
        <div className="hero-copy">
          <p className="hero-card__eyebrow">DỤNG CỤ CHO MỌI CÔNG VIỆC</p>
          <h1><span>Tìm đúng dụng cụ.</span><span>Làm tốt công việc.</span></h1>
          <p>Khám phá sản phẩm phù hợp và xem tình trạng hàng trước khi liên hệ tư vấn.</p>
          <UiButton onClick={() => navigate("/products", { animate: false })}>Khám phá sản phẩm <UiIcon name="chevronRight" size={20} /></UiButton>
        </div>
        <div className={`hero-visual ${heroMedia ? "hero-visual--image" : ""}`} style={heroMedia ? { backgroundImage: `url("${heroMedia.replace(/"/g, "%22")}")` } : undefined} aria-hidden="true">
          {heroMedia ? null : <><span className="hero-visual__ring hero-visual__ring--one"></span><span className="hero-visual__ring hero-visual__ring--two"></span><span className="hero-visual__tool"><UiIcon name="sparkles" size={42} /></span></>}
        </div>
      </section>

      {pullToRefresh.pulling ? <p className="pull-refresh-hint" aria-live="polite">Đang tải lại thông tin công khai…</p> : null}

      <section aria-labelledby="domain-title" className="content-section">
        <div className="section-heading">
          <h2 id="domain-title">Bạn đang tìm dụng cụ nào?</h2>
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
              <strong>{visibleText(domain.display_name)}</strong>
              <span>{DOMAIN_DESCRIPTIONS[domain.code]}</span>
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

      <section className="home-library-links" aria-label="Sản phẩm của bạn">
        <button type="button" onClick={() => navigate("/recent", { animate: false })}><UiIcon name="clock" size={19} />Sản phẩm đã xem</button>
        <button type="button" onClick={() => navigate("/saved", { animate: false })}><UiIcon name="bookmark" size={19} />Sản phẩm đã lưu</button>
        <button type="button" onClick={() => navigate("/help", { animate: false })}><UiIcon name="helpCircle" size={19} />Hướng dẫn & câu hỏi</button>
      </section>

      <section className="content-section home-product-section home-recent-section" aria-labelledby="recent-products-title">
        <div className="section-heading home-section-heading">
          <h2 id="recent-products-title">Sản phẩm vừa xem</h2>
          <button type="button" onClick={() => navigate("/recent", { animate: false })}>Xem tất cả <UiIcon name="chevronRight" size={20} /></button>
        </div>
        {recentLibrary.phase === "loading" ? <CatalogueSkeleton cards={1} /> : null}
        {recentLibrary.failure ? <p className="home-product-status" role="status">Chưa thể tải sản phẩm đã xem. Vui lòng thử lại sau.</p> : null}
        {!recentLibrary.failure && recentLibrary.phase === "ready" && !recentProducts.length ? <p className="home-product-status">Sản phẩm bạn mở sẽ xuất hiện tại đây.</p> : null}
        {recentProducts.length ? <ProductGrid products={recentProducts} returnPath="/home" label="Sản phẩm vừa xem" loadedCount={recentProducts.length} /> : null}
      </section>

      <section className="content-section home-product-section home-catalogue-section" aria-labelledby="category-products-title">
        <div className="section-heading home-section-heading">
          <h2 id="category-products-title">Sản phẩm trong danh mục</h2>
        </div>
        <AvailabilityFilter value={catalogueAvailability} onChange={setCatalogueAvailability} />
        <output className="home-product-count" aria-live="polite">{catalogueProducts.length} sản phẩm</output>
        {catalogue.kind === "loading" ? <CatalogueSkeleton /> : null}
        {catalogue.failure ? <p className="home-product-status" role="status">Chưa thể tải sản phẩm trong danh mục. Vui lòng thử lại sau.</p> : null}
        {!catalogue.failure && catalogue.kind === "success-empty" ? <p className="home-product-status">Chưa có sản phẩm công khai trong danh mục này.</p> : null}
        {displayedCatalogueProducts.length ? <>
          <ProductGrid products={displayedCatalogueProducts} returnPath="/home" label="Sản phẩm trong danh mục" loadedCount={displayedCatalogueProducts.length} />
          <p className="home-product-progress">Đã hiển thị {displayedCatalogueProducts.length} / {catalogueProducts.length} sản phẩm</p>
        </> : null}
        <button className="home-catalogue-link" type="button" onClick={() => navigate("/products", { animate: false })}>Xem toàn bộ danh mục <UiIcon name="chevronRight" size={20} /></button>
      </section>

      {!categoryHighlights.length && !sectionProducts.length && catalogue.kind === "success-empty" ? <EmptyCatalogue onRetry={() => void refresh()} /> : null}
      {usingDevMock ? <p className="dev-fixture-note">DEMO DEV: dữ liệu mẫu chỉ để xem giao diện, không phải Catalogue UAT hoặc Production.</p> : null}
    </AppShell>
  );
};

export default HomePage;
