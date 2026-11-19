/**
 * FX-134 + FX-135 — filial tekshiruvi (real DB).
 *
 * FX-134: owner boshqa klinikada oddiy xodim bo'lsa, `branches_self_view` RLS policy'si
 *   uning B-klinika filialini A-klinika kontekstida ham ko'rsatadi → workspaceBranches
 *   owner ro'yxatiga B filiali tushardi (tenantId filtri yo'q edi).
 * FX-135: updateAssignment branchId'ni tekshirmasdi (o'chirilgan / boshqa klinika / yo'q
 *   filial); switchWorkspace assignment'dan kelgan filialni tekshirmasdi.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, roles, tenants, userAssignments, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { createApp } from '../../src/app.ts';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { hashPassword } from '../../src/lib/password.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { createAuthService } from '../../src/modules/auth/auth.service.ts';
import { createUsersService } from '../../src/modules/users/users.service.ts';

const IP = `10.134.0.${Math.floor(Math.random() * 250 + 1)}`;
const PW = 'BranchPass123!';
const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const authService = createAuthService({ db });
const usersService = createUsersService({ db, audit: noopAudit });

let tA: string;
let tB: string;
let ownerA: string;
let ownerB: string;
let staffId: string;
let roleA: string;
let bA: string;
let bADeleted: string;
let bB: string;
let assignmentId: string;
let deletedAsgUser: string;

const withTx = <T>(tid: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tid}'`));
    return fn(tx);
  });

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'], sub: ownerA, atid: tA }
          : k === 'activeTenantId'
            ? tA
            : k === 'user'
              ? { id: ownerA }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

const call = (token: string | null, path: string, body: unknown) =>
  createApp().request(`/api${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': IP,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const hash = await hashPassword(PW);
  const us = await db
    .insert(users)
    .values([
      { phone: '+998900134001', passwordHash: hash, fullName: 'Owner A' },
      { phone: '+998900134002', passwordHash: hash, fullName: 'Owner B' },
      { phone: '+998900134003', passwordHash: hash, fullName: 'Staff' },
      { phone: '+998900134004', passwordHash: hash, fullName: 'Deleted branch staff' },
    ])
    .returning({ id: users.id });
  const [oa, ob, st, ds] = us;
  ownerA = oa!.id;
  ownerB = ob!.id;
  staffId = st!.id;
  deletedAsgUser = ds!.id;
  const ts = await db
    .insert(tenants)
    .values([
      { name: 'FX134 A', slug: 'fx134-a', ownerUserId: ownerA },
      { name: 'FX134 B', slug: 'fx134-b', ownerUserId: ownerB },
    ])
    .returning({ id: tenants.id });
  tA = ts[0]!.id;
  tB = ts[1]!.id;

  await withTx(tA, async (tx) => {
    const [r] = await tx.insert(roles).values({ tenantId: tA, name: 'Recep' }).returning();
    roleA = r!.id;
    const [b] = await tx.insert(branches).values({ tenantId: tA, name: 'A main' }).returning();
    bA = b!.id;
    const [d] = await tx
      .insert(branches)
      .values({ tenantId: tA, name: 'A deleted', deletedAt: new Date() })
      .returning();
    bADeleted = d!.id;
    const [a] = await tx
      .insert(userAssignments)
      .values({
        tenantId: tA,
        userId: staffId,
        roleId: roleA,
        branchId: bA,
        isActive: true,
        acceptedAt: new Date(),
      })
      .returning();
    assignmentId = a!.id;
    // Owner A — o'z klinikasidan tashqari B klinikada ham xodim (quyida)
    await tx.insert(userAssignments).values({
      tenantId: tA,
      userId: deletedAsgUser,
      roleId: roleA,
      branchId: bADeleted,
      isActive: true,
      acceptedAt: new Date(),
    });
  });

  await withTx(tB, async (tx) => {
    const [r] = await tx.insert(roles).values({ tenantId: tB, name: 'RecepB' }).returning();
    const [b] = await tx.insert(branches).values({ tenantId: tB, name: 'B main' }).returning();
    bB = b!.id;
    // Owner A va staff B klinikaning filialiga tayinlangan → branches_self_view orqali ko'rinadi
    await tx.insert(userAssignments).values([
      {
        tenantId: tB,
        userId: ownerA,
        roleId: r!.id,
        branchId: bB,
        isActive: true,
        acceptedAt: new Date(),
      },
      {
        tenantId: tB,
        userId: staffId,
        roleId: r!.id,
        branchId: bB,
        isActive: true,
        acceptedAt: new Date(),
      },
    ]);
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await closeRateLimitRedis();
});

describe('FX-134 — owner workspaceBranches boshqa klinika filialini qo‘shmaydi', () => {
  test("owner A boshqa klinikada xodim bo'lsa ham faqat o'z klinikasi filiallari", async () => {
    const res = await authService.workspaceBranches(ownerA, tA);
    expect(res.branches.some((b) => b.id === bB)).toBe(false);
    expect(res.branches.map((b) => b.name).sort()).toEqual(['A main']);
  });
});

describe('FX-135 — updateAssignment branchId tekshiruvi', () => {
  const upd = (branchId: string | null) =>
    withTx(tA, async (tx) => {
      await tx.execute(sql.raw(`SELECT set_config('app.current_user_id', '${ownerA}', true)`));
      return usersService.updateAssignment(ctx(tx), assignmentId, { branchId });
    });
  const current = () =>
    withTx(tA, (tx) =>
      tx
        .select({ branchId: userAssignments.branchId })
        .from(userAssignments)
        .where(eq(userAssignments.id, assignmentId))
        .then((r) => r[0]?.branchId),
    );

  test('o‘chirilgan filial → branch.not_found, yozuv o‘zgarmaydi', async () => {
    expect(await upd(bADeleted)).toEqual({ ok: false, code: 'branch.not_found' });
    expect(await current()).toBe(bA);
  });

  test("boshqa klinika filiali (self_view orqali ko'rinadi) → branch.not_found", async () => {
    expect(await upd(bB)).toEqual({ ok: false, code: 'branch.not_found' });
    expect(await current()).toBe(bA);
  });

  test("mavjud bo'lmagan filial → branch.not_found (FK 500 emas)", async () => {
    expect(await upd('00000000-0000-4000-8000-000000000000')).toEqual({
      ok: false,
      code: 'branch.not_found',
    });
  });

  test('yaroqli filial va null (klinika miqyosi) → ok', async () => {
    const r1 = await upd(bA);
    expect(r1 && 'ok' in r1 && r1.ok).toBe(true);
    const r2 = await upd(null);
    expect(r2 && 'ok' in r2 && r2.ok).toBe(true);
  });
});

describe('FX-135 — switchWorkspace assignment filialini tekshiradi', () => {
  test("assignment filiali o'chirilgan bo'lsa (branchId berilmagan) → 4xx, JWT'ga yozilmaydi", async () => {
    const l = await call(null, '/auth/login', { phone: '+998900134004', password: PW });
    const ld = ((await l.json()) as { data: { accessToken: string; refreshToken: string } }).data;
    const sw = await call(ld.accessToken, '/auth/switch-workspace', {
      tenantId: tA,
      refreshToken: ld.refreshToken,
    });
    expect(sw.status).toBeGreaterThanOrEqual(400);
    expect(sw.status).toBeLessThan(500);
  });
});
