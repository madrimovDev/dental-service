/**
 * CLI-429 — `addAssignment` roleId/branchId tenant'ga tegishliligini `getDb(c)` (RLS) orqali
 * tekshiradi (cross-tenant/ghost oldini olish) + dublikat-guard (idempotent).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-429-add-assignment-validation`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, roles, tenants, userAssignments, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createUsersService } from '../../src/modules/users/users.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createUsersService({ db, audit: noopAudit });

let t1: string;
let t2: string;
let ownerId: string;
let memberId: string;
let roleT1: string;
let roleT2: string; // cross-tenant role
let branchT1: string;
let branchT2: string; // cross-tenant branch

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

const assignmentCount = () =>
  withTx((tx) =>
    tx
      .select({ c: sql<number>`count(*)::int` })
      .from(userAssignments)
      .where(eq(userAssignments.userId, memberId))
      .then((r) => Number(r[0]?.c ?? 0)),
  );

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900004290', passwordHash: 'x', fullName: 'Owner429' })
    .returning({ id: users.id });
  const [member] = await db
    .insert(users)
    .values({ phone: '+998900004291', passwordHash: 'x', fullName: 'Member429' })
    .returning({ id: users.id });
  const [o2] = await db
    .insert(users)
    .values({ phone: '+998900004292', passwordHash: 'x', fullName: 'Owner2-429' })
    .returning({ id: users.id });
  if (!owner || !member || !o2) throw new Error('user insert failed');
  ownerId = owner.id;
  memberId = member.id;

  const [tenant1] = await db
    .insert(tenants)
    .values({ name: 'Assign Clinic', slug: 'assign-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  const [tenant2] = await db
    .insert(tenants)
    .values({ name: 'Other Clinic', slug: 'other-assign', ownerUserId: o2.id })
    .returning({ id: tenants.id });
  if (!tenant1 || !tenant2) throw new Error('tenant insert failed');
  t1 = tenant1.id;
  t2 = tenant2.id;

  await withTx(async (tx) => {
    const [r1] = await tx
      .insert(roles)
      .values({ tenantId: t1, name: 'Doctor' })
      .returning({ id: roles.id });
    const [b1] = await tx
      .insert(branches)
      .values({ tenantId: t1, name: 'Main' })
      .returning({ id: branches.id });
    if (!r1 || !b1) throw new Error('t1 seed failed');
    roleT1 = r1.id;
    branchT1 = b1.id;
  });

  await withTx(async (tx) => {
    const [r2] = await tx
      .insert(roles)
      .values({ tenantId: t2, name: 'DoctorT2' })
      .returning({ id: roles.id });
    const [b2] = await tx
      .insert(branches)
      .values({ tenantId: t2, name: 'MainT2' })
      .returning({ id: branches.id });
    if (!r2 || !b2) throw new Error('t2 seed failed');
    roleT2 = r2.id;
    branchT2 = b2.id;
  }, t2);
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-429 addAssignment tenant-scoped validation', () => {
  test('valid roleId+branchId → ok, qator yaratiladi', async () => {
    const res = await withTx((tx) =>
      service.addAssignment(ctx(tx), memberId, { roleId: roleT1, branchId: branchT1 }),
    );
    expect(res && 'ok' in res && res.ok).toBe(true);
    expect(await assignmentCount()).toBe(1);
  });

  test('cross-tenant roleId → role.not_found, yangi qator YO’Q', async () => {
    const before = await assignmentCount();
    const res = await withTx((tx) => service.addAssignment(ctx(tx), memberId, { roleId: roleT2 }));
    expect(res).toEqual({ ok: false, code: 'role.not_found' });
    expect(await assignmentCount()).toBe(before);
  });

  test('cross-tenant branchId (valid role) → branch.not_found, qator yo’q', async () => {
    const before = await assignmentCount();
    const res = await withTx((tx) =>
      service.addAssignment(ctx(tx), memberId, { roleId: roleT1, branchId: branchT2 }),
    );
    expect(res).toEqual({ ok: false, code: 'branch.not_found' });
    expect(await assignmentCount()).toBe(before);
  });

  test('dublikat (user, role, branch) → yangi qator yaratilmaydi (idempotent)', async () => {
    const before = await assignmentCount();
    const res = await withTx((tx) =>
      service.addAssignment(ctx(tx), memberId, { roleId: roleT1, branchId: branchT1 }),
    );
    expect(res && 'ok' in res && res.ok).toBe(true);
    expect(res && 'alreadyExists' in res && res.alreadyExists).toBe(true);
    expect(await assignmentCount()).toBe(before); // o'zgarmadi
  });

  test('mavjud bo’lmagan userId → null (404)', async () => {
    const res = await withTx((tx) =>
      service.addAssignment(ctx(tx), '00000000-0000-0000-0000-000000000000', {
        roleId: roleT1,
      }),
    );
    expect(res).toBeNull();
  });
});
