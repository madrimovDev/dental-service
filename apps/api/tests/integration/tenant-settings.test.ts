/**
 * Tenant settings integration test (CLI-94) — get-or-create + partial update + RLS scope'ni
 * REAL DB'da ishga tushiradi. Sof helper yo'q; bu yerda default row yaratish, partial update va
 * tenant izolyatsiyasi tekshiriladi.
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration + RLS DDL apply qilingan.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env tenant-settings`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { createApp } from '../../src/app.ts';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { createTenantSettingsService } from '../../src/modules/tenant-settings/tenant-settings.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createTenantSettingsService({ audit: noopAudit });

// Service getOrCreate/update `db`, `activeTenantId`, `user`, `accessClaims` o'qiydi.
const ctx = (tx: DbOrTx, tenantId: string, userId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: userId }
            : k === 'accessClaims'
              ? { perms: ['@owner'] }
              : undefined,
  }) as unknown as Context;

let tenantAId: string;
let tenantBId: string;
let ownerAId: string;
let ownerBId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [ownerA] = await db
    .insert(users)
    .values({ phone: '+998900000040', passwordHash: 'x', fullName: 'Owner A' })
    .returning({ id: users.id });
  if (!ownerA) throw new Error('seed failed: ownerA');
  ownerAId = ownerA.id;
  const [ownerB] = await db
    .insert(users)
    .values({ phone: '+998900000041', passwordHash: 'x', fullName: 'Owner B' })
    .returning({ id: users.id });
  if (!ownerB) throw new Error('seed failed: ownerB');
  ownerBId = ownerB.id;

  const [tenantA] = await db
    .insert(tenants)
    .values({ name: 'A', slug: 'a-clinic', ownerUserId: ownerAId })
    .returning({ id: tenants.id });
  if (!tenantA) throw new Error('seed failed: tenantA');
  tenantAId = tenantA.id;
  const [tenantB] = await db
    .insert(tenants)
    .values({ name: 'B', slug: 'b-clinic', ownerUserId: ownerBId })
    .returning({ id: tenants.id });
  if (!tenantB) throw new Error('seed failed: tenantB');
  tenantBId = tenantB.id;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

/** Har `run` o'z (commit qilinadigan) transaction'i — cross-run persistence shu orqali. */
const run = <T>(tenantId: string, userId: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx, tenantId, userId));
  });

describe('tenant-settings — real DB', () => {
  test("GET (row yo'q) → default 'dental' row yaratiladi", async () => {
    const s = await run(tenantAId, ownerAId, (c) => service.getOrCreate(c));
    expect(s.tenantId).toBe(tenantAId);
    expect(s.vertical).toBe('dental');
    expect(s.reminderLeadHours).toBe(24);
    expect(s.currency).toBe('UZS');
  });

  test("PATCH partial update → vertical/reminderLeadHours o'zgaradi", async () => {
    const s = await run(tenantAId, ownerAId, (c) =>
      service.update(c, { vertical: 'cosmetology', reminderLeadHours: 48 }),
    );
    expect(s.vertical).toBe('cosmetology');
    expect(s.reminderLeadHours).toBe(48);
    expect(s.currency).toBe('UZS'); // berilmagan maydon o'zgarmaydi
  });

  test("ikkinchi GET — o'zgargan qiymatni qaytaradi (persisted, yangi row yaratilmaydi)", async () => {
    const s = await run(tenantAId, ownerAId, (c) => service.getOrCreate(c));
    expect(s.vertical).toBe('cosmetology');
    expect(s.reminderLeadHours).toBe(48);
  });

  test("RLS scope — tenant B o'z default row'ini oladi, A ta'sir qilmaydi", async () => {
    const b = await run(tenantBId, ownerBId, (c) => service.getOrCreate(c));
    expect(b.tenantId).toBe(tenantBId);
    expect(b.vertical).toBe('dental'); // B hech qachon yangilanmagan
    expect(b.reminderLeadHours).toBe(24);

    // A hali ham cosmetology/48 (B GET A'ni o'zgartirmadi)
    const a = await run(tenantAId, ownerAId, (c) => service.getOrCreate(c));
    expect(a.vertical).toBe('cosmetology');
    expect(a.reminderLeadHours).toBe(48);
  });
});

// ---------------------------------------------------------------------------
// HTTP-level integration (CLI-120) — OpenAPIHono routes: auth + RLS + requirePermission
// Verifies the full middleware stack (authMiddleware → rlsMiddleware → requirePermission)
// against real Postgres, not just the service layer.
// ---------------------------------------------------------------------------

let httpTenantId: string;
let httpOwnerId: string;
let httpJwt: string;

describe('tenant-settings HTTP (CLI-120)', () => {
  beforeAll(async () => {
    // Insert rows with unique identifiers; no TRUNCATE here — both describe-level
    // beforeAll hooks run before any tests in bun:test, so a TRUNCATE would wipe
    // the rows seeded by the service describe above.
    const [owner] = await db
      .insert(users)
      .values({ phone: '+998900000099', passwordHash: 'x', fullName: 'HTTP Owner' })
      .returning({ id: users.id });
    if (!owner) throw new Error('user insert failed');
    httpOwnerId = owner.id;

    const [tenant] = await db
      .insert(tenants)
      .values({ name: 'HTTP Clinic', slug: 'http-clinic', ownerUserId: httpOwnerId })
      .returning({ id: tenants.id });
    if (!tenant) throw new Error('tenant insert failed');
    httpTenantId = tenant.id;

    // Mint JWT with @owner sentinel — bypasses requirePermission for all non-owner-only perms
    const result = await signAccess({
      sub: httpOwnerId,
      atid: httpTenantId,
      abid: null,
      perms: ['@owner'],
      roleKey: null,
      lang: 'uz',
    });
    httpJwt = result.token;
  });

  afterAll(async () => {
    // Clean up only the rows we inserted (targeted delete, not full TRUNCATE)
    if (httpTenantId) {
      await db.execute(sql`DELETE FROM tenants WHERE id = ${httpTenantId}`);
    }
    if (httpOwnerId) {
      await db.execute(sql`DELETE FROM users WHERE id = ${httpOwnerId}`);
    }
  });

  test('GET /api/tenant-settings — get-or-create returns defaults (200)', async () => {
    const app = createApp();
    const res = await app.request('/api/tenant-settings', {
      headers: { Authorization: `Bearer ${httpJwt}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(body.data.vertical).toBe('dental');
    expect(body.data.reminderLeadHours).toBe(24);
    expect(body.data.currency).toBe('UZS');
    expect(typeof body.data.createdAt).toBe('string');
  });

  test('PATCH /api/tenant-settings — updates reminderLeadHours (200)', async () => {
    const app = createApp();
    const res = await app.request('/api/tenant-settings', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${httpJwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reminderLeadHours: 48 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(body.data.reminderLeadHours).toBe(48);
  });

  test('GET without Authorization — 401', async () => {
    const app = createApp();
    const res = await app.request('/api/tenant-settings');
    expect(res.status).toBe(401);
  });
});
