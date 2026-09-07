import { ProductCardDto } from "@/types/public-api";

import { getPublicProducts } from "@/catalogue/catalogue-utils";

import { ProductCard } from "./product-card";

interface ProductGridProps {
  products: ProductCardDto[];
  returnPath: string;
  label: string;
}

export const ProductGrid = ({ products, returnPath, label }: ProductGridProps) => {
  const visibleProducts = getPublicProducts(products);
  if (!visibleProducts.length) return null;

  return (
    <div className="product-grid" aria-label={label}>
      {visibleProducts.map((product) => (
        <ProductCard key={product.product_id} product={product} returnPath={returnPath} />
      ))}
    </div>
  );
};
