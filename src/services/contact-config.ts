import { PublicConfigDto } from "@/types/public-api";

export const OA_MAINTENANCE_MESSAGE = "Tính năng Chat Zalo OA đang được bảo trì. Vui lòng gọi hotline để được hỗ trợ.";

export const toTelHref = (tel: string): string => `tel:${tel.trim().replace(/[^0-9+]/g, "")}`;

export const getPublicHotline = (config: PublicConfigDto | null) => config?.hotline ?? config?.hotline_fallback ?? null;

export const getContactTargets = (config: PublicConfigDto | null) => {
  const hotline = getPublicHotline(config);
  return {
    hotlineHref: hotline ? toTelHref(hotline.tel) : null,
    oaUrl: config?.zalo_oa?.chat_url ?? null,
  };
};
