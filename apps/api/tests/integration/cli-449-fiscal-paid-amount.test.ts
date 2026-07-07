/**
 * CLI-449 — fiskal chek summasi paidAmount (haqiqiy olingan naqd) bilan
 * chaqiriladi, totalAmount (nominal) bilan emas. Spy FiscalProvider — real
 * DB (cashier.create() to'liq oqim, RLS tx ichida).
 *
 * Ishga tushirish:
 *   cd apps/api && bun test tests/integration/cli-449-fiscal-paid-amount.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, patients, services, tenants, users } from '@dental/db-schema';
import type { FiscalPayment, FiscalProvider, FiscalReceipt } from '@dental/fiscal';
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
let serviceId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000049', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI449 Clinic', slug: 'cli449-clinic', ownerUserId: ownerId })
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

    // cashier_transaction_items.serviceId FK talab qiladi — real service row kerak
    // (plan matnida crypto.randomUUID() ishlatilgan edi, lekin bu FK violation beradi).
    const [svc] = await tx
      .insert(services)
      .values({ tenantId, code: 'CLI449-X', nameUz: 'Konsultatsiya' })
      .returning({ id: services.id });
    if (!svc) throw new Error('service insert failed');
    serviceId = svc.id;
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

describe('CLI-449: fiscal.createReceipt amount = paidAmount', () => {
  test("qisman to'langan (60000/100000) savdoda fiscal amount=60000 (paidAmount), 100000 (totalAmount) EMAS", async () => {
    const receivedPayments: FiscalPayment[] = [];
    const spyFiscal: FiscalProvider = {
      async createReceipt(payment) {
        receivedPayments.push(payment);
        return { fiscalId: null, response: { provider: 'spy' } } satisfies FiscalReceipt;
      },
    };
    const stubPriceLookup = { getActivePrice: async () => ({ price: '100000' }) };
    const cashier = createCashierService({
      audit: noopAudit,
      fiscal: spyFiscal,
      priceLookup: stubPriceLookup,
    });

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx);

      await cashier.create(c, {
        branchId,
        patientId,
        items: [{ serviceId, quantity: 1, unitPrice: 100000, serviceName: 'X' }],
        discount: 0,
        paidAmount: 60000,
        paymentMethod: 'cash',
      } as never);
    });

    expect(receivedPayments).toHaveLength(1);
    expect(receivedPayments[0]?.amount).toBe(60000);
  });

  test("to'liq to'langan (100000/100000) savdoda fiscal amount=100000 (regressiya)", async () => {
    const receivedPayments: FiscalPayment[] = [];
    const spyFiscal: FiscalProvider = {
      async createReceipt(payment) {
        receivedPayments.push(payment);
        return { fiscalId: null, response: { provider: 'spy' } } satisfies FiscalReceipt;
      },
    };
    const stubPriceLookup = { getActivePrice: async () => ({ price: '50000' }) };
    const cashier = createCashierService({
      audit: noopAudit,
      fiscal: spyFiscal,
      priceLookup: stubPriceLookup,
    });

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx);

      await cashier.create(c, {
        branchId,
        patientId,
        items: [{ serviceId, quantity: 1, unitPrice: 50000, serviceName: 'Y' }],
        discount: 0,
        paidAmount: 50000,
        paymentMethod: 'cash',
      } as never);
    });

    expect(receivedPayments[0]?.amount).toBe(50000);
  });
});
