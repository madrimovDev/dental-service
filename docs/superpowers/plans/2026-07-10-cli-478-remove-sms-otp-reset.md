# CLI-478 — SMS OTP parol-reset oqimini olib tashlash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Self-service SMS OTP parol-reset oqimini (backend endpoint/service/schema, dead config, DB jadval, web sahifa/hook/route/link) butunlay o'chirish; owner (Supervisor CLI-226) va xodim (owner admin-reset) yo'llari o'zgarmaydi.

**Architecture:** Consumer'dan manbaga qarab o'chirish — avval backend oqim, keyin dead config va DB, keyin web consumer, eng oxirida OpenAPI regenerate. Bu tartib har task oxirida `typecheck` toza qolishini kafolatlaydi (generated api-client eng oxirida yangilanadi, shunda oraliq holatda hech qanday orphan import bo'lmaydi).

> ✅ **Tartib xavfsizligi tasdiqlandi:** `typecheck` = `turbo run typecheck`, turbo.json'da `dependsOn: ["^build"]` (faqat upstream paket build — codegen EMAS). `generate:openapi`/`generate:api-client` alohida explicit skript. Ya'ni typecheck **api-client'ni regenerate qilmaydi** — T1'dan keyin ham eski client saqlanadi va web T4 gacha buzilmaydi. Regenerate faqat T5'da qo'lda ishga tushadi.

**Tech Stack:** Bun + Hono + Drizzle + Zod (`@hono/zod-openapi`) backend; Vite + React + Mantine + TanStack Query web; Vitest (web) / `bun test` (api); orval-generated `@dental/api-client`.

## Global Constraints

- **Til:** barcha yangi/qolgan UI matni `t()` orqali; i18n `uz.json` + `ru.json` ikkalasi ham yangilanadi (CLAUDE.md §3.9)
- **Typecheck:** `bun run typecheck --force` obro'li (harness new-diagnostics ba'zan STALE — [[project_per_tenant_messaging_2026_07_09]])
- **API test:** `bun test --env-file=../../.env` (`apps/api`'da); web test: `vitest` (`apps/web`'da) — [[project_dev_workflow_gotchas]]
- **Commit:** har task oxirida bittadan; commit xabari o'zbekcha, oxirida `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Saqlanadi (hech qachon tegilmaydi):** `/reset-owner-password` (Supervisor), `POST /users/{id}/reset-password` + `UsersSettingsScreen`, `POST /change-password`, per-tenant `resolveTenantChannel`/`createEskizChannel`/`createTelegramChannel`
- **Branch:** `cli-478-remove-sms-otp-reset` (allaqachon yaratilgan, spec commit `9aa43f0` bilan)

---

## File Structure

**O'chiriladigan fayllar:**
- `apps/web/src/features/auth/pages/forgot-password.page.tsx`
- `apps/web/src/features/auth/pages/reset-password.page.tsx`
- `apps/api/tests/integration/cli-226-password-reset-ato.test.ts`
- `packages/db-schema/src/tables/password-reset-tokens.ts`

