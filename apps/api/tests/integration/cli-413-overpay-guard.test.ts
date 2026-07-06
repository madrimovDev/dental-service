/**
 * CLI-413 — per-stage overpay guard bir request ichida stage bo'yicha AGREGAT
 * qilinishi kerak. Ilgari har allocation mustaqil tekshirilardi → [{X,100k},{X,100k}]
 * 100k cost'ga 200k tushirardi. Fix: stage bo'yicha yig'ish + FOR UPDATE lock.
 *
 * Bu test deterministik dup-stage holatini qamraydi (concurrency race'ni
 * bitta jarayonda ishonchli qayta yaratib bo'lmaydi — u FOR UPDATE bilan yopiladi).
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-413-overpay-guard`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  patients,
  tenants,
  treatmentPlans,
  treatmentStagePayments,
  treatmentStages,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import {
  AllocationExceedError,
  createCashierService,
} from '../../src/modules/cashier/cashier.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const cashier = createCashierService({ audit: noopAudit });

let tenantId: string;
let userId: string;
let branchId: string;
let patientId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: userId }
            : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

const withTx = <T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

/** Cost 100000 li bitta stage yaratadi → stageId qaytaradi. */
async function makeStage(): Promise<string> {
  return withTx(async (tx) => {
    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: userId, title: 'Reja', status: 'accepted' })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');
    const [stage] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: plan.id,
        sequence: 1,
        serviceName: 'S1',
        cost: '100000',
        acceptance: 'accepted',
      })
      .returning({ id: treatmentStages.id });
    if (!stage) throw new Error('stage insert failed');
    return stage.id;
  });
}

const paidForStage = (stageId: string) =>
  withTx((tx) =>
    tx
      .select({ sum: sql<string>`COALESCE(SUM(${treatmentStagePayments.amount}), 0)` })
      .from(treatmentStagePayments)
      .where(eq(treatmentStagePayments.stageId, stageId)),
  ).then((r) => Number(r[0]?.sum ?? 0));

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000413', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI413 Clinic', slug: 'cli413-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;
  await withTx(async (tx) => {
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Main' })
      .returning({ id: branches.id });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!branch || !p) throw new Error('branch/patient insert failed');
    branchId = branch.id;
    patientId = p.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-413 — per-stage overpay guard', () => {
  test('dup stageId bir requestda → AllocationExceedError (200k > 100k cost)', async () => {
    const stageId = await makeStage();
    await expect(
      withTx((tx) =>
        cashier.create(ctx(tx), {
          branchId,
          patientId,
          items: [],
          discount: 0,
          paidAmount: 200_000,
          paymentMethod: 'cash',
          treatmentPlanId: undefined,
          allocations: [
            { stageId, amount: 100_000 },
            { stageId, amount: 100_000 },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(AllocationExceedError);
    // Hech qanday allocation yozilmagan bo'lishi kerak (tx rollback).
    expect(await paidForStage(stageId)).toBe(0);
  });

  test('yagona allocation cost ichida → ok', async () => {
    const stageId = await makeStage();
    const res = await withTx((tx) =>
      cashier.create(ctx(tx), {
        branchId,
        patientId,
        items: [],
        discount: 0,
        paidAmount: 100_000,
        paymentMethod: 'cash',
        treatmentPlanId: undefined,
        allocations: [{ stageId, amount: 100_000 }],
      }),
    );
    expect(res).toBeTruthy();
    expect(await paidForStage(stageId)).toBe(100_000);
  });
});
