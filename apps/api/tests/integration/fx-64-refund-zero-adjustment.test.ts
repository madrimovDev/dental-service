/**
 * FX-64 — finalized run'da doktor qatori bo'lmasa refund keyingi davr daromadidan ayirilmasin.
 * REAL DB + real service'lar (cashier.refund -> payroll.recordRefundAdjustment -> createRun).
 *
 * Stsenariy: doktor D Yanvarda profilsiz (finalized run'da qatori YO'Q), uning rejasiga Yanvarda
 * to'lov qilingan. Fevralda D profil oladi (10%). Yanvar to'lovi Fevralda refund qilinadi.
 * Komissiya Yanvarda hech qachon to'lanmagan -> Fevral daromadidan ham ayirilmasligi kerak.
 * Tuzatishdan oldin: adjustment yozilmaydi, refund Fevral netting'iga tushadi (revenue < 0).
 *
 * Ishga tushirish: cd apps/api && bun test tests/integration/fx-64-refund-zero-adjustment.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  cashierTransactions,
  patients,
  payrollAdjustments,
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
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';
import { createPayrollService } from '../../src/modules/payroll/payroll.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const payrollService = createPayrollService({ audit: noopAudit });
const cashier = createCashierService({ audit: noopAudit, payrollAdjustment: payrollService });

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
let otherDoctorId: string;
let branchId: string;
let patientId: string;
let planId: string;

const inTenant = <T>(fn: (tx: DbOrTx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx as unknown as DbOrTx);
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string, name: string) => {
    const [u] = await db
      .insert(users)
      .values({ phone, passwordHash: 'fake', fullName: name })
      .returning({ id: users.id });
    return u!.id;
  };
  ownerId = await mk('+998900064001', 'Owner FX64');
  doctorId = await mk('+998900064002', 'Doctor FX64');
  otherDoctorId = await mk('+998900064003', 'Other FX64');
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX-64', slug: 'fx-64', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await inTenant(async (tx) => {
    const [b] = await tx.insert(branches).values({ tenantId, name: 'B' }).returning();
    branchId = b!.id;
    // Yanvar run'ida faqat otherDoctor qatori bor (doctorId profilsiz).
    await tx.insert(staffProfiles).values({
      tenantId,
      userId: otherDoctorId,
      employmentStatus: 'active',
      baseSalary: '100000',
      commissionPercent: '10',
    });
    const [p] = await tx.insert(patients).values({ tenantId, fullName: 'P' }).returning();
    patientId = p!.id;
    const [pl] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId, title: 'Plan', status: 'in_progress' })
      .returning();
    planId = pl!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-64: doktor qatori yo`q finalized run + keyingi davr refund', () => {
  test('0 summali adjustment yoziladi va refund Fevral daromadidan ayirilmaydi', async () => {
    let janTxId = '';
    await inTenant(async (tx) => {
      const [t1] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId,
          branchId,
          patientId,
          treatmentPlanId: planId,
          totalAmount: '1000000',
          paidAmount: '1000000',
          paymentMethod: 'cash',
          type: 'payment',
          status: 'completed',
          createdAt: new Date('2026-01-10T10:00:00+05:00'),
        })
        .returning({ id: cashierTransactions.id });
      janTxId = t1!.id;
      const c = ctx(tx, tenantId, ownerId);
      const jan = await payrollService.createRun(c, {
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
      });
      expect(jan.lines.find((l) => l.userId === doctorId)).toBeUndefined();
      await payrollService.finalizeRun(c, jan.id);
    });

    // Fevralda doktor profil oladi.
    await inTenant(async (tx) => {
      await tx.insert(staffProfiles).values({
        tenantId,
        userId: doctorId,
        employmentStatus: 'active',
        baseSalary: '0',
        commissionPercent: '10',
      });
    });

    await inTenant(async (tx) => {
      const c = ctx(tx, tenantId, ownerId);
      const r = await cashier.refund(c, janTxId, 500000);
      expect(r.ok).toBe(true);
      const refundId = r.ok ? r.refund.id : '';
      await tx
        .update(cashierTransactions)
        .set({ createdAt: new Date('2026-02-15T10:00:00+05:00') })
        .where(eq(cashierTransactions.id, refundId));

      const adj = await tx
        .select()
        .from(payrollAdjustments)
        .where(eq(payrollAdjustments.sourceTransactionId, refundId));
      expect(adj).toHaveLength(1);
      expect(Number(adj[0]?.amount)).toBe(0);
      expect(adj[0]?.doctorId).toBe(doctorId);

      const feb = await payrollService.createRun(c, {
        periodFrom: '2026-02-01',
        periodTo: '2026-02-28',
      });
      const line = feb.lines.find((l) => l.userId === doctorId);
      expect(Number(line?.attributedRevenue ?? 0)).toBe(0);
    });
  });
});
