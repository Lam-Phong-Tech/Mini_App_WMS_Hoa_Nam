import { runtimeSettings, RuntimeSettings } from "@/config/runtime";
import {
  ApiEnvelope,
  ApiMeta,
  ApiSuccess,
  CategoryDto,
  DomainCode,
  FacetDto,
  HealthVersionDto,
  HomeDto,
  ProductCardDto,
  ProductDetailDto,
  ProductQuery,
  PublicConfigDto,
  QuoteAcceptedDto,
  QuoteRequestInput,
} from "@/types/public-api";

import { createSafeFailure, requestEnvelope } from "./api-client";
import {
  mapBackendCategories,
  mapBackendConfig,
  mapBackendFacets,
  mapBackendHealth,
  mapBackendHome,
  mapBackendProductDetail,
  mapBackendProductPage,
  mapBackendQuoteAccepted,
} from "./backend-public-mappers";

interface DevFixture {
  fixture_label: "DEV_UI_PREVIEW_FIXTURE_NOT_UAT_OR_PRODUCTION";
  approved_catalogue_data_present: false;
  config: PublicConfigDto;
  home: HomeDto;
  categories: CategoryDto[];
  products: ProductCardDto[];
  product_details: ProductDetailDto[];
  facets: FacetDto[];
}

const devPreviewCategory = (code: string, display_name: string, domain: DomainCode, sort_order: number): CategoryDto => ({
  code,
  display_name,
  domain,
  parent_code: null,
  path: [domain, code],
  sort_order,
});

const devPreviewCategories: CategoryDto[] = [
  devPreviewCategory("DEV_DRILL_FASTEN", "Khoan & siết", "POWER_TOOLS", 1),
  devPreviewCategory("DEV_CONCRETE", "Bê tông & xây nề", "POWER_TOOLS", 2),
  devPreviewCategory("DEV_GRINDING", "Mài & đánh bóng", "POWER_TOOLS", 3),
  devPreviewCategory("DEV_CUTTING", "Cưa & cắt", "POWER_TOOLS", 4),
  devPreviewCategory("DEV_MEASURING", "Đo lường & chiếu sáng", "POWER_TOOLS", 5),
  devPreviewCategory("DEV_GARDEN", "Làm vườn", "POWER_TOOLS", 6),
  devPreviewCategory("DEV_CLAMPING", "Dụng cụ kẹp giữ", "HAND_TOOLS", 1),
  devPreviewCategory("DEV_WRENCH", "Cờ lê", "HAND_TOOLS", 2),
  devPreviewCategory("DEV_FASTENING", "Dụng cụ siết vặn", "HAND_TOOLS", 3),
  devPreviewCategory("DEV_HAND_CUTTING", "Dụng cụ cắt", "HAND_TOOLS", 4),
  devPreviewCategory("DEV_HAND_MEASURING", "Dụng cụ đo lường", "HAND_TOOLS", 5),
  devPreviewCategory("DEV_WALL_FINISHING", "Dụng cụ sơn & làm tường", "HAND_TOOLS", 6),
  devPreviewCategory("DEV_BATTERY", "Pin & sạc", "ACCESSORIES", 1),
  devPreviewCategory("DEV_DRILL_BITS", "Mũi khoan & đầu vít", "ACCESSORIES", 2),
  devPreviewCategory("DEV_CUTTING_WHEELS", "Lưỡi cắt & đá mài", "ACCESSORIES", 3),
];

interface DevProductContent {
  name: string;
  model: string;
  description: string;
  features: string[];
  specs: Array<{ code: string; label: string; value: string }>;
  mediaFile: string;
}

