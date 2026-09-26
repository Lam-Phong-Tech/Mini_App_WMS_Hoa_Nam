import { ProductCardDto } from "@/types/public-api";

export interface ProductListCacheEntry {
  products: ProductCardDto[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount?: number | null;
}

interface StoredProductListCache { generation: number; entry: ProductListCacheEntry }
interface ProductViewCount { queryKey: string; generation: number; count: number }

let catalogueGeneration = 0;
const productListCache = new Map<string, StoredProductListCache>();
const productViewCounts = new Map<string, ProductViewCount>();
const scrollPositions = new Map<string, number>();

export const getCatalogueGeneration = (): number => catalogueGeneration;

export const getProductListCache = (key: string, generation = catalogueGeneration): ProductListCacheEntry | undefined => {
  const cached = productListCache.get(key);
  return generation === catalogueGeneration && cached?.generation === generation ? cached.entry : undefined;
};

export const setProductListCache = (key: string, entry: ProductListCacheEntry, generation = catalogueGeneration): void => {
  // Older in-flight requests must not repopulate a refreshed catalogue.
  if (generation !== catalogueGeneration) return;
  productListCache.set(key, { generation, entry });
};

const viewCountKey = (key: string, scope: string) => JSON.stringify([key, scope]);

/** Share data, not presentation: a Home scan of 100 records must not make a
 * new Products view reveal 100, nor a four-card Search reduce it below 20. */
export const getProductViewCount = (key: string, scope: string, initialCount: number, generation = catalogueGeneration): number => {
  const cached = productViewCounts.get(viewCountKey(key, scope));
  return generation === catalogueGeneration && cached?.generation === generation ? cached.count : initialCount;
};

export const setProductViewCount = (key: string, scope: string, count: number, generation = catalogueGeneration): void => {
  if (generation !== catalogueGeneration || !Number.isInteger(count) || count < 0) return;
  productViewCounts.set(viewCountKey(key, scope), { queryKey: key, generation, count });
};

export const clearProductListCache = (key: string): void => {
  productListCache.delete(key);
  productViewCounts.forEach((entry, scopedKey) => {
    if (entry.queryKey === key) productViewCounts.delete(scopedKey);
  });
};

/** Invalidate public catalogue data only, never quote drafts or library IDs. */
export const advanceCatalogueGeneration = (): number => {
  catalogueGeneration += 1;
  productListCache.clear();
  productViewCounts.clear();
  return catalogueGeneration;
};

export const rememberScrollPosition = (key: string, position: number): void => {
  scrollPositions.set(key, Math.max(position, 0));
};

export const getRememberedScrollPosition = (key: string): number =>
  scrollPositions.get(key) ?? 0;
