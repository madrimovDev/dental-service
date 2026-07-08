/**
 * CLI-473 — netServiceAggregates GROUP BY endi `service_id` bo'yicha (name emas).
 *
 * Bug: ikkita xizmat bir xil `nameUz`ga ega bo'lsa (masalan ikkala filial/davr
 * uchun alohida yaratilgan "Tozalash"), eski kod `GROUP BY i.service_name`
 * ishlatgani uchun ular BITTA qatorga birlashardi va `serviceId` ixtiyoriy
 * `MAX(service_id::text)` orqali tanlanardi — bu CLI-450 BOM/material-cost
 * lookup'ni noto'g'ri xizmatga bog'lardi (margin xato chiqadi).
 *
 * Fix: GROUP BY service_id (mavjud bo'lsa); service_id NULL bo'lgan qatorlar
 * uchun eskicha nom-bo'yicha fallback guruh saqlanadi (cli-430/cli-450 mavjud
 * testlari — barchasi serviceId'siz item — buni tasdiqlaydi).
 *
 * Ishga tushirish (yolg'iz — TRUNCATE poygasi):
 *   cd apps/api && bun test tests/integration/cli-473-service-id-grouping.test.ts --env-file=../../.env
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
let serviceAId: string;
let serviceBId: string;

const SAME_NAME = 'Tozalash';

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000473', passwordHash: 'x', fullName: 'Doc CLI473' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI473 Clinic', slug: 'cli473-clinic', ownerUserId: ownerId })
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

    // Ikkita alohida xizmat — bir xil nameUz ("Tozalash"), turli service_id.
    const [svcA] = await tx
      .insert(services)
      .values({ tenantId, code: 'CLI473-A', nameUz: SAME_NAME })
      .returning({ id: services.id });
    if (!svcA) throw new Error('svcA insert failed');
    serviceAId = svcA.id;

    const [svcB] = await tx
      .insert(services)
      .values({ tenantId, code: 'CLI473-B', nameUz: SAME_NAME })
      .returning({ id: services.id });
    if (!svcB) throw new Error('svcB insert failed');
    serviceBId = svcB.id;

    const [item] = await tx
      .insert(stockItems)
      .values({ tenantId, name: 'Material', unit: 'dona' })
      .returning({ id: stockItems.id });
    if (!item) throw new Error('stock item insert failed');
    const itemId = item.id;

    await tx
      .insert(stockBatches)
      .values({ tenantId, itemId, costPerUnit: '1000', qtyReceived: '100' });

    // BOM turlicha — A: 1 dona (=1000/ijro), B: 5 dona (=5000/ijro). Bir xil nomdagi
    // xizmatlar noto'g'ri birlashtirilsa, margin ikkalasida ham bitta (noto'g'ri)
    // BOM'ga tayanadi.
    await tx.insert(serviceMaterials).values([
      { tenantId, serviceId: serviceAId, itemId, qtyPerService: '1' },
      { tenantId, serviceId: serviceBId, itemId, qtyPerService: '5' },
    ]);

    // Har xizmat uchun alohida to'lov — 10,000 revenue, refundsiz/chegirmasiz.
    const [txA] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId,
        patientId,
        totalAmount: '10000',
        paidAmount: '10000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdAt: new Date('2026-06-10T12:00:00+05:00'),
      })
      .returning({ id: cashierTransactions.id });
    if (!txA) throw new Error('txA insert failed');
    await tx.insert(cashierTransactionItems).values({
      transactionId: txA.id,
      serviceId: serviceAId,
      serviceName: SAME_NAME,
      quantity: 1,
      unitPrice: '10000',
      subtotal: '10000',
    });

    const [txB] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId,
        patientId,
        totalAmount: '10000',
        paidAmount: '10000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdAt: new Date('2026-06-11T12:00:00+05:00'),
      })
      .returning({ id: cashierTransactions.id });
    if (!txB) throw new Error('txB insert failed');
    await tx.insert(cashierTransactionItems).values({
      transactionId: txB.id,
      serviceId: serviceBId,
      serviceName: SAME_NAME,
      quantity: 1,
      unitPrice: '10000',
      subtotal: '10000',
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const run = <T>(fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx));
  });

describe("CLI-473 — netServiceAggregates service_id bo'yicha guruhlash", () => {
  test('revenue.byService: bir xil nomli, turli service_id xizmatlar ALOHIDA qatorda', async () => {
    const r = await run((c) => service.revenue(c, RANGE));
    const rows = r.byService.filter((s) => s.serviceName === SAME_NAME);
    expect(rows).toHaveLength(2);
    expect(rows.reduce((sum, row) => sum + row.total, 0)).toBe(20000);
  });

  test("dentalAnalytics.procedureMix: har xizmat o'zining BOM/margin qiymatini oladi (aralashmaydi)", async () => {
    const r = await run((c) => service.dentalAnalytics(c, RANGE));
    const rows = r.procedureMix.filter((p) => p.serviceName === SAME_NAME);
    expect(rows).toHaveLength(2);

    // A: qtyPerService=1 × avgCost=1000 = materialCostPerOccurrence 1000 → materialCost 1000
    // B: qtyPerService=5 × avgCost=1000 = materialCostPerOccurrence 5000 → materialCost 5000
    const materialCosts = rows.map((p) => p.materialCost).sort((a, b) => a - b);
    expect(materialCosts).toEqual([1000, 5000]);

    const margins = rows.map((p) => p.margin).sort((a, b) => a - b);
    expect(margins).toEqual([5000, 9000]);

    for (const row of rows) {
      expect(row.revenue).toBe(10000);
      expect(row.count).toBe(1);
    }
  });
});
