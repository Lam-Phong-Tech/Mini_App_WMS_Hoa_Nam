import { defineConfig, loadEnv } from "vite";
import { fileURLToPath, URL } from "node:url";
import zaloMiniApp from "zmp-vite-plugin";
import react from "@vitejs/plugin-react";

const workspaceRoot = fileURLToPath(new URL("./", import.meta.url));

// https://vitejs.dev/config/
export default ({ mode }: { mode: string }) => {
  const environment = loadEnv(mode, workspaceRoot, "VITE_");
  const apiOrigin = environment.VITE_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "");
  const useDevMock = environment.VITE_USE_DEV_MOCK !== "false";

  return defineConfig({
    root: "./src",
    envDir: workspaceRoot,
    base: "",
    plugins: [zaloMiniApp(), react()],
    build: {
      assetsInlineLimit: 0,
    },
    server: {
      // ZMP's outer frame listens on :3000, while the Mini App iframe is served
      // from :2999. Proxy non-mock DEV traffic so the iframe never depends on a
      // brittle per-port CORS allowlist. Production builds keep their absolute
      // public API origin and do not use this development-only proxy.
      ...(apiOrigin && !useDevMock
        ? {
            proxy: {
              "/api": {
                target: apiOrigin,
                changeOrigin: true,
                secure: true,
              },
            },
          }
        : {}),
      fs: {
        allow: [workspaceRoot],
      },
    },
    resolve: {
      alias: {
        "@": "/src",
      },
    },
  });
};
