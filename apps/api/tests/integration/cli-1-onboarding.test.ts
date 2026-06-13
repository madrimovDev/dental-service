/**
 * Onboarding dismissal integration test (CLI-1) — `tenant_settings.onboardingDismissedAt`
 * persistensiyasini REAL DB'da tekshiradi. Tenant onboarding checklist'ni "dismiss"
 * qilganda — multi-device saqlanadi (localStorage emas).
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration + RLS DDL apply qilingan.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-1-onboarding`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createTenantSettingsService } from '../../src/modules/tenant-settings/tenant-settings.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createTenantSettingsService({ audit: noopAudit });

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

let tenantId: string;
let ownerId: string;

beforeAll(async () => {
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000050', passwordHash: 'x', fullName: 'Onboarding Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('seed failed: owner');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Onboarding Clinic', slug: 'onboarding-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('seed failed: tenant');
  tenantId = tenant.id;
});

afterAll(async () => {
  if (tenantId) await db.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}`);
  if (ownerId) await db.execute(sql`DELETE FROM users WHERE id = ${ownerId}`);
});

/** Har `run` o'z (commit qilinadigan) transaction'i — cross-run persistence shu orqali. */
const run = <T>(uid: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx, tenantId, uid));
  });

describe('tenant-settings onboarding dismissal (CLI-1) — real DB', () => {
  test('default row → onboardingDismissedAt is null', async () => {
    const s = await run(ownerId, (c) => service.getOrCreate(c));
    expect(s.onboardingDismissedAt).toBeNull();
  });

  test('update with ISO string persists the same instant', async () => {
    const iso = '2026-06-13T08:30:00.000Z';
    const updated = await run(ownerId, (c) => service.update(c, { onboardingDismissedAt: iso }));
    // Service rows return Date columns.
    expect(updated.onboardingDismissedAt).toBeInstanceOf(Date);
    expect(updated.onboardingDismissedAt?.toISOString()).toBe(iso);

    // Read back in a fresh transaction — persisted.
    const reread = await run(ownerId, (c) => service.getOrCreate(c));
    expect(reread.onboardingDismissedAt?.toISOString()).toBe(iso);
  });

  test('update with null clears the dismissal', async () => {
    const cleared = await run(ownerId, (c) => service.update(c, { onboardingDismissedAt: null }));
    expect(cleared.onboardingDismissedAt).toBeNull();

    const reread = await run(ownerId, (c) => service.getOrCreate(c));
    expect(reread.onboardingDismissedAt).toBeNull();
  });

  test('omitting onboardingDismissedAt leaves it unchanged', async () => {
    const iso = '2026-06-13T09:00:00.000Z';
    await run(ownerId, (c) => service.update(c, { onboardingDismissedAt: iso }));
    // Update a different field; dismissal must persist.
    const s = await run(ownerId, (c) => service.update(c, { reminderLeadHours: 12 }));
    expect(s.reminderLeadHours).toBe(12);
    expect(s.onboardingDismissedAt?.toISOString()).toBe(iso);
  });
});
