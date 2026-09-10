import { useRef } from "react";

import { ProductCardDto } from "@/types/public-api";

import { getPublicProducts, isVirtualProductGridEligible } from "@/catalogue/catalogue-utils";
import { useProductReveal } from "@/hooks/use-product-reveal";

import { ProductCard } from "./product-card";
import { VirtualProductGrid } from "./virtual-product-grid";

interface ProductGridProps {
  products: ProductCardDto[];
  returnPath: string;
  label: string;
  /** Server records loaded for this query before the progressive render cap. */
  loadedCount?: number;
}

export const ProductGrid = ({ products, returnPath, label, loadedCount = products.length }: ProductGridProps) => {
  const visibleProducts = getPublicProducts(products);
  const gridRef = useRef<HTMLDivElement>(null);
  const isVirtual = isVirtualProductGridEligible(loadedCount, visibleProducts.length);
  useProductReveal(gridRef, visibleProducts.length, !isVirtual);
  if (!visibleProducts.length) return null;

  if (isVirtual) {
    return <VirtualProductGrid products={visibleProducts} returnPath={returnPath} label={label} loadedCount={loadedCount} />;
  }

  return (
    <div ref={gridRef} className="product-grid" aria-label={label} data-loaded-count={loadedCount}>
      {visibleProducts.map((product) => (
        <ProductCard key={product.product_id} product={product} returnPath={returnPath} />
      ))}
    </div>
  );
};
