export interface ImageSize { width: number; height: number }
export interface ImageContentBounds extends ImageSize { x: number; y: number }
export interface ImageContentFit extends ImageSize { left: number; top: number; scale: number }

/** Measured 2026-09-23 from an authorized public GET, decoded in memory with
 * Sharp; no raster was edited or retained. All native pixels with min(R,G,B)
 * < 255 lie in [352,463,1665,961]. Add 84px safety on every side, including
 * every product/label/shadow mark. Only the remaining pure-white margin may
 * leave the viewport. Exact URL/version AND decoded dimensions are required.
 * The SHA records source provenance; it is not falsely claimed as verified
 * at runtime (this image host does not expose CORS). Re-measure if its bytes
 * change, and version its URL rather than replacing this asset in place. */
export const MEASURED_DCZC_IMAGE = {
  url: "https://images.bigk.click/Power_Tool/DCZC02-26.jpg?v=r2-20260906",
  sourceBytes: 157493,
  sha256: "7a2e5e91f876aefbb08ddc662996350bb31a33bf8b64f4f5a554ae444ba16e37",
  size: { width: 2400, height: 1800 },
  content: { x: 268, y: 379, width: 1833, height: 1129 },
} as const;

/** Fit the padded content rectangle while uniformly scaling the complete
 * bitmap. There is no pixel edit, independent axis scaling or product crop. */
export const fitImageContent = (
  image: ImageSize,
  content: ImageContentBounds,
  viewport: ImageSize,
): ImageContentFit | null => {
  const dimensions = [image.width, image.height, content.width, content.height, viewport.width, viewport.height];
  if (dimensions.some((value) => !Number.isFinite(value) || value <= 0)
    || !Number.isFinite(content.x) || !Number.isFinite(content.y)
    || content.x < 0 || content.y < 0
    || content.x + content.width > image.width
    || content.y + content.height > image.height) return null;

  const scale = Math.min(viewport.width / content.width, viewport.height / content.height);
  return {
    width: image.width * scale,
    height: image.height * scale,
    left: (viewport.width - content.width * scale) / 2 - content.x * scale,
    top: (viewport.height - content.height * scale) / 2 - content.y * scale,
    scale,
  };
};

export const getMeasuredPublicImageFit = (
  url: string,
  naturalSize: ImageSize,
  viewport: ImageSize,
): ImageContentFit | null => {
  if (url !== MEASURED_DCZC_IMAGE.url
    || naturalSize.width !== MEASURED_DCZC_IMAGE.size.width
    || naturalSize.height !== MEASURED_DCZC_IMAGE.size.height) return null;
  return fitImageContent(naturalSize, MEASURED_DCZC_IMAGE.content, viewport);
};
