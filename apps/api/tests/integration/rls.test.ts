/**
 * RLS isolation integration test (M1.1 — DAY 1 must-pass).
 *
 * Maqsad: cross-tenant query 0 row qaytarishini DB darajasida sinaymiz.
 * Agar bu test bir kun ishlamasa — kod merge qilinmaydi.
 *
 * Talab: Postgres running, DATABASE_URL .env'da. Test boshlanishida
 * Drizzle migration + RLS DDL apply qilingan bo'lishi kerak.
 *
 * Ishga tushirish: `bun test apps/api/tests/integration/rls.test.ts`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';

let userAId: string;
let userBId: string;
let tenantAId: string;
let tenantBId: string;

beforeAll(async () => {
  // Test'dan oldin RLS bypass qilib (DB superuser yoki BYPASSRLS role) test ma'lumotini
  // tozalaymiz. Production'da test alohida DB instance'da ishlaydi.
  // Hozircha test current connection role'ida ishlaydi — agar role BYPASSRLS bo'lsa
  // ham, FORCE ROW LEVEL SECURITY ALTER TABLE'da yoqilgan, shuning uchun
  // table owner ham filter'ga bo'ysunadi.

  // Test ma'lumotini tozalash uchun RLS context'siz delete urinishi.
  // (RLS yoqilgan jadval — context yo'q bo'lsa 0 row mos keladi.)
  // Avval users va tenants — RLS yo'q.
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('RLS — Multi-tenant isolation', () => {
  test('Setup: create 2 users + 2 tenants + 1 branch each (RLS bypass via root)', async () => {
    // Users (platform-level, RLS yo'q)
    const [userA] = await db
      .insert(users)
      .values({
        phone: '+998900000001',
        passwordHash: 'fake',
        fullName: 'Owner A',
      })
      .returning({ id: users.id });

    const [userB] = await db
      .insert(users)
      .values({
        phone: '+998900000002',
        passwordHash: 'fake',
        fullName: 'Owner B',
      })
      .returning({ id: users.id });

    if (!userA || !userB) throw new Error('User insert failed');
    userAId = userA.id;
    userBId = userB.id;

    // Tenants (RLS yo'q)
    const [tenantA] = await db
      .insert(tenants)
      .values({ name: 'Clinic A', slug: 'clinic-a', ownerUserId: userAId })
      .returning({ id: tenants.id });
    const [tenantB] = await db
      .insert(tenants)
      .values({ name: 'Clinic B', slug: 'clinic-b', ownerUserId: userBId })
      .returning({ id: tenants.id });

    if (!tenantA || !tenantB) throw new Error('Tenant insert failed');
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    // Branches (RLS yoqilgan) — insert qilish uchun tenant_id context o'rnatamiz
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      await tx.insert(branches).values({ tenantId: tenantAId, name: 'Branch A1' });
    });

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantBId}'`));
      await tx.insert(branches).values({ tenantId: tenantBId, name: 'Branch B1' });
    });

    expect(tenantAId).toBeDefined();
    expect(tenantBId).toBeDefined();
  });

  test("Tenant A kontekstida faqat A filiallarini ko'radi", async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      return await tx.select().from(branches);
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.tenantId).toBe(tenantAId);
    expect(result[0]?.name).toBe('Branch A1');
  });

  test("Tenant B kontekstida faqat B filiallarini ko'radi", async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantBId}'`));
      return await tx.select().from(branches);
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.tenantId).toBe(tenantBId);
    expect(result[0]?.name).toBe('Branch B1');
  });

  test("Context o'rnatilmagan bo'lsa hech narsa ko'rinmaydi", async () => {
    // Transaction'siz oddiy query — current_setting('app.current_tenant_id', true)
    // bo'sh string qaytaradi, uuid'ga cast bo'lmaydi → policy false → 0 row
    const result = await db.select().from(branches);
    expect(result).toHaveLength(0);
  });

  test('Cross-tenant query urinishi (tenant A context, tenant B id) — bloklanadi', async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      // Tenant A context'da B branch'larini olishga urinish
      return await tx.select().from(branches).where(sql`${branches.tenantId} = ${tenantBId}`);
    });

    expect(result).toHaveLength(0);
  });
});
