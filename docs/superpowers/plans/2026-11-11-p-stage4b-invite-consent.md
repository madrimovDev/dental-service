# P bosqichi 4b — Taklifga rozilik (P6 qoldig'i, FU-08) Implementation Plan

> **For agentic workers:** superpowers:executing-plans. Ijro: `docs/ORCHESTRATION-GUIDE.md`. Steps `- [ ]`.

**Goal:** mavjud platforma foydalanuvchisini taklif qilish uni darhol tenant a'zosi qilmaydi — foydalanuvchi o'zi qabul qilgunicha tayinlov «kutilmoqda». Shunda begona klinika rozisiz a'zolik yaratib, keyin parolni tiklab hisobni egallay olmaydi.

**Architecture:** `user_assignments.accepted_at` (NULL = kutilmoqda). Tayinlov faqat `accepted_at IS NOT NULL` bo'lsa ishlaydi (permission'lar, workspace ro'yxati, switch, reset). Yangi `GET/POST /api/auth/invitations*`. Web: workspace tanlash sahifasida takliflar; xodimlar ro'yxatida «Kutilmoqda» belgisi.

**Spec:** roadmap §3.5 P6 + 👤 qaror (2026-11-11): «Taklifga rozilik».

## Global Constraints

- Migratsiya **0046**: `ALTER TABLE user_assignments ADD COLUMN accepted_at timestamptz NULL`; mavjud qatorlar `UPDATE … SET accepted_at = created_at` (backfill — eski a'zoliklar qabul qilingan deb hisoblanadi).
- **Invite:** foydalanuvchi **yangi yaratilsa** (shu so'rovda) → `accepted_at = now()` (boshqa identifikatsiyasi yo'q). **Mavjud** foydalanuvchi → yangi tayinlov `accepted_at = NULL`; javob `{ pending: true }`. Mavjud **qabul qilingan** tayinlovni qayta faollashtirish (CLI-427 yo'li) `accepted_at`ni saqlaydi; ilgari qabul qilinmagan bo'lsa NULL qoladi.
- `addAssignment` — foydalanuvchining shu tenantda **qabul qilingan** tayinlovi bo'lsa yangi tayinlov `accepted_at = now()` (allaqachon rozi), aks holda NULL.
- Kutilayotgan tayinlov: `buildPermissionsForContext`, workspace ro'yxati (`login`/`me` dagi tenants), `switchWorkspace`, `resetUserPassword` («shu tenant a'zosi» tekshiruvi) — hammasi `accepted_at IS NOT NULL` talab qiladi. Reset kutilayotgan a'zoga → 403 `user.not_in_tenant`.
- Endpoint'lar (authMiddleware, `requirePermission` SIZ — o'z takliflari; `pwc` token bilan yopiq):
  - `GET /api/auth/invitations` → `[{ id, tenantId, tenantName, branchId, branchName, roleName, invitedAt }]` (faqat o'zi, `is_active`, `accepted_at IS NULL`, muddati o'tmagan);
  - `POST /api/auth/invitations/{id}/accept` → `accepted_at = now()`; audit `invitation_accepted` (tenant konteksti bilan);
  - `POST /api/auth/invitations/{id}/decline` → `is_active = false`; audit `invitation_declined`.
  - Boshqa foydalanuvchining taklif id'si → 404.
- Xodimlar ro'yxati DTO'siga `pending: boolean` (assignment darajasida) — UI «Kutilmoqda» belgisi; kutilayotgan a'zo uchun reset tugmasi ko'rsatilmaydi.
- i18n uz+ru. Rol-bo'yicha testlar real permset bilan.

## Review Focus

