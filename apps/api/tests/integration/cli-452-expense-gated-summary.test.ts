/**
 * CLI-452 — kunlik xulosa (`dailySummary`) `expensesTotal`/`netCashFlow`ni FAQAT
 * so'rovchida `expense.view` (yoki `@owner`) bo'lsa qaytaradi. Real DB — haqiqiy
 * `cashier_transactions` + `expenses` fixture, `accessClaims.perms` parametrik.
 *
 * Ishga tushirish:
 *   cd apps/api && bun test tests/integration/cli-452-expense-gated-summary.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, expenses, services, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;

// CLI-440 #2 naqshi bilan bir xil — Tashkent kalendar kuni (UTC EMAS).
const todayISO = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());

let tenantId: string;
let ownerId: string;
let branchId: string;
// `cashier_transaction_items.service_id` haqiqiy `services.id`ga FK (CLI-443
// naqshi, cli-443-server-side-pricing.test.ts:94-97) — reja matnidagi
// `crypto.randomUUID()` FK buzilishiga olib keladi, shuning uchun bu deviatsiya:
// haqiqiy fixture service qo'shildi.
let serviceId: string;
const dateStr = todayISO();

const ctx = (tx: DbOrTx, perms: string[]): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: ownerId }
              : undefined,
  }) as unknown as Context;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000452', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI452 Clinic', slug: 'cli452-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Branch 1' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');
    branchId = branch.id;

    const [svc] = await tx
      .insert(services)
      .values({ tenantId, code: 'S-452', nameUz: 'Konsultatsiya' })
      .returning({ id: services.id });
    if (!svc) throw new Error('service insert failed');
    serviceId = svc.id;

    // Xarajat — shu filial + shu kun (branchId=null tenant-darajali xarajatlar
    // QASDDAN hisobga OLINMAYDI, "shu filial uchun" literal talqin — CLI-452
    // Architecture izohi).
    await tx.insert(expenses).values({
      tenantId,
      branchId,
      amount: '30000',
      date: dateStr,
      note: 'CLI-452 fixture',
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const stubPriceLookup = { getActivePrice: async () => ({ price: '100000' }) };

describe('CLI-452: dailySummary expense.view-gated fields', () => {
  test("expense.view BOR foydalanuvchi — expensesTotal/netCashFlow ko'rinadi", async () => {
    const cashier = createCashierService({ audit: noopAudit, priceLookup: stubPriceLookup });

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const cWrite = ctx(tx, ['cashier.view', 'cashier.create_transaction', 'expense.view']);

      await cashier.create(cWrite, {
        branchId,
        items: [{ serviceId, quantity: 1, unitPrice: 100000, serviceName: 'X' }],
        discount: 0,
        paidAmount: 100000,
        paymentMethod: 'cash',
      } as never);

      const result = await cashier.dailySummary(
        ctx(tx, ['cashier.view', 'expense.view']),
        branchId,
        dateStr,
      );

      expect(result.expensesTotal).toBe(30000);
      // netRevenue = 100000 (payment) - 0 (refund) = 100000; netCashFlow = 100000 - 30000
      expect(result.netCashFlow).toBe(70000);
    });
  });

  test("expense.view YO'Q foydalanuvchi — expensesTotal/netCashFlow javobda YO'Q", async () => {
    const cashier = createCashierService({ audit: noopAudit, priceLookup: stubPriceLookup });

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

      const result = await cashier.dailySummary(ctx(tx, ['cashier.view']), branchId, dateStr);

      expect(result.expensesTotal).toBeUndefined();
      expect(result.netCashFlow).toBeUndefined();
      expect(Object.hasOwn(result, 'expensesTotal')).toBe(false);
      expect(Object.hasOwn(result, 'netCashFlow')).toBe(false);
      // Asosiy breakdown baribir ko'rinadi (`cashier.view` orqali — bu maydonlar gate qilinmagan).
      expect(result.breakdown.length).toBeGreaterThan(0);
    });
  });

  test("@owner sentinel — expense.view yo'q bo'lsada ko'rinadi", async () => {
    const cashier = createCashierService({ audit: noopAudit, priceLookup: stubPriceLookup });

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

      const result = await cashier.dailySummary(ctx(tx, ['@owner']), branchId, dateStr);

      expect(result.expensesTotal).toBe(30000);
      expect(result.netCashFlow).toBe(70000);
    });
  });
});
