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
    // Keep the HTML entry at the workspace root so direct Vite/CI builds and
    // ZMP CLI builds resolve the same document. The ZMP CLI still injects its
    // production assets into www/ through its own build options.
    root: ".",
    envDir: workspaceRoot,
    base: "",
    plugins: [zaloMiniApp(), react()],
    build: {
      assetsInlineLimit: 0,
    },
    server: {
      // Local QA stores Chrome profiles and captured evidence beneath .tmp.
      // They are not source files; watching a locked browser Cookie database
      // aborts Vite before the Mini App can be tested.
      watch: {
        ignored: ["**/.tmp/**"],
      },
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
