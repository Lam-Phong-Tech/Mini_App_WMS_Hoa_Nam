import { useState } from "react";

import { getAvailabilityLabel, isPreorderAvailability, visibleText } from "@/catalogue/catalogue-utils";
import { ContactActions } from "@/components/catalogue/contact-actions";
import { ProductGallery } from "@/components/catalogue/product-gallery";
import { PublicImage } from "@/components/catalogue/public-image";
import { UiIcon } from "@/components/ui-icon";
import {
  ProductCardDto,
  ProductDetailDto,
  PublicConfigDto,
} from "@/types/public-api";

type DetailTab = "information" | "specifications";

const DOMAIN_LABELS = {
  POWER_TOOLS: "Power Tools",
  HAND_TOOLS: "Hand Tools",
  ACCESSORIES: "Accessories",
} as const;

interface ProductDetailTemplateProps {
  product: ProductDetailDto;
  config: PublicConfigDto | null;
  relatedProducts: ProductCardDto[];
  onOpenGallery: () => void;
  onOpenProduct: (slug: string) => void;
  onRequestConsultation: () => void;
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
  onOpenGallery,
  onOpenProduct,
  onRequestConsultation,
}: ProductDetailTemplateProps) => {
  const [activeTab, setActiveTab] = useState<DetailTab>("information");
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
  const model = visibleText(product.model);
  const summary = visibleText(product.summary);
  const description = visibleText(product.description);
  const familyName = visibleText(product.family_name);
  const usage = visibleText(product.usage);
  const packageContents = visibleText(product.package_contents);
  const category = visibleText(product.category.display_name);
  const primaryCode = visibleText(product.primary_code);
  const identitySummary = summary && summary !== description ? summary : null;
  const isPreorder = isPreorderAvailability(product.availability);
  const availabilityLabel = getAvailabilityLabel(product.availability);
  const requestLabel = isPreorder ? "Đặt trước" : "Yêu cầu tư vấn";

  return (
    <article className="product-detail-template">
      <section className="detail-template__gallery" aria-label="Hình ảnh sản phẩm">
        <ProductGallery product={product} />
        <button className="detail-template__zoom" type="button" onClick={onOpenGallery}>
          <UiIcon name="search" size={17} strokeWidth={2.2} />
          Xem ảnh
        </button>
      </section>

      <section className="detail-template__identity">
        <div className="detail-template__badges">
          <span className={`availability-chip ${isPreorder ? "availability-chip--preorder" : ""}`}>{availabilityLabel}</span>
          <span className="detail-template__domain">{DOMAIN_LABELS[product.domain]}</span>
        </div>
        <h1>{visibleText(product.name)}</h1>
        {model ? <p className="detail-template__model">Model: <strong>{model}</strong></p> : null}
        {primaryCode && primaryCode !== model ? <p className="detail-template__model">Mã sản phẩm: <strong>{primaryCode}</strong></p> : null}
        {identitySummary ? <p className="detail-template__description">{identitySummary}</p> : null}
      </section>

      <div className="detail-template__tabs" role="tablist" aria-label="Thông tin sản phẩm">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "information"}
          className={activeTab === "information" ? "is-active" : ""}
          onClick={() => setActiveTab("information")}
        >
          Thông tin
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "specifications"}
          className={activeTab === "specifications" ? "is-active" : ""}
          onClick={() => setActiveTab("specifications")}
        >
          Thông số
        </button>
      </div>

      {activeTab === "information" ? (
        <section className="detail-template__panel" role="tabpanel">
          {description ? (
            <div className="detail-template__block">
              <h2>Mô tả sản phẩm</h2>
              <p className="detail-template__body">{description}</p>
            </div>
          ) : null}
          {usage ? (
            <div className="detail-template__block detail-template__block--muted">
              <h2>Công dụng</h2>
              <p className="detail-template__body">{usage}</p>
            </div>
          ) : null}
          {features.length ? (
            <div className="detail-template__block">
              <h2>Tính năng nổi bật</h2>
              <ul className="detail-template__feature-chips">
                {features.map((feature) => <li key={feature.code}><UiIcon name="check" size={16} strokeWidth={2.2} />{feature.label}</li>)}
              </ul>
            </div>
          ) : null}
          {packageContents ? (
            <div className="detail-template__block detail-template__block--muted">
              <h2>Phụ kiện và cấu hình</h2>
              <p className="detail-template__body">{packageContents}</p>
            </div>
          ) : null}
          {category ? (
            <div className="detail-template__block detail-template__classification">
              <h2>Phân loại</h2>
              <div><span>Thương hiệu</span><strong>{visibleText(product.brand.display_name)}</strong></div>
              <div><span>Danh mục</span><strong>{category}</strong></div>
              {familyName ? <div><span>Chủng loại</span><strong>{familyName}</strong></div> : null}
              {model ? <div><span>Model</span><strong>{model}</strong></div> : null}
              {primaryCode && primaryCode !== model ? <div><span>Mã sản phẩm</span><strong>{primaryCode}</strong></div> : null}
              <div><span>Tình trạng</span><strong className={isPreorder ? "is-preorder" : "is-success"}>{availabilityLabel}</strong></div>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="detail-template__panel" role="tabpanel">
          {specGroups.length ? (
            <div className="detail-template__block detail-template__specifications">
              <h2>Thông số kỹ thuật</h2>
              {specGroups.map((group) => (
                <div key={group.code} className="detail-template__spec-group">
                  {specGroups.length > 1 ? <h3>{group.label}</h3> : null}
                  {group.items.map((item) => <div key={item.code}><span>{item.label}</span><strong>{item.value}{item.unit ? ` ${item.unit}` : ""}</strong></div>)}
                </div>
              ))}
            </div>
          ) : <p className="detail-template__empty">Thông số sẽ hiển thị khi Catalogue công khai cung cấp dữ liệu.</p>}
        </section>
      )}

      {relatedProducts.length ? (
        <section className="detail-template__related" aria-label="Sản phẩm liên quan">
          <h2>Sản phẩm liên quan</h2>
          <div>
            {relatedProducts.slice(0, 3).map((related) => (
              <button key={related.product_id} type="button" onClick={() => onOpenProduct(related.slug)} aria-label={`Xem ${visibleText(related.name) ?? "sản phẩm liên quan"}`}>
                <PublicImage media={related.cover_media} alt={related.name} />
                <strong>{visibleText(related.model) ?? visibleText(related.name)}</strong>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="detail-template__conversion" aria-label="Yêu cầu sản phẩm">
        <button type="button" className="detail-template__request" onClick={onRequestConsultation}>{requestLabel}</button>
        <ContactActions config={config} showUnavailable className="detail-template__contact-actions" />
      </section>
    </article>
  );
};
