/**
 * CLI-419 — kunlik summary `paidAmount` (haqiqatda olingan naqd) bilan hisoblanadi,
 * `totalAmount` (hisob-faktura) EMAS. Implementatsiya `cashier.service.ts:445`da
 * allaqachon mavjud (CLI-419 izohi bilan) — bu test yetishmayotgan regressiya
 * qamrovini yopadi (spec: docs/audit-fixes/CLI-419-daily-summary-counts-billed-not-received.md).
 *
 * Ishga tushirish:
 *   cd apps/api && bun test tests/integration/cli-419-daily-summary.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, patients, services, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;

let tenantId: string;
let ownerId: string;
let branchId: string;
let patientId: string;
// CLI-419 spec-plan `crypto.randomUUID()` bilan serviceId'ni to'qib chiqargan edi —
// `cashier_transaction_items.service_id` FK'i `services.id`ga real qator talab qiladi
// (deviation: `cli-444-discount-exceeds-total.test.ts` pattern bilan tuzatildi).
let serviceIdX: string;
let serviceIdY: string;

/** Asia/Tashkent kun-satri — `dailySummary` kun chegarasi bilan mos (cashier.service.ts:434-436). */
const tashkentToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000419', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI419 Clinic', slug: 'cli419-clinic', ownerUserId: ownerId })
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

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Test Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;

    const [svcX] = await tx
      .insert(services)
      .values({ tenantId, code: 'S-419-X', nameUz: 'Xizmat X' })
      .returning({ id: services.id });
    if (!svcX) throw new Error('service X insert failed');
    serviceIdX = svcX.id;

    const [svcY] = await tx
      .insert(services)
      .values({ tenantId, code: 'S-419-Y', nameUz: 'Xizmat Y' })
      .returning({ id: services.id });
    if (!svcY) throw new Error('service Y insert failed');
    serviceIdY = svcY.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: ownerId }
              : undefined,
  }) as unknown as Context;

describe('CLI-419: dailySummary — paidAmount (olingan naqd), totalAmount (hisob-faktura) EMAS', () => {
  test('T1 — kam to‘langan sotuv (paidAmount 800000 < totalAmount 1000000, cash) → breakdown.total === "800000"', async () => {
    const stubPriceLookup = { getActivePrice: async () => ({ price: '1000000' }) };
    const cashier = createCashierService({ audit: noopAudit, priceLookup: stubPriceLookup });

    const today = tashkentToday();

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx);

      await cashier.create(c, {
        branchId,
        patientId,
        items: [{ serviceId: serviceIdX, quantity: 1, unitPrice: 1000000, serviceName: 'X' }],
        discount: 0,
        paidAmount: 800000,
        paymentMethod: 'cash',
      } as never);

      const summary = await cashier.dailySummary(c, branchId, today);
      const cashPaymentRow = summary.breakdown.find(
        (b) => b.paymentMethod === 'cash' && b.type === 'payment',
      );
      // Deviation: `SUM(numeric(14,2))` Postgres'da 2-o'nlik-xonali string qaytaradi
      // (spec taxmin qilgan "800000" emas, "800000.00" — plan taxminidan farq).
      expect(cashPaymentRow?.total).toBe('800000.00');
    });
  });

  test('T2 — refund kunida naqd-chiqim (type=refund) qatori paidAmount bilan ko‘rinadi', async () => {
    const stubPriceLookup = { getActivePrice: async () => ({ price: '500000' }) };
    const cashier = createCashierService({ audit: noopAudit, priceLookup: stubPriceLookup });

    const today = tashkentToday();

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx);

      const sale = await cashier.create(c, {
        branchId,
        patientId,
        items: [{ serviceId: serviceIdY, quantity: 1, unitPrice: 500000, serviceName: 'Y' }],
        discount: 0,
        paidAmount: 500000,
        paymentMethod: 'cash',
      } as never);

      const refundResult = await cashier.refund(c, sale.id, 500000);
      expect(refundResult.ok).toBe(true);

      const summary = await cashier.dailySummary(c, branchId, today);
      const refundRow = summary.breakdown.find(
        (b) => b.paymentMethod === 'cash' && b.type === 'refund',
      );
      // Deviation: `SUM(numeric(14,2))` 2-o'nlik-xonali string qaytaradi (yuqoridagi izoh).
      expect(refundRow?.total).toBe('500000.00');
    });
  });
});
