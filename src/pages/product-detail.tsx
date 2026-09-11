import { useEffect } from "react";
import { Button, useLocation, useNavigate, useParams, useSnackbar } from "zmp-ui";

import {
  createProductReturnPath,
  getSafeReturnPath,
  isEligiblePublicProduct,
} from "@/catalogue/catalogue-utils";
import { CatalogueFailure, CatalogueSkeleton } from "@/components/catalogue/catalogue-feedback";
import { ContactActions } from "@/components/catalogue/contact-actions";
import { ProductDetailTemplate } from "@/components/catalogue/product-detail-template";
import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { useProductDetail, useRelatedProducts } from "@/hooks/use-product-detail";
import { getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { useProductLibrary } from "@/state/product-library-context";
import { useCompare } from "@/state/compare-context";
import { createLoadingState, getSystemStateForFailure } from "@/state/system-state";

const detailRoute = getFoundationRoute("product-detail");

/** Data loader for the shared ProductDetailTemplate. */
const ProductDetailPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { openSnackbar } = useSnackbar();
  const { api, config, phase, systemState, refresh } = useAppContext();
  const { recordViewed, savedIds, toggleSaved } = useProductLibrary();
  const { items: compared, toggle: toggleCompare } = useCompare();
  const detail = useProductDetail(api, slug);
  const related = useRelatedProducts(api, detail.product?.slug);

  // Keep hook order stable while the detail query moves between loading and
  // ready. Recording is a no-op until a current, eligible product exists.
  useEffect(() => {
    if (detail.product && isEligiblePublicProduct(detail.product)) {
      recordViewed(detail.product.product_id);
    }
  }, [detail.product, recordViewed]);

  if (phase === "loading") {
    return <AppShell route={detailRoute} showNavigation={false}><SystemStatePanel state={createLoadingState()} /></AppShell>;
  }
  if (systemState) {
    return <AppShell route={detailRoute} showNavigation={false}><SystemStatePanel state={systemState} onRetry={() => void refresh()} /></AppShell>;
  }
  if (detail.phase === "loading") {
    return <AppShell route={detailRoute} showNavigation={false}><CatalogueSkeleton cards={2} /></AppShell>;
  }
  if (!detail.product || detail.failure || !isEligiblePublicProduct(detail.product)) {
    const state = detail.failure
      ? getSystemStateForFailure(detail.failure)
      : { kind: "unavailable" as const, title: "Sản phẩm hiện không khả dụng", message: "Sản phẩm này không còn trong Catalogue công khai." };
    return (
      <AppShell route={detailRoute} showNavigation={false}>
        <SystemStatePanel state={state} onRetry={() => void detail.reload()} />
        <section className="unavailable-actions">
          <Button variant="secondary" onClick={() => navigate("/products", { animate: false })}>Xem danh mục khác</Button>
          <ContactActions config={config} />
        </section>
      </AppShell>
    );
  }

  const product = detail.product;
  const productReturnPath = createProductReturnPath(location.pathname, location.search);
  const safeBackPath = getSafeReturnPath(location.search) ?? "/products";
  const toGalleryPath = (variantId?: string) => {
    // Gallery is one level below Detail. Preserve the complete Detail URL so
    // Escape/Back returns to Detail first; its own `from` still restores the
    // original filtered list and its query/scroll memory.
    const parameters = new URLSearchParams({ from: productReturnPath });
    if (variantId) parameters.set("variant_id", variantId);
    return `/products/${encodeURIComponent(product.slug)}/gallery?${parameters.toString()}`;
  };
  const toQuotePath = (variantId?: string) => {
    const parameters = new URLSearchParams({ from: productReturnPath });
    if (variantId) parameters.set("variant_id", variantId);
    return `/products/${encodeURIComponent(product.slug)}/quote?${parameters.toString()}`;
  };
  const onToggleCompare = () => {
    const outcome = toggleCompare(product);
    if (outcome === "limit") openSnackbar({ text: "Chỉ so sánh tối đa 3 sản phẩm.", type: "warning", icon: true });
    if (outcome === "category") openSnackbar({ text: "Chỉ so sánh sản phẩm cùng nhóm và danh mục.", type: "warning", icon: true });
  };

  return (
    <AppShell route={detailRoute} showNavigation={false}>
      <ProductDetailTemplate
        product={product}
        config={config}
        relatedProducts={related.products}
        onBack={() => navigate(safeBackPath, { animate: false })}
        onOpenGallery={(variantId) => navigate(toGalleryPath(variantId), { animate: false })}
        onOpenProduct={(relatedSlug) => navigate(`/products/${relatedSlug}?from=${encodeURIComponent(productReturnPath)}`, { animate: false })}
        onRequestConsultation={(variantId) => navigate(toQuotePath(variantId), { animate: false })}
        isSaved={savedIds.includes(product.product_id.toLowerCase())}
        onToggleSaved={() => toggleSaved(product.product_id)}
        isCompared={compared.some((item) => item.product_id === product.product_id)}
        onToggleCompare={onToggleCompare}
      />
      {related.failure ? <CatalogueFailure failure={related.failure} onRetry={() => void detail.reload()} /> : null}
    </AppShell>
  );
};

export default ProductDetailPage;
