/**
 * CLI-450 — xizmat margin hisoboti: BOM (`service_materials`) + item bo'yicha
 * o'rtacha narx (`stock_batches.costPerUnit`) asosida `materialCost`/`margin`/
 * `marginPct` — v1 approksimatsiya (FIFO/batch-consumption tracking yo'q,
 * dokumentlashtirilgan cheklov). Real DB.
 *
 * Ishga tushirish (yolg'iz — TRUNCATE poygasi):
 *   cd apps/api && bun test tests/integration/cli-450-service-margin.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  cashierTransactionItems,
  cashierTransactions,
  patients,
  serviceMaterials,
  services,
  stockBatches,
  stockItems,
  tenants,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createReportsService } from '../../src/modules/reports/reports.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createReportsService({ audit: noopAudit });
const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db' ? tx : k === 'accessClaims' ? { perms: ['@owner'] } : undefined,
  }) as unknown as Context;

const RANGE = { from: '2026-06-01', to: '2026-06-30' };

let tenantId: string;
let ownerId: string;
let branchId: string;
let patientId: string;
let serviceId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000450', passwordHash: 'x', fullName: 'Doc' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI450 Clinic', slug: 'cli450-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'B' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');
    branchId = branch.id;

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'P' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;

    const [svc] = await tx
      .insert(services)
      .values({ tenantId, code: 'PL-450', nameUz: 'Plomba' })
      .returning({ id: services.id });
    if (!svc) throw new Error('service insert failed');
    serviceId = svc.id;

    const [item] = await tx
      .insert(stockItems)
      .values({ tenantId, name: 'Kompozit', unit: 'dona' })
      .returning({ id: stockItems.id });
    if (!item) throw new Error('stock item insert failed');
    const itemId = item.id;

    // Ikki partiya, turli costPerUnit — o'rtacha narx (1000+3000)/2 = 2000 (v1 approksimatsiya).
    await tx.insert(stockBatches).values([
      { tenantId, itemId, costPerUnit: '1000', qtyReceived: '10' },
      { tenantId, itemId, costPerUnit: '3000', qtyReceived: '10' },
    ]);

    // BOM: har protseduraga 2 dona kompozit → materialCostPerOccurrence = 2 × 2000 = 4000
    await tx.insert(serviceMaterials).values({
      tenantId,
      serviceId,
      itemId,
      qtyPerService: '2',
    });

    // Savdo: 3 marta bajarilgan, refundsiz, chegirmasiz — revenue = 150000, count = 3.
    const [tx1] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId,
        patientId,
        totalAmount: '150000',
        paidAmount: '150000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdAt: new Date('2026-06-10T12:00:00+05:00'),
      })
      .returning({ id: cashierTransactions.id });
    if (!tx1) throw new Error('tx insert failed');
    await tx.insert(cashierTransactionItems).values({
      transactionId: tx1.id,
      serviceId,
      serviceName: 'Plomba',
      quantity: 3,
      unitPrice: '50000',
      subtotal: '150000',
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-450: xizmat margin hisoboti (procedureMix)', () => {
  test('materialCost = qtyPerService × avgCostPerUnit × count; margin = revenue - materialCost', async () => {
    const r = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.dentalAnalytics(ctx(tx), RANGE);
    });

    const row = r.procedureMix.find((p) => p.serviceName === 'Plomba');
    expect(row).toBeDefined();
    expect(row?.count).toBe(3);
    expect(row?.revenue).toBe(150000);
    // avgCost(item) = (1000+3000)/2 = 2000; materialCostPerOccurrence = 2 × 2000 = 4000
    // materialCost (davr) = 4000 × 3 = 12000
    expect(row?.materialCost).toBe(12000);
    expect(row?.margin).toBe(138000); // 150000 − 12000
    expect(row?.marginPct).toBeCloseTo(0.92, 5);
  });

  test("serviceId yo'q (eski/o'chirilgan xizmat snapshot) — materialCost 0, margin = revenue", async () => {
    const r = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

      const [tx2] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId,
          branchId,
          patientId,
          totalAmount: '20000',
          paidAmount: '20000',
          paymentMethod: 'cash',
          type: 'payment',
          status: 'completed',
          createdAt: new Date('2026-06-11T12:00:00+05:00'),
        })
        .returning({ id: cashierTransactions.id });
      if (!tx2) throw new Error('tx2 insert failed');
      await tx.insert(cashierTransactionItems).values({
        transactionId: tx2.id,
        serviceName: "O'chirilgan xizmat",
        quantity: 1,
        unitPrice: '20000',
        subtotal: '20000',
      });

      return service.dentalAnalytics(ctx(tx), RANGE);
    });

    const row = r.procedureMix.find((p) => p.serviceName === "O'chirilgan xizmat");
    expect(row).toBeDefined();
    expect(row?.materialCost).toBe(0);
    expect(row?.margin).toBe(row?.revenue);
    expect(row?.marginPct).toBe(1);
  });
});
