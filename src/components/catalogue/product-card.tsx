import { useNavigate } from "zmp-ui";

import {
  createProductDetailPath,
  getAvailabilityLabel,
  getProductDisplayName,
  isEligiblePublicProduct,
  isPreorderAvailability,
  visibleText,
} from "@/catalogue/catalogue-utils";
import { ProductCardDto } from "@/types/public-api";
import { UiIcon } from "@/components/ui-icon";
import { useProductLibrary } from "@/state/product-library-context";
import { useCompare } from "@/state/compare-context";

import { PublicImage } from "./public-image";

interface ProductCardProps {
  product: ProductCardDto;
  returnPath?: string;
  onOpen?: (product: ProductCardDto) => void;
}

export const ProductCard = ({ product, returnPath = "/products", onOpen }: ProductCardProps) => {
  const navigate = useNavigate();
  const { savedIds, toggleSaved } = useProductLibrary();
  const { items: compared, toggle: toggleCompare } = useCompare();
  if (!isEligiblePublicProduct(product)) return null;

  const model = visibleText(product.model);
  const primaryCode = visibleText(product.primary_code);
  const isPreorder = isPreorderAvailability(product.availability);
  const isSaved = savedIds.includes(product.product_id.toLowerCase());
  const isCompared = compared.some((item) => item.product_id === product.product_id);
  const onCompare = () => {
    toggleCompare(product);
  };

  return (
    <article className="product-card">
      <button
        type="button"
        className="product-card__link"
        onClick={() => {
          if (onOpen) onOpen(product);
          else navigate(createProductDetailPath(product.slug, returnPath), { animate: false });
        }}
        aria-label={`Xem ${product.name}`}
      >
        <div className="product-card__media">
          <PublicImage media={product.cover_media} alt={product.name} className="product-card__image" />
          <span className={`availability-chip ${isPreorder ? "availability-chip--preorder" : ""}`}>
            <UiIcon name={isPreorder ? "clock" : "checkCircle"} size={14} strokeWidth={2} />
            {getAvailabilityLabel(product.availability)}
          </span>
        </div>
        {primaryCode || model ? (
          <span className="product-card__identity">{primaryCode ?? model}</span>
        ) : null}
        <strong className="product-card__name">{getProductDisplayName(product)}</strong>
        <span className="product-card__cta">Xem chi tiết <UiIcon name="arrowRight" size={17} /></span>
      </button>
      <footer className="product-card__actions" aria-label={`Thao tác với ${product.name}`}>
        <button
          type="button"
          className={`product-card__save ${isSaved ? "is-saved" : ""}`}
          aria-pressed={isSaved}
          aria-label={isSaved ? `Bỏ lưu ${product.name}` : `Lưu ${product.name}`}
          onClick={() => toggleSaved(product.product_id)}
        >
          <UiIcon name="heart" size={20} />
          <span>{isSaved ? "Đã lưu" : "Lưu"}</span>
        </button>
        <button
          type="button"
          className={`product-card__compare ${isCompared ? "is-compared" : ""}`}
          aria-pressed={isCompared}
          aria-label={isCompared ? `Bỏ ${product.name} khỏi so sánh` : `Thêm ${product.name} vào so sánh`}
          onClick={onCompare}
        >
          <UiIcon name="gitCompare" size={20} />
          <span>{isCompared ? "Đã chọn" : "So sánh"}</span>
        </button>
      </footer>
    </article>
  );
};
