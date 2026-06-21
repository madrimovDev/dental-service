/**
 * CLI-227 — Auth rate limiting + login audit (REAL DB + Redis).
 *
 * Isbotlaydi:
 *  1. Login rate limit — bir IP+telefon ustidan N urinishdan keyin 429
 *     (loyiha xato konverti `{ error: { code, message } }`).
 *  2. Login audit — MUVAFFAQIYAT va MUVAFFAQIYATSIZLIK ikkalasi ham audit_log'ga
 *     yoziladi (kim/qachon/ip/user-agent/outcome).
 *
 * ⚠️ AUDIT O'QISH — ADMIN ULANISH SHART. Login audit row'lari `tenant_id NULL`
 * (platform event). `audit_log` FORCE RLS + SELECT policy `tenant_id = current_setting(...)`
 * → `NULL = NULL` FALSE → non-superuser pool (`db`, dental_app) bu row'larni KO'RMAYDI.
 * INSERT muvaffaqiyatli (WITH CHECK `tenant_id IS NULL` ruxsat beradi), lekin o'qish uchun
 * DATABASE_ADMIN_URL (superuser, BYPASSRLS) ulanish ishlatamiz.
 *
 * ⚠️ Rate limit test IP'ni `x-forwarded-for` orqali beradi va har test BLOKI uchun
 * UNIKAL telefon ishlatadi — Redis kalitlari to'qnashmasligi uchun (oyna 15 daqiqa).
 *
 * Talab: Postgres + Redis running, migration apply qilingan.
 * Ishga tushirish: `cd apps/api && bun test --env-file=<repo>/.env cli-227`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { users } from '@dental/db-schema';
import { OpenAPIHono } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { db } from '../../src/db/client.ts';
import { env } from '../../src/lib/env.ts';
import { hashPassword } from '../../src/lib/password.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { authRoutes } from '../../src/modules/auth/auth.routes.ts';

// Admin (superuser) ulanish — RLS bypass, tenant_id NULL audit row'larni o'qish uchun.
const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!adminUrl) throw new Error('DATABASE_ADMIN_URL kerak (audit o‘qish uchun)');
const adminSql = postgres(adminUrl, { max: 1 });

const app = new OpenAPIHono();
app.route('/api/auth', authRoutes({ db }));

const PHONE_RL = `+99890000${Math.floor(Math.random() * 9000 + 1000)}`;
const PHONE_AUDIT = `+99890001${Math.floor(Math.random() * 9000 + 1000)}`;
const PASSWORD = 'CorrectHorseBattery1';
let userAuditId: string;

const loginReq = (phone: string, password: string, ip: string) =>
  app.request('/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
      'user-agent': 'cli227-test',
    },
    body: JSON.stringify({ phone, password }),
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  // Audit row'larni izolyatsiya qilish — test boshida tozalaymiz (admin, RLS bypass).
  await adminSql`DELETE FROM audit_log WHERE action IN ('login.success', 'login.failed')`;
  const inserted = await db
    .insert(users)
    .values([
      { phone: PHONE_RL, passwordHash: await hashPassword(PASSWORD), fullName: 'RL User' },
      { phone: PHONE_AUDIT, passwordHash: await hashPassword(PASSWORD), fullName: 'Audit User' },
    ])
    .returning({ id: users.id });
  const audit = inserted[1];
  if (!audit) throw new Error('user insert failed');
  userAuditId = audit.id;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await adminSql`DELETE FROM audit_log WHERE action IN ('login.success', 'login.failed')`;
  await adminSql.end();
  await closeRateLimitRedis();
});

describe('CLI-227 — rate limiting', () => {
  test(`login: limit (${env.AUTH_LOGIN_RATE_LIMIT}) oshganda 429 + xato konverti`, async () => {
    const limit = env.AUTH_LOGIN_RATE_LIMIT;
    const ip = `10.227.0.${Math.floor(Math.random() * 250 + 1)}`;

    // Limitgacha — 429 EMAS (bad password → 401, lekin rate-limit emas).
    for (let i = 0; i < limit; i++) {
      const res = await loginReq(PHONE_RL, 'WrongPassword999', ip);
      expect(res.status).not.toBe(429);
    }

    // Limitdan oshgani — 429.
    const blocked = await loginReq(PHONE_RL, 'WrongPassword999', ip);
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error?: { code: string; message: string } };
    expect(body.error?.code).toBe('rate_limited');
    expect(typeof body.error?.message).toBe('string');
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });
});

describe('CLI-227 — login audit (admin o‘qish)', () => {
  test('muvaffaqiyatli login audit_log.login.success yozadi (ip + ua)', async () => {
    const ip = '203.0.113.7';
    const res = await loginReq(PHONE_AUDIT, PASSWORD, ip);
    expect(res.status).toBe(200);

    const rows = await adminSql`
      SELECT action, user_id, ip, user_agent, tenant_id
      FROM audit_log
      WHERE action = 'login.success' AND user_id = ${userAuditId}
    `;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const row = rows[0];
    expect(row?.ip).toBe(ip);
    expect(row?.user_agent).toBe('cli227-test');
    expect(row?.tenant_id).toBeNull();
  });

  test('muvaffaqiyatsiz login audit_log.login.failed yozadi (kim urinib ko‘rdi)', async () => {
    const ip = '203.0.113.8';
    const res = await loginReq(PHONE_AUDIT, 'DefinitelyWrong1', ip);
    expect(res.status).toBe(401);

    const rows = await adminSql`
      SELECT action, user_id, ip, after
      FROM audit_log
      WHERE action = 'login.failed' AND user_id = ${userAuditId}
    `;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.ip).toBe(ip);
    // after JSON'da reason='bad_password'.
    const after = rows[0]?.after as { reason?: string } | null;
    expect(after?.reason).toBe('bad_password');
  });

  test('mavjud bo‘lmagan telefon — failed audit (user_id NULL, reason no_user)', async () => {
    const ip = '203.0.113.9';
    const res = await loginReq('+998900007777', 'whatever12345', ip);
    expect(res.status).toBe(401);

    const rows = await adminSql`
      SELECT user_id, after FROM audit_log
      WHERE action = 'login.failed' AND ip = ${ip}
    `;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.user_id).toBeNull();
    const after = rows[0]?.after as { reason?: string } | null;
    expect(after?.reason).toBe('no_user');
  });
});