**Tahrirlanadi:**
- `apps/api/src/modules/auth/auth.service.ts` — 2 funksiya + sms dep + helper/const + import
- `apps/api/src/modules/auth/auth.routes.ts` — 2 route + 2 rate-limiter + import
- `apps/api/src/modules/auth/auth.schema.ts` — 4 schema + 2 type
- `apps/api/src/lib/env-schema.ts` — `ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, `AUTH_RESET_RATE_LIMIT`
- `packages/notifications/src/index.ts` — `createSmsChannel` env-wrapper
- `packages/db-schema/src/index.ts` — `password-reset-tokens` re-export
- `apps/api/tests/integration/cli-442-api-desktop-low.test.ts` — faqat reset qismi (155-159)
- `apps/web/src/features/auth/auth.api.ts` — 2 hook + 2 import
- `apps/web/src/features/auth/auth.routes.tsx` — 2 route + 2 lazy import
- `apps/web/src/features/auth/pages/login.page.tsx` — forgot link
- `packages/i18n/src/locales/uz.json` + `ru.json` — `auth.login.forgot` + `auth.forgot.*`

**Generatsiya (Task 6):**
- `packages/api-client/**` — `generate:openapi` + `generate:api-client`

---

## Task 1: Backend — auth reset endpoint + service + schema o'chirish

**Files:**
- Modify: `apps/api/src/modules/auth/auth.routes.ts` (334-381 route'lar, 71-82 rate-limiter, 23-26 import)
- Modify: `apps/api/src/modules/auth/auth.service.ts` (654-695 `requestPasswordReset`, 709-767 `resetPassword`, 165-167 sms dep, 45-46 `sixDigitCode`, 158-162 const, import'lar, 807-808 return)
- Modify: `apps/api/src/modules/auth/auth.schema.ts` (69-82, 162-172 reset schema/type)
- Delete: `apps/api/tests/integration/cli-226-password-reset-ato.test.ts`
- Modify: `apps/api/tests/integration/cli-442-api-desktop-low.test.ts` (155-160 `requestPasswordReset` describe blok)
- Test: `apps/api/tests/integration/cli-478-reset-removed.test.ts` (yangi guard)

**Interfaces:**
- Consumes: mavjud `apps/api/src/app.ts` Hono app (integration test uni `app.request(...)` bilan chaqiradi — namuna: `cli-442-api-desktop-low.test.ts` yuqori qismidagi setup)
- Produces: `auth.service.ts` return endi `requestPasswordReset`/`resetPassword` **bermaydi**; `POST /api/auth/password-reset-request` va `POST /api/auth/password-reset` route'lari **yo'q** (404)

- [ ] **Step 1: Guard testni yoz (endpoint endi yo'q)**

`apps/api/tests/integration/cli-478-reset-removed.test.ts` yarat. Setup uchun `cli-442-api-desktop-low.test.ts` faylining yuqori qismidagi app-yuklash pattern'ini nusxala (o'sha faylda `app` qanday import/yaratilishini ko'r), keyin:

```ts
import { describe, expect, it } from 'bun:test';
import app from '../../src/app.ts'; // ⚠️ cli-442 test'dagi aynan import yo'lini ishlat

describe('CLI-478 — SMS OTP reset endpointlari olib tashlangan', () => {
  it('POST /api/auth/password-reset-request 404 qaytaradi', async () => {
    const res = await app.request('/api/auth/password-reset-request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '+998901234567' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/auth/password-reset 404 qaytaradi', async () => {
    const res = await app.request('/api/auth/password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '+998901234567', token: '123456', newPassword: 'x'.repeat(12) }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Guard testni ishga tushir — FAIL bo'lishini tasdiqla**

Run: `cd apps/api && bun test --env-file=../../.env tests/integration/cli-478-reset-removed.test.ts`
Expected: FAIL — route hali mavjud, status 200 (request) / 400 (reset), 404 EMAS.

- [ ] **Step 3: `auth.schema.ts` reset schemalarini o'chir**

Quyidagilarni o'chir: `passwordResetRequestSchema` + `PasswordResetRequestInput` (69-72), `passwordResetSchema` + `PasswordResetInput` (74-82), `passwordResetRequestResponseSchema` + `PasswordResetRequestResponseDto` (162-166), `passwordResetResponseSchema` + `PasswordResetResponseDto` (168-172). Qolgan schemalar (`loginSchema`, `changePasswordSchema` va h.k.) tegilmaydi.

- [ ] **Step 4: `auth.routes.ts` reset route'larini va rate-limiterlarni o'chir**

O'chir: `passwordResetRequestRoute` + handler (334-355), `passwordResetRoute` + handler (357-381), `resetRequestRateLimit` (71-76), `resetRateLimit` (77-82). Import bloki (18-30)dan `passwordResetRequestResponseSchema`, `passwordResetRequestSchema`, `passwordResetResponseSchema`, `passwordResetSchema` ni olib tashla. `phoneKey` (54) **qoladi** (login rate-limit ishlatadi).

- [ ] **Step 5: `auth.service.ts` reset funksiyalarini va o'lik yordamchilarni o'chir**

O'chir:
- `requestPasswordReset` (654-695) va `resetPassword` (709-767) funksiyalar
- return obyektidan (798-809) `requestPasswordReset,` va `resetPassword,` qatorlar
- `AuthServiceDeps.sms` maydon (148-155 doc-comment + `sms?: NotificationChannel;`)
- `const sms = deps.sms ?? createSmsChannel(...)` bloki (165-167)
- `sixDigitCode` helper (45-46)
- `MAX_RESET_ATTEMPTS` (158) va `RESET_TOKEN_TTL_MIN` (160) const'lar
- Import'lardan: `passwordResetTokens` (`@dental/db-schema` blokidan), `createSmsChannel, type NotificationChannel` (`@dental/notifications` — butun qator), `desc` (drizzle-orm blokidan — **`gt` QOLADI**, u boshqa joyda ishlatiladi), `PasswordResetInput, PasswordResetRequestInput` (`./auth.schema.ts` type blokidan)
- ⚠️ `randomBytes` QOLADI (slug), `hashToken` QOLADI (logout)

- [ ] **Step 6: Eski reset testlarni o'chir/tozala + `sms:` literal call-site auditi**

`apps/api/tests/integration/cli-226-password-reset-ato.test.ts` faylini butunlay o'chir (bu fayl faqat o'chirilgan oqimni test qiladi). `apps/api/tests/integration/cli-442-api-desktop-low.test.ts` dan `describe('CLI-442 #5 requestPasswordReset soft-delete filter', ...)` blokini (155-160 atrofi) o'chir — funksiya endi mavjud emas. Fayl sarlavhasidagi `#5 requestPasswordReset ...` izoh qatorini ham (4-qator) tozala. Qolgan cli-442 testlari saqlanadi.

⚠️ **`sms:` literal call-site auditi** (advisor #2 — `AuthServiceDeps.sms` olib tashlangach TS excess-property check object literal'da otiladi):
Run: `grep -rn "createAuthService(" apps/api`
Expected: `cli-226-...test.ts:37` (`{ db, sms: captureChannel }`) — bu fayl yuqorida o'chirildi; qolgan barcha call-site'lar `createAuthService({ db })` (sms yo'q) yoki prod `createAuthService(deps)` (variable). Agar boshqa `sms:` **literal** chiqsa — o'sha test'dan `sms:` maydonini olib tashla (aks holda T8 typecheck qizil bo'ladi).

- [ ] **Step 7: Guard test PASS + qolgan auth testlar yashil**

Run: `cd apps/api && bun test --env-file=../../.env tests/integration/cli-478-reset-removed.test.ts`
Expected: PASS (ikkala endpoint 404).

Run: `cd apps/api && bun test --env-file=../../.env tests/integration/cli-442-api-desktop-low.test.ts`
Expected: PASS (reset bloki yo'q, qolgani o'tadi).

- [ ] **Step 8: Typecheck**

Run: `bun run typecheck --force`
Expected: 0 xato. (api-client hali eski — web `passwordReset`ni hali import qiladi, lekin api-client'da hali mavjud, shuning uchun web ham toza.)

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/auth apps/api/tests/integration
git commit -m "$(cat <<'EOF'
feat(api): CLI-478 — SMS OTP parol-reset endpoint/service/schema olib tashlandi

owner (Supervisor CLI-226) + xodim (owner admin-reset) yo'llari qoladi.
Guard test: /password-reset-request va /password-reset endi 404.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Backend — dead config (env + createSmsChannel) tozalash

**Files:**
- Modify: `apps/api/src/lib/env-schema.ts` (59-60 `ESKIZ_*`, 91 `AUTH_RESET_RATE_LIMIT`)
- Modify: `packages/notifications/src/index.ts` (13-qatordan boshlanuvchi `createSmsChannel`)
- Modify: `.env.production.example` (75-76 `ESKIZ_EMAIL`/`ESKIZ_PASSWORD`)
- Modify: `infra/docker-compose.prod.yml` (126-127 api servis, 157-158 worker servis `ESKIZ_*`)

**Interfaces:**
- Consumes: hech nima (Task 1 dan keyin `env.ESKIZ_*`, `env.AUTH_RESET_RATE_LIMIT`, `createSmsChannel` consumersiz)
- Produces: `@dental/notifications` endi `createSmsChannel` **eksport qilmaydi**; `createEskizChannel`, `createTelegramChannel`, `createNoOpChannel` QOLADI

- [ ] **Step 1: Consumer yo'qligini qayta tasdiqla**

Run: `grep -rn "ESKIZ_EMAIL\|ESKIZ_PASSWORD\|AUTH_RESET_RATE_LIMIT\|createSmsChannel" apps packages --include="*.ts" --include="*.tsx" | grep -v "\.test\." | grep -v "env-schema.ts" | grep -v "notifications/src/index.ts"`
Expected: bo'sh chiqadi (Task 1 hammasini olib tashladi). Agar biror satr chiqsa — o'sha consumer avval tozalanadi.

- [ ] **Step 2: `env-schema.ts`dan o'lik env'larni o'chir**

O'chir: `ESKIZ_EMAIL: z.string().optional(),` (59), `ESKIZ_PASSWORD: z.string().optional(),` (60), `AUTH_RESET_RATE_LIMIT: z.coerce.number().int().positive().default(5),` (91). Qolgan `AUTH_LOGIN_RATE_LIMIT`, `AUTH_REFRESH_RATE_LIMIT`, `AUTH_REGISTER_RATE_LIMIT` tegilmaydi.

- [ ] **Step 3: `packages/notifications/src/index.ts`dan `createSmsChannel` env-wrapper'ni o'chir**

`createSmsChannel = (env: {...}) => ...` blokini butunlay o'chir. `createEskizChannel` (u chaqiradigan asosiy funksiya) QOLADI. Agar barrel `index.ts` `createSmsChannel`ni re-export qilsa — o'sha qatorni ham o'chir.

- [ ] **Step 4: Infra/env template'lardan o'lik ESKIZ config'ni tozala** (advisor #4)

`.env.production.example`dan `ESKIZ_EMAIL=`/`ESKIZ_PASSWORD=` (75-76) qatorlarini o'chir. `infra/docker-compose.prod.yml`dan `ESKIZ_EMAIL: ${ESKIZ_EMAIL:-}` + `ESKIZ_PASSWORD: ${ESKIZ_PASSWORD:-}` juftliklarini **ikkala** servisdan (api 126-127, worker 157-158) o'chir. (Non-breaking edi — Zod schema'da olib tashlangach ortiqcha env e'tiborsiz qolardi — lekin adashtiruvchi dead config qolmasin. ⚠️ Per-tenant SMS `integration_settings`'da, env EMAS — bu tozalash uni buzmaydi.)

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck --force`
Expected: 0 xato.

- [ ] **Step 6: Notifications paket testi (agar bor)**

Run: `grep -rl "createSmsChannel" packages/notifications` — agar test fayli topilsa, o'sha testdan `createSmsChannel` blokini o'chir va `cd packages/notifications && bun test` (yoki `vitest`) yashil bo'lsin. Topilmasa — bu qadamni o'tkaz.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/env-schema.ts packages/notifications .env.production.example infra/docker-compose.prod.yml
git commit -m "$(cat <<'EOF'
refactor: CLI-478 — o'lik ESKIZ_*/AUTH_RESET env + createSmsChannel wrapper olib tashlandi

