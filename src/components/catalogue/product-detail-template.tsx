import { useEffect, useMemo, useState } from "react";

import { getAvailabilityLabel, getProductMedia, getVisibleVariants, isPreorderAvailability, visibleText } from "@/catalogue/catalogue-utils";
import { ContactActions } from "@/components/catalogue/contact-actions";
import { ProductGallery } from "@/components/catalogue/product-gallery";
import { ProductCard } from "@/components/catalogue/product-card";
import { UiIcon } from "@/components/ui-icon";
import {
  ProductCardDto,
  ProductDetailDto,
  PublicConfigDto,
} from "@/types/public-api";

const DOMAIN_LABELS = {
  POWER_TOOLS: "Máy công cụ",
  HAND_TOOLS: "Dụng cụ cầm tay",
  ACCESSORIES: "Phụ kiện",
} as const;

interface ProductDetailTemplateProps {
  product: ProductDetailDto;
  config: PublicConfigDto | null;
  relatedProducts: ProductCardDto[];
  onBack: () => void;
  onOpenGallery: (variantId?: string) => void;
  onOpenProduct: (slug: string) => void;
  onRequestConsultation: (variantId?: string) => void;
  isSaved: boolean;
  onToggleSaved: () => void;
  isCompared: boolean;
  onToggleCompare: () => void;
}

interface ProductFact {
  label: string;
  value: string;
  state?: "is-preorder" | "is-success";
}

/**
 * The canonical public Product Detail layout.
 *
 * Every product is projected from the public DTO into this same template:
 * gallery → identity → information/specification tabs → related → contacts.
 * It deliberately has no product-specific presentation rules, price, quantity
 * or internal/source metadata.
 */