const devPreviewProduct = (index: number, categoryCode: string, content: DevProductContent): ProductDetailDto => {
  const category = devPreviewCategories.find((item) => item.code === categoryCode);
  if (!category) throw new Error(`Unknown DEV preview category: ${categoryCode}`);
  return {
    product_id: `dev-ui-preview-product-${String(index).padStart(2, "0")}`,
    slug: `dev-preview-${content.model.toLocaleLowerCase()}`,
    name: content.name,
    model: content.model,
    primary_code: null,
    brand: { code: "DEV_PREVIEW", display_name: "Dữ liệu mẫu DEV" },
    domain: category.domain,
    category,
    summary: `${content.description} (DEMO DEV)`,
    cover_media: {
      media_id: `dev-wireframe-${content.mediaFile}`,
      type: "IMAGE",
      url: `/dev-wireframe-media/${content.mediaFile}`,
      alt: `${content.name} — ảnh mẫu wireframe DEV`,
      sort_order: 0,
    },
    availability: "IN_STOCK",
    updated_at: `2026-08-${String(20 + index).padStart(2, "0")}T08:00:00+07:00`,
    // The fixture itself is labelled DEV-only in its contract and Home notice.
    // Keep the rendered product copy equal to the wireframe so this reusable
    // template can accept a production DTO without presentation changes.
    description: content.description,
    features: content.features.map((label, featureIndex) => ({ code: `dev-feature-${index}-${featureIndex}`, label })),
    spec_groups: [{ code: `dev-spec-group-${index}`, label: "Thông tin sản phẩm", items: content.specs }],
    variants: [],
    bundle_items: [],
    compatibility: [],
    media: [],
  };
};

