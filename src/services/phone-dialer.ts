import { openPhone } from "zmp-sdk";

/**
 * Opens the operating-system dialer with a number already filled in.  ZMP's
 * native bridge is required inside the installed Zalo Mini App; a `tel:` URL
 * remains a fallback for a normal browser or a bridge failure.
 */
export const openDeviceDialer = (phoneNumber: string, telHref: string): void => {
  const openTelFallback = () => {
    window.location.assign(telHref);
  };

  // ZMP SDK intentionally resolves without doing anything for localhost. A
  // desktop preview has no native dialer, but this still gives a browser with
  // a tel: handler the chance to open its call application.
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    openTelFallback();
    return;
  }

  void openPhone({ phoneNumber }).catch(openTelFallback);
};
