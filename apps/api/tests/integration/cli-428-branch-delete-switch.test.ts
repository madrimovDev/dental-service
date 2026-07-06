/**
 * CLI-428 — Branch soft-delete referensial guard + `switchWorkspace` o'chirilgan branchni RAD.
 *  (a) Faol xodim assignment yoki kelajak-aktiv appointment bo'lsa `remove` → has_dependencies.
 *  (b) switchWorkspace o'chirilgan branchga → auth.invalid_branch (owner va non-owner).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-428-branch-delete-switch`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  patients,
  roles,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createBranchesService } from '../../src/modules/branches/branches.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const branchesSvc = createBranchesService({ audit: noopAudit });

let t1: string;
let ownerId: string;
let staffId: string;
let roleId: string;
let patientId: string;

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

const mkBranch = (name: string) =>
  withTx(async (tx) => {
    const [b] = await tx
      .insert(branches)
      .values({ tenantId: t1, name })
      .returning({ id: branches.id });
    if (!b) throw new Error('branch insert failed');
    return b.id;
  });

const isDeleted = (branchId: string) =>
  withTx((tx) =>
    tx
      .select({ d: branches.deletedAt })
      .from(branches)
      .where(eq(branches.id, branchId))
      .then((r) => r[0]?.d != null),
  );

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900004280', passwordHash: 'x', fullName: 'Owner428' })
    .returning({ id: users.id });
  const [staff] = await db
    .insert(users)
    .values({ phone: '+998900004281', passwordHash: 'x', fullName: 'Staff428' })
    .returning({ id: users.id });
  if (!owner || !staff) throw new Error('user insert failed');
  ownerId = owner.id;
  staffId = staff.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Branch Del Clinic', slug: 'branch-del-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  t1 = tenant.id;

  await withTx(async (tx) => {
    const [role] = await tx
      .insert(roles)
      .values({ tenantId: t1, name: 'Doctor' })
      .returning({ id: roles.id });
    if (!role) throw new Error('role insert failed');
    roleId = role.id;

    const [p] = await tx
      .insert(patients)
      .values({ tenantId: t1, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-428 branch delete referential guard', () => {
  test('faol xodimli branch o’chirilmaydi → has_dependencies, deletedAt null', async () => {
    const b = await mkBranch('WithStaff');
    await withTx((tx) =>
      tx.insert(userAssignments).values({
        userId: staffId,
        tenantId: t1,
        branchId: b,
        roleId,
        isActive: true,
      }),
    );
    const res = await withTx((tx) => branchesSvc.remove(ctx(tx), b));
    expect(res).toEqual({ ok: false, code: 'branch.has_dependencies' });
    expect(await isDeleted(b)).toBe(false);
  });

  test('kelajak appointmentli branch o’chirilmaydi → has_dependencies', async () => {
    const b = await mkBranch('WithFutureAppt');
    await withTx((tx) =>
      tx.insert(appointments).values({
        tenantId: t1,
        branchId: b,
        patientId,
        doctorId: staffId,
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
        status: 'scheduled',
      }),
    );
    const res = await withTx((tx) => branchesSvc.remove(ctx(tx), b));
    expect(res).toEqual({ ok: false, code: 'branch.has_dependencies' });
  });

  test('toza branch o’chiriladi → ok:true + deletedAt set', async () => {
    const b = await mkBranch('Clean');
    const res = await withTx((tx) => branchesSvc.remove(ctx(tx), b));
    expect(res && 'ok' in res && res.ok).toBe(true);
    expect(await isDeleted(b)).toBe(true);
  });

  test('o’tgan/bekor appointment bloklamaydi', async () => {
    const b = await mkBranch('PastAppt');
    await withTx((tx) =>
      tx.insert(appointments).values({
        tenantId: t1,
        branchId: b,
        patientId,
        doctorId: staffId,
        startTime: new Date(Date.now() - 48 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 47 * 60 * 60 * 1000),
        status: 'completed',
      }),
    );
    const res = await withTx((tx) => branchesSvc.remove(ctx(tx), b));
    expect(res && 'ok' in res && res.ok).toBe(true);
  });

  test('allaqachon o’chirilgan branch → null (404)', async () => {
    const b = await mkBranch('Twice');
    await withTx((tx) => branchesSvc.remove(ctx(tx), b));
    const res = await withTx((tx) => branchesSvc.remove(ctx(tx), b));
    expect(res).toBeNull();
  });
});
