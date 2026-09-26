import { useNavigate } from "zmp-ui";

import {
  createProductDetailPath,
  getAvailabilityLabel,
  getProductDisplayName,
  isPreorderAvailability,
  visibleText,
} from "@/catalogue/catalogue-utils";
import { UiIcon } from "@/components/ui-icon";
import { ProductCardDto } from "@/types/public-api";

import { PublicImage } from "./public-image";

interface SearchResultListProps {
  products: ProductCardDto[];
  returnPath: string;
}

/** Search has a distinct compact result treatment in the approved Preview.
 * Catalogue results remain cards; search results use one readable row per
 * product so names, codes and availability never compete for card height. */
export const SearchResultList = ({ products, returnPath }: SearchResultListProps) => {
  const navigate = useNavigate();

  return (
    <section className="search-suggestion-results" aria-label="Kết quả tìm kiếm">
      <div className="search-suggestion-results__list">
        {products.map((product) => {
          const displayName = getProductDisplayName(product) ?? product.name;
          const model = visibleText(product.model);
          const category = visibleText(product.category.display_name);
          const isPreorder = isPreorderAvailability(product.availability);
          const detail = category;

          return (
            <button
              key={product.product_id}
              type="button"
              onClick={() => navigate(createProductDetailPath(product.slug, returnPath), { animate: false })}
              aria-label={`Xem ${product.name}`}
            >
              <PublicImage media={product.cover_media} alt={product.name} className="search-suggestion-results__image" />
              <span className="search-suggestion-results__copy">
                <strong>{displayName}</strong>
                {model ? <small>{model}{detail ? ` · ${detail}` : ""}</small> : detail ? <small>{detail}</small> : null}
              </span>
              <span className={`availability-chip ${isPreorder ? "availability-chip--preorder" : ""}`}>
                <UiIcon name={isPreorder ? "clock" : "checkCircle"} size={14} strokeWidth={2} />
                {getAvailabilityLabel(product.availability)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
