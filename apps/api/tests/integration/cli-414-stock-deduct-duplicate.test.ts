/**
 * CLI-414 (stock-side handoff) — `deductForServices` bir vizitda TAKROR serviceId'larni
 * har OCCURRENCE bo'yicha ayiradi (avval `inArray` distinct serviceId'ni bitta marta
 * ayirardi — `[X,X]` uchun BOM faqat 1x ayirilar edi, 2x kerak).
 *
 * Eslatma: to'liq CLI-414 (visit-notes.service.ts update reconciliation, clinical.routes.ts
 * DI wiring, frontend UI) — bu ticket'ning boshqa qismi, boshqa modul egaligiga tegishli
 * (clinical/ tahrirlanmaydi). Bu test faqat stock-side dedup fix'ni tekshiradi.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-414-stock-deduct-duplicate`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  patients,
  serviceMaterials,
  services,
  stockItems,
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
const stock = createStockService({ audit: noopAudit });

let t1: string;
let ownerId: string;
let itemId: string;
let serviceId: string;
let visitNoteId: string;

const ctx = (tx: DbOrTx, tid = t1): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tid
            : k === 'user'
              ? { id: ownerId }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

const withTx = <T>(fn: (tx: DbOrTx) => Promise<T>, tid = t1): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tid}'`));
    return fn(tx);
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900004140', passwordHash: 'x', fullName: 'Owner414' })
    .returning({ id: users.id });
  if (!owner) throw new Error('user insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Dedup Clinic', slug: 'dedup-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  t1 = tenant.id;

  await withTx(async (tx) => {
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId: t1, name: 'Main' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');

    const [item] = await tx
      .insert(stockItems)
      .values({
        tenantId: t1,
        branchId: branch.id,
        name: 'Anestetik',
        unit: 'dona',
        quantity: '1000',
        minThreshold: '10',
      })
      .returning({ id: stockItems.id });
    if (!item) throw new Error('item insert failed');
    itemId = item.id;

    const [svc] = await tx
      .insert(services)
      .values({ tenantId: t1, code: 'S-414', nameUz: 'Plomba' })
      .returning({ id: services.id });
    if (!svc) throw new Error('service insert failed');
    serviceId = svc.id;
    await tx
      .insert(serviceMaterials)
      .values({ tenantId: t1, serviceId, itemId, qtyPerService: '5' });

    const [p] = await tx
      .insert(patients)
      .values({ tenantId: t1, fullName: 'Bemor414' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    const [vn] = await tx
      .insert(visitNotes)
      .values({ tenantId: t1, patientId: p.id, doctorId: ownerId })
      .returning({ id: visitNotes.id });
    if (!vn) throw new Error('visit note insert failed');
    visitNoteId = vn.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const currentQty = (tx: DbOrTx) =>
  tx
    .select({ q: stockItems.quantity })
    .from(stockItems)
    .where(eq(stockItems.id, itemId))
    .then((r) => r[0]?.q);

describe('CLI-414 deductForServices — duplicate occurrence dedup fix', () => {
  test('serviceIds=[X,X] (bitta vizitda ikki marta) → BOM 2x ayiriladi (10, 5 emas)', async () => {
    await withTx((tx) => stock.deductForServices(ctx(tx), [serviceId, serviceId], visitNoteId));
    // qtyPerService=5, 2 occurrence → 1000 - 10 = 990.
    expect(await withTx(currentQty)).toBe('990.00');
  });

  test('yagona occurrence (regress) → BOM 1x ayiriladi', async () => {
    const before = await withTx(currentQty);
    await withTx((tx) => stock.deductForServices(ctx(tx), [serviceId], visitNoteId));
    const after = await withTx(currentQty);
    expect(Number(before) - Number(after)).toBe(5);
  });
});
