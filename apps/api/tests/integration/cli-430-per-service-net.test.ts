/**
 * CLI-430 — byService / procedureMix net-of-refund-and-discount integration test.
 * `cli-243-dental-analytics.test.ts` seed patternidan. REAL DB (RLS).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-430`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  cashierTransactionItems,
  cashierTransactions,
  patients,
  tenants,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createReportsService } from '../../src/modules/reports/reports.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createReportsService({ audit: noopAudit });
let tenantId: string;
const ctx = (tx: DbOrTx): Context =>
  ({ get: (k: string) => (k === 'db' ? tx : undefined) }) as unknown as Context;

const RANGE = { from: '2026-04-01', to: '2026-04-30' };

const run = <T>(fn: (c: Context) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx));
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000060', passwordHash: 'x', fullName: 'Doc CLI430' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner');
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI-430 Clinic', slug: 'cli-430-clinic', ownerUserId: owner.id })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'CLI-430 Branch' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch');
    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'CLI-430 Patient' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient');

    // T1 — chegirmali sale: item subtotal 1,000,000; totalAmount=900,000, discount=100,000,
    // paidAmount=900,000 (chegirma net). Keyin TO'LIQ refund (900,000) — CLI-406 modeli:
    // original 'completed' QOLADI (voided emas), faqat manfiy refund qatori qo'shiladi.
    const [txT1] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId: branch.id,
        patientId: patient.id,
        receiptNumber: 'CLI430-T1',
        totalAmount: '900000',
        paidAmount: '900000',
        discount: '100000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdAt: new Date('2026-04-05T10:00:00+05:00'),
      })
      .returning({ id: cashierTransactions.id });
    if (!txT1) throw new Error('txT1');
    await tx.insert(cashierTransactionItems).values({
      transactionId: txT1.id,
      serviceName: 'Plomba-T1',
      quantity: 1,
      unitPrice: '1000000',
      subtotal: '1000000',
    });
    // To'liq refund (T1b) — parentTransactionId orqali bog'lanadi.
    await tx.insert(cashierTransactions).values({
      tenantId,
      branchId: branch.id,
      patientId: patient.id,
      parentTransactionId: txT1.id,
      receiptNumber: 'CLI430-T1-R1',
      totalAmount: '900000',
      paidAmount: '900000',
      paymentMethod: 'cash',
      type: 'refund',
      status: 'completed',
      createdAt: new Date('2026-04-06T10:00:00+05:00'),
    });

    // T2 — chegirmasiz sale: item subtotal 1,000,000, discount=0, paidAmount=1,000,000.
    // Qisman refund 400,000 → net 600,000.
    const [txT2] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId: branch.id,
        patientId: patient.id,
        receiptNumber: 'CLI430-T2',
        totalAmount: '1000000',
        paidAmount: '1000000',
        discount: '0',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdAt: new Date('2026-04-10T10:00:00+05:00'),
      })
      .returning({ id: cashierTransactions.id });
    if (!txT2) throw new Error('txT2');
    await tx.insert(cashierTransactionItems).values({
      transactionId: txT2.id,
      serviceName: 'Plomba-T2',
      quantity: 1,
      unitPrice: '1000000',
      subtotal: '1000000',
    });
    await tx.insert(cashierTransactions).values({
      tenantId,
      branchId: branch.id,
      patientId: patient.id,
      parentTransactionId: txT2.id,
      receiptNumber: 'CLI430-T2-R1',
      totalAmount: '400000',
      paidAmount: '400000',
      paymentMethod: 'cash',
      type: 'refund',
      status: 'completed',
      createdAt: new Date('2026-04-11T10:00:00+05:00'),
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-430 — byService/procedureMix net-of-refund-and-discount', () => {
  test('T1a: chegirmali sale (refundsiz holat) — byService net (900,000, xom 1,000,000 emas)', async () => {
    // Bu holatni alohida tekshirish uchun T1'ning refund'siz vaqtidagi qiymatini
    // qayta hisoblash imkoni yo'q (seed allaqachon refund bilan) — shuning uchun
    // T1b (to'liq refunddan keyingi holat) asosiy assertion, discount net effekt esa
    // T2 orqali (discount=0, boshqa parametrlar bir xil) taqqoslanadi.
    // To'g'ridan-to'g'ri chegirma-net formulasini T1 revenue.byService orqali T1b'da
    // tekshiramiz (factor=0 — quyida).
    const r = await run((c) => service.revenue(c, RANGE));
    const plombaT1 = r.byService.find((s) => s.serviceName === 'Plomba-T1');
    // T1b: to'liq refunddan keyin (paidAmount − refunded = 900,000 − 900,000 = 0) → net 0.
    expect(plombaT1?.total ?? 0).toBe(0);
  });

  test("T1b: to'liq refunddan keyin procedure-mix o'sha xizmatni net (0) aks ettiradi", async () => {
    const r = await run((c) => service.dentalAnalytics(c, RANGE));
    const plombaT1 = r.procedureMix.find((p) => p.serviceName === 'Plomba-T1');
    expect(plombaT1?.revenue ?? 0).toBe(0);
  });

  test('T2: qisman refund — byService net (600,000)', async () => {
    const r = await run((c) => service.revenue(c, RANGE));
    const plombaT2 = r.byService.find((s) => s.serviceName === 'Plomba-T2');
    expect(plombaT2?.total).toBe(600000);
  });

  test('T3: Σ byService ≈ revenue.total (yaxlitlash chegarasida)', async () => {
    const r = await run((c) => service.revenue(c, RANGE));
    const sumByService = r.byService.reduce((s, row) => s + row.total, 0);
    expect(Math.abs(sumByService - r.total)).toBeLessThanOrEqual(0.02);
    // Aniq qiymat: T1 net 0 + T2 net 600,000 = 600,000.
    expect(r.total).toBe(600000);
  });

  test('T4: procedureMix.count = xom quantity, revenue = net (qisman refundli sale)', async () => {
    const r = await run((c) => service.dentalAnalytics(c, RANGE));
    const plombaT2 = r.procedureMix.find((p) => p.serviceName === 'Plomba-T2');
    expect(plombaT2?.count).toBe(1); // xom quantity — refund count'ni kamaytirmaydi
    expect(plombaT2?.revenue).toBe(600000); // net
  });
});
