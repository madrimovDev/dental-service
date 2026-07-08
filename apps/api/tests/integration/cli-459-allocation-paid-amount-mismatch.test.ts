/**
 * CLI-459 — plan-billing rejimida (`items=[]`, `allocations` bilan) allocation
 * yig'indisi `paidAmount`ga AYNAN TENG bo'lishi shart. Ilgari guard bir-tomonlama
 * edi (`allocSum > paidAmount` bo'lsagina RAD) — `allocSum < paidAmount` bo'lganda
 * `netTotalCents` to'g'ridan-to'g'ri `input.paidAmount`dan olinar edi (service.ts
 * ~223-225), ya'ni kassaga "ko'rinmas" pul kirib kelardi: mijoz 100000 to'lagan
 * deb yozib qo'yiladi, lekin bosqichlarga faqat 80000 taqsimlanadi — 20000
 * hech qayerda buxgalteriya izini qoldirmaydi.
 *
 * Fix: `cashier.service.ts::create` — `allocSumCents !== paidAmountCents` bo'lsa
 * `AllocationMismatchError` (routes 400 `cashier.allocation_mismatch`).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-459`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
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
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import {
  AllocationMismatchError,
  createCashierService,
} from '../../src/modules/cashier/cashier.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const cashier = createCashierService({ audit: noopAudit });

let tenantId: string;
let userId: string;
let branchId: string;
let patientId: string;
let stageId: string;

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

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000459', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI459 Clinic', slug: 'cli459-clinic', ownerUserId: userId })
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
        cost: '1000000',
        acceptance: 'accepted',
      })
      .returning({ id: treatmentStages.id });
    if (!stage) throw new Error('stage insert failed');
    stageId = stage.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-459 — allocation sum must equal paidAmount', () => {
  test('allocSum (80000) < paidAmount (100000) — AllocationMismatchError (koʼrinmas pul)', async () => {
    await expect(
      withTx((tx) =>
        cashier.create(ctx(tx), {
          branchId,
          patientId,
          items: [],
          discount: 0,
          paidAmount: 100_000,
          paymentMethod: 'cash',
          allocations: [{ stageId, amount: 80_000 }],
        }),
      ),
    ).rejects.toBeInstanceOf(AllocationMismatchError);
  });

  test('allocSum (120000) > paidAmount (100000) — AllocationMismatchError', async () => {
    await expect(
      withTx((tx) =>
        cashier.create(ctx(tx), {
          branchId,
          patientId,
          items: [],
          discount: 0,
          paidAmount: 100_000,
          paymentMethod: 'cash',
          allocations: [{ stageId, amount: 120_000 }],
        }),
      ),
    ).rejects.toBeInstanceOf(AllocationMismatchError);
  });

  test('allocSum === paidAmount (100000) — oʼtadi', async () => {
    const tx = await withTx((tx) =>
      cashier.create(ctx(tx), {
        branchId,
        patientId,
        items: [],
        discount: 0,
        paidAmount: 100_000,
        paymentMethod: 'cash',
        allocations: [{ stageId, amount: 100_000 }],
      }),
    );
    expect(Number(tx.paidAmount)).toBe(100_000);
  });
});
