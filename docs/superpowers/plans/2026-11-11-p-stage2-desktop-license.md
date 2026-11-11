# P bosqichi 2 — Desktop reliz + litsenziya (P2, P14, P15, P18, renew, DT-01…03) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development yoki superpowers:executing-plans. Ijro qoidalari: `docs/ORCHESTRATION-GUIDE.md`. Steps `- [ ]`.

**Goal:** Desktop yangilanishda migratsiya xavfsiz ishlaydi (oldin zaxira, yiqilsa tiklash), installer sozlamani buzmaydi, child process yiqilsa qayta turadi; litsenziya `expiresAt + 7 kun` dan keyin butun API'ni bloklaydi, web banner/blok ekrani ko'rsatadi; vendor Supervisor'da muddatni uzaytira oladi.

**Architecture:** 4 mustaqil lane. L1 — Electron main jarayoni (`main.ts`, `process-manager.ts`, yangi `paths.ts`, `migrate-on-start.ts`). L2 — installer/paketlash (`installer.nsh`, `electron-builder.yml`, `config.ts` default port). L3 — API litsenziya (grace cap, global blok, status/recheck endpoint) → web (banner, blok ekrani, 403 interceptor). L4 — Supervisor renew (API + admin UI + `gracePeriodDays` default 7).

**Tech Stack:** Electron 28 + bun:test (desktop), Bun/Hono/zod-openapi (api), Vite/React/Mantine/vitest (web, supervisor-admin), Drizzle (supervisor-api).

**Spec:** `docs/superpowers/specs/2026-11-11-completion-roadmap-design.md` §3.2, §3.3, §6.

## Global Constraints

