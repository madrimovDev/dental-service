# M2 — Backend Foundation: Design Spec (CLI-93)

- **Sana:** 2026-06-11
- **Epik:** Linear CLI-93 (M2 — Backend Foundation). Qamrov: **CLI-94** (tenant_settings), **CLI-95** (FK constraint), **CLI-96** (indeks). **CLI-99 (clinical split) DEFER** (sof tech-debt refactor, keyinga).
- **Bog'liq:** 2026-06-09 DB-audit, RFC-0001 (vertical), RFC-0009; R4-C reminder (reminderLeadHours ulanishi)
- **Status:** Approved (brainstorm), spec → plan'ga tayyor
- **Branch:** `feat/m2-backend-foundation` (main'dan)

## Maqsad

2026-06-09 DB-audit'dan kelib chiqqan integrity/latent-bug tuzatishlari: `tenant_settings` jadval (orphaned perm + R5 vertical-gating prerequisite), yetishmayotgan FK constraint va indekslar. Redesign R-ketma-ketligidan tashqari backend-sifat epiki.

## A. CLI-94 — `tenant_settings`

### Muammo
`tenant_settings.view`/`tenant_settings.edit` permission'lar (`permissions.ts`) + role-template'lar (Tenant Admin) referlaydi, lekin **jadval ham, route ham yo'q** — orphaned perm (latent bug). R5/CLI-79 vertikal-gating `vertical`'ga tayanadi.

### Schema
```
tenant_settings
├── id uuid pk
├── tenant_id uuid NOT NULL UNIQUE → tenants (cascade)
├── vertical text NOT NULL default 'dental'        # RFC-0001 yorlig'i; R5 gating manbasi
├── reminder_lead_hours integer NOT NULL default 24 # R4-C reminder yetakchi-soati
├── currency text NOT NULL default 'UZS'
├── created_at, updated_at timestamptz
```
RLS (`migrations/rls/0011_tenant_settings_rls.sql`). `defaultLanguage` — `tenants`'da qoladi (dublikat yo'q); `defaultWorkHours` — `branches.workHours` mavjud (takror yo'q).

### Backend
- `GET /api/tenant-settings` (`tenant_settings.view`) — **get-or-create:** row bo'lsa qaytaradi, yo'q bo'lsa default bilan yaratib qaytaradi (lazy). 
- `PATCH /api/tenant-settings` (`tenant_settings.edit`) — upsert (vertical/reminderLeadHours/currency), audit.
- Modul: `apps/api/src/modules/tenant-settings/` (yoki tenants moduliga sub). Yangi orphaned perm'lar endi ulangan.

### UI
- Sozlama ekranida (`features/settings` tenant) — `vertical` (Select: dental/...), `currency`, `reminderLeadHours` (NumberInput) ko'rsatish+tahrir. Mavjud `TenantSettingsPage` kengaytmasi. zod4Resolver.

### Bonus (ixtiyoriy follow-up, M2 scope tashqarisida belgilanadi)
R4-C reminder hozir hardcoded 24s (`reminderDelayMs(..., 24)`). `tenant_settings.reminderLeadHours`'ni o'qishga ulanishi mumkin (appointments enqueue). M2'da integrity'ga fokus — bu behavioral ulanish **defer** (qayd etiladi, R5 yoki alohida).

## B. CLI-95 — FK constraint (migration)
- `cashier_transactions.parentTransactionId` → `cashier_transactions(id)` **ON DELETE RESTRICT** (refund/void zanjiri yaxlitligi). *(Indeks allaqachon bor — `cashier_tx_parent_unique`.)* Drizzle self-ref `.references((): AnyPgColumn => cashierTransactions.id)` yoki `foreignKey()` extras.
- `refresh_tokens.replacedById` → `refresh_tokens(id)` **ON DELETE CASCADE** (token rotatsiya) + indeks (`replaced_by_id`).
- ⚠️ Mavjud orphaned ma'lumot FK'ni buzishi mumkin (dev DB minimal/test-transient — past xavf; migration review'da tekshiriladi).

## C. CLI-96 — Yetishmayotgan indekslar (migration)
FK ustunlarda standalone indeks yo'q → query perf (ayniqsa `role_permissions.permission_id` RLS subquery'da):
- `role_permissions.permissionId` (FK bor, indeks yo'q — composite PK `(roleId, permissionId)` permissionId'ni birinchi qilmaydi).
- `cashier_transaction_items.serviceId`.
- `tooth_states.diagnosisId`.
Drizzle `index()` qo'shimchasi + migration.

## D. CLI-99 — DEFER
clinical modul RFC-0009 split — sof tech-debt refactor (user qiymati yo'q, regression xavfi). M2'dan chiqarildi; Backlog'da qoladi (keyin alohida).

## Topologiya
```
Wave 1 (schema+migration, 1 agent): tenant_settings jadval + CLI-95 FK (.references/foreignKey) + CLI-96 indeks — bitta drizzle migration + tenant_settings RLS migration; generate (apply orkestrator)
  ── barrier: migration apply ──
Wave 2: CLI-94 modul+endpoint (+ integration test) ∥ docs
  ── barrier: api-client (tenant-settings endpoint) ──
Wave 3: tenant-settings UI
```
FK/indeks faqat schema+migration (Wave 1) — xulq o'zgartirmaydi, modul yo'q.

## Test + Verifikatsiya
- CLI-94 integration (real DB): get-or-create (yo'q→default yaratiladi; bor→qaytaradi); PATCH upsert; RLS scope.
- CLI-95/96: migration apply + `check:rls` + **to'liq api suite yashil** (FK/indeks mavjud xulqni buzmaydi — refund/token/RLS testlari o'tishi tasdiq).
- typecheck (api/api-client/web) + web suite.

## Yangi permissions
Yo'q — `tenant_settings.view`/`tenant_settings.edit` allaqachon mavjud (orphaned), bu epik ularni ulaydi.

## Ochiq mayda nuqtalar (plan'da)
- Self-ref FK Drizzle sintaksisi (`AnyPgColumn` vs `foreignKey()` extras) — plan'da mavjud pattern tekshiriladi.
- tenant_settings get-or-create: GET'da yozish (lazy create) yoki tenant register'da seed? Taklif: lazy get-or-create (mavjud tenant'lar uchun ham ishlaydi). Plan'da qotiriladi.
- FK migration mavjud dev data'ni buzsa — migration'da tozalash yoki dev DB reset (pre-launch). Plan'da qayd.
