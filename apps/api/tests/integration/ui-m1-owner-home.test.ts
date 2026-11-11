/**
 * UI-M1 — GET /api/reports/debt-aging (real DB, real HTTP, real rol permset'lari — @owner EMAS).
 * Run: cd apps/api && bun test --env-file=../../.env ui-m1-owner-home
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  branches,
  cashierTransactions,
  patients,
  tenants,
  treatmentPlans,
  treatmentStagePayments,
  treatmentStages,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const permsFor = (key: string) => [
  ...(ROLE_TEMPLATES.find((t) => t.templateKey === key)?.permissions ?? []),
];
const DAY = 86_400_000;
let tenantId: string;
const tokens: Record<string, string> = {};

const tokenFor = async (userId: string, key: string) =>
  (
    await signAccess({
      sub: userId,
      atid: tenantId,
      abid: null,
      perms: permsFor(key),
      roleKey: key,
      lang: 'uz',
    })
  ).token;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  const ownerId = await mk('+998900001101');
  const accId = await mk('+998900001102');
  const recId = await mk('+998900001103');
  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'M1 Clinic', slug: 'm1-clinic', ownerUserId: ownerId })
      .returning({ id: tenants.id })
  )[0]!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const branchId = (
      await tx.insert(branches).values({ tenantId, name: 'B' }).returning({ id: branches.id })
    )[0]!.id;
    const [p1, p2, p3] = await tx
      .insert(patients)
      .values([
        { tenantId, fullName: 'Old debtor' },
        { tenantId, fullName: 'New non-plan debtor' },
        { tenantId, fullName: 'Paid up' },
      ])
      .returning({ id: patients.id });
    // p1: 1 000 000 plan debt, stage completed 100 kun oldin, 400 000 to'langan -> 600 000 (90+)
    // p3: 500 000 cost, to'liq to'langan -> qarz yo'q
    for (const [pid, cost, paid, ago] of [
      [p1!.id, 1_000_000, 400_000, 100],
      [p3!.id, 500_000, 500_000, 5],
    ] as const) {
      const [plan] = await tx
        .insert(treatmentPlans)
        .values({
          tenantId,
          patientId: pid,
          doctorId: ownerId,
          title: 'P',
          status: 'in_progress',
          totalCost: String(cost),
        })
        .returning({ id: treatmentPlans.id });
      const [st] = await tx
        .insert(treatmentStages)
        .values({
          tenantId,
          treatmentPlanId: plan!.id,
          sequence: 1,
          serviceName: 'S',
          cost: String(cost),
          status: 'completed',
          acceptance: 'accepted',
          completedAt: new Date(Date.now() - ago * DAY),
        })
        .returning({ id: treatmentStages.id });
      const [tr] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId,
          branchId,
          patientId: pid,
          treatmentPlanId: plan!.id,
          totalAmount: String(paid),
          paidAmount: String(paid),
          paymentMethod: 'cash',
          type: 'payment',
          status: 'completed',
        } as never)
        .returning({ id: cashierTransactions.id });
      await tx.insert(treatmentStagePayments).values({
        tenantId,
        transactionId: tr!.id,
        stageId: st!.id,
        amount: String(paid),
      } as never);
    }
    // p2: erkin POS, 300 000 jami, 100 000 to'langan -> 200 000 (0-30)
    await tx.insert(cashierTransactions).values({
      tenantId,
      branchId,
      patientId: p2!.id,
      totalAmount: '300000',
      paidAmount: '100000',
      paymentMethod: 'cash',
      type: 'payment',
      status: 'completed',
    } as never);
  });

  tokens.accountant = await tokenFor(accId, 'accountant');
  tokens.receptionist = await tokenFor(recId, 'receptionist');
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('GET /api/reports/debt-aging', () => {
  test('Accountant (report.view): muddat bo‘yicha bucket va jami', async () => {
    const res = await createApp().request('/api/reports/debt-aging', {
      headers: { authorization: `Bearer ${tokens.accountant}` },
    });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: any };
    expect(data.totalDebt).toBe(800_000);
    expect(data.patientCount).toBe(2);
    expect(data.over90Count).toBe(1);
    const by = Object.fromEntries(data.buckets.map((b: any) => [b.key, b]));
    expect(by.d90_plus.amount).toBe(600_000);
    expect(by.d0_30.amount).toBe(200_000);
  });

  test('Receptionist (report.view yo‘q): 403', async () => {
    const res = await createApp().request('/api/reports/debt-aging', {
      headers: { authorization: `Bearer ${tokens.receptionist}` },
    });
    expect(res.status).toBe(403);
  });
});
