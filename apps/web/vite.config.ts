import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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
      '@dental/api-client': path.resolve(__dirname, '../../packages/api-client/src'),
    },
  },
  server: {
    port: 8000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
});
