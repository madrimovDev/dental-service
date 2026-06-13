/**
 * Vertical endpoint RBAC test (CLI-80, CLI-153 takrori) — `GET /api/tenant-settings/vertical`
 * permission'siz (faqat auth + RLS) bo'lishi, eski `GET /api/tenant-settings` esa
 * `tenant_settings.view` talab qilishda davom etishini REAL DB + to'liq middleware stack
 * ustida tekshiradi.
 *
 * Maqsad: rolga mos UI gating'ni HAR rol o'qiy olishi (useVertical 403 gap). CLI-153 saboq:
 * HAR DOIM real rol permset bilan sina, hech qachon `@owner` (owner kamchilikni yashiradi).
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration + RLS DDL apply qilingan.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-80-vertical-endpoint`
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
const settingsService = createTenantSettingsService({ audit: noopAudit });

// Seed ctx — owner perms (faqat seed uchun; HTTP test cheklangan rol bilan).
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

const run = <T>(tenantId: string, userId: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx, tenantId, userId));
  });

let tenantId: string;
let ownerId: string;
let restrictedJwt: string;

describe('CLI-80 vertical endpoint — restricted role (no tenant_settings.view)', () => {
  beforeAll(async () => {
    const [owner] = await db
      .insert(users)
      .values({ phone: '+998900000080', passwordHash: 'x', fullName: 'Vertical Owner' })
      .returning({ id: users.id });
    if (!owner) throw new Error('seed failed: owner');
    ownerId = owner.id;

    const [tenant] = await db
      .insert(tenants)
      .values({ name: 'Vertical Clinic', slug: 'vertical-clinic-80', ownerUserId: ownerId })
      .returning({ id: tenants.id });
    if (!tenant) throw new Error('seed failed: tenant');
    tenantId = tenant.id;

    // Seed vertical='general' tenant-scoped tx ichida (RLS!).
    const settings = await run(tenantId, ownerId, async (c) => {
      await settingsService.getOrCreate(c);
      return settingsService.update(c, { vertical: 'general' });
    });
    if (settings.vertical !== 'general') {
      throw new Error(`seed failed: vertical = ${settings.vertical}`);
    }

    // Cheklangan rol — faqat `patient.view`, NA `tenant_settings.view`, NA `@owner`.
    const { token } = await signAccess({
      sub: ownerId,
      atid: tenantId,
      abid: null,
      perms: ['patient.view'],
      roleKey: null,
      lang: 'uz',
    });
    restrictedJwt = token;
  });

  afterAll(async () => {
    if (tenantId) await db.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}`);
    if (ownerId) await db.execute(sql`DELETE FROM users WHERE id = ${ownerId}`);
  });

  test('restricted role → GET /api/tenant-settings/vertical 200 with correct vertical', async () => {
    const app = createApp();
    const res = await app.request('/api/tenant-settings/vertical', {
      headers: { Authorization: `Bearer ${restrictedJwt}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { vertical: string } };
    expect(body.success).toBe(true);
    expect(body.data.vertical).toBe('general');
  });

  test('SAME restricted role → GET /api/tenant-settings (admin endpoint) still 403', async () => {
    const app = createApp();
    const res = await app.request('/api/tenant-settings', {
      headers: { Authorization: `Bearer ${restrictedJwt}` },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('permission.denied');
  });

  test('GET /api/tenant-settings/vertical without Authorization → 401', async () => {
    const app = createApp();
    const res = await app.request('/api/tenant-settings/vertical');
    expect(res.status).toBe(401);
  });
});
