import { ContactPhoneDto, PublicConfigDto, SupportHoursDto } from "@/types/public-api";

export const OA_UNAVAILABLE_MESSAGE = "Chat Zalo OA chưa sẵn sàng. Vui lòng gọi hotline hoặc gửi yêu cầu tư vấn.";

export const toTelHref = (tel: string): string => `tel:${tel.trim().replace(/[^0-9+]/g, "")}`;

export const getPublicHotline = (config: PublicConfigDto | null) => config?.hotline ?? config?.hotline_fallback ?? null;

// Public deployment/UAT hotline, bundled so the approved offline screen can
// still offer a call on a first visit when /config cannot be downloaded.
// This fallback is not used to enable other unconfigured contact channels.
const APPROVED_OFFLINE_HOTLINE: ContactPhoneDto = { display: "098 636 6675", tel: "0986366675" };

export const getOfflineHotline = (config: PublicConfigDto | null): ContactPhoneDto =>
  getPublicHotline(config) ?? APPROVED_OFFLINE_HOTLINE;

type SupportDay = NonNullable<SupportHoursDto["intervals"]>[number]["days"][number];

const SUPPORT_DAY_ORDER: SupportDay[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const SUPPORT_DAY_LABELS: Record<SupportDay, string> = {
  MON: "Thứ Hai",
  TUE: "Thứ Ba",
  WED: "Thứ Tư",
  THU: "Thứ Năm",
  FRI: "Thứ Sáu",
  SAT: "Thứ Bảy",
  SUN: "Chủ Nhật",
};

/** Render API weekday codes as the compact Vietnamese ranges used by Contact. */
export const formatSupportDays = (days: SupportDay[]): string => {
  const selected = new Set(days);
  const ordered = SUPPORT_DAY_ORDER.filter((day) => selected.has(day));
  const ranges: SupportDay[][] = [];
  ordered.forEach((day) => {
    const current = ranges[ranges.length - 1];
    const previousIndex = SUPPORT_DAY_ORDER.indexOf(current?.[current.length - 1] ?? day);
    const dayIndex = SUPPORT_DAY_ORDER.indexOf(day);
    if (current && dayIndex === previousIndex + 1) current.push(day);
    else ranges.push([day]);
  });
  return ranges.map((range) => range.length > 1
    ? `${SUPPORT_DAY_LABELS[range[0]]} – ${SUPPORT_DAY_LABELS[range[range.length - 1]]}`
    : SUPPORT_DAY_LABELS[range[0]]).join(", ");
};

export const getContactTargets = (config: PublicConfigDto | null) => {
  const hotline = getPublicHotline(config);
  const oaCandidate = config?.zalo_oa?.chat_url?.trim() ?? "";
  let oaUrl: string | null = null;
  try {
    const parsed = new URL(oaCandidate);
    if (parsed.protocol === "https:") oaUrl = parsed.toString();
  } catch {
    // Public config may be absent or malformed. Keep OA unavailable instead of guessing a URL.
  }
  return {
    hotlineHref: hotline ? toTelHref(hotline.tel) : null,
    oaUrl,
  };
};
