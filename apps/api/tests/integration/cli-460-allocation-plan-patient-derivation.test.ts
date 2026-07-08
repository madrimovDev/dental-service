/**
 * CLI-460 — plan-billing (`allocations`) tranzaksiyada `treatmentPlanId`/`patientId`
 * client'dan ISHONCH bilan qabul qilinmaydi (ikkalasi ham `.optional()`). Ilgari
 * allocation loop faqat per-stage cost-cap tekshirar edi, `stageId`ning HAQIQIY
 * `treatmentPlanId`si `input.treatmentPlanId`ga (yoki uning `patientId`si
 * `input.patientId`ga) mos kelishini hech qachon tekshirmasdi. Natijada
 * `treatmentPlanId` null/noto'g'ri bo'lib qolsa — `payroll.service.ts`dagi
 * INNER JOIN (`cashierTransactions.treatmentPlanId → treatmentPlans.id`) shu
 * tranzaksiyani o'tkazib yuboradi va doktor komissiyasi YO'QOLADI.
 *
 * Fix: `cashier.service.ts::create` — allocations berilganda `stageId`larning
 * haqiqiy planId/patientId'sini DB'dan aniqlaydi: (a) barcha allocation bitta
 * planga tegishli bo'lishi shart, (b) client qiymati berilgan bo'lsa mos kelishi
 * shart, (c) berilmagan bo'lsa DERIVE qilinadi (`AllocationPlanMismatchError`,
 * routes 400 `cashier.allocation_plan_mismatch`).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-460`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  cashierTransactions,
  patients,
  tenants,
  treatmentPlans,
  treatmentStages,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import {
  AllocationPlanMismatchError,
  createCashierService,
} from '../../src/modules/cashier/cashier.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const cashier = createCashierService({ audit: noopAudit });

let tenantId: string;
let ownerId: string;
let branchId: string;

let doctorAId: string;
let doctorBId: string;
let patientAId: string;
let patientBId: string;
let planAId: string;
let planBId: string;
let stageAId: string;
let stageBId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: ownerId }
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
    .values({ phone: '+998900000460', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  const [docA] = await db
    .insert(users)
    .values({ phone: '+998900000461', passwordHash: 'fake', fullName: 'Doctor A' })
    .returning({ id: users.id });
  const [docB] = await db
    .insert(users)
    .values({ phone: '+998900000462', passwordHash: 'fake', fullName: 'Doctor B' })
    .returning({ id: users.id });
  if (!owner || !docA || !docB) throw new Error('user insert failed');
  ownerId = owner.id;
  doctorAId = docA.id;
  doctorBId = docB.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI460 Clinic', slug: 'cli460-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await withTx(async (tx) => {
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Main' })
      .returning({ id: branches.id });
    const [pA] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor A' })
      .returning({ id: patients.id });
    const [pB] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor B' })
      .returning({ id: patients.id });
    if (!branch || !pA || !pB) throw new Error('branch/patient insert failed');
    branchId = branch.id;
    patientAId = pA.id;
    patientBId = pB.id;

    const [planA] = await tx
      .insert(treatmentPlans)
      .values({
        tenantId,
        patientId: patientAId,
        doctorId: doctorAId,
        title: 'Reja A',
        status: 'accepted',
      })
      .returning({ id: treatmentPlans.id });
    const [planB] = await tx
      .insert(treatmentPlans)
      .values({
        tenantId,
        patientId: patientBId,
        doctorId: doctorBId,
        title: 'Reja B',
        status: 'accepted',
      })
      .returning({ id: treatmentPlans.id });
    if (!planA || !planB) throw new Error('plan insert failed');
    planAId = planA.id;
    planBId = planB.id;

    const [stageA] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: planAId,
        sequence: 1,
        serviceName: 'S-A',
        cost: '1000000',
        acceptance: 'accepted',
      })
      .returning({ id: treatmentStages.id });
    const [stageB] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: planBId,
        sequence: 1,
        serviceName: 'S-B',
        cost: '1000000',
        acceptance: 'accepted',
      })
      .returning({ id: treatmentStages.id });
    if (!stageA || !stageB) throw new Error('stage insert failed');
    stageAId = stageA.id;
    stageBId = stageB.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-460 — allocation stage → real plan/patient derivation', () => {
  test('treatmentPlanId/patientId berilmagan — DERIVE qilinadi + persisted rowda to‘g‘ri, payroll JOIN doktorni topadi', async () => {
    const created = await withTx((tx) =>
      cashier.create(ctx(tx), {
        branchId,
        items: [],
        discount: 0,
        paidAmount: 300_000,
        paymentMethod: 'cash',
        allocations: [{ stageId: stageAId, amount: 300_000 }],
      }),
    );

    // Servis qaytargan qiymat — derive qilingan.
    expect(created.treatmentPlanId).toBe(planAId);
    expect(created.patientId).toBe(patientAId);

    // Persisted row — DB'dan to'g'ridan-to'g'ri o'qib tekshiramiz (bug aynan
    // shu ustunlarda edi, servis return qiymati emas).
    const [persisted] = await withTx((tx) =>
      tx.select().from(cashierTransactions).where(eq(cashierTransactions.id, created.id)),
    );
    expect(persisted?.treatmentPlanId).toBe(planAId);
    expect(persisted?.patientId).toBe(patientAId);

    // payroll.service.ts::createRun bilan BIR XIL INNER JOIN'ni takrorlaymiz —
    // fix'dan oldin treatmentPlanId null bo'lgani uchun bu join hech narsa
    // qaytarmas edi (komissiya yo'qolardi). Endi doctorA revenue'si topiladi.
    const revRows = await withTx((tx) =>
      tx
        .select({
          doctorId: treatmentPlans.doctorId,
          revenue: sql<string>`COALESCE(SUM(${cashierTransactions.paidAmount}), 0)`,
        })
        .from(cashierTransactions)
        .innerJoin(treatmentPlans, eq(cashierTransactions.treatmentPlanId, treatmentPlans.id))
        .where(eq(cashierTransactions.id, created.id))
        .groupBy(treatmentPlans.doctorId),
    );
    expect(revRows).toHaveLength(1);
    expect(revRows[0]?.doctorId).toBe(doctorAId);
    expect(Number(revRows[0]?.revenue)).toBe(300_000);
  });

  test('turli planga tegishli stageId aralashtirilsa — AllocationPlanMismatchError', async () => {
    await expect(
      withTx((tx) =>
        cashier.create(ctx(tx), {
          branchId,
          items: [],
          discount: 0,
          paidAmount: 200_000,
          paymentMethod: 'cash',
          allocations: [
            { stageId: stageAId, amount: 100_000 },
            { stageId: stageBId, amount: 100_000 },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(AllocationPlanMismatchError);
  });

  test('input.treatmentPlanId stageAning haqiqiy planiga mos kelmasa — AllocationPlanMismatchError', async () => {
    await expect(
      withTx((tx) =>
        cashier.create(ctx(tx), {
          branchId,
          treatmentPlanId: planBId, // stageA aslida planA'ga tegishli
          items: [],
          discount: 0,
          paidAmount: 150_000,
          paymentMethod: 'cash',
          allocations: [{ stageId: stageAId, amount: 150_000 }],
        }),
      ),
    ).rejects.toBeInstanceOf(AllocationPlanMismatchError);
  });

  test('input.patientId stageAning haqiqiy bemoriga mos kelmasa — AllocationPlanMismatchError', async () => {
    await expect(
      withTx((tx) =>
        cashier.create(ctx(tx), {
          branchId,
          patientId: patientBId, // stageA aslida patientA'ga tegishli
          items: [],
          discount: 0,
          paidAmount: 150_000,
          paymentMethod: 'cash',
          allocations: [{ stageId: stageAId, amount: 150_000 }],
        }),
      ),
    ).rejects.toBeInstanceOf(AllocationPlanMismatchError);
  });

  test('input.treatmentPlanId/patientId TO‘G‘RI berilgan — oʼtadi (regressiya, client qiymati saqlanadi)', async () => {
    const created = await withTx((tx) =>
      cashier.create(ctx(tx), {
        branchId,
        treatmentPlanId: planAId,
        patientId: patientAId,
        items: [],
        discount: 0,
        paidAmount: 150_000,
        paymentMethod: 'cash',
        allocations: [{ stageId: stageAId, amount: 150_000 }],
      }),
    );
    expect(created.treatmentPlanId).toBe(planAId);
    expect(created.patientId).toBe(patientAId);
  });
});
