# P bosqichi 4 — Xavfsizlik (P5, P6, P7, P8) Implementation Plan

> **For agentic workers:** superpowers:executing-plans. Ijro qoidalari: `docs/ORCHESTRATION-GUIDE.md`. Steps `- [ ]`.

**Goal:** xodim o'zidan yuqori huquq bera olmaydi (P5); parolni faqat owner tiklaydi va natija majburiy almashtiriladigan vaqtinchalik parol (P6); POS erkin sotuvi begona rejaga bog'lanmaydi (P7); Telegram'da faqat o'z raqamini bog'lash mumkin (P8).

**Architecture:** 3 lane. L1 — `users` + `roles` + `auth` (P5 → P6, ketma-ket, bitta migratsiya `0045`), web (forced-change ekrani, reset tugmasi faqat owner'ga). L2 — `cashier` (P7). L3 — `telegram-bot-manager` (P8).

**Tech Stack:** Bun/Hono/zod-openapi/Drizzle (api), React/Mantine/vitest (web), bun:test.

**Spec:** `docs/superpowers/specs/2026-11-11-completion-roadmap-design.md` §3.5.

## Global Constraints

- **Owner** = `accessClaims.perms.includes('@owner')` (implicit superuser). Owner uchun P5 cheklovlari qo'llanmaydi.
- **P5 qoida:** tayinlanayotgan/yaratilayotgan rolning permission kodlari (`OWNER_ONLY_PERMISSIONS` dan tashqari) chaqiruvchining `perms` qism-to'plami bo'lishi shart; aks holda **403 `role.escalation`** (`details: { missing: string[] }`). Qo'llanadi: `invite`, `addAssignment`, `updateAssignment` (rol o'zgarsa; rol mavjudligi ham tekshiriladi → 404 `role.not_found`), `roles.create`, `roles.update`.
- **P6 qoida (👤):** `POST /users/{userId}/reset-password` — faqat owner (aks holda **403 `user.reset_owner_only`**); maqsad shu tenant a'zosi (mavjud `user.not_in_tenant`); owner o'zini bu yo'l bilan tiklamaydi (**400 `user.reset_self`** — `/auth/change-password` bor). Natija: yangi vaqtinchalik parol + `users.must_change_password = true` + refresh token'lar bekor + audit `password_reset_by_owner`. **Ochiq parol log'ga yozilmaydi.**
- **Majburiy almashtirish:** `must_change_password = true` foydalanuvchi login qilsa access token'da `pwc: true` claim, javobda `mustChangePassword: true`. `authMiddleware` `pwc` bo'lsa faqat `/api/auth/change-password`, `/api/auth/me`, `/api/auth/logout` ni o'tkazadi, qolgani **403 `auth.password_change_required`**; `/api/auth/switch-workspace` va `/api/auth/refresh` ham `pwc`ni saqlaydi (DB'dan qayta o'qiladi) va switch rad etiladi. `changePassword` bayroqni `false` qiladi (mavjud xulq: barcha refresh token'lar bekor → web qayta login'ga yuboradi).
- **P7:** POS `items` rejimida (`allocations` yo'q) `treatmentPlanId` berilsa → **400 `cashier.items_plan_not_allowed`**; `patientId` berilsa DB'da (RLS) mavjudligi tekshiriladi → **400 `patient.not_found`**.
- **P8:** `ctx.message.contact.user_id !== ctx.from.id` → bog'lamaydi, javob «Faqat o'z raqamingizni ulashing.»; bemorda boshqa `telegramChatId` allaqachon bo'lsa → ustiga yozmaydi, javob «Bu raqam boshqa Telegram hisobiga bog'langan. Klinikaga murojaat qiling.» (outcome `already_linked`); bir xil chat → `linked`.
- Web matnlari `t()` (uz+ru). Rol-bo'yicha test real cheklangan permset bilan, `@owner` emas (P5/P6 testlarida ikkalasi ham).
- Migratsiya raqami: **0045** (faqat L1).

## Review Focus

1. **Branch Manager `user.manage` bilan o'ziga Tenant Admin rolini biriktira olmaydi** — invite/addAssignment/updateAssignment uchalasida (L1.1).
2. **`role.manage` egasi o'z roliga yangi permission qo'sha olmaydi** (roles.update) (L1.1).
3. **Vaqtinchalik parol bilan kirgan foydalanuvchi workspace tanlab tenant ma'lumotini o'qiy olmaydi** (switch-workspace va to'g'ridan `/api/patients`) (L1.2).
4. **Refresh token orqali `pwc` claim'idan qochib bo'lmaydi** (L1.2).
5. **Telegram: boshqa odamning kontaktini forward qilish bemorni bog'lamaydi** (L3.1).

---

## Lane L1 — users/roles/auth (+ web)

### Task L1.1: P5 — rol eskalatsiyasi

**Tier:** T3 `sonnet`·`high` · risky (verifier).

**Files:** Create `apps/api/src/lib/role-escalation.ts`; Modify `apps/api/src/modules/users/users.service.ts` (invite ~68, addAssignment ~202, updateAssignment ~262), `apps/api/src/modules/users/users.routes.ts` (403 javobni declare + map), `apps/api/src/modules/roles/roles.service.ts` (create ~32, update ~75), `apps/api/src/modules/roles/roles.routes.ts`; Test: yangi `apps/api/tests/integration/p5-role-escalation.test.ts`.

**Interfaces — Produces:**
- `class RoleEscalationError extends Error { code = 'role.escalation'; missing: string[] }`
- `loadRolePermissionCodes(db: DbOrTx, roleId: string): Promise<string[] | null>` (null = rol yo'q)
- `assertCanGrant(callerPerms: string[], codes: string[]): void` — owner → no-op; `OWNER_ONLY_PERMISSIONS` e'tiborsiz; yetishmasa `RoleEscalationError`.

- [ ] **Step 1:** Failing test (real DB, `cli-429-add-assignment-validation.test.ts` fixture naqshi; real permset: Branch Manager shablonidagi kodlar bilan `accessClaims`): (a) BM invite Tenant Admin rol bilan → 403 `role.escalation`; (b) BM addAssignment Tenant Admin → 403; (c) BM updateAssignment roleId=Tenant Admin → 403; (d) updateAssignment mavjud bo'lmagan roleId → 404 `role.not_found`; (e) `role.manage` bo'lgan rol o'z roliga `tenant_settings.manage` (o'zida yo'q kod) qo'shishga uringanda → 403; (f) BM o'z permset'i ichidagi rol (Receptionist) bilan invite → 201; (g) owner istalgan rolni bera oladi.
- [ ] **Step 2:** `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/p5-role-escalation.test.ts` → FAIL.
- [ ] **Step 3:** Implementatsiya. **Step 4:** shu test + `tests/integration/cli-429-add-assignment-validation.test.ts`, `tests/integration/cli-427-reinvite-reactivate.test.ts`, `tests/integration/cli-412-role-template-permissions.test.ts` PASS; `bunx tsc --noEmit -p .`.
- [ ] **Step 5:** `bun run generate:contract` (403 declare o'zgargan bo'lsa). Commit `fix(api): xodim o'zidan yuqori huquqli rol bera olmaydi (P5)`.

### Task L1.2: P6 — owner-only reset + majburiy parol almashtirish

**Tier:** T3 `sonnet`·`high` · risky (verifier).

**Files:** Create `apps/api/drizzle/0045_users_must_change_password.sql` (+ drizzle meta, `drizzle-kit generate` bilan), Modify `packages/db-schema/src/tables/users.ts` (`mustChangePassword: boolean('must_change_password').notNull().default(false)`), `apps/api/src/lib/jwt.ts` (`AccessClaims.pwc?: boolean`), `apps/api/src/modules/auth/auth.service.ts` (login ~286, switchWorkspace ~464, refresh ~593, changePassword ~692), `apps/api/src/modules/auth/auth.routes.ts` / schema (`mustChangePassword` javobda), `apps/api/src/middleware/auth.ts`, `apps/api/src/modules/users/users.service.ts` (resetUserPassword ~334-405), `users.routes.ts`; Test: yangi `apps/api/tests/integration/p6-owner-reset.test.ts`.

- [ ] **Step 1:** Failing test (real DB, real cheklangan permset): (a) Tenant Admin (`user.manage` bor, owner emas) reset → 403 `user.reset_owner_only`; (b) owner reset xodim → 200, `tempPassword` qaytadi, `must_change_password=true`, refresh tokenlar revoked, audit `password_reset_by_owner`; (c) owner o'zini → 400 `user.reset_self`; (d) xodim temp parol bilan login → `mustChangePassword: true`, token `pwc: true`; (e) shu token bilan `GET /api/patients` (switch qilingan bo'lsa ham) → 403 `auth.password_change_required`, `POST /api/auth/switch-workspace` → 403; (f) `/api/auth/refresh` yangi access token'ida ham `pwc: true`; (g) `POST /api/auth/change-password` → 200, bayroq `false`, yangi parol bilan login → `mustChangePassword: false`; (h) `logger` mock/spy'da ochiq parol yo'q (yoki `resetUserPassword` manbasida `logger.*(…Password` grep guard testi).
- [ ] **Step 2–4:** FAIL → implementatsiya (migratsiyani lane bazasida `env -u DATABASE_URL -u DATABASE_ADMIN_URL bun --env-file=../../.env run src/db/migrate.ts` bilan qo'llang) → shu test + `tests/integration/phone-normalization.test.ts`, `tests/integration/cli-227-rate-limit-audit.test.ts`, `src/middleware/*.test.ts` (auth bilan bog'liq) PASS; tsc.
- [ ] **Step 5:** `bun run generate:contract`. Commit `fix(api): parolni faqat owner tiklaydi, vaqtinchalik parol majburiy almashtiriladi (P6)`.

### Task L1.3: P6 web — majburiy almashtirish ekrani + reset tugmasi faqat owner'ga

**Tier:** T2 `sonnet`·`medium`.

**Files:** Create `apps/web/src/features/auth/pages/change-password-required.page.tsx` (+ route `/change-password-required` `auth.routes.tsx`da); Modify `apps/web/src/features/auth/pages/login.page.tsx` (~72: `mustChangePassword` → shu sahifaga), `apps/web/src/lib/query-client.ts` (403 `auth.password_change_required` → shu sahifaga, `handleLicenseBlock` naqshi), `apps/web/src/features/settings/components/UsersSettingsScreen.tsx` (reset ikonkasi faqat owner'ga — perms `@owner`; natija modali matni: «Xodim birinchi kirishda parolni almashtiradi»), `packages/i18n/src/{uz,ru}.json` (`auth.pwdChangeRequired.*`, `settings.users.resetOwnerOnly`); Test: `change-password-required.page.test.tsx`, `login.page.test.tsx`, `UsersSettingsScreen.test.tsx`.

- [ ] **Step 1:** Failing testlar: login javobi `mustChangePassword:true` → navigate `/change-password-required`; sahifa formasi (joriy=vaqtinchalik, yangi, tasdiq; yangi ≠ joriy, min uzunlik mavjud `changePassword` schema'si bilan bir xil) → `useChangePassword` → muvaffaqiyatda tokenlar tozalanadi va `/login` + bildirishnoma; owner bo'lmagan foydalanuvchida reset ikonkasi yo'q.
- [ ] **Step 2–4:** `cd apps/web && bunx vitest run src/features/auth src/features/settings/components/UsersSettingsScreen.test.tsx src/lib/query-client.test.ts` FAIL → PASS; `bun run typecheck`.
- [ ] **Step 5:** Commit `feat(web): vaqtinchalik parolni majburiy almashtirish ekrani (P6)`.

## Lane L2 — cashier

### Task L2.1: P7 — POS items + begona reja

**Tier:** T2 `sonnet`·`medium` · risky (pul — verifier).

**Files:** Modify `apps/api/src/modules/cashier/cashier.service.ts` (~303-343), `cashier.routes.ts` (400 map); Test: yangi `apps/api/tests/integration/p7-pos-items-plan.test.ts`.

- [ ] **Step 1:** Failing test (real DB, Receptionist/Kassir permset): (a) items + `treatmentPlanId` → 400 `cashier.items_plan_not_allowed`, tranzaksiya yozilmaydi; (b) items + boshqa tenant/mavjud bo'lmagan `patientId` → 400 `patient.not_found`; (c) items + mavjud `patientId` → 201, bemor balansiga ta'sir mavjud xulq bo'yicha; (d) allocations yo'li o'zgarmagan (mavjud CLI-460 testi).
- [ ] **Step 2–4:** FAIL → implementatsiya → shu test + mavjud cashier integration testlari (`ls tests/integration | grep -iE 'cashier|cli-46|cli-448'` — nomlarini yozing) PASS; tsc.
- [ ] **Step 5:** Commit `fix(api): POS erkin sotuvi rejaga bog'lanmaydi, bemor tekshiriladi (P7)`.

## Lane L3 — telegram

### Task L3.1: P8 — kontakt egaligi

**Tier:** T2 `sonnet`·`medium` · risky (PHI).

**Files:** Modify `apps/api/src/lib/telegram-bot-manager.ts` (~45-64 — handler'ni sof funksiyaga ajrating: `linkPatientByContact(tx, { contactUserId, fromId, phone, chatId }): Promise<'linked' | 'not_found' | 'not_own_contact' | 'already_linked'>`); Test: yangi `apps/api/tests/integration/p8-telegram-contact.test.ts` (real DB, sof funksiya).

- [ ] **Step 1:** Failing test: begona kontakt → `not_own_contact`, bemor o'zgarmaydi; o'z kontakti, bemorda chat yo'q → `linked`; boshqa chat bilan bog'langan → `already_linked`, eski chat saqlanadi; xuddi shu chat → `linked`; telefon topilmadi → `not_found`.
- [ ] **Step 2–4:** FAIL → implementatsiya (handler javob matnlari Global Constraints'dagidek) → shu test + mavjud telegram testlari (`ls tests/integration src/lib | grep -i telegram`) PASS; tsc.
- [ ] **Step 5:** Commit `fix(api): Telegram'da faqat o'z raqamini bog'lash, mavjud bog'lanish ustiga yozilmaydi (P8)`.

---

## Ijro
- L1 (L1.1→L1.2→L1.3), L2, L3 parallel. Har lane o'z test bazasi + Redis indeksi (worktree `.env`).
- `generate:contract` faqat L1 (L2 `cashier.routes` 400 declare qo'shsa — integratsiya branch'ida controller bir marta qayta generatsiya qiladi).
- Verifier: L1.1, L1.2, L2.1, L3.1.
