import { useNavigate } from "zmp-ui";

import {
  createProductDetailPath,
  getAvailabilityLabel,
  isEligiblePublicProduct,
  isPreorderAvailability,
  visibleText,
} from "@/catalogue/catalogue-utils";
import { ProductCardDto } from "@/types/public-api";

import { PublicImage } from "./public-image";

interface ProductCardProps {
  product: ProductCardDto;
  returnPath: string;
}

export const ProductCard = ({ product, returnPath }: ProductCardProps) => {
  const navigate = useNavigate();
  if (!isEligiblePublicProduct(product)) return null;

  const model = visibleText(product.model);
  const primaryCode = visibleText(product.primary_code);
  const isPreorder = isPreorderAvailability(product.availability);

  return (
    <article className="product-card">
      <button
        type="button"
        className="product-card__link"
        onClick={() => navigate(createProductDetailPath(product.slug, returnPath), { animate: false })}
        aria-label={`Xem ${product.name}`}
      >
        <PublicImage media={product.cover_media} alt={product.name} className="product-card__image" />
        <span className={`availability-chip ${isPreorder ? "availability-chip--preorder" : ""}`}>{getAvailabilityLabel(product.availability)}</span>
        <strong className="product-card__name">{visibleText(product.name)}</strong>
        {model || primaryCode ? (
          <span className="product-card__identity">{model ?? primaryCode}</span>
        ) : null}
        {model && primaryCode ? <span className="product-card__code">{primaryCode}</span> : null}
      </button>
    </article>
  );
};
