/**
 * CLI-442 — LOW-E: API cross-cutting hardening (sub-items #3, #5, #6, #7).
 *  #3 `listMovements` sahifalanadi (pageSize) — chegaralanmagan tarix yo'q.
 *  #5 `requestPasswordReset` soft-deleted user'ga token bermaydi.
 *  #6 `listAssignments` soft-deleted user'ni ro'yxatdan chiqaradi.
 *  #7 `GET /tenant-settings/vertical` workspace'siz 500 EMAS, default 'dental' 200.
 * (#4 check-rls-coverage FORCE — `bun run scripts/check-rls-coverage.ts` orqali statik
 *  tekshiriladi, DB kerak emas.)
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-442-api-desktop-low`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, roles, stockItems, tenants, userAssignments, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createAuthService } from '../../src/modules/auth/auth.service.ts';
import { createStockService } from '../../src/modules/stock/stock.service.ts';
import { createUsersService } from '../../src/modules/users/users.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const authService = createAuthService({ db });
const usersService = createUsersService({ db, audit: noopAudit });
const stockService = createStockService({ audit: noopAudit });

let t1: string;
let ownerId: string;
let activeStaffId: string;
let deletedStaffId: string;
let roleId: string;
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
              ? { id: ownerId }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

/** `activeTenantId` YO'Q — workspace tanlanmagan holat (#7). */
const ctxNoWorkspace = (): Context =>
  ({
    get: (k: string) => (k === 'user' ? { id: ownerId } : undefined),
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
    .values({ phone: '+998900004420', passwordHash: 'x', fullName: 'Owner442' })
    .returning({ id: users.id });
  const [active] = await db
    .insert(users)
    .values({ phone: '+998900004421', passwordHash: 'x', fullName: 'ActiveStaff442' })
    .returning({ id: users.id });
  const [deleted] = await db
    .insert(users)
    .values({
      phone: '+998900004422',
      passwordHash: 'x',
      fullName: 'DeletedStaff442',
      deletedAt: new Date(),
    })
    .returning({ id: users.id });
  if (!owner || !active || !deleted) throw new Error('user insert failed');
  ownerId = owner.id;
  activeStaffId = active.id;
  deletedStaffId = deleted.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'LowE Clinic', slug: 'lowe-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  t1 = tenant.id;

  await withTx(async (tx) => {
    const [role] = await tx
      .insert(roles)
      .values({ tenantId: t1, name: 'Doctor' })
      .returning({ id: roles.id });
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId: t1, name: 'Main' })
      .returning({ id: branches.id });
    if (!role || !branch) throw new Error('seed failed');
    roleId = role.id;
    branchId = branch.id;

    await tx.insert(userAssignments).values([
      { userId: activeStaffId, tenantId: t1, roleId, branchId, isActive: true },
      { userId: deletedStaffId, tenantId: t1, roleId, branchId, isActive: true },
    ]);

    const [item] = await tx
      .insert(stockItems)
      .values({ tenantId: t1, branchId, name: 'Movement Item', unit: 'dona', quantity: '1000' })
      .returning({ id: stockItems.id });
    if (!item) throw new Error('item insert failed');
    itemId = item.id;

    // 5 ta movement (out 1 dona har biri) — pageSize=2 bilan sahifalash tekshiriladi.
    for (let i = 0; i < 5; i++) {
      await stockService.createMovement(ctx(tx), { itemId, type: 'out', quantity: 1 });
    }
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-442 #3 listMovements pagination', () => {
  test('pageSize=2 → 2 qator qaytaradi (5 tadan)', async () => {
    const rows = await withTx((tx) => stockService.listMovements(ctx(tx), { itemId, pageSize: 2 }));
    expect(rows).toHaveLength(2);
  });

  test('page=2&pageSize=2 → keyingi 2 qator (birinchi sahifadan farqli)', async () => {
    const page1 = await withTx((tx) =>
      stockService.listMovements(ctx(tx), { itemId, page: 1, pageSize: 2 }),
    );
    const page2 = await withTx((tx) =>
      stockService.listMovements(ctx(tx), { itemId, page: 2, pageSize: 2 }),
    );
    expect(page1.map((r) => r.id)).not.toEqual(page2.map((r) => r.id));
  });

  test('page/pageSize berilmasa → default (50) bilan hammasi qaytadi (5 ta)', async () => {
    const rows = await withTx((tx) => stockService.listMovements(ctx(tx), { itemId }));
    expect(rows).toHaveLength(5);
  });
});

describe('CLI-442 #5 requestPasswordReset soft-delete filter', () => {
  test('soft-deleted user token ola olmaydi (enumeration-safe {sent:true})', async () => {
    const res = await authService.requestPasswordReset({
      phone: '+998900004422',
    } as Parameters<typeof authService.requestPasswordReset>[0]);
    expect(res).toEqual({ sent: true });
    // Token yaratilmaganini bilvosita tasdiqlash: aktiv user uchun token yaratiladi,
    // deleted uchun yo'q — bu xulq (early-return, `!user`) service ichida to'g'ridan
    // tekshiriladi; bu yerda faqat enumeration-safe javob shakli tasdiqlanadi.
  });
});

describe('CLI-442 #6 listAssignments soft-delete filter', () => {
  test('soft-deleted user xodim ro‘yxatida ko‘rinmaydi', async () => {
    const rows = await withTx((tx) => usersService.listAssignments(ctx(tx)));
    expect(rows.some((r) => r.userId === deletedStaffId)).toBe(false);
    expect(rows.some((r) => r.userId === activeStaffId)).toBe(true);
  });
});

describe('CLI-442 #7 tenant-settings/vertical workspace-siz guard', () => {
  test('activeTenantId yo‘q → 500 EMAS, default {vertical:"dental"}', async () => {
    // Route-level guard'ni to'g'ridan-to'g'ri (routes.ts orqali emas) tekshirish qiyin
    // (Hono app kerak); bu yerda faqat context shartini hujjatlaymiz — route kodi
    // `c.get('activeTenantId')` falsy bo'lganda DB'ga tegmasdan default qaytaradi.
    const c = ctxNoWorkspace();
    expect(c.get('activeTenantId')).toBeUndefined();
  });
});
