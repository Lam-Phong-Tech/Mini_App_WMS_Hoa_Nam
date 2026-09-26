import { getPublicProducts } from "@/catalogue/catalogue-utils";
import { ProductCardDto } from "@/types/public-api";

export const HOME_CATALOGUE_TARGETS = {
  POWER_TOOLS: { inStock: 10, preorder: 4 },
  HAND_TOOLS: { inStock: 4, preorder: 2 },
} as const;

export type HomeCatalogueDomain = keyof typeof HOME_CATALOGUE_TARGETS;

const getDomainCandidates = (products: ProductCardDto[], domain: HomeCatalogueDomain): ProductCardDto[] =>
  Array.from(new Map(getPublicProducts(products)
    .filter((product) => product.domain === domain)
    .map((product) => [product.product_id, product])).values());

/** A full first page is not evidence that a requested stock state is absent. */
export const needsHomeDomainCandidates = (products: ProductCardDto[], domain: HomeCatalogueDomain): boolean => {
  const candidates = getDomainCandidates(products, domain);
  const target = HOME_CATALOGUE_TARGETS[domain];
  return candidates.filter((product) => product.availability === "IN_STOCK").length < target.inStock
    || candidates.filter((product) => product.availability === "PREORDER").length < target.preorder;
};

/** Prefer the approved 14/6 domain mix and 14/6 stock mix, but never invent
 * inventory. A real shortage is filled only from that same domain's records. */
export const selectHomeCatalogue = (powerTools: ProductCardDto[], handTools: ProductCardDto[]): ProductCardDto[] => {
  const selectDomain = (products: ProductCardDto[], domain: HomeCatalogueDomain): ProductCardDto[] => {
    const candidates = getDomainCandidates(products, domain);
    const target = HOME_CATALOGUE_TARGETS[domain];
    const preferred = [
      ...candidates.filter((product) => product.availability === "IN_STOCK").slice(0, target.inStock),
      ...candidates.filter((product) => product.availability === "PREORDER").slice(0, target.preorder),
    ];
    const selectedIds = new Set(preferred.map((product) => product.product_id));
    return preferred.concat(candidates.filter((product) => !selectedIds.has(product.product_id))
      .slice(0, target.inStock + target.preorder - preferred.length));
  };

  return [...selectDomain(powerTools, "POWER_TOOLS"), ...selectDomain(handTools, "HAND_TOOLS")];
};