Faqat SMS OTP reset oqimi ishlatardi (Task 1'da o'chirildi). Env-schema +
.env.production.example + docker-compose.prod.yml (api+worker) tozalandi.
Per-tenant createEskizChannel (recall/reminder) saqlanadi.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: DB — `password_reset_tokens` jadvalini drop qilish

**Files:**
- Delete: `packages/db-schema/src/tables/password-reset-tokens.ts`
- Modify: `packages/db-schema/src/index.ts` (24 `export * from './tables/password-reset-tokens.ts';`)
- Create: `apps/api/drizzle/XXXX_*.sql` (drizzle-kit generate natijasi — drop table)

**Interfaces:**
- Consumes: hech nima (Task 1 `passwordResetTokens` importini olib tashladi)
- Produces: `@dental/db-schema` endi `passwordResetTokens`/`PasswordResetToken`/`PasswordResetTokenInsert` **eksport qilmaydi**; migration jadvalni drop qiladi

- [ ] **Step 1: `passwordResetTokens` boshqa consumer yo'qligini tasdiqla**

Run: `grep -rn "passwordResetTokens\|PasswordResetToken\|password_reset_tokens" apps packages --include="*.ts" | grep -v "\.test\." | grep -v "packages/db-schema/src/tables/password-reset-tokens.ts" | grep -v "packages/db-schema/src/index.ts" | grep -v "apps/api/drizzle/"`
Expected: bo'sh. Agar chiqsa — o'sha consumer avval tozalanadi.

