// ZaUI stylesheet
import "zmp-ui/zaui.css";
// Tailwind stylesheet
import "@/css/tailwind.scss";
// Your stylesheet
import "@/css/app.scss";
// Locked Hoa Nam Preview tokens and G2 shell overrides.
import "@/css/hoa-nam-theme.scss";
// One final, scoped reference layer for the UAT components; avoids legacy
// migration rules silently undoing verified mobile geometry.
import "@/css/uat-reference.scss";
import "@/css/uat-quote-contact.scss";
import "@/css/uat-detail-reference.scss";
// Native chrome clearance must win without changing the browser reference.
import "@/css/uat-native-safe-area.scss";
import "@/css/native-keyboard.scss";
// UAT_Dev_6 TC_UI_03 action controls are intentionally isolated from the
// shared migration layer so other card geometry remains unchanged.
import "@/css/uat-dev6-tc-ui03.scss";
import "@/css/uat-dev6-tc-ui04.scss";
import "@/css/uat-dev6-tc-ui05.scss";
import "@/css/uat-dev6-tc-ui06.scss";
import "@/css/uat-dev6-tc-ui07.scss";
import "@/css/uat-dev6-tc-ui08.scss";
import "@/css/uat-dev6-tc-ui16.scss";
import "@/css/uat-dev6-tc-ui17.scss";

// React core
import React from "react";
import { createRoot } from "react-dom/client";

// Mount the app
import Layout from "@/components/layout";
import { isZaloNativeHost, loadNativeZaloSdk } from "@/services/zalo-runtime";

// Expose app configuration
import appConfig from "../app-config.json";

if (!window.APP_CONFIG) {
  window.APP_CONFIG = appConfig;
}

// CSS safe-area/capsule compensation is valid only inside the native Zalo
// WebView.  The browser preview must keep a zero-inset baseline so its 375px
// measurements are not shifted by a guessed Android fallback.
const isZaloHost = isZaloNativeHost();

document.documentElement.dataset.host = isZaloHost ? "zalo" : "browser";
// ZMP's local wrapper paints its own status bar/capsule over the iframe.
// Reserve that DEV-only chrome without treating the browser as a native SDK.
document.documentElement.dataset.previewFrame = import.meta.env.DEV && window.parent !== window ? "zmp" : "none";

// Keep the native system insets managed by Zalo rather than approximating a
// particular iPhone or Android status/navigation bar in CSS. CSS consumes the
// resulting `env(safe-area-inset-*)` values when the WebView exposes them.
// This API is native-only; a browser preview keeps the zero-inset baseline.
if (isZaloHost) {
  void loadNativeZaloSdk().then((sdk) => sdk?.configAppView({
    statusBarType: "transparent",
    actionBar: { hide: true },
    hideIOSSafeAreaBottom: false,
    hideAndroidBottomNavigationBar: false,
  })).catch(() => {
    // Older Zalo versions still honor the static app config. The layout keeps
    // using official CSS safe-area insets without a device-specific fallback.
  });
}

const root = createRoot(document.getElementById("app")!);
root.render(React.createElement(Layout));
