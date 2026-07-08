/**
 * CLI-444 (davomi) — kassa erkin POS chegirmasi tenant-configurable maksimal
 * foizdan (`tenant_settings.max_discount_percent`, default 100 = cheklovsiz)
 * oshib ketmasligi.
 *
 * Enforcement: cashier.service.ts::create → DiscountExceedsMaxError
 * (routes 400 `cashier.discount_exceeds_max`). Mavjud `> itemsGross` guard (100%
 * chegarasi, DiscountExceedsTotalError) o'zgarmaydi — bu undan qat'iyroq limit.
 *
 * Backward-compat: row yo'q (yoki 100) bo'lsa default 100 → itemsGross'gacha ruxsat.
 *
 * Ishga tushirish: cd apps/api && bun test --env-file=../../.env cli-444-max-discount
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  patients,
  servicePrices,
  services,
  tenantSettings,
  tenants,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import {
  createCashierService,
  DiscountExceedsMaxError,
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

/**
 * tenant_settings.max_discount_percent'ni o'rnatadi. `null` — row butunlay o'chiriladi
 * (default 100 fallback yo'lini test qilish uchun); son — upsert.
 */
async function setMaxDiscount(pct: number | null): Promise<void> {
  await withTx(async (tx) => {
    await tx.delete(tenantSettings); // RLS: faqat joriy tenant row'i
    if (pct !== null) {
      await tx.insert(tenantSettings).values({ tenantId, maxDiscountPercent: pct });
    }
  });
}

const posItems = [{ serviceId: '', quantity: 1, unitPrice: 1, serviceName: 'Konsultatsiya' }];

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000445', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI444max Clinic', slug: 'cli444max-clinic', ownerUserId: userId })
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
      .values({ tenantId, code: 'S-444M', nameUz: 'Konsultatsiya' })
      .returning({ id: services.id });
    if (!branch || !p || !svc) throw new Error('fixture insert failed');
    branchId = branch.id;
    patientId = p.id;
    serviceId = svc.id;
    posItems[0]!.serviceId = svc.id;

    await tx.insert(servicePrices).values({ serviceId, branchId, price: '250000' });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

// itemsGross = 250 000 (servicePrice, client unitPrice e'tiborsiz — CLI-443).
describe('CLI-444 — maksimal chegirma foizi (tenant limit)', () => {
  test('maxPct=30, discount 40% (100000) — DiscountExceedsMaxError', async () => {
    await setMaxDiscount(30);
    await expect(
      withTx((tx) =>
        cashier.create(ctx(tx), {
          branchId,
          patientId,
          items: [...posItems],
          discount: 100_000, // 40% > 30%
          paidAmount: 150_000,
          paymentMethod: 'cash',
        }),
      ),
    ).rejects.toBeInstanceOf(DiscountExceedsMaxError);
  });

  test('maxPct=30, discount 25% (62500) — limit ichida, o‘tadi', async () => {
    await setMaxDiscount(30);
    const tx = await withTx((tx) =>
      cashier.create(ctx(tx), {
        branchId,
        patientId,
        items: [...posItems],
        discount: 62_500, // 25% < 30%
        paidAmount: 187_500,
        paymentMethod: 'cash',
      }),
    );
    expect(Number(tx.totalAmount)).toBe(187_500); // 250000 - 62500
  });

  test('maxPct=30, discount aynan 30% (75000) — chegara holat, o‘tadi', async () => {
    await setMaxDiscount(30);
    const tx = await withTx((tx) =>
      cashier.create(ctx(tx), {
        branchId,
        patientId,
        items: [...posItems],
        discount: 75_000, // aynan 30%
        paidAmount: 175_000,
        paymentMethod: 'cash',
      }),
    );
    expect(Number(tx.totalAmount)).toBe(175_000); // 250000 - 75000
  });

  test('tenant_settings row yo‘q (default 100) — 40% chegirma o‘tadi (backward-compat)', async () => {
    await setMaxDiscount(null); // row o'chiriladi → default 100 fallback
    const tx = await withTx((tx) =>
      cashier.create(ctx(tx), {
        branchId,
        patientId,
        items: [...posItems],
        discount: 100_000, // 40% — default 100% da ruxsat
        paidAmount: 150_000,
        paymentMethod: 'cash',
      }),
    );
    expect(Number(tx.totalAmount)).toBe(150_000);
  });
});
