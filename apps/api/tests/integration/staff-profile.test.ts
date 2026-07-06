/**
 * Xodim profili integration test (CLI-72) — `staff_profiles` upsert (insert→update
 * onConflict), get (null va mavjud), RLS tenant izolyatsiyasini REAL DB'da tekshiradi.
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration + RLS DDL apply qilingan.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env staff-profile`
 * (Bu testni orkestrator ishga tushiradi — DB shared.)
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { roles, tenants, userAssignments, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createUsersService } from '../../src/modules/users/users.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createUsersService({ db, audit: noopAudit });

// Service `db`, `activeTenantId`, `user`, `accessClaims` o'qiydi.
const ctx = (tx: DbOrTx, tenantId: string, userId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: userId }
            : k === 'accessClaims'
              ? { perms: ['@owner'] }
              : undefined,
  }) as unknown as Context;

let tenantAId: string;
let tenantBId: string;
let ownerAId: string;
let ownerBId: string;
let staffAId: string; // A tenant'dagi xodim user

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [ownerA] = await db
    .insert(users)
    .values({ phone: '+998900000040', passwordHash: 'fake', fullName: 'Owner A' })
    .returning({ id: users.id });
  const [ownerB] = await db
    .insert(users)
    .values({ phone: '+998900000041', passwordHash: 'fake', fullName: 'Owner B' })
    .returning({ id: users.id });
  const [staffA] = await db
    .insert(users)
    .values({ phone: '+998900000042', passwordHash: 'fake', fullName: 'Doctor A' })
    .returning({ id: users.id });
  if (!ownerA || !ownerB || !staffA) throw new Error('user insert failed');
  ownerAId = ownerA.id;
  ownerBId = ownerB.id;
  staffAId = staffA.id;

  const [tenantA] = await db
    .insert(tenants)
    .values({ name: 'Profile Clinic A', slug: 'profile-clinic-a', ownerUserId: ownerAId })
    .returning({ id: tenants.id });
  const [tenantB] = await db
    .insert(tenants)
    .values({ name: 'Profile Clinic B', slug: 'profile-clinic-b', ownerUserId: ownerBId })
    .returning({ id: tenants.id });
  if (!tenantA || !tenantB) throw new Error('tenant insert failed');
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  // CLI-441: upsertProfile endi maqsad userId tenant a'zosi (owner YOKI aktiv
  // assignment) ekanini talab qiladi — staffA uchun tenantA'da assignment.
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
    const [role] = await tx
      .insert(roles)
      .values({ tenantId: tenantAId, name: 'Doctor' })
      .returning({ id: roles.id });
    if (!role) throw new Error('role insert failed');
    await tx
      .insert(userAssignments)
      .values({ userId: staffAId, tenantId: tenantAId, roleId: role.id, isActive: true });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Xodim profili — real DB upsert + get + RLS', () => {
  test("getProfile: profil yo'q bo'lsa null qaytaradi", async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      return service.getProfile(ctx(tx, tenantAId, ownerAId), staffAId);
    });
    expect(result).toBeNull();
  });

  test('upsertProfile: birinchi PUT — INSERT (yangi row)', async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      return service.upsertProfile(ctx(tx, tenantAId, ownerAId), staffAId, {
        specialty: 'Terapevt',
        employmentStatus: 'active',
        startedAt: '2026-01-01',
        baseSalary: 500000,
        commissionPercent: 10,
      });
    });

    // CLI-441: upsertProfile endi { ok, profile } Result qaytaradi (member-guard
    // 'user.not_member' signalini throw'siz bera olishi uchun).
    expect(result.ok).toBe(true);
    const created = result.ok ? result.profile : undefined;
    expect(created?.tenantId).toBe(tenantAId);
    expect(created?.userId).toBe(staffAId);
    expect(created?.specialty).toBe('Terapevt');
    expect(created?.employmentStatus).toBe('active');
    expect(created?.startedAt).toBe('2026-01-01');
    expect(Number(created?.baseSalary)).toBe(500000);
    expect(Number(created?.commissionPercent)).toBe(10);
  });

  test('upsertProfile: ikkinchi PUT — onConflict UPDATE (yangi row emas, almashtirish)', async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      return service.upsertProfile(ctx(tx, tenantAId, ownerAId), staffAId, {
        // specialty/startedAt omitted → replace semantikasi: null'ga tushadi
        employmentStatus: 'on_leave',
        baseSalary: 750000,
        commissionPercent: 15,
      });
    });

    expect(result.ok).toBe(true);
    const updated = result.ok ? result.profile : undefined;
    expect(updated?.employmentStatus).toBe('on_leave');
    expect(updated?.specialty).toBeNull();
    expect(updated?.startedAt).toBeNull();
    expect(Number(updated?.baseSalary)).toBe(750000);
    expect(Number(updated?.commissionPercent)).toBe(15);

    // onConflict ishladi — bitta row (yangi insert qilinmadi)
    const count = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      const rows = await tx.execute(
        sql.raw(`SELECT count(*)::int AS n FROM staff_profiles WHERE user_id = '${staffAId}'`),
      );
      return (rows as unknown as { n: number }[])[0]?.n;
    });
    expect(count).toBe(1);
  });

  test('getProfile: mavjud profilni qaytaradi (raqamlar string)', async () => {
    const profile = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      return service.getProfile(ctx(tx, tenantAId, ownerAId), staffAId);
    });
    expect(profile).not.toBeNull();
    expect(typeof profile?.baseSalary).toBe('string');
    expect(Number(profile?.baseSalary)).toBe(750000);
  });

  test("RLS: tenant B konteksti A profilini ko'rmaydi (null)", async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantBId}'`));
      return service.getProfile(ctx(tx, tenantBId, ownerBId), staffAId);
    });
    expect(result).toBeNull();
  });
});
