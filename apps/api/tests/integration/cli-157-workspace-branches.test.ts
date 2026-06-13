/**
 * CLI-157 — `auth.service.workspaceBranches` (REAL DB).
 *
 * Topbar filial almashtirgich manbai. Bu endpoint RBAC-safe: `requirePermission` SIZ
 * (CLI-154/155 precedenti) — shuning uchun cheklangan rol ham 403 olmaydi. Test
 * SERVICE mantiqini ROL-BO'YICHA tekshiradi (`@owner` EMAS — loyiha darsi):
 *
 *  - Owner → tenantning BARCHA filiallari + allowAllBranches=true.
 *  - Cheklangan xodim (1 filial assignment) → FAQAT o'sha filial + allowAllBranches=false.
 *  - branch-siz (null) assignment → allowAllBranches=true, lekin aniq filial yo'q.
 *  - RLS: A tenant konteksti B tenant filialini ko'rmaydi.
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration + RLS DDL apply qilingan.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-157`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, roles, tenants, userAssignments, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuthService } from '../../src/modules/auth/auth.service.ts';

const authService = createAuthService({ db });

// Tenant-scoped (RLS) jadvallarga yozish — `SET LOCAL` bilan tx.
const withTenant = <T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

let tenantAId: string;
let tenantBId: string;
let ownerAId: string;
let ownerBId: string;
let staffOneBranchId: string; // A tenant — faqat 1 filialga biriktirilgan
let staffAllBranchesId: string; // A tenant — branchId=null (barcha filiallar)
let branchMainId: string; // A: Bosh filial
let branchN2Id: string; // A: N2 filial
let branchBId: string; // B tenant filiali (RLS izolyatsiya)

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const inserted = await db
    .insert(users)
    .values([
      { phone: '+998900000060', passwordHash: 'fake', fullName: 'Owner A' },
      { phone: '+998900000061', passwordHash: 'fake', fullName: 'Owner B' },
      { phone: '+998900000062', passwordHash: 'fake', fullName: 'Bir Filial Xodim' },
      { phone: '+998900000063', passwordHash: 'fake', fullName: 'Barcha Filial Xodim' },
    ])
    .returning({ id: users.id });
  const [ownerA, ownerB, staffOne, staffAll] = inserted;
  if (!ownerA || !ownerB || !staffOne || !staffAll) throw new Error('user insert failed');
  ownerAId = ownerA.id;
  ownerBId = ownerB.id;
  staffOneBranchId = staffOne.id;
  staffAllBranchesId = staffAll.id;

  const [tenantA, tenantB] = await db
    .insert(tenants)
    .values([
      { name: 'WS Clinic A', slug: 'ws-clinic-a', ownerUserId: ownerAId },
      { name: 'WS Clinic B', slug: 'ws-clinic-b', ownerUserId: ownerBId },
    ])
    .returning({ id: tenants.id });
  if (!tenantA || !tenantB) throw new Error('tenant insert failed');
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  await withTenant(tenantAId, async (tx) => {
    const [main, n2] = await tx
      .insert(branches)
      .values([
        { tenantId: tenantAId, name: 'Bosh filial' },
        { tenantId: tenantAId, name: 'N2 filial' },
      ])
      .returning({ id: branches.id });
    if (!main || !n2) throw new Error('branch insert failed');
    branchMainId = main.id;
    branchN2Id = n2.id;

    const [role] = await tx
      .insert(roles)
      .values({ tenantId: tenantAId, name: 'Receptionist' })
      .returning({ id: roles.id });
    if (!role) throw new Error('role insert failed');

    await tx.insert(userAssignments).values([
      // Faqat Bosh filialga biriktirilgan xodim
      {
        userId: staffOneBranchId,
        tenantId: tenantAId,
        roleId: role.id,
        branchId: branchMainId,
        isActive: true,
      },
      // branchId=null — barcha filiallar
      {
        userId: staffAllBranchesId,
        tenantId: tenantAId,
        roleId: role.id,
        branchId: null,
        isActive: true,
      },
    ]);
  });

  await withTenant(tenantBId, async (tx) => {
    const [bBranch] = await tx
      .insert(branches)
      .values({ tenantId: tenantBId, name: 'B filial' })
      .returning({ id: branches.id });
    if (!bBranch) throw new Error('branchB insert failed');
    branchBId = bBranch.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe("CLI-157 — workspaceBranches (rol-bo'yicha, @owner EMAS)", () => {
  test('Owner → tenantning BARCHA filiallari + allowAllBranches=true', async () => {
    const res = await authService.workspaceBranches(ownerAId, tenantAId);
    expect(res.allowAllBranches).toBe(true);
    const names = res.branches.map((b) => b.name).sort();
    expect(names).toEqual(['Bosh filial', 'N2 filial']);
  });

  test("Cheklangan xodim (1 filial) → FAQAT o'sha filial + allowAllBranches=false", async () => {
    const res = await authService.workspaceBranches(staffOneBranchId, tenantAId);
    expect(res.allowAllBranches).toBe(false);
    expect(res.branches).toEqual([{ id: branchMainId, name: 'Bosh filial' }]);
    // N2 ni KO'RMASLIGI kerak (faqat o'z assignment doirasi)
    expect(res.branches.some((b) => b.id === branchN2Id)).toBe(false);
  });

  test("branch-siz (null) assignment → allowAllBranches=true, aniq filial yo'q", async () => {
    const res = await authService.workspaceBranches(staffAllBranchesId, tenantAId);
    expect(res.allowAllBranches).toBe(true);
    expect(res.branches).toEqual([]);
  });

  test("RLS: owner A B-tenant filialini KO'RMAYDI", async () => {
    const res = await authService.workspaceBranches(ownerAId, tenantAId);
    expect(res.branches.some((b) => b.id === branchBId)).toBe(false);
  });

  test("Owner B → faqat o'z tenant filiali (RLS izolyatsiya)", async () => {
    const res = await authService.workspaceBranches(ownerBId, tenantBId);
    expect(res.branches).toEqual([{ id: branchBId, name: 'B filial' }]);
  });
});
