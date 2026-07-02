import { createApp } from './app';

// Fail-fast: kritik env o'zgaruvchilar bo'lmasa, jim buzilgan holatga
// (yoki JWT_SECRET holida jim xavfsizlik teshigiga) kirish o'rniga darhol crash.
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'RSA_PRIVATE_KEY', 'DATABASE_URL'] as const;
for (const name of REQUIRED_ENV_VARS) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const app = createApp();
const port = Number(process.env.API_PORT ?? 3101);

Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`supervisor-api listening on :${port}`);
