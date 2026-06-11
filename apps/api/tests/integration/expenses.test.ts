/**
 * Xarajatlar integration test (CLI-74) — kategoriya/xarajat CRUD + `summary` GROUP BY'ni
 * REAL DB'da ishga tushiradi. Sof helper yo'q; bu yerda haqiqiy insert / GROUP BY / SUM /
 * RLS tenant izolyatsiyasi tekshiriladi.
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration + RLS DDL apply qilingan.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env expenses`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, expenseCategories, expenses, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createExpensesService } from '../../src/modules/expenses/expenses.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createExpensesService({ audit: noopAudit });

// Service create/summary/list `db`, `activeTenantId`, `user`, `accessClaims` o'qiydi.
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
let branchAId: string;
let catRentId: string; // A: ijara kategoriyasi
let catSalaryId: string; // A: maosh kategoriyasi

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  // Platform jadvallar (RLS yo'q)
  const [ownerA] = await db
    .insert(users)
    .values({ phone: '+998900000020', passwordHash: 'fake', fullName: 'Owner A' })
    .returning({ id: users.id });
  const [ownerB] = await db
    .insert(users)
    .values({ phone: '+998900000021', passwordHash: 'fake', fullName: 'Owner B' })
    .returning({ id: users.id });
  if (!ownerA || !ownerB) throw new Error('owner insert failed');
  ownerAId = ownerA.id;
  ownerBId = ownerB.id;

  const [tenantA] = await db
    .insert(tenants)
    .values({ name: 'Expense Clinic A', slug: 'expense-clinic-a', ownerUserId: ownerAId })
    .returning({ id: tenants.id });
  const [tenantB] = await db
    .insert(tenants)
    .values({ name: 'Expense Clinic B', slug: 'expense-clinic-b', ownerUserId: ownerBId })
    .returning({ id: tenants.id });
  if (!tenantA || !tenantB) throw new Error('tenant insert failed');
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  // Tenant A seed — kategoriya + 2 xarajat (har xil kategoriya/oy)
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));

    const [branch] = await tx
      .insert(branches)
      .values({ tenantId: tenantAId, name: 'Branch A1' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');
    branchAId = branch.id;

    const [rent] = await tx
      .insert(expenseCategories)
      .values({ tenantId: tenantAId, name: 'Ijara' })
      .returning({ id: expenseCategories.id });
    const [salary] = await tx
      .insert(expenseCategories)
      .values({ tenantId: tenantAId, name: 'Maosh' })
      .returning({ id: expenseCategories.id });
    if (!rent || !salary) throw new Error('category insert failed');
    catRentId = rent.id;
    catSalaryId = salary.id;

    // Ijara: yanvar 1,000,000 + fevral 1,200,000 → SUM 2,200,000 (count 2)
    // Maosh: yanvar 3,000,000 → SUM 3,000,000 (count 1)
    await tx.insert(expenses).values([
      {
        tenantId: tenantAId,
        branchId: branchAId,
        categoryId: catRentId,
        amount: '1000000',
        date: '2026-01-15',
      },
      {
        tenantId: tenantAId,
        branchId: branchAId,
        categoryId: catRentId,
        amount: '1200000',
        date: '2026-02-15',
      },
      {
        tenantId: tenantAId,
        branchId: branchAId,
        categoryId: catSalaryId,
        amount: '3000000',
        date: '2026-01-20',
      },
    ]);
  });

  // Tenant B seed — bitta xarajat (RLS scope sinovi uchun, A da ko'rinmasligi shart)
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantBId}'`));
    const [catB] = await tx
      .insert(expenseCategories)
      .values({ tenantId: tenantBId, name: 'B-Ijara' })
      .returning({ id: expenseCategories.id });
    if (!catB) throw new Error('B category insert failed');
    await tx.insert(expenses).values({
      tenantId: tenantBId,
      categoryId: catB.id,
      amount: '9999999',
      date: '2026-01-15',
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Xarajatlar — real DB CRUD + svod', () => {
  test("summary: GROUP BY categoryId — har kategoriya SUM/count to'g'ri", async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      return service.summary(ctx(tx, tenantAId, ownerAId), {});
    });

    expect(result.byCategory).toHaveLength(2);
    const rent = result.byCategory.find((r) => r.categoryId === catRentId);
    const salary = result.byCategory.find((r) => r.categoryId === catSalaryId);
    expect(Number(rent?.total)).toBe(2200000);
    expect(rent?.count).toBe(2);
    expect(Number(salary?.total)).toBe(3000000);
    expect(salary?.count).toBe(1);
    // grandTotal = 2,200,000 + 3,000,000 (B tenant'ning 9,999,999'i kirmaydi → RLS)
    expect(result.grandTotal).toBe(5200000);
  });

  test('summary: davr filtri (from/to) — yanvar oyini ajratadi', async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      return service.summary(ctx(tx, tenantAId, ownerAId), {
        from: '2026-01-01',
        to: '2026-01-31',
      });
    });

    // Yanvar: Ijara 1,000,000 + Maosh 3,000,000 (fevral Ijara 1,200,000 chiqarilgan)
    expect(result.grandTotal).toBe(4000000);
    const rent = result.byCategory.find((r) => r.categoryId === catRentId);
    expect(Number(rent?.total)).toBe(1000000);
  });

  test("list: faqat tenant A xarajatlari (RLS scope) — B ko'rinmaydi", async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      return service.list(ctx(tx, tenantAId, ownerAId), { page: 1, pageSize: 50 });
    });

    expect(result.meta.total).toBe(3);
    expect(result.data.every((e) => e.tenantId === tenantAId)).toBe(true);
    expect(result.data.some((e) => Number(e.amount) === 9999999)).toBe(false);
  });

  test('create: yangi xarajat insert + tenant scope', async () => {
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      return service.create(ctx(tx, tenantAId, ownerAId), {
        categoryId: catRentId,
        branchId: branchAId,
        amount: 500000,
        date: '2026-03-01',
        note: 'Mart ijara',
      });
    });

    expect(created.tenantId).toBe(tenantAId);
    expect(Number(created.amount)).toBe(500000);
    expect(created.createdBy).toBe(ownerAId);

    // Endi A da 4 ta xarajat
    const list = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      return service.list(ctx(tx, tenantAId, ownerAId), { page: 1, pageSize: 50 });
    });
    expect(list.meta.total).toBe(4);
  });

  test("tenant B konteksti: faqat o'z xarajatini ko'radi (cross-tenant bloklangan)", async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantBId}'`));
      return service.list(ctx(tx, tenantBId, ownerBId), { page: 1, pageSize: 50 });
    });

    expect(result.meta.total).toBe(1);
    expect(Number(result.data[0]?.amount)).toBe(9999999);
  });
});
