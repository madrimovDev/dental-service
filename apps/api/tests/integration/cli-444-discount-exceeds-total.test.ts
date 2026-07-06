/**
 * CLI-444 — kassa chegirmasi (discount) itemsGross'dan katta bo'lganda jim
 * `Math.max(0, ...)` clamp o'rniga 400 xato bilan RAD etilishi kerak.
 *
 * Real repro (ticket): 250 000 so'mlik xizmatga discount: 500000 (200%) yuborilganda
 * server 200 OK bilan qabul qilardi, totalAmount: "0.00" — hech qanday validatsiya yo'q.
 *
 * Fix: `cashier.service.ts::create` — `discount > itemsGross` bo'lsa
 * `DiscountExceedsTotalError` (routes 400 `cashier.discount_exceeds_total`).
 *
 * MAKSIMAL CHEGIRMA FOIZI + `cashier.discount_override` permission — bu ticket'da
 * QAMRALMAGAN (biznes qaror talab qiladi, CLI-444 tavsifi §"Taklif qilingan yechim").
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-444`
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
  DiscountExceedsTotalError,
} from '../../src/modules/cashier/cashier.service.ts';
import { createServiceCategoriesService } from '../../src/modules/service-categories/service-categories.service.ts';
import { createServicesService } from '../../src/modules/services/services.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const categories = createServiceCategoriesService({ audit: noopAudit });
const servicesSvc = createServicesService({ audit: noopAudit, categories });
const cashier = createCashierService({ audit: noopAudit, priceLookup: servicesSvc });

let tenantId: string;
let userId: string;
let branchId: string;
let patientId: string;
let serviceId: string;

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
    .values({ phone: '+998900000444', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI444 Clinic', slug: 'cli444-clinic', ownerUserId: userId })
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
    const [svc] = await tx
      .insert(services)
      .values({ tenantId, code: 'S-444', nameUz: 'Konsultatsiya' })
      .returning({ id: services.id });
    if (!branch || !p || !svc) throw new Error('fixture insert failed');
    branchId = branch.id;
    patientId = p.id;
    serviceId = svc.id;

    await tx.insert(servicePrices).values({ serviceId, branchId, price: '250000' });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-444 — discount itemsGross RAD guard', () => {
  test('discount (500000) itemsGross (250000) dan katta — DiscountExceedsTotalError', async () => {
    await expect(
      withTx((tx) =>
        cashier.create(ctx(tx), {
          branchId,
          patientId,
          items: [{ serviceId, quantity: 1, unitPrice: 1, serviceName: 'Konsultatsiya' }],
          discount: 500_000,
          paidAmount: 0,
          paymentMethod: 'cash',
        }),
      ),
    ).rejects.toBeInstanceOf(DiscountExceedsTotalError);
  });

  test('discount itemsGross ichida (100000 < 250000) — oddiy o‘tadi', async () => {
    const tx = await withTx((tx) =>
      cashier.create(ctx(tx), {
        branchId,
        patientId,
        items: [{ serviceId, quantity: 1, unitPrice: 1, serviceName: 'Konsultatsiya' }],
        discount: 100_000,
        paidAmount: 150_000,
        paymentMethod: 'cash',
      }),
    );
    expect(Number(tx.totalAmount)).toBe(150_000); // 250000 - 100000
  });

  test('discount aynan itemsGross ga teng (chegara holat) — netTotal 0, rad etilmaydi', async () => {
    const tx = await withTx((tx) =>
      cashier.create(ctx(tx), {
        branchId,
        patientId,
        items: [{ serviceId, quantity: 1, unitPrice: 1, serviceName: 'Konsultatsiya' }],
        discount: 250_000,
        paidAmount: 0,
        paymentMethod: 'cash',
      }),
    );
    expect(Number(tx.totalAmount)).toBe(0);
  });
});
