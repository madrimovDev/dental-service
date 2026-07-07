/**
 * CLI-448/451 — non-plan (erkin POS) bemor balansi: to'liq refund = bekor qilingan
 * savdo (hissasi 0), overpay = kredit (manfiy balans). Real DB, cashier.refund()
 * orqali (parentTransactionId ulanishi haqiqiy bo'lishi uchun).
 *
 * Ishga tushirish (yolg'iz — TRUNCATE poygasi):
 *   cd apps/api && bun test tests/integration/cli-448-nonplan-refund-balance.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { branches, patients, services, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';
import { createPatientsService } from '../../src/modules/patients/patients.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const patientsSvc = createPatientsService({ audit: noopAudit });

const stubPriceLookup = {
  getActivePrice: async () => ({ price: '100000' }),
};
const cashierWithPrice = createCashierService({ audit: noopAudit, priceLookup: stubPriceLookup });

const ctx = (tx: DbOrTx, userId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: userId }
              : undefined,
  }) as unknown as Context;

let tenantId: string;
let ownerId: string;
let branchId: string;
let serviceId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000048', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI448 Clinic', slug: 'cli448-clinic', ownerUserId: ownerId })
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

    // cashier_transaction_items.service_id -> services.id FK — non-plan POS test
    // uchun haqiqiy xizmat row kerak (stubPriceLookup narxni almashtiradi, lekin
    // FK saqlanadi).
    const [service] = await tx
      .insert(services)
      .values({ tenantId, code: 'X', nameUz: 'Xizmat X' })
      .returning({ id: services.id });
    if (!service) throw new Error('service insert failed');
    serviceId = service.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

let patientId: string;

beforeEach(async () => {
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Test Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;
  });
});

describe("CLI-448: to'liq refund qilingan non-plan savdo — qarz 0 (bekor qilingan)", () => {
  test("qisman to'langan (60000/100000) savdo TO'LIQ refund qilinsa — balans 0, avval 40000 edi", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx, ownerId);

      const sale = await cashierWithPrice.create(c, {
        branchId,
        patientId,
        items: [{ serviceId, quantity: 1, unitPrice: 100000, serviceName: 'X' }],
        discount: 0,
        paidAmount: 60000,
        paymentMethod: 'cash',
      } as never);

      const before = await patientsSvc.balanceFor(c, patientId);
      expect(before.nonPlanBalance).toBe(40000);

      const refundResult = await cashierWithPrice.refund(c, sale.id, 60000);
      expect(refundResult.ok).toBe(true);

      const after = await patientsSvc.balanceFor(c, patientId);
      expect(after.nonPlanBalance).toBe(0); // CLI-448: avval 40000 bo'lib qolardi
    });
  });

  test('overpay (paidAmount > totalAmount) — balans manfiy (kredit, CLI-451)', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx, ownerId);

      await cashierWithPrice.create(c, {
        branchId,
        patientId,
        items: [{ serviceId, quantity: 1, unitPrice: 100000, serviceName: 'X' }],
        discount: 0,
        paidAmount: 120000,
        paymentMethod: 'cash',
      } as never);

      const balance = await patientsSvc.balanceFor(c, patientId);
      expect(balance.nonPlanBalance).toBe(-20000);
      expect(balance.balance).toBe(-20000);
    });
  });

  test("to'liq to'langan, refundsiz — balans 0 (regressiya)", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx, ownerId);

      // DIQQAT: unitPrice client'dan e'tiborga olinmaydi (CLI-443 — server
      // stubPriceLookup orqali doim 100000 qaytaradi), shuning uchun paidAmount
      // ham 100000 (to'liq to'lov, netTotal bilan mos) — aks holda nonPlanBalance
      // stub narxidan kelib chiqib noldan farqli bo'lib qoladi.
      await cashierWithPrice.create(c, {
        branchId,
        patientId,
        items: [{ serviceId, quantity: 1, unitPrice: 100000, serviceName: 'Y' }],
        discount: 0,
        paidAmount: 100000,
        paymentMethod: 'cash',
      } as never);

      const balance = await patientsSvc.balanceFor(c, patientId);
      expect(balance.nonPlanBalance).toBe(0);
    });
  });

  test("list() ham bir xil formulani qo'llaydi (bulk-aggregate) — qisman to'lov + to'liq refund", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx, ownerId);

      // Diqqat: test 1'dagi kabi DISKRIMINATIV stsenariy (qisman to'lov, keyin
      // to'langan qismning TO'LIQ refundi) — eski formula bunda 40000 qaytarardi
      // (refund qatori type='refund' bo'lgani uchun butunlay chiqarib tashlanardi).
      // To'liq-to'liq (100000/100000) stsenariy eski formulada ham 0 chiqaradi
      // (refund qatorining borligi/yo'qligidan qat'i nazar), shuning uchun
      // list()'ning CLI-448 fix'ini isbotlamas edi.
      const sale = await cashierWithPrice.create(c, {
        branchId,
        patientId,
        items: [{ serviceId, quantity: 1, unitPrice: 100000, serviceName: 'X' }],
        discount: 0,
        paidAmount: 60000,
        paymentMethod: 'cash',
      } as never);
      await cashierWithPrice.refund(c, sale.id, 60000);

      const result = await patientsSvc.list(c, { page: 1, pageSize: 20, archived: false } as never);
      const row = result.data.find((p) => p.id === patientId);
      expect(row?.balance).toBe(0); // to'liq refund — bekor qilingan (avval 40000 bo'lib qolardi)
    });
  });
});
