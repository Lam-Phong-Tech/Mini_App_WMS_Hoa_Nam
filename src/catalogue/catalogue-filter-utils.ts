import { normalizeProductQuery, visibleText } from "@/catalogue/catalogue-utils";
import { CategoryDto, ProductCardDto, ProductQuery } from "@/types/public-api";

/** Catalogue category totals cannot answer a search, feature or availability
 * filter. Those counts stay unknown until the endpoint provides an exact total
 * or the last cursor page has actually been loaded. */
export const getCategoryProductTotal = (
  query: ProductQuery,
  categories: CategoryDto[],
): number | null => {
  const normalized = normalizeProductQuery(query);
  if (normalized.q || normalized.power_source || normalized.feature?.length || Object.keys(normalized.spec ?? {}).length) {
    return null;
  }

  const matching = categories.filter((category) =>
    (!normalized.domain || category.domain === normalized.domain)
    && (!normalized.category || category.code === normalized.category),
  );
  if (normalized.category && !matching.length) return null;
  if (matching.some((category) => typeof category.product_count !== "number"
    || !Number.isInteger(category.product_count) || category.product_count < 0)) return null;
  // Never double count overlapping parent/child categories.
  if (matching.some((category) => category.parent_code
    && matching.some((candidate) => candidate.code === category.parent_code))) return null;

  const unique = new Map(matching.map((category) => [`${category.domain}:${category.code}`, category]));
  return [...unique.values()].reduce((total, category) => total + (category.product_count ?? 0), 0);
};
/** Labels come from public taxonomy, including newly added categories. A raw
 * backend code is not customer-facing copy, even during loading or failure. */
export const getCategoryFilterLabel = (
  code: string,
  categories: CategoryDto[],
  products: ProductCardDto[] = [],
): string => visibleText(categories.find((category) => category.code === code)?.display_name)
  ?? visibleText(products.find((product) => product.category.code === code)?.category.display_name)
  ?? "Danh mục đã chọn";

export const getCatalogueCountCopy = (
  renderedCount: number,
  totalCount: number | null,
  hasMore: boolean,
): { result: string; progress: string } => {
  const exactTotal = typeof totalCount === "number" && Number.isInteger(totalCount)
    && totalCount >= renderedCount && (!hasMore || totalCount > renderedCount)
    ? totalCount
    : hasMore ? null : renderedCount;
  return {
    result: exactTotal === null ? `${renderedCount} sản phẩm đã hiển thị` : `${exactTotal} sản phẩm`,
    progress: exactTotal === null
      ? `Đã hiển thị ${renderedCount} sản phẩm · Còn sản phẩm`
      : `Đã hiển thị ${renderedCount}/${exactTotal} sản phẩm`,
  };
};
