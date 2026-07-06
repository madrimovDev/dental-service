/**
 * CLI-424 — `updateItem` `quantity`ni to'g'ridan-to'g'ri o'zgartirmaydi (ledger + low-stock
 * alert chetlanmasin). `quantity` PATCH-item payload'dan CHIQARILDI (Zod strip); qoldiq faqat
 * movement (`createMovement`) / batch (`createBatch`) orqali. Metadata patch ishlaydi.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-424-item-quantity-immutable`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, notifications, stockItems, tenants, users } from '@dental/db-schema';
import { createNoOpChannel } from '@dental/notifications';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createNotificationsService } from '../../src/modules/notifications/notifications.service.ts';
import { createStockService } from '../../src/modules/stock/stock.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const notifSvc = createNotificationsService({ sms: createNoOpChannel() });
const stock = createStockService({ audit: noopAudit, notifications: notifSvc });

let t1: string;
let userId: string;
let branchId: string;
let itemId: string;

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
              ? { id: userId }
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
    .values({ phone: '+998900004240', passwordHash: 'x', fullName: 'Owner424' })
    .returning({ id: users.id });
  if (!owner) throw new Error('user insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Immut Clinic', slug: 'immut-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  t1 = tenant.id;

  await withTx(async (tx) => {
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId: t1, name: 'Main' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');
    branchId = branch.id;

    const [item] = await tx
      .insert(stockItems)
      .values({
        tenantId: t1,
        branchId,
        name: 'Anestetik',
        unit: 'dona',
        quantity: '100',
        minThreshold: '10',
      })
      .returning({ id: stockItems.id });
    if (!item) throw new Error('item insert failed');
    itemId = item.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const readItem = (tx: DbOrTx) =>
  tx
    .select()
    .from(stockItems)
    .where(eq(stockItems.id, itemId))
    .then((r) => r[0]);

const lowStockCount = (tx: DbOrTx) =>
  tx
    .select({ c: sql<number>`count(*)` })
    .from(notifications)
    .where(eq(notifications.type, 'stock.low_threshold'))
    .then((r) => Number(r[0]?.c ?? 0));

describe('CLI-424 item quantity immutable via PATCH', () => {
  test('quantity payload e’tiborsiz: item.quantity o’zgarmaydi (100)', async () => {
    // `quantity` UpdateItemInput'da yo'q — TS-level yo'q; runtime'da Zod strip qiladi.
    // Metadata (name) esa yangilanadi.
    await withTx((tx) =>
      stock.updateItem(ctx(tx), itemId, {
        name: 'Yangi nom',
      } as Parameters<typeof stock.updateItem>[2]),
    );
    const item = await withTx(readItem);
    expect(item?.quantity).toBe('100.00');
    expect(item?.name).toBe('Yangi nom');
  });

  test('metadata patch (minThreshold) ishlaydi, quantity o’zgarmaydi', async () => {
    await withTx((tx) => stock.updateItem(ctx(tx), itemId, { minThreshold: 20 }));
    const item = await withTx(readItem);
    expect(item?.minThreshold).toBe('20.00');
    expect(item?.quantity).toBe('100.00');
  });

  test('alert transition movement orqali to’g’ri ishlaydi (updateItem aralashmaydi)', async () => {
    // threshold=20, quantity=100 → out 85 → 15 (<20) → alert transition bir marta.
    await withTx((tx) => stock.createMovement(ctx(tx), { itemId, type: 'out', quantity: 85 }));
    const item = await withTx(readItem);
    expect(item?.quantity).toBe('15.00');
    expect(await withTx(lowStockCount)).toBe(1);
  });
});
