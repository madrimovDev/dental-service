/**
 * CLI-470 — `payroll.service.listStaffNames` (REAL DB).
 *
 * Payroll ekranida xodim ismini `useUserAssignments()` (`user.view`, Accountant'da YO'Q)
 * o'rniga shu yengil `payroll.view`-gated funksiya yechadi (CLI-154/155 precedenti).
 *
 *  - `{userId, fullName}[]` qaytaradi, dedupe (ko'p assignment'li user bitta qator).
 *  - `fullName` bo'sh bo'lsa `phone`ga fallback (listDoctors bilan bir xil pattern).
 *  - Soft-deleted user (`deletedAt`) chiqmaydi.
 *  - RLS: boshqa tenant konteksti ko'rmaydi.
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration + RLS DDL apply qilingan.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-470`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { roles, tenants, userAssignments, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createPayrollService } from '../../src/modules/payroll/payroll.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const payrollService = createPayrollService({ audit: noopAudit });

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

const withTenant = <T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

let tenantAId: string;
let tenantBId: string;
let ownerAId: string;
let ownerBId: string;
let doctorNamedId: string; // fullName bor, IKKI assignment (dedupe)
let doctorNoNameId: string; // fullName YO'Q — phone fallback
let deletedStaffId: string; // soft-deleted — chiqmasligi kerak
let doctorBId: string; // B tenant (RLS izolyatsiya)

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const inserted = await db
    .insert(users)
    .values([
      { phone: '+998900000070', passwordHash: 'fake', fullName: 'Owner A' },
      { phone: '+998900000071', passwordHash: 'fake', fullName: 'Owner B' },
      { phone: '+998900000072', passwordHash: 'fake', fullName: 'Aliyev Shifokor' },
      { phone: '+998900000073', passwordHash: 'fake', fullName: null },
      { phone: '+998900000074', passwordHash: 'fake', fullName: 'Ketgan Xodim' },
      { phone: '+998900000075', passwordHash: 'fake', fullName: 'Doctor B' },
    ])
    .returning({ id: users.id });
  const [ownerA, ownerB, named, noName, deleted, doctorB] = inserted;
  if (!ownerA || !ownerB || !named || !noName || !deleted || !doctorB)
    throw new Error('user insert failed');
  ownerAId = ownerA.id;
  ownerBId = ownerB.id;
  doctorNamedId = named.id;
  doctorNoNameId = noName.id;
  deletedStaffId = deleted.id;
  doctorBId = doctorB.id;

  const [tenantA, tenantB] = await db
    .insert(tenants)
    .values([
      { name: 'Staff Names Clinic A', slug: 'staff-names-clinic-a', ownerUserId: ownerAId },
      { name: 'Staff Names Clinic B', slug: 'staff-names-clinic-b', ownerUserId: ownerBId },
    ])
    .returning({ id: tenants.id });
  if (!tenantA || !tenantB) throw new Error('tenant insert failed');
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  await withTenant(tenantAId, async (tx) => {
    const [doctorRole, assistRole] = await tx
      .insert(roles)
      .values([
        { tenantId: tenantAId, name: 'Doctor' },
        { tenantId: tenantAId, name: 'Doctor + Assistant' },
      ])
      .returning({ id: roles.id });
    if (!doctorRole || !assistRole) throw new Error('roles insert failed');

    await tx.insert(userAssignments).values([
      // doctorNamed — IKKI assignment: dedupe sinovi
      { userId: doctorNamedId, tenantId: tenantAId, roleId: doctorRole.id, isActive: true },
      { userId: doctorNamedId, tenantId: tenantAId, roleId: assistRole.id, isActive: true },
      // fullName yo'q — phone fallback sinovi
      { userId: doctorNoNameId, tenantId: tenantAId, roleId: doctorRole.id, isActive: true },
      // soft-deleted — chiqmasligi kerak
      { userId: deletedStaffId, tenantId: tenantAId, roleId: doctorRole.id, isActive: true },
    ]);

    await tx.update(users).set({ deletedAt: new Date() }).where(eq(users.id, deletedStaffId));
  });

  await withTenant(tenantBId, async (tx) => {
    const [roleB] = await tx
      .insert(roles)
      .values({ tenantId: tenantBId, name: 'Doctor' })
      .returning({ id: roles.id });
    if (!roleB) throw new Error('roleB insert failed');
    await tx
      .insert(userAssignments)
      .values({ userId: doctorBId, tenantId: tenantBId, roleId: roleB.id, isActive: true });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-470 — listStaffNames (payroll.view yengil endpoint)', () => {
  test('fullName bor userlar uchun {userId, fullName} qaytaradi, dedupe', async () => {
    const names = await withTenant(tenantAId, (tx) =>
      payrollService.listStaffNames(ctx(tx, tenantAId, ownerAId)),
    );
    // doctorNamed IKKI assignment'ga ega — distinct bitta qator
    expect(names.filter((n) => n.userId === doctorNamedId)).toHaveLength(1);
    expect(names.find((n) => n.userId === doctorNamedId)).toEqual({
      userId: doctorNamedId,
      fullName: 'Aliyev Shifokor',
    });
  });

  test('fullName yo‘q userlarda phone fallback qilinadi', async () => {
    const names = await withTenant(tenantAId, (tx) =>
      payrollService.listStaffNames(ctx(tx, tenantAId, ownerAId)),
    );
    expect(names.find((n) => n.userId === doctorNoNameId)).toEqual({
      userId: doctorNoNameId,
      fullName: '+998900000073',
    });
  });

  test('soft-deleted user ro‘yxatda ko‘rinmaydi', async () => {
    const names = await withTenant(tenantAId, (tx) =>
      payrollService.listStaffNames(ctx(tx, tenantAId, ownerAId)),
    );
    expect(names.some((n) => n.userId === deletedStaffId)).toBe(false);
  });

  test('RLS: tenant B konteksti A xodimlarini ko‘rmaydi', async () => {
    const names = await withTenant(tenantBId, (tx) =>
      payrollService.listStaffNames(ctx(tx, tenantBId, ownerBId)),
    );
    expect(names.some((n) => n.userId === doctorNamedId)).toBe(false);
    expect(names).toEqual([{ userId: doctorBId, fullName: 'Doctor B' }]);
  });
});