const devPreviewProductDetails: ProductDetailDto[] = [
  devPreviewProduct(1, "DEV_DRILL_FASTEN", { name: "Máy vặn vít dùng pin không chổi than", model: "DCPL2045", description: "Thân máy nhỏ gọn, đèn LED đôi và cơ cấu kiểm soát mô-men xoắn cho không gian làm việc hẹp.", features: ["Không chổi than", "Đèn LED", "Kiểm soát mô-men xoắn"], specs: [{ code: "power", label: "Nguồn điện", value: "20V MAX" }, { code: "power_output", label: "Công suất tối đa", value: "270W" }, { code: "torque", label: "Mô-men xoắn", value: "45 N.m" }, { code: "chuck", label: "Dung lượng kẹp", value: "Lục giác 6,35 mm" }], mediaFile: "dcpl2045.jpg" }),
  devPreviewProduct(2, "DEV_CONCRETE", { name: "Máy đầm búa không dây", model: "DCZC02-26", description: "Ba chế độ khoan, khoan búa và phá dỡ; thiết kế tối ưu cho công việc bê tông và xây nề.", features: ["Không chổi than", "Điều khiển an toàn DSC", "3 chế độ"], specs: [{ code: "power", label: "Nguồn điện", value: "20V MAX" }, { code: "power_output", label: "Công suất tối đa", value: "600W" }, { code: "concrete", label: "Bê tông", value: "Ø26 mm" }, { code: "weight", label: "Trọng lượng", value: "3,4 kg" }], mediaFile: "dczc02-26.png" }),
  devPreviewProduct(3, "DEV_GRINDING", { name: "Máy mài góc dùng pin không chổi than", model: "DCSM03-100", description: "Máy mài góc dùng pin, tay cầm thoải mái và lưới lọc bụi kim loại tháo rời thuận tiện vệ sinh.", features: ["Không chổi than", "Chống rung", "Lọc bụi tháo rời"], specs: [{ code: "power", label: "Nguồn điện", value: "20V MAX" }, { code: "power_output", label: "Công suất tối đa", value: "630W" }, { code: "disc", label: "Đường kính đá", value: "Ø100 mm" }, { code: "speed", label: "Tốc độ định mức", value: "8.500/phút" }], mediaFile: "dcsm03-100.png" }),
  devPreviewProduct(4, "DEV_CUTTING", { name: "Cưa tròn không dây không chổi than", model: "DCMY125", description: "Cưa tròn dùng pin với góc cắt điều chỉnh, đèn làm việc LED và kết cấu gọn cho thao tác một tay.", features: ["Không chổi than", "Đèn LED", "Điều chỉnh góc cắt"], specs: [{ code: "power", label: "Nguồn điện", value: "20V MAX" }, { code: "power_output", label: "Công suất tối đa", value: "800W" }, { code: "blade", label: "Lưỡi cưa", value: "Ø125 mm" }, { code: "angle", label: "Góc cắt", value: "45°" }], mediaFile: "dcmy125.png" }),
  devPreviewProduct(5, "DEV_MEASURING", { name: "Máy đo khoảng cách bằng laser", model: "DDF07-100", description: "Thiết bị đo khoảng cách laser nhỏ gọn, hỗ trợ nhiều chế độ đo và màn hình đọc rõ thông số.", features: ["Đo 8 lần", "Màn hình số", "Tự tắt tiết kiệm pin"], specs: [{ code: "range", label: "Phạm vi đo", value: "0,05-100 m" }, { code: "resolution", label: "Đơn vị nhỏ nhất", value: "1 mm" }, { code: "laser", label: "Cấp laser", value: "2" }, { code: "weight", label: "Trọng lượng", value: "102 g" }], mediaFile: "ddf07-100.png" }),
  devPreviewProduct(6, "DEV_GARDEN", { name: "Cắt cành không dây không chổi than", model: "DCPR16351", description: "Kéo cắt cành dùng pin, lưỡi thép SK5 và thân máy nhỏ gọn cho công việc làm vườn.", features: ["Không chổi than", "Lưỡi SK5", "Công tắc an toàn"], specs: [{ code: "power", label: "Nguồn điện", value: "16V MAX" }, { code: "power_output", label: "Công suất tối đa", value: "500W" }, { code: "hard_branch", label: "Cành cứng", value: "Ø20 mm" }, { code: "soft_branch", label: "Cành mềm", value: "Ø35 mm" }], mediaFile: "dcpr16351.png" }),
  devPreviewProduct(7, "DEV_DRILL_FASTEN", { name: "Máy khoan điện", model: "DJZ03-6", description: "Máy khoan điện nhỏ gọn, tốc độ biến đổi và công tắc đảo chiều cho các công việc khoan cơ bản.", features: ["Tốc độ biến đổi", "Đảo chiều", "Đầu kẹp 6,5 mm"], specs: [{ code: "power", label: "Nguồn điện", value: "Điện AC" }, { code: "power_output", label: "Công suất", value: "420W" }, { code: "speed", label: "Tốc độ không tải", value: "0-4.200/phút" }, { code: "steel", label: "Khả năng khoan thép", value: "Ø6,5 mm" }], mediaFile: "djz03-6.png" }),
  devPreviewProduct(8, "DEV_CONCRETE", { name: "Máy khoan búa", model: "DZC05-26B", description: "Máy khoan búa điện với ba chế độ khoan, búa-khoan và phá dỡ cho công việc xây dựng.", features: ["3 chế độ", "Khớp an toàn", "SDS-Plus"], specs: [{ code: "power", label: "Nguồn điện", value: "Điện AC" }, { code: "power_output", label: "Công suất", value: "800W" }, { code: "speed", label: "Tốc độ không tải", value: "0-1.200/phút" }, { code: "concrete", label: "Bê tông", value: "Ø26 mm" }], mediaFile: "dzc05-26b.png" }),
  devPreviewProduct(9, "DEV_WRENCH", { name: "Bộ cờ lê kết hợp 8 chi tiết", model: "D053808", description: "Bộ cờ lê kết hợp nhiều kích thước, bố trí trên giá giữ gọn cho bảo quản và mang theo.", features: ["8 chi tiết", "Thép dụng cụ", "Giá giữ đi kèm"], specs: [{ code: "set", label: "Quy cách", value: "Bộ 8 chi tiết" }, { code: "package", label: "Đóng gói", value: "1/5/20" }], mediaFile: "d053808.jpg" }),
  devPreviewProduct(10, "DEV_FASTENING", { name: "Bộ đầu vít 26 chi tiết", model: "D020501", description: "Bộ đầu vít nhiều quy cách được sắp xếp trong hộp, phù hợp sửa chữa và bảo trì thông dụng.", features: ["26 chi tiết", "Hộp phân loại", "Nhiều chuẩn đầu vít"], specs: [{ code: "set", label: "Quy cách", value: "26 chi tiết" }, { code: "package", label: "Kiểu đóng gói", value: "Hộp" }, { code: "group", label: "Nhóm", value: "Dụng cụ siết vặn" }], mediaFile: "d020501.jpg" }),
  devPreviewProduct(11, "DEV_HAND_MEASURING", { name: "Thước cuộn thép", model: "D130109", description: "Thước cuộn thép có bề mặt sơn mờ giảm phản chiếu và vỏ ABS chịu va đập.", features: ["Vỏ ABS", "Móc chống trượt", "Bề mặt sơn mờ"], specs: [{ code: "size", label: "Quy cách", value: "5 m x 25 mm" }, { code: "width", label: "Bề rộng", value: "25 mm" }], mediaFile: "d130109.jpg" }),
  devPreviewProduct(12, "DEV_WALL_FINISHING", { name: "Bàn cắt gạch", model: "D211508", description: "Bàn cắt gạch dùng lưỡi hợp kim, hỗ trợ đường cắt thẳng và cơ cấu dẫn hướng ổn định.", features: ["Lưỡi hợp kim", "Dẫn hướng ổn định", "Khung thép"], specs: [{ code: "tile_thickness", label: "Độ dày gạch", value: "6-15 mm" }, { code: "tile_width", label: "Chiều rộng gạch", value: "35-800 mm" }], mediaFile: "d211508.jpg" }),
];

