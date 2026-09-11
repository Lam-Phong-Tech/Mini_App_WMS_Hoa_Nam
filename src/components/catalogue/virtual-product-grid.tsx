import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ProductCardDto } from "@/types/public-api";

import { ProductCard } from "./product-card";

interface VirtualProductGridProps {
  products: ProductCardDto[];
  returnPath: string;
  label: string;
  loadedCount: number;
}

/**
 * Virtual rows are owned solely by TanStack; neither GSAP nor route motion is
 * allowed to transform them. The ZaUI Page element stays the scroll owner.
 */
export const VirtualProductGrid = ({ products, returnPath, label, loadedCount }: VirtualProductGridProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  const [columns, setColumns] = useState(2);
  const [focusedRow, setFocusedRow] = useState<number | null>(null);

  useEffect(() => {
    setScrollRoot(rootRef.current?.closest<HTMLElement>(".hn-page") ?? null);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 701px)");
    const updateColumns = () => setColumns(query.matches ? 4 : 2);
    updateColumns();
    query.addEventListener?.("change", updateColumns);
    return () => query.removeEventListener?.("change", updateColumns);
  }, []);

  const rows = useMemo(() => Array.from(
    { length: Math.ceil(products.length / columns) },
    (_, rowIndex) => products.slice(rowIndex * columns, rowIndex * columns + columns),
  ), [columns, products]);

  const rangeExtractor = useCallback((range: Parameters<typeof defaultRangeExtractor>[0]) => {
    const rangeItems = defaultRangeExtractor(range);
    return focusedRow === null
      ? rangeItems
      : [...new Set([...rangeItems, focusedRow])].sort((first, second) => first - second);
  }, [focusedRow]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRoot,
    // Product cards include the bottom save/compare action bar. Keep the first
    // range at least as tall as that complete mobile card to prevent transient
    // row overlap before TanStack's measurements settle.
    estimateSize: () => (columns === 2 ? 360 : 390),
    overscan: 3,
    getItemKey: (rowIndex) => rows[rowIndex]?.[0]?.product_id ?? rowIndex,
    rangeExtractor,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [columns, products.length, virtualizer]);

  return (
    <div
      ref={rootRef}
      className="product-grid product-grid--virtual"
      aria-label={label}
      data-virtual-columns={columns}
      data-loaded-count={loadedCount}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusedRow(null);
      }}
    >
      <div className="product-grid__virtual-spacer" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            ref={virtualizer.measureElement}
            data-index={virtualRow.index}
            className="product-grid__virtual-row"
            style={{ transform: `translateY(${virtualRow.start}px)` }}
            onFocusCapture={() => setFocusedRow(virtualRow.index)}
          >
            {rows[virtualRow.index]?.map((product) => (
              <ProductCard key={product.product_id} product={product} returnPath={returnPath} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
