/**
 * UI-M6 Xarajat va ish haqi — REAL HTTP + REAL DB + REAL rol permset (@owner EMAS).
 *
 *  - P&L: sof foyda = tushum (refund ayirilgan) − xarajat − ish haqi.
 *  - branchId filtri: xarajat/tushum shu filial; ish haqi filialga bog'lanmagan → null + payrollIncluded=false.
 *  - Ruxsat: Accountant/Branch Manager 200, Doctor (report.view yo'q) 403.
 *  - Payroll tuzatish sababi: run'ga singdirilgan refund-clawback (`/payroll/runs/:id/adjustments`).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env ui-m6-pnl`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  branches,
  cashierTransactions,
  expenses,
  payrollAdjustments,
  payrollLines,
  payrollRuns,
  tenants,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const permsFor = (k: string): string[] => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === k);
  if (!t) throw new Error(`template ${k}`);
  return [...t.permissions];
};

let tenantId: string;
let branchA: string;
let branchB: string;
let doctorId: string;
let accountantToken: string;
let managerToken: string;
let doctorToken: string;
let finalizedRunId: string;
let refundTxId: string;

const tokenFor = async (sub: string, perms: string[], roleKey: string) =>
  (await signAccess({ sub, atid: tenantId, abid: null, perms, roleKey, lang: 'uz' })).token;

const get = (path: string, token: string) =>
  createApp().request(path, { headers: { authorization: `Bearer ${token}` } });

const withTenant = <T>(
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

type Pnl = {
  revenue: number;
  expenses: number;
  payroll: number | null;
  payrollFinalized: number | null;
  payrollDraft: number | null;
  payrollIncluded: boolean;
  netProfit: number;
};
const pnl = async (token: string, qs: string) => {
  const res = await get(`/api/reports/pnl?${qs}`, token);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: Pnl }).data;
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const ins = await db
    .insert(users)
    .values([
      { phone: '+998900006601', passwordHash: 'x', fullName: 'Owner M6' },
      { phone: '+998900006602', passwordHash: 'x', fullName: 'Doctor M6' },
      { phone: '+998900006603', passwordHash: 'x', fullName: 'Accountant M6' },
      { phone: '+998900006604', passwordHash: 'x', fullName: 'Manager M6' },
    ])
    .returning({ id: users.id });
  const [owner, doctor, accountant, manager] = ins;
  if (!owner || !doctor || !accountant || !manager) throw new Error('users');
  doctorId = doctor.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'M6', slug: 'ui-m6', ownerUserId: owner.id })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  await withTenant(async (tx) => {
    const [a] = await tx.insert(branches).values({ tenantId, name: 'A' }).returning();
    const [b] = await tx.insert(branches).values({ tenantId, name: 'B' }).returning();
    branchA = a!.id;
    branchB = b!.id;
    const pay = (
      branchId: string,
      amt: string,
      type: 'payment' | 'refund',
      day: string,
      receipt: string,
    ) =>
      tx
        .insert(cashierTransactions)
        .values({
          tenantId,
          branchId,
          totalAmount: amt,
          paidAmount: amt,
          paymentMethod: 'cash',
          type,
          status: 'completed',
          receiptNumber: receipt,
          createdAt: new Date(`${day}T10:00:00+05:00`),
        })
        .returning({ id: cashierTransactions.id });
    await pay(branchA, '1000000', 'payment', '2026-03-10', 'R-A1');
    await pay(branchB, '400000', 'payment', '2026-03-11', 'R-B1');
    const [refund] = await pay(branchA, '100000', 'refund', '2026-03-12', 'R-A2');
    refundTxId = refund!.id;
    // Davrdan tashqari — hisobga kirmaydi.
    await pay(branchA, '9999999', 'payment', '2026-04-05', 'R-A3');

    await tx.insert(expenses).values([
      { tenantId, branchId: branchA, amount: '200000', date: '2026-03-15' },
      { tenantId, branchId: branchB, amount: '50000', date: '2026-03-16' },
      { tenantId, branchId: null, amount: '30000', date: '2026-03-17' },
      { tenantId, branchId: branchA, amount: '7777777', date: '2026-04-01' },
    ]);

    const [fin] = await tx
      .insert(payrollRuns)
      .values({ tenantId, periodFrom: '2026-03-01', periodTo: '2026-03-31', status: 'finalized' })
      .returning({ id: payrollRuns.id });
    finalizedRunId = fin!.id;
    await tx.insert(payrollLines).values({
      tenantId,
      runId: finalizedRunId,
      userId: doctorId,
      baseSalary: '100000',
      attributedRevenue: '800000',
      commissionPercent: '10',
      commissionAmount: '80000',
      total: '180000',
    });
    // Boshqa oy (Aprel) draft — mart P&L'ga kirmaydi.
    const [draft] = await tx
      .insert(payrollRuns)
      .values({ tenantId, periodFrom: '2026-04-01', periodTo: '2026-04-30', status: 'draft' })
      .returning({ id: payrollRuns.id });
    await tx.insert(payrollLines).values({
      tenantId,
      runId: draft!.id,
      userId: doctorId,
      baseSalary: '55555',
      attributedRevenue: '0',
      commissionPercent: '10',
      commissionAmount: '0',
      total: '55555',
    });
    await tx.insert(payrollAdjustments).values({
      tenantId,
      branchId: branchA,
      doctorId,
      sourceTransactionId: refund!.id,
      amount: '-10000',
      appliedToRunId: finalizedRunId,
    });
  });

  accountantToken = await tokenFor(accountant.id, permsFor('accountant'), 'accountant');
  managerToken = await tokenFor(manager.id, permsFor('branch_manager'), 'branch_manager');
  doctorToken = await tokenFor(doctor.id, permsFor('doctor'), 'doctor');
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('UI-M6 P&L', () => {
  test('rol sanity: Doctor report.view yo‘q', () => {
    expect(permsFor('doctor')).not.toContain('report.view');
    expect(permsFor('accountant')).toContain('report.view');
  });

  test('sof foyda = tushum (refund ayirilgan) − xarajat − ish haqi', async () => {
    const r = await pnl(accountantToken, 'from=2026-03-01&to=2026-03-31');
    // tushum 1 000 000 + 400 000 − 100 000 refund = 1 300 000
    expect(r.revenue).toBe(1_300_000);
    // xarajat 200 000 + 50 000 + 30 000
    expect(r.expenses).toBe(280_000);
    expect(r.payrollFinalized).toBe(180_000);
    expect(r.payrollDraft).toBe(0);
    expect(r.payroll).toBe(180_000);
    expect(r.payrollIncluded).toBe(true);
    expect(r.netProfit).toBe(1_300_000 - 280_000 - 180_000);
  });

  test('draft run ham ish haqiga kiradi (qoralama), davr bo‘yicha ajratiladi', async () => {
    const r = await pnl(managerToken, 'from=2026-04-01&to=2026-04-30');
    expect(r.revenue).toBe(9_999_999);
    expect(r.expenses).toBe(7_777_777);
    expect(r.payrollFinalized).toBe(0);
    expect(r.payrollDraft).toBe(55_555);
    expect(r.netProfit).toBe(9_999_999 - 7_777_777 - 55_555);
  });

  test('bo‘sh davr → hammasi 0, bo‘linish/NaN yo‘q', async () => {
    const r = await pnl(accountantToken, 'from=2025-01-01&to=2025-01-31');
    expect(r).toMatchObject({ revenue: 0, expenses: 0, payroll: 0, netProfit: 0 });
  });

  test('branchId: shu filial tushumi/xarajati; ish haqi null, payrollIncluded=false', async () => {
    const a = await pnl(accountantToken, `from=2026-03-01&to=2026-03-31&branchId=${branchA}`);
    expect(a.revenue).toBe(900_000);
    expect(a.expenses).toBe(200_000);
    expect(a.payroll).toBeNull();
    expect(a.payrollIncluded).toBe(false);
    expect(a.netProfit).toBe(700_000);
    const b = await pnl(accountantToken, `from=2026-03-01&to=2026-03-31&branchId=${branchB}`);
    expect(b.revenue).toBe(400_000);
    expect(b.expenses).toBe(50_000);
  });

  test('Doctor (report.view yo‘q) → 403; token yo‘q → 401', async () => {
    expect((await get('/api/reports/pnl?from=2026-03-01&to=2026-03-31', doctorToken)).status).toBe(
      403,
    );
    expect(
      (await createApp().request('/api/reports/pnl?from=2026-03-01&to=2026-03-31')).status,
    ).toBe(401);
  });
});

describe('UI-M6 payroll tuzatish sababi', () => {
  test('/payroll/runs/:id/adjustments — singdirilgan refund-clawback + manba chek', async () => {
    const res = await get(`/api/payroll/runs/${finalizedRunId}/adjustments`, accountantToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{
        userId: string;
        amount: string;
        reason: string;
        sourceReceiptNumber: string | null;
        sourceTransactionId: string;
      }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      userId: doctorId,
      reason: 'refund_clawback',
      sourceReceiptNumber: 'R-A2',
      sourceTransactionId: refundTxId,
    });
    expect(Number(body.data[0]?.amount)).toBe(-10000);
  });

  test('payroll.view yo‘q rol (Doctor) → 403', async () => {
    expect((await get(`/api/payroll/runs/${finalizedRunId}/adjustments`, doctorToken)).status).toBe(
      403,
    );
  });
});
