import { defineConfig } from 'drizzle-kit';

// Drizzle-kit ba'zan `bun --env-file` ni inherit qilmaydi (bun x orqali).
// `.env` mavjud bo'lsa process.env ishlatiladi, fallback — local dev defaults.
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://dental:dental_local_dev@localhost:5432/supervisor';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  verbose: true,
  strict: true,
});
