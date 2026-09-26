import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ProductDetailTemplate } from "@/components/catalogue/product-detail-template";
import { ProductDetailDto } from "@/types/public-api";

vi.mock("@/components/catalogue/product-gallery", () => ({
  ProductGallery: ({ product }: { product: ProductDetailDto }) => createElement("img", { src: product.cover_media?.url, alt: product.name }),
}));
vi.mock("@/components/catalogue/contact-actions", () => ({
  ContactActions: () => createElement("div", { className: "test-contact-actions" }),
}));
vi.mock("@/components/catalogue/product-card", () => ({ ProductCard: () => null }));

const product: ProductDetailDto = {
  product_id: "00000000-0000-4000-8000-000000000099",
  slug: "real-model-x",
  name: "Máy khoan mẫu kiểm thử",
  primary_code: "DC-REAL-99",
  model: "DC-REAL",
  brand: { code: "PUBLIC", display_name: "Public catalogue" },
  domain: "POWER_TOOLS",
  category: { code: "PT_DRILL", display_name: "Khoan và siết/vặn", domain: "POWER_TOOLS", path: ["POWER_TOOLS", "PT_DRILL"], sort_order: 0 },
  availability: "IN_STOCK",
  updated_at: "2026-09-23T00:00:00Z",
  cover_media: { media_id: "real-media", type: "IMAGE", url: "https://public.example/products/real-model-x.png", sort_order: 0 },
  features: [{ code: "compact", label: "Thân máy nhỏ gọn" }],
  spec_groups: [{ code: "technical", label: "Kỹ thuật", items: [{ code: "weight", label: "Trọng lượng", value: "2.5", unit: "kg" }] }],
};

const renderDetail = (overrides: Partial<ProductDetailDto> = {}) => renderToStaticMarkup(createElement(ProductDetailTemplate, {
  product: { ...product, ...overrides },
  config: null,
  relatedProducts: [],
  onBack: vi.fn(),
  onOpenGallery: vi.fn(),
  onOpenProduct: vi.fn(),
  onRequestConsultation: vi.fn(),
  onRequestSpecification: vi.fn(),
  isSaved: false,
  onToggleSaved: vi.fn(),
  isCompared: false,
  onToggleCompare: vi.fn(),
}));

describe("approved product-detail structure", () => {
  it("groups gallery/summary and information cards for desktop columns without changing actual media", () => {
    const html = renderDetail();
    expect(html).toContain('class="detail-template__layout"');
    expect(html).toContain('class="detail-template__summary"');
    expect(html).toContain('class="detail-template__information-grid"');
    expect(html).toContain('src="https://public.example/products/real-model-x.png"');
    expect(html).not.toContain("product-detail-source.png");
  });

  it("keeps the approved action icons/order and real information/specification values", () => {
    const html = renderDetail();
    expect(html).toContain("lucide-zoom-in");
    expect(html).toContain("lucide-heart");
    expect(html).toContain("lucide-git-compare-arrows");
    expect(html.indexOf('class="detail-template__identity-actions"')).toBeLessThan(html.indexOf('class="detail-template__model"'));
    expect(html).toContain("Thân máy nhỏ gọn");
    expect(html).toContain("2.5 kg");
    expect(html).toContain("Tư vấn thông số");
    expect(html).toContain("Gửi yêu cầu đặt hàng");
  });

  it("adds a desktop product summary while retaining the preorder customer promise", () => {
    const html = renderDetail({ availability: "PREORDER" });
    expect(html).toContain('class="detail-template__conversion-summary"><strong>DC-REAL-99</strong>');
    expect(html).toContain("Gửi yêu cầu đặt trước");
    expect(html).toContain("lucide-clock-3");
  });
});
