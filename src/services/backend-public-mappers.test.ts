import { describe, expect, it } from "vitest";

import {
  mapBackendCategories,
  mapBackendConfig,
  mapBackendFacets,
  mapBackendHealth,
  mapBackendHome,
  mapBackendProductDetail,
  mapBackendProductPage,
  mapBackendQuoteAccepted,
} from "@/services/backend-public-mappers";

const backendProduct = {
  id: "01a042bb-c079-7174-8e3e-bd03d38bfb8d",
  slug: "hn-prd-seed-001",
  name: "Máy bơm PV mẫu Hoa Nam",
  short_description: "Mô tả ngắn",
  description: "Mô tả sản phẩm",
  primary_code: "HN-PRD-SEED-001",
  model: "Hoa Nam Model 01",
  domain: "POWER_TOOLS",
  brand: { code: "HOANAM", name: "Hoa Nam" },
  category: { code: "PUMP", name: "Máy bơm nước" },
  images: [{ url: "https://cdn.example.test/product.jpg", alt_text: "Ảnh sản phẩm", is_primary: true }],
  features: [{ code: "ENERGY_SAVING", name: "Tiết kiệm năng lượng" }],
  specifications: [{ code: "power", label: "Công suất", value: "750W" }],
  variants: [{ id: "01a042bb-c079-7174-8e3e-bd03d38bfb8e", code: "HN-PRD-SEED-001", name: "Bản tiêu chuẩn", unit: "cái" }],
  updated_at: "2026-08-30T07:25:34+07:00",
};

