import {
  CategoryDto,
  DOMAIN_CODES,
  DomainCode,
  FacetDto,
  HomeSectionDto,
  MediaDto,
  ProductCardDto,
  ProductDetailDto,
  ProductQuery,
  ProductSort,
  PublicAvailability,
  VariantDto,
} from "@/types/public-api";

export const MOBILE_TOUCH_TARGET_PX = 44;
export const SEARCH_DEBOUNCE_MS = 300;
export const PRODUCT_PAGE_LIMIT = 20;

const EMPTY_MARKERS = new Set(["", "-", "n/a", "null", "undefined"]);
const SORTS: ProductSort[] = ["featured", "updated_desc", "name_asc"];

export const visibleText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return EMPTY_MARKERS.has(normalized.toLocaleLowerCase()) ? null : normalized;
};

export const isPublicMediaUrl = (value: unknown): value is string => {
  const text = visibleText(value);
  if (!text) return false;

  if (text.startsWith("/")) return true;

  try {
    const url = new URL(text);
    return url.protocol === "https:";
  } catch {
    return false;
  }
};

export const isEligiblePublicProduct = (
  product: Pick<ProductCardDto, "availability" | "name" | "slug" | "product_id">,
): boolean =>
  (product.availability === "IN_STOCK" || product.availability === "PREORDER") &&
  Boolean(visibleText(product.name)) &&
  Boolean(visibleText(product.slug)) &&
  Boolean(visibleText(product.product_id));

export const isPreorderAvailability = (availability: PublicAvailability): boolean =>
  availability === "PREORDER";

export const getAvailabilityLabel = (availability: PublicAvailability): "Còn hàng" | "Đặt trước" =>
  isPreorderAvailability(availability) ? "Đặt trước" : "Còn hàng";

export const getPublicProducts = (
  products: ProductCardDto[] | undefined,
): ProductCardDto[] => (products ?? []).filter(isEligiblePublicProduct);

const isProductCard = (
  item: CategoryDto | ProductCardDto,
): item is ProductCardDto => "product_id" in item;

export const getVisibleHomeSections = (
  sections: HomeSectionDto[] | undefined,
): HomeSectionDto[] =>
  (sections ?? []).filter((section) => {
    if (!visibleText(section.title)) return false;
    return section.items.some((item) =>
      isProductCard(item)
        ? isEligiblePublicProduct(item)
        : Boolean(visibleText(item.display_name) && visibleText(item.code)),
    );
  });

export const getVisibleCategories = (
  categories: CategoryDto[] | undefined,
): CategoryDto[] =>
  (categories ?? []).filter(
    (category) => Boolean(visibleText(category.code) && visibleText(category.display_name)),
  );

export const getVisibleVariants = (
  variants: VariantDto[] | undefined,
): VariantDto[] =>
  (variants ?? []).filter(
    (variant) =>
      (variant.availability === "IN_STOCK" || variant.availability === "PREORDER") &&
      Boolean(visibleText(variant.variant_id) && visibleText(variant.variant_name)),
  );

export const getProductMedia = (
  product: Pick<ProductDetailDto, "media" | "cover_media">,
  variant: VariantDto | null = null,
): MediaDto[] => {
  const candidateMedia = variant?.media?.length ? variant.media : product.media?.length ? product.media : product.cover_media ? [product.cover_media] : [];
  const seen = new Set<string>();

  return candidateMedia
    .filter((media) => isPublicMediaUrl(media.url))
    .filter((media) => {
      if (seen.has(media.media_id)) return false;
      seen.add(media.media_id);
      return true;
    })
    .sort((first, second) => first.sort_order - second.sort_order);
};

export interface VisibleDetailSections {
  description: boolean;
  features: boolean;
  specs: boolean;
  variants: boolean;
  media: boolean;
  bundle: boolean;
  compatibility: boolean;
}

export const getVisibleDetailSections = (
  product: ProductDetailDto,
): VisibleDetailSections => ({
  description: Boolean(visibleText(product.description)),
  features: Boolean(product.features?.some((feature) => visibleText(feature.label))),
  specs: Boolean(
    product.spec_groups?.some((group) =>
      visibleText(group.label) && group.items.some((item) => visibleText(item.label) && visibleText(item.value)),
    ),
  ),
  variants: getVisibleVariants(product.variants).length > 0,
  media: getProductMedia(product).length > 0,
  bundle: Boolean(product.bundle_items?.some((item) => visibleText(item.label))),
  compatibility: Boolean(product.compatibility?.some((item) => visibleText(item.label))),
});

export const normalizeSearchText = (value: string): string =>
  value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");

/**
 * This rank is a client-side assertion of the G0 search contract. The server remains
 * authoritative because cursor results must not be re-sorted by the Mini App.
 */
export const getSearchMatchRank = (
  query: string,
  product: Pick<ProductCardDto, "model" | "primary_code" | "name" | "category">,
): number => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 3;
  const model = visibleText(product.model);
  const primaryCode = visibleText(product.primary_code);

  if (
    normalizeSearchText(model ?? "") === normalizedQuery ||
    normalizeSearchText(primaryCode ?? "") === normalizedQuery
  ) {
    return 0;
  }

  if (normalizeSearchText(product.name).startsWith(normalizedQuery)) return 1;
  if (normalizeSearchText(product.category.display_name).includes(normalizedQuery)) return 2;
  return 3;
};

