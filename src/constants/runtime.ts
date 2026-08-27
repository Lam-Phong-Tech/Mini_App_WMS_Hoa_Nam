export const RUNTIME_MANIFEST = {
  app: "hoa-nam-wms-mini-scanner",
  version: import.meta.env.VITE_APP_VERSION || "1.0.0",
  env: import.meta.env.MODE,
  sha: import.meta.env.VITE_RUNTIME_SHA || "local",
  builtAt: import.meta.env.VITE_BUILT_AT || "local-build",
};