- Imtiyozli muddat **7 kun** (`MAX_GRACE_DAYS = 7`): API `min(lic.gracePeriodDays, 7)` ishlatadi; Supervisor `licenses.grace_period_days` default **7**.
- Muddat + imtiyoz tugagach desktop'da **barcha** `/api/*` bloklanadi, faqat ochiq qoladi: `/api/health`, `/api/auth/*`, `/api/activate`, `/api/bootstrap-status`, `/api/reset-owner-password`, `/api/license/*`, statik web fayllar, `/uploads` emas (bloklanadi).
- Blok javobi: `403 { error: { code: 'LICENSE_EXPIRED' | 'LICENSE_NOT_FOUND', message } }` (mavjud `fail()` shakli).
- Banner: muddat tugashiga **≤ 14 kun** → sariq «Litsenziya N kundan keyin tugaydi»; imtiyozda → qizil, yopilmaydi «To'lov kechikdi, N kundan keyin dastur to'xtaydi».
- Blok ekrani matni: «To'lov qilishingiz kerak, ta'minotchiga murojaat qiling» + «Internetga ulaning» + «Qayta tekshirish» tugmasi (heartbeat'ni darhol chaqiradi).
- Uzaytirish faqat heartbeat orqali (offline kod yo'q). Supervisor `expiresAt`ni yangilaydi; heartbeat javobi o'zgarmaydi (allaqachon DB'dan o'qiydi va `.lic`ni qayta yozadi).
- Imzolanadigan payload **tekis** qoladi (Qaror #40) — yangi maydon qo'shilmaydi.
- Web matnlari `t()` orqali, `packages/i18n` uz+ru. Supervisor-admin'da i18n yo'q — o'zbekcha matn to'g'ridan.
- Windows-only xulq (NSIS, `pg_dump.exe`, Windows signal) — Linux'da mock/unit bilan; holat «kod tayyor, Windows'da tekshirilmagan». `docs/DESKTOP-WINDOWS-BUILD-TEST.md`ni lane'lar **tahrirlamaydi** (konflikt) — bandlarni hisobotda qaytaradi.
- Desktop ichki importlar `.js` suffiksi bilan (NodeNext).

## Review Focus

1. **Blok paytida login va `/api/license/status` ishlaydimi** — aks holda foydalanuvchi blok ekranini ham ko'rmaydi → L3 Task 2 testi `whitelisted paths pass when expired`.
2. **SaaS rejimida (`DENTAL_LOCAL_DESKTOP` yo'q) hech narsa bloklanmaydi** → L3 Task 2 testi `no-op outside desktop`.
3. **Ikkinchi start (versiya o'zgarmagan) zaxira olmaydi va tez boshlanadi**; versiya o'zgarganda oldin dump → L1 Task 1 testlari.
4. **Migratsiya yiqilsa baza dump'dan tiklanadi va API ishga tushmaydi** → L1 Task 1 testi `restores dump and does not start api on failure`.
5. **Child process ketma-ket yiqilsa cheksiz restart sikli bo'lmaydi** (5 urinishdan keyin to'xtaydi, tray xabari) → L1 Task 2 testi.

---

## Lane L1 — Electron main (`apps/desktop`)

### Task L1.1: P2 — har startda migratsiya + oldindan zaxira + tiklash

**Tier:** T3 `sonnet`·`high` · risky · windowsOnly (qisman).

**Files:**
- Create: `apps/desktop/src/paths.ts` — `getDataDir()`, `getPgDataDir()`, `getResourcesDir()`, `getBackupsDir()` (= `<dataDir>/backups`) — `first-run.ts` va `process-manager.ts`dagi takror `const`lar shu yerdan import qilinadi.
- Create: `apps/desktop/src/migrate-on-start.ts`
- Modify: `apps/desktop/src/main.ts:~284-300`, `apps/desktop/src/first-run.ts`, `apps/desktop/src/process-manager.ts` (faqat paths importi)
- Test: `apps/desktop/src/migrate-on-start.test.ts` (yangi), `apps/desktop/src/first-run.test.ts`, `apps/desktop/src/process-manager.test.ts`

**Interfaces — Produces:**
- `type MigrateDeps = { runMigrations(): void; dump(file: string): void; restore(file: string): void; readState(): { lastMigratedVersion: string | null }; writeState(s: { lastMigratedVersion: string }): void; appVersion: string; now(): Date }`
- `migrateOnStart(deps: MigrateDeps): { ok: true; backedUp: string | null } | { ok: false; reason: 'phone_conflict' | 'failed'; restored: boolean; message: string }`
- `createPgTools(): { dump(file): void; restore(file): void }` — `<resources>/postgres/bin/pg_dump(.exe)` `-h localhost -p 5433 -U dental -Fc -f <file> dental`, `pg_restore --clean --if-exists -h localhost -p 5433 -U dental -d dental <file>`, `PGPASSWORD=getOrCreateSuperuserPassword()`, `spawnSync`, non-zero → throw.
- State fayli: `<dataDir>/state.json`.

- [ ] **Step 1: Failing testlar** (`migrate-on-start.test.ts`, spy deps):
  - `same version → no dump, migrate runs, ok` — state `1.2.0`, appVersion `1.2.0` → `dump` chaqirilmaydi, `runMigrations` 1 marta, `ok:true, backedUp:null`.
  - `new version → dump before migrate, state written` — chaqiruv tartibi `dump` → `runMigrations` → `writeState({lastMigratedVersion:'1.3.0'})`; dump fayli `backups/pre-migrate-1.3.0-<YYYYMMDD-HHmmss>.dump`.
  - `restores dump and does not start api on failure` — `runMigrations` throw → `restore(sameFile)` chaqiriladi, `writeState` chaqirilmaydi, `ok:false, reason:'failed', restored:true`.
  - `phone conflict detected` — xato matnida `Telefon normalizatsiyasi to'xtatildi` → `reason:'phone_conflict'`.
  - `restore failure reported` — restore ham throw → `restored:false`.
  - `first run (state null) → no dump` — birinchi o'rnatishda baza bo'sh, dump shart emas.
- [ ] **Step 2:** `cd apps/desktop && bun test src/migrate-on-start.test.ts` → FAIL (modul yo'q).
- [ ] **Step 3:** `paths.ts`, `migrate-on-start.ts` yozish; `main.ts`: ikkala yo'lda (first-run va oddiy) `startDatabaseLayer()` → `migrateOnStart(...)` → `ok` bo'lsa `startApiLayer(port)` (+ valkey — `startServer`ni ikkiga ajratish kerak bo'lsa `startDatabaseLayer` allaqachon pg+valkey'ni ko'taradimi tekshiring; ko'tarmasa valkey'ni `startApiLayer`dan oldin). `ok:false` → `dialog.showErrorBox`: `phone_conflict` uchun «Yangilash to'xtatildi: bazada takroriy telefon raqamlari bor. Ta'minotchiga murojaat qiling.», aks holda «Yangilash muvaffaqiyatsiz. Ma'lumotlar avvalgi holatga qaytarildi. Ta'minotchiga murojaat qiling.» (`restored:false` → «…qaytarib bo'lmadi, zaxira: <fayl>»), keyin `stopServer()` + `app.quit()`.
- [ ] **Step 4:** `bun test src/migrate-on-start.test.ts src/first-run.test.ts src/process-manager.test.ts` → PASS; `bun run typecheck` → 0.
- [ ] **Step 5:** Windows tekshiruv bandini hisobot `summary`ga yozing (faylga emas — controller merge'da `docs/DESKTOP-WINDOWS-BUILD-TEST.md`ga qo'shadi): «Yangilash: eski versiya o'rnatilgan → yangi o'rnatish → `backups/pre-migrate-*.dump` paydo bo'ldi, ilova ochildi; ataylab buzilgan migratsiya bilan → dialog, baza tiklandi».
- [ ] **Step 6:** Commit `fix(desktop): har startda migratsiya, oldidan pg_dump, yiqilsa tiklash (P2)`.

### Task L1.2: P15 — child supervision + graceful stop + DT-02 port diagnostikasi

**Tier:** T3 `sonnet`·`high` · windowsOnly (qisman).

**Files:**
- Modify: `apps/desktop/src/process-manager.ts` (`attachCrashSupervision`, `stopServer`), `apps/desktop/src/main.ts` (`before-quit` ~475, server tray), `apps/desktop/src/tray.ts`
- Test: `apps/desktop/src/process-manager.test.ts`, `apps/desktop/src/tray.test.ts`

**Interfaces — Produces:**
- `onServerStatusChange(cb: (s: { status: ServerStatus; child?: 'postgres'|'valkey'|'api'; restarts: number; gaveUp: boolean }) => void): () => void`
- Restart siyosati: kutilmagan `exit` → `[1000, 2000, 5000, 10000, 30000]` ms backoff, **maksimum 5** urinish 10 daqiqa ichida; oshsa `gaveUp:true`, restart to'xtaydi. `api` yiqilsa faqat api qayta spawn; `postgres` yiqilsa api ham qayta ishga tushiriladi.
- Graceful stop (Windows): api'ga avval `POST http://127.0.0.1:<port>/api/health/shutdown`? — **yo'q, yangi endpoint qo'shilmaydi**; api uchun `proc.kill()` yetarli (holatsiz). Postgres: `pg_ctl stop -D <pgData> -m fast -w -t 10` (`<resources>/postgres/bin/pg_ctl(.exe)`), fallback kill. Valkey: kill.
- `before-quit`: `event.preventDefault()`, `await stopServer()`, keyin `app.exit(0)` (qayta kirmaslik uchun flag).
- DT-02: `startApiLayer` port band (`EADDRINUSE` yoki api stderr'da `address already in use`) → `dialog.showErrorBox('Port band', 'Port <N> boshqa dastur tomonidan band. Sozlamalar → Server porti orqali boshqa port tanlang.')`.

- [ ] **Step 1: Failing testlar** (mavjud `node:child_process` mock naqshi, `DENTAL_STOP_WAIT_MS`): `restarts api after unexpected exit with backoff`, `gives up after 5 crashes and reports gaveUp`, `intentional stop does not restart`, `postgres stop uses pg_ctl stop -m fast`; tray: `server tray shows crash state label` (`updateTray`ga `serverState?: 'ok'|'restarting'|'down'` maydoni, label «Server: ishlamoqda / qayta ishga tushmoqda / to'xtadi»).
- [ ] **Step 2:** FAIL ni ko'rish. **Step 3:** implementatsiya. **Step 4:** `bun test src/process-manager.test.ts src/tray.test.ts` + typecheck PASS.
- [ ] **Step 5:** Windows tekshiruv bandi (hisobot `summary`ga, faylga emas): «Task Manager'da api.exe ni o'ldirish → 1–2 s da qayta turadi, tray holati o'zgaradi; ilovani yopish → postgres toza to'xtaydi (keyingi startda recovery logi yo'q)».
- [ ] **Step 6:** Commit `fix(desktop): child process supervision, graceful stop, port band diagnostikasi (P15, DT-02)`.

## Lane L2 — Installer va paketlash (`apps/desktop/build`, `electron-builder.yml`, `config.ts`)

### Task L2.1: P14 + DT-01 + DT-03 + DT-02 default port

**Tier:** T2 `sonnet`·`medium` · windowsOnly.

**Files:**
- Modify: `apps/desktop/build/installer.nsh`, `apps/desktop/electron-builder.yml`, `apps/desktop/src/config.ts:17`
- Test: `apps/desktop/src/config.test.ts`, yangi `apps/desktop/src/installer-nsh.test.ts` (matn darajasidagi guard)

- [ ] **Step 1: Failing testlar:**
  - `installer-nsh.test.ts`: fayl matnida `IfFileExists "$COMMONAPPDATA\DentalService\config.json"` MessageBox'dan **oldin** bor; `netsh advfirewall firewall add rule` TCP (`localport=8080`) va UDP (`localport=47890`) uchun; `!macro customUnInstall` ichida `netsh advfirewall firewall delete rule name="Dental Service`.
  - `config.test.ts`: `DEFAULTS.serverPort === 8080` (🛠 80 → 8080: Windows'da 80 admin/IIS bilan band bo'ladi); mavjud config'da `serverPort` saqlanadi.
  - `electron-builder.yml` guard (shu test faylida): `files` ichida `assets/**/*`.
- [ ] **Step 2:** FAIL. **Step 3:** implementatsiya (config mavjud bo'lsa MessageBox va yozish o'tkaziladi — merge kerak emas, chunki NSIS faqat `role` yozadi va qolganini ilova o'zi `writeConfig` bilan qo'shadi). **Step 4:** `bun test src/config.test.ts src/installer-nsh.test.ts` + typecheck PASS.
- [ ] **Step 5:** Windows tekshiruv bandi (hisobot `summary`ga, faylga emas): «Yangilash o'rnatishida rol dialogi chiqmaydi, `config.json`dagi `serverPort`/`licenseKey` saqlanadi; tray ikonka ko'rinadi; boshqa PC'dan 8080 ochiladi; o'chirilganda firewall qoidalari yo'qoladi».
- [ ] **Step 6:** Commit `fix(desktop): installer config'ni saqlaydi, tray ikonka, firewall, port 8080 (P14, DT-01..03)`.

## Lane L3 — API litsenziya → web (`apps/api`, `apps/web`, `packages/i18n`, `packages/api-client`)

### Task L3.1: grace cap + holat funksiyasi

**Tier:** T3 `sonnet`·`high` · risky.

**Files:** Modify `apps/api/src/lib/license.ts`; Test `apps/api/src/lib/license.test.ts`

**Interfaces — Produces:**
- `export const MAX_GRACE_DAYS = 7`
- `type LicenseState = { state: 'none' | 'active' | 'expiring' | 'grace' | 'expired'; expiresAt: string | null; graceEndsAt: string | null; daysLeft: number | null }` — `expiring` = muddatgacha ≤ 14 kun; `daysLeft` = `active/expiring`da `expiresAt`gacha, `grace`da `graceEndsAt`gacha butun kunlar (yuqoriga yaxlitlangan).
- `computeLicenseState(lic: LicenseData | null, nowMs: number): LicenseState` (sof, imzo/fingerprint tekshirmaydi)
- `getLicenseState(): Promise<LicenseState>` — `readLicense` + fingerprint + imzo (invalid → `none`) + anchor (`effectiveNow`).
- `isLicenseValid` endi `min(gracePeriodDays, MAX_GRACE_DAYS)` ishlatadi.

- [ ] **Step 1:** Failing testlar: `grace capped at 7 days even if signed 30`, `computeLicenseState` jadvali (none; 30 kun qolgan → active; 10 kun → expiring daysLeft 10; muddatdan 2 kun o'tgan → grace daysLeft 5; 8 kun o'tgan → expired). **Step 2:** `bun test src/lib/license.test.ts` FAIL. **Step 3:** implementatsiya. **Step 4:** PASS. **Step 5:** Commit `fix(api): litsenziya imtiyozi 7 kun bilan cheklanadi + holat funksiyasi (P18)`.

### Task L3.2: global blok middleware + `/api/license/status` + `/api/license/recheck`

**Tier:** T3 `sonnet`·`high` · risky.

**Files:**
- Modify: `apps/api/src/lib/license-middleware.ts` (yangi `requireValidLicenseInDesktop()`), `apps/api/src/app.ts` (route'lardan **oldin** `app.use('/api/*', requireValidLicenseInDesktop())`)
- Create: `apps/api/src/routes/license-status.ts` (OpenAPIHono, `bootstrap-status.ts` naqshi)
- Test: `apps/api/src/lib/license-middleware.test.ts`, yangi `apps/api/src/routes/license-status.test.ts`

**Interfaces — Produces:**
- `GET /api/license/status` → `200 ok(LicenseStatusDto)`; DTO = `LicenseState` + `mode: 'desktop' | 'cloud'` (cloud → `state:'none'` va web hech narsa ko'rsatmaydi). Ochiq (auth'siz), WHITELIST'da.
- `POST /api/license/recheck` → `runLicenseHeartbeatCheck(...)` (mavjud deps bilan), keyin yangi `LicenseStatusDto`. Rate limit: mavjud rate-limit helper bilan **6/daqiqa** per IP (helperni `cli-370-activate-rate-limit` dan toping). Cloud rejimida 404.
- `operationId`: `getLicenseStatus`, `recheckLicense`. Keyin `bun run generate:contract` (shu lane'ga ruxsat — boshqa lane API sxemasiga tegmaydi).
- `requireValidLicenseInDesktop()`: `DENTAL_LOCAL_DESKTOP !== 'true'` → no-op; WHITELIST (Global Constraints) → pass; `getLicenseState()` `expired` → 403 `LICENSE_EXPIRED`, `none` → 403 `LICENSE_NOT_FOUND`.

- [ ] **Step 1:** Failing testlar (mavjud `license-middleware.test.ts` `mock.module` naqshi): `blocks /api/stock and /api/reports when expired`, `whitelisted paths pass when expired` (`/api/auth/login`, `/api/license/status`, `/api/bootstrap-status`), `no-op outside desktop`, `grace passes`; `license-status.test.ts`: status DTO shakli, recheck heartbeat'ni chaqiradi va yangilangan holatni qaytaradi, 7-chi so'rov 429.
- [ ] **Step 2–4:** FAIL → implementatsiya → `bun test src/lib/license-middleware.test.ts src/routes/license-status.test.ts src/lib/license.test.ts` PASS (har birini alohida ham — `mock.module` oqishi) + `bunx tsc --noEmit -p .`.
- [ ] **Step 5:** `bun run generate:contract` → `packages/api-client` yangilanadi; `bun --filter @dental/api-client typecheck` (yoki root `bunx turbo typecheck --filter=@dental/api-client`).
- [ ] **Step 6:** Commit `feat(api): desktop'da muddat tugagach to'liq blok + litsenziya status/recheck endpoint (P18)`.

### Task L3.3: web — banner, blok ekrani, 403 interceptor

**Tier:** T2 `sonnet`·`medium`.

**Files:**
- Create: `apps/web/src/features/license/` — `license.api.ts` (`useLicenseStatus()` — 5 daqiqada refetch, `useRecheckLicense()`), `license.keys.ts`, `components/LicenseBanner.tsx`, `components/LicenseBlockedScreen.tsx`, `license.routes.tsx` (`/license-expired`, public), `index.ts`
- Modify: shell layout (Topbar ustida `LicenseBanner`), `apps/web/src/app/routes.tsx` (public route), API mutator/`lib/query-client.ts` — global 403 `LICENSE_EXPIRED`/`LICENSE_NOT_FOUND` → `window.location.assign('/license-expired')` (agar allaqachon o'sha sahifada bo'lmasa; `LICENSE_NOT_FOUND` + `hasLicense:false` holatida mavjud `/activate` gate'i ustun)
- Modify: `packages/i18n/src/uz.json`, `ru.json` — `license.banner.expiring`, `license.banner.grace`, `license.blocked.title`, `license.blocked.body`, `license.blocked.internet`, `license.blocked.recheck`, `license.blocked.stillExpired`
- Test: `apps/web/src/features/license/components/LicenseBanner.test.tsx`, `LicenseBlockedScreen.test.tsx`

- [ ] **Step 1:** Failing testlar: banner `expiring` → sariq matn N kun bilan; `grace` → qizil, yopish tugmasi yo'q; `active`/`none`/`cloud` → hech narsa; blok ekrani «Qayta tekshirish» bosilganda `recheckLicense` chaqiriladi, javob `active` bo'lsa `/`ga o'tadi, `expired` bo'lsa `license.blocked.stillExpired` xabari.
- [ ] **Step 2–4:** FAIL → implementatsiya → `cd apps/web && bunx vitest run src/features/license` PASS + `bun run typecheck`.
- [ ] **Step 5:** Commit `feat(web): litsenziya banneri va blok ekrani (P18)`.

## Lane L4 — Supervisor renew (`apps/supervisor-api`, `apps/supervisor-admin`)

### Task L4.1: renew endpoint + default grace 7

**Tier:** T2 `sonnet`·`medium` · risky (litsenziya).

**Files:**
- Modify: `apps/supervisor-api/src/db/schema.ts:40` (`gracePeriodDays` default 7) + yangi drizzle migratsiya (`drizzle-kit generate`, faqat default o'zgaradi — mavjud qatorlar tegilmaydi, real klinika yo'q), `apps/supervisor-api/src/modules/licenses/licenses.service.ts` (`renew`), `apps/supervisor-api/src/modules/clinics/clinics.routes.ts` (`POST /:id/renew`)
- Test: yangi `apps/supervisor-api/src/modules/licenses/licenses.renew.test.ts` (`licenses.reinstall.test.ts` fixture naqshi)

**Interfaces — Produces:**
- `POST /v1/admin/clinics/:id/renew` body `{ expiresAt: string }` (ISO sana yoki datetime; zod `z.iso.datetime()` yoki `z.iso.date()` → kun oxiri `23:59:59` Asia/Tashkent emas, UTC `T23:59:59.000Z` 🛠) → `200 { license }`; `expiresAt` hozirdan oldin → 400 `EXPIRES_IN_PAST`; klinika/litsenziya yo'q → 404.
- `service.renew(clinicId, expiresAt: Date, adminId): Promise<License>` — tranzaksiyada `expiresAt` yangilanadi + `licenseEvents` `event:'renewed'`, `metadata:{ from, to, createdBy }`.
- Heartbeat kodi o'zgarmaydi.

- [ ] **Step 1:** Failing testlar: `renew updates expiresAt and writes renewed event`, `rejects past date`, `404 unknown clinic`, `next heartbeat returns renewed expiresAt` (service.heartbeat chaqirib `expiresAt` tekshiriladi), `default gracePeriodDays is 7 for new license`.
- [ ] **Step 2–4:** `cd apps/supervisor-api && env -u DATABASE_URL -u JWT_SECRET -u RSA_PRIVATE_KEY bun --env-file=.env test src/modules/licenses/licenses.renew.test.ts` FAIL → implementatsiya → PASS; `bun run typecheck`.
- [ ] **Step 5:** Commit `feat(supervisor): litsenziya muddatini uzaytirish + imtiyoz default 7 kun (P18)`.

### Task L4.2: admin UI «Muddatni uzaytirish»

**Tier:** T1 `haiku`·`medium`.

**Files:** Modify `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx` (~229-271 naqshi); Test `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.test.tsx` (~385-430 naqshi)

- [ ] **Step 1:** Failing test: «Muddatni uzaytirish» tugmasi → modal, sana kiritish (`TextInput type="date"`), «Tasdiqlash» → `POST …/renew` `{expiresAt}` bilan; muvaffaqiyatda `['clinic', id]` invalidate; xato → `setMutationError`.
- [ ] **Step 2–4:** `cd apps/supervisor-admin && bunx vitest run src/features/clinics/ClinicDetailPage.test.tsx` FAIL → implementatsiya → PASS; `bun run typecheck`.
- [ ] **Step 5:** Commit `feat(supervisor-admin): muddatni uzaytirish tugmasi (P18)`.

---

## Ijro

- Lane'lar parallel (4 yozuvchi). Ichida ketma-ket: L1.1→L1.2, L3.1→L3.2→L3.3, L4.1→L4.2.
- L2 va L1 bir paketda (`apps/desktop`) lekin fayllari kesishmaydi (L2: `build/installer.nsh`, `electron-builder.yml`, `config.ts`, yangi `installer-nsh.test.ts`; L1: `main.ts`, `process-manager.ts`, `first-run.ts`, `tray.ts`, yangi `paths.ts`/`migrate-on-start.ts`).
- Lane muhiti: L3 — `dental_test_s2_l3` (+ seed) + Redis `/3`; L4 — `supervisor_test_s2_l4` (worktree `apps/supervisor-api/.env` dagi `DATABASE_URL` almashtiriladi, `db:migrate`); L1/L2 — DB yo'q.
- Verifier: L1.1, L3.2, L4.1.
- Merge tartibi: L4 → L3 → L2 → L1 (L1/L2 `apps/desktop` — oxirida, konflikt bo'lsa controller hal qiladi).
