import { ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

import { ComparisonItem, CompareToggleOutcome, toggleComparisonProduct } from "@/library/product-compare";
import { ProductCardDto } from "@/types/public-api";

interface CompareContextValue {
  items: ComparisonItem[];
  toggle: (product: ProductCardDto) => CompareToggleOutcome;
  clear: () => void;
}

const CompareContext = createContext<CompareContextValue | null>(null);

/** Comparison choice is RAM only; it stores public product identity metadata, never PII. */
export const CompareProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<ComparisonItem[]>([]);
  const toggle = useCallback((product: ProductCardDto): CompareToggleOutcome => {
    const result = toggleComparisonProduct(items, product);
    if (result.outcome === "added" || result.outcome === "removed") setItems(result.items);
    return result.outcome;
  }, [items]);
  const clear = useCallback(() => setItems([]), []);
  const value = useMemo(() => ({ items, toggle, clear }), [clear, items, toggle]);
  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
};

export const useCompare = () => {
  const context = useContext(CompareContext);
  if (!context) throw new Error("useCompare must be rendered inside CompareProvider");
  return context;
};
