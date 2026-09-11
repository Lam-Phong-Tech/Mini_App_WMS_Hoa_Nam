import {
  CategoryDto,
  DOMAIN_CODES,
  DomainCode,
  DomainDto,
  FacetDto,
  FeatureDto,
  HealthVersionDto,
  HomeDto,
  HomeSectionDto,
  MediaDto,
  ProductCardDto,
  ProductIdLookupDto,
  ProductDetailDto,
  PublicAvailability,
  PublicConfigDto,
  QuoteAcceptedDto,
  SpecItemDto,
  VariantDto,
} from "@/types/public-api";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toRecord = (value: unknown): UnknownRecord => isRecord(value) ? value : {};
const toArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const mojibakeMarker = /(?:Ã.|Â.|Ä.|Å.|Æ.|á[º»])/u;

/**
 * The public API must return UTF-8. While its bad source rows are being
 * corrected, recover the common UTF-8-as-Latin-1 form without touching
 * already-valid Vietnamese text or malformed input.
 */
const repairUtf8Mojibake = (value: string): string => {
  if (!mojibakeMarker.test(value) || [...value].some((character) => character.codePointAt(0)! > 0xff)) return value;

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(value, (character) => character.charCodeAt(0)));
  } catch {
    return value;
  }
};

const toText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? repairUtf8Mojibake(value.trim()) : null;
const toBoolean = (value: unknown): boolean => value === true;
const toNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const toScalarText = (value: unknown): string | null =>
  typeof value === "string"
    ? toText(value)
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : null;

const PRIVATE_TEXT_LABEL = /(?:m[aã]\s*v[ạa]ch|barcode|\bprice\b|gi[aá]\s*b[aá]n|\bcost\b|\bsupplier\b|\binternal\b|t[ồo]n\s*kho)/iu;

