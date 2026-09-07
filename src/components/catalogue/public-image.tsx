import { useEffect, useState } from "react";

import { isPublicMediaUrl, visibleText } from "@/catalogue/catalogue-utils";
import { MediaDto } from "@/types/public-api";
import { UiIcon } from "@/components/ui-icon";

interface PublicImageProps {
  media?: MediaDto | null;
  alt: string;
  className?: string;
  eager?: boolean;
  onClick?: () => void;
}

export const PublicImage = ({
  media,
  alt,
  className = "",
  eager = false,
  onClick,
}: PublicImageProps) => {
  const url = media?.type === "IMAGE" && isPublicMediaUrl(media.url) ? media.url : null;
  const [failed, setFailed] = useState(!url);

  useEffect(() => {
    setFailed(!url);
  }, [url]);

  if (!url || failed) {
    return (
      <div className={`public-image public-image--fallback ${className}`} role="img" aria-label={`Chưa có hình ảnh cho ${visibleText(alt) ?? "sản phẩm"}`}>
        <UiIcon name="imageOff" size={30} />
      </div>
    );
  }

  /*
   * A CSS background is downloaded as soon as it is assigned.  That bypasses
   * native lazy loading, which made the Home page request every card image at
   * once.  Use the actual image element so browsers can defer off-screen
   * cards and decode them asynchronously. `object-fit: contain` in the shared
   * CSS deliberately keeps the approved product image whole without stretching
   * or cropping it.
   */
  const source = (
    <img
      className="public-image__source"
      src={url}
      alt=""
      aria-hidden="true"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
  const imageProps = { className: `public-image ${className}` };

  if (!onClick) {
    return <div {...imageProps} role="img" aria-label={visibleText(media?.alt) ?? visibleText(alt) ?? "Hình ảnh sản phẩm"}>{source}</div>;
  }

  return <button type="button" {...imageProps} className={`public-image public-image--button ${className}`} onClick={onClick} aria-label={`Xem ảnh ${visibleText(alt) ?? "sản phẩm"}`}>{source}</button>;
};
