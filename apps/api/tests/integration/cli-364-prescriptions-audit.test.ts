/**
 * CLI-364 — prescriptions.service.ts o'qish funksiyalari (list/get) audit_log'ga
 * 'viewed' yozuvi qo'shishini tasdiqlaydi. REAL DB + real audit logger.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-364-prescriptions`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, patients, prescriptions, tenants, users } from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createPrescriptionsService } from '../../src/modules/prescriptions/prescriptions.service.ts';

const audit = createAuditLogger({ db });
const service = createPrescriptionsService({ audit });

let tenantId: string;
let userId: string;
let patientId: string;
let prescriptionId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: userId }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000071', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Rx Clinic', slug: 'rx-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;

    const [rx] = await tx
      .insert(prescriptions)
      .values({
        tenantId,
        patientId,
        doctorId: userId,
        items: [{ medicationName: 'Amoxicillin', dosage: '500mg', frequency: '3x/kun' }],
      })
      .returning({ id: prescriptions.id });
    if (!rx) throw new Error('prescription insert failed');
    prescriptionId = rx.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Prescriptions — o‘qish audit (CLI-364)', () => {
  test('list(): audit_log’da action=viewed/resourceType=prescription/resourceId=patientId', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.list(ctx(tx), patientId);
    });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'viewed'),
            eq(auditLog.resourceType, 'prescription'),
            eq(auditLog.resourceId, patientId),
          ),
        );
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('get(): topilgan retsept uchun resourceId=prescription.id', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.get(ctx(tx), prescriptionId);
    });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'viewed'),
            eq(auditLog.resourceType, 'prescription'),
            eq(auditLog.resourceId, prescriptionId),
          ),
        );
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