/** Keep approved public prose while removing a private, delimited fragment. */
const sanitizePublicText = (value: unknown): string | null => {
  const text = toText(value);
  if (!text) return null;

  const withoutInlineBarcode = text
    .replace(/(?:m[aã]\s*v[ạa]ch|barcode)\s*[:#-]?\s*[A-Z0-9-]{8,}/giu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!withoutInlineBarcode) return null;

  const fragments = withoutInlineBarcode
    .split(/\s*(?:;|\r?\n)\s*/u)
    .filter((fragment) => fragment && !PRIVATE_TEXT_LABEL.test(fragment));
  return toText(fragments.join("\n"));
};

const SPEC_LABELS: Record<string, string> = {
  power_source: "Nguồn điện",
  power_source_detail: "Nguồn điện",
  power: "Công suất",
  voltage: "Điện áp",
  capability: "Khả năng",
  no_load_speed: "Tốc độ không tải",
  impact_frequency: "Tần suất va đập",
  max_torque: "Mô-men xoắn tối đa",
  weight: "Trọng lượng",
  dimensions: "Kích thước",
  chuck: "Khả năng kẹp",
  diameter: "Đường kính",
};

const PRIVATE_SPEC_CODE = /(?:barcode|ma_vach|stock|inventory|quantity|price|cost|supplier|internal|source|audit|pdf|catalog|page)/iu;

const toSpecLabel = (code: string, value: unknown): string | null => {
  const record = toRecord(value);
  const explicit = toText(record.label) ?? toText(record.name);
  if (explicit) return explicit;
  return SPEC_LABELS[code] ?? code.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const sanitizePackageContents = (value: unknown): string | null => {
  const text = sanitizePublicText(value);
  if (!text) return null;

  const publicFragments = text
    .split(/[;\n]+/u)
    .map((fragment) => fragment.trim())
    .filter((fragment) => !/^(?:mã\s*vạch|barcode|đóng\s*gói)\s*:/iu.test(fragment));
  return publicFragments.length ? publicFragments.join("; ") : null;
};

const compactMap = <T>(
  value: unknown,
  mapper: (candidate: unknown, index: number) => T | null,
): T[] => toArray(value).reduce<T[]>((items, candidate, index) => {
  const mapped = mapper(candidate, index);
  if (mapped !== null) items.push(mapped);
  return items;
}, []);

const toDomainCode = (value: unknown): DomainCode | null =>
  DOMAIN_CODES.includes(value as DomainCode) ? value as DomainCode : null;

/**
 * Backend must translate its internal stock state to this narrow public enum.
 * Retain the legacy IN_STOCK fallback only while an older public endpoint
 * omits the field; never reinterpret OUT_OF_STOCK as a public product.
 */
const toPublicAvailability = (value: unknown): PublicAvailability | null => {
  const availability = toText(value);
  if (!availability) return "IN_STOCK";
  return availability === "IN_STOCK" || availability === "PREORDER" ? availability : null;
};

const mapBrand = (value: unknown): ProductCardDto["brand"] | null => {
  const brand = toRecord(value);
  const code = toText(brand.code);
  const displayName = toText(brand.name) ?? toText(brand.display_name);
  return code && displayName ? { code, display_name: displayName } : null;
};

const mapCategory = (value: unknown, domain: DomainCode): CategoryDto | null => {
  const category = toRecord(value);
  const code = toText(category.code);
  const displayName = toText(category.name) ?? toText(category.display_name);
  if (!code || !displayName) return null;

  return {
    code,
    display_name: displayName,
    domain,
    parent_code: null,
    path: [domain, code],
    sort_order: 0,
  };
};

const mapMedia = (productId: string, value: unknown): MediaDto[] =>
  compactMap(value, (candidate, index) => {
    const image = toRecord(candidate);
    const url = toText(image.url);
    if (!url) return null;

    return {
      media_id: `${productId}:image:${index}`,
      type: "IMAGE" as const,
      url,
      alt: toText(image.alt_text) ?? toText(image.alt),
      sort_order: index,
    };
  });

const mapFeatures = (value: unknown): FeatureDto[] => {
  if (typeof value === "string") {
    const label = sanitizePublicText(value);
    return label ? [{ code: "feature-1", label }] : [];
  }

  return compactMap(value, (candidate, index) => {
    if (typeof candidate === "string") {
      const label = sanitizePublicText(candidate);
      return label ? { code: `feature-${index + 1}`, label } : null;
    }
    const feature = toRecord(candidate);
    const code = toText(feature.code) ?? `feature-${index + 1}`;
    const label = sanitizePublicText(feature.name) ?? sanitizePublicText(feature.label) ?? sanitizePublicText(feature.value);
    return label ? { code, label } : null;
  });
};

const mapSpecItem = (codeValue: unknown, value: unknown): SpecItemDto | null => {
  const code = toText(codeValue);
  if (!code || PRIVATE_SPEC_CODE.test(code)) return null;
  const record = toRecord(value);
  const textValue = toScalarText(record.value) ?? toScalarText(value);
  const label = toSpecLabel(code, value);
  const unit = toText(record.unit);
  return code && label && textValue ? { code, label, value: textValue, ...(unit ? { unit } : {}) } : null;
};

/** Supports both the original array contract and importer JSON objects. */
const mapSpecItems = (value: unknown): SpecItemDto[] => {
  if (Array.isArray(value)) {
    return compactMap(value, (candidate) => {
      const spec = toRecord(candidate);
      return mapSpecItem(spec.code, candidate);
    });
  }

  return Object.entries(toRecord(value))
    .map(([code, specValue]) => mapSpecItem(code, specValue))
    .filter((item): item is SpecItemDto => item !== null);
};

const mapVariants = (value: unknown): VariantDto[] =>
  compactMap(value, (candidate) => {
    const variant = toRecord(candidate);
    const variantId = toText(variant.id) ?? toText(variant.variant_id);
    const variantName = toText(variant.variant_label) ?? toText(variant.name) ?? toText(variant.variant_name);
    if (!variantId || !variantName) return null;

    const unit = toText(variant.unit);
    const availability = toPublicAvailability(variant.availability);
    if (!availability) return null;
    return {
      variant_id: variantId,
      variant_name: variantName,
      primary_code: toText(variant.code) ?? toText(variant.primary_code),
      attributes: unit ? [{ code: "unit", label: "Đơn vị", value: unit }] : [],
      availability,
    };
  });

/**
 * Public catalogue rows may be IN_STOCK or PREORDER. An item without the
 * agreed domain, category, or brand cannot be rendered safely in the public
 * Mini App taxonomy, so the adapter omits it instead of inventing a value.
 */
export const mapBackendProduct = (value: unknown): ProductCardDto | null => {
  const product = toRecord(value);
  const productId = toText(product.id) ?? toText(product.product_id);
  const slug = toText(product.slug);
  const name = toText(product.name);
  const domain = toDomainCode(product.domain);
  const availability = toPublicAvailability(product.availability);
  if (!productId || !slug || !name || !domain || !availability) return null;

  const brand = mapBrand(product.brand);
  const category = mapCategory(product.category, domain);
  if (!brand || !category) return null;

  const media = mapMedia(productId, product.images ?? product.media);
  const primarySource = toArray(product.images).find((candidate) => toRecord(candidate).is_primary === true);
  const primaryMedia = primarySource ? mapMedia(productId, [primarySource])[0] : media[0] ?? null;

  return {
    product_id: productId,
    slug,
    name,
    model: toText(product.model),
    primary_code: toText(product.primary_code),
    brand,
    domain,
    category,
    summary: sanitizePublicText(product.short_description) ?? sanitizePublicText(product.summary) ?? sanitizePublicText(product.description),
    cover_media: primaryMedia,
    availability,
    updated_at: toText(product.updated_at) ?? "",
  };
};

export const mapBackendProductDetail = (value: unknown): ProductDetailDto | null => {
  const card = mapBackendProduct(value);
  if (!card) return null;

  const product = toRecord(value);
  const specItems = mapSpecItems(product.specifications);
  const media = mapMedia(card.product_id, product.images ?? product.media);

  return {
    ...card,
    description: sanitizePublicText(product.description)
      ?? sanitizePublicText(product.long_description)
      ?? sanitizePublicText(product.product_description)
      ?? sanitizePublicText(product.short_description),
    family_name: toText(product.family_name) ?? toText(product.product_family) ?? toText(product.family),
    usage: toText(product.usage) ?? toText(product.application) ?? toText(product.use_case),
    package_contents: sanitizePackageContents(product.package_contents ?? product.package ?? product.accessories),
    features: mapFeatures(product.features),
    spec_groups: specItems.length ? [{ code: "specifications", label: "Thông số kỹ thuật", items: specItems }] : [],
    variants: mapVariants(product.variants),
    bundle_items: [],
    compatibility: [],
    media,
  };
};

export const mapBackendConfig = (value: unknown): PublicConfigDto => {
  const config = toRecord(value);
  const contact = toRecord(config.contact);
  const privacy = toRecord(config.privacy);
  const maintenance = toRecord(config.maintenance);
  const supportHours = toRecord(config.support_hours);
  const configuredHotline = toRecord(config.hotline);
  const configuredOa = toRecord(config.zalo_oa);
  const weekday = toRecord(supportHours.weekday);
  const saturday = toRecord(supportHours.saturday);
  const intervals: NonNullable<PublicConfigDto["support_hours"]>["intervals"] = compactMap(supportHours.intervals, (candidate) => {
    const interval = toRecord(candidate);
    const days = compactMap(interval.days, (day) => {
      const value = toText(day);
      return value && ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].includes(value)
        ? value as NonNullable<PublicConfigDto["support_hours"]>["intervals"][number]["days"][number]
        : null;
    });
    const opensAt = toText(interval.opens_at);
    const closesAt = toText(interval.closes_at);
    return days.length && opensAt && closesAt ? { days, opens_at: opensAt, closes_at: closesAt } : null;
  });
  const weekdayOpen = toText(weekday.open);
  const weekdayClose = toText(weekday.close);
  const saturdayOpen = toText(saturday.open);
  const saturdayClose = toText(saturday.close);
  const hasConfiguredIntervals = intervals.length > 0;
  if (!hasConfiguredIntervals && weekdayOpen && weekdayClose) intervals.push({ days: ["MON", "TUE", "WED", "THU", "FRI"], opens_at: weekdayOpen, closes_at: weekdayClose });
  if (!hasConfiguredIntervals && saturdayOpen && saturdayClose) intervals.push({ days: ["SAT"], opens_at: saturdayOpen, closes_at: saturdayClose });

  const hotlineDisplay = toText(configuredHotline.display) ?? toText(contact.hotline);
  const hotlineTel = toText(configuredHotline.tel) ?? hotlineDisplay;
  const oaUrl = toText(configuredOa.chat_url) ?? toText(contact.zalo_oa_url);
  const oaId = toText(configuredOa.id) ?? toText(contact.zalo_oa_id);
  const featureFlags = Object.entries(toRecord(config.feature_flags)).reduce<Record<string, boolean>>(
    (result, [key, enabled]) => ({ ...result, [key]: toBoolean(enabled) }),
    {},
  );

  return {
    config_version: toText(config.config_version) ?? toText(config.contract_version) ?? "unknown",
    hotline: hotlineDisplay && hotlineTel ? { display: hotlineDisplay, tel: hotlineTel } : null,
    zalo_oa: oaUrl ? { id: oaId, chat_url: oaUrl } : null,
    support_hours: intervals.length ? { timezone: "Asia/Ho_Chi_Minh", intervals } : null,
    privacy_policy_url: toText(config.privacy_policy_url) ?? toText(privacy.url),
    privacy_version: toText(config.privacy_version) ?? toText(privacy.version),
    maintenance: {
      enabled: toBoolean(maintenance.enabled),
      message: toText(maintenance.message),
      estimated_end_at: null,
    },
    min_supported_app_version: null,
    feature_flags: featureFlags,
  };
};

export const mapBackendHome = (value: unknown): HomeDto => {
  const home = toRecord(value);
  const domains: DomainDto[] = compactMap(home.domains, (candidate) => {
    const domain = toRecord(candidate);
    const code = toDomainCode(domain.code);
    const displayName = toText(domain.name) ?? toText(domain.display_name);
    return code && displayName ? { code, display_name: displayName } : null;
  });

  const sections: HomeSectionDto[] = compactMap(home.sections, (candidate) => {
    const section = toRecord(candidate);
    const title = toText(section.title);
    if (!title) return null;
    const items = toArray(section.items)
      .map(mapBackendProduct)
      .filter((product): product is ProductCardDto => Boolean(product));
    if (!items.length) return null;
    return {
      kind: toText(section.code) === "NEWEST" ? "RECENTLY_UPDATED" : "FEATURED_PRODUCTS",
      title,
      items,
    };
  });

  return { domains, sections };
};

export const mapBackendCategories = (value: unknown): CategoryDto[] => {
  const data = toRecord(value);
  const categories = Array.isArray(value) ? value : data.items;
  return compactMap(categories, (candidate, index) => {
    const category = toRecord(candidate);
    const code = toText(category.code);
    const displayName = toText(category.name) ?? toText(category.display_name);
    const domain = toDomainCode(category.domain);
    if (!code || !displayName || !domain) return null;
    return { code, display_name: displayName, domain, parent_code: null, path: [domain, code], sort_order: index + 1 };
  });
};

export interface BackendProductPage {
  items: ProductCardDto[];
  next_cursor: string | null;
  limit?: number;
}

const mapBackendProductList = (value: unknown): BackendProductPage => {
  const data = toRecord(value);
  const pageInfo = toRecord(data.page_info);
  return {
    items: toArray(data.items)
      .map(mapBackendProduct)
      .filter((product): product is ProductCardDto => Boolean(product)),
    next_cursor: toText(pageInfo.next_cursor),
    limit: toNumber(pageInfo.limit),
  };
};

export const mapBackendProductPage = mapBackendProductList;

/** D13 list mode has no page_info: the server preserves ids[] request order. */
export const mapBackendProductsByIds = (value: unknown): ProductIdLookupDto => {
  const data = toRecord(value);
  return {
    items: toArray(data.items)
      .map(mapBackendProduct)
      .filter((product): product is ProductCardDto => Boolean(product)),
    missing_ids: toArray(data.missing_ids)
      .map(toText)
      .filter((id): id is string => Boolean(id)),
  };
};

export const mapBackendFacets = (value: unknown): FacetDto[] => {
  const data = toRecord(value);
  const mapOptions = (candidate: unknown): FacetDto["options"] => compactMap(candidate, (option) => {
    const record = toRecord(option);
    const optionValue = toText(record.code) ?? toText(record.value);
    const label = toText(record.name) ?? toText(record.label) ?? optionValue;
    return optionValue && label ? { value: optionValue, label, count: toNumber(record.count) } : null;
  });

  const facets: FacetDto[] = [];
  const fixedFacets: FacetDto[] = [
    { code: "category", label: "Danh mục", type: "CATEGORY", options: mapOptions(data.category) },
    { code: "power_source", label: "Nguồn động lực", type: "POWER_SOURCE", options: mapOptions(data.power_source) },
    { code: "feature", label: "Tính năng", type: "FEATURE", options: mapOptions(data.feature) },
  ];
  fixedFacets.forEach((facet) => {
    if (facet.options.length) facets.push(facet);
  });

  toArray(data.spec).forEach((candidate) => {
    const spec = toRecord(candidate);
    const code = toText(spec.code);
    const label = toText(spec.label) ?? code;
    if (!code || !label) return;
    const options: FacetDto["options"] = compactMap(spec.values, (option) => {
      const record = toRecord(option);
      const optionValue = toText(record.value);
      return optionValue ? { value: optionValue, label: optionValue, count: toNumber(record.count) } : null;
    });
    if (options.length) facets.push({ code, label, type: "SPEC", options });
  });

  return facets;
};

export const mapBackendHealth = (value: unknown): HealthVersionDto => {
  const data = toRecord(value);
  return {
    api_version: "v1",
    min_supported_app_version: null,
    status: toText(data.status)?.toLowerCase() === "maintenance" ? "maintenance" : "ok",
  };
};

export const mapBackendQuoteAccepted = (value: unknown): QuoteAcceptedDto | null => {
  const data = toRecord(value);
  const requestId = toText(data.request_id);
  const status = toText(data.status);
  return requestId && status === "RECEIVED" ? { request_id: requestId, status: "RECEIVED" } : null;
};
