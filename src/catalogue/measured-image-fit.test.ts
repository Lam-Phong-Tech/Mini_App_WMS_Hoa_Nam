import { describe, expect, it } from "vitest";

import { fitImageContent, getMeasuredPublicImageFit, MEASURED_DCZC_IMAGE } from "@/catalogue/measured-image-fit";

describe("verified product image whitespace fitting", () => {
  it("fits the exact measured image with every nonwhite mark and its safety padding visible", () => {
    const viewport = { width: 327, height: 236 };
    const { content, size, url } = MEASURED_DCZC_IMAGE;
    const fit = getMeasuredPublicImageFit(url, size, viewport)!;
    expect(fit).not.toBeNull();
    expect(fit.width / size.width).toBeCloseTo(fit.height / size.height);
    expect(fit.left + content.x * fit.scale).toBeCloseTo(0);
    expect(fit.left + (content.x + content.width) * fit.scale).toBeCloseTo(viewport.width);
    expect(fit.top + content.y * fit.scale).toBeGreaterThanOrEqual(0);
    expect(fit.top + (content.y + content.height) * fit.scale).toBeLessThanOrEqual(viewport.height);
    expect(352 - content.x).toBe(84);
    expect(463 - content.y).toBe(84);
    expect(content.x + content.width - (352 + 1665)).toBe(84);
    expect(content.y + content.height - (463 + 961)).toBe(84);
  });

  it("keeps portrait and landscape content inside differently sized viewports without distortion", () => {
    for (const content of [{ x: 10, y: 20, width: 60, height: 160 }, { x: 10, y: 20, width: 180, height: 60 }]) {
      for (const viewport of [{ width: 160, height: 300 }, { width: 430, height: 160 }]) {
        const image = { width: 200, height: 200 };
        const fit = fitImageContent(image, content, viewport)!;
        expect(fit.width / fit.height).toBeCloseTo(image.width / image.height);
        expect(fit.left + content.x * fit.scale).toBeGreaterThanOrEqual(-0.00001);
        expect(fit.top + content.y * fit.scale).toBeGreaterThanOrEqual(-0.00001);
        expect(fit.left + (content.x + content.width) * fit.scale).toBeLessThanOrEqual(viewport.width + 0.00001);
        expect(fit.top + (content.y + content.height) * fit.scale).toBeLessThanOrEqual(viewport.height + 0.00001);
      }
    }
  });

  it("falls back to contain for unknown URLs, versions and decoded dimensions", () => {
    const { url, size } = MEASURED_DCZC_IMAGE;
    const viewport = { width: 327, height: 236 };
    expect(getMeasuredPublicImageFit(url.replace("DCZC02-26", "OTHER"), size, viewport)).toBeNull();
    expect(getMeasuredPublicImageFit(url.split("?")[0], size, viewport)).toBeNull();
    expect(getMeasuredPublicImageFit(`${url}-new`, size, viewport)).toBeNull();
    expect(getMeasuredPublicImageFit(url, { width: 1200, height: 900 }, viewport)).toBeNull();
    expect(getMeasuredPublicImageFit(url, { width: 0, height: 0 }, viewport)).toBeNull();
  });

  it("falls back safely for hidden viewports, invalid bounds or empty image measurements", () => {
    const image = { width: 200, height: 200 };
    const content = { x: 10, y: 20, width: 100, height: 100 };
    expect(fitImageContent(image, content, { width: 0, height: 200 })).toBeNull();
    expect(fitImageContent(image, content, { width: NaN, height: 200 })).toBeNull();
    expect(fitImageContent(image, { ...content, x: -1 }, image)).toBeNull();
    expect(fitImageContent(image, { ...content, width: 201 }, image)).toBeNull();
    expect(fitImageContent(image, { ...content, height: 0 }, image)).toBeNull();
  });
});
