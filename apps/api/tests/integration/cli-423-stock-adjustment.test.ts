/**
 * CLI-423 — `adjustment` = SET-TO-VALUE (inventarizatsiya). Kiritilgan `quantity` =
 * aniqlangan (sanalgan) qoldiq; yangi `stock_items.quantity` = shu qiymat; movement
 * qatoriga imzoli DELTA (`target − oldQty`) yoziladi (ledger haqiqiy o'zgarish).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-423-stock-adjustment`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, stockItems, stockMovements, tenants, users } from '@dental/db-schema';
import { createNoOpChannel } from '@dental/notifications';
import { desc, eq, sql } from 'drizzle-orm';
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
    .values({ phone: '+998900004230', passwordHash: 'x', fullName: 'Owner423' })
    .returning({ id: users.id });
  if (!owner) throw new Error('user insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Adj Clinic', slug: 'adj-clinic', ownerUserId: userId })
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

const currentQty = (tx: DbOrTx) =>
  tx
    .select({ q: stockItems.quantity })
    .from(stockItems)
    .where(eq(stockItems.id, itemId))
    .then((r) => r[0]?.q);

const latestMovementQty = (tx: DbOrTx) =>
  tx
    .select({ q: stockMovements.quantity })
    .from(stockMovements)
    .where(eq(stockMovements.itemId, itemId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(1)
    .then((r) => r[0]?.q);

describe('CLI-423 adjustment set-to-value', () => {
  test('inventarizatsiya 100→90: item.quantity=90 (110 EMAS), movement delta=-10', async () => {
    await withTx((tx) =>
      stock.createMovement(ctx(tx), { itemId, type: 'adjustment', quantity: 90 }),
    );
    expect(await withTx(currentQty)).toBe('90.00');
    // Ledger delta (yashirin bug): target emas, imzoli delta yoziladi.
    expect(await withTx(latestMovementQty)).toBe('-10.00');
  });

  test('yuqoriga tuzatish 90→130: item.quantity=130, movement delta=+40', async () => {
    await withTx((tx) =>
      stock.createMovement(ctx(tx), { itemId, type: 'adjustment', quantity: 130 }),
    );
    expect(await withTx(currentQty)).toBe('130.00');
    expect(await withTx(latestMovementQty)).toBe('40.00');
  });

  test('nolga tuzatish 130→0: item.quantity=0, movement delta=-130', async () => {
    await withTx((tx) =>
      stock.createMovement(ctx(tx), { itemId, type: 'adjustment', quantity: 0 }),
    );
    expect(await withTx(currentQty)).toBe('0.00');
    expect(await withTx(latestMovementQty)).toBe('-130.00');
  });
});
