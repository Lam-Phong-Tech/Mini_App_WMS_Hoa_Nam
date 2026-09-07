export const DOMAIN_CODES = [
  "POWER_TOOLS",
  "HAND_TOOLS",
  "ACCESSORIES",
] as const;

export type DomainCode = (typeof DOMAIN_CODES)[number];
/** Power-source codes are configured by the public Catalogue, not hardcoded by the Mini App. */
export type PowerSource = string;
export type ProductSort = "featured" | "updated_desc" | "name_asc";
/**
 * The only availability states deliberately exposed by the public catalogue.
 * `PREORDER` means the published product may receive a minimal consultation
 * request; it never exposes warehouse stock, a back-order date or quantity.
 */
export type PublicAvailability = "IN_STOCK" | "PREORDER";
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "VALIDATION_FAILED"
  | "INVALID_CURSOR"
  | "INVALID_FILTER"
  | "INVALID_QUERY"
  | "INVALID_SORT"
  | "INVALID_DOMAIN"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_NOT_AVAILABLE"
  | "RESOURCE_NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "IDEMPOTENCY_CONFLICT"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_KEY_INVALID"
  | "CONSENT_REQUIRED"
  | "PRIVACY_VERSION_MISMATCH"
  | "RATE_LIMITED"
  | "RATE_LIMIT_EXCEEDED"
  | "MAINTENANCE"
  | "SERVICE_UNAVAILABLE"
  | "FEATURE_DISABLED"
  | "UPSTREAM_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "INTERNAL_SERVER_ERROR";

export interface ApiMeta {
  request_id?: string;
  data_version?: string;
  next_cursor?: string | null;
  limit?: number;
  retry_after_seconds?: number;
  estimated_end_at?: string;
  idempotent_replay?: boolean;
}

export type FieldErrors = Record<string, string[]>;

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  meta: ApiMeta;
  error_code: null;
  errors: null;
}

export interface ApiFailure {
  success: false;
  message: string;
  data: null;
  meta: ApiMeta;
  error_code: ApiErrorCode;
  errors: FieldErrors | null;
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export const isApiSuccess = <T>(
  response: ApiEnvelope<T>,
): response is ApiSuccess<T> => response.success;

export interface BrandDto {
  code: string;
  display_name: string;
}

export interface DomainDto {
  code: DomainCode;
  display_name: string;
  icon?: string | null;
}

export interface CategoryDto {
  code: string;
  display_name: string;
  domain: DomainCode;
  parent_code?: string | null;
  path: string[];
  icon?: string | null;
  sort_order: number;
}

export interface MediaDto {
  media_id: string;
  type: "IMAGE" | "VIDEO" | "DOCUMENT";
  url: string;
  thumbnail_url?: string | null;
  alt?: string | null;
  sort_order: number;
}

export interface FeatureDto {
  code: string;
  label: string;
  icon?: string | null;
}

export interface SpecItemDto {
  code: string;
  label: string;
  value: string;
  unit?: string | null;
}

export interface SpecGroupDto {
  code: string;
  label: string;
  items: SpecItemDto[];
}

export interface VariantAttributeDto {
  code: string;
  label: string;
  value: string;
}

export interface VariantDto {
  variant_id: string;
  variant_name: string;
  primary_code?: string | null;
  attributes: VariantAttributeDto[];
  availability: PublicAvailability;
  media?: MediaDto[];
}

export interface LinkableItemDto {
  label: string;
  product_slug?: string | null;
}

export interface ProductCardDto {
  product_id: string;
  slug: string;
  name: string;
  model?: string | null;
  primary_code?: string | null;
  brand: BrandDto;
  domain: DomainCode;
  category: CategoryDto;
  summary?: string | null;
  cover_media?: MediaDto | null;
  availability: PublicAvailability;
  updated_at: string;
}

export interface ProductDetailDto extends ProductCardDto {
  description?: string | null;
  /** A public catalogue descriptor, not a selectable SKU/variant group. */
  family_name?: string | null;
  /** Public use/application copy approved in the catalogue. */
  usage?: string | null;
  /** Public package/accessory copy with barcode and pack-count data removed. */
  package_contents?: string | null;
  features?: FeatureDto[];
  spec_groups?: SpecGroupDto[];
  variants?: VariantDto[];
  bundle_items?: LinkableItemDto[];
  compatibility?: LinkableItemDto[];
  media?: MediaDto[];
}

export interface FacetOptionDto {
  value: string;
  label: string;
  count?: number;
}

export interface FacetDto {
  code: string;
  label: string;
  type: "CATEGORY" | "POWER_SOURCE" | "FEATURE" | "SPEC";
  options: FacetOptionDto[];
}

export interface ContactPhoneDto {
  display: string;
  tel: string;
}

export interface ZaloOaDto {
  id: string | null;
  chat_url: string;
}

export interface SupportHoursDto {
  timezone: "Asia/Ho_Chi_Minh";
  intervals: Array<{
    days: Array<"MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN">;
    opens_at: string;
    closes_at: string;
  }>;
}

export interface PublicConfigDto {
  config_version: string;
  hotline: ContactPhoneDto | null;
  hotline_fallback?: ContactPhoneDto | null;
  zalo_oa: ZaloOaDto | null;
  support_hours: SupportHoursDto | null;
  privacy_policy_url: string | null;
  maintenance: {
    enabled: boolean;
    message: string | null;
    estimated_end_at: string | null;
  };
  min_supported_app_version: string | null;
  feature_flags: Record<string, boolean>;
}

export interface HomeSectionDto {
  kind: "CATEGORY_HIGHLIGHTS" | "FEATURED_PRODUCTS" | "RECENTLY_UPDATED";
  title: string;
  items: Array<CategoryDto | ProductCardDto>;
}

export interface HomeDto {
  domains: DomainDto[];
  sections: HomeSectionDto[];
}

export interface ProductQuery {
  q?: string;
  domain?: DomainCode;
  category?: string;
  power_source?: PowerSource;
  feature?: string[];
  spec?: Record<string, string | string[]>;
  sort?: ProductSort;
  cursor?: string;
  limit?: number;
}

export interface QuoteRequestInput {
  product_id: string;
  variant_id?: string | null;
  full_name: string;
  phone: string;
  province_code?: string | null;
  note?: string | null;
  consent: true;
  privacy_version: string;
}

export interface QuoteAcceptedDto {
  request_id: string;
  status: "RECEIVED";
}

export interface HealthVersionDto {
  api_version: "v1";
  min_supported_app_version: string | null;
  status: "ok" | "maintenance";
}
