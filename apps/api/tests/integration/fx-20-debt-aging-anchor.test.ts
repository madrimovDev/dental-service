/**
 * FX-20 (LA-26) — debt-aging langari TO'LANMAGAN qoldiq bo'yicha (real DB, real HTTP, Accountant permset).
 * Eski to'langan bosqich/tranzaksiya yangi qarzni '90+ kun'ga tushirmasligi kerak.
 *
 *   cd apps/api && bun test tests/integration/fx-20-debt-aging-anchor.test.ts --env-file=../../.env --timeout 30000
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  branches,
  cashierTransactions,
  patients,
  permissions,
  rolePermissions,
  roles,
  tenants,
  treatmentPlans,
  treatmentStagePayments,
  treatmentStages,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY);
let tenantId: string;
let token: string;
const names: Record<string, string> = {};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  const ownerId = await mk('+998900002001');
  const accId = await mk('+998900002002');
  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FX20', slug: 'fx20', ownerUserId: ownerId })
      .returning({ id: tenants.id })
  )[0]!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const branchId = (
      await tx.insert(branches).values({ tenantId, name: 'B' }).returning({ id: branches.id })
    )[0]!.id;
    const [role] = await tx
      .insert(roles)
      .values({ tenantId, name: 'R' })
      .returning({ id: roles.id });
    await db
      .insert(permissions)
      .values({ code: 'report.view', category: 'report' })
      .onConflictDoNothing();
    const [rv] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.code, 'report.view'));
    await tx.insert(rolePermissions).values({ roleId: role!.id, permissionId: rv!.id });
    await tx
      .insert(userAssignments)
      .values({ tenantId, userId: accId, branchId: null, roleId: role!.id });

    const pts = await tx
      .insert(patients)
      .values([
        { tenantId, fullName: 'A plan: old paid + new unpaid' },
        { tenantId, fullName: 'B non-plan: old paid + new unpaid' },
        { tenantId, fullName: 'C plan: old stage still unpaid' },
      ])
      .returning({ id: patients.id });
    const [pA, pB, pC] = pts;

    const mkPlan = async (patientId: string, planAge: number) =>
      (
        await tx
          .insert(treatmentPlans)
          .values({
            tenantId,
            patientId,
            doctorId: ownerId,
            title: 'P',
            status: 'in_progress',
            totalCost: '0',
            createdAt: ago(planAge),
          })
          .returning({ id: treatmentPlans.id })
      )[0]!.id;
    const mkStage = async (planId: string, seq: number, cost: number, doneAgo: number) =>
      (
        await tx
          .insert(treatmentStages)
          .values({
            tenantId,
            treatmentPlanId: planId,
            sequence: seq,
            serviceName: 'S',
            cost: String(cost),
            status: 'completed',
            acceptance: 'accepted',
            completedAt: ago(doneAgo),
          })
          .returning({ id: treatmentStages.id })
      )[0]!.id;
    const pay = async (patientId: string, planId: string, stageId: string, amount: number) => {
      const [tr] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId,
          branchId,
          patientId,
          treatmentPlanId: planId,
          totalAmount: String(amount),
          paidAmount: String(amount),
          paymentMethod: 'cash',
          type: 'payment',
          status: 'completed',
        } as never)
        .returning({ id: cashierTransactions.id });
      await tx
        .insert(treatmentStagePayments)
        .values({ tenantId, transactionId: tr!.id, stageId, amount: String(amount) } as never);
    };

    // A: reja 150 kun oldin; 140 kun oldingi bosqich TO'LIQ to'langan; kecha 200 000 lik yangi bosqich to'lanmagan.
    const planA = await mkPlan(pA!.id, 150);
    const sA1 = await mkStage(planA, 1, 500_000, 140);
    await pay(pA!.id, planA, sA1, 500_000);
    await mkStage(planA, 2, 200_000, 1);

    // C: 140 kun oldingi bosqich 500 000, faqat 100 000 to'langan -> qoldiq eski (90+).
    const planC = await mkPlan(pC!.id, 150);
    const sC1 = await mkStage(planC, 1, 500_000, 140);
    await pay(pC!.id, planC, sC1, 100_000);
    await mkStage(planC, 2, 50_000, 1);

    // B: erkin POS: 150 kun oldingi to'liq to'langan; kecha 200 000 jami, 0 to'langan.
    for (const [total, paid, age] of [
      [300_000, 300_000, 150],
      [200_000, 0, 1],
    ] as const) {
      await tx.insert(cashierTransactions).values({
        tenantId,
        branchId,
        patientId: pB!.id,
        totalAmount: String(total),
        paidAmount: String(paid),
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdAt: ago(age),
      } as never);
    }
    names.A = pA!.id;
  });

  token = (
    await signAccess({
      sub: accId,
      atid: tenantId,
      abid: null,
      perms: [...(ROLE_TEMPLATES.find((t) => t.templateKey === 'accountant')?.permissions ?? [])],
      roleKey: 'accountant',
      lang: 'uz',
    })
  ).token;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-20: debt-aging langari to‘lanmagan qoldiq bo‘yicha', () => {
  test('eski to‘langan bosqich/tranzaksiya yangi qarzni 90+ ga tushirmaydi; eski to‘lanmagan qoldiq 90+ da qoladi', async () => {
    const res = await createApp().request('/api/reports/debt-aging', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as {
      data: {
        totalDebt: number;
        patientCount: number;
        over90Count: number;
        buckets: { key: string; amount: number; patients: number }[];
      };
    };
    const by = Object.fromEntries(data.buckets.map((b) => [b.key, b]));
    // A (200 000) + B (200 000) -> 0-30; C (400 000 + 50 000) -> 90+.
    expect(data.totalDebt).toBe(850_000);
    expect(data.patientCount).toBe(3);
    expect(by.d0_30.amount).toBe(400_000);
    expect(by.d0_30.patients).toBe(2);
    expect(by.d90_plus.amount).toBe(450_000);
    expect(by.d90_plus.patients).toBe(1);
    expect(data.over90Count).toBe(1);
  });
});
