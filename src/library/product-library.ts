import { ProductCardDto } from "@/types/public-api";

export const RECENT_PRODUCTS_LIMIT = 30;
export const SAVED_PRODUCTS_LIMIT = 100;
export const PRODUCT_LIBRARY_SCHEMA_VERSION = 1;

export type ProductLibraryKind = "recent" | "saved";

export interface ProductIdStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface PersistedProductIds {
  version: number;
  ids: string[];
}

const PUBLIC_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const storageKey = (kind: ProductLibraryKind) => `hn-product-library-v${PRODUCT_LIBRARY_SCHEMA_VERSION}:${kind}`;

export const normalizeStoredProductIds = (values: unknown, limit: number): string[] => {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    if (typeof value !== "string") return;
    const id = value.trim().toLowerCase();
    if (!PUBLIC_UUID.test(id) || seen.has(id) || result.length >= limit) return;
    seen.add(id);
    result.push(id);
  });
  return result;
};

export const readProductIds = (
  storage: ProductIdStorage | null,
  kind: ProductLibraryKind,
  limit: number,
): string[] => {
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey(kind));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<PersistedProductIds>;
    if (parsed.version !== PRODUCT_LIBRARY_SCHEMA_VERSION) return [];
    return normalizeStoredProductIds(parsed.ids, limit);
  } catch {
    return [];
  }
};

export const writeProductIds = (
  storage: ProductIdStorage | null,
  kind: ProductLibraryKind,
  ids: string[],
  limit: number,
): boolean => {
  if (!storage) return false;
  try {
    const normalized = normalizeStoredProductIds(ids, limit);
    if (!normalized.length) storage.removeItem(storageKey(kind));
    else storage.setItem(storageKey(kind), JSON.stringify({ version: PRODUCT_LIBRARY_SCHEMA_VERSION, ids: normalized }));
    return true;
  } catch {
    return false;
  }
};

export const putProductIdFirst = (ids: string[], productId: string, limit: number): string[] =>
  normalizeStoredProductIds([productId, ...ids], limit);

export const toggleProductId = (ids: string[], productId: string, limit: number): string[] => {
  const normalized = normalizeStoredProductIds([productId], 1)[0];
  if (!normalized) return ids;
  return ids.includes(normalized)
    ? ids.filter((id) => id !== normalized)
    : putProductIdFirst(ids, normalized, limit);
};

/** Only an authoritative successful missing_ids response may remove records. */
export const removeMissingProductIds = (ids: string[], missingIds: string[]): string[] => {
  const missing = new Set(normalizeStoredProductIds(missingIds, SAVED_PRODUCTS_LIMIT));
  return ids.filter((id) => !missing.has(id));
};

/** The server preserves IDs order; the client preserves it defensively as well. */
export const orderProductsByIds = (ids: string[], products: ProductCardDto[]): ProductCardDto[] => {
  const byId = new Map(products.map((product) => [product.product_id.toLowerCase(), product]));
  return ids.reduce<ProductCardDto[]>((ordered, id) => {
    const product = byId.get(id.toLowerCase());
    if (product) ordered.push(product);
    return ordered;
  }, []);
};