const devPreviewFixture: DevFixture = {
  fixture_label: "DEV_UI_PREVIEW_FIXTURE_NOT_UAT_OR_PRODUCTION",
  approved_catalogue_data_present: false,
  config: {
    config_version: "DEV-UI-PREVIEW-1",
    hotline: null,
    zalo_oa: null,
    support_hours: null,
    privacy_policy_url: null,
    privacy_version: null,
    maintenance: {
      enabled: false,
      message: null,
      estimated_end_at: null,
    },
    min_supported_app_version: null,
    feature_flags: {
      catalogue_enabled: true,
      quote_request_enabled: false,
    },
  },
  home: {
    domains: [
      { code: "POWER_TOOLS", display_name: "Máy công cụ" },
      { code: "HAND_TOOLS", display_name: "Dụng cụ cầm tay" },
      { code: "ACCESSORIES", display_name: "Phụ kiện" },
    ],
    sections: [
      {
        kind: "CATEGORY_HIGHLIGHTS",
        title: "Danh mục nổi bật",
        items: devPreviewCategories.slice(0, 4),
      },
      {
        kind: "FEATURED_PRODUCTS",
        title: "Mẫu hiển thị",
        items: devPreviewProductDetails.slice(0, 4),
      },
    ],
  },
  categories: devPreviewCategories,
  products: devPreviewProductDetails,
  product_details: devPreviewProductDetails,
  facets: [
    {
      code: "category",
      label: "Danh mục",
      type: "CATEGORY",
      options: devPreviewCategories.map((category) => ({
        value: category.code,
        label: category.display_name,
        count: devPreviewProductDetails.filter((product) => product.category.code === category.code).length,
      })),
    },
  ],
};

