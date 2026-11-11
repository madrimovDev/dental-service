import { type Key, loadKek } from './lib/crypto';

export type Config = {
  databaseUrl: string;
  kek: Key;
  jwtSecret: string;
  /** Supervisor → Hub ichki admin API va Hub → Supervisor verify uchun umumiy token. */
  supervisorHubToken: string;
  /** SaaS API xizmat kaliti (SaaS klinika connect'ida `serviceProof`); yo'q bo'lsa SaaS connect o'chiq. */
  saasHubToken: string | null;
  supervisorUrl: string | null;
  uploadsDir: string;
  port: number;
  maxUploadBytes: number;
};

const required = (env: Record<string, string | undefined>, name: string) => {
  const v = env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
};

const secret = (env: Record<string, string | undefined>, name: string) => {
  const v = required(env, name);
  if (Buffer.byteLength(v) < 32) throw new Error(`${name} must be at least 32 bytes`);
  return v;
};

/**
 * Fail-fast: KEK yo'q yoki noto'g'ri bo'lsa (yoki boshqa sir yo'q) — throw.
 * `index.ts` buni Bun.serve'dan OLDIN chaqiradi → boot yiqiladi (Review Focus 2).
 */
export const loadConfig = (env: Record<string, string | undefined> = process.env): Config => {
  const kek = loadKek(env.LAB_HUB_KEK);
  const saas = env.SAAS_HUB_TOKEN;
  if (saas && Buffer.byteLength(saas) < 32)
    throw new Error('SAAS_HUB_TOKEN must be at least 32 bytes');
  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    kek,
    jwtSecret: secret(env, 'JWT_SECRET'),
    supervisorHubToken: secret(env, 'SUPERVISOR_HUB_TOKEN'),
    saasHubToken: saas || null,
    supervisorUrl: env.SUPERVISOR_URL || null,
    uploadsDir: required(env, 'UPLOADS_DIR'),
    port: Number(env.API_PORT ?? 8171),
    maxUploadBytes: Number(env.MAX_UPLOAD_BYTES ?? 50 * 1024 * 1024),
  };
};