- [ ] **Step 2: Schema faylni va barrel re-export'ni o'chir**

`packages/db-schema/src/tables/password-reset-tokens.ts` faylini o'chir. `packages/db-schema/src/index.ts:24` dan `export * from './tables/password-reset-tokens.ts';` qatorini o'chir. Agar `index.ts:7` dagi izoh qatorida `password_reset_tokens` sanab o'tilgan bo'lsa — izohdan ham olib tashla.

- [ ] **Step 3: Migration generatsiya qil**

Run: `cd apps/api && bun run drizzle:generate` (yoki `bunx drizzle-kit generate` — `package.json`dagi aniq skript nomini `grep drizzle apps/api/package.json` bilan tekshir)
Expected: `apps/api/drizzle/` ostida yangi `.sql` fayl — ichida `DROP TABLE "password_reset_tokens"` (yoki `DROP TABLE IF EXISTS`). Yaratilgan SQL'ni Read bilan ko'r va faqat shu jadval drop qilinganini tasdiqla (boshqa jadvalga tegmasligi kerak). `_journal.json` yangilanadi.

- [ ] **Step 4: Migratsiyani qo'lla + RLS coverage tekshir**

Run: `cd apps/api && bun run drizzle:migrate` (aniq skript nomi `package.json`da)
Expected: migration muvaffaqiyatli, `password_reset_tokens` jadval yo'q.

