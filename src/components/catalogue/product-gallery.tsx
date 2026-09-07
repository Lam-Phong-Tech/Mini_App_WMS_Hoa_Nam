import { useMemo, useState } from "react";
import { openWebview } from "zmp-sdk";

import { getProductMedia, isPublicMediaUrl, visibleText } from "@/catalogue/catalogue-utils";
import { MediaDto, ProductDetailDto } from "@/types/public-api";
import { UiIcon } from "@/components/ui-icon";

import { PublicImage } from "./public-image";

interface ProductGalleryProps {
  product: ProductDetailDto;
  galleryMode?: boolean;
}

const openMedia = (media: MediaDto): void => {
  if (!isPublicMediaUrl(media.url)) return;
  void openWebview({ url: media.url, config: { style: "normal" } }).catch(() => {
    // Use the existing safe detail state rather than surfacing platform diagnostics.
  });
};

export const ProductGallery = ({ product, galleryMode = false }: ProductGalleryProps) => {
  const media = useMemo(() => getProductMedia(product), [product]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const activeMedia = media[Math.min(activeIndex, Math.max(media.length - 1, 0))] ?? null;

  if (!media.length) return null;

  const previous = () => setActiveIndex((current) => (current - 1 + media.length) % media.length);
  const next = () => setActiveIndex((current) => (current + 1) % media.length);

  return (
    <section className={`product-gallery ${galleryMode ? "product-gallery--full" : ""}`} aria-label="Media sản phẩm">
      <div
        className="product-gallery__main"
        onTouchStart={(event) => setSwipeStartX(event.touches[0]?.clientX ?? null)}
        onTouchEnd={(event) => {
          const endX = event.changedTouches[0]?.clientX;
          if (swipeStartX === null || endX === undefined || Math.abs(endX - swipeStartX) < 40 || media.length < 2) return;
          if (endX < swipeStartX) next();
          else previous();
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
        <div className="product-gallery__thumbs">
          {media.map((item, index) => (
            <button key={item.media_id} type="button" onClick={() => setActiveIndex(index)} className={index === activeIndex ? "is-active" : ""}>
              {item.type === "IMAGE" ? <PublicImage media={item} alt={product.name} /> : <UiIcon name={item.type === "VIDEO" ? "play" : "fileText"} size={22} />}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
};
