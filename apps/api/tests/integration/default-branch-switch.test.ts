/**
 * switch-workspace `branchId`siz — standart filial (brauzer sinovi topilmasi, 2026-11-11).
 * Avval tenant-wide xodim va owner `abid=null` olardi → kunlik kassa va filialga bog'liq
 * ekranlar bo'sh. Endi: filialga biriktirilgan xodim → o'z filiali; tenant-wide/owner →
 * eng eski filial. Real DB + HTTP.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, roles, tenants, userAssignments, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { verifyAccess } from '../../src/lib/jwt.ts';
import { hashPassword } from '../../src/lib/password.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';

const IP = `10.68.0.${Math.floor(Math.random() * 250 + 1)}`;
const PW = 'BranchPass123!';
let tenantId: string;
let mainBranch: string;
let secondBranch: string;

const call = (token: string | null, method: string, path: string, body?: unknown) =>
  createApp().request(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': IP,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const switchNoBranch = async (phone: string) => {
  const l = await call(null, 'POST', '/auth/login', { phone, password: PW });
  const ld = ((await l.json()) as { data: { accessToken: string; refreshToken: string } }).data;
  const sw = await call(ld.accessToken, 'POST', '/auth/switch-workspace', {
    tenantId,
    refreshToken: ld.refreshToken,
  });
  expect(sw.status).toBe(200);
  const sd = ((await sw.json()) as { data: { accessToken: string } }).data;
  return verifyAccess(sd.accessToken);
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const hash = await hashPassword(PW);
  const [owner, tenantWide, branchOnly] = await db
    .insert(users)
    .values([
      { phone: '+998900008001', passwordHash: hash, fullName: 'Owner' },
      { phone: '+998900008002', passwordHash: hash, fullName: 'Tenant-wide Buxgalter' },
      { phone: '+998900008003', passwordHash: hash, fullName: 'Ikkinchi filial xodimi' },
    ])
    .returning({ id: users.id });
  const [t] = await db
    .insert(tenants)
    .values({ name: 'Default Branch Clinic', slug: 'default-branch', ownerUserId: owner!.id })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [m] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Bosh filial', createdAt: new Date('2026-01-01') })
      .returning({ id: branches.id });
    const [s2] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Ikkinchi filial', createdAt: new Date('2026-02-01') })
      .returning({ id: branches.id });
    mainBranch = m!.id;
    secondBranch = s2!.id;
    const [role] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Xodim', isTemplate: false, isSystem: false })
      .returning({ id: roles.id });
    await tx.insert(userAssignments).values([
      { tenantId, userId: tenantWide!.id, roleId: role!.id, branchId: null },
      { tenantId, userId: branchOnly!.id, roleId: role!.id, branchId: secondBranch },
    ]);
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await closeRateLimitRedis();
});

describe('switch-workspace — standart filial', () => {
  test('owner → eng eski filial', async () => {
    expect((await switchNoBranch('+998900008001')).abid).toBe(mainBranch);
  });
  test('tenant-wide xodim → eng eski filial', async () => {
    expect((await switchNoBranch('+998900008002')).abid).toBe(mainBranch);
  });
  test("filialga biriktirilgan xodim → o'z filiali", async () => {
    expect((await switchNoBranch('+998900008003')).abid).toBe(secondBranch);
  });
  test("o'chirilgan eng eski filial tanlanmaydi", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await tx.update(branches).set({ deletedAt: new Date() }).where(eq(branches.id, mainBranch));
    });
    expect((await switchNoBranch('+998900008002')).abid).toBe(secondBranch);
  });
});
