// ZaUI stylesheet
import "zmp-ui/zaui.css";
// Tailwind stylesheet
import "@/css/tailwind.scss";
// Your stylesheet
import "@/css/app.scss";
// Locked Hoa Nam Preview tokens and G2 shell overrides.
import "@/css/hoa-nam-theme.scss";

// React core
import React from "react";
import { createRoot } from "react-dom/client";

// Mount the app
import Layout from "@/components/layout";

// Expose app configuration
import appConfig from "../app-config.json";

if (!window.APP_CONFIG) {
  window.APP_CONFIG = appConfig;
}

// CSS safe-area/capsule compensation is valid only inside the native Zalo
// WebView.  The browser preview must keep a zero-inset baseline so its 375px
// measurements are not shifted by a guessed Android fallback.
const isZaloHost = () => {
  const bridge = (window as Window & {
    ZJSBridge?: { callCustomAction?: unknown };
  }).ZJSBridge;
  return typeof bridge?.callCustomAction === "function";
};

document.documentElement.dataset.host = isZaloHost() ? "zalo" : "browser";

const root = createRoot(document.getElementById("app")!);
root.render(React.createElement(Layout));
