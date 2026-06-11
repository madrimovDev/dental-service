/**
 * Payroll integration test (CLI-77) — `createRun` snapshot hisobini REAL DB'da ishga
 * tushiradi: aktiv staff_profiles + plan-linked completed payment'dan attributed daromad
 * (doctorId bo'yicha) → computePayrollLine → payroll_lines snapshot. RLS tenant scope.
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration + RLS DDL apply qilingan.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env payroll`
 * (Bu fayl ORKESTRATOR tomonidan ishlatiladi — parallel agent ishlatmaydi.)
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  cashierTransactions,
  patients,
  staffProfiles,
  tenants,
  treatmentPlans,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createPayrollService } from '../../src/modules/payroll/payroll.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createPayrollService({ audit: noopAudit });

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
let doctorId: string; // A: doctor = profil egasi
let inactiveUserId: string; // A: inactive profil egasi
let ownerBId: string;
let branchAId: string;
let planId: string;

const PERIOD = { periodFrom: '2026-05-01', periodTo: '2026-05-31' };

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  // Platform jadvallar (RLS yo'q)
  const [doctor] = await db
    .insert(users)
    .values({ phone: '+998900000040', passwordHash: 'fake', fullName: 'Doctor A' })
    .returning({ id: users.id });
  const [inactive] = await db
    .insert(users)
    .values({ phone: '+998900000041', passwordHash: 'fake', fullName: 'Inactive A' })
    .returning({ id: users.id });
  const [ownerB] = await db
    .insert(users)
    .values({ phone: '+998900000042', passwordHash: 'fake', fullName: 'Owner B' })
    .returning({ id: users.id });
  if (!doctor || !inactive || !ownerB) throw new Error('user insert failed');
  doctorId = doctor.id;
  inactiveUserId = inactive.id;
  ownerBId = ownerB.id;

  const [tenantA] = await db
    .insert(tenants)
    .values({ name: 'Payroll Clinic A', slug: 'payroll-clinic-a', ownerUserId: doctorId })
    .returning({ id: tenants.id });
  const [tenantB] = await db
    .insert(tenants)
    .values({ name: 'Payroll Clinic B', slug: 'payroll-clinic-b', ownerUserId: ownerBId })
    .returning({ id: tenants.id });
  if (!tenantA || !tenantB) throw new Error('tenant insert failed');
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  // Tenant A seed: branch, profillar, bemor, plan, plan-linked completed payment
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));

    const [branch] = await tx
      .insert(branches)
      .values({ tenantId: tenantAId, name: 'Branch A1' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');
    branchAId = branch.id;

    // Aktiv profil: base=500000, commission=10
    await tx.insert(staffProfiles).values({
      tenantId: tenantAId,
      userId: doctorId,
      employmentStatus: 'active',
      baseSalary: '500000',
      commissionPercent: '10',
    });
    // Aktiv-bo'lmagan profil — payroll line'ga kirmasligi shart
    await tx.insert(staffProfiles).values({
      tenantId: tenantAId,
      userId: inactiveUserId,
      employmentStatus: 'inactive',
      baseSalary: '999999',
      commissionPercent: '50',
    });

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId: tenantAId, fullName: 'Bemor A' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({
        tenantId: tenantAId,
        patientId: patient.id,
        doctorId,
        title: 'Reja A',
        status: 'in_progress',
      })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');
    planId = plan.id;

    // Plan-linked completed payment: paidAmount=1000000, doctorId attribution.
    await tx.insert(cashierTransactions).values({
      tenantId: tenantAId,
      branchId: branchAId,
      patientId: patient.id,
      treatmentPlanId: planId,
      totalAmount: '1000000',
      paidAmount: '1000000',
      paymentMethod: 'cash',
      type: 'payment',
      status: 'completed',
      createdAt: new Date('2026-05-15T10:00:00+05:00'),
    });
  });

  // Tenant B seed: aktiv profil + plan-linked payment (RLS scope sinovi — A da ko'rinmaydi)
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantBId}'`));

    const [branchB] = await tx
      .insert(branches)
      .values({ tenantId: tenantBId, name: 'Branch B1' })
      .returning({ id: branches.id });
    if (!branchB) throw new Error('branch B insert failed');

    await tx.insert(staffProfiles).values({
      tenantId: tenantBId,
      userId: ownerBId,
      employmentStatus: 'active',
      baseSalary: '777777',
      commissionPercent: '20',
    });

    const [patientB] = await tx
      .insert(patients)
      .values({ tenantId: tenantBId, fullName: 'Bemor B' })
      .returning({ id: patients.id });
    if (!patientB) throw new Error('patient B insert failed');

    const [planB] = await tx
      .insert(treatmentPlans)
      .values({
        tenantId: tenantBId,
        patientId: patientB.id,
        doctorId: ownerBId,
        title: 'Reja B',
        status: 'in_progress',
      })
      .returning({ id: treatmentPlans.id });
    if (!planB) throw new Error('plan B insert failed');

    await tx.insert(cashierTransactions).values({
      tenantId: tenantBId,
      branchId: branchB.id,
      patientId: patientB.id,
      treatmentPlanId: planB.id,
      totalAmount: '5000000',
      paidAmount: '5000000',
      paymentMethod: 'cash',
      type: 'payment',
      status: 'completed',
      createdAt: new Date('2026-05-15T10:00:00+05:00'),
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Payroll — real DB createRun snapshot', () => {
  test('createRun: aktiv profil uchun base+komissiya snapshot (inactive chiqariladi)', async () => {
    const run = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      return service.createRun(ctx(tx, tenantAId, doctorId), PERIOD);
    });

    expect(run.status).toBe('draft');
    expect(run.tenantId).toBe(tenantAId);
    // Faqat aktiv profil → 1 line (inactive chiqarilgan)
    expect(run.lines).toHaveLength(1);

    const line = run.lines[0];
    expect(line?.userId).toBe(doctorId);
    expect(Number(line?.baseSalary)).toBe(500000);
    expect(Number(line?.attributedRevenue)).toBe(1000000);
    expect(Number(line?.commissionPercent)).toBe(10);
    expect(Number(line?.commissionAmount)).toBe(100000);
    expect(Number(line?.total)).toBe(600000);
  });

  test('getRun: run + lines qaytaradi', async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      const created = await service.createRun(ctx(tx, tenantAId, doctorId), PERIOD);
      return service.getRun(ctx(tx, tenantAId, doctorId), created.id);
    });

    expect(result).not.toBeNull();
    expect(result?.lines).toHaveLength(1);
    expect(Number(result?.lines[0]?.total)).toBe(600000);
  });

  test("listRuns: faqat tenant A run'lari (RLS scope)", async () => {
    const runs = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      return service.listRuns(ctx(tx, tenantAId, doctorId));
    });

    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((r) => r.tenantId === tenantAId)).toBe(true);
  });

  test('finalizeRun: draft → finalized', async () => {
    const finalized = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      const created = await service.createRun(ctx(tx, tenantAId, doctorId), PERIOD);
      return service.finalizeRun(ctx(tx, tenantAId, doctorId), created.id);
    });

    expect(finalized.error).toBeNull();
    expect(finalized.run?.status).toBe('finalized');
  });

  test('finalizeRun: ikkinchi finalize — not_draft xato', async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      const created = await service.createRun(ctx(tx, tenantAId, doctorId), PERIOD);
      await service.finalizeRun(ctx(tx, tenantAId, doctorId), created.id);
      return service.finalizeRun(ctx(tx, tenantAId, doctorId), created.id);
    });

    expect(result.error).toBe('not_draft');
    expect(result.run).toBeNull();
  });

  test("tenant B konteksti: B profili payroll (A ko'rinmaydi — cross-tenant bloklangan)", async () => {
    const run = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantBId}'`));
      return service.createRun(ctx(tx, tenantBId, ownerBId), PERIOD);
    });

    expect(run.lines).toHaveLength(1);
    // B daromadi 5000000 × 20% = 1000000; A ning 1000000 daromadi kirmaydi (RLS)
    expect(Number(run.lines[0]?.attributedRevenue)).toBe(5000000);
    expect(Number(run.lines[0]?.commissionAmount)).toBe(1000000);
    expect(Number(run.lines[0]?.total)).toBe(1777777);
  });
});
