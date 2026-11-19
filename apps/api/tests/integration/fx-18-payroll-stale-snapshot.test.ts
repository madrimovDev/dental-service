/**
 * FX-18 (LA-28) — payroll `finalizeRun` draft snapshot'idan keyingi to'lov/refund'ni
 * aniqlaydi: `stale_snapshot` (route: 409). Draft'ni o'chirib qayta yaratish kerak.
 *
 *   cd apps/api && bun test tests/integration/fx-18-payroll-stale-snapshot.test.ts --env-file=../../.env --timeout 30000
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  cashierTransactions,
  patients,
  payrollRuns,
  staffProfiles,
  tenants,
  treatmentPlans,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createPayrollService } from '../../src/modules/payroll/payroll.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const payrollService = createPayrollService({ audit: noopAudit });

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
let doctorId: string;
let branchId: string;
let patientId: string;
let planId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000118', passwordHash: 'fake', fullName: 'Owner FX18' })
    .returning({ id: users.id });
  const [doctor] = await db
    .insert(users)
    .values({ phone: '+998900000119', passwordHash: 'fake', fullName: 'Doctor FX18' })
    .returning({ id: users.id });
  if (!owner || !doctor) throw new Error('user insert failed');
  ownerId = owner.id;
  doctorId = doctor.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FX-18 Clinic', slug: 'fx-18-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'FX-18 Branch' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');
    branchId = branch.id;

    await tx.insert(staffProfiles).values({
      tenantId,
      userId: doctorId,
      employmentStatus: 'active',
      baseSalary: '400000',
      commissionPercent: '10',
    });

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'FX-18 Patient' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId, title: 'FX-18 Plan', status: 'in_progress' })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');
    planId = plan.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const insertTx = async (
  tx: DbOrTx,
  o: { receipt: string; type: 'payment' | 'refund'; amount: string; at: string },
) =>
  tx
    .insert(cashierTransactions)
    .values({
      tenantId,
      branchId,
      patientId,
      treatmentPlanId: planId,
      receiptNumber: o.receipt,
      totalAmount: o.amount,
      paidAmount: o.amount,
      paymentMethod: 'cash',
      type: o.type,
      status: 'completed',
      createdAt: new Date(o.at),
    })
    .returning({ id: cashierTransactions.id });

const inTenantTx = (fn: (tx: DbOrTx, c: Context) => Promise<void>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await fn(tx, ctx(tx, tenantId, ownerId));
  });

describe('FX-18 — finalizeRun stale snapshot', () => {
  test("draft'dan keyin davr ichida to'lov qo'shilsa finalize stale_snapshot, run draft qoladi", async () => {
    await inTenantTx(async (tx, c) => {
      await insertTx(tx, {
        receipt: 'FX18-A1',
        type: 'payment',
        amount: '1000000',
        at: '2026-03-10T10:00:00+05:00',
      });
      const run = await payrollService.createRun(c, {
        periodFrom: '2026-03-01',
        periodTo: '2026-03-31',
      });
      expect(Number(run.lines.find((l) => l.userId === doctorId)?.commissionAmount)).toBe(100000);

      // snapshotdan KEYIN, davr ichida yozilgan yangi to'lov
      await insertTx(tx, {
        receipt: 'FX18-A2',
        type: 'payment',
        amount: '500000',
        at: '2026-03-20T10:00:00+05:00',
      });

      const res = await payrollService.finalizeRun(c, run.id);
      expect(res.error).toBe('stale_snapshot');
      expect(res.run).toBeNull();
      const [after] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, run.id));
      expect(after?.status).toBe('draft');

      // Yechim: draft o'chiriladi, qayta yaratiladi → yangi snapshot 150000, finalize OK
      expect((await payrollService.deleteRun(c, run.id)).ok).toBe(true);
      const run2 = await payrollService.createRun(c, {
        periodFrom: '2026-03-01',
        periodTo: '2026-03-31',
      });
      expect(Number(run2.lines.find((l) => l.userId === doctorId)?.commissionAmount)).toBe(150000);
      const fin = await payrollService.finalizeRun(c, run2.id);
      expect(fin.error).toBeNull();
      expect(fin.run?.status).toBe('finalized');
    });
  });

  test("draft'dan keyin davr ichidagi to'lov refund qilinsa (adjustment yo'q) finalize stale_snapshot", async () => {
    await inTenantTx(async (tx, c) => {
      await insertTx(tx, {
        receipt: 'FX18-B1',
        type: 'payment',
        amount: '1000000',
        at: '2026-04-10T10:00:00+05:00',
      });
      const run = await payrollService.createRun(c, {
        periodFrom: '2026-04-01',
        periodTo: '2026-04-30',
      });
      expect(Number(run.lines.find((l) => l.userId === doctorId)?.commissionAmount)).toBe(100000);

      await insertTx(tx, {
        receipt: 'FX18-B2',
        type: 'refund',
        amount: '1000000',
        at: '2026-04-30T17:00:00+05:00',
      });

      const res = await payrollService.finalizeRun(c, run.id);
      expect(res.error).toBe('stale_snapshot');
      const [after] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, run.id));
      expect(after?.status).toBe('draft');
    });
  });

  test("o'zgarish bo'lmasa finalize odatdagidek o'tadi (0-daromad profil ham)", async () => {
    await inTenantTx(async (tx, c) => {
      await insertTx(tx, {
        receipt: 'FX18-C1',
        type: 'payment',
        amount: '1000000',
        at: '2026-05-10T10:00:00+05:00',
      });
      const run = await payrollService.createRun(c, {
        periodFrom: '2026-05-01',
        periodTo: '2026-05-31',
      });
      const fin = await payrollService.finalizeRun(c, run.id);
      expect(fin.error).toBeNull();
      expect(fin.run?.status).toBe('finalized');
    });
  });
});
