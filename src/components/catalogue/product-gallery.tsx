import { CSSProperties, useEffect, useMemo, useState } from "react";
import { openWebview } from "zmp-sdk";

import { getProductMedia, isPublicMediaUrl, visibleText } from "@/catalogue/catalogue-utils";
import { MediaDto, ProductDetailDto, VariantDto } from "@/types/public-api";
import { UiIcon } from "@/components/ui-icon";

import { PublicImage } from "./public-image";

interface ProductGalleryProps {
  product: ProductDetailDto;
  galleryMode?: boolean;
  variant?: VariantDto | null;
  onClose?: () => void;
}

const openMedia = (media: MediaDto): void => {
  if (!isPublicMediaUrl(media.url)) return;
  void openWebview({ url: media.url, config: { style: "normal" } }).catch(() => {
    // Use the existing safe detail state rather than surfacing platform diagnostics.
  });
};

export const ProductGallery = ({ product, galleryMode = false, variant = null, onClose }: ProductGalleryProps) => {
  const media = useMemo(() => getProductMedia(product, variant), [product, variant]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const [zoom, setZoom] = useState(100);
  const activeMedia = media[Math.min(activeIndex, Math.max(media.length - 1, 0))] ?? null;

  useEffect(() => {
    setActiveIndex(0);
    setZoom(100);
  }, [variant?.variant_id, product.product_id]);

  useEffect(() => {
    if (!galleryMode || !onClose) return undefined;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [galleryMode, onClose]);

  if (!media.length) return null;

  const previous = () => setActiveIndex((current) => (current - 1 + media.length) % media.length);
  const next = () => setActiveIndex((current) => (current + 1) % media.length);

  return (
    <section className={`product-gallery ${galleryMode ? "product-gallery--full" : ""}`} aria-label="Media sản phẩm">
      <div
        className="product-gallery__main"
        style={galleryMode ? ({ "--product-gallery-zoom": zoom / 100 } as CSSProperties) : undefined}
        onTouchStart={(event) => setSwipeStartX(event.touches[0]?.clientX ?? null)}
        onTouchEnd={(event) => {
          const endX = event.changedTouches[0]?.clientX;
          if (swipeStartX !== null && endX !== undefined && Math.abs(endX - swipeStartX) >= 40 && media.length >= 2) {
            if (endX < swipeStartX) next();
            else previous();
          }
          setSwipeStartX(null);
        }}
      >
        {activeMedia?.type === "IMAGE" ? (
          <PublicImage media={activeMedia} alt={product.name} eager />
        ) : (
          <button type="button" className="media-document" onClick={() => activeMedia && openMedia(activeMedia)}>
            <UiIcon name={activeMedia?.type === "VIDEO" ? "play" : "fileText"} size={34} />
            <strong>{activeMedia?.type === "VIDEO" ? "Mở video" : "Mở tài liệu"}</strong>
            <span>{visibleText(activeMedia?.alt) ?? "Nội dung công khai"}</span>
          </button>
        )}
      </div>
      {media.length > 1 ? (
        <div className="product-gallery__controls">
          <button type="button" onClick={previous} aria-label="Media trước"><UiIcon name="chevronLeft" size={22} /></button>
          <span>{activeIndex + 1} / {media.length}</span>
          <button type="button" onClick={next} aria-label="Media tiếp theo"><UiIcon name="chevronRight" size={22} /></button>
        </div>
      ) : null}
      {galleryMode ? (
        <div className="product-gallery__full-controls">
          <div className="product-gallery__zoom-controls" aria-label="Thu phóng ảnh">
            <button type="button" onClick={() => setZoom((current) => Math.max(100, current - 25))} disabled={zoom <= 100}>Thu nhỏ</button>
            <button type="button" onClick={() => setZoom(100)}>Vừa khung</button>
            <button type="button" onClick={() => setZoom((current) => Math.min(300, current + 25))} disabled={zoom >= 300}>Phóng to</button>
            <output aria-live="polite">{zoom}%</output>
          </div>
          {onClose ? <button className="product-gallery__close" type="button" onClick={onClose}>Đóng</button> : null}
          <div className="product-gallery__thumbs">
            {media.map((item, index) => (
              <button key={item.media_id} type="button" onClick={() => setActiveIndex(index)} className={index === activeIndex ? "is-active" : ""}>
                {item.type === "IMAGE" ? <PublicImage media={item} alt={product.name} /> : <UiIcon name={item.type === "VIDEO" ? "play" : "fileText"} size={22} />}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
};
