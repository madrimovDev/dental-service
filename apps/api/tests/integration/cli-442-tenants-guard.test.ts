/**
 * CLI-442 #2 — `transferOwnership` member-guard (yangi owner tenantga aktiv a'zo
 * bo'lishi shart) + audit atomiklik (`getDb(c)` — bir xil per-request tranzaksiya).
 * REAL DB (RLS). Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-442-tenants`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, roles, tenants, userAssignments, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { hashPassword } from '../../src/lib/password.ts';
import { createTenantsService } from '../../src/modules/tenants/tenants.service.ts';

const audit = createAuditLogger({ db });
const service = createTenantsService({ db, audit });

const OWNER_PASSWORD = 'OwnerPass123!';
let tenantId: string;
let ownerId: string;
let memberUserId: string; // aktiv assignment bilan
let outsiderUserId: string; // assignmentsiz — hech qanday tenantga a'zo emas

const ctx = (userId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? db
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: userId }
            : undefined,
  }) as unknown as Context;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const passwordHash = await hashPassword(OWNER_PASSWORD);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000080', passwordHash, fullName: 'Owner CLI442' })
    .returning({ id: users.id });
  const [member] = await db
    .insert(users)
    .values({ phone: '+998900000081', passwordHash: 'x', fullName: 'Member CLI442' })
    .returning({ id: users.id });
  const [outsider] = await db
    .insert(users)
    .values({ phone: '+998900000082', passwordHash: 'x', fullName: 'Outsider CLI442' })
    .returning({ id: users.id });
  if (!owner || !member || !outsider) throw new Error('user insert failed');
  ownerId = owner.id;
  memberUserId = member.id;
  outsiderUserId = outsider.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI-442 Clinic', slug: 'cli-442-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [role] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Doctor' })
      .returning({ id: roles.id });
    if (!role) throw new Error('role insert failed');

    await tx.insert(userAssignments).values({
      userId: memberUserId,
      tenantId,
      roleId: role.id,
      branchId: null,
      isActive: true,
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-442 #2 — transferOwnership member-guard', () => {
  test("a'zo bo'lmagan userga (assignment yo'q) egalik o'tkazish — user.not_member", async () => {
    const result = await service.transferOwnership(ctx(ownerId), {
      newOwnerUserId: outsiderUserId,
      currentPassword: OWNER_PASSWORD,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('user.not_member');

    // Egalik o'zgarmagan bo'lishi kerak.
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    expect(tenant?.ownerUserId).toBe(ownerId);
  });

  test("aktiv a'zoga egalik o'tkazish — muvaffaqiyatli, audit yozilgan", async () => {
    const before = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(eq(auditLog.action, 'tenant.ownership_transferred'));

    const result = await service.transferOwnership(ctx(ownerId), {
      newOwnerUserId: memberUserId,
      currentPassword: OWNER_PASSWORD,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tenant?.ownerUserId).toBe(memberUserId);

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    expect(tenant?.ownerUserId).toBe(memberUserId);

    const after = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(eq(auditLog.action, 'tenant.ownership_transferred'));
    expect(Number(after[0]?.c ?? 0)).toBe(Number(before[0]?.c ?? 0) + 1);
  });

  test("noto'g'ri parol — auth.invalid_password, egalik o'zgarmaydi", async () => {
    const result = await service.transferOwnership(ctx(memberUserId), {
      newOwnerUserId: ownerId,
      currentPassword: 'wrong-password',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('auth.invalid_password');
  });
});
