/**
 * CLI-417 integration test — payroll ustma-ust/takroriy run guard (service + DB EXCLUDE),
 * davr o'rtasida ketgan (inactive, lekin daromadli) doktor snapshot'i, va draft o'chirish.
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration + RLS DDL apply qilingan
 * (jumladan 0030_payroll_run_no_overlap.sql — btree_gist EXCLUDE constraint).
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-417`
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
import {
  createPayrollService,
  PayrollOverlapError,
} from '../../src/modules/payroll/payroll.service.ts';

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

let tenantId: string;
let ownerId: string;
let leaverDoctorId: string;
let branchId: string;
let planId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000050', passwordHash: 'fake', fullName: 'Owner CLI417' })
    .returning({ id: users.id });
  const [leaver] = await db
    .insert(users)
    .values({ phone: '+998900000051', passwordHash: 'fake', fullName: 'Leaver Doctor CLI417' })
    .returning({ id: users.id });
  if (!owner || !leaver) throw new Error('user insert failed');
  ownerId = owner.id;
  leaverDoctorId = leaver.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI-417 Clinic', slug: 'cli-417-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'CLI-417 Branch' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');
    branchId = branch.id;

    // T3: davr o'rtasida ishdan bo'shatilgan doktor — hozir 'inactive'.
    await tx.insert(staffProfiles).values({
      tenantId,
      userId: leaverDoctorId,
      employmentStatus: 'inactive',
      baseSalary: '400000',
      commissionPercent: '15',
    });

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'CLI-417 Patient' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({
        tenantId,
        patientId: patient.id,
        doctorId: leaverDoctorId,
        title: 'CLI-417 Plan',
        status: 'in_progress',
      })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');
    planId = plan.id;

    // Doktor davr ichida daromad keltirgan (2026-04-10), keyin employmentStatus='inactive'
    // bo'lgan (yuqorida allaqachon shunday seed qilingan — real oqimda tartib teskari
    // bo'lardi, lekin snapshot faqat joriy staff_profiles holatini o'qiydi). Aprel — T1
    // (May) bilan kesishmasin (har test DISTINCT davr, CLI-417 overlap guard).
    await tx.insert(cashierTransactions).values({
      tenantId,
      branchId,
      patientId: patient.id,
      treatmentPlanId: planId,
      totalAmount: '2000000',
      paidAmount: '2000000',
      paymentMethod: 'cash',
      type: 'payment',
      status: 'completed',
      createdAt: new Date('2026-04-10T10:00:00+05:00'),
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-417 — payroll overlap/duplicate guard', () => {
  test('T1: ayni davrga ikkinchi createRun — overlap xatosi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.createRun(ctx(tx, tenantId, ownerId), {
        periodFrom: '2026-05-01',
        periodTo: '2026-05-31',
      });

      await expect(
        service.createRun(ctx(tx, tenantId, ownerId), {
          periodFrom: '2026-05-01',
          periodTo: '2026-05-31',
        }),
      ).rejects.toBeInstanceOf(PayrollOverlapError);

      // Kesishuvchi (lekin aynan bir xil emas) davr ham rad etiladi.
      await expect(
        service.createRun(ctx(tx, tenantId, ownerId), {
          periodFrom: '2026-05-15',
          periodTo: '2026-06-15',
        }),
      ).rejects.toBeInstanceOf(PayrollOverlapError);
    });
  });

  test('T3: davr ichida daromad keltirgan inactive doktor — payroll_lines qatorida', async () => {
    // 09-oyda to'lov yo'q → 0 line (guard/regressiya tekshiruvi, T1'ning May davri bilan
    // kesishmaydi).
    const emptyRun = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.createRun(ctx(tx, tenantId, ownerId), {
        periodFrom: '2026-09-01',
        periodTo: '2026-09-30',
      });
    });
    expect(emptyRun.status).toBe('draft');

    // Aprel — daromad keltirilgan davr (T1'ning May davri bilan kesishmaydi).
    const aprilRun = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.createRun(ctx(tx, tenantId, ownerId), {
        periodFrom: '2026-04-01',
        periodTo: '2026-04-30',
      });
    });

    const leaverLine = aprilRun.lines.find((l) => l.userId === leaverDoctorId);
    expect(leaverLine).toBeDefined();
    expect(Number(leaverLine?.attributedRevenue)).toBe(2000000);
    expect(Number(leaverLine?.commissionAmount)).toBe(300000); // 2,000,000 × 15%
    expect(Number(leaverLine?.total)).toBe(700000); // base 400000 + commission 300000
  });

  test('T5: draft run DELETE — o‘chadi, keyin xuddi shu davrga yangi run yaratish mumkin', async () => {
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.createRun(ctx(tx, tenantId, ownerId), {
        periodFrom: '2026-11-01',
        periodTo: '2026-11-30',
      });
    });

    const deleted = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.deleteRun(ctx(tx, tenantId, ownerId), created.id);
    });
    expect(deleted.ok).toBe(true);

    // Deadlock yechimi: xuddi shu davrga yangi run yaratish mumkin bo'lishi kerak.
    const recreated = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.createRun(ctx(tx, tenantId, ownerId), {
        periodFrom: '2026-11-01',
        periodTo: '2026-11-30',
      });
    });
    expect(recreated.status).toBe('draft');

    // Finalized run'ni delete — not_draft.
    const finalized = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.finalizeRun(ctx(tx, tenantId, ownerId), recreated.id);
    });
    expect(finalized.run?.status).toBe('finalized');

    const deleteFinalized = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.deleteRun(ctx(tx, tenantId, ownerId), recreated.id);
    });
    expect(deleteFinalized.ok).toBe(false);
    expect(deleteFinalized.error).toBe('not_draft');
  });

  test('T6: tutashuvchi davrlar (bir-biriga ulangan, kesishmaydigan) — ikkalasi ham yaratiladi', async () => {
    const first = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.createRun(ctx(tx, tenantId, ownerId), {
        periodFrom: '2026-12-01',
        periodTo: '2026-12-31',
      });
    });
    expect(first.status).toBe('draft');

    const second = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.createRun(ctx(tx, tenantId, ownerId), {
        periodFrom: '2027-01-01',
        periodTo: '2027-01-31',
      });
    });
    expect(second.status).toBe('draft');
  });
});
