import { openShareSheet } from "zmp-sdk";

import { ProductDetailDto, VariantDto } from "@/types/public-api";

export interface ProductShareContext {
  slug: string;
  name: string;
  model?: string | null;
  variantId?: string | null;
  coverUrl?: string | null;
}

export const buildProductDeepLink = (
  slug: string,
  variantId?: string | null,
  origin = typeof window === "undefined" ? "" : window.location.origin,
): string => {
  const path = `/products/${encodeURIComponent(slug)}`;
  const search = variantId ? `?variant_id=${encodeURIComponent(variantId)}` : "";
  return `${origin}${path}${search}`;
};

export const getProductShareContext = (
  product: ProductDetailDto,
  variant: VariantDto | null,
): ProductShareContext => ({
  slug: product.slug,
  name: product.name,
  model: product.model,
  variantId: variant?.variant_id ?? null,
  coverUrl: product.cover_media?.url ?? null,
});

export type ShareResult = "shared" | "fallback-shared" | "copied" | "unavailable";

const copyDeepLink = async (link: string): Promise<ShareResult> => {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ url: link });
      return "fallback-shared";
    } catch {
      // User cancellation or unsupported browser is handled by the next fallback.
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(link);
      return "copied";
    } catch {
      return "unavailable";
    }
  }

  return "unavailable";
};

export const shareProduct = async (
  context: ProductShareContext,
): Promise<ShareResult> => {
  const link = buildProductDeepLink(context.slug, context.variantId);

  try {
    await openShareSheet({
      type: "link",
      data: { link, chatOnly: false },
    });
    return "shared";
  } catch {
    return copyDeepLink(link);
  }
};

export const getShareDescription = (context: ProductShareContext): string => {
  const model = context.model?.trim();
  return model ? `${context.name} · ${model}` : context.name;
};
