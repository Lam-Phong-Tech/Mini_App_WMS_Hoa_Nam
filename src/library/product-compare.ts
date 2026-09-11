import { ProductCardDto } from "@/types/public-api";

export interface ComparisonItem {
  product_id: string;
  slug: string;
  domain: ProductCardDto["domain"];
  category_code: string;
}

export type CompareToggleOutcome = "added" | "removed" | "limit" | "category";

export interface CompareToggleResult {
  outcome: CompareToggleOutcome;
  items: ComparisonItem[];
}

const MAX_COMPARISON_PRODUCTS = 3;

const toComparisonItem = (product: ProductCardDto): ComparisonItem => ({
  product_id: product.product_id,
  slug: product.slug,
  domain: product.domain,
  category_code: product.category.code,
});

/** G4 comparison is intentionally RAM-only and constrained to one taxonomy. */
export const toggleComparisonProduct = (
  selected: ComparisonItem[],
  product: ProductCardDto,
): CompareToggleResult => {
  const existing = selected.find((item) => item.product_id === product.product_id);
  if (existing) {
    return {
      outcome: "removed",
      items: selected.filter((item) => item.product_id !== product.product_id),
    };
  }
  if (selected.length >= MAX_COMPARISON_PRODUCTS) return { outcome: "limit", items: selected };
  if (selected.length && (
    selected[0].domain !== product.domain
    || selected[0].category_code !== product.category.code
  )) {
    return { outcome: "category", items: selected };
  }
  return { outcome: "added", items: [...selected, toComparisonItem(product)] };
};

