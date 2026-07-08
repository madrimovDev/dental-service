/**
 * CLI-439 — patients.service.ts medicalRecordHistory() audit qilinmaydi (REAL DB).
 *
 * `getMedicalRecord` sensitive-read'ni `action:'viewed'` bilan audit qiladi;
 * `medicalRecordHistory` xuddi shu `medical_record.view` permission bilan gate
 * qilingan lekin hech qanday audit chaqirmaydi — CLAUDE.md §3.10 buzilishi.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-439-medical-record-history`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, medicalRecords, patients, tenants, users } from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createPatientsService } from '../../src/modules/patients/patients.service.ts';

const audit = createAuditLogger({ db });
const service = createPatientsService({ audit });

let tenantId: string;
let ownerId: string;
let patientId: string;
let recordId: string;

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
              ? { id: ownerId }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000439', passwordHash: 'x', fullName: 'Owner439' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'History Clinic', slug: 'history-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor439' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;

    const [rec] = await tx
      .insert(medicalRecords)
      .values({ tenantId, patientId })
      .returning({ id: medicalRecords.id });
    if (!rec) throw new Error('medical record insert failed');
    recordId = rec.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-439 — medicalRecordHistory() audit — real DB', () => {
  test("chaqirilganda audit_log'ga action=viewed/resourceType=medical_record yoziladi", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.medicalRecordHistory(ctx(tx), patientId);
    });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'viewed'),
            eq(auditLog.resourceType, 'medical_record'),
            eq(auditLog.resourceId, recordId),
          ),
        );
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test("medical record topilmasa — audit yozilmaydi (xatosiz bo'sh massiv)", async () => {
    const missingPatientId = '00000000-0000-0000-0000-000000000000';
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.medicalRecordHistory(ctx(tx), missingPatientId);
    });
    expect(result).toEqual([]);
  });
});
