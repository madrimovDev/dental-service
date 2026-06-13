/**
 * Vertical feature gating integration test (CLI-79, M8) — `requireFeature` guard'ni
 * REAL DB + to'liq middleware stack (auth → RLS → requirePermission → requireFeature)
 * ustida tekshiradi.
 *
 * Maqsad: UI yashirsa-da API ham yopiq bo'lishi (defense-in-depth, CLI-153 saboq).
 *   - vertical='general' tenant odontogram (tooth-charts) endpoint'iga → 403 feature.disabled
 *   - vertical='dental' tenant aynan shu endpoint'da → NOT 403 (guard o'tadi)
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration + RLS DDL apply qilingan.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-79-vertical-gating`
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

/** Har `run` o'z (commit qilinadigan) transaction'i — RLS uchun `SET LOCAL`. */
const run = <T>(tenantId: string, userId: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx, tenantId, userId));
  });

const randomPatientId = '11111111-1111-1111-1111-111111111111';

let generalTenantId: string;
let generalOwnerId: string;
let generalJwt: string;
let dentalTenantId: string;
let dentalOwnerId: string;
let dentalJwt: string;

const mintOwnerJwt = async (tenantId: string, userId: string) => {
  const { token } = await signAccess({
    sub: userId,
    atid: tenantId,
    abid: null,
    perms: ['@owner'],
    roleKey: null,
    lang: 'uz',
  });
  return token;
};

describe('CLI-79 vertical gating — odontogram (tooth-charts) HTTP', () => {
  beforeAll(async () => {
    // General-vertical tenant
    const [generalOwner] = await db
      .insert(users)
      .values({ phone: '+998900000079', passwordHash: 'x', fullName: 'General Owner' })
      .returning({ id: users.id });
    if (!generalOwner) throw new Error('seed failed: generalOwner');
    generalOwnerId = generalOwner.id;
    const [generalTenant] = await db
      .insert(tenants)
      .values({ name: 'General Clinic', slug: 'general-clinic-79', ownerUserId: generalOwnerId })
      .returning({ id: tenants.id });
    if (!generalTenant) throw new Error('seed failed: generalTenant');
    generalTenantId = generalTenant.id;

    // Dental-vertical tenant
    const [dentalOwner] = await db
      .insert(users)
      .values({ phone: '+998900000078', passwordHash: 'x', fullName: 'Dental Owner' })
      .returning({ id: users.id });
    if (!dentalOwner) throw new Error('seed failed: dentalOwner');
    dentalOwnerId = dentalOwner.id;
    const [dentalTenant] = await db
      .insert(tenants)
      .values({ name: 'Dental Clinic', slug: 'dental-clinic-79', ownerUserId: dentalOwnerId })
      .returning({ id: tenants.id });
    if (!dentalTenant) throw new Error('seed failed: dentalTenant');
    dentalTenantId = dentalTenant.id;

    // Seed tenant_settings.vertical INSIDE tenant-scoped tx (RLS!) — getOrCreate
    // guarantees row exists, then update sets the vertical.
    const general = await run(generalTenantId, generalOwnerId, async (c) => {
      await settingsService.getOrCreate(c);
      return settingsService.update(c, { vertical: 'general' });
    });
    if (general.vertical !== 'general') {
      throw new Error(`seed failed: general vertical = ${general.vertical}`);
    }
    const dental = await run(dentalTenantId, dentalOwnerId, async (c) => {
      // default is 'dental'; getOrCreate is enough but be explicit
      await settingsService.getOrCreate(c);
      return settingsService.update(c, { vertical: 'dental' });
    });
    if (dental.vertical !== 'dental') {
      throw new Error(`seed failed: dental vertical = ${dental.vertical}`);
    }

    generalJwt = await mintOwnerJwt(generalTenantId, generalOwnerId);
    dentalJwt = await mintOwnerJwt(dentalTenantId, dentalOwnerId);
  });

  afterAll(async () => {
    if (generalTenantId) {
      await db.execute(sql`DELETE FROM tenants WHERE id = ${generalTenantId}`);
    }
    if (dentalTenantId) {
      await db.execute(sql`DELETE FROM tenants WHERE id = ${dentalTenantId}`);
    }
    if (generalOwnerId) {
      await db.execute(sql`DELETE FROM users WHERE id = ${generalOwnerId}`);
    }
    if (dentalOwnerId) {
      await db.execute(sql`DELETE FROM users WHERE id = ${dentalOwnerId}`);
    }
  });

  test('general vertical → odontogram endpoint 403 feature.disabled', async () => {
    const app = createApp();
    const res = await app.request(`/api/patients/${randomPatientId}/tooth-charts`, {
      headers: { Authorization: `Bearer ${generalJwt}` },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('feature.disabled');
  });

  test('dental vertical → odontogram endpoint NOT 403 (guard passes)', async () => {
    const app = createApp();
    const res = await app.request(`/api/patients/${randomPatientId}/tooth-charts`, {
      headers: { Authorization: `Bearer ${dentalJwt}` },
    });
    expect(res.status).not.toBe(403);
  });
});