export interface PublicApiAdapter {
  getConfig(): Promise<ApiEnvelope<PublicConfigDto>>;
  getHome(): Promise<ApiEnvelope<HomeDto>>;
  getCategories(domain?: DomainCode): Promise<ApiEnvelope<CategoryDto[]>>;
  getProducts(query?: ProductQuery): Promise<ApiEnvelope<ProductCardDto[]>>;
  getProduct(slug: string): Promise<ApiEnvelope<ProductDetailDto>>;
  getRelatedProducts(
    slug: string,
    cursor?: string,
    limit?: number,
  ): Promise<ApiEnvelope<ProductCardDto[]>>;
  getFacets(query?: ProductQuery): Promise<ApiEnvelope<FacetDto[]>>;
  getHealthVersion(): Promise<ApiEnvelope<HealthVersionDto>>;
  createQuoteRequest(
    input: QuoteRequestInput,
    idempotencyKey: string,
  ): Promise<ApiEnvelope<QuoteAcceptedDto>>;
}

let requestSequence = 0;

const createRequestId = () => {
  requestSequence += 1;
  return `client-${Date.now().toString(36)}-${requestSequence}`;
};

const asSuccess = <T>(data: T, meta: ApiMeta = {}): ApiSuccess<T> => ({
  success: true,
  message: "Đã tải dữ liệu",
  data,
  meta: {
    request_id: createRequestId(),
    ...meta,
  },
  error_code: null,
  errors: null,
});

const appendQuery = (query?: ProductQuery): string => {
  if (!query) return "";

  const searchParams = new URLSearchParams();
  if (query.q?.trim()) searchParams.set("q", query.q.trim());
  if (query.domain) searchParams.set("domain", query.domain);
  if (query.category) searchParams.set("category", query.category);
  if (query.power_source) searchParams.set("power_source", query.power_source);
  query.feature?.forEach((feature) => searchParams.append("feature", feature));
  if (query.spec) {
    Object.entries(query.spec).forEach(([code, value]) => {
      if (!/^[a-z][a-z0-9_]*$/.test(code)) return;
      const values = Array.isArray(value) ? value : [value];
      values.forEach((item) => searchParams.append(`spec.${code}`, item));
    });
  }
  if (query.sort) searchParams.set("sort", query.sort);
  if (query.cursor) searchParams.set("cursor", query.cursor);
  if (query.limit) searchParams.set("limit", String(query.limit));

  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : "";
};

const createApiBaseUrl = (origin: string): string =>
  `${origin.replace(/\/$/, "")}/api/v1/public`;

export class HttpPublicApiAdapter implements PublicApiAdapter {
  private readonly apiBaseUrl: string;

  constructor(origin: string) {
    this.apiBaseUrl = createApiBaseUrl(origin);
  }

  private get(path: string): Promise<ApiEnvelope<unknown>> {
    return requestEnvelope<unknown>(`${this.apiBaseUrl}${path}`, {
      headers: {
        Accept: "application/json",
        "X-Request-ID": createRequestId(),
      },
    });
  }

  private async mapResponse<T>(
    response: Promise<ApiEnvelope<unknown>>,
    mapper: (value: unknown) => T | null,
  ): Promise<ApiEnvelope<T>> {
    const envelope = await response;
    if (!envelope.success) return envelope;

    const data = mapper(envelope.data);
    return data === null
      ? createSafeFailure("INTERNAL_ERROR", envelope.meta)
      : { ...envelope, data };
  }

  async getConfig(): Promise<ApiEnvelope<PublicConfigDto>> {
    return this.mapResponse(this.get("/config"), mapBackendConfig);
  }

  async getHome(): Promise<ApiEnvelope<HomeDto>> {
    return this.mapResponse(this.get("/home"), mapBackendHome);
  }

  async getCategories(domain?: DomainCode): Promise<ApiEnvelope<CategoryDto[]>> {
    return this.mapResponse(
      this.get(`/categories${domain ? `?domain=${encodeURIComponent(domain)}` : ""}`),
      mapBackendCategories,
    );
  }

