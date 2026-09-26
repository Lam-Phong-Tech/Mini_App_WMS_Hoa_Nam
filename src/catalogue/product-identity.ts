import { visibleText } from "@/catalogue/catalogue-utils";
import { ProductCardDto } from "@/types/public-api";

type ProductIdentity = Pick<ProductCardDto, "name" | "model" | "primary_code">;

/** `model` can identify a whole series. Use the public item code wherever the
 * customer needs to distinguish selected models, including RAM snapshots. */
export const getProductModelLabel = (product: ProductIdentity): string =>
  visibleText(product.primary_code)
  ?? visibleText(product.model)
  ?? visibleText(product.name)
  ?? "Sản phẩm đã chọn";

/** Retain only the public display fields consumed by the quote workflow. */
export const createProductSelectionSnapshot = (
  product: ProductIdentity & Pick<ProductCardDto, "product_id">,
) => ({
  product_id: product.product_id,
  name: visibleText(product.name) ?? getProductModelLabel(product),
  model: getProductModelLabel(product),
});
