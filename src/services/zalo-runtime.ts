/**
 * The Zalo SDK starts its native login bootstrap as soon as its module is
 * evaluated. Browser previews do not have the bridge, so a static import
 * produces an unhandled `login` rejection even when no native feature is
 * used. Keep the bridge check and the lazy import in one place.
 */
export const isZaloNativeHost = (): boolean => {
  if (typeof window === "undefined") return false;
  const bridge = (window as Window & {
    ZJSBridge?: { callCustomAction?: unknown };
  }).ZJSBridge;
  return typeof bridge?.callCustomAction === "function";
};

export const loadNativeZaloSdk = async (): Promise<typeof import("zmp-sdk") | null> => (
  isZaloNativeHost() ? import("zmp-sdk") : null
);
