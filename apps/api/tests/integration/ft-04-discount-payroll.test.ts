/**
 * FT-04.4 💰 (D-3) — payroll komissiya bazasi = `paidAmount` (NETTO): chegirma shifokor
 * komissiyasini kamaytiradi (Qaror #16, jim o'zgartirish yo'q).
 *
 *  - Reja yo'li: bemor doimiy chegirmasi (10%) → bosqich cost netto 180 000 → to'lov 180 000
 *    → komissiya 10% × 180 000 (brutto 200 000 emas).
 *  - Vizit yo'li (erkin POS, `visitNoteId`): Receptionist 20 000 chegirma bilan → 180 000.
 *  - Davr ichidagi qisman refund netto bo'yicha komissiyadan ayiriladi.
 *
 * REAL DB + REAL HTTP (createApp) + real `user_assignments` + REAL cheklangan rollar
 * (Receptionist / Doctor / Accountant shablon permset'lari, `@owner` EMAS).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/ft-04-discount-payroll.test.ts
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  branches,
  patients,
  permissions,
  rolePermissions,
  roles,
  servicePrices,
  services,
  staffProfiles,
  tenants,
  treatmentPlans,
  treatmentStages,
  userAssignments,
  users,
  visitNotes,
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
const call = async (
  who: string,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
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

/** Bugungi kun Asia/Tashkent (UTC+5) — payroll davri chegarasi bilan bir xil. */
const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

const runCommission = async () => {
  const r = await call('accountant', 'POST', '/api/payroll/runs', {
    periodFrom: today,
    periodTo: today,
  });
  expect(r.status).toBe(201);
  const line = r.json.data.lines.find((l: { userId: string }) => l.userId === doctorUserId);
  return {
    runId: r.json.data.id as string,
    revenue: Number(line?.attributedRevenue),
    commission: Number(line?.commissionAmount),
  };
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
  const owner = await mk('+998900075601');
  const reception = await mk('+998900075602');
  doctorUserId = await mk('+998900075603');
  const accountant = await mk('+998900075604');

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
      .values({ name: 'FT04 Payroll', slug: 'ft-04-payroll', ownerUserId: owner })
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
      { tenantId, userId: accountant, branchId: null, roleId: accRole },
    ]);
    await tx.insert(staffProfiles).values({
      tenantId,
      userId: doctorUserId,
      employmentStatus: 'active',
      baseSalary: '0',
      commissionPercent: '10',
    });
    const [svc] = await tx
      .insert(services)
      .values({ tenantId, code: 'FT044-P', nameUz: 'Plomba' })
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
  expect(ACCOUNTANT_PERMS).toContain('payroll.manage');
  expect(RECEPTION_PERMS).not.toContain('payroll.manage');
  tok.reception = await sign(reception, RECEPTION_PERMS);
  tok.doctor = await sign(doctorUserId, DOCTOR_PERMS);
  tok.accountant = await sign(accountant, ACCOUNTANT_PERMS);
});

describe('FT-04.4 (D-3) — payroll komissiya bazasi netto paidAmount', () => {
  let planPayTxId: string;

  test("reja yo'li: bemor 10% → bosqich 180 000 netto, to'lov 180 000", async () => {
    const pid = await inTenant(async (tx) => {
      const [p] = await tx
        .insert(patients)
        .values({ tenantId, fullName: 'Bemor Reja', defaultDiscountPercent: '10' })
        .returning({ id: patients.id });
      return p!.id;
    });
    const plan = await call('doctor', 'POST', '/api/treatment-plans', {
      patientId: pid,
      doctorId: doctorUserId,
      title: 'Reja payroll',
      stages: [{ serviceId: svcId, serviceName: 'Plomba', cost: 1, estimatedVisits: 1 }],
    });
    expect(plan.status).toBe(201);
    const stageId = plan.json.data.stages[0].id as string;
    expect(plan.json.data.stages[0].cost).toBe('180000.00');
    await inTenant(async (tx) => {
      await tx
        .update(treatmentPlans)
        .set({ status: 'accepted' })
        .where(eq(treatmentPlans.id, plan.json.data.id));
      await tx
        .update(treatmentStages)
        .set({ acceptance: 'accepted' })
        .where(eq(treatmentStages.id, stageId));
    });
    const pay = await call('reception', 'POST', '/api/cashier/transactions', {
      branchId,
      patientId: pid,
      items: [],
      discount: 0,
      paidAmount: 180_000,
      paymentMethod: 'cash',
      allocations: [{ stageId, amount: 180_000 }],
    });
    expect(pay.status).toBe(201);
    planPayTxId = pay.json.data.id;
  });

  test("vizit yo'li: Receptionist 20 000 chegirma bilan 180 000 to'laydi", async () => {
    const { pid, visitId } = await inTenant(async (tx) => {
      const [p] = await tx
        .insert(patients)
        .values({ tenantId, fullName: 'Bemor Vizit' })
        .returning({ id: patients.id });
      const [v] = await tx
        .insert(visitNotes)
        .values({
          tenantId,
          patientId: p!.id,
          doctorId: doctorUserId,
          performedServices: [svcId],
          signedAt: new Date(),
          signedBy: doctorUserId,
        })
        .returning({ id: visitNotes.id });
      return { pid: p!.id, visitId: v!.id };
    });
    const pay = await call('reception', 'POST', '/api/cashier/transactions', {
      branchId,
      patientId: pid,
      visitNoteId: visitId,
      items: [{ serviceId: svcId, quantity: 1, unitPrice: 1, serviceName: 'Plomba' }],
      discount: 20_000,
      discountReason: 'Aksiya',
      paidAmount: 180_000,
      paymentMethod: 'cash',
    });
    expect(pay.status).toBe(201);
    expect(Number(pay.json.data.totalAmount)).toBe(180_000);
    expect(pay.json.data.discountPercent).toBe('10.00');
  });

  test("Receptionist (payroll.manage'siz) davr yarata olmaydi → 403", async () => {
    const r = await call('reception', 'POST', '/api/payroll/runs', {
      periodFrom: today,
      periodTo: today,
    });
    expect(r.status).toBe(403);
  });

  test('Accountant: komissiya = 10% × 360 000 netto = 36 000 (brutto 400 000 → 40 000 EMAS)', async () => {
    const { runId, revenue, commission } = await runCommission();
    expect(revenue).toBe(360_000);
    expect(commission).toBe(36_000);
    const del = await call('accountant', 'DELETE', `/api/payroll/runs/${runId}`);
    expect(del.status).toBeLessThan(300);
  });

  test('davr ichida reja to‘lovining qisman refund’i (90 000) → komissiya 27 000', async () => {
    const r = await call('accountant', 'POST', `/api/cashier/transactions/${planPayTxId}/refund`, {
      amount: 90_000,
    });
    expect(r.status).toBe(200);
    const { revenue, commission } = await runCommission();
    expect(revenue).toBe(270_000);
    expect(commission).toBe(27_000);
  });
});
