import { defineConfig } from 'drizzle-kit';

// Generate bazaga ulanmaydi; URL faqat `drizzle-kit` buyruqlari uchun.
const databaseUrl =
  process.env.DATABASE_ADMIN_URL ??
  process.env.DATABASE_URL ??
  'postgres://dental:dental_local_dev@localhost:5433/lab_hub';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  verbose: true,
  strict: true,
});
