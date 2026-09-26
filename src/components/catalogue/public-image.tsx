import { CSSProperties, useEffect, useRef, useState } from "react";

import { isPublicMediaUrl, visibleText } from "@/catalogue/catalogue-utils";
import { getMeasuredPublicImageFit, ImageContentFit } from "@/catalogue/measured-image-fit";
import { MediaDto } from "@/types/public-api";
import { UiIcon } from "@/components/ui-icon";

interface PublicImageProps {
  media?: MediaDto | null;
  alt: string;
  className?: string;
  eager?: boolean;
  /** Opt-in only: verified versioned image margins; all other images contain. */
  trimWhitespace?: boolean;
  onClick?: () => void;
}

export const PublicImage = ({
  media,
  alt,
  className = "",
  eager = false,
  trimWhitespace = false,
  onClick,
}: PublicImageProps) => {
  const url = media?.type === "IMAGE" && isPublicMediaUrl(media.url) ? media.url : null;
  const [failed, setFailed] = useState(!url);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const [measuredFit, setMeasuredFit] = useState<{ url: string; fit: ImageContentFit } | null>(null);

  useEffect(() => {
    setFailed(!url);
  }, [url]);

  useEffect(() => {
    setMeasuredFit(null);
    if (!trimWhitespace || !url || failed) return undefined;
    const image = imageRef.current;
    const viewport = image?.parentElement;
    if (!image || !viewport) return undefined;
    const updateFit = () => {
      const fit = getMeasuredPublicImageFit(
        url,
        { width: image.naturalWidth, height: image.naturalHeight },
        { width: viewport.clientWidth, height: viewport.clientHeight },
      );
      setMeasuredFit((current) => {
        if (!fit) return null;
        if (current?.url === url && current.fit.width === fit.width && current.fit.height === fit.height
          && current.fit.left === fit.left && current.fit.top === fit.top) return current;
        return { url, fit };
      });
    };
    updateFit();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateFit);
      observer.observe(viewport);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", updateFit);
    return () => window.removeEventListener("resize", updateFit);
  }, [failed, loadRevision, trimWhitespace, url]);

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
  const fit = trimWhitespace && measuredFit?.url === url ? measuredFit.fit : null;
  const fittedStyle: CSSProperties | undefined = fit ? {
    position: "absolute",
    width: fit.width,
    height: fit.height,
    left: fit.left,
    top: fit.top,
    right: "auto",
    bottom: "auto",
    maxWidth: "none",
    maxHeight: "none",
    objectFit: "contain",
    transform: "none",
  } : undefined;
  const source = (
    <img
      key={url}
      ref={imageRef}
      className="public-image__source"
      src={url}
      style={fittedStyle}
      alt=""
      aria-hidden="true"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onLoad={trimWhitespace ? () => setLoadRevision((value) => value + 1) : undefined}
      onError={() => setFailed(true)}
    />
  );
  const imageProps = { className: `public-image ${className}` };

  if (!onClick) {
    return <div {...imageProps} role="img" aria-label={visibleText(media?.alt) ?? visibleText(alt) ?? "Hình ảnh sản phẩm"}>{source}</div>;
  }

  return <button type="button" {...imageProps} className={`public-image public-image--button ${className}`} onClick={onClick} aria-label={`Xem ảnh ${visibleText(alt) ?? "sản phẩm"}`}>{source}</button>;
};