Run: `bun run check:rls` (repo ildizida)
Expected: PASS — drop qilingan jadval endi RLS-coverage tekshiruvida kutilmaydi (skript schema fayllarini skanerlaydi; fayl o'chirilgani uchun avtomatik moslashadi). Agar skript qandaydir allowlist/ro'yxatda `password_reset_tokens`ni hardcode qilsa — o'sha satrni ham olib tashla.

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck --force`
Expected: 0 xato.

- [ ] **Step 6: Commit**

```bash
git add packages/db-schema apps/api/drizzle
git commit -m "$(cat <<'EOF'
feat(db): CLI-478 — password_reset_tokens jadvali drop qilindi

SMS OTP reset oqimi olib tashlangach jadval o'lik. Pre-launch, jonli ma'lumot yo'q.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Web — reset sahifa/hook/route/link + i18n o'chirish

**Files:**
- Delete: `apps/web/src/features/auth/pages/forgot-password.page.tsx`
- Delete: `apps/web/src/features/auth/pages/reset-password.page.tsx`
- Modify: `apps/web/src/features/auth/auth.api.ts` (6-7 import, 46-64 hooks)
- Modify: `apps/web/src/features/auth/auth.routes.tsx` (7-9 + 17-19 lazy import, 29-30 route)
- Modify: `apps/web/src/features/auth/pages/login.page.tsx` (88-90 forgot link)
- Modify: `packages/i18n/src/locales/uz.json` + `ru.json` (`auth.login.forgot`, `auth.forgot.*`)
- Test: `apps/web/src/features/auth/pages/login.page.test.tsx` (forgot link yo'qligi guard)

**Interfaces:**
- Consumes: hali eski api-client (`passwordReset`, `passwordResetRequest` mavjud, lekin Task oxirida import qilinmaydi) — Task 6 regenerate ularni olib tashlaydi
- Produces: `/forgot-password` va `/reset-password` route'lari yo'q; login sahifada faqat `/reset-owner-password` + (browser'da) `/register-tenant` linklari

- [ ] **Step 1: Guard test yoz — login sahifada forgot link yo'q**

`apps/web/src/features/auth/pages/login.page.test.tsx` ga qo'sh (mavjud render setup'ini ishlat, `it('...reset_owner...')` testi yonida):

```tsx
it('forgot-password havolasi ko\'rinmaydi (SMS OTP reset olib tashlandi — CLI-478)', () => {
  renderLoginPage(); // ⚠️ mavjud testdagi aynan render helper'ni ishlat
  expect(screen.queryByText(i18n.t('auth.login.forgot'))).not.toBeInTheDocument();
  // reset-owner havolasi hamon bor:
  expect(screen.getByText(i18n.t('auth.login.reset_owner'))).toBeInTheDocument();
});
```

- [ ] **Step 2: Guard testni ishga tushir — FAIL**

Run: `cd apps/web && bunx vitest run src/features/auth/pages/login.page.test.tsx`
Expected: FAIL — forgot link hali sahifada bor (`queryByText` topadi).

- [ ] **Step 3: `login.page.tsx`dan forgot link'ni o'chir**

88-90 qatorlardagi `<Anchor component={Link} to="/forgot-password" size="sm">{t('auth.login.forgot')}</Anchor>` blokini o'chir. `/reset-owner-password` (91-93) va `/register-tenant` (94-98) linklar QOLADI. `Anchor`/`Link` import'lari boshqa linklar uchun hali kerak — o'chirma.

- [ ] **Step 4: `auth.api.ts`dan reset hooklarni va importlarni o'chir**

O'chir: `usePasswordResetRequest` (46-54), `usePasswordReset` (56-64), `ResetRequestVars`/`ResetVars` type'lar. Import blokidan (1-10) `passwordReset,` va `passwordResetRequest,` ni olib tashla. `login`, `registerTenant`, `getMe` va h.k. QOLADI.

- [ ] **Step 5: `auth.routes.tsx`dan reset route'larni o'chir**

O'chir: `ForgotPasswordPage` lazy (7-9), `ResetPasswordPage` lazy (17-19), `{ path: '/forgot-password', ... }` (29), `{ path: '/reset-password', ... }` (30). `ResetOwnerPasswordPage` (14-16) va `/reset-owner-password` (31) QOLADI.

- [ ] **Step 6: Reset sahifa fayllarini o'chir**

`apps/web/src/features/auth/pages/forgot-password.page.tsx` va `reset-password.page.tsx` fayllarini o'chir (+ ularning `.test.tsx` juftlari bo'lsa).

- [ ] **Step 7: i18n keylarni o'chir (uz + ru)**

Ikkala `packages/i18n/src/locales/uz.json` va `ru.json`dan: `auth.login.forgot` kaliti (111-qator) va butun `auth.forgot` bloki (139+: `title`, `sent`, `mock_otp_notice`, `submit`, `back_to_login`). `auth.login.reset_owner` QOLADI. JSON valid qolishiga e'tibor ber (ortiqcha vergul yo'q).

