# P bosqichi 5 — Foydalanuvchi oqimlari (P9, P10, P11, P12, P13) Implementation Plan

> **For agentic workers:** superpowers:executing-plans. Ijro: `docs/ORCHESTRATION-GUIDE.md`. Steps `- [ ]`.

**Goal:** kanal sozlanmagan klinikada recall jim «yuborildi» bo'lmaydi (P9); yangi klinikada darhol bron qilish mumkin (P10); bemor rasmlari kartada ko'rinadi (P11); qisman yangilash (PATCH) default qiymatlar bilan ma'lumotni ustiga yozmaydi (P12); Accountant kunlik kassasi refund'ni ayiradi (P13).

**Architecture:** 4 parallel lane, fayllari kesishmaydi. L1 recall/notifications (+ migratsiya **0048**). L2 schedule/branches/auth-register + web filial formasi va wizard. L3 uploads + web rasm hook'i. L4 Zod update schema'lari + web AccountantDashboard.

**Spec:** roadmap §3.6 (+ `docs/FEATURE-RESEARCH-2026-11-11.md` P9–P13).

## Global Constraints

- **P9:** `resolveTenantChannel(...).source === 'none'` va legacy `deps.sms` yo'q (yoki u ham NoOp) → `channel.send` **chaqirilmaydi**; `recall_logs.outcome = 'skipped_no_channel'` (pgEnum'ga `ALTER TYPE recall_log_outcome ADD VALUE IF NOT EXISTS 'skipped_no_channel'` — migratsiya 0048), recall `status` va `contactAttempts` **o'zgarmaydi** (pending qoladi), `result.skipped++`. NoOp kanalning o'zi `{ ok: false, error: 'not_configured' }` qaytaradi (ikkinchi himoya). Reminder worker: NoOp holatida in-app bildirishnoma saqlanadi, SMS yuborilgan deb belgilanmaydi.
- **P10 (🛠):** register va provisioning'da yaratiladigan filialga `workHours = { mon..sat: { open: '09:00', close: '18:00' }, sun: null }` (`WEEKDAY_KEYS` bilan bir xil kalitlar). Filial formasida (yaratish/tahrirlash) har kun uchun ochiq/yopiq + vaqt. Availability javobiga `workHoursConfigured: boolean`; web wizard'da `false` bo'lsa `t('appointments.work_hours_not_configured')` («Filial ish soati sozlanmagan — Sozlamalar → Filiallar»), aks holda mavjud `no_slots`. `appointments.outside_working_hours` i18n kaliti qo'shiladi (TODO yopiladi).
- **P11:** brauzerda `<img>` Bearer yubormaydi → `/uploads` 401. Yechim: web `useAuthedObjectUrl(url)` — `api-client` mutator orqali (`responseType: 'blob'`, mavjud Bearer + refresh), `URL.createObjectURL`, unmount'da `revokeObjectURL`; `ImageCard` va rasm ko'riladigan barcha joylar shu hook bilan. `/uploads`: tenant tekshiruvidan keyin `patient_image.view` permission (403) + audit `patient_image.viewed` (resource_id = key). Query-token yo'li **qilinmaydi**.
- **P12:** `.partial()` bilan qurilgan update schema'lar `.default()`siz «base» shape'dan quriladi: services, consent templates, visit-notes, visit-note-templates, stock items. Create xulqi (default'lar) o'zgarmaydi.
- **P13:** `AccountantDashboard` `daily_cash`: `type === 'refund'` ayiriladi — `DailySummaryCard` bilan **umumiy** helper (`apps/web/src/features/cashier/cashier.mappers.ts`ga `netCashTotal(breakdown)`), ikkala joy shuni ishlatadi.
- Web matnlari `t()` uz+ru. Testlar faqat nomlangan fayllar.

## Review Focus

1. **NoOp tenant'da recall bir necha marta ishlasa ham `contactAttempts` o'smaydi va status `pending`** (L1).
2. **Haqiqiy kanal (Telegram/Eskiz) yo'li o'zgarmagan** — `sent` va `contacted` (L1, mavjud `recall-worker.test.ts`).
3. **Yangi tenant → darhol slot bor va `POST /appointments` 201** (L2, real DB, register orqali).
4. **Rasm ruxsatsiz rol (masalan Accountant) uchun `/uploads` 403, Doctor uchun 200 + audit** (L3, real permset).
5. **`PATCH /visit-notes/:id { notes }` `assessmentDiagnoses`/`performedServices`ni bo'shatmaydi** (L4, HTTP test).

---

### Task L1.1: P9 (Tier T2 `sonnet`·`medium`, risky)
**Files:** `packages/notifications/src/noop.ts`, `packages/db-schema/src/tables/recall-logs.ts`, `apps/api/drizzle/0048_*.sql`, `apps/api/src/lib/recall-worker.ts` (~165-225), `apps/api/src/lib/reminder-worker.ts` (NoOp SMS belgisi bo'lsa); Test: `tests/integration/recall-worker.test.ts` (yangi describe: NoOp tenant), `tests/integration/cli-379-reminder-channel.test.ts`, `tests/integration/reminder-no-phone.test.ts`.
- [ ] Failing test → implementatsiya (migratsiyani lane bazasiga qo'llash) → shu fayllar + `tests/integration/recalls.test.ts` PASS + tsc → commit `fix(api): kanal sozlanmagan klinikada recall «yuborildi» deb belgilanmaydi (P9)`.

### Task L2.1: P10 API (Tier T2 `sonnet`·`medium`)
**Files:** `apps/api/src/modules/auth/auth.service.ts` (~160), provisioning filial yaratish joyi (`grep -rn "insert(branches)" apps/api/src`), umumiy `DEFAULT_WORK_HOURS` (`apps/api/src/modules/branches/branches.defaults.ts`), `schedule.service.ts` availability javobiga `workHoursConfigured`, schedule schema/routes; Test: yangi `tests/integration/p10-default-work-hours.test.ts` (register → filial `workHours` default; slot bor; bron 201; `workHours:null` filialda `workHoursConfigured:false`), `tests/integration/provisioning-activate.test.ts`, `tests/integration/cli-201-schedule-guard.test.ts`.
- [ ] Failing → impl → PASS + tsc + `bun run generate:contract` → commit `fix(api): yangi filialga default ish soati, availability workHoursConfigured (P10)`.

### Task L2.2: P10 web (Tier T2 `sonnet`·`medium`)
**Files:** `apps/web/src/features/settings/components/BranchesSettingsScreen.tsx` (+ ish soati muharriri komponenti `components/WorkHoursEditor.tsx`), `apps/web/src/features/appointments/components/NewAppointmentWizard.tsx` (~37, ~249), i18n; Test: `BranchesSettingsScreen.test.tsx`, `NewAppointmentWizard.test.tsx`, yangi `WorkHoursEditor.test.tsx`.
- [ ] Failing → impl → `cd apps/web && bunx vitest run src/features/settings src/features/appointments` PASS + typecheck → commit `feat(web): filial ish soati muharriri, wizard'da «ish soati sozlanmagan» (P10)`.

### Task L3.1: P11 (Tier T3 `sonnet`·`high`, risky)
**Files:** `apps/api/src/routes/uploads.ts` (permission + audit), `packages/api-client/src/mutator.ts` (blob qo'llab-quvvatlash, agar kerak bo'lsa) yoki `apps/web/src/lib/authed-blob.ts`, yangi `apps/web/src/hooks/useAuthedObjectUrl.ts`, `apps/web/src/features/clinical/components/images/ImageCard.tsx` (+ rasm ko'rsatadigan boshqa joylar: `grep -rn "vm.url\|\.url}" apps/web/src/features/clinical apps/web/src/features/patients`); Test: `tests/integration/cli-359-uploads-mount.test.ts`, `tests/integration/cli-405-uploads-traversal.test.ts`, yangi `tests/integration/p11-uploads-permission.test.ts`, `apps/web/src/hooks/useAuthedObjectUrl.test.ts`, `packages/api-client/src/mutator.test.ts`.
- [ ] Failing → impl → API testlari + `cd apps/web && bunx vitest run src/hooks src/features/clinical` + `cd packages/api-client && bunx vitest run` (yoki mavjud runner) PASS + typecheck → commit `fix(web,api): bemor rasmlari Bearer bilan blob orqali, /uploads ruxsat + audit (P11)`.

### Task L4.1: P12 + P13 (Tier T2 `sonnet`·`medium`)
**Files:** `apps/api/src/modules/{services,consent,clinical/visit-notes,clinical/visit-note-templates,stock}/*.schema.ts` (scout: services.schema.ts:21, consent.schema.ts:18, visit-notes.schema.ts:20, visit-note-templates.schema.ts:18, stock.schema.ts:19), `apps/web/src/features/cashier/cashier.mappers.ts` (`netCashTotal`), `DailySummaryCard.tsx`, `apps/web/src/features/dashboard/components/AccountantDashboard.tsx:126-134`; Test: yangi `tests/integration/p12-partial-defaults.test.ts` (har schema uchun: create default bilan, PATCH bitta maydon → default'li maydonlar o'zgarmagan; kamida visit-notes HTTP orqali), `AccountantDashboard.test.tsx`, `DailySummaryCard.test.tsx`.
- [ ] Failing → impl → API test + `cd apps/web && bunx vitest run src/features/dashboard src/features/cashier` PASS + tsc/typecheck + generate:contract → commit `fix(api,web): PATCH default'lar bilan ustiga yozmaydi (P12), Accountant kassasi refund'ni ayiradi (P13)`.

## Ijro
- L1, L2 (L2.1→L2.2), L3, L4 parallel (4 yozuvchi). `generate:contract` L2, L4 da kerak bo'lishi mumkin → integratsiya branch'ida controller bir marta qayta generatsiya qiladi; lane'lar `packages/api-client/src/generated`ni commit qilmaydi.
- Verifier: L1.1, L3.1.
