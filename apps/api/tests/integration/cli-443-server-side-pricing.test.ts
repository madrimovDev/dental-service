/**
 * CLI-443 — kassa POS va davolash rejasi narxni SERVERDA hisoblashi kerak.
 *
 * Real repro (ticket): asosiy filialda xizmat narxi 250 000, yangi filialda 100 000.
 * `POST /cashier/transactions` asosiy filial `branchId` bilan, lekin boshqa (arzon)
 * filial narxi bilan yuborilganda server hech qanday tekshiruvsiz qabul qilardi.
 *
 * Fix: `cashier.service.ts::create` va `treatment-plans.service.ts::createPlan`
 * endi `services.service.ts::getActivePrice(serviceId, branchId)` orqali SERVERDA
 * narxni hisoblaydi — client yuborgan `unitPrice`/`stages[].cost` e'tiborga olinmaydi
 * (serviceId bor bosqich/item uchun). Faol narx topilmasa (POS) — 400
 * `cashier.no_active_price`.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-443`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, patients, servicePrices, services, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import {
  createCashierService,
  NoActivePriceError,
} from '../../src/modules/cashier/cashier.service.ts';
import { createTreatmentPlansService } from '../../src/modules/clinical/treatment-plans/treatment-plans.service.ts';
import { createServiceCategoriesService } from '../../src/modules/service-categories/service-categories.service.ts';
import { createServicesService } from '../../src/modules/services/services.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const categories = createServiceCategoriesService({ audit: noopAudit });
const servicesSvc = createServicesService({ audit: noopAudit, categories });
const cashier = createCashierService({ audit: noopAudit, priceLookup: servicesSvc });
const plansSvc = createTreatmentPlansService({ audit: noopAudit, priceLookup: servicesSvc });

let tenantId: string;
let userId: string;
let mainBranchId: string;
let cheapBranchId: string;
let patientId: string;
let serviceId: string;

const ctx = (tx: DbOrTx, opts?: { activeBranchId?: string }): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'activeBranchId'
            ? (opts?.activeBranchId ?? null)
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
    .values({ phone: '+998900000443', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI443 Clinic', slug: 'cli443-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await withTx(async (tx) => {
    const [main] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Main' })
      .returning({ id: branches.id });
    const [cheap] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Cheap' })
      .returning({ id: branches.id });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    const [svc] = await tx
      .insert(services)
      .values({ tenantId, code: 'S-443', nameUz: 'Konsultatsiya' })
      .returning({ id: services.id });
    if (!main || !cheap || !p || !svc) throw new Error('fixture insert failed');
    mainBranchId = main.id;
    cheapBranchId = cheap.id;
    patientId = p.id;
    serviceId = svc.id;

    await tx.insert(servicePrices).values([
      { serviceId, branchId: mainBranchId, price: '250000' },
      { serviceId, branchId: cheapBranchId, price: '100000' },
    ]);
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-443 — cashier POS server-side price', () => {
  test('boshqa filial narxi (100000) yuborilsa ham — asosiy filial real narxi (250000) ishlatiladi', async () => {
    const tx = await withTx((tx) =>
      cashier.create(ctx(tx), {
        branchId: mainBranchId,
        patientId,
        items: [{ serviceId, quantity: 1, unitPrice: 100_000, serviceName: 'Konsultatsiya' }],
        discount: 0,
        paidAmount: 250_000,
        paymentMethod: 'cash',
      }),
    );
    expect(Number(tx.totalAmount)).toBe(250_000);
    expect(Number(tx.items[0]?.unitPrice)).toBe(250_000);
  });

  test("filialda faol narx yo'q — NoActivePriceError", async () => {
    const [orphanBranch] = await withTx((tx) =>
      tx.insert(branches).values({ tenantId, name: 'Orphan' }).returning({ id: branches.id }),
    );
    if (!orphanBranch) throw new Error('branch insert failed');

    await expect(
      withTx((tx) =>
        cashier.create(ctx(tx), {
          branchId: orphanBranch.id,
          patientId,
          items: [{ serviceId, quantity: 1, unitPrice: 1, serviceName: 'Konsultatsiya' }],
          discount: 0,
          paidAmount: 1,
          paymentMethod: 'cash',
        }),
      ),
    ).rejects.toBeInstanceOf(NoActivePriceError);
  });
});

describe('CLI-443 — treatment plan server-side price', () => {
  test("serviceId bor bosqich — client cost e'tiborga olinmaydi, faol filial narxi yoziladi", async () => {
    const plan = await withTx((tx) =>
      plansSvc.createPlan(ctx(tx, { activeBranchId: cheapBranchId }), {
        patientId,
        doctorId: userId,
        title: 'Reja',
        stages: [
          {
            serviceId,
            serviceName: 'Konsultatsiya',
            estimatedVisits: 1,
            cost: 1, // client soxta qiymat
          },
        ],
      }),
    );
    expect(Number(plan.stages[0]?.cost)).toBe(100_000); // cheap filial real narxi
    expect(Number(plan.totalCost)).toBe(100_000);
  });

  test("serviceId'siz (custom) bosqich — client cost saqlanadi", async () => {
    const plan = await withTx((tx) =>
      plansSvc.createPlan(ctx(tx, { activeBranchId: mainBranchId }), {
        patientId,
        doctorId: userId,
        title: 'Custom reja',
        stages: [{ serviceName: 'Maxsus protsedura', estimatedVisits: 1, cost: 77_000 }],
      }),
    );
    expect(Number(plan.stages[0]?.cost)).toBe(77_000);
  });
});
