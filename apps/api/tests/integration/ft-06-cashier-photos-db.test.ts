/**
 * FT-06.3 — `cashier_transaction_photos` (migratsiya 0072) REAL DB:
 *  - RLS: boshqa tenant qatorini ko'rmaydi / yoza olmaydi (WITH CHECK), cheklangan `dental_app` rol;
 *  - CHECK: `object_key` ham `skipped_reason` ham NULL bo'lolmaydi; bitta to'lovga bitta yozuv;
 *  - `tenant_settings.cashier_photo_enabled` standart `false`;
 *  - backfill SQL: `cashier.photo.view` faqat mavjud tizim Tenant Admin roliga, boshqa rolga YO'Q.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env ft-06-cashier-photos-db`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  branches,
  cashierTransactionPhotos,
  cashierTransactions,
  permissions,
  rolePermissions,
  roles,
  tenantSettings,
  tenants,
  users,
} from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import { createAdminDb, type DbOrTx, db } from '../../src/db/client.ts';

const withTenant = <T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const admin = createAdminDb();
let tA: string;
let tB: string;
let txA: string;
let txB: string;
let userId: string;

const seedTenant = async (id: string, slug: string) => {
  const [b] = await withTenant(id, (tx) =>
    tx
      .insert(branches)
      .values({ tenantId: id, name: `B-${slug}` })
      .returning({ id: branches.id }),
  );
  const [t] = await withTenant(id, (tx) =>
    tx
      .insert(cashierTransactions)
      .values({
        tenantId: id,
        branchId: b?.id ?? '',
        totalAmount: '100000',
        paidAmount: '100000',
        paymentMethod: 'cash',
      })
      .returning({ id: cashierTransactions.id }),
  );
  return t?.id ?? '';
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900000631', passwordHash: 'x', fullName: 'FT06.3' })
    .returning({ id: users.id });
  userId = u?.id ?? '';
  const ts = await db
    .insert(tenants)
    .values([
      { name: 'A', slug: 'ft063a', ownerUserId: userId },
      { name: 'B', slug: 'ft063b', ownerUserId: userId },
    ])
    .returning({ id: tenants.id });
  tA = ts[0]?.id ?? '';
  tB = ts[1]?.id ?? '';
  txA = await seedTenant(tA, 'a');
  txB = await seedTenant(tB, 'b');
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await admin.client.end({ timeout: 5 });
});

describe('cashier_transaction_photos — RLS + CHECK + UNIQUE (real DB, dental_app)', () => {
  test('o‘z tenantida yozadi/o‘qiydi; boshqa tenant ko‘rmaydi', async () => {
    await withTenant(tA, (tx) =>
      tx.insert(cashierTransactionPhotos).values({
        tenantId: tA,
        transactionId: txA,
        objectKey: `tenants/${tA}/cashier-photos/${txA}/p.jpg`,
        capturedBy: userId,
      }),
    );
    const own = await withTenant(tA, (tx) => tx.select().from(cashierTransactionPhotos));
    expect(own).toHaveLength(1);
    const foreign = await withTenant(tB, (tx) => tx.select().from(cashierTransactionPhotos));
    expect(foreign).toHaveLength(0);
  });

  test('WITH CHECK: A kontekstida B tenant_id bilan yozish rad etiladi', async () => {
    await expect(
      withTenant(tA, (tx) =>
        tx.insert(cashierTransactionPhotos).values({
          tenantId: tB,
          transactionId: txB,
          skippedReason: 'no_camera',
        }),
      ),
    ).rejects.toThrow();
    const rows = await admin.db.select().from(cashierTransactionPhotos);
    expect(rows.filter((r) => r.tenantId === tB)).toHaveLength(0);
  });

  test('CHECK: object_key ham skipped_reason ham NULL → rad', async () => {
    await expect(
      withTenant(tB, (tx) =>
        tx.insert(cashierTransactionPhotos).values({ tenantId: tB, transactionId: txB }),
      ),
    ).rejects.toThrow();
  });

  test('skipped_reason bilan (rasmsiz) yoziladi; bitta to‘lovga ikkinchi yozuv → UNIQUE rad', async () => {
    await withTenant(tB, (tx) =>
      tx
        .insert(cashierTransactionPhotos)
        .values({ tenantId: tB, transactionId: txB, skippedReason: 'permission_denied' }),
    );
    await expect(
      withTenant(tB, (tx) =>
        tx
          .insert(cashierTransactionPhotos)
          .values({ tenantId: tB, transactionId: txB, skippedReason: 'no_camera' }),
      ),
    ).rejects.toThrow();
  });

  test('tenant_settings.cashier_photo_enabled standart false', async () => {
    const [s] = await withTenant(tA, (tx) =>
      tx.insert(tenantSettings).values({ tenantId: tA }).returning(),
    );
    expect(s?.cashierPhotoEnabled).toBe(false);
  });
});

describe('0072 backfill — cashier.photo.view', () => {
  test('faqat tizim Tenant Admin roliga qo‘shiladi, boshqa rolga YO‘Q', async () => {
    const [admRole] = await admin.db
      .insert(roles)
      .values({ tenantId: tA, name: 'Tenant Admin', templateKey: 'tenant_admin', isSystem: true })
      .returning({ id: roles.id });
    const [recRole] = await admin.db
      .insert(roles)
      .values({ tenantId: tA, name: 'Receptionist', templateKey: 'receptionist', isSystem: true })
      .returning({ id: roles.id });
    const [customRole] = await admin.db
      .insert(roles)
      .values({ tenantId: tA, name: 'Custom TA', templateKey: null, isSystem: false })
      .returning({ id: roles.id });

    const migration = readFileSync(
      join(import.meta.dir, '..', '..', 'drizzle', '0072_ft06_cashier_photos.sql'),
      'utf8',
    );
    // Faqat backfill qismi (permission INSERT + role_permissions INSERT) — jadval DDL qayta yurmaydi.
    const backfill = migration.slice(migration.indexOf('INSERT INTO "permissions"'));
    for (const stmt of backfill.split('--> statement-breakpoint')) {
      if (stmt.trim()) await admin.client.unsafe(stmt);
    }
    // Idempotent: ikkinchi marta ham xatosiz.
    for (const stmt of backfill.split('--> statement-breakpoint')) {
      if (stmt.trim()) await admin.client.unsafe(stmt);
    }

    const has = async (roleId: string | undefined) => {
      const rows = await admin.db
        .select({ id: rolePermissions.roleId })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(
          and(eq(rolePermissions.roleId, roleId ?? ''), eq(permissions.code, 'cashier.photo.view')),
        );
      return rows.length;
    };
    expect(await has(admRole?.id)).toBe(1);
    expect(await has(recRole?.id)).toBe(0);
    expect(await has(customRole?.id)).toBe(0);
  });
});
