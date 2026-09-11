import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  ProductLibraryKind,
  RECENT_PRODUCTS_LIMIT,
  SAVED_PRODUCTS_LIMIT,
  putProductIdFirst,
  readProductIds,
  removeMissingProductIds,
  toggleProductId,
  writeProductIds,
} from "@/library/product-library";

interface ProductLibraryContextValue {
  recentIds: string[];
  savedIds: string[];
  storageAvailable: boolean;
  recordViewed: (productId: string) => void;
  toggleSaved: (productId: string) => void;
  clearRecent: () => void;
  reconcileMissing: (productIds: string[]) => void;
}

const ProductLibraryContext = createContext<ProductLibraryContextValue | null>(null);

const getStorage = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const limitFor = (kind: ProductLibraryKind) => kind === "recent" ? RECENT_PRODUCTS_LIMIT : SAVED_PRODUCTS_LIMIT;

export const ProductLibraryProvider = ({ children }: { children: ReactNode }) => {
  const storage = getStorage();
  const [recentIds, setRecentIds] = useState(() => readProductIds(storage, "recent", RECENT_PRODUCTS_LIMIT));
  const [savedIds, setSavedIds] = useState(() => readProductIds(storage, "saved", SAVED_PRODUCTS_LIMIT));
  const [storageAvailable, setStorageAvailable] = useState(Boolean(storage));

  const persist = useCallback((kind: ProductLibraryKind, ids: string[]) => {
    const persisted = writeProductIds(getStorage(), kind, ids, limitFor(kind));
    setStorageAvailable(persisted);
  }, []);

  const recordViewed = useCallback((productId: string) => {
    setRecentIds((current) => {
      const next = putProductIdFirst(current, productId, RECENT_PRODUCTS_LIMIT);
      persist("recent", next);
      return next;
    });
  }, [persist]);

  const toggleSaved = useCallback((productId: string) => {
    setSavedIds((current) => {
      const next = toggleProductId(current, productId, SAVED_PRODUCTS_LIMIT);
      persist("saved", next);
      return next;
    });
  }, [persist]);

  const clearRecent = useCallback(() => {
    setRecentIds(() => {
      persist("recent", []);
      return [];
    });
  }, [persist]);

  const reconcileMissing = useCallback((productIds: string[]) => {
    if (!productIds.length) return;
    setRecentIds((current) => {
      const next = removeMissingProductIds(current, productIds);
      if (next.length !== current.length) persist("recent", next);
      return next;
    });
    setSavedIds((current) => {
      const next = removeMissingProductIds(current, productIds);
      if (next.length !== current.length) persist("saved", next);
      return next;
    });
  }, [persist]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== getStorage()) return;
      if (event.key === "hn-product-library-v1:recent") {
        setRecentIds(readProductIds(getStorage(), "recent", RECENT_PRODUCTS_LIMIT));
      }
      if (event.key === "hn-product-library-v1:saved") {
        setSavedIds(readProductIds(getStorage(), "saved", SAVED_PRODUCTS_LIMIT));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<ProductLibraryContextValue>(() => ({
    recentIds,
    savedIds,
    storageAvailable,
    recordViewed,
    toggleSaved,
    clearRecent,
    reconcileMissing,
  }), [clearRecent, recentIds, reconcileMissing, recordViewed, savedIds, storageAvailable, toggleSaved]);

  return <ProductLibraryContext.Provider value={value}>{children}</ProductLibraryContext.Provider>;
};

export const useProductLibrary = () => {
  const context = useContext(ProductLibraryContext);
  if (!context) throw new Error("useProductLibrary must be rendered inside ProductLibraryProvider");
  return context;
};