- [ ] **Step 8: Guard test PASS + auth web testlar yashil**

Run: `cd apps/web && bunx vitest run src/features/auth`
Expected: PASS — forgot guard o'tadi, reset_owner testi hamon o'tadi, o'chirilgan sahifa testlari yo'q.

- [ ] **Step 9: Typecheck**

Run: `bun run typecheck --force`
Expected: 0 xato. (api-client hali `passwordReset` eksport qiladi, lekin auth.api.ts endi import qilmaydi → toza.)

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/features/auth packages/i18n
git commit -m "$(cat <<'EOF'
feat(web): CLI-478 — SMS OTP reset sahifa/hook/route/link + i18n olib tashlandi

Login sahifada faqat "Owner parolini tiklash" (Supervisor) havolasi qoladi.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: OpenAPI spec + api-client regenerate

**Files:**
- Modify (generated): `packages/api-client/**`, OpenAPI spec fayli (`generate:openapi` chiqishi)

**Interfaces:**
- Consumes: Task 1 dan keyingi backend (reset route'lari yo'q)
- Produces: `@dental/api-client` endi `passwordReset`/`passwordResetRequest` funksiyalarini va tegishli generated model'larni **eksport qilmaydi**

- [ ] **Step 1: OpenAPI spec + client regenerate qil**

Run: `bun run generate:openapi && bun run generate:api-client`
Expected: muvaffaqiyatli. Spec'dan `passwordReset`/`passwordResetRequest` operatsiyalari va `PasswordReset*Response` model'lari yo'qoladi.

- [ ] **Step 2: Orphan reset artefaktlari yo'qligini tasdiqla**

Run: `grep -rn "passwordReset\|PasswordReset\|password-reset" packages/api-client/src`
Expected: bo'sh (yoki faqat `reset-owner-password` bilan bog'liq bo'lmagan — desktop route OpenAPI'da yo'q, shuning uchun umuman chiqmasligi kerak).

- [ ] **Step 3: To'liq typecheck + testlar**

