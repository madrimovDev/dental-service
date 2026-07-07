/**
 * V2-2 (Ombor chuqurligi, CLI-242) — TDD. Advisor qarorlari:
 *  - negative-stock guard ASIMMETRIK: qo'lda 'out' RAD; auto-deduct THROW QILMAYDI.
 *  - low-stock alert TRANSITION'da (chegaradan o'tganda), har harakatda emas.
 *  - recipient = stock.manage egasi ∪ owner; tenant-korrekt (leak yo'q); dedup.
 *  - batch qabul = batch yozuvi + 'in' movement (quantity yagona manba).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-242-stock-depth`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  notifications,
  patients,
  permissions,
  rolePermissions,
  roles,
  serviceMaterials,
  services,
  stockItems,
  tenants,
  userAssignments,
  users,
  visitNotes,
} from '@dental/db-schema';
import { createNoOpChannel } from '@dental/notifications';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { findRecipientsWithPermission } from '../../src/lib/notify-recipients.ts';
import { createNotificationsService } from '../../src/modules/notifications/notifications.service.ts';
import {
  createStockService,
  InsufficientStockError,
} from '../../src/modules/stock/stock.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const notifSvc = createNotificationsService({ sms: createNoOpChannel() });
const stock = createStockService({ audit: noopAudit, notifications: notifSvc });

let t1: string;
let userId: string; // U1 — stock.manage egasi
let ownerId: string; // O1 — owner
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

let branchId: string;
let itemId: string;
let serviceId: string;
let visitNoteId: string;
let t2Owner: string;

const withTx = <T>(fn: (tx: DbOrTx) => Promise<T>, tid = t1): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tid}'`));
    return fn(tx);
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000025', passwordHash: 'x', fullName: 'Owner1' })
    .returning({ id: users.id });
  const [u1] = await db
    .insert(users)
    .values({ phone: '+998900000026', passwordHash: 'x', fullName: 'Manager1' })
    .returning({ id: users.id });
  const [o2] = await db
    .insert(users)
    .values({ phone: '+998900000027', passwordHash: 'x', fullName: 'Owner2' })
    .returning({ id: users.id });
  if (!owner || !u1 || !o2) throw new Error('user insert failed');
  ownerId = owner.id;
  userId = u1.id;
  t2Owner = o2.id;

  const [tenant1] = await db
    .insert(tenants)
    .values({ name: 'Stock Clinic', slug: 'stock-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  const [tenant2] = await db
    .insert(tenants)
    .values({ name: 'Other Clinic', slug: 'other-stock', ownerUserId: t2Owner })
    .returning({ id: tenants.id });
  if (!tenant1 || !tenant2) throw new Error('tenant insert failed');
  t1 = tenant1.id;

  // permission 'stock.manage' (platform-level, RLS yo'q) — bo'lmasa qo'shamiz.
  const [perm] = await db
    .insert(permissions)
    .values({ code: 'stock.manage', category: 'stock' })
    .onConflictDoNothing()
    .returning({ id: permissions.id });
  const permId =
    perm?.id ??
    (
      await db
        .select({ id: permissions.id })
        .from(permissions)
        .where(eq(permissions.code, 'stock.manage'))
    )[0]?.id;
  if (!permId) throw new Error('permission resolve failed');

  await withTx(async (tx) => {
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId: t1, name: 'Main' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');
    branchId = branch.id;

    const [role] = await tx
      .insert(roles)
      .values({ tenantId: t1, name: 'Stock Manager' })
      .returning({ id: roles.id });
    if (!role) throw new Error('role insert failed');
    await tx.insert(rolePermissions).values({ roleId: role.id, permissionId: permId });
    // U1 — branch-null tayinlash (tenant-wide xodim).
    await tx
      .insert(userAssignments)
      .values({ userId, tenantId: t1, branchId: null, roleId: role.id, isActive: true });

    const [item] = await tx
      .insert(stockItems)
      .values({
        tenantId: t1,
        branchId,
        name: 'Anestetik',
        unit: 'dona',
        quantity: '10',
        minThreshold: '5',
      })
      .returning({ id: stockItems.id });
    if (!item) throw new Error('item insert failed');
    itemId = item.id;

    const [svc] = await tx
      .insert(services)
      .values({ tenantId: t1, code: 'S-1', nameUz: 'Plomba' })
      .returning({ id: services.id });
    if (!svc) throw new Error('service insert failed');
    serviceId = svc.id;
    await tx
      .insert(serviceMaterials)
      .values({ tenantId: t1, serviceId: svc.id, itemId, qtyPerService: '100' });

    // deductForServices uchun haqiqiy visit note (source_visit_note_id FK).
    const [p] = await tx
      .insert(patients)
      .values({ tenantId: t1, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    const [vn] = await tx
      .insert(visitNotes)
      .values({ tenantId: t1, patientId: p.id, doctorId: userId })
      .returning({ id: visitNotes.id });
    if (!vn) throw new Error('visit note insert failed');
    visitNoteId = vn.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const lowStockCount = (tx: DbOrTx) =>
  tx
    .select({ c: sql<number>`count(*)` })
    .from(notifications)
    .where(eq(notifications.type, 'stock.low_threshold'))
    .then((r) => Number(r[0]?.c ?? 0));

describe('Ombor chuqurligi — recipient + guard + alert + batch', () => {
  test('recipient: stock.manage egasi (U1) + owner (O1), boshqa tenant owner YO‘Q', async () => {
    const recipients = await withTx((tx) =>
      findRecipientsWithPermission(ctx(tx), 'stock.manage', branchId),
    );
    expect(recipients).toContain(userId);
    expect(recipients).toContain(ownerId);
    expect(recipients).not.toContain(t2Owner); // cross-tenant leak yo'q
    // dedup — U1 bitta marta
    expect(recipients.filter((r) => r === userId)).toHaveLength(1);
  });

  test('qo‘lda out guard: 100 (>10) → InsufficientStockError', async () => {
    await expect(
      withTx((tx) => stock.createMovement(ctx(tx), { itemId, type: 'out', quantity: 100 })),
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });

  test('transition alert: out 6 (10→4, chegara 5 dan o‘tdi) → recipientlarga alert (2)', async () => {
    await withTx((tx) => stock.createMovement(ctx(tx), { itemId, type: 'out', quantity: 6 }));
    expect(await withTx(lowStockCount)).toBe(2); // U1 + owner
  });

  test('chegaradan past bo‘lganda yana out → YANGI alert YO‘Q (transition emas)', async () => {
    await withTx((tx) => stock.createMovement(ctx(tx), { itemId, type: 'out', quantity: 1 }));
    expect(await withTx(lowStockCount)).toBe(2); // o'zgarmadi
  });

  test('auto-deduct (deductForServices) manfiyga tushsa THROW QILMAYDI', async () => {
    // qoldiq hozir 3; service BOM 100 → manfiy. Throw bo'lmasligi kerak.
    await expect(
      withTx((tx) => stock.deductForServices(ctx(tx), [serviceId], visitNoteId)),
    ).resolves.toBeUndefined();
    const [item] = await withTx((tx) =>
      tx.select({ q: stockItems.quantity }).from(stockItems).where(eq(stockItems.id, itemId)),
    );
    expect(Number(item?.q)).toBeLessThan(0);
  });

  test('batch qabul: batch yozuvi + quantity oshadi + expiring qaytaradi', async () => {
    const before = await withTx((tx) =>
      tx.select({ q: stockItems.quantity }).from(stockItems).where(eq(stockItems.id, itemId)),
    );
    const batch = await withTx((tx) =>
      stock.createBatch(ctx(tx), {
        itemId,
        qtyReceived: 50,
        supplierName: 'MedSupply',
        batchNumber: 'B-001',
        expiryDate: '2020-01-01T00:00:00.000Z', // o'tgan → expiring
        costPerUnit: 1500,
      }),
    );
    expect(batch?.supplierName).toBe('MedSupply');
    const after = await withTx((tx) =>
      tx.select({ q: stockItems.quantity }).from(stockItems).where(eq(stockItems.id, itemId)),
    );
    expect(Number(after[0]?.q) - Number(before[0]?.q)).toBe(50);

    const expiring = await withTx((tx) => stock.expiringBatches(ctx(tx), 30));
    expect(expiring.some((b) => b.batchNumber === 'B-001')).toBe(true);

    const list = await withTx((tx) => stock.listBatches(ctx(tx), itemId));
    expect(list).toHaveLength(1);
  });

  test('CLI-453 #5: minThreshold PATCH orqali oshirilsa va joriy quantity yangi chegaradan past bo‘lsa — alert trigger', async () => {
    const freshItem = await withTx((tx) =>
      tx
        .insert(stockItems)
        .values({
          tenantId: t1,
          branchId,
          name: 'Gipsli material',
          unit: 'kg',
          quantity: '8',
          minThreshold: '5',
        })
        .returning({ id: stockItems.id })
        .then((r) => r[0]),
    );
    if (!freshItem) throw new Error('fresh item insert failed');

    const before = await withTx(lowStockCount);

    // minThreshold 5 → 10: 8 < 10 → YANGI transition (avval 8>=5 — past emas edi, endi 8<10 — past).
    await withTx((tx) => stock.updateItem(ctx(tx), freshItem.id, { minThreshold: 10 }));

    expect(await withTx(lowStockCount)).toBe(before + 2); // U1 + owner
  });

  test('CLI-453 #5: minThreshold qayta PATCH (10→10, o‘zgarishsiz) — YANGI alert YO‘Q', async () => {
    const item = await withTx((tx) =>
      tx
        .select({ id: stockItems.id })
        .from(stockItems)
        .where(eq(stockItems.name, 'Gipsli material'))
        .then((r) => r[0]),
    );
    if (!item) throw new Error('item not found');

    const before = await withTx(lowStockCount);
    await withTx((tx) => stock.updateItem(ctx(tx), item.id, { minThreshold: 10 }));
    expect(await withTx(lowStockCount)).toBe(before); // allaqachon 8<10 edi — YANGI transition emas
  });
});
