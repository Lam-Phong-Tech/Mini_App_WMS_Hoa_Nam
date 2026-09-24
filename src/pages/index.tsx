import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "zmp-ui";

import {
  getPublicProducts,
  getVisibleCategories,
  getVisibleHomeSections,
  PRODUCT_PAGE_LIMIT,
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
  POWER_TOOLS: "drill",
  HAND_TOOLS: "wrench",
  ACCESSORIES: "zap",
};

const DOMAIN_DESCRIPTIONS: Record<"POWER_TOOLS" | "HAND_TOOLS" | "ACCESSORIES", string> = {
  POWER_TOOLS: "Pin, điện AC, khí nén",
  HAND_TOOLS: "Kẹp, siết, đo, cắt",
  ACCESSORIES: "Pin, sạc, mũi và lưỡi",
};
const DOMAIN_LABELS: Record<"POWER_TOOLS" | "HAND_TOOLS" | "ACCESSORIES", string> = {
  POWER_TOOLS: "Máy công cụ",
  HAND_TOOLS: "Dụng cụ cầm tay",
  ACCESSORIES: "Phụ kiện",
};

const HOME_CATEGORY_SHORTCUTS: ReadonlyArray<{
  categoryCodes: readonly string[];
  label: string;
  icon: UiIconName;
}> = [
  { categoryCodes: ["CLAMPING_TOOLS", "DEV_CLAMPING"], label: "Dụng cụ kẹp giữ", icon: "hammer" },
  { categoryCodes: ["PT_CONCRETE", "DEV_CONCRETE"], label: "Bê tông và xây dựng", icon: "sliders" },
  { categoryCodes: ["CUTTING_TOOLS", "DEV_HAND_CUTTING"], label: "Dụng cụ cắt", icon: "ruler" },
  { categoryCodes: ["PT_DRILL_DRIVER", "DEV_DRILL_FASTEN"], label: "Khoan và siết/vặn", icon: "drill" },
];
const HOME_CATEGORY_PREVIEW_LIMIT = 4;
const HOME_RECENT_PREVIEW_LIMIT = 4;
const HOME_CATALOGUE_SOURCE_COUNT = PRODUCT_PAGE_LIMIT;
const HERO_REFERENCE_DRILL_IMAGE = "https://duc-nguyen98.github.io/WMS_UIUX_HoaNamv2/preview/preview/product-detail-source.png";

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
  const catalogueEnabled = phase === "ready" && !systemState;
  const powerToolResults = useProductResults(
    api,
    { sort: "featured", domain: "POWER_TOOLS", limit: PRODUCT_PAGE_LIMIT },
    catalogueEnabled,
    PRODUCT_PAGE_LIMIT,
  );
  const handToolResults = useProductResults(
    api,
    { sort: "featured", domain: "HAND_TOOLS", limit: PRODUCT_PAGE_LIMIT },
    catalogueEnabled,
    PRODUCT_PAGE_LIMIT,
  );
  const homeCategoryHighlights = useMemo(() => sections.reduce<CategoryDto[]>((categories, section) => {
    if (section.kind !== "CATEGORY_HIGHLIGHTS") return categories;
    return categories.concat(getVisibleCategories(section.items.filter((item): item is CategoryDto => !isProductSectionItem(item))));
  }, []), [sections]);

  useEffect(() => {
    let isActive = true;
    if (phase !== "ready" || systemState) {
      setApiCategories([]);
      return () => { isActive = false; };
    }

    void api.getCategories().then((response) => {
      if (isActive && isApiSuccess(response)) {
        setApiCategories(getVisibleCategories(response.data));
      }
    });

    return () => { isActive = false; };
  }, [api, phase, systemState]);

  useEffect(() => {
    if (
      powerToolResults.kind === "success-data"
      && powerToolResults.loadedCount < HOME_CATALOGUE_SOURCE_COUNT
      && powerToolResults.nextCursor
    ) {
      void powerToolResults.loadMore();
    }
    if (
      handToolResults.kind === "success-data"
      && handToolResults.loadedCount < HOME_CATALOGUE_SOURCE_COUNT
      && handToolResults.nextCursor
    ) {
      void handToolResults.loadMore();
    }
  }, [
    handToolResults.kind,
    handToolResults.loadMore,
    handToolResults.loadedCount,
    handToolResults.nextCursor,
    powerToolResults.kind,
    powerToolResults.loadMore,
    powerToolResults.loadedCount,
    powerToolResults.nextCursor,
  ]);

  if (phase === "loading") {
    return (
      <AppShell route={homeRoute} onContentTouchStart={pullToRefresh.onTouchStart} onContentTouchEnd={pullToRefresh.onTouchEnd}>
        <section className="hero-card home-hero" aria-busy="true">
          <div className="hero-art" aria-hidden="true">
            <span className="hero-sweep" />
            <span className="hero-arc" />
            <span className="hero-arc hero-arc--inner" />
          </div>
          <div className="hero-copy">
            <p className="hero-card__eyebrow">DỤNG CỤ CHO MỌI CÔNG VIỆC</p>
            <h1><span>Tìm đúng dụng cụ.</span><span>Làm tốt công việc.</span></h1>
            <p>Khám phá sản phẩm phù hợp và xem tình trạng hàng trước khi liên hệ tư vấn.</p>
            <UiButton onClick={() => navigate("/products", { animate: false })}>Khám phá sản phẩm <UiIcon name="arrowRight" size={20} /></UiButton>
          </div>
          <div className="hero-product" aria-hidden="true">
            <span className="hero-product__crop">
              <img src={HERO_REFERENCE_DRILL_IMAGE} alt="" draggable={false} />
            </span>
            <span className="hero-product__caption">Khoan búa dùng pin <strong>DCZC02-26</strong></span>
          </div>
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

  const categoriesByCode = new Map(
    [...apiCategories, ...homeCategoryHighlights].map((category) => [category.code, category]),
  );
  const categoryHighlights = HOME_CATEGORY_SHORTCUTS.flatMap((shortcut) => {
    const category = shortcut.categoryCodes
      .map((code) => categoriesByCode.get(code))
      .find((candidate): candidate is CategoryDto => Boolean(candidate));
    return category ? [{ ...shortcut, category }] : [];
  });
  const featuredProducts = (() => {
    const select = (products: ProductCardDto[], inStockCount: number, preorderCount: number) => {
      const available = getPublicProducts(products);
      const preferred = [
        ...available.filter((product) => product.availability === "IN_STOCK").slice(0, inStockCount),
        ...available.filter((product) => product.availability === "PREORDER").slice(0, preorderCount),
      ];
      const selectedIds = new Set(preferred.map((product) => product.product_id));
      const targetCount = inStockCount + preorderCount;
      return [
        ...preferred,
        ...available.filter((product) => !selectedIds.has(product.product_id)).slice(0, targetCount - preferred.length),
      ];
    };

    // The approved home mix is 70% Power Tools and 30% Hand Tools. When a
    // stock state has fewer candidates, fill the remaining slots from the
    // same domain rather than showing fewer than the requested 20 products.
    return [
      ...select(powerToolResults.loadedProducts, 10, 4),
      ...select(handToolResults.loadedProducts, 4, 2),
    ];
  })();
  const visibleFeaturedProducts = featuredProducts.filter((product) =>
    catalogueAvailability === "ALL" || product.availability === catalogueAvailability,
  );
  const catalogueLoading = powerToolResults.kind === "loading"
    || handToolResults.kind === "loading"
    || (powerToolResults.loadedCount < HOME_CATALOGUE_SOURCE_COUNT && Boolean(powerToolResults.nextCursor))
    || (handToolResults.loadedCount < HOME_CATALOGUE_SOURCE_COUNT && Boolean(handToolResults.nextCursor));
  const recentProducts = getPublicProducts(recentLibrary.products).slice(0, HOME_RECENT_PREVIEW_LIMIT);

  return (
    <AppShell route={homeRoute} onContentTouchStart={pullToRefresh.onTouchStart} onContentTouchEnd={pullToRefresh.onTouchEnd}>
      <section className="hero-card home-hero">
        <div className="hero-art" aria-hidden="true">
          <span className="hero-sweep" />
          <span className="hero-arc" />
          <span className="hero-arc hero-arc--inner" />
        </div>
        <div className="hero-copy">
          <p className="hero-card__eyebrow">DỤNG CỤ CHO MỌI CÔNG VIỆC</p>
          <h1><span>Tìm đúng dụng cụ.</span><span>Làm tốt công việc.</span></h1>
          <p>Khám phá sản phẩm phù hợp và xem tình trạng hàng trước khi liên hệ tư vấn.</p>
          <UiButton onClick={() => navigate("/products", { animate: false })}>Khám phá sản phẩm <UiIcon name="arrowRight" size={20} /></UiButton>
        </div>
        <div className="hero-product" aria-hidden="true">
          <span className="hero-product__crop">
            <img src={HERO_REFERENCE_DRILL_IMAGE} alt="" draggable={false} />
          </span>
          <span className="hero-product__caption">Khoan búa dùng pin <strong>DCZC02-26</strong></span>
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
              <strong>{DOMAIN_LABELS[domain.code]}</strong>
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
            {categoryHighlights.slice(0, HOME_CATEGORY_PREVIEW_LIMIT).map(({ category, icon, label }) => (
              <button
                className="home-category-item"
                key={category.code}
                type="button"
                onClick={() => navigate(`/products?domain=${category.domain}&category=${category.code}`, { animate: false })}
              >
                <UiIcon name={icon} size={24} strokeWidth={2} />
                <span>{label}</span>
                <UiIcon className="home-category-arrow" name="chevronRight" size={16} strokeWidth={2} />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="home-library-links" aria-label="Sản phẩm của bạn">
        <button type="button" onClick={() => navigate("/recent", { animate: false })}><UiIcon name="clock" size={19} strokeWidth={2} />Sản phẩm đã xem</button>
        <button type="button" onClick={() => navigate("/saved", { animate: false })}><UiIcon name="heart" size={19} strokeWidth={2} />Sản phẩm đã lưu</button>
        <button type="button" onClick={() => navigate("/help", { animate: false })}><UiIcon name="bookOpen" size={19} strokeWidth={2} />Hướng dẫn & câu hỏi</button>
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

      <section className="content-section home-product-section home-catalogue-section" aria-labelledby="featured-products-title">
        <div className="section-heading home-section-heading">
          <h2 id="featured-products-title">Sản phẩm trong danh mục</h2>
        </div>
        <AvailabilityFilter value={catalogueAvailability} onChange={setCatalogueAvailability} />
        {catalogueLoading ? <CatalogueSkeleton cards={4} /> : null}
        {visibleFeaturedProducts.length ? <>
          <ProductGrid products={visibleFeaturedProducts} returnPath="/home" label="Sản phẩm trong danh mục" loadedCount={visibleFeaturedProducts.length} />
          <p className="home-product-progress">Đã hiển thị {visibleFeaturedProducts.length}/{featuredProducts.length} sản phẩm</p>
        </> : null}
        {!catalogueLoading && !visibleFeaturedProducts.length ? <p className="catalogue-filter-empty">Chưa có sản phẩm phù hợp với trạng thái hàng đã chọn.</p> : null}
        <button className="home-catalogue-link" type="button" onClick={() => navigate("/products", { animate: false })}>Xem toàn bộ danh mục <UiIcon name="chevronRight" size={20} /></button>
      </section>

      {!categoryHighlights.length && !featuredProducts.length && !catalogueLoading ? <EmptyCatalogue onRetry={() => void refresh()} /> : null}
      {usingDevMock ? <p className="dev-fixture-note">DEMO DEV: dữ liệu mẫu chỉ để xem giao diện, không phải Catalogue UAT hoặc Production.</p> : null}
    </AppShell>
  );
};

export default HomePage;
