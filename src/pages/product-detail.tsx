import { Button, useLocation, useNavigate, useParams } from "zmp-ui";

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
import { createLoadingState, getSystemStateForFailure } from "@/state/system-state";

const detailRoute = getFoundationRoute("product-detail");

/** Data loader for the shared ProductDetailTemplate. */
const ProductDetailPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { api, config, phase, systemState, refresh } = useAppContext();
  const detail = useProductDetail(api, slug);
  const related = useRelatedProducts(api, detail.product?.slug);
  const returnPath = getSafeReturnPath(location.search) ?? "/products";

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

  return (
    <AppShell route={detailRoute} showNavigation={false}>
      <ProductDetailTemplate
        product={product}
        config={config}
        relatedProducts={related.products}
        onOpenGallery={() => navigate(`/products/${product.slug}/gallery?from=${encodeURIComponent(returnPath)}`, { animate: false })}
        onOpenProduct={(relatedSlug) => navigate(`/products/${relatedSlug}?from=${encodeURIComponent(productReturnPath)}`, { animate: false })}
        onRequestConsultation={() => navigate(`/products/${product.slug}/quote?from=${encodeURIComponent(productReturnPath)}`, { animate: false })}
      />
      {related.failure ? <CatalogueFailure failure={related.failure} onRetry={() => void detail.reload()} /> : null}
    </AppShell>
  );
};

export default ProductDetailPage;
