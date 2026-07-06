# Xizmat kategoriyalari Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `services.category` erkin-matnini normallashtirilgan `service_categories` jadvaliga ajratish — to'liq CRUD, alohida frontend sahifa, va xizmat formasida backend find-or-create.

**Architecture:** Yangi tenant-scoped `service_categories` jadvali (RLS). `services.category` (text) → `category_id` (FK, `ON DELETE RESTRICT`). Backend modul (services bilan bir xil shaklda: routes/service/schema/mapper/index, inline Drizzle querylar). Xizmat saqlanganda backend `findOrCreateByName` orqali kategoriyani topadi yoki yaratadi. Frontend'da alohida feature + sahifa; xizmat formasida `Autocomplete`.

**Tech Stack:** Bun, Hono, `@hono/zod-openapi`, Drizzle, PostgreSQL RLS, Zod 4, React 18, Mantine v7, TanStack Query, Vitest (web), `bun:test` (api).

## Global Constraints

- DB ustun: `snake_case`; TS: `camelCase`/`PascalCase`; fayl: `kebab-case`; permission: `resource.action`.
- Har tenant-scoped jadval `tenant_id UUID NOT NULL` + RLS (`apps/api/migrations/rls/*.sql`) + `bun run check:rls` yashil bo'lishi shart.
- Service factory DI — NestJS/dekorator YO'Q. `getDb(c)` (RLS-bound), hech qachon `import { db }` to'g'ridan.
- Web: hech qachon `fetch()` to'g'ridan — generated `@dental/api-client`. Forms: `@mantine/form` + `zod4Resolver`. Pul: `lib/format.ts` (bu yerda pul yo'q).
- i18n: hardcoded matn YO'Q — `t()`; `uz.json` + `ru.json` ikkalasi yangilanadi.
- Permission: faqat mavjud `service.view` (ko'rish) / `service.manage` (yozish). Yangi permission YO'Q.
- Tests: api = `bun test --env-file=../../.env` (bun:test); web = vitest. Rol-bo'yicha tekshirish real restricted permset bilan, `@owner` EMAS.
- Migration tartibi: schema o'zgartirish → `drizzle:generate` → backfill SQL qo'lda qo'shish → RLS fayl → `check:rls` → migrate.

---

### Task 1: DB schema — `service_categories` jadvali + `services.category_id`

**Files:**
- Create: `packages/db-schema/src/tables/service-categories.ts`
- Modify: `packages/db-schema/src/tables/services.ts`
- Modify: `packages/db-schema/src/index.ts`

**Interfaces:**
- Produces: `serviceCategories` (Drizzle table), `ServiceCategory` (`$inferSelect`), `ServiceCategoryInsert`. `services` jadvalida `categoryId: uuid | null` (eski `category: text` o'rniga).

- [ ] **Step 1: `service-categories.ts` jadval faylini yaratish**

```ts
import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.ts';

/**
 * Service categories — xizmat kategoriyalari katalogi.
 * Tenant-scoped (RLS yoqilgan). services.category_id shu jadvalga ishora qiladi.
 */
export const serviceCategories = pgTable(
  'service_categories',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    nameRu: text('name_ru'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('service_categories_tenant_name_unique').on(t.tenantId, t.name),
    index('service_categories_tenant_idx').on(t.tenantId),
  ],
);

export type ServiceCategory = typeof serviceCategories.$inferSelect;
export type ServiceCategoryInsert = typeof serviceCategories.$inferInsert;
```

- [ ] **Step 2: `services.ts` — `category` ustunini `category_id` FK ga almashtirish**

`packages/db-schema/src/tables/services.ts` da:

Import qatoriga `serviceCategories` qo'shing (tenants importidan keyin):
```ts
import { serviceCategories } from './service-categories.ts';
```

`category: text('category'),` qatorini o'chiring va o'rniga:
```ts
    categoryId: uuid('category_id').references(() => serviceCategories.id, {
      onDelete: 'restrict',
    }),
```

Indekslar massivida `index('services_tenant_category_idx').on(t.tenantId, t.category),` ni o'chiring va o'rniga:
```ts
    index('services_tenant_category_id_idx').on(t.tenantId, t.categoryId),
```

- [ ] **Step 3: `index.ts` — yangi jadvalni re-export qilish**

`packages/db-schema/src/index.ts` da mavjud `export * from './tables/services.ts';` qatoridan oldin/keyin qo'shing:
```ts
export * from './tables/service-categories.ts';
```

- [ ] **Step 4: Typecheck — schema kompilyatsiya bo'lishini tekshirish**

Run: `bun --filter @dental/db-schema typecheck`
Expected: PASS (0 xato). `services.category` ishlatadigan boshqa joylar (services.service/mapper) keyingi tasklarda tuzatiladi — bu paketning o'zi yashil bo'lishi kerak.

- [ ] **Step 5: Commit**

```bash
git add packages/db-schema/src/tables/service-categories.ts packages/db-schema/src/tables/services.ts packages/db-schema/src/index.ts
git commit -m "feat(db): service_categories jadvali + services.category_id FK"
```

---

### Task 2: Migratsiya + RLS + apply

**Files:**
- Create: `apps/api/drizzle/00NN_*.sql` (drizzle generate yaratadi) — backfill qo'lda qo'shiladi
- Create: `apps/api/migrations/rls/0016_service_categories_rls.sql`

**Interfaces:**
- Produces: migratsiya qo'llanilgan DB — `service_categories` jadvali (RLS) + `services.category_id` ustuni; eski `category` ustun yo'q.

- [ ] **Step 1: Drizzle migratsiya generatsiya qilish**

Run: `bun --filter @dental/api db:generate`
Expected: `apps/api/drizzle/` da yangi `00NN_*.sql` fayl + `meta/` snapshot yangilanadi. Fayl `CREATE TABLE service_categories`, `ALTER TABLE services ADD COLUMN category_id`, `DROP COLUMN category`, indeks o'zgarishlarini o'z ichiga oladi.

- [ ] **Step 2: Backfill SQL ni qo'lda qo'shish (drop'dan OLDIN)**

Yaratilgan `00NN_*.sql` faylini oching. `ALTER TABLE ... ADD COLUMN "category_id"` qatoridan **keyin**, lekin `DROP COLUMN "category"` qatoridan **oldin** quyidagini qo'shing:

```sql
--> statement-breakpoint
-- Backfill: mavjud erkin-matn kategoriyalardan service_categories yaratish + bog'lash
INSERT INTO service_categories (tenant_id, name)
SELECT DISTINCT tenant_id, category
FROM services
WHERE category IS NOT NULL AND category <> ''
ON CONFLICT (tenant_id, name) DO NOTHING;
--> statement-breakpoint
UPDATE services s
SET category_id = sc.id
FROM service_categories sc
WHERE sc.tenant_id = s.tenant_id AND sc.name = s.category;
```

> Agar generatsiya `DROP COLUMN "category"` ni `ADD COLUMN "category_id"` dan oldin qo'ygan bo'lsa — qatorlarni qayta tartiblang: avval ADD COLUMN, keyin backfill, keyin DROP COLUMN. Eski indeks `services_tenant_category_idx` DROP'i ham category ustun drop'idan oldin bo'lsin.

- [ ] **Step 3: RLS faylini yaratish**

`apps/api/migrations/rls/0016_service_categories_rls.sql`:
```sql
-- ===== SERVICE_CATEGORIES =====
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY service_categories_tenant_isolation ON service_categories
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
```

- [ ] **Step 4: RLS coverage lint**

Run: `bun run check:rls`
Expected: PASS — `service_categories` RLS bilan qoplangan (xato bo'lsa: jadval topildi-yu RLS yo'q degan xabar; Step 3 ni tekshiring).

- [ ] **Step 5: Migratsiyani DB ga qo'llash (drizzle + RLS)**

Run: `bun --filter @dental/api db:migrate` (yoki loyiha migrate skripti — `apps/api/package.json` ga qarang; RLS DDL apply qiluvchi skript bilan birga).
Expected: migratsiya xatosiz qo'llanadi. So'ng RLS faylini apply qiling (loyiha konvensiyasi bo'yicha, masalan `bun --filter @dental/api rls:apply` yoki migrate skripti ichida). Tasdiq: `psql ... -c '\d service_categories'` jadval + policy ko'rsatadi.

> Agar test DB alohida bo'lsa, integration testdan oldin u ham migrate + RLS apply qilingan bo'lishi shart (Task 3 testlari shunga tayanadi).

- [ ] **Step 6: Commit**

```bash
git add apps/api/drizzle/ apps/api/migrations/rls/0016_service_categories_rls.sql
git commit -m "feat(db): service_categories migration + backfill + RLS policy"
```

---

### Task 3: Backend modul — `service-categories`

**Files:**
- Create: `apps/api/src/modules/service-categories/service-categories.schema.ts`
- Create: `apps/api/src/modules/service-categories/service-categories.mapper.ts`
- Create: `apps/api/src/modules/service-categories/service-categories.service.ts`
- Create: `apps/api/src/modules/service-categories/service-categories.routes.ts`
- Create: `apps/api/src/modules/service-categories/index.ts`
- Modify: `apps/api/src/app.ts` (mount)
- Test: `apps/api/tests/integration/service-categories.test.ts`

**Interfaces:**
- Consumes: `serviceCategories`, `ServiceCategory` (Task 1); `getDb`, `AuditLogger`, `requirePermission`, `authMiddleware`, `rlsMiddleware`, `okJson`/`apiResponseSchema`/`errorResponseSchema`, `ok`/`fail`.
- Produces: `serviceCategoryRoutes(deps: { db, audit })`; `createServiceCategoriesService({ audit })` → `{ list, create, update, remove, findOrCreateByName }`. `findOrCreateByName(c, name) => Promise<string>` (category id). Mount: `/api/service-categories`.

- [ ] **Step 1: Schema (`service-categories.schema.ts`)**

```ts
import { z } from '@hono/zod-openapi';

export const createServiceCategorySchema = z.object({
  name: z.string().min(1).max(100),
  nameRu: z.string().max(100).optional(),
});
export type CreateServiceCategoryInput = z.infer<typeof createServiceCategorySchema>;

export const updateServiceCategorySchema = createServiceCategorySchema.partial();
export type UpdateServiceCategoryInput = z.infer<typeof updateServiceCategorySchema>;

export const serviceCategoryIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

export const serviceCategoryDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    name: z.string().openapi({ example: 'Terapevtika' }),
    nameRu: z.string().nullable().openapi({ example: 'Терапия' }),
    createdAt: z.string().openapi({ example: '2026-06-27T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-27T10:00:00.000Z' }),
  })
  .openapi('ServiceCategory');
export type ServiceCategoryDto = z.infer<typeof serviceCategoryDtoSchema>;

export const serviceCategoryDeleteResultSchema = z
  .object({ deleted: z.literal(true) })
  .openapi('ServiceCategoryDeleteResult');
```

- [ ] **Step 2: Mapper (`service-categories.mapper.ts`)**

```ts
import type { ServiceCategory } from '@dental/db-schema';
import type { ServiceCategoryDto } from './service-categories.schema.ts';

export const toServiceCategoryDto = (row: ServiceCategory): ServiceCategoryDto => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  nameRu: row.nameRu ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
```

- [ ] **Step 3: Service (`service-categories.service.ts`)**

```ts
import { serviceCategories, services } from '@dental/db-schema';
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import type {
  CreateServiceCategoryInput,
  UpdateServiceCategoryInput,
} from './service-categories.schema.ts';

export const SERVICE_CATEGORY_IN_USE = 'service_category.in_use';
export const SERVICE_CATEGORY_DUPLICATE = 'service_category.duplicate';

export const createServiceCategoriesService = (deps: { audit: AuditLogger }) => {
  async function list(c: Context) {
    const db = getDb(c);
    return db.select().from(serviceCategories).orderBy(serviceCategories.name);
  }

  async function findByNameCI(c: Context, name: string) {
    const db = getDb(c);
    const [row] = await db
      .select()
      .from(serviceCategories)
      .where(sql`lower(${serviceCategories.name}) = lower(${name})`)
      .limit(1);
    return row ?? null;
  }

  async function create(c: Context, input: CreateServiceCategoryInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const existing = await findByNameCI(c, input.name.trim());
    if (existing) return { error: SERVICE_CATEGORY_DUPLICATE as const };

    const [row] = await db
      .insert(serviceCategories)
      .values({ tenantId, name: input.name.trim(), nameRu: input.nameRu ?? null })
      .returning();
    if (!row) throw new Error('Service category insert failed');

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'service_category',
      resourceId: row.id,
      after: row,
    });
    return { row };
  }

  async function update(c: Context, id: string, input: UpdateServiceCategoryInput) {
    const db = getDb(c);
    const [before] = await db
      .select()
      .from(serviceCategories)
      .where(eq(serviceCategories.id, id));
    if (!before) return { notFound: true as const };

    const [row] = await db
      .update(serviceCategories)
      .set({
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.nameRu !== undefined ? { nameRu: input.nameRu } : {}),
        updatedAt: new Date(),
      })
      .where(eq(serviceCategories.id, id))
      .returning();

    if (row) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'service_category',
        resourceId: id,
        before,
        after: row,
      });
    }
    return { row };
  }

  async function remove(c: Context, id: string) {
    const db = getDb(c);
    const [before] = await db
      .select()
      .from(serviceCategories)
      .where(eq(serviceCategories.id, id));
    if (!before) return { notFound: true as const };

    const [{ value: inUse } = { value: 0 }] = await db
      .select({ value: count() })
      .from(services)
      .where(and(eq(services.categoryId, id), isNull(services.deletedAt)));
    if (inUse > 0) return { error: SERVICE_CATEGORY_IN_USE as const };

    await db.delete(serviceCategories).where(eq(serviceCategories.id, id));
    await deps.audit.record(c, {
      action: 'deleted',
      resourceType: 'service_category',
      resourceId: id,
      before,
    });
    return { row: before };
  }

  /** Xizmat formasidan kelgan nom bo'yicha topadi yoki yaratadi → category id. */
  async function findOrCreateByName(c: Context, name: string): Promise<string> {
    const trimmed = name.trim();
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const existing = await findByNameCI(c, trimmed);
    if (existing) return existing.id;

    const [row] = await db
      .insert(serviceCategories)
      .values({ tenantId, name: trimmed })
      .returning({ id: serviceCategories.id });
    if (!row) throw new Error('Service category insert failed');

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'service_category',
      resourceId: row.id,
      after: { name: trimmed },
    });
    return row.id;
  }

  return { list, create, update, remove, findOrCreateByName };
};

export type ServiceCategoriesService = ReturnType<typeof createServiceCategoriesService>;
```

- [ ] **Step 4: Routes (`service-categories.routes.ts`)**

```ts
import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toServiceCategoryDto } from './service-categories.mapper.ts';
import {
  createServiceCategorySchema,
  serviceCategoryDeleteResultSchema,
  serviceCategoryDtoSchema,
  serviceCategoryIdParamSchema,
  updateServiceCategorySchema,
} from './service-categories.schema.ts';
import {
  createServiceCategoriesService,
  SERVICE_CATEGORY_DUPLICATE,
  SERVICE_CATEGORY_IN_USE,
} from './service-categories.service.ts';

const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Service category not found',
  },
};

export const serviceCategoryRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createServiceCategoriesService({ audit: deps.audit });

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['service-categories'],
    operationId: 'listServiceCategories',
    middleware: [requirePermission('service.view')] as const,
    responses: okJson(z.array(serviceCategoryDtoSchema), 'List of service categories'),
  });
  app.openapi(listRoute, async (c) => {
    const rows = await service.list(c);
    return c.json(ok(rows.map(toServiceCategoryDto)), 200);
  });

  const createCatRoute = createRoute({
    method: 'post',
    path: '/',
    tags: ['service-categories'],
    operationId: 'createServiceCategory',
    middleware: [requirePermission('service.manage')] as const,
    request: {
      body: { content: { 'application/json': { schema: createServiceCategorySchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(serviceCategoryDtoSchema) } },
        description: 'Service category created',
      },
      409: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Duplicate name',
      },
      400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Validation error' },
      401: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Unauthorized' },
      403: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Forbidden' },
    },
  });
  app.openapi(createCatRoute, async (c) => {
    const body = c.req.valid('json');
    const res = await service.create(c, body);
    if ('error' in res) return c.json(fail(SERVICE_CATEGORY_DUPLICATE, 'Category already exists'), 409);
    return c.json(ok(toServiceCategoryDto(res.row)), 201);
  });

  const updateCatRoute = createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['service-categories'],
    operationId: 'updateServiceCategory',
    middleware: [requirePermission('service.manage')] as const,
    request: {
      params: serviceCategoryIdParamSchema,
      body: { content: { 'application/json': { schema: updateServiceCategorySchema } } },
    },
    responses: { ...okJson(serviceCategoryDtoSchema, 'Updated'), ...notFoundResponse },
  });
  app.openapi(updateCatRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const res = await service.update(c, id, body);
    if ('notFound' in res) return c.json(fail('service_category.not_found', 'Not found'), 404);
    if (!res.row) return c.json(fail('service_category.not_found', 'Not found'), 404);
    return c.json(ok(toServiceCategoryDto(res.row)), 200);
  });

  const deleteCatRoute = createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['service-categories'],
    operationId: 'deleteServiceCategory',
    middleware: [requirePermission('service.manage')] as const,
    request: { params: serviceCategoryIdParamSchema },
    responses: {
      ...okJson(serviceCategoryDeleteResultSchema, 'Deleted'),
      409: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Category in use',
      },
      ...notFoundResponse,
    },
  });
  app.openapi(deleteCatRoute, async (c) => {
    const { id } = c.req.valid('param');
    const res = await service.remove(c, id);
    if ('notFound' in res) return c.json(fail('service_category.not_found', 'Not found'), 404);
    if ('error' in res)
      return c.json(fail(SERVICE_CATEGORY_IN_USE, 'Category has linked services'), 409);
    return c.json(ok({ deleted: true as const }), 200);
  });

  return app;
};
```

- [ ] **Step 5: `index.ts`**

```ts
export { serviceCategoryRoutes } from './service-categories.routes.ts';
export * from './service-categories.schema.ts';
```

- [ ] **Step 6: `app.ts` da mount qilish**

`apps/api/src/app.ts` da import qo'shing (boshqa modul importlari yonida):
```ts
import { serviceCategoryRoutes } from './modules/service-categories/index.ts';
```
`app.route('/api/services', serviceRoutes({ db, audit }));` qatoridan **keyin** qo'shing:
```ts
  app.route('/api/service-categories', serviceCategoryRoutes({ db, audit }));
```

- [ ] **Step 7: Integration test yozish (failing)**

`apps/api/tests/integration/service-categories.test.ts` — mavjud integration test setup patternini (masalan `cli-153-rbac-endpoints.test.ts`) namuna qilib oching va shu test holatlarni yozing. Real HTTP yoki service-darajali, loyiha konvensiyasiga mos. Kamida:

```ts
import { describe, expect, test } from 'bun:test';
// ... setup: tenant + owner (manage) + restricted user (faqat service.view) yaratish,
//     JWT/context tayyorlash — mavjud integration testlardagi helper'lardan foydalaning.

describe('service-categories', () => {
  test('findOrCreateByName: yangi nom yaratadi, mavjudni qayta ishlatadi (case-insensitive)', async () => {
    // 1) "Terapevtika" bilan create → id1
    // 2) "terapevtika" (kichik harf) bilan findOrCreate → AYNAN id1 (dublikat emas)
    // 3) service_categories da faqat 1 row borligini tasdiqlash
  });

  test("DELETE bog'langan kategoriya → 409 in_use", async () => {
    // category yaratish → unga service biriktirish (categoryId) → DELETE → 409
  });

  test("DELETE bo'sh kategoriya → 200 deleted", async () => {
    // category yaratish (servicesiz) → DELETE → 200
  });

  test('POST dublikat nom → 409 duplicate', async () => {
    // "Ortopediya" create → yana "ortopediya" create → 409
  });

  test('service.view foydalanuvchi list ko\'radi, lekin POST 403', async () => {
    // restricted permset (faqat service.view) — GET 200, POST 403 (@owner EMAS)
  });
});
```

- [ ] **Step 8: Testni ishga tushirib FAIL ko'rish, keyin PASS**

Run: `cd apps/api && bun test --env-file=../../.env tests/integration/service-categories.test.ts`
Expected: avval implementatsiya to'liq bo'lguncha mantiq xatolari/yashil. Step 1–6 bajarilgach barcha test PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/service-categories apps/api/src/app.ts apps/api/tests/integration/service-categories.test.ts
git commit -m "feat(api): service-categories modul — CRUD + findOrCreateByName + in-use guard"
```

---

### Task 4: `services` modulni `category_id` ga ulash

**Files:**
- Modify: `apps/api/src/modules/services/services.schema.ts`
- Modify: `apps/api/src/modules/services/services.mapper.ts`
- Modify: `apps/api/src/modules/services/services.service.ts`
- Modify: `apps/api/src/modules/services/services.routes.ts`
- Modify: `apps/api/src/db/seed-demo.ts` (replace Task 1 shim — set `categoryId` via `findOrCreateByName` or drop the field)
- Test: `apps/api/tests/integration/services-category.test.ts`

> **MUHIM (Task 1 shim'lari):** Task 1 monorepo kompilyatsiyasini saqlash uchun 3 faylga vaqtinchalik shim qo'ygan — bu task ularning HAMMASINI haqiqiy kodga almashtirishi shart: `services.mapper.ts` (`category: null` → join'dan `categoryName`), `services.service.ts` (`orderBy(categoryId)` + insertdan tushib qolgan category → real find-or-create + join), `seed-demo.ts` (kommentlangan `category` qatori → `categoryId` yoki olib tashlash). Hech qanday `TODO(task-3)` shim qolmasligi kerak.

**Interfaces:**
- Consumes: `createServiceCategoriesService` (Task 3); `serviceCategories` (Task 1).
- Produces: `serviceDtoSchema` da `category` (nom, nullable) + `categoryId` (uuid nullable) + `categoryNameRu` (nullable). `createServicesService` endi `{ audit, categories }` deps qabul qiladi.

- [ ] **Step 1: `services.schema.ts` — DTO ga `categoryId`/`categoryNameRu` qo'shish**

`serviceDtoSchema` ichida `category: z.string().nullable()...` qatoridan keyin qo'shing:
```ts
    categoryId: z.uuid().nullable().openapi({ example: null }),
    categoryNameRu: z.string().nullable().openapi({ example: null }),
```
`category` maydoni qoladi (endi JOIN'dan kelgan kategoriya nomi). Request `createServiceSchema.category` (`z.string().max(100).optional()`) o'zgarmaydi — semantikasi: kategoriya nomi.

- [ ] **Step 2: `services.mapper.ts` — augmented row + categoryId/categoryNameRu**

Faylga augmented tip qo'shing va `toServiceDto` ni yangilang:
```ts
import type { Service, ServicePrice } from '@dental/db-schema';
import type { ServiceDto, ServicePriceDto, ServiceWithPricesDto } from './services.schema.ts';

/** services + LEFT JOIN service_categories natija qatori. */
export type ServiceRow = Omit<Service, never> & {
  categoryName: string | null;
  categoryNameRu: string | null;
};

export const toServiceDto = (row: ServiceRow): ServiceDto => ({
  id: row.id,
  tenantId: row.tenantId,
  code: row.code,
  nameUz: row.nameUz,
  nameRu: row.nameRu ?? null,
  category: row.categoryName ?? null,
  categoryId: row.categoryId ?? null,
  categoryNameRu: row.categoryNameRu ?? null,
  durationMinutes: row.durationMinutes,
  requiredRole: row.requiredRole ?? null,
  descriptionUz: row.descriptionUz ?? null,
  descriptionRu: row.descriptionRu ?? null,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
});
```
`toServiceWithPricesDto(row: ServiceRow, prices)` signaturasini `Service` → `ServiceRow` ga yangilang (tana o'zgarmaydi, `...toServiceDto(row)`).

- [ ] **Step 3: `services.service.ts` — deps.categories + join + find-or-create**

Yuqorida import qo'shing:
```ts
import { serviceCategories, servicePrices, services } from '@dental/db-schema';
import { and, desc, eq, getTableColumns, isNull, lte, or, sql } from 'drizzle-orm';
import type { ServiceCategoriesService } from '../service-categories/service-categories.service.ts';
```
Factory signaturasi:
```ts
export const createServicesService = (deps: { audit: AuditLogger; categories: ServiceCategoriesService }) => {
```

`list` ni join bilan almashtiring:
```ts
  async function list(c: Context) {
    const db = getDb(c);
    return db
      .select({
        ...getTableColumns(services),
        categoryName: serviceCategories.name,
        categoryNameRu: serviceCategories.nameRu,
      })
      .from(services)
      .leftJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
      .where(isNull(services.deletedAt))
      .orderBy(serviceCategories.name, services.nameUz);
  }
```

`findById` da xizmat tanlovini join bilan almashtiring (narx mantig'i o'zgarmaydi):
```ts
    const [service] = await db
      .select({
        ...getTableColumns(services),
        categoryName: serviceCategories.name,
        categoryNameRu: serviceCategories.nameRu,
      })
      .from(services)
      .leftJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
      .where(and(eq(services.id, id), isNull(services.deletedAt)));
```

`create` da `category: input.category ?? null` o'rniga categoryId resolve qiling. `db.transaction` blokidan **oldin**:
```ts
    const categoryId =
      input.category && input.category.trim()
        ? await deps.categories.findOrCreateByName(c, input.category)
        : null;
```
Insert `.values({ ... })` ichida `category: input.category ?? null,` ni `categoryId,` ga almashtiring.

`create` ning oxirida (audit + return) `service` qatorida `categoryName`/`categoryNameRu` yo'q — `toServiceDto` ni route ishlatadi. Insert `.returning()` xom `services` qatorini beradi (categoryName yo'q). **Route mapper'ga augmented row kerak** — pastdagi Step 4 ni ko'ring (route create natijani qayta o'qiydi yoki categoryName ni qo'lda biriktiradi). Soddalik uchun `create` qaytishini augment qiling:
```ts
      return { ...service, categoryName: null as string | null, categoryNameRu: null as string | null };
```
> Eslatma: yangi yaratilgan xizmatda categoryName ni darhol ko'rsatish shart emas (UI list invalidatsiya qiladi). Agar kerak bo'lsa, categoryId bo'yicha nomni qo'shimcha o'qing. Bu task uchun `null` yetarli.

`update` da: `.set({ ...input, updatedAt })` `category` ni xom yuboradi — buni tuzating. `update` boshida:
```ts
    let categoryId: string | null | undefined;
    if (input.category !== undefined) {
      categoryId = input.category && input.category.trim()
        ? await deps.categories.findOrCreateByName(c, input.category)
        : null;
    }
    const { category: _ignored, ...rest } = input;
```
`.set({ ...rest, ...(categoryId !== undefined ? { categoryId } : {}), updatedAt: new Date() })`.
`update` qaytishini ham augment qiling (route toServiceDto kutadi):
```ts
      // updated — xom services qatori; categoryName ni qo'shib qaytaramiz
      return updated
        ? { ...updated, categoryName: null as string | null, categoryNameRu: null as string | null }
        : updated;
```
> Yoki yangilangandan keyin `findById(c, id)` chaqirib to'liq augmented qatorni qaytaring (kategoriya nomi darhol kerak bo'lsa). Bu task uchun `null` yetarli — UI invalidatsiya qiladi.

`remove` qaytishi (`before`) xom `Service` — route uni `toServiceDto` ga bermaydi (faqat `{deleted:true}` qaytaradi), shuning uchun o'zgarishsiz.

- [ ] **Step 4: `services.routes.ts` — service factory'ga categories berish + create/update mapper**

Importlar:
```ts
import { createServiceCategoriesService } from '../service-categories/service-categories.service.ts';
```
`serviceRoutes` ichida:
```ts
  const categories = createServiceCategoriesService({ audit: deps.audit });
  const service = createServicesService({ audit: deps.audit, categories });
```
`createServiceRoute` handler'da `toServiceDto(row)` — `row` endi augmented (`{...service, categoryName, categoryNameRu}`). O'zgarish shart emas, agar Step 3 augment qilgan bo'lsa. `updateRoute` handler ham xuddi shunday.

> `findById` handler'da `const { prices, ...row } = result;` — `row` augmented bo'ladi (`categoryName` bilan), `toServiceWithPricesDto(row, prices)` ishlaydi.

- [ ] **Step 5: Typecheck**

Run: `bun --filter @dental/api typecheck`
Expected: PASS. Xatolar bo'lsa — `toServiceDto`/`toServiceWithPricesDto` chaqiruvlarida row shakli (categoryName yo'q) — Step 3 augmentlarini tekshiring.

- [ ] **Step 6: Integration test (find-or-create xizmat orqali)**

`apps/api/tests/integration/services-category.test.ts`:
```ts
import { describe, expect, test } from 'bun:test';
// setup: tenant + owner — mavjud integration helper'lardan.

describe('services ↔ category', () => {
  test('create service yangi category nomi bilan → category yaratiladi va bog\'lanadi', async () => {
    // POST /api/services { code, nameUz, category: "Jarrohlik" }
    // → service.categoryId not null; GET /api/services dto.category === "Jarrohlik"
  });
  test('create service mavjud category nomi bilan → yangi category yaratilmaydi', async () => {
    // avval "Jarrohlik" bor; yana boshqa service category:"jarrohlik" (CI) → o'sha categoryId
    // service_categories da "Jarrohlik" uchun 1 row
  });
  test('list/get DTO category nomi va categoryId ni qaytaradi', async () => {
    // dto.category (nom) + dto.categoryId (uuid) mavjud
  });
});
```

- [ ] **Step 7: Test FAIL→PASS**

Run: `cd apps/api && bun test --env-file=../../.env tests/integration/services-category.test.ts`
Expected: Step 1–4 bajarilgach PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/services apps/api/tests/integration/services-category.test.ts
git commit -m "feat(api): services category_id + find-or-create + DTO category join"
```

---

### Task 5: OpenAPI + api-client regeneratsiya

**Files:**
- Modify: generated spec + `packages/api-client/**` (skript yozadi)

**Interfaces:**
- Produces: web uchun `listServiceCategories`, `createServiceCategory`, `updateServiceCategory`, `deleteServiceCategory`, `ServiceCategory` tiplari; o'zgargan `Service` DTO (`categoryId`, `categoryNameRu`).

- [ ] **Step 1: Kontraktni qayta generatsiya qilish**

Run: `bun run generate:contract`
Expected: `generate:openapi` + `orval` ishlaydi; `packages/api-client` da yangi funksiyalar + tiplar paydo bo'ladi (`Service` DTO yangilanadi).

- [ ] **Step 2: Web typecheck (yangi tiplar mavjudligini tasdiqlash)**

Run: `bun --filter @dental/web typecheck`
Expected: PASS yoki faqat Task 6/7 da tuzatiladigan `ServiceInfoTab`/feature xatolari (bu task hali web kodini o'zgartirmadi, shuning uchun mavjud kod yashil bo'lishi kerak). Agar generated `Service` DTO field nomi o'zgarib mavjud web kodini buzsa — qayd eting (kutilmaydi: `category` saqlanadi).

- [ ] **Step 3: Commit**

```bash
git add packages/api-client
git commit -m "chore(api-client): regenerate — service-categories + Service.categoryId"
```

---

### Task 6: Frontend feature — `service-categories` sahifa + nav + i18n

**Files:**
- Create: `apps/web/src/features/service-categories/index.ts`
- Create: `apps/web/src/features/service-categories/service-categories.keys.ts`
- Create: `apps/web/src/features/service-categories/service-categories.api.ts`
- Create: `apps/web/src/features/service-categories/service-categories.schema.ts`
- Create: `apps/web/src/features/service-categories/service-categories.types.ts`
- Create: `apps/web/src/features/service-categories/service-categories.mappers.ts`
- Create: `apps/web/src/features/service-categories/service-categories.mappers.test.ts`
- Create: `apps/web/src/features/service-categories/components/ServiceCategoriesScreen.tsx`
- Create: `apps/web/src/features/service-categories/components/ServiceCategoryFormModal.tsx`
- Create: `apps/web/src/features/service-categories/components/ServiceCategoriesScreen.test.tsx`
- Modify: `apps/web/src/features/settings/settings.routes.tsx`
- Modify: `apps/web/src/shell/nav-config.ts` + `apps/web/src/shell/nav-config.test.ts`
- Modify: `packages/i18n/src/uz.json` + `packages/i18n/src/ru.json`

**Interfaces:**
- Consumes: `listServiceCategories`, `createServiceCategory`, `updateServiceCategory`, `deleteServiceCategory`, `ServiceCategory` (Task 5).
- Produces: `ServiceCategoriesScreen`; `useServiceCategories()` (Task 7 ham ishlatadi).

- [ ] **Step 1: keys + api hooks**

`service-categories.keys.ts`:
```ts
export const serviceCategoryKeys = {
  all: ['service-categories'] as const,
  list: () => ['service-categories', 'list'] as const,
};
```
`service-categories.api.ts`:
```ts
import {
  createServiceCategory,
  deleteServiceCategory,
  listServiceCategories,
  type ServiceCategory,
  updateServiceCategory,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { serviceCategoryKeys } from './service-categories.keys';
import type { ServiceCategoryFormValues } from './service-categories.types';

export function useServiceCategories() {
  return useQuery({
    queryKey: serviceCategoryKeys.list(),
    queryFn: () => listServiceCategories().then((r) => r.data),
  });
}

export function useUpsertServiceCategory(editing: ServiceCategory | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: ServiceCategoryFormValues) => {
      const body = { name: values.name, nameRu: values.nameRu || undefined };
      return editing
        ? updateServiceCategory(editing.id, body).then((r) => r.data)
        : createServiceCategory(body).then((r) => r.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: serviceCategoryKeys.all }),
  });
}

export function useDeleteServiceCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteServiceCategory(id).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: serviceCategoryKeys.all }),
  });
}
```

- [ ] **Step 2: types + schema + mappers (+ mappers test)**

`service-categories.types.ts`:
```ts
export type ServiceCategoryVM = { id: string; name: string; nameRu: string | null };
export type ServiceCategoryFormValues = { name: string; nameRu: string };
```
`service-categories.schema.ts`:
```ts
import { z } from 'zod';

export const serviceCategoryFormSchema = z.object({
  name: z.string().min(1).max(100),
  nameRu: z.string().max(100),
});
```
`service-categories.mappers.ts`:
```ts
import type { ServiceCategory } from '@dental/api-client';
import type { ServiceCategoryVM } from './service-categories.types';

export const toServiceCategoryVM = (dto: ServiceCategory): ServiceCategoryVM => ({
  id: dto.id,
  name: dto.name,
  nameRu: dto.nameRu ?? null,
});
```
`service-categories.mappers.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { toServiceCategoryVM } from './service-categories.mappers';

describe('toServiceCategoryVM', () => {
  it('maps dto to view-model with null nameRu fallback', () => {
    const vm = toServiceCategoryVM({
      id: 'c1', tenantId: 't1', name: 'Terapevtika', nameRu: null,
      createdAt: '2026-06-27T10:00:00.000Z', updatedAt: '2026-06-27T10:00:00.000Z',
    } as ServiceCategory & { nameRu: null });
    expect(vm).toEqual({ id: 'c1', name: 'Terapevtika', nameRu: null });
  });
});
```
Run: `bun --filter @dental/web test src/features/service-categories/service-categories.mappers.test.ts`
Expected: PASS.

- [ ] **Step 3: `ServiceCategoryFormModal.tsx`**

```tsx
import type { ServiceCategory } from '@dental/api-client';
import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUpsertServiceCategory } from '../service-categories.api';
import { serviceCategoryFormSchema } from '../service-categories.schema';
import type { ServiceCategoryFormValues } from '../service-categories.types';

export function ServiceCategoryFormModal({
  opened,
  onClose,
  editing,
}: {
  opened: boolean;
  onClose: () => void;
  editing: ServiceCategory | null;
}) {
  const { t } = useTranslation();
  const upsert = useUpsertServiceCategory(editing);
  const form = useForm<ServiceCategoryFormValues>({
    initialValues: { name: '', nameRu: '' },
    validate: zod4Resolver(serviceCategoryFormSchema),
  });

  useEffect(() => {
    if (opened) {
      form.setValues({ name: editing?.name ?? '', nameRu: editing?.nameRu ?? '' });
      form.resetDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, editing]);

  const submit = form.onSubmit((values) => {
    upsert.mutate(values, { onSuccess: onClose });
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? t('serviceCategories.edit') : t('serviceCategories.create')}
      size="sm"
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput label={t('serviceCategories.name')} required {...form.getInputProps('name')} />
          <TextInput label={t('serviceCategories.name_ru')} {...form.getInputProps('nameRu')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={upsert.isPending}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 4: `ServiceCategoriesScreen.tsx`**

`ServicesScreen.tsx` ni namuna qilib (PageHead + StateView + jadval + create tugma + delete modal). Jadval: nom, nom_ru, amallar (edit/delete `service.manage`). Skelet:
```tsx
import type { ServiceCategory } from '@dental/api-client';
import { PageHead, StateView } from '@dental/ui';
import { ActionIcon, Button, Group, Modal, Stack, Table, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useDeleteServiceCategory, useServiceCategories } from '../service-categories.api';
import { ServiceCategoryFormModal } from './ServiceCategoryFormModal';

export function ServiceCategoriesScreen() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('service.manage');

  const categories = useServiceCategories();
  const del = useDeleteServiceCategory();
  const [editing, setEditing] = useState<ServiceCategory | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ServiceCategory | null>(null);
  const [opened, { open, close }] = useDisclosure(false);

  const list = categories.data ?? [];
  const openCreate = () => { setEditing(null); open(); };
  const openEdit = (cat: ServiceCategory) => { setEditing(cat); open(); };

  return (
    <>
      <Stack gap="lg">
        <PageHead
          title={t('serviceCategories.title')}
          actions={canManage && (
            <Button leftSection={<IconPlus size={18} />} onClick={openCreate}>
              {t('serviceCategories.create')}
            </Button>
          )}
        />
        {categories.isLoading ? (
          <StateView status="loading" skeleton="table" />
        ) : categories.isError ? (
          <StateView status="error" title={t('states.error_title')} retryLabel={t('states.retry')} onRetry={() => categories.refetch()} />
        ) : list.length === 0 ? (
          <StateView status="empty" title={t('states.empty_title')} description={t('serviceCategories.empty')} />
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('serviceCategories.name')}</Table.Th>
                <Table.Th>{t('serviceCategories.name_ru')}</Table.Th>
                {canManage && <Table.Th />}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.map((cat) => (
                <Table.Tr key={cat.id}>
                  <Table.Td>{cat.name}</Table.Td>
                  <Table.Td>{cat.nameRu ?? '—'}</Table.Td>
                  {canManage && (
                    <Table.Td>
                      <Group gap="xs" justify="flex-end">
                        <ActionIcon variant="subtle" aria-label={t('common.edit')} onClick={() => openEdit(cat)}>
                          <IconPencil size={16} />
                        </ActionIcon>
                        <ActionIcon variant="subtle" color="red" aria-label={t('common.delete')} onClick={() => setPendingDelete(cat)}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>

      <ServiceCategoryFormModal opened={opened} onClose={() => { setEditing(null); close(); }} editing={editing} />

      <Modal opened={!!pendingDelete} onClose={() => setPendingDelete(null)} title={t('serviceCategories.confirm_delete')} size="sm">
        <Stack gap="md">
          <Text size="sm">{pendingDelete?.name}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setPendingDelete(null)}>{t('common.cancel')}</Button>
            <Button color="red" loading={del.isPending} onClick={() => {
              if (pendingDelete) del.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
            }}>{t('common.delete')}</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
```

- [ ] **Step 5: `index.ts`**

```ts
export { ServiceCategoriesScreen } from './components/ServiceCategoriesScreen';
export { useServiceCategories } from './service-categories.api';
```

- [ ] **Step 6: settings.routes.tsx — route ro'yxatga olish**

`apps/web/src/features/settings/settings.routes.tsx` da import qo'shing:
```ts
import { ServiceCategoriesScreen } from '@/features/service-categories';
```
`'/settings/services'` qatoridan keyin qo'shing:
```tsx
  { path: '/settings/service-categories', perm: 'service.view', element: <ServiceCategoriesScreen /> },
```

- [ ] **Step 7: nav-config.ts — yangi nav element**

`apps/web/src/shell/nav-config.ts` da `services` nav elementidan (`key: 'services'`) keyin qo'shing:
```ts
      {
        key: 'service-categories',
        labelKey: 'nav.service_categories',
        icon: Tag,
        path: '/settings/service-categories',
        permission: 'service.view',
      },
```
`Tag` ikonkasini `@tabler/icons-react` importiga qo'shing (yoki mavjud ikonka — masalan `Layers`). `nav-config.test.ts` agar nav elementlar sonini yoki kalitlarni tekshirsa — yangi elementni hisobga olib yangilang.

- [ ] **Step 8: i18n — `serviceCategories.*` + `nav.service_categories`**

`packages/i18n/src/uz.json` ga qo'shing (mos joyga):
```json
"nav": { "service_categories": "Kategoriyalar" },
"serviceCategories": {
  "title": "Xizmat kategoriyalari",
  "create": "Yangi kategoriya",
  "edit": "Kategoriyani tahrirlash",
  "name": "Nomi",
  "name_ru": "Nomi (ruscha)",
  "empty": "Hali kategoriya yo'q",
  "confirm_delete": "Kategoriyani o'chirish?",
  "in_use_error": "Bu kategoriyaga xizmatlar biriktirilgan — avval ularni ko'chiring"
}
```
> JSON strukturasi nested — mavjud `nav` va boshqa kalitlarga **merge** qiling, alohida obyekt yaratmang. `ru.json` ga ham ruscha tarjima bilan xuddi shunday qo'shing:
> `nav.service_categories`: "Категории", `serviceCategories.title`: "Категории услуг", `create`: "Новая категория", `edit`: "Редактировать категорию", `name`: "Название", `name_ru`: "Название (рус)", `empty`: "Категорий пока нет", `confirm_delete`: "Удалить категорию?", `in_use_error`: "К категории привязаны услуги — сначала перенесите их".

- [ ] **Step 9: Screen testi**

`ServiceCategoriesScreen.test.tsx` — mavjud `ServicesScreen.test.tsx` patternini (provider wrapper, mock hooks) namuna qiling. Kamida: loading→StateView, list render (nom ko'rinadi), `service.manage` yo'q bo'lsa create tugma yo'q.
Run: `bun --filter @dental/web test src/features/service-categories/`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/features/service-categories apps/web/src/features/settings/settings.routes.tsx apps/web/src/shell/nav-config.ts apps/web/src/shell/nav-config.test.ts packages/i18n/src/uz.json packages/i18n/src/ru.json
git commit -m "feat(web): service-categories sahifa + nav + i18n"
```

---

### Task 7: Xizmat formasi — `Autocomplete` (inline find-or-create UX) + filtr

**Files:**
- Modify: `apps/web/src/features/services/components/ServiceInfoTab.tsx`
- Modify: `apps/web/src/features/services/components/ServicesScreen.tsx`
- Test: `apps/web/src/features/services/components/ServiceInfoTab.test.tsx` (yangi yoki mavjud `ServiceFormModal.test.tsx` ga qo'shimcha)

**Interfaces:**
- Consumes: `useServiceCategories` (Task 6). Forma hali `category` (nom-matn) yuboradi — `services.api.ts` o'zgarmaydi.

- [ ] **Step 1: `ServiceInfoTab.tsx` — TextInput → Autocomplete**

Importga qo'shing:
```ts
import { Autocomplete, NumberInput, Select, Stack, Switch, Textarea, TextInput } from '@mantine/core';
import { useServiceCategories } from '@/features/service-categories';
```
Komponent ichida:
```ts
  const categories = useServiceCategories();
  const categoryData = (categories.data ?? []).map((c) => c.name);
```
`category` `TextInput` ni almashtiring:
```tsx
      <Autocomplete
        label={t('services.category')}
        placeholder={t('services.category_placeholder')}
        data={categoryData}
        {...form.getInputProps('category')}
      />
```
> `Autocomplete` erkin matnga ruxsat beradi — yangi nom yozilsa ham qabul qilinadi (backend find-or-create). Mavjud nomlar dropdown'da suggestion.

- [ ] **Step 2: `ServicesScreen.tsx` — filtr kategoriyalardan**

`useServiceCategories` import qiling va `categoryOptions` ni almashtiring:
```ts
import { useServiceCategories } from '@/features/service-categories';
// ...
  const categoriesQuery = useServiceCategories();
  const categoryOptions = useMemo(
    () =>
      (categoriesQuery.data ?? [])
        .map((c) => ({ value: c.name, label: c.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categoriesQuery.data],
  );
```
> `groupByCategory`/`filterServices` o'zgarmaydi (DTO `category` nomi saqlanadi).

- [ ] **Step 3: Test — Autocomplete mavjud + erkin nom**

`ServiceInfoTab.test.tsx` (yoki mavjud form testiga qo'shimcha): `useServiceCategories` ni mock qilib (`['Terapevtika']`), forma render bo'lganda kategoriya inputi ko'rinishini va erkin matn yozilganda `form.values.category` yangilanishini tekshiring. Mavjud `ServiceFormModal.test.tsx` `useServiceCategories` chaqiruvini mock qilishi kerak (aks holda query crash qiladi) — provider/mock qo'shing.
Run: `bun --filter @dental/web test src/features/services/`
Expected: PASS (mavjud testlar ham — mock qo'shilgach yashil).

- [ ] **Step 4: To'liq web typecheck + lint**

Run: `bun --filter @dental/web typecheck && bunx biome check apps/web/src/features/service-categories apps/web/src/features/services`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/services
git commit -m "feat(web): xizmat formasi Autocomplete kategoriya + filtr kategoriyalardan"
```

---

### Task 8: Yakuniy verifikatsiya (butun branch)

**Files:** (yo'q — faqat tekshirish)

- [ ] **Step 1: Backend to'liq**

Run: `bun --filter @dental/api typecheck && cd apps/api && bun test --env-file=../../.env && cd ../.. && bun run check:rls`
Expected: typecheck PASS, barcha api test PASS, check:rls PASS.

- [ ] **Step 2: Web to'liq**

Run: `bun --filter @dental/web typecheck && bun --filter @dental/web test`
Expected: PASS.

- [ ] **Step 3: Biome (butun)**

Run: `bunx biome check apps packages`
Expected: 0 xato (yoki faqat oldindan mavjud, bu branch'ga aloqasiz).

- [ ] **Step 4: Qo'lda smoke (ixtiyoriy, agar full-stack ko'tarilgan bo'lsa)**

Kategoriyalar sahifasi: yaratish/tahrirlash/o'chirish; xizmat formasida yangi kategoriya nomi yozib saqlash → Kategoriyalar sahifasida paydo bo'lishini ko'rish; bog'langan kategoriyani o'chirishga urinish → xato toast.

- [ ] **Step 5: Holistik review (rol-bo'yicha)**

Spec va `project_rbac_role_gaps` darsiga ko'ra: yangi `/api/service-categories` endpointlari rol-bo'yicha (real restricted permset, `@owner` EMAS) `service.view` 200 / `service.manage`siz POST 403 ekanini tasdiqlang (Task 3 testi qoplaydi). DTO va nav gating izchilligini ko'zdan kechiring.

---

## Self-Review (reja muallifi tomonidan)

**Spec coverage:**
- Data model (service_categories + category_id FK) → Task 1 ✓
- Migration + backfill + RLS → Task 2 ✓
- Backend CRUD + 409 in-use + find-or-create → Task 3 ✓
- services DTO category join + find-or-create wiring → Task 4 ✓
- OpenAPI/api-client regen → Task 5 ✓
- Frontend feature + nav + i18n → Task 6 ✓
- ServiceInfoTab Autocomplete + filtr → Task 7 ✓
- Testlar (find-or-create dedupe, delete-in-use, rol-bo'yicha, web) → Task 3/4/6/7 ✓
- Yakuniy verify → Task 8 ✓

**Placeholder scan:** Test tana kodlari niyat-izohli (setup loyiha helper'lariga tayanadi) — bu qasddan, chunki mavjud integration test setup pattern reusable va to'liq ko'chirish noaniq bog'liqliklarni keltiradi; har test holati aniq input/kutilgan natija bilan tavsiflangan.

**Type consistency:** `findOrCreateByName(c, name): Promise<string>` (Task 3) ↔ services.service chaqiruvi (Task 4) ✓. `ServiceRow` augmented tip (Task 4 mapper) ↔ list/findById select (Task 4 service) ✓. DTO `category`/`categoryId`/`categoryNameRu` (Task 4 schema) ↔ mapper (Task 4) ✓. `useServiceCategories` (Task 6) ↔ ServiceInfoTab/ServicesScreen (Task 7) ✓.
