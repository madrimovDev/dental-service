/**
 * FX-107 (LB-16) — davolash rejasi orqali to'langan xizmatlar byService / procedureMix'ga
 * kiradi (treatment_stage_payments -> treatment_stages.service_id), refund original
 * to'lov davriga netlanadi, filial doirasi saqlanadi. REAL DB (RLS).
 *
 *   cd apps/api && bun test tests/integration/fx-107-plan-revenue-by-service.test.ts --env-file=../../.env --timeout 30000
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  cashierTransactionItems,
  cashierTransactions,
  patients,
  services,
  tenants,
  treatmentPlans,
  treatmentStagePayments,
  treatmentStages,
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
let branchA: string;

const ctx = (tx: DbOrTx, scoped?: string[]): Context =>
  ({
    get: (k: string) => (k === 'db' ? tx : k === 'reportBranchIds' ? scoped : undefined),
  }) as unknown as Context;

const RANGE = { from: '2026-05-01', to: '2026-05-31' };

const run = <T>(fn: (c: Context) => Promise<T>, scoped?: string[]): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx, scoped));
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000107', passwordHash: 'x', fullName: 'Doc FX107' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner');
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FX-107 Clinic', slug: 'fx-107-clinic', ownerUserId: owner.id })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [a] = await tx
      .insert(branches)
      .values({ tenantId, name: 'A' })
      .returning({ id: branches.id });
    const [b] = await tx
      .insert(branches)
      .values({ tenantId, name: 'B' })
      .returning({ id: branches.id });
    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'FX-107 Patient' })
      .returning({ id: patients.id });
    const [implant] = await tx
      .insert(services)
      .values({ tenantId, code: 'IMP-1', nameUz: 'Implant' })
      .returning({ id: services.id });
    const [consult] = await tx
      .insert(services)
      .values({ tenantId, code: 'CON-1', nameUz: 'Konsultatsiya' })
      .returning({ id: services.id });
    if (!a || !b || !patient || !implant || !consult) throw new Error('seed');
    branchA = a.id;

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId: patient.id, doctorId: owner.id, title: 'FX-107 plan' })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan');
    const [stage] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: plan.id,
        sequence: 1,
        serviceId: implant.id,
        serviceName: 'Implant',
        cost: '5000000',
        acceptance: 'accepted',
      })
      .returning({ id: treatmentStages.id });
    if (!stage) throw new Error('stage');

    const mkTx = async (o: {
      receipt: string;
      branch: string;
      type: 'payment' | 'refund';
      amount: string;
      at: string;
      parent?: string;
      planId?: string;
    }) => {
      const [row] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId,
          branchId: o.branch,
          patientId: patient.id,
          treatmentPlanId: o.planId ?? null,
          parentTransactionId: o.parent ?? null,
          receiptNumber: o.receipt,
          totalAmount: o.amount,
          paidAmount: o.amount,
          paymentMethod: 'cash',
          type: o.type,
          status: 'completed',
          createdAt: new Date(o.at),
        })
        .returning({ id: cashierTransactions.id });
      if (!row) throw new Error('tx');
      return row.id;
    };

    // Reja to'lovi A filialida: 2 000 000 (items YO'Q, allocation bor)
    const p1 = await mkTx({
      receipt: 'FX107-P1',
      branch: a.id,
      type: 'payment',
      amount: '2000000',
      at: '2026-05-05T10:00:00+05:00',
      planId: plan.id,
    });
    await tx
      .insert(treatmentStagePayments)
      .values({ tenantId, transactionId: p1, stageId: stage.id, amount: '2000000' });
    // Ikkinchi qism (taksit) shu oyda: 1 000 000 — bosqich bitta, count=1 bo'lishi kerak
    const p2 = await mkTx({
      receipt: 'FX107-P2',
      branch: a.id,
      type: 'payment',
      amount: '1000000',
      at: '2026-05-12T10:00:00+05:00',
      planId: plan.id,
    });
    await tx
      .insert(treatmentStagePayments)
      .values({ tenantId, transactionId: p2, stageId: stage.id, amount: '1000000' });
    // P2 ga qisman refund 400 000 (original davriga netlanadi)
    const r2 = await mkTx({
      receipt: 'FX107-R2',
      branch: a.id,
      type: 'refund',
      amount: '400000',
      at: '2026-05-20T10:00:00+05:00',
      parent: p2,
      planId: plan.id,
    });
    await tx
      .insert(treatmentStagePayments)
      .values({ tenantId, transactionId: r2, stageId: stage.id, amount: '-400000' });
    // Reja to'lovi B filialida: 700 000
    const p3 = await mkTx({
      receipt: 'FX107-P3',
      branch: b.id,
      type: 'payment',
      amount: '700000',
      at: '2026-05-15T10:00:00+05:00',
      planId: plan.id,
    });
    await tx
      .insert(treatmentStagePayments)
      .values({ tenantId, transactionId: p3, stageId: stage.id, amount: '700000' });

    // Erkin POS item: Konsultatsiya 100 000 (A)
    const pos = await mkTx({
      receipt: 'FX107-POS',
      branch: a.id,
      type: 'payment',
      amount: '100000',
      at: '2026-05-06T10:00:00+05:00',
    });
    await tx.insert(cashierTransactionItems).values({
      transactionId: pos,
      serviceId: consult.id,
      serviceName: 'Konsultatsiya',
      quantity: 1,
      unitPrice: '100000',
      subtotal: '100000',
    });

    // Oraliqdan tashqari reja to'lovi (aprel, boshqa bosqich) — kirmasligi kerak
    const [stageOld] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: plan.id,
        sequence: 2,
        serviceId: implant.id,
        serviceName: 'Implant',
        cost: '999000',
        acceptance: 'accepted',
      })
      .returning({ id: treatmentStages.id });
    if (!stageOld) throw new Error('stageOld');
    const old = await mkTx({
      receipt: 'FX107-OLD',
      branch: a.id,
      type: 'payment',
      amount: '999000',
      at: '2026-04-05T10:00:00+05:00',
      planId: plan.id,
    });
    await tx
      .insert(treatmentStagePayments)
      .values({ tenantId, transactionId: old, stageId: stageOld.id, amount: '999000' });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-107 — reja to‘lovlari xizmat bo‘yicha hisobotda', () => {
  test('revenue.byService: Implant (reja) net refund bilan, Konsultatsiya POS', async () => {
    const r = await run((c) => service.revenue(c, RANGE));
    const byName = Object.fromEntries(r.byService.map((s) => [s.serviceName, s.total]));
    // 2 000 000 + (1 000 000 - 400 000) + 700 000 = 3 300 000
    expect(byName.Implant).toBe(3300000);
    expect(byName.Konsultatsiya).toBe(100000);
  });

  test('procedureMix: Implant qatori bor, count = bosqichlar soni (taksit emas)', async () => {
    const r = await run((c) => service.dentalAnalytics(c, RANGE));
    const implant = r.procedureMix.find((p) => p.serviceName === 'Implant');
    expect(implant?.revenue).toBe(3300000);
    expect(implant?.count).toBe(1);
    expect(r.procedureMix.find((p) => p.serviceName === 'Konsultatsiya')?.revenue).toBe(100000);
  });

  test('filial doirasi (faqat A): B filialining reja to‘lovi kirmaydi', async () => {
    const r = await run((c) => service.revenue(c, RANGE), [branchA]);
    const implant = r.byService.find((s) => s.serviceName === 'Implant');
    expect(implant?.total).toBe(2600000);
  });
});
