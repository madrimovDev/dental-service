/**
 * CLI-421 — prescriptions.service.ts update() cross-entity ownership tekshiruvi
 * (REAL DB). `create()` allaqachon `assertPatientExists`/`assertUserExists`/
 * `assertVisitNoteBelongsToPatient` ishlatadi (ownership.ts); `update()` esa hech
 * qanday ownership tekshiruvisiz `doctorId`/`visitNoteId` patch qilardi —
 * boshqa bemorning visit_note'iga yoki mavjud bo'lmagan doctorId'ga bog'lash
 * mumkin edi. Endi `visit-notes.service.ts::update()` bilan bir xil naqsh:
 * faqat YUBORILGAN maydonlar `before.patientId`ga nisbatan tekshiriladi.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-421-prescriptions-ownership`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { patients, prescriptions, tenants, users, visitNotes } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { CrossEntityError } from '../../src/lib/ownership.ts';
import { createPrescriptionsService } from '../../src/modules/prescriptions/prescriptions.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createPrescriptionsService({ audit: noopAudit });

let tenantId: string;
let doctorId: string;
let patientAId: string;
let patientBId: string;
let visitNoteForBId: string;
let prescriptionId: string; // belongs to patientA

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
              ? { id: doctorId }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

const NON_EXISTENT_ID = '00000000-0000-0000-0000-000000000000';

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [doctor] = await db
    .insert(users)
    .values({ phone: '+998900004211', passwordHash: 'x', fullName: 'Doctor421' })
    .returning({ id: users.id });
  if (!doctor) throw new Error('doctor insert failed');
  doctorId = doctor.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Rx Ownership Clinic', slug: 'rx-ownership-clinic', ownerUserId: doctorId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [a] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor A (Rx)' })
      .returning({ id: patients.id });
    const [b] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor B (Rx)' })
      .returning({ id: patients.id });
    if (!a || !b) throw new Error('patient insert failed');
    patientAId = a.id;
    patientBId = b.id;

    const [visitB] = await tx
      .insert(visitNotes)
      .values({ tenantId, patientId: patientBId, doctorId })
      .returning({ id: visitNotes.id });
    if (!visitB) throw new Error('visit note insert failed');
    visitNoteForBId = visitB.id;

    const [rx] = await tx
      .insert(prescriptions)
      .values({
        tenantId,
        patientId: patientAId,
        doctorId,
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

describe('CLI-421 — prescriptions update() ownership — real DB', () => {
  test('visitNoteId boshqa bemorga tegishli → CrossEntityError(mismatch)', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return service.update(ctx(tx), prescriptionId, { visitNoteId: visitNoteForBId });
      }),
    ).rejects.toThrow(CrossEntityError);
  });

  test("visitNoteId mavjud bo'lmagan UUID → CrossEntityError(not_found)", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return service.update(ctx(tx), prescriptionId, { visitNoteId: NON_EXISTENT_ID });
      }),
    ).rejects.toThrow(CrossEntityError);
  });

  test("doctorId mavjud bo'lmagan UUID → CrossEntityError(not_found)", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return service.update(ctx(tx), prescriptionId, { doctorId: NON_EXISTENT_ID });
      }),
    ).rejects.toThrow(CrossEntityError);
  });

  test("faqat items o'zgartirilsa — ownership tekshirilmaydi, muvaffaqiyatli (regressiya)", async () => {
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.update(ctx(tx), prescriptionId, {
        items: [{ medicationName: 'Ibuprofen', dosage: '200mg', frequency: '2x/kun' }],
      });
    });
    expect(updated?.items).toEqual([
      { medicationName: 'Ibuprofen', dosage: '200mg', frequency: '2x/kun' },
    ]);
  });
});
