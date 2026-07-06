/**
 * CLI-421 — cross-entity ownership validator (REAL DB).
 * Tasdiqlaydi (RLS-scoped select orqali):
 *   1) Bemor A visit-note, stageId = B bemor bosqichi (bir tenant) → CrossEntityError('mismatch').
 *   2) Cross-tenant patientId visit-note create → CrossEntityError('not_found').
 *   3) visitNoteId boshqa bemorники (patient-image/tooth-chart) → CrossEntityError.
 *   4) Prescription doctorId bu tenantda aktiv assignment'siz → CrossEntityError('not_found').
 *   5) To'g'ri (hammasi bir bemor, aktiv doctor) → OK (regressiya yo'q).
 *
 * ⚠️ Infra DOWN paytida YOZILGAN, LEKIN ISHGA TUSHIRILMAGAN.
 *   cd apps/api && bun test tests/integration/cli-421-cross-entity-ownership.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  patients,
  roles,
  tenants,
  treatmentPlans,
  treatmentStages,
  userAssignments,
  users,
  visitNotes,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { CrossEntityError, createOwnershipValidator } from '../../src/lib/ownership.ts';

const ownership = createOwnershipValidator();

const ctx = (tx: DbOrTx, tenantId: string): Context =>
  ({
    get: (k: string) => (k === 'db' ? tx : k === 'activeTenantId' ? tenantId : undefined),
  }) as unknown as Context;

let tenantA: string;
let tenantB: string;
let ownerA: string;
let ownerB: string;
let patientA: string;
let patientA2: string;
let patientB: string;
let stageOfA2: string; // A2 bemorning bosqichi (mixed-patient uchun)
let visitOfA2: string; // A2 bemorning vizit yozuvi

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [oa] = await db
    .insert(users)
    .values({ phone: '+998900000421', passwordHash: 'x', fullName: 'Owner A' })
    .returning({ id: users.id });
  const [ob] = await db
    .insert(users)
    .values({ phone: '+998900000422', passwordHash: 'x', fullName: 'Owner B' })
    .returning({ id: users.id });
  ownerA = oa!.id;
  ownerB = ob!.id;

  const [ta] = await db
    .insert(tenants)
    .values({ name: 'Clinic A', slug: 'clinic-a-421', ownerUserId: ownerA })
    .returning({ id: tenants.id });
  const [tb] = await db
    .insert(tenants)
    .values({ name: 'Clinic B', slug: 'clinic-b-421', ownerUserId: ownerB })
    .returning({ id: tenants.id });
  tenantA = ta!.id;
  tenantB = tb!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantA}'`));
    await tx.insert(branches).values({ tenantId: tenantA, name: 'A' });
    const [role] = await tx
      .insert(roles)
      .values({ tenantId: tenantA, name: 'Doctor', isSystem: false })
      .returning({ id: roles.id });
    // ownerA — aktiv assignment (assertUserExists uchun)
    await tx.insert(userAssignments).values({
      userId: ownerA,
      tenantId: tenantA,
      roleId: role!.id,
      isActive: true,
    });
    const [pa] = await tx
      .insert(patients)
      .values({ tenantId: tenantA, fullName: 'A bemor' })
      .returning({ id: patients.id });
    const [pa2] = await tx
      .insert(patients)
      .values({ tenantId: tenantA, fullName: 'A2 bemor' })
      .returning({ id: patients.id });
    patientA = pa!.id;
    patientA2 = pa2!.id;

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId: tenantA, patientId: patientA2, doctorId: ownerA, title: 'A2 plan' })
      .returning({ id: treatmentPlans.id });
    const [stage] = await tx
      .insert(treatmentStages)
      .values({ treatmentPlanId: plan!.id, sequence: 1, serviceName: 'S', cost: '1' })
      .returning({ id: treatmentStages.id });
    stageOfA2 = stage!.id;

    const [vn] = await tx
      .insert(visitNotes)
      .values({ tenantId: tenantA, patientId: patientA2, doctorId: ownerA })
      .returning({ id: visitNotes.id });
    visitOfA2 = vn!.id;
  });

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantB}'`));
    await tx.insert(branches).values({ tenantId: tenantB, name: 'B' });
    const [pb] = await tx
      .insert(patients)
      .values({ tenantId: tenantB, fullName: 'B bemor' })
      .returning({ id: patients.id });
    patientB = pb!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

async function inTenantA<T>(fn: (c: Context) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantA}'`));
    return fn(ctx(tx, tenantA));
  });
}

describe('CLI-421 — cross-entity ownership', () => {
  test('mixed-patient stage (A vs A2, same tenant) → mismatch', async () => {
    await expect(
      inTenantA((c) => ownership.assertStageBelongsToPatient(c, stageOfA2, patientA)),
    ).rejects.toBeInstanceOf(CrossEntityError);
  });

  test('cross-tenant patientId (B seen from A) → not_found (RLS bo`sh select)', async () => {
    await expect(
      inTenantA((c) => ownership.assertPatientExists(c, patientB)),
    ).rejects.toBeInstanceOf(CrossEntityError);
  });

  test('mixed-patient visitNoteId (A vs A2) → mismatch', async () => {
    await expect(
      inTenantA((c) => ownership.assertVisitNoteBelongsToPatient(c, visitOfA2, patientA)),
    ).rejects.toBeInstanceOf(CrossEntityError);
  });

  test('doctorId without active assignment in tenant → not_found', async () => {
    // ownerB bu tenantda (A) assignment'ga ega emas.
    await expect(inTenantA((c) => ownership.assertUserExists(c, ownerB))).rejects.toBeInstanceOf(
      CrossEntityError,
    );
  });

  test('happy path — same patient + active doctor → OK', async () => {
    await inTenantA(async (c) => {
      await ownership.assertPatientExists(c, patientA2);
      await ownership.assertUserExists(c, ownerA);
      await ownership.assertStageBelongsToPatient(c, stageOfA2, patientA2);
      await ownership.assertVisitNoteBelongsToPatient(c, visitOfA2, patientA2);
    });
    expect(true).toBe(true);
  });
});
