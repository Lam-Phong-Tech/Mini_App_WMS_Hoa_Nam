/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_API_BASE_URL?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_APP_ENV?: "DEV" | "UAT" | "PRODUCTION";
  readonly VITE_USE_DEV_MOCK?: "true" | "false";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
