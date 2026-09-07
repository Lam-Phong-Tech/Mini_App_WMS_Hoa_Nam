import { useParams } from "zmp-ui";

import { isEligiblePublicProduct } from "@/catalogue/catalogue-utils";
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
  const { api, phase, systemState, refresh } = useAppContext();
  const detail = useProductDetail(api, slug);

  if (phase === "loading") return <AppShell route={galleryRoute}><SystemStatePanel state={createLoadingState()} /></AppShell>;
  if (systemState) return <AppShell route={galleryRoute}><SystemStatePanel state={systemState} onRetry={() => void refresh()} /></AppShell>;
  if (detail.phase === "loading") return <AppShell route={galleryRoute}><CatalogueSkeleton cards={1} /></AppShell>;
  if (!detail.product || detail.failure || !isEligiblePublicProduct(detail.product)) return <AppShell route={galleryRoute}><SystemStatePanel state={detail.failure ? getSystemStateForFailure(detail.failure) : { kind: "unavailable", title: "Sản phẩm hiện không khả dụng", message: "Không thể mở media của sản phẩm này." }} onRetry={() => void detail.reload()} /></AppShell>;

  return (
    <AppShell route={galleryRoute}>
      <ProductGallery product={detail.product} galleryMode />
    </AppShell>
  );
};

export default GalleryPage;
