# Claude Code — Project Context

Bu fayl Claude Code uchun loyiha konteksti. Har yangi sessiyada birinchi o'qiladi.

> ⚠️ **REDESIGN FAOL (2026-06-09).** Loyiha "Dental SaaS" → **kengaytiriladigan klinika platformasi + rolga moslashuvchi UX** ga qayta yo'naltirildi. M1–M5 yadro qurilgan va saqlanadi (gibrid: ko'chiriladi, qayta qurilmaydi).
> 🖥️ **ENG SO'NGGI (2026-07-02):** **DS-LD: Local Desktop (Windows Installer) epik — CLI-338, 12 task — TUGADI.** Branch `feat/cli-338-local-desktop` (21 commit) lokal `main`ga merge qilindi (push'siz). Workflow-orkestratsiya: har task TDD (failing test→impl→PASS→typecheck→commit) + mustaqil verify-agent (adversarial review + Linear sync). **Natija:** MinIO→local filesystem storage adapter; machine-fingerprint AES-256 `.lic` litsenziya + Supervisor activate/heartbeat client + `requireModule` modul-gating middleware (Task 5 — worker in-process merge — kod o'zgarishisiz Done, allaqachon D6/CLI-237 bilan bajarilgan edi); Electron config/process-manager/first-run, mDNS+UDP discovery, tray+main.ts (litsenziya-gated `/activate` redirect, klient "server topilmadi"+30s qayta qidiruv, settings→config IPC bridge); Windows-tuned Postgres(5433)+Valkey(6380) config; NSIS installer+portable binaries; auto-updater. **Verify bosqichida 2 xavfsizlik bugi topib tuzatildi:** path traversal (`storage.ts` uploads route), AES kalit entropiyasi yetarsizligi (128→256 bit). CLI-348 birinchi urinishda "Done" deb belgilanmadi (reviewer o'z spec'idagi 3 qarordan 2 tasi bajarilmaganini topdi) — ikkinchi iteratsiyada to'liq yopildi — **dars: adversarial verify haqiqiy gap topadi, ko'r-ko'rona "Done" belgilashdan yaxshiroq**. Typecheck 18/18 toza, ~85 unit test yashil (Task 1-5 Bun/API to'liq runtime-verified; Task 6-12 Electron/Windows-only — yozilgan+typecheck qilingan, lekin Linux muhitda ishga tushirib bo'lmagani uchun **jismoniy Windows PC'da qo'lda tekshiruv talab qilinadi**). **Ma'lum follow-up'lar (yangi ticket kerak):** `/activate` sahifasi `apps/web`da yo'q + activation flow ulanmagan, `/settings` yangi IPC bridge'ni chaqirmaydi, `MINIO_*` env eskirgan. ✅ **CLI-358/CLI-359 (2026-07-04) bu ro'yxatdan ikki bandni yopdi:** `requireModule` endi `app.ts`ga mount qilingan (11/11 MODULE_MAP kalit — patients/appointments/queue/cashier/reports/staff/clinical/lab-orders/patient-images/prescriptions/consent) va `uploads.ts` mount qilingan (+ tenant-scoping IDOR fix — mount qilingan zahoti cross-tenant fayl kirish ochilib qolardi, key'dagi tenantId endi JWT bilan solishtiriladi). **CLI-358 ijrosida qo'shimcha bug topildi:** clinical'ning ilk committed wiring'i (`app.use('*', requireModuleInDesktop('clinical'))`, bare `/api` prefiksda mount qilingan clinical/patient-images uchun) `/api/*`ga tekislanib boshqa modullarga (expenses/stock/payroll/notifications — MODULE_MAP'da yo'q) bleed qilardi — fix-forward qilindi (per-route middleware, `app.use()` emas; ikkinchi Hono `.route()` merge quirk ham topildi — ikkita mustaqil OpenAPIHono instance bitta prefiksda merge qilinganda biri o'z `.use()` pattern'larini yo'qotadi). Natija: clinical/patient-images uchun gate endi auth'dan KEYIN ishlaydi (boshqa 9 modulda — OLDIN), hujjatlashtirilgan qasddan og'ish (frontend hali farq qilmaydi). Supervisor (6/6, 2026-07-02 ilgari) bilan birga — **joriy Linear backlog (team Clinik) to'liq bo'shatildi** (CLI-176 arxivlangan+human-review-kerak dan tashqari).
> 🎨 **ENG SO'NGGI (2026-06-22):** **M9–M14 (V1+V2+V3) 100% TUGADI** (Linear CLI-183…253 Done). **YANGI FAZA: Dental OS vizual pixel-parity redesign (DS0–DS11)** — Obsidian `07-Dental-OS-Roadmap.md`, dizayn `Dental OS.dc.html` (claude.ai/design, DesignSync MCP). Token remap-in-place (Qaror #32: nom saqlanadi, qiymat+shrift o'zgaradi; shrift IBM Plex→Hanken Grotesk/JetBrains Mono), pixel-parity funksiya saqlab (#33), per-milestone brainstorm→spec→plan→impl→sync (#35). ✅ **DS0 (Foundation) TUGADI** (branch `feat/ds0-foundation` push'siz, 9 task CLI-254…261): token+shrift remap, sidebar 266px+rail, nav 3-guruh superset, workspace switcher→sidebar+footer (`useBranchSwitch` hook), topbar sahifa-sarlavha (`pageTitleKey`)+«Yangi bemor» tugma, palette/notif restyle. **Yakuniy opus whole-branch review:** dark `--text-on-danger` tushib qolib WCAG AA buzilgan edi (CLI-80 regressiya) → `#2a0f0d` qaytarildi — **dars: har token-remap'da dark-mode kontrast tekshirilsin**. ⚠️ Subagent infra timeout 5× → controller fix-forward. **Keyingi: DS1 (Dashboard).** Ochiq: CLI-182 (Zod i18n→DS11).
> **Joriy reja:** Obsidian `05-Redesign.md` + Linear (Dental Service — Redesign, team CLI) — milestone'lar M0–M8 (R0–R5 + Foundation + OpenAPI). Quyidagi **§8 Phasing eskirgan** (eski M1–M7) — 05-Redesign'ga qarang.
> **Progress (2026-06-13):** ✅ **9 milestone'dan 9 tasi 100% — M0, M1 (R0), M2, M3, M4 (R1), M5 (R2), M6 (R3), M7 (R4), M8 (R5) — LOYIHA R0–R5 TO'LIQ.** **M8 (R5 Sayqal — CLI-78 epik, 5 task) yopildi (2026-06-13, branch `feat/m8-r5-sayqal`):** **Foundation:** `packages/core/vertical-features.ts` (vertical→feature map, keystone) + `packages/ui` `StateView` primitivi (loading skeleton/error+retry/empty). **CLI-79 vertical gating:** backend `requireFeature` guard (odontogram=tooth-charts + lab routes, 403 `feature.disabled`) + frontend nav-config/PatientCard tab gating (`useVertical()` + `filterPatientTabs`) + Settings vertical Select (Stomatologiya/Umumiy klinika); `tenant_settings.vertical` `text` ustun (migration shart emas). **CLI-81 command palette:** `@mantine/spotlight` ⌘K — navigatsiya + amallar + bemor debounced qidiruv, permission+vertical-aware. **CLI-1 onboarding+perf:** `tenant_settings.onboardingDismissedAt` (migration 0017) + ManagerDashboard `OnboardingChecklist` (bloklamaydi, admin-only) + global class `ErrorBoundary` (StateView fallback) + StateView rollout (patients/cashier/appointments/queue/reports/services + 6 rol dashboard). **CLI-80 dark mode:** kodbaza yaxshi tokenlashtirilgan — 1 bug fix (Button danger matn `#fff`→`--text-on-danger` token, dark salmon kontrast). ⚠️ **CLI-153 TUZOG'I TAKRORLANDI va fix qilindi (yakuniy holistik review topdi):** `useVertical()` `tenant_settings.view`-gated `GET /tenant-settings`'dan o'qiyotgan edi → 7 cheklangan rol 403 → default `'dental'` → 'general' tenantda odontogram/lab UI'da ko'rinardi. Fix: yangi tor `GET /tenant-settings/vertical` (auth+RLS, **`requirePermission` SIZ**) — `useVertical()` shuni chaqiradi (CLI-154/155 precedenti). **Test darsi yana tasdiqlandi:** per-task review @owner bilan o'tdi va gap'ni yashirdi; rol-bo'yicha (real permset) sinash shart. R0–R4 to'liq: bemor balansi + reports + 6 rol dashboard + rol landing (R3); xarajat + qarindosh + ombor BOM + xodim profili + payroll + bildirishnoma (R4). **M5 (R2 — CLI-35 epik) yopildi (PR #4 yozilish + #5 navbat + #6 batch[kassa/klinik 7-tab/settings/xizmatlar/billing] + #7 "R2 tugadi"):** tayyor ekranlar teal design system'ga ko'chirildi (bemor list/new/10-tab karta, yozilish kalendar+wizard, navbat, kassa POS+plan billing, xizmatlar+narx, klinik odontogram/plan/vizit/rx/lab/konsent/rasm, settings/roles/branches/users) + deep-review bug fixlar (CLI-102–116). **2 sub-task qasddan ochiq:** CLI-117 (float-pul arifmetikasi — won't-fix: schema `numeric(14,2)` + response `z.string()` serializatsiya; request `z.number()` float qabul qiladi, lekin scale-2 + sum <2^53 = overflow xavfsiz — "butun so'm" emas), CLI-114 (PlanCard N+1 — backend `?include=stages` kerak, R3'ga deferred). **M2 (Backend Foundation) yopildi (2026-06-12):** tenant_settings + FK + indeks (CLI-93–96) + **clinical modul 4 sub-domenga refactor (CLI-99, RFC-0009 6-fayl, PR #17 merged)**. ✅ **M3 (OpenAPI Contract — CLI-92 epik, 29/29 task) YOPILDI (2026-06-12):** Foundation (PR #18) + Wave A (PR #19) + Wave B (PR #20) + Wave C (CLI-139–145, PR #21) + CLI-146 web-mapper migration (PR #22). **Web RESPONSE surface 100% generated** (barcha response DTO `generated/model`'dan). Istisnolar: `health` (oddiy Hono, public, spec'da yo'q) + `patientImages.upload` (multipart, hand) — bular OpenAPI spec'ga kirmaydi. Pattern: zod-openapi+Zod4 → generate → orval axios-functions (mutator envelope) → barrel explicit re-export → feature hooks `.then(r=>r.data)`; per-modul mapper(date col→passthrough string, timestamp→ISO, numeric→string)+createRoute+okJson(404 declare!). Web-mapper migration: barrel `export type { X } from './generated/model'` (nested enum→alias: `CashierTransactionPaymentMethod as PaymentMethod`); types-reports/erp/m3/patients o'chdi, types-m5 trim. **Qasddan HAND qoldi (by-design):** request `Create*Input` (forms, RFC-0010), enum tiplar `ToothState`/`ToothSurface` (types-clinical) + `ConsentType`/`LabOrderType`/`PatientImageType` + `LabOrderItem` helper (types-m5, web UI options/forms bevosita import qiladi), `patientImages.upload` (multipart), `lib/api.ts` raw-fetch `refreshTokens` (circular-dep). ✅ **M8 (R5 Sayqal) yopildi** — yuqoridagi Progress qatoriga qarang. ✅ **Tech-debt to'liq tozalandi (2026-06-12):** **CLI-114 hal qilindi (PR #28)** — treatment-plans list endi stage'larni nested qaytaradi (`?include` o'rniga doim-nested, 1 `IN`-query, N+1 yo'q). **CLI-117 yopildi (PR #29):** 3-forma DRY (VisitNote/LabOrders/Consent) raw `useState` → `@mantine/form`+`zod4Resolver` (characterization testlar bilan xulq saqlangan; `appointmentId`/`templateId` nullable, NumberInput `''→undefined` override) — float pul qismi alohida **won't-fix** (`numeric(14,2)` + butun so'm + <2⁵³ xavfsiz).
> **QA / E2E (2026-06-13):** Rol-bo'yicha to'liq ish kuni Playwright simulatsiyasi (9 rol, yangi tenant) — `E2E-TEST-REPORT.md` (yuqori bo'lim). ✅ Eski buglar CLI-147–152 hammasi fix tasdiqlandi. ✅ **RBAC gap FIX qilindi (2026-06-13, branch `fix/cli-153-rbac-gaps`):** sistematik RBAC gap — rolga tegishli ekran cross-domen API'da 403 (Owner `@owner` maskalagan). **Yondashuv:** rol-template kengaytirish (faqat *yangi* tenantlar + mavjudlarga migration kerak) o'rniga **rolga mos yengil endpoint** — Receptionist allaqachon ega `appointment.view`/`cashier.view` bilan ishlaydi (migration shart emas + least-privilege). **CLI-154:** yangi `GET /appointments/doctors` (`appointment.view`, doctor-detect+dedupe backendda) — `useDoctors()` `user.view` o'rniga shuni chaqiradi. **CLI-155:** yangi `GET /cashier/patient-plans` (`cashier.view`, `{id,title,status}`) — `usePatientPlans()` `medical_record.view` o'rniga + UI 403/xato "reja yo'q"dan farqlanadi. **CLI-156:** PrescriptionsTab `durationDays` NumberInput to'liq controlled (`getInputProps` spread olib tashlandi, `value` hech qachon `undefined` emas). **Accountant rol o'zgarmadi** (faqat refund/hisobot — qaror). **Verifikatsiya (role-by-role, `@owner` EMAS):** permission guard real Receptionist permset bilan (yangi guard 200 / eski guard 403) + service/RLS integration (`apps/api/tests/integration/cli-153-*.test.ts`). **Test darsi:** har doim rol-bo'yicha sinash, faqat Owner emas — `@owner` permission kamchiliklarini yashiradi. ✅ **Filial almashtirish + invite UX (2026-06-13, branch `fix/cli-157-158-159-branch-staff-ux`, PR #37):** **CLI-157** — owner filial almashtira olmasdi ("switch-workspace ochilmaydi"): yangi RBAC-safe `GET /auth/workspace-branches` (`requirePermission` SIZ — CLI-154/155 precedenti; owner→barcha filial, xodim→o'z assignment filiallari) + Topbar `BranchSwitcher` dropdown (tenant almashtirishdan alohida) + SelectWorkspacePage active workspace bo'lsa avto-redirect qilmaydi. **CLI-158** — yangi xodim parolsiz, jim modal yopilardi: invite o'z/mavjud raqamda `alreadyExists`'ni e'tiborsiz qoldirib jim yopilardi → endi aniq bildirishnoma (dublikat user yaratilmaydi, mavjudga rol qo'shiladi). **CLI-159** — filial bo'yicha xodim ko'rinmasdi: Filiallar sahifasiga "Xodimlar" soni ustuni (client-side; branch-siz xodim har filialga). **Test:** `cli-157-workspace-branches.test.ts` (5/5, rol-bo'yicha + RLS izolyatsiya, `@owner` EMAS).
> **UI izchillik epik (2026-06-14, CLI-177 — YOPILDI):** Audit topdi — `@dental/ui` form-primitivlari chetlab o'tilgan (Button 7↔raw Mantine 114; Input 4↔TextInput 48; StatusPill 5↔Badge status 15+), asosiy sabab: primitivlar kam imkoniyatli. **Qaror: theme-convergent** (primitivga ommaviy migration EMAS — Qaror #19/#21): raw Mantine allaqachon teal (primaryColor+cssVarsResolver). ✅ **CLI-179 (PR #58):** Input/Select `error` prop — bemor formalarida validatsiya xatosi endi MATN bilan ko'rinadi (avval faqat ramka); signature saqlandi (Qaror #20); form-level guard test. ✅ **CLI-180 (PR #59):** `red` palette token remap → `color="red"` (Button/ActionIcon/Alert/Badge/Menu, 25 sayt) token-danger (#dc2626), 0 churn (Qaror #21); variantColorResolver TASHLANDI (consumer=0). ✅ **CLI-181:** status indikator konvensiya (`packages/ui/STATUS-INDICATORS.md`) — StatusPill=semantik status, Tag=label, Badge=qolgan; off-brand status ranglar (green/yellow/blue ≠ token) won't-fix (nom≠semantika, churn nomutanosib). **CLI-178 BEKOR** (Button→Mantine wrapper: 0 piksel farq, churn). **Ochiq:** CLI-182 (Zod xabar i18n — global errorMap yo'q). **Epik darsi:** har task gap-validatsiya bilan scope-tekshirildi ("name one pixel" — CLI-178 bekor, 180 reshape, 181 tidiness deb to'g'ri o'lchandi); ommaviy migration o'rniga theme-convergent + won't-fix.
> **Production yo'li (M9–M14, 2026-06-21+):** Audit (`DENTAL-WORKFLOW-AUDIT.md`+`PRODUCTION-READINESS.md`) asosida 6 milestone. ✅ **M9–M12 yopilgan** (M9 critical-fix+UI-wiring, M10 epik A/B/C — schedule/recall/treatment-plan, M11 security hardening, M12 deploy infra). ✅ **M13 (V2 — Multi-branch & ERP Depth, CLI-240, 7 task) TUGADI (2026-06-22):** task-ma-task feature-branch → main local merge (push'siz), per-task Linear+Obsidian sync, advisor-review billing/inventory'da + TDD. **V2-1** patients/plans tenant-level by-design (#29, schema o'zgarmadi). **V2-5** erkin emergency contact (yangi `patient_emergency_contacts`). **V2-6** rasm→vizit (`patient_images.visit_note_id`). **V2-7** medical record versiyalash (audit-log-backed history + diff, yangi jadval yo'q). **V2-4** qisman refund (#30, FAQAT plan-linked, proporsional negate + cumulative guard, balance query o'zgarmadi, TDD 7/7). **V2-2** ombor chuqurligi (#31, lightweight batch + asimmetrik negative-guard + transition low-stock alert; yangi reusable `findRecipientsWithPermission` helper — V3-2 ham ishlatadi; migration 0025+RLS 0015). **V2-3** dental analitika (procedure-mix/retention/recall-efficacy/no-show, read-only). ✅ **M14 (V3 — Commercial Maturity, CLI-248, 5 task) TUGADI (2026-06-22):** **V3-5** insurance JSONB kengaytma (coverageType/expiryDate/isActive + computed insuranceStatus) + lab-orders overdue. **V3-4** 1C export (tx-level endpoint + provizional CSV, format mijoz XSD bilan moslash TODO). **V3-1** Soliq fiscal scaffold (`packages/fiscal` FiscalProvider+NoOp+Soliq skeleton+DI; SOLIQ_* env). **V3-2** Telegram (`createTelegramChannel` + priority factory Telegram>SMS + `apps/telegram-bot` Telegraf skeleton; TELEGRAM_BOT_TOKEN). **V3-3** Desktop Electron (`apps/desktop` main process web-wrap + electron-updater + electron-builder; echo-stub o'rniga real). **Tashqi-dep tasklar (V3-1/2/3/4) scaffold chegarasigacha** — jonli faollashtirish foydalanuvchi sirlari bilan (Soliq cred/TLS, bot token, code-signing cert, 1C XSD) TODO. 🎉 **LOYIHA M9–M14 (V1+V2+V3) TO'LIQ — 6 milestone, 100%.** ⚠️ **main CI `startup_failure`** (runner/billing) — yagona gate = local verify (typecheck 16/16, biome 0, check:rls 35, per-task test) har task'da yashil. ⚠️ **main push'siz** (lokal, foydalanuvchi push qilmaguncha).
> **Arxitektura qarorlari:** `docs/rfcs/` (RFC 001–010) + `docs/architecture.md` + Obsidian `01-Qarorlar.md` (#11 billing, #12 zod4Resolver, #13 R3 balansi, #14 rol identifikatori, #15 ombor BOM auto-deduction, #16 payroll snapshot, #17 bildirishnoma scaffold+BullMQ, #18 OpenAPI migration pipeline + qasddan hand istisnolar, #19 UI theme-convergent, #20 form primitiv error signature-saqlash, #21 danger red-palette remap, #29 branch scoping — patients/plans tenant-level, #30 qisman refund plan-linked-only, #31 ombor lightweight-batch + asimmetrik guard + recipient helper).

**Joriy arxitektura:** [`docs/architecture.md`](./docs/architecture.md) + [`docs/rfcs/`](./docs/rfcs/) (RFC 001–010) · UX/IA: [`docs/ux-ia-concept.md`](./docs/ux-ia-concept.md)
Konsept (⚠️ historical, dental-only): [`CONCEPT.md`](./CONCEPT.md) — redesign bilan almashtirildi (2026-06-09)
Qarorlar tarixi: `~/Документы/Obsidian Vault/Projects/dental-service/01-Qarorlar.md`

---

## 1. Loyiha qisqacha

**Dental Service** — O'zbekistondagi stomatologiya klinikalari uchun **SaaS** boshqaruv tizimi.

- **Multi-tenant** (har klinika alohida tenant) + **multi-branch** (har tenant bir necha filialga ega)
- **Web + Desktop** (Electron) — bitta React codebase
- Tillar: **O'zbek (Lotin, default)** + **Russkiy**
- Maqsad mijoz: 1-10 doktorli klinikalar O'zbekistonda

---

## 2. Tech Stack (faqat shu)

| Soha | Texnologiya |
|---|---|
| Runtime (backend) | **Bun** |
| Web framework | **Hono** |
| ORM | **Drizzle** + Drizzle Kit migrations |
| Validation | **Zod** |
| OpenAPI | `@hono/zod-openapi` |
| DB | **PostgreSQL 16** (RLS bilan) |
| Cache / Queue | **Redis** + **BullMQ** |
| File storage | **MinIO** (S3 API) |
| Frontend build | **Vite** |
| Frontend framework | **React 18** + **React Router 6+** |
| UI library | **Mantine v7+** (yangi versiya, CSS Modules) |
| State (server) | **TanStack Query** |
| State (client) | **Zustand** |
| Forms | **`@mantine/form` + Zod resolver** |
| i18n | `react-i18next` |
| Desktop | **Electron 28+** (web frontend'ni wrap qiladi) |
| Telegram bot | **Telegraf** (alohida `apps/telegram-bot`) |
| Monorepo | **Bun workspaces** + **Turborepo** |
| Lint/Format | Biome (yoki ESLint+Prettier) |
| Tests | **Vitest** |

**Eslatma:** Bu stack qattiq belgilangan. Boshqa alternativalarni taklif qilma (NestJS, Next.js, Prisma, MUI/Chakra) — bular allaqachon ko'rib chiqilgan va rad etilgan.

---

## 3. ⚠️ Arxitektura — kod yozishdan oldin O'QING

### 3.1 Cross-tenant user identity (KRITIK)

**Foydalanuvchi platform darajasida**, tenant darajasida emas.

- `users` jadvalida **`tenant_id` YO'Q**.
- `users.email` va `users.phone` **platform bo'yicha unique**.
- Bir foydalanuvchi bir nechta tenantda a'zo bo'lishi mumkin (`user_assignments` orqali).
- Login dan keyin frontend "workspace switcher" ko'rsatadi — foydalanuvchi qaysi (tenant, branch) kontekstda ishlashni tanlaydi.
- JWT da: `user_id`, `active_tenant_id`, `active_branch_id`, `permissions[]`.
- Workspace almashtirilganda — yangi JWT chiqariladi.

**Buni esda tuting:**
- Hech qachon `users.tenant_id` deb qidirma — yo'q
- Foydalanuvchi qaysi tenantda ekanligini bilish uchun `user_assignments` ga qara
- Joriy kontekst — JWT'dan `active_tenant_id`

### 3.2 Bemor — tenant-scoped, USER-scoped emas

Bitta jismoniy bemor Klinika A da va Klinika B da bo'lsa — **ikkita alohida bemor yozuvi**. Hech qachon ulanmaydi.

- `patients.tenant_id` har row da
- Hech qachon "bemorni boshqa klinikaga ulash" funksiyasi qo'shilmaydi
- Bir doktor ikki klinikada ishlasa — har klinikada alohida bemor ro'yxatini ko'radi

### 3.3 Permission-based RBAC

- **Permissions** (kod misoli: `patient.view`, `cashier.refund`) — **platform tomonidan belgilanadi**. Hech qachon tenant tomonidan qo'shilmaydi.
- **Roles** — **tenant tomonidan yaratiladi/tahrirlanadi**, mavjud permissions'lardan yig'iladi.
- Yangi tenant uchun **system role templates** seed qilinadi: `Tenant Admin`, `Branch Manager`, `Doctor`, `Doctor + Assistant`, `Nurse`, `Receptionist`, `Accountant`, `Technician`.
- **Tenant Owner — implicit superuser**. Kodda hardcoded check (`user.id === tenant.owner_user_id`). `role_permissions` jadvalida saqlanmaydi.

**Yangi endpoint yozganda:**
```ts
app.delete('/patients/:id',
  requirePermission('patient.delete'),
  async (c) => { ... }
);
```

Yangi permission code kerak bo'lsa — `permissions` katalogiga qo'sh va seed migration yangila. Hech qachon code ichida hardcode qilma.

### 3.4 Multi-tenant izolyatsiya — RLS-only + CI lint (RFC-0009)

**Himoya modeli:**

1. **Postgres RLS (yagona runtime qatlam)** — har tenant-scoped jadvalda `FORCE ROW LEVEL SECURITY` yoqilgan; policy `WHERE tenant_id = current_setting('app.current_tenant_id')`. Hono middleware har auth'langan request da **transaction ochib** `SET LOCAL app.current_tenant_id = '...'` chaqiradi. Service/repository `db` ni `getDb(c)` (`apps/api/src/db/scoped.ts`) orqali oladi — transaction-bound, hech qachon to'g'ridan import qilmaydi. **Query'da explicit `WHERE tenant_id` YOZILMAYDI** — RLS filtrlaydi.

2. **`check-rls-coverage` CI lint (kompilyatsiya-vaqti kafolat)** — har tenant-scoped jadval `FORCE RLS`'ga ega ekanini majburlaydi. Bu — qo'lda per-query `tenantScopedQuery` helper o'rniga (helper **ishlatilmaydi**, bekor qilindi).

**Hech qachon RLS ni o'tib ketma.** Agar query qila olmasang, RLS o'rnatilganmi yoki yo'qmi, tekshir. Cross-tenant query qilish uchun maxsus admin tool kerak bo'lsa — alohida service account yarat.

### 3.5 Factory funksiyalar DI

**NestJS dekoratorlari yoki DI konteyner YO'Q.** Hammasi factory funksiyalar:

```ts
// modules/patients/patients.service.ts
import type { Database } from '@/db';
import type { Logger } from '@/lib/logger';

export const createPatientService = (deps: { db: Database; logger: Logger }) => {
  const findById = async (tenantId: string, patientId: string) => {
    return deps.db.query.patients.findFirst({
      where: (p, { and, eq }) => and(eq(p.tenantId, tenantId), eq(p.id, patientId)),
    });
  };

  const create = async (tenantId: string, data: CreatePatientDto) => {
    return deps.db.insert(patients).values({ ...data, tenantId }).returning();
  };

  return { findById, create };
};

// modules/patients/patients.routes.ts
import { createPatientService } from './patients.service';

export const patientsRoutes = (deps: ServiceDeps) => {
  const app = new Hono();
  const service = createPatientService(deps);

  app.get('/:id', requirePermission('patient.view'), async (c) => {
    const tenantId = c.get('activeTenantId');
    const result = await service.findById(tenantId, c.req.param('id'));
    return c.json(result);
  });

  return app;
};
```

### 3.6 OpenAPI — single source of truth

```
Zod schemalar → @hono/zod-openapi → OpenAPI spec → packages/api-client (auto-generated)
```

- Backend route'ni `@hono/zod-openapi` orqali ro'yxatdan o'tkaz
- `bun run generate:openapi` — OpenAPI spec yaratadi
- `bun run generate:api-client` — `packages/api-client` da typed React hooks generate qiladi
- Frontend faqat `api-client` ni import qiladi — manual fetch yozma

### 3.7 Soliq scaffold pattern (Phase 2 da boshlanadi)

```ts
// packages/fiscal/src/types.ts
export interface FiscalProvider {
  createReceipt(payment: Payment): Promise<FiscalReceipt>;
  cancelReceipt(receiptId: string): Promise<void>;
}

// packages/fiscal/src/noop.ts (default — Phase 2)
export const createNoOpFiscalProvider = (): FiscalProvider => ({
  createReceipt: async (payment) => ({
    id: crypto.randomUUID(),
    fiscalId: null,  // soliqqa yuborilmagan
    status: 'pending',
    payment,
  }),
  cancelReceipt: async () => {},
});

// packages/fiscal/src/soliq.ts (real — Phase 3)
export const createSoliqFiscalProvider = (config: SoliqConfig): FiscalProvider => { ... };
```

Cashier service shu interface ga bog'liq, implementation almashganda business kod o'zgarmaydi.

### 3.8 Notification kanal abstraksiyasi

```ts
interface NotificationChannel {
  send(user: User, message: NotificationMessage): Promise<NotificationResult>;
}
```

- Phase 1: `SmsChannel` (Eskiz)
- Phase 2: `TelegramChannel` qo'shiladi
- `NotificationService` foydalanuvchining bog'langan kanallariga yuboradi (Telegram > SMS prioritet, dublikatsiyasiz)

### 3.9 i18n — barcha string `t()` orqali

- Hech qachon UI da hardcoded matn yozma
- Tarjima fayllari `packages/i18n` da: `uz.json`, `ru.json`
- Yangi matn qo'shganda — ikkala fayl ham yangilan
- DB ichidagi kontent (xizmat nomi, diagnoz nomi) — `name_uz`, `name_ru` ustunlar

### 3.10 Audit log

Har permission-protected mutation operatsiya `audit_log` ga yoziladi:
```
who (user_id), when, action, resource_type, resource_id, before (JSON), after (JSON), tenant_id, branch_id, ip, user_agent
```

Sensitive read (masalan, `medical_record.view`) ham yoziladi (lekin tarkibi yoziladi emas, faqat ko'rilgani).

---

## 4. Loyiha strukturasi

```
dental-service/
├── apps/
│   ├── api/               # Bun + Hono backend
│   ├── web/                # Vite + React + Mantine (browser)
│   ├── desktop/            # Electron (web ni wrap qiladi)
│   ├── telegram-bot/       # Telegraf bot (Phase 2)
│   ├── supervisor-api/     # Bun + Hono — markaziy litsenziya-boshqaruv backend
│   │                       # (@supervisor/*, dental-service'dan alohida mahsulot,
│   │                       #  lekin bitta monorepo; 2026-07-02 qarori)
│   └── supervisor-admin/   # Vite + React + Mantine — Supervisor admin paneli (@supervisor/*)
├── packages/
│   ├── ui/                # Custom dental React komponentlar
│   ├── core/              # Shared types, Zod schemalar (birinchi prod deploy'da supervisor-public-key.ts shu yerga qo'shiladi)
│   ├── db-schema/         # Drizzle schemalar
│   ├── api-client/        # OpenAPI'dan auto-generated client
│   ├── i18n/              # uz/ru tarjimalar
│   ├── fiscal/            # Soliq scaffold (Phase 2+)
│   └── notifications/     # SMS/Telegram channel abstractions
├── infra/                 # Docker Compose, Caddyfile (dental-service per-klinika deploy)
│   └── supervisor/        # Supervisor'ning PROD orkestratsiyasi — bitta markaziy VPS,
│                           # klinika deploy'iga HECH QACHON qo'shilmaydi
├── docs/                  # Texnik dokumentatsiya
├── .github/workflows/     # CI/CD
├── turbo.json
├── bun.lock
├── package.json
├── tsconfig.json
├── CONCEPT.md
└── CLAUDE.md              # Bu fayl
```

**Backend feature folder pattern (`apps/api/src/modules/<feature>/`) — 6 fayl qatlamli (RFC-0009):**
```
<feature>/
├── <feature>.routes.ts       # HTTP: OpenAPIHono createRoute + middleware + ok/fail
├── <feature>.service.ts      # Biznes mantiq: factory(deps); repository+mapper orkestratsiya; audit
├── <feature>.repository.ts   # Ma'lumotga kirish: Drizzle, getDb(c) (RLS-bound), biznes mantiqsiz
├── <feature>.schema.ts       # Zod DTO (request/response) — zod-openapi OpenAPI manbasi
├── <feature>.mapper.ts       # Transformatsiya: DB row ↔ DTO (PII mask, javob shakli)
└── index.ts                  # Public eksport (routes factory)
```
> Qatlam: `routes → service → repository`; `mapper` sof transformatsiya. Trivial CRUD'da repository/mapper yengil. Mavjud 4-fayl modullar bosqichma-bosqich konvergatsiya qiladi (zod-openapi migratsiyasi bilan, CLI-92). Tafsilot: [`docs/rfcs/0009-backend-module-architecture.md`](./docs/rfcs/0009-backend-module-architecture.md).

---

## 5. Conventions

### Naming
- **DB columns:** `snake_case` (Drizzle camelCase ↔ snake_case avtomatik)
- **TypeScript:** `camelCase` o'zgaruvchilar, `PascalCase` types/components
- **Files:** `kebab-case` (`patient-service.ts`)
- **Permissions:** `resource.action` (`patient.view`, `cashier.refund`)
- **Folders:** `kebab-case` (`treatment-plans`)

### Imports
- Path alias: `@/` → `apps/api/src/` (api ichida), `@dental/...` → packages
- Workspace dependencies: `"@dental/core": "workspace:*"` package.json'da
- External > workspace > relative ortaltibida import

### Database
- Har tenant-scoped jadval `tenant_id UUID NOT NULL` boshlanadi
- Har tenant-scoped jadvalda RLS yoqilgan
- Indexes har `tenant_id` ustunida
- Migrations: `drizzle-kit generate` → review → commit
- Hech qachon RAW SQL ishlatma agar Drizzle qila olsa
- Soft delete: `deleted_at TIMESTAMPTZ NULL` (deletion needed bo'lganda)

### API
- REST style: `GET /patients`, `POST /patients`, `GET /patients/:id`, `PATCH /patients/:id`, `DELETE /patients/:id`
- Pagination: `?page=1&pageSize=20`
- Filter: `?status=active&doctorId=...`
- Response: `{ data: ..., meta: { page, pageSize, total } }`
- Errors: `{ error: { code, message, details? } }` + HTTP status

### Frontend (feature-folder qatlamli — RFC-0010)
- **Feature struktura** `apps/web/src/features/<feature>/`: `index` · `<f>.routes.tsx` (route registry `AppRoute[]`) · `<f>.api.ts` (Query hooks) · `<f>.keys.ts` (query-key factory) · `<f>.schema.ts` (Zod form) · `<f>.mappers.ts` (DTO↔view-model, MAJBURIY) · `<f>.types.ts` · `components/` · `pages/` (IXTIYORIY — faqat real logikali sahifa: auth, profile)
- **Qatlam:** `components → api.ts (hooks) → generated api-client`. Komponent api-client'ni bevosita chaqirmaydi.
- **Routing (2026-06-14):** alohida `pages/` papkasi **YO'Q**. Har feature `<f>.routes.tsx` da `AppRoute[]` (`{path, perm?, element}`, tip `@/shell`) eksport qiladi; `app/routes.tsx` `publicRoutes`/`protectedRoutes` ga yig'adi; `App.tsx` map qiladi. Yupqa wrapper'lar o'chirildi — registry to'g'ridan Screen'ni ishlatadi (`element: <CalendarScreen/>`). `perm` bo'lsa `RequirePermission` o'raydi. RFC-0010 §1/§6.
- **Shared:** `packages/ui` (dizayn-tizim primitivlari) → `apps/web/src/components` (ilova-shared) → feature `components/`
- Server state — TanStack Query (faqat feature hooks orqali); query-key `[feature, scope, params]`
- **Mutation xato feedback (CLI-165):** global `MutationCache.onError` (`lib/query-client.ts`) defaultda red toast (`@mantine/notifications`, `i18n.t('common.error')`). Per-mutation `onError` bor bo'lsa default jim — qo'shimcha toast yozma; faqat maxsus xulq kerak bo'lsa o'z `onError`'ingni ber.
- **Pul formatlash (CLI-166):** `lib/format.ts` — `formatCurrency(amount, t)` (yaxlitlash + `t('common.currency')` suffix) yoki `formatNumber(amount)` (suffixsiz). Hech qachon inline `Intl.NumberFormat` yoki hardcoded `so'm`/`сум`. Sanoq (count) ustunlari uchun `formatNumber`.
- Client state — Zustand (global `stores/`: auth, ui/shell); server data dublirlanmaydi
- Forms — `@mantine/form` + **`zod4Resolver`** (`mantine-form-zod-resolver`). ⚠️ Loyiha **Zod 4** — plain `zodResolver` `error.errors`ni (v3) o'qib invalid submit'da CRASH qiladi; doim `zod4Resolver` (`.issues`) ishlat (Qaror #12).
- API tiplari — **generated `packages/api-client`** (OpenAPI, qo'lda emas; RFC-0002 §4)
- Hech qachon `fetch()` to'g'ridan-to'g'ri — generated `api-client` orqali
- Tafsilot: [`docs/rfcs/0010-frontend-feature-architecture.md`](./docs/rfcs/0010-frontend-feature-architecture.md)

### Testing
- Unit: `*.test.ts` har feature folder ichida
- Integration: `tests/integration/` — real DB (test container)
- E2E: Playwright — Phase 3 da

---

## 6. Common commands

> Loyiha hozir bo'sh — bu komandalar Phase 1 boshlanganda actual bo'ladi

```bash
# O'rnatish
bun install

# Development (barcha apps + watch mode)
turbo dev

# Faqat backend
bun --filter @dental/api dev

# Migrations
bun --filter @dental/api drizzle:generate   # Yangi migration
bun --filter @dental/api drizzle:migrate    # Apply

# OpenAPI client generate
bun run generate:openapi
bun run generate:api-client

# Tests
turbo test
turbo test --filter @dental/api

# Build
turbo build

# Docker (local dev infra)
docker compose -f infra/docker-compose.yml up -d  # Postgres, Redis, MinIO
docker compose -f infra/docker-compose.yml down
```

---

## 7. ⛔ Don't (umumiy xato qilishlardan)

⚠️ **JWT staleness:** Permission o'zgarishlari INSTANT EMAS. Maksimum 15 daqiqalik kechikish (JWT access expiry). Real-time revocation kerak bo'lsa — Redis denylist (M4+ qaror).

- ❌ **Hech qachon `users.tenant_id` izlama** — yo'q. Foydalanuvchi platform darajasida. `user_assignments` orqali tenantga bog'lanadi.
- ❌ **Bemorni tenantlar orasida ulamaslik** — `patient.tenant_id` qattiq scoping.
- ❌ **Drizzle middleware'ni o'tib ketma** — har query tenant_id bilan bo'lishi shart.
- ❌ **RLS ni o'chirma** — DB darajasidagi himoya kerakli.
- ❌ **Yangi permission code'ni hardcode qilma** — `permissions` katalogiga qo'sh.
- ❌ **NestJS dekorator yoki DI konteyner** — factory funksiyalar.
- ❌ **MUI / Chakra / Ant Design** — Mantine v7+.
- ❌ **Prisma** — Drizzle.
- ❌ **Next.js (App Router yoki Pages)** — Vite + React Router.
- ❌ **`fetch()` to'g'ridan-to'g'ri frontend da** — `api-client` orqali.
- ❌ **UI da hardcoded uz/ru matn** — har doim `t('keyword')`.
- ❌ **Decorator (`@Controller`, `@Inject`)** — Hono native.
- ❌ **Soliq integratsiyasini Phase 1 da real qilma** — `NoOpFiscalProvider` ishlat.
- ❌ **Patientlar uchun cross-tenant search** — yo'q va bo'lmaydi.

---

## 8. Phasing — qisqa esdalik

> ⚠️ **ESKIRGAN (2026-06-09 redesign).** Quyidagi Phase 1/M1–M7 — eski reja. M1–M5 qurildi, keyin redesign boshlandi. **Joriy reja: R0–R5 milestone'lar** (Obsidian `05-Redesign.md` + Linear). Bu bo'lim tarixiy esdalik sifatida qoldirilgan.

> **Revised:** Phase 1+2 birlashtirildi (real mijoz to'liq dental dasturni xohlagani sababli). Eski Phase 3 endi Phase 2.

**Phase 1 (v1 launch) — ~9-13 oy:** To'liq dental dasturi. ERP modullar + barcha klinik funksiyalar (odontogram FDI, davolash rejasi, vizit yozuvi, ICD-10, reseptlar, konsent, rasm, lab orders) + Desktop (Electron) + Soliq scaffold + Telegram bot + custom role builder UI + audit log UI + 1C export.

**Phase 2 — ~2-3 oy:** Performance + edge cases + onboarding + Soliq real integratsiya + Click/Payme (kerak bo'lsa) + ikkinchi beta to'lqin.

### Ichki milestone'lar (Phase 1 davomida)

| Milestone | Vaqt | Tarkib |
|---|---|---|
| M1 | ~10 hafta | Infratuzilma + auth + RBAC + workspace switcher |
| M2 | ~10 hafta | Bemor + xodim + audit log core |
| M3 | ~10 hafta | Yozilish + navbat + SMS + xizmatlar + kassa (sodda) |
| M4 | ~10 hafta | Klinik core: odontogram + davolash rejasi + vizit yozuvi + ICD-10 |
| M5 | ~8 hafta | Reseptlar + konsent + rasm + lab orders |
| M6 | ~10 hafta | Desktop + Soliq scaffold + Telegram bot |
| M7 | ~8 hafta | Role builder UI + audit log UI + 1C export + advanced reports + launch |

Har milestone oxirida — ichki demo + mijozga progress ko'rsatish (motivatsiya va feedback uchun).

To'liq tafsilot: `~/Документы/Obsidian Vault/Projects/dental-service/03-Phase-1.md`.

---

## 9. Jamoa

- **Solo developer** (foydalanuvchi) + **Claude Code** (AI assistant)
- Har qadamda inson sifat nazorati
- AI tezligi boilerplate / schema / komponent scaffolding da
- Decision-making, integration testing, deployment — inson

---

## 10. Memory pointers (Obsidian)

Loyihaga oid jonli hujjatlar:
- `~/Документы/Obsidian Vault/Projects/dental-service/00-Index.md` — index
- `~/Документы/Obsidian Vault/Projects/dental-service/01-Qarorlar.md` — barcha 9 ta qaror tarixi
- `~/Документы/Obsidian Vault/Projects/dental-service/02-Savollar.md` — ochiq savollar, backlog

Yangi qaror qabul qilinganda — `01-Qarorlar.md` ga qo'shing va shu fayl (CLAUDE.md) ham yangilang.
