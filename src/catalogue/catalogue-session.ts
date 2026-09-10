import { ProductCardDto } from "@/types/public-api";

export interface ProductListCacheEntry {
  products: ProductCardDto[];
  nextCursor: string | null;
  /** Number of loaded products intentionally revealed in the progressive grid. */
  renderedCount: number;
}

const productListCache = new Map<string, ProductListCacheEntry>();
const scrollPositions = new Map<string, number>();

export const getProductListCache = (key: string): ProductListCacheEntry | undefined =>
  productListCache.get(key);

export const setProductListCache = (key: string, entry: ProductListCacheEntry): void => {
  productListCache.set(key, entry);
};

export const clearProductListCache = (key: string): void => {
  productListCache.delete(key);
};

export const rememberScrollPosition = (key: string, position: number): void => {
  scrollPositions.set(key, Math.max(position, 0));
};

export const getRememberedScrollPosition = (key: string): number =>
  scrollPositions.get(key) ?? 0;
