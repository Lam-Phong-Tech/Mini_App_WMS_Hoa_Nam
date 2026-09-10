import { useLocation, useNavigate, useParams } from "zmp-ui";

import { getSafeReturnPath, getVisibleVariants, isEligiblePublicProduct } from "@/catalogue/catalogue-utils";
import { CatalogueSkeleton } from "@/components/catalogue/catalogue-feedback";
import { ProductGallery } from "@/components/catalogue/product-gallery";
import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { useProductDetail } from "@/hooks/use-product-detail";
import { getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { createLoadingState, getSystemStateForFailure } from "@/state/system-state";

const galleryRoute = getFoundationRoute("gallery");

const GalleryPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { api, phase, systemState, refresh } = useAppContext();
  const detail = useProductDetail(api, slug);

  if (phase === "loading") return <AppShell route={galleryRoute}><SystemStatePanel state={createLoadingState()} /></AppShell>;
  if (systemState) return <AppShell route={galleryRoute}><SystemStatePanel state={systemState} onRetry={() => void refresh()} /></AppShell>;
  if (detail.phase === "loading") return <AppShell route={galleryRoute}><CatalogueSkeleton cards={1} /></AppShell>;
  if (!detail.product || detail.failure || !isEligiblePublicProduct(detail.product)) return <AppShell route={galleryRoute}><SystemStatePanel state={detail.failure ? getSystemStateForFailure(detail.failure) : { kind: "unavailable", title: "Sản phẩm hiện không khả dụng", message: "Không thể mở media của sản phẩm này." }} onRetry={() => void detail.reload()} /></AppShell>;

  const requestedVariantId = new URLSearchParams(location.search).get("variant_id");
  const selectedVariant = getVisibleVariants(detail.product.variants).find((variant) => variant.variant_id === requestedVariantId) ?? null;
  const returnPath = getSafeReturnPath(location.search) ?? `/products/${detail.product.slug}`;

  return (
    <AppShell route={galleryRoute} showNavigation={false}>
      <ProductGallery product={detail.product} variant={selectedVariant} galleryMode onClose={() => navigate(returnPath, { animate: false })} />
    </AppShell>
  );
};

export default GalleryPage;
