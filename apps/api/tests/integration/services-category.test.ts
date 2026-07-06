/**
 * services ↔ service_categories — find-or-create integration test.
 *
 * Tekshiriladi:
 *  1. Yangi category nomi bilan xizmat yaratish → category yaratiladi va bog'lanadi.
 *  2. Mavjud category nomi bilan (kichik harf, CI) xizmat yaratish → yangi row YARATILMAYDI.
 *  3. list/get DTO category nomi va categoryId ni qaytaradi.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env tests/integration/services-category.test.ts`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { serviceCategories, tenants, users } from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createServiceCategoriesService } from '../../src/modules/service-categories/service-categories.service.ts';
import { toServiceDto } from '../../src/modules/services/services.mapper.ts';
import { createServicesService } from '../../src/modules/services/services.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const categories = createServiceCategoriesService({ audit: noopAudit });
const service = createServicesService({ audit: noopAudit, categories });

/** Service va context mock'i — `getDb(c)` → tx, `activeTenantId` → tenantId. */
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

/** Tenant-scoped (RLS) tx — SET LOCAL + fn + commit. */
const withTenant = <T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

let tenantId: string;
let ownerId: string;
let firstServiceId: string;
let firstCategoryId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900099001', passwordHash: 'fake', fullName: 'SvcCat Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('user insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'SvcCat Test Clinic', slug: 'svccat-test', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('services ↔ category find-or-create', () => {
  test("yangi category nomi bilan xizmat yaratish → category yaratiladi va bog'lanadi", async () => {
    const result = await withTenant(tenantId, async (tx) =>
      service.create(ctx(tx, tenantId, ownerId), {
        code: 'TEST-001',
        nameUz: 'Test xizmat 1',
        durationMinutes: 30,
        isActive: true,
        category: 'Jarrohlik',
      }),
    );

    expect(result.categoryId).not.toBeNull();
    firstServiceId = result.id;
    firstCategoryId = result.categoryId as string;

    // list orqali DTO category nomini tekshirish
    const rows = await withTenant(tenantId, (tx) => service.list(ctx(tx, tenantId, ownerId)));
    const dto = rows.map(toServiceDto).find((d) => d.id === firstServiceId);
    expect(dto).toBeDefined();
    expect(dto!.category).toBe('Jarrohlik');
    expect(dto!.categoryId).toBe(firstCategoryId);
  });

  test('mavjud category nomi bilan (kichik harf, CI) xizmat yaratish → yangi category ROW yaratilmaydi', async () => {
    const result = await withTenant(tenantId, async (tx) =>
      service.create(ctx(tx, tenantId, ownerId), {
        code: 'TEST-002',
        nameUz: 'Test xizmat 2',
        durationMinutes: 20,
        isActive: true,
        category: 'jarrohlik', // lowercase — case-insensitive
      }),
    );

    // O'sha category bilan bog'langan bo'lishi kerak (yangi ID EMAS)
    expect(result.categoryId).toBe(firstCategoryId);

    // service_categories da faqat 1 row (tenant-scoped, RLS orqali)
    const catRows = await withTenant(tenantId, (tx) =>
      tx
        .select({ c: sql<number>`count(*)::int` })
        .from(serviceCategories)
        .where(
          and(
            eq(serviceCategories.tenantId, tenantId),
            sql`lower(${serviceCategories.name}) = lower(${'jarrohlik'})`,
          ),
        ),
    );
    expect(catRows[0]?.c).toBe(1);
  });

  test('list/get DTO category nomi va categoryId ni qaytaradi', async () => {
    // list DTO
    const rows = await withTenant(tenantId, (tx) => service.list(ctx(tx, tenantId, ownerId)));
    const dto = rows.map(toServiceDto).find((d) => d.id === firstServiceId);
    expect(dto).toBeDefined();
    expect(typeof dto!.category).toBe('string');
    expect(dto!.category).toBe('Jarrohlik');
    expect(dto!.categoryId).not.toBeNull();
    expect(typeof dto!.categoryId).toBe('string');

    // findById DTO
    const byId = await withTenant(tenantId, (tx) =>
      service.findById(ctx(tx, tenantId, ownerId), firstServiceId),
    );
    expect(byId).not.toBeNull();
    const { prices: _prices, ...row } = byId!;
    const detailDto = toServiceDto(row);
    expect(detailDto.category).toBe('Jarrohlik');
    expect(detailDto.categoryId).toBe(firstCategoryId);
  });
});