describe("public storefront backend mappers", () => {
  it("keeps public power-source specs without exposing importer provenance", () => {
    const product = mapBackendProductDetail({
      ...backendProduct,
      specifications: { power_source: "Pin", power_source_detail: "Pin 20V", voltage: "20V", source_file: "private.pdf", internal_source: "private", barcode: "12345" },
    });
    expect(product?.spec_groups?.flatMap((group) => group.items.map((item) => item.code))).toEqual(["power_source", "power_source_detail", "voltage"]);
  });
  it("maps the pushed public config without making up an OA target", () => {
    const config = mapBackendConfig({
      contact: { hotline: "1900 1234", zalo_oa_id: null, zalo_oa_url: null },
      support_hours: {
        timezone: "Asia/Ho_Chi_Minh",
        weekday: { open: "08:00", close: "17:30" },
        saturday: { open: "08:00", close: "12:00" },
      },
      privacy: { url: "https://hoanam.vn/chinh-sach-bao-mat", version: "1.0.0" },
      quote_request: { max_items: 21, max_quantity: 12 },
      maintenance: { enabled: false, message: "Bảo trì" },
      feature_flags: { quote_request: true },
      contract_version: "1.0.0",
    });

    expect(config).toMatchObject({
      config_version: "1.0.0",
      hotline: { display: "1900 1234", tel: "1900 1234" },
      zalo_oa: null,
      privacy_policy_url: "https://hoanam.vn/chinh-sach-bao-mat",
      privacy_version: "1.0.0",
    });
    expect(config.support_hours?.intervals).toHaveLength(2);
    expect(config.quote_request).toEqual({ max_items: 21, max_quantity: 12 });
  });

  it("keeps the privacy version separate from the Public Storefront contract version", () => {
    const config = mapBackendConfig({
      contract_version: "1.2.0",
      privacy: { version: "1.0.0", url: "https://hoanam.vn/chinh-sach-bao-mat" },
      quote_request: { max_items: 20, max_quantity: 9999 },
    });

    expect(config.config_version).toBe("1.2.0");
    expect(config.privacy_version).toBe("1.0.0");
    expect(config.quote_request).toEqual({ max_items: 20, max_quantity: 9999 });
  });

  it("prefers the v1.1 public config fields while retaining legacy fallbacks", () => {
    const config = mapBackendConfig({
      config_version: "operating-config-7",
      hotline: { display: "098 636 6675", tel: "+84986366675" },
      zalo_oa: null,
      support_hours: {
        timezone: "Asia/Ho_Chi_Minh",
        intervals: [{ days: ["MON", "TUE"], opens_at: "08:00", closes_at: "17:30" }],
      },
      privacy_policy_url: "https://hoanam.vn/chinh-sach-bao-mat",
      privacy_version: "1.0.0",
      maintenance: { enabled: false },
    });

    expect(config).toMatchObject({
      config_version: "operating-config-7",
      hotline: { display: "098 636 6675", tel: "+84986366675" },
      privacy_policy_url: "https://hoanam.vn/chinh-sach-bao-mat",
      privacy_version: "1.0.0",
    });
    expect(config.support_hours?.intervals).toEqual([{ days: ["MON", "TUE"], opens_at: "08:00", closes_at: "17:30" }]);
  });

  it("keeps only taxonomy-complete public products and preserves cursor metadata", () => {
    const page = mapBackendProductPage({
      items: [backendProduct, { ...backendProduct, id: "missing-domain", domain: null }],
      page_info: { limit: 20, has_more: true, next_cursor: "opaque-cursor" },
    });

    expect(page.page_info).toMatchObject({ next_cursor: "opaque-cursor", has_more: true, limit: 20 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      product_id: backendProduct.id,
      category: { display_name: "Máy bơm nước" },
      cover_media: { url: "https://cdn.example.test/product.jpg" },
      availability: "IN_STOCK",
    });
  });

  it("maps only the approved public PREORDER availability", () => {
    const preorder = mapBackendProductPage({
      items: [
        { ...backendProduct, id: "preorder", availability: "PREORDER" },
        { ...backendProduct, id: "private-stock", availability: "OUT_OF_STOCK" },
      ],
      page_info: { limit: 20, has_more: false, next_cursor: null },
    });

    expect(preorder.items).toHaveLength(1);
    expect(preorder.items[0]).toMatchObject({ product_id: "preorder", availability: "PREORDER" });
  });

  it("treats a missing cursor as the end even if an invalid page says it has more", () => {
    expect(mapBackendProductPage({ items: [], page_info: { has_more: true, next_cursor: null } }).page_info).toEqual({
      has_more: false,
      next_cursor: null,
    });
  });

  it("preserves optional public totals without manufacturing missing counts", () => {
    expect(mapBackendCategories({ items: [{ code: "MEASURING_TOOLS", name: "Dụng cụ đo lường", domain: "HAND_TOOLS", product_count: 59 }] })[0].product_count).toBe(59);
    expect(mapBackendCategories({ items: [{ code: "PUMP", name: "Máy bơm", domain: "POWER_TOOLS", product_count: -1 }] })[0].product_count).toBeUndefined();
    expect(mapBackendProductPage({ items: [], page_info: { total: 59, next_cursor: "next-page", has_more: true } }).page_info.total).toBe(59);
    expect(mapBackendProductPage({ items: [], page_info: { total: 0, next_cursor: null, has_more: false } }).page_info.total).toBe(0);
    expect(mapBackendProductPage({ items: [], page_info: { next_cursor: "next-page", has_more: true } }).page_info.total).toBeUndefined();
    expect(mapBackendProductPage({ items: [], page_info: { total: -1, next_cursor: null, has_more: false } }).page_info.total).toBeUndefined();
  });

  it("maps home, categories, detail, facets, health, and quote success to the app contract", () => {
    const home = mapBackendHome({
      domains: [{ code: "POWER_TOOLS", name: "Máy và thiết bị động lực" }],
      sections: [{ code: "NEWEST", title: "Mới cập nhật", type: "PRODUCT_CAROUSEL", items: [backendProduct] }],
    });
    const categories = mapBackendCategories([{ code: "PUMP", name: "Máy bơm nước", domain: "POWER_TOOLS" }]);
    const detail = mapBackendProductDetail(backendProduct);
    const facets = mapBackendFacets({
      category: [{ code: "PUMP", name: "Máy bơm nước", count: 1 }],
      power_source: [],
      feature: [{ code: "ENERGY_SAVING", name: "Tiết kiệm năng lượng", count: 1 }],
      spec: [{ code: "power", label: "Công suất", param: "spec.power", values: [{ value: "750W", count: 1 }] }],
    });

    expect(home.sections[0].kind).toBe("RECENTLY_UPDATED");
    expect(home.sections[0].source_code).toBe("NEWEST");
    expect(categories[0]).toMatchObject({ code: "PUMP", display_name: "Máy bơm nước", sort_order: 1 });
    expect(detail).toMatchObject({
      product_id: backendProduct.id,
      spec_groups: [{ items: [{ value: "750W" }] }],
      variants: [{ variant_name: "Bản tiêu chuẩn", availability: "IN_STOCK" }],
    });
    expect(facets.map((facet) => facet.code)).toEqual(["category", "feature", "power"]);
    expect(mapBackendHealth({ status: "MAINTENANCE" }).status).toBe("maintenance");
    expect(mapBackendQuoteAccepted({ request_id: "req-001", status: "RECEIVED" })).toEqual({ request_id: "req-001", status: "RECEIVED" });
  });

  it("keeps approved catalogue detail when the importer returns specification JSON", () => {
    const detail = mapBackendProductDetail({
      ...backendProduct,
      family_name: "Khoan búa dùng pin không chổi than",
      usage: "Khoan, khoan búa và phá dỡ bê tông theo cấu hình máy.",
      package_contents: "Cấu hình pin và sạc; Mã vạch: 6927073993173; Đóng gói: 1/6/24",
      features: ["Không chổi than", "Ba chế độ vận hành", "Barcode: 6927073993173"],
      specifications: {
        power_source: "Pin",
        power: "600W",
        capability: "Khoan bê tông tối đa Φ26mm",
        no_load_speed: "0-960/phút",
        internal_note: "must never reach the Mini App",
        barcode: "6927073993173",
      },
    });

    expect(detail).toMatchObject({
      family_name: "Khoan búa dùng pin không chổi than",
      usage: "Khoan, khoan búa và phá dỡ bê tông theo cấu hình máy.",
      package_contents: "Cấu hình pin và sạc",
      features: [{ label: "Không chổi than" }, { label: "Ba chế độ vận hành" }],
    });
    expect(detail?.spec_groups?.[0]?.items).toEqual(expect.arrayContaining([
      { code: "power", label: "Công suất", value: "600W" },
      { code: "capability", label: "Khả năng", value: "Khoan bê tông tối đa Φ26mm" },
    ]));
    expect(detail?.spec_groups?.[0]?.items.map((item) => item.code)).not.toContain("barcode");
    expect(detail?.spec_groups?.[0]?.items.map((item) => item.code)).not.toContain("internal_note");
  });

  it("repairs the UTF-8-as-Latin-1 title currently returned by the Power Tools home section", () => {
    const home = mapBackendHome({
      domains: [],
      sections: [{ code: "DOMAIN_POWER_TOOLS", title: "Dá»¥ng cá»¥ Äiá»n", items: [backendProduct] }],
    });

    expect(home.sections[0]).toMatchObject({ kind: "FEATURED_PRODUCTS", title: "Dụng cụ điện" });
  });
});
