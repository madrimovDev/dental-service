/**
 * Bemor qarindoshlari (oila) integration test (CLI-73) — listRelatives/addRelative/
 * removeRelative ni REAL DB'da ishga tushiradi. Bitta link row (A→B) bilan ikki
 * yo'nalish tekshiriladi: A so'rovida B (outgoing), B so'rovida A (incoming).
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration apply qilingan
 * (patient_relatives jadvali + RLS).
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env patient-relatives`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { patients, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createPatientsService } from '../../src/modules/patients/patients.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createPatientsService({ audit: noopAudit });

// ⚠️ addRelative `activeTenantId` ni o'qiydi (NOT NULL tenant_id) — ctx mock'ga qo'shamiz.
let tenantId: string;
const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantId
            : undefined,
  }) as unknown as Context;

let ownerId: string;
let patientAId: string;
let patientBId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000020', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Relatives Clinic', slug: 'relatives-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

    const [a] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor A' })
      .returning({ id: patients.id });
    const [b] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor B' })
      .returning({ id: patients.id });
    if (!a || !b) throw new Error('patient insert failed');
    patientAId = a.id;
    patientBId = b.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Bemor qarindoshlari — real DB', () => {
  let linkId: string;

  test('addRelative: A→B link yaratadi (otasi)', async () => {
    const link = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.addRelative(ctx(tx), patientAId, {
        relativePatientId: patientBId,
        relationship: 'otasi',
      });
    });

    expect(link).not.toBeNull();
    expect(link?.patientId).toBe(patientAId);
    expect(link?.relativePatientId).toBe(patientBId);
    expect(link?.tenantId).toBe(tenantId);
    linkId = link?.id as string;
  });

  test("listRelatives(A): B ko'rinadi, direction=outgoing", async () => {
    const rels = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.listRelatives(ctx(tx), patientAId);
    });

    expect(rels).toHaveLength(1);
    expect(rels[0]?.id).toBe(linkId);
    expect(rels[0]?.relativePatient.id).toBe(patientBId);
    expect(rels[0]?.relativePatient.fullName).toBe('Bemor B');
    expect(rels[0]?.relationship).toBe('otasi');
    expect(rels[0]?.direction).toBe('outgoing');
  });

  test("listRelatives(B): bir xil link orqali A ko'rinadi, direction=incoming", async () => {
    const rels = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.listRelatives(ctx(tx), patientBId);
    });

    expect(rels).toHaveLength(1);
    expect(rels[0]?.id).toBe(linkId);
    expect(rels[0]?.relativePatient.id).toBe(patientAId);
    expect(rels[0]?.relativePatient.fullName).toBe('Bemor A');
    expect(rels[0]?.direction).toBe('incoming');
  });

  test("removeRelative: incoming tomondan (B) o'chirish ham ishlaydi", async () => {
    const removed = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.removeRelative(ctx(tx), patientBId, linkId);
    });
    expect(removed).not.toBeNull();
    expect(removed?.id).toBe(linkId);

    const [relsA, relsB] = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return Promise.all([
        service.listRelatives(ctx(tx), patientAId),
        service.listRelatives(ctx(tx), patientBId),
      ]);
    });
    expect(relsA).toHaveLength(0);
    expect(relsB).toHaveLength(0);
  });

  test("removeRelative: mavjud bo'lmagan link → null", async () => {
    const removed = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.removeRelative(ctx(tx), patientAId, linkId);
    });
    expect(removed).toBeNull();
  });
});
