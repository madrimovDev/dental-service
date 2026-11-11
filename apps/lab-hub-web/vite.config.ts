import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Lab Hub web: `/v1/*` lab-hub-api'ga proksilanadi (dev). Prod'da Caddy bitta host'dan beradi.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@dental/core': path.resolve(__dirname, '../../packages/core/src'),
      '@dental/i18n': path.resolve(__dirname, '../../packages/i18n/src'),
      '@dental/ui/fonts': path.resolve(__dirname, '../../packages/ui/src/theme/fonts.ts'),
      '@dental/ui/tokens.css': path.resolve(__dirname, '../../packages/ui/src/theme/tokens.css'),
      '@dental/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
  server: {
    port: Number(process.env.LAB_HUB_WEB_PORT ?? 5171),
    strictPort: true,
    proxy: {
      '/v1': {
        target: process.env.LAB_HUB_API_URL ?? 'http://localhost:8171',
        changeOrigin: true,
      },
    },
  },
});
