/**
 * CLI-226 — Vendor-mediated owner password reset (`POST /api/reset-owner-password`, REAL DB).
 *
 * Isbotlaydi:
 *  1. `verifyReset` `{ ok: true }` qaytarganda — FAQAT `tenants.owner_user_id`
 *     foydalanuvchisining `password_hash`i o'zgaradi (yangi parol bilan
 *     verifyPassword true). Boshqa foydalanuvchi va tenant qatori TEGILMAYDI.
 *  2. `verifyReset` `{ ok: false }` qaytarganda — 400 `reset.invalid_token`,
 *     owner parol o'zgarmaydi.
 *  3. Muvaffaqiyatli reset `audit_log`ga yoziladi (`owner_password_reset`,
 *     tenant-scoped, resourceId=ownerId).
 *
 * Haqiqiy Supervisor'ga tarmoq so'rovi YO'Q — `verifyReset` route'ga
 * to'g'ridan-to'g'ri in'ektsiya qilinadi (fake).
 *
 * Talab: Postgres running (5433). Redis kerak emas (rate-limit fail-open).
 * Ishga tushirish: `cd apps/api && bun test --env-file=<scratchpad>/.env.5433 cli-226-owner-reset`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, tenants, users } from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../../src/db/client.ts';
import { hashPassword, verifyPassword } from '../../src/lib/password.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { resetOwnerPasswordRoutes } from '../../src/routes/reset-owner-password.ts';

const OWNER_OLD_PASSWORD = 'OwnerOldPass123';
const OTHER_OLD_PASSWORD = 'OtherUserPass456';

let tenantId: string;
let ownerId: string;
let otherUserId: string;
let tenantSnapshot: typeof tenants.$inferSelect | undefined;

const buildApp = (verifyReset: (t: string) => Promise<{ ok: boolean }>) => {
  const app = new Hono();
  app.route('/api/reset-owner-password', resetOwnerPasswordRoutes({ verifyReset }));
  return app;
};

const postReset = (app: Hono, body: unknown) =>
  app.request('/api/reset-owner-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({
      phone: '+998900002270',
      passwordHash: await hashPassword(OWNER_OLD_PASSWORD),
      fullName: 'Owner CLI226',
    })
    .returning({ id: users.id });
  const [other] = await db
    .insert(users)
    .values({
      phone: '+998900002271',
      passwordHash: await hashPassword(OTHER_OLD_PASSWORD),
      fullName: 'Other CLI226',
    })
    .returning({ id: users.id });
  if (!owner || !other) throw new Error('user insert failed');
  ownerId = owner.id;
  otherUserId = other.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI-226 Clinic', slug: 'cli-226-clinic', ownerUserId: ownerId })
    .returning();
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;
  tenantSnapshot = tenant;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await closeRateLimitRedis();
});

describe('POST /api/reset-owner-password', () => {
  test('verifyReset ok:false → 400 reset.invalid_token, owner hash unchanged', async () => {
    const app = buildApp(async () => ({ ok: false }));
    const res = await postReset(app, {
      resetToken: 'AAAAA-BBBBB-CCCCC',
      newPassword: 'AttackerNewPass1',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code: string } };
    expect(body.error?.code).toBe('reset.invalid_token');

    const [owner] = await db.select().from(users).where(eq(users.id, ownerId));
    expect(await verifyPassword(OWNER_OLD_PASSWORD, owner?.passwordHash ?? '')).toBe(true);

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    expect(tenant).toEqual(tenantSnapshot);
  });

  test('verifyReset ok:true → 200, ONLY owner password_hash changes', async () => {
    const app = buildApp(async () => ({ ok: true }));
    const newPassword = 'BrandNewOwnerPass1';
    const res = await postReset(app, { resetToken: 'XXXXX-YYYYY-ZZZZZ', newPassword });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success?: boolean; data?: { success: boolean } };
    expect(body.success).toBe(true);

    // Owner password_hash o'zgargan — yangi parol bilan verify.
    const [owner] = await db.select().from(users).where(eq(users.id, ownerId));
    expect(await verifyPassword(newPassword, owner?.passwordHash ?? '')).toBe(true);
    expect(await verifyPassword(OWNER_OLD_PASSWORD, owner?.passwordHash ?? '')).toBe(false);

    // Boshqa foydalanuvchi TEGILMAGAN.
    const [other] = await db.select().from(users).where(eq(users.id, otherUserId));
    expect(await verifyPassword(OTHER_OLD_PASSWORD, other?.passwordHash ?? '')).toBe(true);

    // Tenant qatori TEGILMAGAN (name/slug/ownerUserId/subscriptionStatus/createdAt).
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    expect(tenant?.name).toBe(tenantSnapshot?.name);
    expect(tenant?.slug).toBe(tenantSnapshot?.slug);
    expect(tenant?.ownerUserId).toBe(tenantSnapshot?.ownerUserId);
    expect(tenant?.subscriptionStatus).toBe(tenantSnapshot?.subscriptionStatus);
    expect(tenant?.createdAt).toEqual(tenantSnapshot?.createdAt);

    // audit_log yozilgan — tenant-scoped, owner resource. `audit_log` FORCE RLS
    // (SELECT policy `tenant_id = current_setting('app.current_tenant_id')`) —
    // plain `db.select()` tenant-context'siz 0 qator ko'radi; tekshiruv uchun
    // shu tranzaksiya ichida `SET LOCAL` kerak (cli-442-tenants-guard.test.ts
    // precedenti).
    const events = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.tenantId, tenantId), eq(auditLog.action, 'owner_password_reset')));
    });
    expect(events.length).toBe(1);
    expect(events[0]?.resourceId).toBe(ownerId);
    expect(events[0]?.resourceType).toBe('user');
  });

  test('resetToken yoki newPassword yo‘q → 400 INVALID_REQUEST, hech narsa o‘zgarmaydi', async () => {
    const app = buildApp(async () => ({ ok: true }));
    const res = await postReset(app, { resetToken: 'XXXXX-YYYYY-ZZZZZ' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code: string } };
    expect(body.error?.code).toBe('INVALID_REQUEST');
  });
});