  async getProducts(query?: ProductQuery): Promise<ApiEnvelope<ProductCardDto[]>> {
    const envelope = await this.get(`/products${appendQuery(query)}`);
    if (!envelope.success) return envelope;
    const page = mapBackendProductPage(envelope.data);
    return {
      ...envelope,
      data: page.items,
      meta: {
        ...envelope.meta,
        next_cursor: page.next_cursor,
        ...(page.limit ? { limit: page.limit } : {}),
      },
    };
  }

  async getProduct(slug: string): Promise<ApiEnvelope<ProductDetailDto>> {
    return this.mapResponse(this.get(`/products/${encodeURIComponent(slug)}`), mapBackendProductDetail);
  }

  getRelatedProducts(
    slug: string,
    cursor?: string,
    limit?: number,
  ): Promise<ApiEnvelope<ProductCardDto[]>> {
    const search = appendQuery({ cursor, limit });
    return this.getProductsFromPage(`/products/${encodeURIComponent(slug)}/related${search}`);
  }

  private async getProductsFromPage(path: string): Promise<ApiEnvelope<ProductCardDto[]>> {
    const envelope = await this.get(path);
    if (!envelope.success) return envelope;
    const page = mapBackendProductPage(envelope.data);
    return {
      ...envelope,
      data: page.items,
      meta: {
        ...envelope.meta,
        next_cursor: page.next_cursor,
        ...(page.limit ? { limit: page.limit } : {}),
      },
    };
  }

  async getFacets(query?: ProductQuery): Promise<ApiEnvelope<FacetDto[]>> {
    return this.mapResponse(this.get(`/facets${appendQuery(query)}`), mapBackendFacets);
  }

  async getHealthVersion(): Promise<ApiEnvelope<HealthVersionDto>> {
    return this.mapResponse(this.get("/health/version"), mapBackendHealth);
  }

  createQuoteRequest(
    input: QuoteRequestInput,
    idempotencyKey: string,
  ): Promise<ApiEnvelope<QuoteAcceptedDto>> {
    return this.mapResponse(requestEnvelope<unknown>(`${this.apiBaseUrl}/quote-requests`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "X-Request-ID": createRequestId(),
      },
      body: JSON.stringify(input),
    }, fetch, 15_000), mapBackendQuoteAccepted);
  }
}

const normalizeDevSearchText = (value: string): string =>
  value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");

const getDevCursorOffset = (cursor: string | undefined): number | null => {
  if (!cursor) return 0;
  const match = /^dev-preview-offset-(\d+)$/.exec(cursor);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
};

const getDevPageLimit = (limit: number | undefined): number => {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(Math.max(Math.floor(limit ?? 20), 1), 50);
};

const hasDevValueFilter = (query: ProductQuery): boolean =>
  Boolean(query.power_source || query.feature?.length || Object.keys(query.spec ?? {}).length);

const getDevSearchRank = (product: ProductCardDto, query: string): number => {
  const normalizedQuery = normalizeDevSearchText(query);
  if (!normalizedQuery) return 3;

  const name = normalizeDevSearchText(product.name);
  const category = normalizeDevSearchText(product.category.display_name);
  if (name.startsWith(normalizedQuery)) return 1;
  if (category.includes(normalizedQuery)) return 2;
  return 3;
};

const filterDevProducts = (query: ProductQuery = {}): ProductCardDto[] => {
  const normalizedQuery = normalizeDevSearchText(query.q ?? "");
  if (hasDevValueFilter(query)) return [];

  const filtered = devPreviewFixture.products.filter((product) => {
    if (query.domain && product.domain !== query.domain) return false;
    if (query.category && product.category.code !== query.category) return false;
    if (!normalizedQuery) return true;

    const searchable = [
      product.model,
      product.primary_code,
      product.name,
      product.category.display_name,
      product.summary,
    ]
      .filter((value): value is string => typeof value === "string")
      .map(normalizeDevSearchText)
      .join(" ");
    return searchable.includes(normalizedQuery);
  });

  return [...filtered].sort((first, second) => {
    if (query.sort === "name_asc") {
      return first.name.localeCompare(second.name, "vi");
    }
    if (query.sort === "updated_desc") {
      return second.updated_at.localeCompare(first.updated_at);
    }
    if (normalizedQuery) {
      return getDevSearchRank(first, normalizedQuery) - getDevSearchRank(second, normalizedQuery);
    }
    return 0;
  });
};