export const ProductDetailTemplate = ({
  product,
  config,
  relatedProducts,
  onBack,
  onOpenGallery,
  onOpenProduct,
  onRequestConsultation,
  isSaved,
  onToggleSaved,
  isCompared,
  onToggleCompare,
}: ProductDetailTemplateProps) => {
  const variants = useMemo(() => getVisibleVariants(product.variants), [product.variants]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const selectedVariant = variants.find((variant) => variant.variant_id === selectedVariantId) ?? variants[0] ?? null;
  const relatedLimitInitial = 6;
  const [relatedLimit, setRelatedLimit] = useState(relatedLimitInitial);
  useEffect(() => {
    setSelectedVariantId((current) => variants.some((variant) => variant.variant_id === current) ? current : variants[0]?.variant_id ?? null);
    setRelatedLimit(relatedLimitInitial);
  }, [product.product_id, variants]);
  const features = product.features
    ?.map((feature) => ({ code: feature.code, label: visibleText(feature.label) }))
    .filter((feature): feature is { code: string; label: string } => Boolean(feature.label)) ?? [];
  const specGroups = product.spec_groups
    ?.map((group) => ({
      ...group,
      label: visibleText(group.label),
      items: group.items
        .map((item) => ({ ...item, label: visibleText(item.label), value: visibleText(item.value), unit: visibleText(item.unit) }))
        .filter((item): item is typeof item & { label: string; value: string } => Boolean(item.label && item.value)),
    }))
    .filter((group): group is typeof group & { label: string } => Boolean(group.label && group.items.length)) ?? [];
  const description = visibleText(product.description);
  const usage = visibleText(product.usage);
  const packageContents = visibleText(product.package_contents);
  const category = visibleText(product.category.display_name);
  const primaryCode = visibleText(product.primary_code);
  const displayAvailability = selectedVariant?.availability ?? product.availability;
  const isPreorder = isPreorderAvailability(displayAvailability);
  const availabilityLabel = getAvailabilityLabel(displayAvailability);
  const requestLabel = isPreorder ? "Đặt trước" : "Yêu cầu tư vấn";
  const hasGalleryMedia = getProductMedia(product, selectedVariant).length > 0;
  const visibleBundleItems = product.bundle_items?.filter((item) => visibleText(item.label)) ?? [];
  const visibleCompatibility = product.compatibility?.filter((item) => visibleText(item.label)) ?? [];
  const visibleRelated = relatedProducts.slice(0, relatedLimit);
  const relatedAreSameCategory = relatedProducts.length > 0 && relatedProducts.every((item) => item.category.code === product.category.code);
  const descriptionHighlights = description
    ?.split(/\r?\n+/)
    .map((line) => line.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean) ?? [];
  const benefitItems = descriptionHighlights.length > 1
    ? descriptionHighlights
    : features.map((feature) => feature.label);
  const productFacts: ProductFact[] = [];
  if (primaryCode) productFacts.push({ label: "Mã sản phẩm", value: primaryCode });
  productFacts.push({ label: "Nhóm sản phẩm", value: DOMAIN_LABELS[product.domain] });
  if (category) productFacts.push({ label: "Danh mục", value: category });
  productFacts.push({
    label: "Tình trạng",
    value: availabilityLabel,
    state: isPreorder ? "is-preorder" : "is-success",
  });

  return (
    <article className="product-detail-template">
      <button type="button" className="detail-template__back" onClick={onBack}>
        <UiIcon name="chevronLeft" size={19} strokeWidth={2.1} />
        Quay lại sản phẩm
      </button>
      <section className="detail-template__gallery" aria-label="Hình ảnh sản phẩm">
        <ProductGallery product={product} variant={selectedVariant} />
        {hasGalleryMedia ? <button className="detail-template__zoom" type="button" onClick={() => onOpenGallery(selectedVariant?.variant_id)}>
          <UiIcon name="search" size={17} strokeWidth={2.2} />
          Xem ảnh
        </button> : null}
      </section>

      <section className="detail-template__identity">
        <div className="detail-template__badges">
          <span className={`availability-chip ${isPreorder ? "availability-chip--preorder" : ""}`}>{availabilityLabel}</span>
          <span className="detail-template__domain">{DOMAIN_LABELS[product.domain]}</span>
        </div>
        {primaryCode ? <p className="detail-template__code">{primaryCode}</p> : null}
        <h1>{visibleText(product.name)}</h1>
        {category ? <p className="detail-template__model">{category}</p> : null}
        <div className="detail-template__identity-actions">
          <button type="button" className={`detail-template__save ${isSaved ? "is-saved" : ""}`} aria-label={isSaved ? "Bỏ lưu sản phẩm" : "Lưu sản phẩm"} aria-pressed={isSaved} onClick={onToggleSaved}>
            <UiIcon name="bookmark" size={19} /><span>{isSaved ? "Đã lưu" : "Lưu"}</span>
          </button>
          <button type="button" className={`detail-template__save ${isCompared ? "is-saved" : ""}`} aria-label={isCompared ? "Bỏ khỏi so sánh" : "So sánh sản phẩm"} aria-pressed={isCompared} onClick={onToggleCompare}>
            <UiIcon name="layers" size={19} /><span>{isCompared ? "Đang so sánh" : "So sánh"}</span>
          </button>
        </div>
        {variants.length > 1 ? (
          <div className="detail-template__variants" aria-label="Chọn phiên bản">
            <span>Phiên bản</span>
            <div>
              {variants.map((variant) => (
                <button
                  key={variant.variant_id}
                  type="button"
                  className={selectedVariant?.variant_id === variant.variant_id ? "is-selected" : ""}
                  aria-pressed={selectedVariant?.variant_id === variant.variant_id}
                  onClick={() => setSelectedVariantId(variant.variant_id)}
                >
                  {visibleText(variant.variant_name)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="detail-template__panel detail-template__panel--reference">
        {benefitItems.length ? (
          <div className="detail-template__block detail-template__benefits">
            <h2>Công dụng và đặc điểm</h2>
            <ul className="detail-template__feature-chips">
              {benefitItems.map((benefit, index) => <li key={`${benefit}:${index}`}><UiIcon name="check" size={16} strokeWidth={2.2} />{benefit}</li>)}
            </ul>
          </div>
        ) : null}
        {usage ? <p className="detail-template__body detail-template__usage">{usage}</p> : null}
        {packageContents ? (
          <div className="detail-template__block detail-template__block--muted">
            <h2>Phụ kiện và cấu hình</h2>
            <p className="detail-template__body">{packageContents}</p>
          </div>
        ) : null}
        {visibleBundleItems.length ? (
          <div className="detail-template__block detail-template__block--muted">
            <h2>Bao gồm</h2>
            <ul className="detail-template__linked-list">
              {visibleBundleItems.map((item, index) => (
                <li key={`${item.product_slug ?? "label"}:${index}`}>
                  {item.product_slug ? <button type="button" onClick={() => onOpenProduct(item.product_slug!)}>{visibleText(item.label)}</button> : visibleText(item.label)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {visibleCompatibility.length ? (
          <div className="detail-template__block detail-template__block--muted">
            <h2>Tương thích</h2>
            <ul className="detail-template__linked-list">
              {visibleCompatibility.map((item, index) => (
                <li key={`${item.product_slug ?? "label"}:${index}`}>
                  {item.product_slug ? <button type="button" onClick={() => onOpenProduct(item.product_slug!)}>{visibleText(item.label)}</button> : visibleText(item.label)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="detail-template__consult-copy">Quan tâm đến sản phẩm này? Gửi yêu cầu để được tư vấn về sản phẩm và đặt hàng.</p>
      </section>

      <section className="detail-template__information" aria-label="Thông tin sản phẩm">
        <h2>Thông tin sản phẩm</h2>
        <dl className="detail-template__classification">
          {productFacts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd className={fact.state}>{fact.value}</dd></div>)}
        </dl>
      </section>

      <section className="detail-template__specifications detail-template__information" aria-label="Thông số kỹ thuật">
        <h2>Thông số kỹ thuật</h2>
        {specGroups.map((group) => (
          <div key={group.code} className="detail-template__spec-group">
            {specGroups.length > 1 ? <h3>{group.label}</h3> : null}
            {group.items.map((item) => <div key={item.code}><span>{item.label}</span><strong>{item.value}{item.unit ? ` ${item.unit}` : ""}</strong></div>)}
          </div>
        ))}
        <p className="detail-template__spec-note">Liên hệ để được tư vấn thông số phù hợp với công việc của bạn.</p>
        <button type="button" className="detail-template__spec-help" onClick={() => onRequestConsultation(selectedVariant?.variant_id)}>Tư vấn thông số</button>
      </section>

      {relatedProducts.length ? (
        <section className="detail-template__related" aria-label="Sản phẩm liên quan">
          <h2>Sản phẩm liên quan</h2>
          <p>{relatedAreSameCategory ? "Khám phá thêm sản phẩm cùng danh mục." : "Khám phá thêm sản phẩm cùng nhóm."}</p>
          <div>
            {visibleRelated.map((related) => (
              <ProductCard key={related.product_id} product={related} onOpen={() => onOpenProduct(related.slug)} />
            ))}
          </div>
          {relatedLimit < relatedProducts.length ? <button className="detail-template__more-related" type="button" onClick={() => setRelatedLimit((current) => Math.min(relatedProducts.length, current + 2))}>Xem thêm sản phẩm liên quan</button> : null}
        </section>
      ) : null}

      <section className="detail-template__conversion" aria-label="Yêu cầu sản phẩm">
        <button type="button" className="detail-template__request" onClick={() => onRequestConsultation(selectedVariant?.variant_id)}>{requestLabel === "Đặt trước" ? "Gửi yêu cầu đặt trước" : "Gửi yêu cầu đặt hàng"}</button>
        <ContactActions config={config} compact showUnavailable className="detail-template__contact-actions" />
      </section>
    </article>
  );
};