1. **Bosqich 4 verifier'ining hujum zanjiri yopilgan:** A klinika owner'i B klinika shifokorini invite → reset → 403 `user.not_in_tenant`; shifokor login'i va B dagi ma'lumoti o'zgarmagan.
2. **Kutilayotgan taklif bilan switch-workspace** → 403; permission bo'sh.
3. **Taklifni boshqa foydalanuvchi qabul qila olmaydi** (id bo'yicha) → 404.
4. **Eski (backfill) a'zoliklar ishlashda davom etadi** — migratsiyadan keyin mavjud xodim login + switch.
5. **Yangi foydalanuvchi invite** (tempPassword bilan) darhol ishlaydi — rozilik so'ralmaydi.

---

### Task 1: API — `accepted_at`, invite/assignment mantiqi, invitations endpoint'lari

**Tier:** T3 `sonnet`·`high` · risky (verifier).

**Files:** `packages/db-schema/src/tables/user-assignments.ts`, `apps/api/drizzle/0046_*` (drizzle-kit generate + qo'lda backfill UPDATE), `apps/api/src/modules/users/users.service.ts` (+ schema/mapper `pending`), `apps/api/src/modules/auth/auth.service.ts` (buildPermissionsForContext ~218, workspace list ~378, switchWorkspace), `apps/api/src/modules/auth/auth.routes.ts` + schema (invitations), Test: yangi `apps/api/tests/integration/p6b-invite-consent.test.ts`.

- [ ] **Step 1:** Failing test (Review Focus 1–5 + accept → switch ishlaydi; decline → taklif yo'qoladi, a'zolik yo'q).
- [ ] **Step 2:** `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/p6b-invite-consent.test.ts` FAIL.
- [ ] **Step 3:** Implementatsiya; migratsiyani lane bazasiga `env -u DATABASE_URL -u DATABASE_ADMIN_URL -u REDIS_URL bun --env-file=../../.env run src/db/migrate.ts`.
- [ ] **Step 4:** shu test + `tests/integration/p6-owner-reset.test.ts`, `tests/integration/p5-role-escalation.test.ts`, `tests/integration/cli-427-reinvite-reactivate.test.ts`, `tests/integration/cli-429-add-assignment-validation.test.ts`, `tests/integration/cli-157-workspace-branches.test.ts`, `tests/integration/phone-normalization.test.ts` PASS; `bunx tsc --noEmit -p .`; `bun run generate:contract`.
- [ ] **Step 5:** Commit `fix(api): mavjud foydalanuvchini taklif qilish rozilik talab qiladi (P6, FU-08)`.

### Task 2: Web — takliflar va «Kutilmoqda»

**Tier:** T2 `sonnet`·`medium`.

**Files:** `apps/web/src/features/auth/auth.api.ts` (+ keys: `useInvitations`, `useAcceptInvitation`, `useDeclineInvitation`), `apps/web/src/features/auth/pages/select-workspace.page.tsx` (takliflar kartasi: klinika, filial, rol, «Qabul qilish»/«Rad etish»; qabul qilinsa workspace ro'yxati yangilanadi), `apps/web/src/features/settings/components/UsersSettingsScreen.tsx` («Kutilmoqda» StatusPill/Badge, reset ikonkasi kutilayotganlarda yo'q), invite natija bildirishnomasi (`pending:true` → «Taklif yuborildi — xodim qabul qilgach a'zo bo'ladi»), `packages/i18n/src/{uz,ru}.json` (`auth.invitations.*`, `settings.users.pending`, `settings.users.invitePending`); Test: `select-workspace.page.test.tsx`, `UsersSettingsScreen.test.tsx`.

- [ ] **Step 1:** Failing testlar: takliflar ro'yxati ko'rinadi, «Qabul qilish» mutatsiyani chaqiradi va invalidate qiladi; takliflar bo'lmasa blok ko'rinmaydi; xodimlar ro'yxatida pending belgisi; invite `pending:true` bildirishnomasi.
- [ ] **Step 2–4:** `cd apps/web && bunx vitest run src/features/auth src/features/settings/components/UsersSettingsScreen.test.tsx` FAIL → PASS; `bun run typecheck`.
- [ ] **Step 5:** Commit `feat(web): taklifni qabul qilish/rad etish, «Kutilmoqda» belgisi (P6, FU-08)`.

## Ijro
- Bitta lane, ketma-ket. Verifier: Task 1 (Review Focus 1–3 ni HTTP orqali hujum bilan).
