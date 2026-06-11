import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database — app uses non-superuser, migrations use admin
  DATABASE_URL: z.url(),
  DATABASE_ADMIN_URL: z.url().optional(), // faqat migrate task uchun

  // Redis
  REDIS_URL: z.url(),

  // MinIO
  MINIO_ENDPOINT: z.url(),
  MINIO_BUCKET: z.string().min(1),
  MINIO_ROOT_USER: z.string().min(1),
  MINIO_ROOT_PASSWORD: z.string().min(1),

  // API
  API_PORT: z.coerce.number().int().positive().default(8001),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),
  WEB_ORIGIN: z.url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Eskiz SMS (optional — yo'q bo'lsa NoOp kanal ishlatiladi)
  ESKIZ_EMAIL: z.string().optional(),
  ESKIZ_PASSWORD: z.string().optional(),
});

const parsed = envSchema.safeParse(Bun.env);

if (!parsed.success) {
  console.error('❌ Environment validation failed:');
  console.error(z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
