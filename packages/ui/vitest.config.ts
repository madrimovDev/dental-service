import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false, // CSS Modules testda obyekt sifatida mock qilinadi (class nomi muhim emas)
  },
});
