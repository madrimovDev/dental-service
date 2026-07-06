/**
 * CLI-427 — Deaktivlangan xodimni qayta-taklif QAYTA FAOLLASHTIRADI (isActive=true +
 * validTo=null), `reactivated:true` bilan. Haqiqatan aktiv → `alreadyExists:true,
 * reactivated:false`. Boshqa rol → yangi assignment. Reaktivatsiyadan keyin login (switch)
 * ishlaydi.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-427-reinvite-reactivate`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, roles, tenants, userAssignments, users } from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createUsersService } from '../../src/modules/users/users.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createUsersService({ db, audit: noopAudit });

let t1: string;
let ownerId: string;
let roleAId: string;
let roleBId: string;
let branchId: string;

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
    .values({ phone: '+998900004270', passwordHash: 'x', fullName: 'Owner427' })
    .returning({ id: users.id });
  if (!owner) throw new Error('user insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Reinvite Clinic', slug: 'reinvite-clinic', ownerUserId: ownerId })
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

    const [roleA] = await tx
      .insert(roles)
      .values({ tenantId: t1, name: 'Doctor' })
      .returning({ id: roles.id });
    const [roleB] = await tx
      .insert(roles)
      .values({ tenantId: t1, name: 'Nurse' })
      .returning({ id: roles.id });
    if (!roleA || !roleB) throw new Error('role insert failed');
    roleAId = roleA.id;
    roleBId = roleB.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-427 reinvite reactivates deactivated staff', () => {
  test('deaktiv (o’tgan validTo) → qayta-taklif reactivated:true, isActive=true, validTo=null', async () => {
    const phone = '+998900004271';
    // Aktiv assignment yaratamiz.
    const first = await withTx((tx) =>
      service.invite(ctx(tx), { phone, fullName: 'Staff271', roleId: roleAId, branchId }),
    );
    expect(first.ok).toBe(true);

    // Deaktivlaymiz + validTo o'tmishga.
    await withTx((tx) =>
      tx
        .update(userAssignments)
        .set({ isActive: false, validTo: new Date('2020-01-01T00:00:00Z') })
        .where(eq(userAssignments.roleId, roleAId)),
    );

    const second = await withTx((tx) =>
      service.invite(ctx(tx), { phone, fullName: 'Staff271', roleId: roleAId, branchId }),
    );
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('unreachable');
    expect(second.reactivated).toBe(true);
    expect(second.alreadyExists).toBe(false);

    const [row] = await withTx((tx) =>
      tx
        .select()
        .from(userAssignments)
        .where(and(eq(userAssignments.roleId, roleAId), eq(userAssignments.branchId, branchId))),
    );
    expect(row?.isActive).toBe(true);
    expect(row?.validTo).toBeNull();
  });

  test('haqiqatan aktiv → alreadyExists:true, reactivated:false (o’zgarishsiz)', async () => {
    const phone = '+998900004272';
    await withTx((tx) => service.invite(ctx(tx), { phone, fullName: 'Staff272', roleId: roleAId }));
    const again = await withTx((tx) =>
      service.invite(ctx(tx), { phone, fullName: 'Staff272', roleId: roleAId }),
    );
    expect(again.ok).toBe(true);
    if (!again.ok) throw new Error('unreachable');
    expect(again.alreadyExists).toBe(true);
    expect(again.reactivated).toBe(false);
  });

  test('boshqa rol bilan qayta-taklif → yangi assignment (reactivated:false)', async () => {
    const phone = '+998900004273';
    // roleA deaktiv assignment.
    await withTx((tx) => service.invite(ctx(tx), { phone, fullName: 'Staff273', roleId: roleAId }));
    await withTx((tx) =>
      tx
        .update(userAssignments)
        .set({ isActive: false })
        .where(and(eq(userAssignments.roleId, roleAId), sql`branch_id IS NULL`)),
    );
    // roleB bilan taklif → yangi qator, roleA deaktiv qoladi.
    const res = await withTx((tx) =>
      service.invite(ctx(tx), { phone, fullName: 'Staff273', roleId: roleBId }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.reactivated).toBe(false);
    expect(res.alreadyExists).toBe(false);
  });
});
