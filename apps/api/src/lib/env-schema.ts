import { z } from 'zod';

/**
 * Pure, side-effect-free env schema + helpers. Safe to import anywhere
 * (incl. unit tests) — importing this module never validates `Bun.env`
 * and never calls `process.exit`. The boot-time validation lives in `env.ts`.
 */

/**
 * Known placeholder / dev-default secret values that MUST NOT reach production.
 * The literal below is the one shipped in `.env.example`.
 */
const PLACEHOLDER_JWT_SECRET = 'change_me_in_production_min_32_chars_long_xxx';

/**
 * Heuristic: a secret is a "placeholder" if it is the exact example literal or
 * contains an obvious dev-default marker. Case-insensitive on the marker.
 */
export function isPlaceholderSecret(value: string): boolean {
  if (value === PLACEHOLDER_JWT_SECRET) return true;
  return /change[_-]?me/i.test(value);
}

export const envSchema = z
  .object({
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
  })
  // Reject known-placeholder secrets in production. Dev/test intentionally keep
  // the placeholder so local boot + `bun test --env-file=../../.env` work.
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production' && isPlaceholderSecret(data.JWT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message:
          'JWT_SECRET is a known placeholder/dev-default value and must not be used in production. Set a strong, unique secret (>= 32 chars).',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Pure env parser — safe to call in unit tests.
 */
export function parseEnv(raw: Record<string, string | undefined>) {
  return envSchema.safeParse(raw);
}
