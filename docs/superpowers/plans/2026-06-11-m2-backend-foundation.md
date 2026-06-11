# M2 — Backend Foundation: Implementation Plan (CLI-94/95/96)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development yoki superpowers:executing-plans. Checkbox (`- [ ]`).

**Goal:** `tenant_settings` jadval (orphaned perm + R5 prerequisite) + yetishmayotgan FK constraint va indekslar.

**Architecture:** Yangi `tenant_settings` jadval + modul (get-or-create); CLI-95/96 — sof schema `.references()`/`index()` + migration (xulq o'zgarmaydi). api-client qo'lda.

**Tech Stack:** Bun, Hono, Drizzle, Zod, Vitest; React 18, Mantine v7.

**Spec:** [`docs/superpowers/specs/2026-06-11-m2-backend-foundation-design.md`](../specs/2026-06-11-m2-backend-foundation-design.md)

---

## Wave topologiya

| Wave | Tasklar | Parallel |
|---|---|---|
| **1 (schema+migration)** | Task 1 (tenant_settings + RLS) + Task 2 (CLI-95 FK) + Task 3 (CLI-96 indeks) — 1 agent, bitta drizzle migration | 1 |
| **barrier** | orkestrator migration apply |
| **2** | Task 4 (tenant-settings modul + integration) ∥ docs | 1 |
| **barrier** | Task 5 (api-client) |
| **3** | Task 6 (tenant-settings UI) | 1 |

Verifikatsiya: typecheck (api/api-client/web); api `cd apps/api && bun test --env-file=../../.env`; web test; `bun run check:rls`. Parallel agentlar commit/app.ts/migrate qilmaydi — orkestrator.

---

## Task 1: `tenant_settings` schema + RLS

**Files:** Create `packages/db-schema/src/tables/tenant-settings.ts`; Modify `packages/db-schema/src/index.ts`; Create `apps/api/migrations/rls/0011_tenant_settings_rls.sql`

- [ ] **Step 1: Jadval**
```ts
import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.ts';

export const tenantSettings = pgTable('tenant_settings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  vertical: text('vertical').notNull().default('dental'),
  reminderLeadHours: integer('reminder_lead_hours').notNull().default(24),
  currency: text('currency').notNull().default('UZS'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('tenant_settings_tenant_unique').on(t.tenantId)]);
export type TenantSettings = typeof tenantSettings.$inferSelect;
```
- [ ] **Step 2: Barrel eksport** (`index.ts`).
- [ ] **Step 3: RLS** `apps/api/migrations/rls/0011_tenant_settings_rls.sql` (Guruh A/B alohida-blok uslubi):
```sql
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_settings_tenant_isolation ON tenant_settings
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
```
(Bu task migration GENERATE qilmaydi — Task 3 hamma schema o'zgarishini bitta migration'ga yig'adi.)

---

## Task 2: CLI-95 — FK constraint (schema)

**Files:** Modify `packages/db-schema/src/tables/cashier.ts`, `packages/db-schema/src/tables/refresh-tokens.ts`

- [ ] **Step 1: cashier self-ref FK** — `cashier.ts` da `parentTransactionId` ni FK qil (self-ref `AnyPgColumn`):
```ts
import { type AnyPgColumn } from 'drizzle-orm/pg-core';
// ...
    parentTransactionId: uuid('parent_transaction_id').references(
      (): AnyPgColumn => cashierTransactions.id,
      { onDelete: 'restrict' },
    ),
```
(Mavjud `uniqueIndex('cashier_tx_parent_unique')` qoladi — indeks bor.)

- [ ] **Step 2: refresh_tokens self-ref FK + indeks** — `refresh-tokens.ts`:
```ts
import { type AnyPgColumn, index } from 'drizzle-orm/pg-core';
// ...
    replacedById: uuid('replaced_by_id').references(
      (): AnyPgColumn => refreshTokens.id,
      { onDelete: 'cascade' },
    ),
// table extras (callback) ga:
    index('refresh_tokens_replaced_by_idx').on(t.replacedById),
```
(Mavjud table-extras callback'iga indeks qo'sh; yo'q bo'lsa yarat.)

---

## Task 3: CLI-96 — indekslar + bitta migration generate

**Files:** Modify `packages/db-schema/src/tables/role-permissions.ts`, `packages/db-schema/src/tables/cashier.ts` (items), `packages/db-schema/src/tables/tooth-charts.ts`; migration `db:generate`

- [ ] **Step 1: indekslar** (har jadval table-extras callback'iga `index()`):
  - `role-permissions.ts`: `index('role_permissions_permission_idx').on(t.permissionId)`.
  - `cashier.ts` `cashierTransactionItems` extras: `index('cashier_tx_items_service_idx').on(t.serviceId)`.
  - `tooth-charts.ts` `toothStates` extras: `index('tooth_states_diagnosis_idx').on(t.diagnosisId)`.
  (Har jadval `(t) => [...]` extras'iga import `index` qo'shilgan bo'lsin.)
- [ ] **Step 2: Migration generate** — `bun --filter @dental/api db:generate`. **APPLY EMAS** (orkestrator). Review: 1 yangi jadval (`tenant_settings`) + 2 FK (`parent_transaction_id`, `replaced_by_id`) + 4 indeks (`replaced_by_id`, `permission_id`, `service_id`, `diagnosis_id`). DROP/data-loss YO'Q.
- [ ] **Step 3: typecheck** (`bun --filter @dental/api typecheck`) — Drizzle self-ref tiplar toza.
- [ ] **Step 4: Commit (orkestrator).**

> ⚠️ FK migration mavjud orphaned dev-data'ni buzsa (parentTransactionId/replacedById mavjud bo'lmagan id'ga ishora) — `ALTER TABLE ADD CONSTRAINT` xato beradi. Orkestrator apply'da: agar xato bo'lsa, dev DB'da orphan'larni tozalash (`UPDATE ... SET parent_transaction_id = NULL WHERE parent_transaction_id NOT IN (SELECT id ...)`) yoki test-transient data tufayli muammosiz. Pre-launch — past xavf.

---

## Task 4: tenant-settings moduli (Wave 2)

**Files:** Create `apps/api/src/modules/tenant-settings/{tenant-settings.schema.ts, tenant-settings.service.ts, tenant-settings.routes.ts, index.ts}`; Create `apps/api/tests/integration/tenant-settings.test.ts`. (app.ts mount — orkestrator.)

- [ ] **Step 1: Schema** — `updateSettingsSchema` (`vertical?: z.string().min(1)`, `reminderLeadHours?: z.number().int().min(0).max(168)`, `currency?: z.string().min(1).max(8)`).
- [ ] **Step 2: Service** (factory `{ audit }`):
  - `getOrCreate(c)` — `tenant_settings` where tenant (RLS); yo'q bo'lsa default row insert (`tenantId = c.get('activeTenantId')`) + qaytaradi.
  - `update(c, input)` — get-or-create keyin `update ... set` (faqat berilgan maydonlar + `updatedAt`), audit.
- [ ] **Step 3: Routes** — `GET /api/tenant-settings` (`tenant_settings.view`) → `getOrCreate`; `PATCH /api/tenant-settings` (`tenant_settings.edit`) → `update`. index `tenantSettingsRoutes` eksport.
- [ ] **Step 4: Integration test** — tenant seed; GET (row yo'q → default yaratiladi, vertical='dental'); PATCH (vertical='cosmetology', reminderLeadHours=48) → qaytadi; ikkinchi GET o'zgargan qiymat; RLS scope. ISHLATMA (orkestrator).
- [ ] **Step 5: Verify (typecheck) + Commit (orkestrator).**

---

## Task 5: api-client (barrier)

**Files:** Modify `packages/api-client/src/types.ts` (yoki yangi `types-tenant.ts`), `endpoints.ts`

- [ ] **Step 1: Tip** — `TenantSettings` ({id,tenantId,vertical,reminderLeadHours,currency,createdAt,updatedAt}).
- [ ] **Step 2: Endpoint** — `tenant` blokiga: `getSettings: () => api.get<TenantSettings>('/api/tenant-settings')`, `updateSettings: (body: { vertical?: string; reminderLeadHours?: number; currency?: string }) => api.patch<TenantSettings>('/api/tenant-settings', body)`.
- [ ] **Step 3: index re-export (agar yangi fayl) + typecheck (api-client+web) + Commit (orkestrator).**

---

## Task 6: tenant-settings UI (Wave 3)

**Files:** Modify `apps/web/src/features/settings/` (tenant settings) + `pages/settings/tenant.page.tsx`; i18n `tenant_settings.*`

- [ ] **Step 1: api hooks** — `useTenantSettings()` + `useUpdateTenantSettings()` → `api.tenant.getSettings/updateSettings`. query-key `['tenant-settings']`.
- [ ] **Step 2: UI** — `TenantSettingsPage` (yoki settings tenant ekrani)ga bo'lim: `vertical` (Select — hozircha `dental`; kelajak vertikallar), `currency` (TextInput/Select), `reminderLeadHours` (NumberInput 0-168). `tenant_settings.edit` gate (yo'q bo'lsa read-only). **zod4Resolver**. i18n `tenant_settings.*` (uz+ru) — mavjud `tenant_settings` namespace bor (readonly_notice), kengaytiriladi.
- [ ] **Step 3: Verify (typecheck + o'z vitest) + Commit (orkestrator).**

---

## Wave 3 yakuni: app.ts mount (orkestrator)
- `app.ts`: `app.route('/api/tenant-settings', tenantSettingsRoutes({ db, audit }))`. (Route allaqachon settings sahifa ichida — frontend route yo'q.)

## Yakuniy verifikatsiya
- [ ] typecheck (api/api-client/web) + api suite (tenant-settings integration + **mavjud refund/token/RLS testlari yashil** — FK regression-free) + web suite + `check:rls` (1 yangi jadval → 29).
- [ ] Dev fidelity (inson): tenant settings — vertical/currency/reminder tahrir + saqlash.
- [ ] Linear CLI-94/95/96 Done; PR `feat/m2-backend-foundation`.