const getDevProductPage = (
  products: ProductCardDto[],
  cursor: string | undefined,
  limit: number | undefined,
): ApiEnvelope<ProductCardDto[]> => {
  const offset = getDevCursorOffset(cursor);
  if (offset === null || offset > products.length) {
    return createSafeFailure("INVALID_CURSOR");
  }

  const pageLimit = getDevPageLimit(limit);
  const data = products.slice(offset, offset + pageLimit);
  const nextOffset = offset + data.length;
  return asSuccess(data, {
    next_cursor: nextOffset < products.length ? `dev-preview-offset-${nextOffset}` : null,
    limit: pageLimit,
  });
};

export class DevMockPublicApiAdapter implements PublicApiAdapter {
  getConfig(): Promise<ApiEnvelope<PublicConfigDto>> {
    return Promise.resolve(asSuccess(devPreviewFixture.config));
  }

  getHome(): Promise<ApiEnvelope<HomeDto>> {
    return Promise.resolve(asSuccess(devPreviewFixture.home));
  }

  getCategories(domain?: DomainCode): Promise<ApiEnvelope<CategoryDto[]>> {
    const categories = domain
      ? devPreviewFixture.categories.filter((category) => category.domain === domain)
      : devPreviewFixture.categories;
    return Promise.resolve(asSuccess(categories));
  }

  getProducts(query?: ProductQuery): Promise<ApiEnvelope<ProductCardDto[]>> {
    return Promise.resolve(getDevProductPage(filterDevProducts(query), query?.cursor, query?.limit));
  }

  getProduct(slug: string): Promise<ApiEnvelope<ProductDetailDto>> {
    const product = devPreviewFixture.product_details.find((item) => item.slug === slug);
    return Promise.resolve(product ? asSuccess(product) : createSafeFailure("PRODUCT_NOT_FOUND"));
  }

  getRelatedProducts(
    slug: string,
    cursor?: string,
    limit?: number,
  ): Promise<ApiEnvelope<ProductCardDto[]>> {
    const product = devPreviewFixture.product_details.find((item) => item.slug === slug);
    if (!product) return Promise.resolve(createSafeFailure("PRODUCT_NOT_FOUND"));

    const related = devPreviewFixture.products.filter(
      (item) => item.slug !== product.slug && item.domain === product.domain,
    );
    return Promise.resolve(getDevProductPage(related, cursor, limit));
  }

  getFacets(query?: ProductQuery): Promise<ApiEnvelope<FacetDto[]>> {
    const categories = query?.domain
      ? devPreviewFixture.categories.filter((category) => category.domain === query.domain)
      : devPreviewFixture.categories;
    const facets = devPreviewFixture.facets.map((facet) => ({
      ...facet,
      options: facet.options.filter((option) => categories.some((category) => category.code === option.value)),
    }));
    return Promise.resolve(asSuccess(facets));
  }

  getHealthVersion(): Promise<ApiEnvelope<HealthVersionDto>> {
    return Promise.resolve(
      asSuccess({
        api_version: "v1",
        min_supported_app_version: null,
        status: "ok",
      }),
    );
  }

  createQuoteRequest(): Promise<ApiEnvelope<QuoteAcceptedDto>> {
    return Promise.resolve(createSafeFailure("PRODUCT_NOT_AVAILABLE"));
  }
}

export const createPublicApiAdapter = (
  settings: RuntimeSettings = runtimeSettings,
): PublicApiAdapter =>
  settings.useDevMock
    ? new DevMockPublicApiAdapter()
    : new HttpPublicApiAdapter(settings.apiBaseUrl);