Run: `bun run typecheck --force`
Expected: 0 xato — hech kim `passwordReset`ni import qilmaydi (backend Task 1, web Task 4).

Run: `bun run check:rls`
Expected: PASS.

- [ ] **Step 4: Commit**

> ℹ️ Spec fayli `packages/api-client/openapi.json` ga yoziladi (`generate-openapi.ts` → `resolve(..., 'packages/api-client/openapi.json')`; orval input ham shu). Ya'ni `git add packages/api-client` **ham spec, ham generated client'ni** qamraydi — boshqa joyda uncommitted generated fayl qolmaydi (advisor #3 tasdiqlandi).

```bash
git add packages/api-client
git status --short   # tasdiqla: faqat packages/api-client ostidagi fayllar (openapi.json + src/generated/**)
git commit -m "$(cat <<'EOF'
chore(api-client): CLI-478 — reset endpointlari OpenAPI/client'dan regenerate bilan chiqarildi

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Yakuniy verifikatsiya + Linear sync

- [ ] **Step 1: Butun repo typecheck + lint + testlar**

Run: `bun run typecheck --force`
Expected: 0 xato.

Run: `bunx biome check apps packages` (yoki `package.json`dagi `lint`/`check` skript)
Expected: 0 xato.

Run: `cd apps/api && bun test --env-file=../../.env` (asosiy auth/integration bloklar)
Expected: yashil.

Run: `cd apps/web && bunx vitest run src/features/auth`
Expected: yashil.

- [ ] **Step 2: Login oqimini qo'lda/`verify` bilan ko'r**

`/run` yoki `verify` skill bilan web'ni ko'tar, `/login` sahifasini och. Tasdiqla: "Owner parolini tiklash" havolasi bor, "Parolni unutdingizmi?" YO'Q. `/forgot-password`ga to'g'ridan-to'g'ri o'tsang — route yo'q (404/redirect).

- [ ] **Step 3: Grep-audit — hech qanday o'lik qoldiq yo'q**

Run: `grep -rn "forgot-password\|password-reset-request\|requestPasswordReset\|ESKIZ_EMAIL\|password_reset_tokens\|createSmsChannel\|auth.forgot" apps packages --include="*.ts" --include="*.tsx" --include="*.json" | grep -v "\.md" | grep -v "drizzle/"`
Expected: bo'sh (yoki faqat migration SQL ichidagi tarixiy `DROP TABLE password_reset_tokens` — bu kutilgan).

- [ ] **Step 4: Linear CLI-478 → Done**

CLI-478 ni Done ga o'tkaz, qisqa izoh: "Qayta yo'naltirildi — SMS OTP reset oqimi butunlay olib tashlandi (endpoint/service/schema/env/DB jadval/web/openapi). Owner→Supervisor + xodim→owner admin-reset yo'llari saqlandi." ([[project_dev_workflow_gotchas]]: Workflow round'dan keyin darhol Done belgila).

---

## Self-Review (writing-plans checklist natijasi)

**Spec coverage:** Spec §2 ning har bir bandi bir task bilan qoplangan — 2.1→T1, 2.2→T1, 2.3→T1, 2.4→T2, 2.5→T2, 2.6→T3, 2.7→T4, 2.8→T4, 2.9→T4, 2.10→T4, 2.11(test)→T1/T4, 2.12(openapi)→T5. §3 saqlanadi → Global Constraints'da yozilgan. §4 verifikatsiya → T6.

**Placeholder scan:** Yo'q — har o'chirish aniq fayl+qator diapazoni bilan; guard test kodlari to'liq; migration SQL `drizzle-kit generate` bilan (aniq buyruq).

**Type consistency:** `requestPasswordReset`/`resetPassword` (service), `passwordReset`/`passwordResetRequest` (api-client funksiya nomlari, orval camelCase operationId'dan), `usePasswordResetRequest`/`usePasswordReset` (web hooks) — barcha task'larda izchil ishlatilgan. `gt` qoladi / `desc` ketadi — Task 1 Step 5'da aniq ajratilgan.

**Tartib xavfsizligi:** api-client regenerate (T5) barcha consumer o'chirilgandan keyin (backend T1, web T4) — oraliq typecheck hech qachon buzilmaydi.
