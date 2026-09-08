import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const wmsProxy = {
  target: 'https://khohoanamdev.lptech.info.vn',
  changeOrigin: true,
  secure: true,
  rewrite: path => path.replace(/^\/wms-api/, ''),
};

/**
 * Target web của chính app React Native. API đi qua Vite proxy để browser
 * không bị CORS, nhưng target vẫn là DEV/TEST Green giống APK hiện hành.
 */
export default defineConfig({
  plugins: [react()],
  // Dự án gốc có PostCSS/Tailwind dành cho Mini App. Bản web của mobile
  // không dùng Tailwind; khai báo rỗng để Vite không kế thừa cấu hình đó.
  css: {
    postcss: {
      plugins: [],
    },
  },
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: 'react-native-web' },
      {
        find: 'react-native-camera-kit',
        replacement: fileURLToPath(new URL('./src/web/camera-kit.tsx', import.meta.url)),
      },
    ],
    extensions: [
      '.web.tsx',
      '.web.ts',
      '.web.jsx',
      '.web.js',
      '.mjs',
      '.js',
      '.mts',
      '.ts',
      '.jsx',
      '.tsx',
      '.json',
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    proxy: { '/wms-api': wmsProxy },
  },
  preview: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    proxy: { '/wms-api': wmsProxy },
  },
  build: {
    outDir: 'web-dist',
    emptyOutDir: true,
  },
});
