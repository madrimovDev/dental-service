import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(dir, './src'),
      '@dental/core': path.resolve(dir, '../../packages/core/src'),
      '@dental/i18n': path.resolve(dir, '../../packages/i18n/src'),
      '@dental/ui/fonts': path.resolve(dir, '../../packages/ui/src/theme/fonts.ts'),
      '@dental/ui/tokens.css': path.resolve(dir, '../../packages/ui/src/theme/tokens.css'),
      '@dental/ui': path.resolve(dir, '../../packages/ui/src'),
      '@dental/api-client': path.resolve(dir, '../../packages/api-client/src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
  },
});
