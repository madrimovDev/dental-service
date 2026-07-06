/**
 * CLI-445 — `stock.service.ts` `reconcileForServices(c, before[], after[], visitNoteId)`
 * haqiqiy implementatsiyasi. Spec: `docs/audit-fixes/CLI-414-visit-note-stock-reconciliation.md`
 * §3/§4 (multiset diff — delta>0 ayirish `out`/`visit_auto`, delta<0 qaytarish
 * `in`/`visit_edit_return`, occurrence-aware, `stock_movements` yozuvlari bilan).
 *
 * Bu ticket avvalgi `clinical.routes.ts`dagi unsafe cast'ni (har doim undefined'ga
 * tushadigan) haqiqiy funksiyaga bog'laydi — `visit-notes.service.ts`dagi
 * `deps.reconcileStock?.(...)` chaqiruvi endi real ishlaydi.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-445`
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
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createVisitNotesService } from '../../src/modules/clinical/visit-notes/visit-notes.service.ts';
import { createStockService } from '../../src/modules/stock/stock.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const stock = createStockService({ audit: noopAudit });

let t1: string;
let ownerId: string;
let itemXId: string;
let itemYId: string;
let serviceXId: string;
let serviceYId: string;
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
    .values({ phone: '+998900004450', passwordHash: 'x', fullName: 'Owner445' })
    .returning({ id: users.id });
  if (!owner) throw new Error('user insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Reconcile445 Clinic', slug: 'reconcile445-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  t1 = tenant.id;

  await withTx(async (tx) => {
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId: t1, name: 'Main' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');

    const [itemX] = await tx
      .insert(stockItems)
      .values({
        tenantId: t1,
        branchId: branch.id,
        name: 'Material X',
        unit: 'dona',
        quantity: '1000',
        minThreshold: '10',
      })
      .returning({ id: stockItems.id });
    if (!itemX) throw new Error('itemX insert failed');
    itemXId = itemX.id;

    const [itemY] = await tx
      .insert(stockItems)
      .values({
        tenantId: t1,
        branchId: branch.id,
        name: 'Material Y',
        unit: 'dona',
        quantity: '1000',
        minThreshold: '10',
      })
      .returning({ id: stockItems.id });
    if (!itemY) throw new Error('itemY insert failed');
    itemYId = itemY.id;

    const [svcX] = await tx
      .insert(services)
      .values({ tenantId: t1, code: 'S-445-X', nameUz: 'Plomba X' })
      .returning({ id: services.id });
    if (!svcX) throw new Error('svcX insert failed');
    serviceXId = svcX.id;
    await tx
      .insert(serviceMaterials)
      .values({ tenantId: t1, serviceId: serviceXId, itemId: itemXId, qtyPerService: '5' });

    const [svcY] = await tx
      .insert(services)
      .values({ tenantId: t1, code: 'S-445-Y', nameUz: 'Plomba Y' })
      .returning({ id: services.id });
    if (!svcY) throw new Error('svcY insert failed');
    serviceYId = svcY.id;
    await tx
      .insert(serviceMaterials)
      .values({ tenantId: t1, serviceId: serviceYId, itemId: itemYId, qtyPerService: '7' });

    const [p] = await tx
      .insert(patients)
      .values({ tenantId: t1, fullName: 'Bemor445' })
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

const currentQty = (itemId: string) => (tx: DbOrTx) =>
  tx
    .select({ q: stockItems.quantity })
    .from(stockItems)
    .where(eq(stockItems.id, itemId))
    .then((r) => r[0]?.q);

const movementsFor = (itemId: string) => (tx: DbOrTx) =>
  tx
    .select()
    .from(stockMovements)
    .where(
      and(eq(stockMovements.itemId, itemId), eq(stockMovements.sourceVisitNoteId, visitNoteId)),
    );

describe('CLI-445 reconcileForServices — multiset diff (BOM deduct/restock)', () => {
  test('before=[] after=[X] → X BOM 1x ayiriladi (out, visit_auto)', async () => {
    await withTx((tx) => stock.reconcileForServices(ctx(tx), [], [serviceXId], visitNoteId));

    expect(await withTx(currentQty(itemXId))).toBe('995.00'); // 1000 - 5
    const moves = await withTx(movementsFor(itemXId));
    expect(moves.length).toBe(1);
    expect(moves[0]?.type).toBe('out');
    expect(moves[0]?.reason).toBe('visit_auto');
  });

  test('before=[X] after=[X,Y] → faqat Y BOM ayiriladi (delta), X tegilmaydi', async () => {
    const xBefore = await withTx(currentQty(itemXId));

    await withTx((tx) =>
      stock.reconcileForServices(ctx(tx), [serviceXId], [serviceXId, serviceYId], visitNoteId),
    );

    expect(await withTx(currentQty(itemXId))).toBe(xBefore); // X unchanged
    expect(await withTx(currentQty(itemYId))).toBe('993.00'); // 1000 - 7
  });

  test('before=[X,Y] after=[X] → Y BOM qaytariladi (in, visit_edit_return)', async () => {
    const yBefore = await withTx(currentQty(itemYId));

    await withTx((tx) =>
      stock.reconcileForServices(ctx(tx), [serviceXId, serviceYId], [serviceXId], visitNoteId),
    );

    expect(await withTx(currentQty(itemYId))).toBe('1000.00'); // 993 + 7 restocked
    expect(Number(await withTx(currentQty(itemYId)))).toBeGreaterThan(Number(yBefore));

    const moves = await withTx(movementsFor(itemYId));
    const restock = moves.find((m) => m.type === 'in');
    expect(restock).toBeDefined();
    expect(restock?.reason).toBe('visit_edit_return');
  });

  test("bir xil PATCH (before=[X] after=[X]) → nol yangi movement, qty o'zgarmaydi", async () => {
    const xBefore = await withTx(currentQty(itemXId));
    const movesBefore = await withTx(movementsFor(itemXId));

    await withTx((tx) =>
      stock.reconcileForServices(ctx(tx), [serviceXId], [serviceXId], visitNoteId),
    );

    expect(await withTx(currentQty(itemXId))).toBe(xBefore);
    const movesAfter = await withTx(movementsFor(itemXId));
    expect(movesAfter.length).toBe(movesBefore.length);
  });

  test('duplikat occurrence: before=[X] after=[X,X] → delta=+1, X 1x ayiriladi', async () => {
    const xBefore = Number(await withTx(currentQty(itemXId)));

    await withTx((tx) =>
      stock.reconcileForServices(ctx(tx), [serviceXId], [serviceXId, serviceXId], visitNoteId),
    );

    const xAfter = Number(await withTx(currentQty(itemXId)));
    expect(xBefore - xAfter).toBe(5); // 1 occurrence delta * qtyPerService=5
  });

  test("before=[X] after=[] → X BOM to'liq qaytariladi", async () => {
    // Reset to a clean baseline for this scenario.
    const before = Number(await withTx(currentQty(itemXId)));

    await withTx((tx) => stock.reconcileForServices(ctx(tx), [serviceXId], [], visitNoteId));

    const after = Number(await withTx(currentQty(itemXId)));
    expect(after - before).toBe(5);
  });
});

describe('CLI-445 — end-to-end wiring (clinical.routes.ts pattern, NO spy)', () => {
  // Bu blok `clinical.routes.ts` qanday DI qilishini AYNAN takrorlaydi:
  // `createVisitNotesService({ ..., reconcileStock: stockService.reconcileForServices })`.
  // Spy YO'Q — agar clinical.routes.ts'dagi unsafe cast qaytarilsa (yoki reconcileStock
  // wiring'dan tushib qolsa), bu test QIZIL bo'lishi kerak (faqat `update()` PATCH orqali
  // reconcile ishlayotganini isbotlaydi, `reconcileForServices`ni to'g'ridan chaqirish emas).
  const vnService = createVisitNotesService({
    audit: noopAudit,
    deductStock: stock.deductForServices,
    reconcileStock: stock.reconcileForServices,
  });

  let e2ePatientId: string;
  let e2eItemId: string;
  let e2eServiceId: string;

  beforeAll(async () => {
    await withTx(async (tx) => {
      const [item] = await tx
        .insert(stockItems)
        .values({
          tenantId: t1,
          name: 'Material E2E',
          unit: 'dona',
          quantity: '100',
          minThreshold: '5',
        })
        .returning({ id: stockItems.id });
      if (!item) throw new Error('e2e item insert failed');
      e2eItemId = item.id;

      const [svc] = await tx
        .insert(services)
        .values({ tenantId: t1, code: 'S-445-E2E', nameUz: 'E2E xizmat' })
        .returning({ id: services.id });
      if (!svc) throw new Error('e2e service insert failed');
      e2eServiceId = svc.id;
      await tx
        .insert(serviceMaterials)
        .values({ tenantId: t1, serviceId: e2eServiceId, itemId: e2eItemId, qtyPerService: '3' });

      const [p] = await tx
        .insert(patients)
        .values({ tenantId: t1, fullName: 'Bemor445 E2E' })
        .returning({ id: patients.id });
      if (!p) throw new Error('e2e patient insert failed');
      e2ePatientId = p.id;
    });
  });

  test('create([X]) BOM ayiradi, keyin PATCH performedServices:[] → restock (real update() orqali)', async () => {
    const noteId = await withTx(async (tx) => {
      const note = await vnService.create(ctx(tx), {
        patientId: e2ePatientId,
        doctorId: ownerId,
        assessmentDiagnoses: [],
        performedServices: [e2eServiceId],
      });
      if (!note) throw new Error('create failed');
      return note.id;
    });

    // create() → deductStock → BOM 1x ayirildi (100 - 3 = 97).
    expect(await withTx(currentQty(e2eItemId))).toBe('97.00');

    // PATCH performedServices:[] → update() → reconcileStock(before=[X], after=[]) → restock.
    await withTx((tx) => vnService.update(ctx(tx), noteId, { performedServices: [] }));

    expect(await withTx(currentQty(e2eItemId))).toBe('100.00');

    const moves = await withTx((tx) =>
      tx
        .select()
        .from(stockMovements)
        .where(
          and(eq(stockMovements.itemId, e2eItemId), eq(stockMovements.sourceVisitNoteId, noteId)),
        ),
    );
    const restock = moves.find((m) => m.type === 'in');
    expect(restock).toBeDefined();
    expect(restock?.reason).toBe('visit_edit_return');
    expect(restock?.sourceVisitNoteId).toBe(noteId);
  });
});
