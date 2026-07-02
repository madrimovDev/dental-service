import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3102,
    strictPort: true,
    proxy: {
      '/v1': {
        target: 'http://localhost:3101',
        changeOrigin: true,
      },
    },
  },
});
