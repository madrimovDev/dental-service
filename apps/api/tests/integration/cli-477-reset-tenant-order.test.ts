/**
 * CLI-477 #2 — `POST /api/reset-owner-password` tenant tanlashi DETERMINISTIK
 * bo'lishi kerak (REAL DB).
 *
 * Bug: `reset-owner-password.ts` `db.query.tenants.findFirst()` where/orderBy
 * YO'Q edi. Desktop single-tenant invariant'ga tayanadi, lekin bir nechta tenant
 * holatida DB-tartibiga bog'liq (tartibsiz) tenant tanlanardi — public
 * unconditionally-mounted route ostidagi latent footgun. Fix: `orderBy` bilan
 * eng eski (createdAt asc) tenant deterministik tanlanadi.
 *
 * Bu test insertion-tartibni createdAt'ga TESKARI qo'yadi (birinchi qo'shilgan
 * tenant YANGIROQ createdAt bilan) — shunda tartibsiz `findFirst` (insertion
 * order) NOTO'G'RI tenant'ni tanlaydi, deterministik `orderBy` esa eng eskisini.
 *
 * Talab: Postgres running (5433).
 * Ishga tushirish: `cd apps/api && bun test --env-file=<scratchpad>/.env.5433 cli-477-reset-tenant-order`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../../src/db/client.ts';
import { hashPassword, verifyPassword } from '../../src/lib/password.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { resetOwnerPasswordRoutes } from '../../src/routes/reset-owner-password.ts';

const OLDER_PASSWORD = 'OlderOwnerPass123';
const NEWER_PASSWORD = 'NewerOwnerPass123';

let olderOwnerId: string;
let newerOwnerId: string;

const buildApp = (verifyReset: (t: string) => Promise<{ ok: boolean }>) => {
  const app = new Hono();
  app.route('/api/reset-owner-password', resetOwnerPasswordRoutes({ verifyReset }));
  return app;
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [newerOwner] = await db
    .insert(users)
    .values({
      phone: '+998900004770',
      passwordHash: await hashPassword(NEWER_PASSWORD),
      fullName: 'Newer Owner CLI477',
    })
    .returning({ id: users.id });
  const [olderOwner] = await db
    .insert(users)
    .values({
      phone: '+998900004771',
      passwordHash: await hashPassword(OLDER_PASSWORD),
      fullName: 'Older Owner CLI477',
    })
    .returning({ id: users.id });
  if (!newerOwner || !olderOwner) throw new Error('user insert failed');
  newerOwnerId = newerOwner.id;
  olderOwnerId = olderOwner.id;

  // Tenant A — BIRINCHI insert, lekin YANGIROQ createdAt.
  await db.insert(tenants).values({
    name: 'Newer Tenant CLI477',
    slug: 'newer-tenant-477',
    ownerUserId: newerOwnerId,
    createdAt: new Date('2026-02-01T00:00:00Z'),
  });
  // Tenant B — IKKINCHI insert, lekin ESKIROQ createdAt (deterministik g'olib).
  await db.insert(tenants).values({
    name: 'Older Tenant CLI477',
    slug: 'older-tenant-477',
    ownerUserId: olderOwnerId,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await closeRateLimitRedis();
});

describe('CLI-477 #2 — reset-owner-password deterministik tenant tanlash', () => {
  test("bir nechta tenant bo'lsa eng eski (createdAt asc) tenant owner'i tanlanadi", async () => {
    const app = buildApp(async () => ({ ok: true }));
    const newPassword = 'DeterministicNew1';
    const res = await app.request('/api/reset-owner-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resetToken: 'XXXXX-YYYYY-ZZZZZ', newPassword }),
    });
    expect(res.status).toBe(200);

    // Eng eski tenant (Older) owner paroli o'zgargan (deterministik g'olib).
    const [older] = await db.select().from(users).where(eq(users.id, olderOwnerId));
    expect(await verifyPassword(newPassword, older?.passwordHash ?? '')).toBe(true);

    // Yangiroq tenant owner TEGILMAGAN.
    const [newer] = await db.select().from(users).where(eq(users.id, newerOwnerId));
    expect(await verifyPassword(NEWER_PASSWORD, newer?.passwordHash ?? '')).toBe(true);
  });
});
