/**
 * service-categories integration test — service-level mantiq + permission guard.
 *
 * Service-level testlar: real DB (RLS-bound tx, withTenant pattern).
 * Permission testlar: sof middleware mock (DB shart emas).
 *
 * Ishga tushirish:
 *   cd apps/api && bun test --env-file=../../.env tests/integration/service-categories.test.ts
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration + RLS DDL apply qilingan.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import { serviceCategories, services, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { requirePermission } from '../../src/middleware/require-permission.ts';
import { createServiceCategoriesService } from '../../src/modules/service-categories/service-categories.service.ts';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const catService = createServiceCategoriesService({ audit: noopAudit });

/** Service `db` (RLS-bound tx) va tenant/user kontekstni o'qiydi. */
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

/** Tenant-scoped tx — `SET LOCAL app.current_tenant_id`. */
const withTenant = <T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

let tenantId: string;
let ownerId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000070', passwordHash: 'fake', fullName: 'Cat Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('user insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Cat Clinic', slug: 'cat-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

// ──────────────────────────────────────────────────────────────────────────────
// Service-level tests (real DB + RLS)
// ──────────────────────────────────────────────────────────────────────────────

describe('findOrCreateByName — case-insensitive dedupe', () => {
  test('yangi nom → yaratadi, mavjud nom (kichik harf) → aynan shu id qaytaradi, faqat 1 row', async () => {
    const id1 = await withTenant(tenantId, (tx) =>
      catService.findOrCreateByName(ctx(tx, tenantId, ownerId), 'Terapevtika'),
    );
    expect(typeof id1).toBe('string');

    // case-insensitive: kichik harf versiyasi → aynan id1
    const id2 = await withTenant(tenantId, (tx) =>
      catService.findOrCreateByName(ctx(tx, tenantId, ownerId), 'terapevtika'),
    );
    expect(id2).toBe(id1);

    // DB'da faqat bitta row
    const rows = await withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(serviceCategories)
        .where(sql`lower(${serviceCategories.name}) = lower(${'Terapevtika'})`),
    );
    expect(rows).toHaveLength(1);
  });
});

describe("DELETE bog'langan kategoriya → 409 in_use", () => {
  test('categoryga biriktirilgan service bor → 409', async () => {
    // 1) Kategoriya yaratish
    const catId = await withTenant(tenantId, (tx) =>
      catService.findOrCreateByName(ctx(tx, tenantId, ownerId), 'Ortopediya'),
    );

    // 2) Unga service biriktirish (soft-delete emas: deletedAt NULL)
    await withTenant(tenantId, (tx) =>
      tx.insert(services).values({
        tenantId,
        code: 'OR-001',
        nameUz: 'Ortopedik xizmat',
        categoryId: catId,
        durationMinutes: 30,
        isActive: true,
      }),
    );

    // 3) DELETE → 409 in_use
    const res = await withTenant(tenantId, (tx) =>
      catService.remove(ctx(tx, tenantId, ownerId), catId),
    );
    expect('error' in res).toBe(true);
    if ('error' in res) {
      expect(res.error).toBe('service_category.in_use');
    }
  });
});

describe("DELETE bo'sh kategoriya → 200 deleted", () => {
  test("servicelar yo'q → muvaffaqiyatli o'chiriladi", async () => {
    // Yangi bo'sh kategoriya
    const catId = await withTenant(tenantId, (tx) =>
      catService.findOrCreateByName(ctx(tx, tenantId, ownerId), "Bo'sh Kategoriya"),
    );

    const res = await withTenant(tenantId, (tx) =>
      catService.remove(ctx(tx, tenantId, ownerId), catId),
    );
    expect('row' in res).toBe(true);
    expect('error' in res).toBe(false);
  });
});

describe('POST dublikat nom → 409 duplicate', () => {
  test('mavjud nom qayta POST → duplicate xato', async () => {
    // Avval yaratish
    const res1 = await withTenant(tenantId, (tx) =>
      catService.create(ctx(tx, tenantId, ownerId), { name: 'Xirurgiya' }),
    );
    expect('row' in res1).toBe(true);

    // Dublikat (kichik harf)
    const res2 = await withTenant(tenantId, (tx) =>
      catService.create(ctx(tx, tenantId, ownerId), { name: 'xirurgiya' }),
    );
    expect('error' in res2).toBe(true);
    if ('error' in res2) {
      expect(res2.error).toBe('service_category.duplicate');
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Permission guard (sof middleware — real DB shart emas)
// ──────────────────────────────────────────────────────────────────────────────

describe('Permission guard — service.view vs service.manage (REAL permset, NOT @owner)', () => {
  // Tenant Admin template'i: service.view + service.manage ikkalasi ham bor
  const adminTemplate = ROLE_TEMPLATES.find((t) => t.templateKey === 'tenant_admin');
  if (!adminTemplate) throw new Error('tenant_admin template not found');
  const adminPerms = [...adminTemplate.permissions] as string[];

  // Doctor template: service.view bor, lekin service.manage yo'q
  const doctorTemplate = ROLE_TEMPLATES.find((t) => t.templateKey === 'doctor');
  if (!doctorTemplate) throw new Error('doctor template not found');
  const doctorPerms = [...doctorTemplate.permissions] as string[];

  /** Berilgan perms bilan Hono app yaratadi — bitta requirePermission guarded route. */
  const guardApp = (perm: Parameters<typeof requirePermission>[0], perms: string[]) => {
    const app = new Hono<{ Variables: { accessClaims: { perms: string[] } } }>();
    app.use('*', (c, next) => {
      c.set('accessClaims', { perms });
      return next();
    });
    app.get('/x', requirePermission(perm), (c) => c.json({ ok: true }));
    return app;
  };

  test("sanity: doctor permset'da service.view bor, service.manage yo'q", () => {
    expect(doctorPerms).toContain('service.view');
    expect(doctorPerms).not.toContain('service.manage');
    expect(doctorPerms).not.toContain('@owner');
  });

  test('service.view guard: doctor → 200', async () => {
    const res = await guardApp('service.view', doctorPerms).request('/x');
    expect(res.status).toBe(200);
  });

  test('service.manage guard: doctor → 403', async () => {
    const res = await guardApp('service.manage', doctorPerms).request('/x');
    expect(res.status).toBe(403);
  });

  test('service.manage guard: tenant_admin → 200', async () => {
    const res = await guardApp('service.manage', adminPerms).request('/x');
    expect(res.status).toBe(200);
  });
});
