/**
 * CLI-441 — LOW-D: Ombor / xodim / workspace hardening (API sub-items).
 *
 *  #3 `getMemberships` validTo filtri — muddati o'tgan assignment endi ro'yxatda ko'rinmaydi
 *     (switchWorkspace bilan izchil).
 *  #4 `upsertProfile` a'zo bo'lmagan userId'ni RAD qiladi (owner carve-out saqlanadi).
 *  #5 `listItems` branchId filtri bilan tenant-bo'ylab (branchId=null) itemlar ham ko'rinadi.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-441-inventory-staff`
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
let staffId: string;
let outsiderId: string; // platform user, tenant'ga hech qanday aloqasi yo'q
let roleId: string;
let branchId: string;

const ctx = (tx: DbOrTx, actorId: string, tid = t1): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tid
            : k === 'user'
              ? { id: actorId }
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
    .values({ phone: '+998900004410', passwordHash: 'x', fullName: 'Owner441' })
    .returning({ id: users.id });
  const [staff] = await db
    .insert(users)
    .values({ phone: '+998900004411', passwordHash: 'x', fullName: 'Staff441' })
    .returning({ id: users.id });
  const [outsider] = await db
    .insert(users)
    .values({ phone: '+998900004412', passwordHash: 'x', fullName: 'Outsider441' })
    .returning({ id: users.id });
  if (!owner || !staff || !outsider) throw new Error('user insert failed');
  ownerId = owner.id;
  staffId = staff.id;
  outsiderId = outsider.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Hardening Clinic', slug: 'hardening-clinic', ownerUserId: ownerId })
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

    // staff — muddati O'TGAN aktiv assignment (validTo < now).
    await tx.insert(userAssignments).values({
      userId: staffId,
      tenantId: t1,
      roleId,
      isActive: true,
      validTo: new Date('2020-01-01T00:00:00Z'),
    });

    // Tenant-bo'ylab item (branchId=null) + filial-scoped item.
    await tx.insert(stockItems).values([
      { tenantId: t1, branchId: null, name: 'Umumiy material', unit: 'dona', quantity: '5' },
      { tenantId: t1, branchId, name: 'Filial material', unit: 'dona', quantity: '10' },
    ]);
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-441 #3 getMemberships validTo filtri', () => {
  test('muddati o‘tgan assignment ro‘yxatda ko‘rinmaydi', async () => {
    const { assignments } = await authService.getMemberships(staffId);
    expect(assignments.find((a) => a.tenantId === t1)).toBeUndefined();
  });
});

describe('CLI-441 #4 upsertProfile member-guard', () => {
  test('owner (assignmentsiz) o‘z profilini yarata oladi (carve-out)', async () => {
    const res = await withTx((tx) =>
      usersService.upsertProfile(ctx(tx, ownerId), ownerId, {
        baseSalary: 1000000,
        commissionPercent: 10,
      }),
    );
    expect(res.ok).toBe(true);
  });

  test('a’zo bo‘lmagan userId (outsider) RAD qilinadi', async () => {
    const res = await withTx((tx) =>
      usersService.upsertProfile(ctx(tx, ownerId), outsiderId, {
        baseSalary: 1000000,
        commissionPercent: 10,
      }),
    );
    expect(res).toEqual({ ok: false, code: 'user.not_member' });
  });
});

describe('CLI-441 #5 listItems null-branch', () => {
  test('branchId filtri bilan tenant-bo‘ylab (null) item ham ko‘rinadi', async () => {
    const rows = await withTx((tx) => stockService.listItems(ctx(tx, ownerId), { branchId }));
    expect(rows.some((r) => r.name === 'Filial material')).toBe(true);
    expect(rows.some((r) => r.name === 'Umumiy material')).toBe(true);
  });
});
