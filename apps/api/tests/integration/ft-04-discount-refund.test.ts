/**
 * FT-04.4 💰 — chegirmali to'lovlar refund'i (CLINIC-FEEDBACK §7/6/8 «pul xavflari»):
 *
 *  - Erkin POS chegirmasi: refund chegarasi NETTO `paidAmount` (brutto emas); qisman refund
 *    non-plan'da taqiqlangan; to'liq refund qarzni bekor qiladi.
 *  - Doimiy chegirmali reja bosqichlari (cost = netto snapshot): qisman refund allocation'larni
 *    PROPORSIONAL negatsiya qiladi, reja qarzi netto bo'yicha tiklanadi, cumulative guard.
 *
 * REAL DB + REAL HTTP (createApp) + real `user_assignments` + REAL cheklangan rollar
 * (Receptionist / Doctor / Accountant shablon permset'lari, `@owner` EMAS).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/ft-04-discount-refund.test.ts
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  branches,
  cashierTransactions,
  patients,
  permissions,
  rolePermissions,
  roles,
  servicePrices,
  services,
  tenants,
  treatmentPlans,
  treatmentStagePayments,
  treatmentStages,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const tpl = (key: string) =>
  [...(ROLE_TEMPLATES.find((t) => t.templateKey === key)?.permissions ?? [])] as string[];
const RECEPTION_PERMS = tpl('receptionist');
const DOCTOR_PERMS = tpl('doctor');
const ACCOUNTANT_PERMS = tpl('accountant');

const app = createApp();

let tenantId: string;
let branchId: string;
let svcId: string;
let doctorUserId: string;
const tok: Record<string, string> = {};

// biome-ignore lint/suspicious/noExplicitAny: test javob shakli
type Res = { status: number; json: any };
const call = async (who: string, method: 'GET' | 'POST', path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.76.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) } as Res;
};

const inTenant = <T>(fn: (tx: typeof db) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx as unknown as typeof db);
  });

const newPatient = async (name: string, pct: string | null) =>
  inTenant(async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: name, defaultDiscountPercent: pct })
      .returning({ id: patients.id });
    return p!.id;
  });

const balance = async (pid: string) => {
  const r = await call('reception', 'GET', `/api/patients/${pid}/balance`);
  expect(r.status).toBe(200);
  return r.json.data as { planDebt: number; nonPlanBalance: number; balance: number };
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  const owner = await mk('+998900075501');
  const reception = await mk('+998900075502');
  doctorUserId = await mk('+998900075503');
  const accountant = await mk('+998900075504');

  for (const code of new Set([...RECEPTION_PERMS, ...DOCTOR_PERMS, ...ACCOUNTANT_PERMS])) {
    await db
      .insert(permissions)
      .values({ code, category: code.split('.')[0] ?? 'x' })
      .onConflictDoNothing();
  }
  const permIds = async (codes: string[]) =>
    db.select({ id: permissions.id }).from(permissions).where(inArray(permissions.code, codes));

  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FT04 Refund', slug: 'ft-04-refund', ownerUserId: owner })
      .returning({ id: tenants.id })
  )[0]!.id;

  await inTenant(async (tx) => {
    const [br] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Asosiy' })
      .returning({ id: branches.id });
    branchId = br!.id;
    const mkRole = async (name: string, key: string, perms: string[]) => {
      const [r] = await tx
        .insert(roles)
        .values({ tenantId, name, isSystem: true, templateKey: key })
        .returning({ id: roles.id });
      await tx
        .insert(rolePermissions)
        .values((await permIds(perms)).map((p) => ({ roleId: r!.id, permissionId: p.id })));
      return r!.id;
    };
    const recRole = await mkRole('Receptionist', 'receptionist', RECEPTION_PERMS);
    const docRole = await mkRole('Doctor', 'doctor', DOCTOR_PERMS);
    const accRole = await mkRole('Accountant', 'accountant', ACCOUNTANT_PERMS);
    await tx.insert(userAssignments).values([
      { tenantId, userId: reception, branchId, roleId: recRole },
      { tenantId, userId: doctorUserId, branchId, roleId: docRole },
      { tenantId, userId: accountant, branchId, roleId: accRole },
    ]);
    const [svc] = await tx
      .insert(services)
      .values({ tenantId, code: 'FT044-R', nameUz: 'Plomba' })
      .returning({ id: services.id });
    svcId = svc!.id;
    await tx.insert(servicePrices).values({ serviceId: svcId, branchId, price: '200000' });
  });

  const sign = async (userId: string, perms: string[]) =>
    (
      await signAccess({
        sub: userId,
        atid: tenantId,
        abid: branchId,
        perms,
        roleKey: null,
        lang: 'uz',
      })
    ).token;
  expect(RECEPTION_PERMS).toContain('discount.give');
  expect(ACCOUNTANT_PERMS).toContain('cashier.refund');
  expect(ACCOUNTANT_PERMS).not.toContain('discount.give');
  expect(RECEPTION_PERMS).not.toContain('cashier.refund');
  tok.reception = await sign(reception, RECEPTION_PERMS);
  tok.doctor = await sign(doctorUserId, DOCTOR_PERMS);
  tok.accountant = await sign(accountant, ACCOUNTANT_PERMS);
});

describe('FT-04.4 — erkin POS chegirmasi refund: netto paidAmount chegarasi', () => {
  let pid: string;
  let txId: string;

  test("Receptionist: 200 000 − 20 000 chegirma, 100 000 to'landi → qarz netto 80 000", async () => {
    pid = await newPatient('Bemor POS', null);
    const r = await call('reception', 'POST', '/api/cashier/transactions', {
      branchId,
      patientId: pid,
      items: [{ serviceId: svcId, quantity: 1, unitPrice: 1, serviceName: 'Plomba' }],
      discount: 20_000,
      discountReason: 'Doimiy mijoz',
      paidAmount: 100_000,
      paymentMethod: 'cash',
    });
    expect(r.status).toBe(201);
    txId = r.json.data.id;
    expect(Number(r.json.data.totalAmount)).toBe(180_000);
    expect((await balance(pid)).nonPlanBalance).toBe(80_000);
  });

  test("Receptionist (cashier.refund'siz) → 403", async () => {
    const r = await call('reception', 'POST', `/api/cashier/transactions/${txId}/refund`, {});
    expect(r.status).toBe(403);
  });

  test('Accountant: qisman refund (non-plan) → 400 refund.non_plan_partial', async () => {
    const r = await call('accountant', 'POST', `/api/cashier/transactions/${txId}/refund`, {
      amount: 50_000,
    });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('refund.non_plan_partial');
  });

  test("Accountant: brutto/totalAmount bo'yicha refund (180 000) → 400 over_refund", async () => {
    const r = await call('accountant', 'POST', `/api/cashier/transactions/${txId}/refund`, {
      amount: 180_000,
    });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('refund.over_refund');
  });

  test("Accountant: to'liq refund = aynan to'langan netto 100 000; qarz bekor; ikkinchisi 400", async () => {
    const r = await call('accountant', 'POST', `/api/cashier/transactions/${txId}/refund`, {});
    expect(r.status).toBe(200);
    expect(Number(r.json.data.paidAmount)).toBe(100_000);
    expect(r.json.data.type).toBe('refund');
    expect((await balance(pid)).nonPlanBalance).toBe(0);
    const again = await call('accountant', 'POST', `/api/cashier/transactions/${txId}/refund`, {});
    expect(again.status).toBe(400);
    const refunds = await inTenant((tx) =>
      tx
        .select({ paid: cashierTransactions.paidAmount })
        .from(cashierTransactions)
        .where(eq(cashierTransactions.parentTransactionId, txId)),
    );
    expect(refunds).toEqual([{ paid: '100000.00' }]);
  });
});

describe('FT-04.4 — doimiy chegirmali reja bosqichlari: proporsional refund, qarz netto', () => {
  let pid: string;
  let planId: string;
  let stageIds: string[];
  let payTxId: string;

  const allocationsOf = (txIds: string[]) =>
    inTenant((tx) =>
      tx
        .select({
          tx: treatmentStagePayments.transactionId,
          stageId: treatmentStagePayments.stageId,
          amount: treatmentStagePayments.amount,
        })
        .from(treatmentStagePayments)
        .where(inArray(treatmentStagePayments.transactionId, txIds)),
    );

  test('Doktor: bemor 10% → bosqichlar 180 000 + 50 000 netto; qabul → qarz 230 000', async () => {
    pid = await newPatient('Bemor Reja', '10');
    const r = await call('doctor', 'POST', '/api/treatment-plans', {
      patientId: pid,
      doctorId: doctorUserId,
      title: 'Reja FT-04.4',
      stages: [
        { serviceId: svcId, serviceName: 'Plomba', cost: 1, estimatedVisits: 1 },
        { serviceName: 'Erkin ish', cost: 55_555, estimatedVisits: 1 },
      ],
    });
    expect(r.status).toBe(201);
    planId = r.json.data.id;
    stageIds = r.json.data.stages.map((s: { id: string }) => s.id);
    expect(r.json.data.stages.map((s: { cost: string }) => s.cost)).toEqual([
      '180000.00',
      '50000.00',
    ]);
    await inTenant(async (tx) => {
      await tx
        .update(treatmentPlans)
        .set({ status: 'accepted' })
        .where(eq(treatmentPlans.id, planId));
      await tx
        .update(treatmentStages)
        .set({ acceptance: 'accepted' })
        .where(eq(treatmentStages.treatmentPlanId, planId));
    });
    expect((await balance(pid)).planDebt).toBe(230_000);
  });

  test("Receptionist: brutto (200 000) allocation netto cost'dan oshadi → 400, yozuv yo'q", async () => {
    const r = await call('reception', 'POST', '/api/cashier/transactions', {
      branchId,
      patientId: pid,
      items: [],
      discount: 0,
      paidAmount: 200_000,
      paymentMethod: 'cash',
      allocations: [{ stageId: stageIds[0], amount: 200_000 }],
    });
    expect(r.status).toBe(400);
    const rows = await inTenant((tx) =>
      tx
        .select({ id: treatmentStagePayments.id })
        .from(treatmentStagePayments)
        .where(inArray(treatmentStagePayments.stageId, stageIds)),
    );
    expect(rows).toHaveLength(0);
    expect((await balance(pid)).planDebt).toBe(230_000);
  });

  test("Receptionist: to'liq netto 230 000 to'lov → qarz 0", async () => {
    const r = await call('reception', 'POST', '/api/cashier/transactions', {
      branchId,
      patientId: pid,
      items: [],
      discount: 0,
      paidAmount: 230_000,
      paymentMethod: 'cash',
      allocations: [
        { stageId: stageIds[0], amount: 180_000 },
        { stageId: stageIds[1], amount: 50_000 },
      ],
    });
    expect(r.status).toBe(201);
    payTxId = r.json.data.id;
    expect((await balance(pid)).planDebt).toBe(0);
  });

  let refund1: string;
  test('Accountant: qisman refund 115 000 → bosqichlarga proporsional −90 000 / −25 000, qarz 115 000', async () => {
    const r = await call('accountant', 'POST', `/api/cashier/transactions/${payTxId}/refund`, {
      amount: 115_000,
    });
    expect(r.status).toBe(200);
    refund1 = r.json.data.id;
    const neg = await allocationsOf([refund1]);
    const byStage = Object.fromEntries(neg.map((n) => [n.stageId, n.amount]));
    expect(byStage[stageIds[0]!]).toBe('-90000.00');
    expect(byStage[stageIds[1]!]).toBe('-25000.00');
    expect((await balance(pid)).planDebt).toBe(115_000);
  });

  test("Accountant: noqulay qisman refund 33 333 → Σ negatsiya aynan 33 333, har bosqich ≤ o'z to'lovi", async () => {
    const r = await call('accountant', 'POST', `/api/cashier/transactions/${payTxId}/refund`, {
      amount: 33_333,
    });
    expect(r.status).toBe(200);
    const neg = await allocationsOf([r.json.data.id]);
    const cents = neg.map((n) => Math.round(Number(n.amount) * 100));
    expect(cents.reduce((s, v) => s + v, 0)).toBe(-3_333_300);
    // 180/230 va 50/230 ulushlari: ≈ −26 086.70 va ≈ −7 246.30
    const byStage = Object.fromEntries(neg.map((n) => [n.stageId, Number(n.amount)]));
    expect(Math.abs(byStage[stageIds[0]!]! + 26_086.7)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(byStage[stageIds[1]!]! + 7_246.3)).toBeLessThanOrEqual(0.01);
    expect((await balance(pid)).planDebt).toBe(148_333);
  });

  test('Accountant: qoldiqdan ortiq refund → 400 over_refund; qolgani (81 667) → qarz netto 230 000', async () => {
    const over = await call('accountant', 'POST', `/api/cashier/transactions/${payTxId}/refund`, {
      amount: 81_668,
    });
    expect(over.status).toBe(400);
    expect(over.json.error.code).toBe('refund.over_refund');
    const rest = await call(
      'accountant',
      'POST',
      `/api/cashier/transactions/${payTxId}/refund`,
      {},
    );
    expect(rest.status).toBe(200);
    expect(Number(rest.json.data.paidAmount)).toBe(81_667);
    expect((await balance(pid)).planDebt).toBe(230_000);
    // Har bosqich bo'yicha Σ (to'lov + negatsiyalar) = 0 — phantom-credit yo'q.
    const all = await inTenant((tx) =>
      tx
        .select({ stageId: treatmentStagePayments.stageId, amount: treatmentStagePayments.amount })
        .from(treatmentStagePayments)
        .where(inArray(treatmentStagePayments.stageId, stageIds)),
    );
    for (const sid of stageIds) {
      const sum = all
        .filter((a) => a.stageId === sid)
        .reduce((s, a) => s + Math.round(Number(a.amount) * 100), 0);
      expect(sum).toBe(0);
    }
  });
});
