/**
 * Ombor moduli integration test (CLI-76) — deductForServices (vizit→BOM chiqim) va
 * createMovement (applyMovement + qoldiq yangilash)ni REAL DB'da ishga tushiradi.
 * Sof helper (stock.calc.test.ts) faqat arifmetikani sinaydi; bu yerda haqiqiy
 * BOM join / qoldiq update / out movement sourceVisitNoteId / manfiyga ruxsat tekshiriladi.
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration apply qilingan.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env stock`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  patients,
  serviceMaterials,
  services,
  stockItems,
  stockMovements,
  tenants,
  users,
  visitNotes,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createStockService } from '../../src/modules/stock/stock.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createStockService({ audit: noopAudit });

let tenantId: string;
let ownerId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: ownerId }
            : k === 'accessClaims'
              ? { perms: ['@owner'] }
              : undefined,
  }) as unknown as Context;

let itemId: string; // qty=10, threshold=5
let lowItemId: string; // qty=2, threshold=5 (kam-qoldi seed)
let serviceId: string;
let patientId: string;
let doctorId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000020', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;
  doctorId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Stock Clinic', slug: 'stock-clinic', ownerUserId: ownerId })
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

    const [item] = await tx
      .insert(stockItems)
      .values({
        tenantId,
        branchId: branch.id,
        name: 'Anesteziya',
        unit: 'dona',
        quantity: '10',
        minThreshold: '5',
      })
      .returning({ id: stockItems.id });
    if (!item) throw new Error('item insert failed');
    itemId = item.id;

    const [lowItem] = await tx
      .insert(stockItems)
      .values({
        tenantId,
        branchId: branch.id,
        name: 'Kam material',
        unit: 'dona',
        quantity: '2',
        minThreshold: '5',
      })
      .returning({ id: stockItems.id });
    if (!lowItem) throw new Error('low item insert failed');
    lowItemId = lowItem.id;

    const [svc] = await tx
      .insert(services)
      .values({ tenantId, code: 'PL-001', nameUz: 'Plombalash', nameRu: 'Пломбирование' })
      .returning({ id: services.id });
    if (!svc) throw new Error('service insert failed');
    serviceId = svc.id;

    // BOM: 1 Plombalash → 3 dona Anesteziya
    await tx.insert(serviceMaterials).values({
      tenantId,
      serviceId,
      itemId,
      qtyPerService: '3',
    });

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Ombor — real DB', () => {
  test("deductForServices: BOM bo'yicha qoldiq 10→7, out movement sourceVisitNoteId bilan", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

      const [note] = await tx
        .insert(visitNotes)
        .values({ tenantId, patientId, doctorId, performedServices: [serviceId] })
        .returning({ id: visitNotes.id });
      if (!note) throw new Error('visit note insert failed');

      await service.deductForServices(ctx(tx), [serviceId], note.id);

      const [item] = await tx
        .select({ quantity: stockItems.quantity })
        .from(stockItems)
        .where(eq(stockItems.id, itemId));
      expect(Number(item?.quantity)).toBe(7);

      const movements = await tx
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.sourceVisitNoteId, note.id));
      expect(movements).toHaveLength(1);
      expect(movements[0]?.type).toBe('out');
      expect(Number(movements[0]?.quantity)).toBe(3);
      expect(movements[0]?.reason).toBe('visit_auto');
    });
  });

  test("deductForServices: qoldiq manfiyga tushishi mumkin (guard yo'q)", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

      // lowItem qty=2 uchun vaqtinchalik BOM: 3 chiqim → −1
      await tx
        .insert(serviceMaterials)
        .values({ tenantId, serviceId, itemId: lowItemId, qtyPerService: '3' });

      const [note] = await tx
        .insert(visitNotes)
        .values({ tenantId, patientId, doctorId, performedServices: [serviceId] })
        .returning({ id: visitNotes.id });
      if (!note) throw new Error('visit note insert failed');

      await service.deductForServices(ctx(tx), [serviceId], note.id);

      const [item] = await tx
        .select({ quantity: stockItems.quantity })
        .from(stockItems)
        .where(eq(stockItems.id, lowItemId));
      expect(Number(item?.quantity)).toBe(-1);
    });
  });

  test('createMovement: in +5 → applyMovement qoldiqni yangilaydi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

      // Joriy qoldiqni o'qib, +5 in qilamiz; natija = joriy + 5.
      const [before] = await tx
        .select({ quantity: stockItems.quantity })
        .from(stockItems)
        .where(eq(stockItems.id, itemId));
      const start = Number(before?.quantity);

      const movement = await service.createMovement(ctx(tx), {
        itemId,
        type: 'in',
        quantity: 5,
      });
      expect(movement?.type).toBe('in');

      const [after] = await tx
        .select({ quantity: stockItems.quantity })
        .from(stockItems)
        .where(eq(stockItems.id, itemId));
      expect(Number(after?.quantity)).toBe(start + 5);
    });
  });

  test("listItems: kam-qoldi (lowStock) bayrog'i to'g'ri", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

      const items = await service.listItems(ctx(tx), {});
      const low = items.find((i) => i.id === lowItemId);
      // lowItem oldingi testda −1 ga tushdi → threshold 5 dan past → lowStock true.
      expect(low?.lowStock).toBe(true);
    });
  });
});
