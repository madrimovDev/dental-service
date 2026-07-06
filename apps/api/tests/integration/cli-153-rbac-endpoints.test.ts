/**
 * CLI-153 RBAC gap fix — yangi yengil endpointlar (REAL DB):
 *  - `appointments.service.listDoctors` (CLI-154): doctor-rolli userlar, dedupe, RLS.
 *  - `cashier.service.listPatientPlans` (CLI-155): bemor rejalari {id,title,status}, RLS.
 *
 * Bu endpointlar `user.view`/`medical_record.view` o'rniga `appointment.view`/`cashier.view`
 * bilan ochiq — shunda Receptionist/kassir cross-domen 403 olmaydi. Permission guard
 * route darajasida (statik); bu test service mantiqi + RLS izolyatsiyani tekshiradi.
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration + RLS DDL apply qilingan.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-153`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  patients,
  permissions,
  rolePermissions,
  roles,
  tenants,
  treatmentPlans,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const apptService = createAppointmentsService({ audit: noopAudit });
const cashierService = createCashierService({ audit: noopAudit });

// Service `db` (RLS-bound tx) va tenant/user kontekstni o'qiydi.
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

// Tenant-scoped (RLS) jadvallarga yozish/o'qish — `SET LOCAL` bilan tx.
const withTenant = <T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

let tenantAId: string;
let tenantBId: string;
let ownerAId: string;
let ownerBId: string;
let doctorAId: string; // A tenant doctor-rolli user
let receptionistAId: string; // A tenant non-doctor user
let doctorBId: string; // B tenant doctor (RLS izolyatsiya)
let patientAId: string;
let planAId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const inserted = await db
    .insert(users)
    .values([
      { phone: '+998900000050', passwordHash: 'fake', fullName: 'Owner A' },
      { phone: '+998900000051', passwordHash: 'fake', fullName: 'Owner B' },
      { phone: '+998900000052', passwordHash: 'fake', fullName: 'Aliyev Doctor' },
      { phone: '+998900000053', passwordHash: 'fake', fullName: 'Resepsion Xodim' },
      { phone: '+998900000054', passwordHash: 'fake', fullName: 'Doctor B' },
    ])
    .returning({ id: users.id });
  const [ownerA, ownerB, doctorA, receptionistA, doctorB] = inserted;
  if (!ownerA || !ownerB || !doctorA || !receptionistA || !doctorB)
    throw new Error('user insert failed');
  ownerAId = ownerA.id;
  ownerBId = ownerB.id;
  doctorAId = doctorA.id;
  receptionistAId = receptionistA.id;
  doctorBId = doctorB.id;

  const [tenantA, tenantB] = await db
    .insert(tenants)
    .values([
      { name: 'RBAC Clinic A', slug: 'rbac-clinic-a', ownerUserId: ownerAId },
      { name: 'RBAC Clinic B', slug: 'rbac-clinic-b', ownerUserId: ownerBId },
    ])
    .returning({ id: tenants.id });
  if (!tenantA || !tenantB) throw new Error('tenant insert failed');
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  // A1 (CLI-438): listDoctors endi 'medical_record.edit' permission'iga tayanadi
  // (rol-nomi substring emas) — platform-level permission (bo'lmasa qo'shamiz).
  const [perm] = await db
    .insert(permissions)
    .values({ code: 'medical_record.edit', category: 'clinical' })
    .onConflictDoNothing()
    .returning({ id: permissions.id });
  const medicalRecordEditPermId =
    perm?.id ??
    (
      await db
        .select({ id: permissions.id })
        .from(permissions)
        .where(eq(permissions.code, 'medical_record.edit'))
    )[0]?.id;
  if (!medicalRecordEditPermId) throw new Error('permission resolve failed');

  // Tenant A: rollar + assignmentlar + bemor + reja
  await withTenant(tenantAId, async (tx) => {
    const [doctorRole, doctorAssistRole, receptionRole] = await tx
      .insert(roles)
      .values([
        { tenantId: tenantAId, name: 'Doctor' },
        { tenantId: tenantAId, name: 'Doctor + Assistant' },
        { tenantId: tenantAId, name: 'Receptionist' },
      ])
      .returning({ id: roles.id });
    if (!doctorRole || !doctorAssistRole || !receptionRole) throw new Error('roles insert failed');

    // Doctor-rolli role'larga 'medical_record.edit' — A1 detektsiyasi shuni talab qiladi.
    await tx.insert(rolePermissions).values([
      { roleId: doctorRole.id, permissionId: medicalRecordEditPermId },
      { roleId: doctorAssistRole.id, permissionId: medicalRecordEditPermId },
    ]);

    await tx.insert(userAssignments).values([
      // doctorA — IKKI assignment (Doctor + Doctor+Assistant): dedupe sinovi
      { userId: doctorAId, tenantId: tenantAId, roleId: doctorRole.id, isActive: true },
      { userId: doctorAId, tenantId: tenantAId, roleId: doctorAssistRole.id, isActive: true },
      // receptionistA — non-doctor (listDoctors'da chiqmasligi kerak)
      { userId: receptionistAId, tenantId: tenantAId, roleId: receptionRole.id, isActive: true },
    ]);

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId: tenantAId, fullName: 'Tursunov Jamshid' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientAId = patient.id;

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({
        tenantId: tenantAId,
        patientId: patientAId,
        doctorId: doctorAId,
        title: 'Kompleks davolash',
        status: 'accepted',
      })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');
    planAId = plan.id;
  });

  // Tenant B: doctor (RLS izolyatsiya uchun)
  await withTenant(tenantBId, async (tx) => {
    const [doctorRoleB] = await tx
      .insert(roles)
      .values({ tenantId: tenantBId, name: 'Doctor' })
      .returning({ id: roles.id });
    if (!doctorRoleB) throw new Error('roleB insert failed');
    await tx
      .insert(rolePermissions)
      .values({ roleId: doctorRoleB.id, permissionId: medicalRecordEditPermId });
    await tx
      .insert(userAssignments)
      .values({ userId: doctorBId, tenantId: tenantBId, roleId: doctorRoleB.id, isActive: true });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-154 — listDoctors (appointment.view yengil endpoint)', () => {
  test('doctor-rolli userlarni qaytaradi, non-doctorni emas + dedupe', async () => {
    const doctors = await withTenant(tenantAId, (tx) =>
      apptService.listDoctors(ctx(tx, tenantAId, ownerAId)),
    );
    // doctorA IKKI assignment'ga ega — distinct bitta qator
    expect(doctors).toHaveLength(1);
    expect(doctors[0]).toEqual({ id: doctorAId, name: 'Aliyev Doctor' });
    // receptionist (non-doctor) ro'yxatda yo'q
    expect(doctors.some((d) => d.id === receptionistAId)).toBe(false);
  });

  test("RLS: tenant B konteksti A doktorlarini ko'rmaydi", async () => {
    const doctors = await withTenant(tenantBId, (tx) =>
      apptService.listDoctors(ctx(tx, tenantBId, ownerBId)),
    );
    expect(doctors.some((d) => d.id === doctorAId)).toBe(false);
    expect(doctors).toEqual([{ id: doctorBId, name: 'Doctor B' }]);
  });
});

describe('CLI-155 — listPatientPlans (cashier.view yengil endpoint)', () => {
  test('bemorning rejalarini {id,title,status} bilan qaytaradi', async () => {
    const plans = await withTenant(tenantAId, (tx) =>
      cashierService.listPatientPlans(ctx(tx, tenantAId, ownerAId), patientAId),
    );
    expect(plans).toHaveLength(1);
    expect(plans[0]).toEqual({ id: planAId, title: 'Kompleks davolash', status: 'accepted' });
  });

  test("RLS: tenant B konteksti A bemor rejalarini ko'rmaydi (bo'sh)", async () => {
    const plans = await withTenant(tenantBId, (tx) =>
      cashierService.listPatientPlans(ctx(tx, tenantBId, ownerBId), patientAId),
    );
    expect(plans).toHaveLength(0);
  });
});
