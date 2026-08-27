import { defineConfig } from "vite";
import zaloMiniApp from "zmp-vite-plugin";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default () => {
  return defineConfig({
    root: ".",
    base: "",
    plugins: [zaloMiniApp(), react()],
    build: {
      assetsInlineLimit: 0,
    },
    server: {
      proxy: {
        "/wms-api": {
          target: "https://khohoanamdev.bigk.click",
          changeOrigin: true,
          secure: true,
          // Upload video có thể kéo dài vài phút. Giữ socket proxy sống đủ lâu
          // để request multipart được stream hết tới backend/Cloudflare.
          timeout: 10 * 60 * 1000,
          proxyTimeout: 10 * 60 * 1000,
          rewrite: (path) => path.replace(/^\/wms-api/, ""),
        },
      },
    },
    resolve: {
      alias: {
        "@": "/src",
      },
    },
  });
};
