/**
 * CLI-445 — full-stack DI wiring test (REAL `createApp()`, real HTTP, real DB).
 *
 * The unit-level tests (`cli-445-stock-reconcile-for-services.test.ts`) prove
 * `reconcileForServices` itself is correct, and prove `visit-notes.service.ts`'s
 * `update()` calls whatever `reconcileStock` hook it is given — but NEITHER of
 * them would fail if `clinical.routes.ts` regressed back to the unsafe optional
 * cast (`stockService as StockService & { reconcileForServices?: ... }`) that
 * ALWAYS evaluated to `undefined` before CLI-445. This file closes that gap by
 * driving the exact production wiring: `createApp()` → `clinicalRoutes()` →
 * `visitNotesRoutes({ reconcileStock: stockService.reconcileForServices })`.
 *
 * `POST /api/visit-notes` (performedServices:[X]) → BOM deducted, then
 * `PATCH /api/visit-notes/:id` (performedServices:[]) → real HTTP round-trip →
 * stock restocked. If the cast regresses, `reconcileStock` is `undefined` again,
 * `update()`'s `deps.reconcileStock?.(...)` silently no-ops, and this test's
 * final assertion (quantity restored) fails.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-445-clinical-routes-wiring`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  patients,
  serviceMaterials,
  services,
  stockItems,
  stockMovements,
  tenants,
  users,
} from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

let tenantId: string;
let ownerId: string;
let patientId: string;
let itemId: string;
let serviceId: string;
let ownerToken: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900004451', passwordHash: 'x', fullName: 'Owner445Wiring' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Wiring445 Clinic', slug: 'wiring445-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

    const [item] = await tx
      .insert(stockItems)
      .values({
        tenantId,
        name: 'Wiring Material',
        unit: 'dona',
        quantity: '50',
        minThreshold: '5',
      })
      .returning({ id: stockItems.id });
    if (!item) throw new Error('item insert failed');
    itemId = item.id;

    const [svc] = await tx
      .insert(services)
      .values({ tenantId, code: 'S-445-WIRE', nameUz: 'Wiring xizmat' })
      .returning({ id: services.id });
    if (!svc) throw new Error('service insert failed');
    serviceId = svc.id;
    await tx.insert(serviceMaterials).values({ tenantId, serviceId, itemId, qtyPerService: '4' });

    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor445 Wiring' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;
  });

  const { token } = await signAccess({
    sub: ownerId,
    atid: tenantId,
    abid: null,
    perms: ['@owner'],
    roleKey: null,
    lang: 'uz',
  });
  ownerToken = token;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

// Module-level `db` (no RLS tenant context) — bevosita so'rov FORCE RLS bilan bo'sh
// natija qaytaradi. Boshqa integration testlar bilan bir xil: `SET LOCAL
// app.current_tenant_id` bilan qisqa tx ochib o'qiymiz (yozish emas, faqat o'qish).
const currentQty = async () => {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [row] = await tx
      .select({ q: stockItems.quantity })
      .from(stockItems)
      .where(eq(stockItems.id, itemId));
    return row?.q;
  });
};

describe('CLI-445 — real createApp() HTTP wiring (no direct service composition)', () => {
  test('POST create([X]) deducts BOM, then PATCH performedServices:[] via real HTTP → restock', async () => {
    const app = createApp();

    const createRes = await app.request('/api/visit-notes', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        patientId,
        doctorId: ownerId,
        assessmentDiagnoses: [],
        performedServices: [serviceId],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { data: { id: string } };
    const noteId = created.data.id;

    // create() → deductStock → BOM 1x ayirildi (50 - 4 = 46).
    expect(await currentQty()).toBe('46.00');

    const updateRes = await app.request(`/api/visit-notes/${noteId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ performedServices: [] }),
    });
    expect(updateRes.status).toBe(200);

    // update() → reconcileStock(before=[X], after=[]) via REAL clinical.routes.ts
    // wiring → restock (46 + 4 = 50). If the unsafe cast ever regresses,
    // reconcileStock is undefined again and this assertion fails (stays at 46.00).
    expect(await currentQty()).toBe('50.00');

    const moves = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(stockMovements)
        .where(
          and(eq(stockMovements.itemId, itemId), eq(stockMovements.sourceVisitNoteId, noteId)),
        );
    });
    const restock = moves.find((m) => m.type === 'in');
    expect(restock).toBeDefined();
    expect(restock?.reason).toBe('visit_edit_return');
  });
});
