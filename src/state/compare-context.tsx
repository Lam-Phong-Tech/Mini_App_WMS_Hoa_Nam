import { ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

import { ComparisonItem, CompareToggleOutcome, toggleComparisonProduct } from "@/library/product-compare";
import { ProductCardDto } from "@/types/public-api";

interface CompareContextValue {
  items: ComparisonItem[];
  toggle: (product: ProductCardDto) => CompareToggleOutcome;
  clear: () => void;
  notice: CompareNotice | null;
  dismissNotice: () => void;
}

export interface CompareNotice {
  message: string;
  canOpenComparison: boolean;
}

const CompareContext = createContext<CompareContextValue | null>(null);

/** Comparison choice is RAM only; it stores public product identity metadata, never PII. */
export const CompareProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<ComparisonItem[]>([]);
  const [notice, setNotice] = useState<CompareNotice | null>(null);
  const toggle = useCallback((product: ProductCardDto): CompareToggleOutcome => {
    const result = toggleComparisonProduct(items, product);
    if (result.outcome === "added" || result.outcome === "removed") setItems(result.items);
    if (result.outcome === "added") {
      setNotice({ message: "Đã thêm sản phẩm vào danh sách so sánh.", canOpenComparison: true });
    }
    if (result.outcome === "limit") {
      setNotice({ message: "Bạn có thể so sánh tối đa 3 sản phẩm. Hãy bỏ một sản phẩm để chọn thêm.", canOpenComparison: true });
    }
    if (result.outcome === "category") {
      setNotice({ message: "Chỉ so sánh sản phẩm cùng nhóm và danh mục.", canOpenComparison: false });
    }
    return result.outcome;
  }, [items]);
  const clear = useCallback(() => {
    setItems([]);
    setNotice(null);
  }, []);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const value = useMemo(
    () => ({ items, toggle, clear, notice, dismissNotice }),
    [clear, dismissNotice, items, notice, toggle],
  );
  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
};

export const useCompare = () => {
  const context = useContext(CompareContext);
  if (!context) throw new Error("useCompare must be rendered inside CompareProvider");
  return context;
};
