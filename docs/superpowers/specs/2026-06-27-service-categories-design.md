# Dizayn: Xizmat kategoriyalari (alohida jadval + CRUD)

**Sana:** 2026-06-27
**Status:** Tasdiqlangan (brainstorm → spec)

## Maqsad

Hozir `services.category` — erkin matn (free text) ustun. Uni normallashtirilgan
**alohida jadvalga** ajratish: to'liq CRUD + alohida frontend sahifa. Xizmat qo'shish
formasida hozirgi qulaylik saqlanadi — kategoriya nomi kiritilganda mavjud bo'lsa
o'sha tanlanadi, aks holda **xizmat saqlanganda backend uni yaratib ketadi**
(find-or-create).

## Qabul qilingan qarorlar (brainstorm Q&A)

| # | Qaror |
|---|-------|
| 1 | Til ustunlari: **`name` + `name_ru`** (expense_categories pattern bilan bir xil) |
| 2 | Sahifa: **alohida nav sahifa** (sidebar'da yangi menyu elementi) |
| 3 | Permission: **mavjud `service.view` / `service.manage`** (yangi perm yo'q) |
| 4 | Ishlatilayotgan kategoriyani o'chirish: **bloklash (409)** — FK `ON DELETE RESTRICT` xavfsizlik to'ri |
| 5 | Inline yaratish: **backend find-or-create** (xizmat saqlanganda, atomik) |

> Prod DB hali yo'q — mavjud erkin-matn ma'lumot migratsiyasi tanqidiy emas, lekin
> dev/seed ma'lumotini yo'qotmaslik uchun best-effort backfill kiritiladi.

## 1. Ma'lumotlar modeli

### Yangi jadval: `service_categories` (tenant-scoped, RLS)

`packages/db-schema/src/tables/service-categories.ts`:

```ts
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
```

- `unique(tenant_id, name)` — bir tenantda bir xil nomli ikki kategoriya bo'lmaydi.
- Case-insensitive dedupe (masalan "Terapevtika" vs "terapevtika") **service
  qatlamida** `lower(name)` orqali hal qilinadi (DB unique exact-match himoya to'ri).
- `service-categories.ts` `packages/db-schema/src/index.ts` da re-export qilinadi.

### `services` jadvali o'zgarishi

`packages/db-schema/src/tables/services.ts`:

- `category: text('category')` **olib tashlanadi**.
- Qo'shiladi: `categoryId: uuid('category_id').references(() => serviceCategories.id, { onDelete: 'restrict' })` (nullable).
- Indeks `services_tenant_category_idx` (eski, `category` ustiga) **olib tashlanadi**.
- Yangi indeks `services_tenant_category_id_idx` on `(tenantId, categoryId)` qo'shiladi.
- `ON DELETE RESTRICT` — DB darajasida "bog'langan xizmat bo'lsa o'chirib bo'lmaydi"
  kafolati (service layer 409 friendly xabar beradi, FK = oxirgi himoya).

## 2. Migratsiya

### Drizzle migratsiya (`drizzle-kit generate` + qo'lda backfill)

Schema fayllari o'zgartirilgach `bun --filter @dental/api drizzle:generate` ishga
tushiriladi. Generatsiya qilingan SQL'ga **qo'lda backfill bloki** qo'shiladi, tartib:

1. `CREATE TABLE service_categories ...`
2. `ALTER TABLE services ADD COLUMN category_id uuid` (nullable, FK)
3. **Backfill (qo'lda yoziladi):** har tenant uchun mavjud distinct non-null
   `services.category` qiymatlaridan `service_categories` ga insert, so'ng
   `services.category_id` ni nom bo'yicha update.
4. `DROP INDEX services_tenant_category_idx`, `ALTER TABLE services DROP COLUMN category`,
   yangi `category_id` indeks yaratish.

Backfill SQL eskizi:

```sql
INSERT INTO service_categories (tenant_id, name)
SELECT DISTINCT tenant_id, category
FROM services
WHERE category IS NOT NULL AND category <> '';

UPDATE services s
SET category_id = sc.id
FROM service_categories sc
WHERE sc.tenant_id = s.tenant_id AND sc.name = s.category;
```

### RLS migratsiyasi

Yangi fayl `apps/api/migrations/rls/0016_service_categories_rls.sql`:

```sql
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY service_categories_tenant_isolation ON service_categories
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
```

**`bun run check:rls` yashil bo'lishi shart** (yangi tenant-scoped jadval RLS talab qiladi).

## 3. Backend

### Yangi modul `apps/api/src/modules/service-categories/` (6-fayl, RFC-0009)

`service-categories.routes.ts` — `OpenAPIHono` + auth + rls middleware:

| Method | Path | Permission | Izoh |
|--------|------|-----------|------|
| GET | `/service-categories` | `service.view` | Ro'yxat (nom bo'yicha tartib) |
| POST | `/service-categories` | `service.manage` | Yaratish — dublikat nom = **409** |
| PATCH | `/service-categories/{id}` | `service.manage` | Tahrirlash (name, name_ru) |
| DELETE | `/service-categories/{id}` | `service.manage` | Bog'langan xizmat bor = **409** |

`service-categories.service.ts` (factory `createServiceCategoriesService({ audit })`):
- `list(c)`, `create(c, input)`, `update(c, id, input)`, `remove(c, id)`
- `remove`: avval shu `category_id` ga ega xizmatlar sonini tekshiradi → `>0` bo'lsa
  `fail('service_category.in_use', ...)` 409.
- **`findOrCreateByName(c, name): Promise<string>`** — `lower(name)` bo'yicha qidiradi;
  topilsa `id` qaytaradi, aks holda yangi yaratib `id` qaytaradi. `services.service`
  shuni ishlatadi. Audit yoziladi (created).
- Har mutatsiya `audit.record` (resourceType: `service_category`).

`service-categories.repository.ts`, `service-categories.schema.ts` (Zod DTO),
`service-categories.mapper.ts` (row→DTO), `index.ts`.

App router'ga `/service-categories` da ulanadi (services bilan yonma-yon).

### `services` modul o'zgarishi

- **`services.schema.ts`**: `createServiceSchema` / `updateServiceSchema` da `category`
  maydoni **nom-matn (string, optional)** sifatida qoladi (semantikasi: kategoriya nomi).
  Response DTO `serviceDtoSchema`: `category` (nom, optional) o'rnida endi
  `categoryId` (uuid nullable) + `category` (nom, JOIN'dan) + `categoryNameRu` (optional).
- **`services.service.ts`** `create`/`update`: `input.category` (nom) berilgan bo'lsa
  `serviceCategoriesService.findOrCreateByName(c, name)` → `categoryId`; bo'sh bo'lsa `null`.
  Service factory'ga `categories` dependency qo'shiladi (yoki helper inline import).
- **`services.service.ts`** `list`/`findById`: `service_categories` bilan `LEFT JOIN`
  (yoki ikkinchi so'rov) — DTO uchun kategoriya nomi. Tartib: kategoriya nomi + nameUz.
- **`services.mapper.ts`**: yangi DTO shakliga moslash (`categoryId`, `category` nom,
  `categoryNameRu`).

## 4. Frontend

### Yangi feature `apps/web/src/features/service-categories/` (RFC-0010)

- `service-categories.routes.tsx` — `AppRoute[]`: `{ path: '/service-categories',
  perm: 'service.view', element: <ServiceCategoriesScreen/> }`
- `service-categories.api.ts` — `useServiceCategories()`, `useCreateServiceCategory()`,
  `useUpdateServiceCategory()`, `useDeleteServiceCategory()` (generated api-client orqali)
- `service-categories.keys.ts` — query-key factory
- `service-categories.schema.ts` — Zod form (name majburiy, name_ru ixtiyoriy), `zod4Resolver`
- `service-categories.mappers.ts` — DTO↔view-model (MAJBURIY, RFC-0010)
- `service-categories.types.ts`
- `components/ServiceCategoriesScreen.tsx` — `PageHead` + `StateView` + jadval +
  yaratish tugmasi (`service.manage` gated)
- `components/ServiceCategoryFormModal.tsx` — create/edit modal (name + name_ru)
- DELETE 409 (`in_use`) — `MutationCache.onError` default toast yetarli; kerak bo'lsa
  maxsus xabar.

### Navigatsiya + routing

- `nav-config` (sidebar) — Xizmatlar bilan bir guruhda **«Kategoriyalar»** nav elementi,
  `service.view` bilan gated.
- `app/routes.tsx` — `protectedRoutes` ga `serviceCategoriesRoutes` qo'shiladi.

### `ServiceInfoTab` o'zgarishi (inline find-or-create)

- `category` `TextInput` → Mantine **`Autocomplete`**:
  - `data` = `useServiceCategories()` dan kelgan mavjud kategoriya nomlari
  - Erkin yozish mumkin (yangi nom kiritsa, suggestion'da yo'q bo'lsa ham qabul qilinadi)
  - Forma `category` (nom-matn) yuboradi; backend find-or-create qiladi
  - Tahrirlashda joriy kategoriya nomi bilan to'ldiriladi

### `ServicesScreen` filtri

- Kategoriya filtri `Select` `data` si `useServiceCategories()` ro'yxatidan to'ldiriladi
  (hozirgi "xizmatlar ro'yxatidan distinct yig'ish" o'rniga to'liqroq).
- `groupByCategory` mapper kategoriya **nomi** bo'yicha ishlaydi — DTO `category` (nom)
  saqlanganligi sababli o'zgarishsiz ishlaydi.

## 5. OpenAPI, i18n, testlar

- **OpenAPI:** `bun run generate:contract` (spec + api-client qayta generatsiya).
  Yangi `service-categories` operatsiyalari + o'zgargan `service` DTO web hooks'ga oqadi.
- **i18n:** `packages/i18n` `uz.json` + `ru.json` — `serviceCategories.*` (title, create,
  name, name_ru, empty, confirm_delete, in_use_error) + nav label. Ikkala fayl yangilanadi.
- **Pul/format:** kategoriya sahifasida pul yo'q — tegishli emas.

### Testlar

**Backend** (`bun test --env-file=../../.env`, bun:test):
- `service-categories.service` find-or-create — case-insensitive dedupe (mavjud nom
  qaytadi, yangisi yaratiladi).
- DELETE in-use → 409; bo'sh kategoriya → 200.
- Rol-bo'yicha permission (real restricted permset, `@owner` EMAS): `service.view`
  ko'radi/manage qila olmaydi; `service.manage` to'liq. RLS tenant izolyatsiya.

**Web** (vitest):
- `ServiceCategoriesScreen` — list/empty/error holatlari, manage gating.
- `ServiceInfoTab` — Autocomplete: mavjud nom tanlash + yangi nom yozish.
- `service-categories.mappers` — DTO↔VM.
- `services.mappers` `groupByCategory` regressiyasi (DTO `category` nomdan).

## Ta'sir doirasi (fayllar)

**Yangi:** `packages/db-schema/src/tables/service-categories.ts`; drizzle migration;
`apps/api/migrations/rls/0016_service_categories_rls.sql`; `apps/api/src/modules/service-categories/*`
(6 fayl); `apps/web/src/features/service-categories/*`.

**O'zgaradi:** `packages/db-schema/src/{index.ts, tables/services.ts}`;
`apps/api/src/modules/services/{services.service.ts, services.schema.ts, services.mapper.ts}`;
app router; `apps/web/src/features/services/components/{ServiceInfoTab.tsx, ServicesScreen.tsx}`;
`services.types.ts`/`services.mappers.ts` (DTO shakli); nav-config; `app/routes.tsx`;
generated api-client; `packages/i18n/{uz,ru}.json`.

## Tashqarida (non-goals)

- Kategoriya iyerarxiyasi (parent/child) — yo'q, tekis ro'yxat.
- Kategoriya bo'yicha narx yoki boshqa biznes mantiq — yo'q.
- Cross-tenant umumiy kategoriya katalogi — yo'q (tenant-scoped).
