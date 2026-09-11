import { PublicConfigDto } from "@/types/public-api";

export const OA_UNAVAILABLE_MESSAGE = "Chat Zalo OA chưa sẵn sàng. Vui lòng gọi hotline hoặc gửi yêu cầu tư vấn.";

export const toTelHref = (tel: string): string => `tel:${tel.trim().replace(/[^0-9+]/g, "")}`;

export const getPublicHotline = (config: PublicConfigDto | null) => config?.hotline ?? config?.hotline_fallback ?? null;

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
