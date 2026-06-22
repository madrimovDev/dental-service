import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  cashierTransactionItems,
  cashierTransactions,
  patients,
  tenants,
  treatmentPlans,
  treatmentStages,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createReportsService } from '../../src/modules/reports/reports.service.ts';

const service = createReportsService();
const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db' ? tx : k === 'accessClaims' ? { perms: ['@owner'] } : undefined,
  }) as unknown as Context;

const RANGE = { from: '2026-06-01', to: '2026-06-30' };

let tenantId: string;
let ownerId: string;
let branchId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000020', passwordHash: 'x', fullName: 'Doc' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'R', slug: 'r-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    // Branch: 2026-06-01 = dushanba; mon ochiq 09:00–18:00 (540), shu sababli capacity aniqlanadi
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'B', workHours: { mon: { open: '09:00', close: '18:00' } } })
      .returning({ id: branches.id });
    branchId = branch!.id;

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'P' })
      .returning({ id: patients.id });
    const patientId = patient!.id;

    // Appointments (2026-06-01 dushanba): 1 completed (60 daq), 1 no_show (60 daq), 1 cancelled (60 daq)
    const day = '2026-06-01';
    await tx.insert(appointments).values([
      {
        tenantId,
        branchId,
        doctorId: ownerId,
        patientId,
        startTime: new Date(`${day}T09:00:00+05:00`),
        endTime: new Date(`${day}T10:00:00+05:00`),
        status: 'completed',
      },
      {
        tenantId,
        branchId,
        doctorId: ownerId,
        patientId,
        startTime: new Date(`${day}T10:00:00+05:00`),
        endTime: new Date(`${day}T11:00:00+05:00`),
        status: 'no_show',
      },
      {
        tenantId,
        branchId,
        doctorId: ownerId,
        patientId,
        startTime: new Date(`${day}T11:00:00+05:00`),
        endTime: new Date(`${day}T12:00:00+05:00`),
        status: 'cancelled',
      },
    ]);

    // Cashier: plansiz payment 100000 (item 'Tozalash' 100000); plan-linked payment 50000; refund 20000 (plansiz)
    const [plan] = await tx
      .insert(treatmentPlans)
      .values({
        tenantId,
        patientId,
        doctorId: ownerId,
        title: 'Pl',
        status: 'accepted',
        createdAt: new Date(`${day}T09:00:00+05:00`),
      })
      .returning({ id: treatmentPlans.id });
    await tx.insert(treatmentStages).values([
      {
        treatmentPlanId: plan!.id,
        sequence: 1,
        serviceName: 'S1',
        cost: '50000',
        status: 'completed',
      },
      {
        treatmentPlanId: plan!.id,
        sequence: 2,
        serviceName: 'S2',
        cost: '50000',
        status: 'pending',
      },
    ]);

    const [txItem] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId,
        patientId,
        totalAmount: '100000',
        paidAmount: '100000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdAt: new Date(`${day}T12:00:00+05:00`),
      })
      .returning({ id: cashierTransactions.id });
    await tx.insert(cashierTransactionItems).values({
      transactionId: txItem!.id,
      serviceName: 'Tozalash',
      quantity: 1,
      unitPrice: '100000',
      subtotal: '100000',
    });

    await tx.insert(cashierTransactions).values({
      tenantId,
      branchId,
      patientId,
      treatmentPlanId: plan!.id,
      totalAmount: '50000',
      paidAmount: '50000',
      paymentMethod: 'cash',
      type: 'payment',
      status: 'completed',
      createdAt: new Date(`${day}T12:30:00+05:00`),
    });
    await tx.insert(cashierTransactions).values({
      tenantId,
      branchId,
      patientId,
      totalAmount: '20000',
      paidAmount: '20000',
      paymentMethod: 'cash',
      type: 'refund',
      status: 'completed',
      createdAt: new Date(`${day}T13:00:00+05:00`),
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const run = <T>(fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx));
  });

describe('reports — real DB', () => {
  test('revenue: total = payment − refund; breakdown', async () => {
    const r = await run((c) => service.revenue(c, RANGE));
    expect(r.total).toBe(130000); // 100000 + 50000 − 20000
    expect(r.byService.find((s) => s.serviceName === 'Tozalash')?.total).toBe(100000);
    // byDoctor: plan-linked 50000 (ownerId) + plansiz (100000 − 20000 = 80000, doctorId null)
    expect(r.byDoctor.find((d) => d.doctorId === ownerId)?.total).toBe(50000);
    expect(r.byDoctor.find((d) => d.doctorId === null)?.total).toBe(80000);
  });

  test('appointmentStats: no-show va slot bandligi', async () => {
    const r = await run((c) => service.appointmentStats(c, RANGE));
    expect(r.total).toBe(3);
    expect(r.noShowRate).toBeCloseTo(1 / 3, 5);
    // booked = completed(60) + no_show(60) = 120 daq (cancelled chiqarilgan)
    // capacity = faqat 2026-06-01 (mon, 540) × 1 doktor = 540; iyun boshqa kunlari kalit yo'q → default 540 × 1 × 29 kun
    // util = 120 / (540 × 30 kun) — kichik son; faqat > 0 va < 1 ekanini tekshiramiz
    expect(r.slotUtilization).toBeGreaterThan(0);
    expect(r.slotUtilization).toBeLessThan(1);
  });

  test("doctorWorkload: doktor bo'yicha count", async () => {
    const r = await run((c) => service.doctorWorkload(c, RANGE));
    const row = r.find((d) => d.doctorId === ownerId);
    expect(row?.total).toBe(3);
    expect(row?.completed).toBe(1);
  });

  test('planCompletion: 1/2 completed', async () => {
    const r = await run((c) => service.planCompletion(c, RANGE));
    expect(r.totalStages).toBe(2);
    expect(r.completedStages).toBe(1);
    expect(r.rate).toBe(0.5);
  });

  test('oneCExport (V3-4): tranzaksiya qatorlari, refund manfiy', async () => {
    const rows = await run((c) => service.oneCExport(c, RANGE));
    expect(rows.length).toBeGreaterThan(0);
    // Setup'da plansiz refund 20000 bor → manfiy summa qatori bo'lishi kerak.
    const refundRow = rows.find((r) => r.type === 'refund');
    expect(refundRow).toBeDefined();
    expect(refundRow?.amount).toBeLessThan(0);
  });
});