const uniqueTextValues = (values: string[] | undefined): string[] | undefined => {
  const unique = Array.from(
    new Set((values ?? []).map((value) => visibleText(value)).filter((value): value is string => Boolean(value))),
  );
  return unique.length ? unique : undefined;
};

export const normalizeProductQuery = (query: ProductQuery): ProductQuery => {
  const q = visibleText(query.q);
  const powerSource = visibleText(query.power_source);
  const feature = uniqueTextValues(query.feature);
  const spec = Object.entries(query.spec ?? {}).reduce<Record<string, string | string[]>>(
    (result, [code, value]) => {
      if (!/^[a-z][a-z0-9_]*$/.test(code)) return result;
      const values = uniqueTextValues(Array.isArray(value) ? value : [value]);
      if (values?.length) result[code] = values.length === 1 ? values[0] : values;
      return result;
    },
    {},
  );

  return {
    ...(q ? { q } : {}),
    ...(query.domain && DOMAIN_CODES.includes(query.domain) ? { domain: query.domain } : {}),
    ...(visibleText(query.category) ? { category: visibleText(query.category) ?? undefined } : {}),
    ...(powerSource ? { power_source: powerSource } : {}),
    ...(feature ? { feature } : {}),
    ...(Object.keys(spec).length ? { spec } : {}),
    sort: SORTS.includes(query.sort ?? "featured") ? query.sort ?? "featured" : "featured",
    ...(visibleText(query.cursor) ? { cursor: visibleText(query.cursor) ?? undefined } : {}),
    limit: Math.min(Math.max(query.limit ?? PRODUCT_PAGE_LIMIT, 1), 50),
  };
};

export const parseProductQuery = (search: string): ProductQuery => {
  const params = new URLSearchParams(search);
  const spec: Record<string, string[]> = {};
  params.forEach((value, key) => {
    if (!key.startsWith("spec.")) return;
    const code = key.slice("spec.".length);
    spec[code] = [...(spec[code] ?? []), value];
  });
  const domain = params.get("domain") ?? undefined;

  return normalizeProductQuery({
    q: params.get("q") ?? undefined,
    domain: DOMAIN_CODES.includes(domain as DomainCode) ? (domain as DomainCode) : undefined,
    category: params.get("category") ?? undefined,
    power_source: params.get("power_source") as ProductQuery["power_source"],
    feature: params.getAll("feature"),
    spec,
    sort: params.get("sort") as ProductSort,
  });
};

export const serializeProductQuery = (query: ProductQuery): string => {
  const normalized = normalizeProductQuery(query);
  const params = new URLSearchParams();
  if (normalized.q) params.set("q", normalized.q);
  if (normalized.domain) params.set("domain", normalized.domain);
  if (normalized.category) params.set("category", normalized.category);
  if (normalized.power_source) params.set("power_source", normalized.power_source);
  normalized.feature?.forEach((value) => params.append("feature", value));
  Object.entries(normalized.spec ?? {}).forEach(([code, value]) => {
    (Array.isArray(value) ? value : [value]).forEach((item) => params.append(`spec.${code}`, item));
  });
  if (normalized.sort && normalized.sort !== "featured") params.set("sort", normalized.sort);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
};

export const productQueryCacheKey = (query: ProductQuery): string => {
  const withoutCursor = normalizeProductQuery(query);
  delete withoutCursor.cursor;
  return serializeProductQuery(withoutCursor);
};

export const countActiveFilters = (query: ProductQuery): number => {
  const normalized = normalizeProductQuery(query);
  return [
    normalized.category,
    normalized.power_source,
    ...(normalized.feature ?? []),
    ...Object.values(normalized.spec ?? {}).reduce<string[]>(
      (values, value) => values.concat(Array.isArray(value) ? value : [value]),
      [],
    ),
  ].filter(Boolean).length;
};

export const resetProductFilters = (query: ProductQuery): ProductQuery => {
  const normalized = normalizeProductQuery(query);
  return normalizeProductQuery({
    q: normalized.q,
    domain: normalized.domain,
    sort: "featured",
  });
};

export const mergeUniqueProducts = (
  current: ProductCardDto[],
  incoming: ProductCardDto[],
): ProductCardDto[] => {
  const seenProductIds = new Set<string>();
  const seenSlugs = new Set<string>();
  return [...current, ...incoming].filter((product) => {
    if (!isEligiblePublicProduct(product)) return false;
    if (seenProductIds.has(product.product_id) || seenSlugs.has(product.slug)) return false;
    seenProductIds.add(product.product_id);
    seenSlugs.add(product.slug);
    return true;
  });
};

export const createProductReturnPath = (pathname: string, search: string): string =>
  `${pathname}${search}`;

export const createProductDetailPath = (slug: string, returnPath: string): string =>
  `/products/${encodeURIComponent(slug)}?from=${encodeURIComponent(returnPath)}`;

export const getSafeReturnPath = (search: string): string | null => {
  const candidate = new URLSearchParams(search).get("from");
  return candidate && candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : null;
};

export const getFacetOptions = (facet: FacetDto): FacetDto["options"] =>
  facet.options.filter((option) => Boolean(visibleText(option.value) && visibleText(option.label)));
