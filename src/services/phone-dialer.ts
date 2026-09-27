import { loadNativeZaloSdk } from "@/services/zalo-runtime";

/**
 * Opens the operating-system dialer with a number already filled in.  ZMP's
 * native bridge is required inside the installed Zalo Mini App; a `tel:` URL
 * remains a fallback for a normal browser or a bridge failure.
 */
export const openDeviceDialer = (phoneNumber: string, telHref: string): void => {
  const openTelFallback = () => {
    window.location.assign(telHref);
  };

  void loadNativeZaloSdk()
    .then((sdk) => sdk ? sdk.openPhone({ phoneNumber }) : Promise.reject())
    .catch(openTelFallback);
};
