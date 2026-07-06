# DS1 — Dashboard re-skin (Dental OS) — Design Spec

**Sana:** 2026-06-22
**Milestone:** DS1 (Dashboard) — Dental OS pixel-parity redesign
**Roadmap:** Obsidian `07-Dental-OS-Roadmap.md`
**Gap brief:** `docs/superpowers/briefs/ds1-gap.md`
**Deferred katalog:** `docs/superpowers/briefs/ds12-deferred-backend.md` (DS1 bo'limi)
**Qarorlar:** #32 (token remap-in-place — DS0'da tugadi), #33 (pixel-parity, funksiya saqlanadi), #35 (per-milestone sikl). Foydalanuvchi scope qarori 2026-06-22: **front-end-only re-skin**.

---

## 1. Maqsad va doira (target design)

DS1 — dashboard **feature-folder**ini (`apps/web/src/features/dashboard/`) Dental OS dizayniga **vizual parity** bilan qayta tеrish. DS0 poydevori (tokenlar, shriftlar, sidebar/topbar shell) **qulflangan** — DS1 faqat dashboard kartalarini va layoutini mavjud `tokens.css` tokenlari bilan qayta tеradi.

**Target layout (gap brief §1):** dashboard `<main>` (shell padding `24px 26px`) ichida bitta ustun:
- **1a. Header qatori** — faqat amal tugmalari (greeting YO'Q; sarlavhani DS0 topbar `use-page-title.ts` olib boradi). O'ngga surilgan tugma guruhi: «Yangi yozilish» + «Kassa» (token surface tugma, `height:40px`, leading icon `--ink-3`).
- **1b. KPI qatori** — `repeat(4,1fr)` grid, gap 14px. Har karta: token surface, `border-radius:16px`, `--shadow-sm`, `padding:16px 16px 13px`. Uppercase label + o'ng 32×32 icon-chip (tone-tinted), mono qiymat `26px/-.03em` + unit, ixtiyoriy delta + sparkline.
- **1c. Ikki ustunli tana** — `minmax(0,1fr) 360px`, gap 16, `align-items:start`. Chap: haftalik tushum kartasi + bugungi jadval kartasi. O'ng rail (360px): navbat / recall / faollik kartalari.

**Doiradan tashqari (INVARIANT — o'zgarmaydi):**
- **Logic fayllar TEGILMAYDI:** `dashboard.api.ts`, `dashboard.keys.ts`, `dashboard.mappers.ts`, `DashboardRouter.tsx`, `role-dashboard-map.ts`, `onboarding.ts`. Hech qaysi hook qo'shilmaydi/o'zgartirilmaydi. Bu — #33 data-gap qulfini halol ushlab turadi (implementer recall/activity hook'ini "ulamaydi").
- Backend / API / migration — YO'Q.
- Permission gating, i18n kalit ma'nolari, data kontraktlari — o'zgarmaydi (characterization testlar yashil qoladi).
- `OnboardingChecklist.tsx` — borligicha (admin-only, manager).

## 2. Token map (gap brief §1 token cheat-sheet)

Barcha quyidagi tokenlar `packages/ui/src/theme/tokens.css` da **light + dark** ikkalasida mavjud (tasdiqlangan) — `tokens.css` TAHRIRLANMAYDI.

| Dizayn element | Token |
|---|---|
| Karta foni / chegara / soya | `--surface` / `--border` / `--shadow-sm` |
| Ikkilamchi yuza (badge, row hover) | `--surface-2` |
| Matn (asosiy / 2 / 3) | `--ink` (=`--text`) / `--ink-2` / `--ink-3` |
| Brend | `--primary`, `--primary-strong`, `--on-primary` |
| Status tonlar | `--success`, `--warning`, `--warning-soft`, `--danger`, `--info`, `--violet` (+ `*-soft`) |
| Mono raqamlar | `--font-mono` |
| Chegara (kuchli, hover) | `--border-strong` |

**Prototip-lokal aliaslar (MAVJUD EMAS — ishlatilmaydi):** `var(--mono)` → `var(--font-mono)`; `var(--ui)` → default sans (`--font-sans`).

**Off-scale literallar (tokenga aniq mos kelmaydi — parity uchun literal saqlanadi + izoh):**
- Karta radius `16px` (tokenlar `--radius-xl:14px`'da to'xtaydi).
- KPI grid `gap:14px`, karta `padding:…13px`.
- KPI qiymat `26px` / `letter-spacing:-.03em`.
- Tokenga aniq mos kelgan literallar (`11.5/12.5/13.5/14.5px`) → mos token ishlatiladi (`--text-xs/sm/base/md`).

## 3. Dark-mode kontrast watchpoint (CLI-80 / CLI-255 dars)

Har token re-skin dark rejimda tekshiriladi. Brend/danger fillda **hech qachon `color:#fff` hardcode QILINMAYDI** — `--on-primary` (`#04130f` light-fill ustida) / `--text-on-danger` (`#2a0f0d`) tokenlari ishlatiladi. KPI icon-chip'lar soft-bg + bir-tonli fg (`--warning-soft` va h.k.) — ikkala sxemada aniqlangan; `muted` tone (`--ink-3` on `--surface-2`) dark'da o'qilishini tekshirish kerak. (Mockupdagi binafsha gradient `#fff` karta — *Navbat board* ko'rinishida, DS1 doirasidan tashqari.)

## 4. Komponent-bo'yicha reja

### 4.1 Shared widgetlar (T1)
- **`StatCard.tsx`** — Mantine `Card`/`Text` o'rniga token karta: `border-radius:16px`, `--border`, `--surface`, `--shadow-sm`, `padding:16px 16px 13px`. Uppercase label (`11.5px/600/.02em/--ink-3`), o'ng 32×32 **icon-chip** (yangi ixtiyoriy `icon`/`tone` prop), mono qiymat (`--font-mono 26px/600/-.03em/--ink`) + ixtiyoriy `unit`. **Ixtiyoriy** `delta` (▲/▼ + tone matn) va `spark` (78×30 SVG) proplar — **faqat real data bor joyda render** (bugun manager KPI'larda yo'q → omit). Eski signature (`label`/`value`/`hint`/`color`) saqlanadi → `StatCard.test.tsx` yashil qoladi (kontrakt kengaytiriladi, buzilmaydi).
- **`BarMini.tsx`** — `--mantine-color-teal-6` → `var(--primary)`, `--mantine-color-gray-2` → `var(--surface-2)`. API o'zgarmaydi.
- **`MiniList.tsx`** — karta chrome token `16px`/`--border`/`--shadow-sm`; qator tipografiyasi `--ink`/`--ink-3`; link `--primary`.

### 4.2 Yangi presentational sub-komponentlar (T2)
- **`ScheduleList.tsx`** — "Bugungi jadval" kartasi: bordered header (title + "Kalendar ›" matn-tugma `--primary`) + qatorlar (`<button>`: time `--font-mono 13px/--ink-2/width:46px` · 1px divider · flex-1 patient+`service · doctor` · duration · status chip). Sof presentational — faqat prop qabul qiladi, hook YO'Q.
- **`QueueCard.tsx`** — "Navbat holati" kartasi: header title + mono waiting pill (`--warning`/`--warning-soft`) + qatorlar (raqam badge `--surface-2` · patient/meta · status chip). Sof presentational.
- **Status chip** — qo'lda yangi chip yasalmaydi; `@dental/ui` **`StatusPill`** ishlatiladi (`packages/ui/STATUS-INDICATORS.md`: semantik status = StatusPill). Appointment status → StatusPill tone va queue status → tone mapping **butun enum to'plamini qoplaydi** (pastda test strategiyasi).
- Har komponent o'z `*.test.tsx` bilan keladi (prop → render snapshot/assert).

### 4.3 i18n kalitlar (T3 — SERIAL)
Faqat **shipped** bo'limlar uchun yangi kalit. Recall/activity OMIT → ularning kaliti QO'SHILMAYDI.
- `dashboard.weekly_revenue` ("Haftalik tushum"), `dashboard.last_7_days`, `dashboard.queue_status` ("Navbat holati"), `dashboard.queue_waiting` ("{{n}} kutmoqda"), `dashboard.calendar_link` ("Kalendar"), `dashboard.new_appointment` ("Yangi yozilish"), `dashboard.open_cashier` ("Kassa"). Ikkala `uz.json` + `ru.json`ga. (Mavjud `dashboard.*` kalitlar ma'nosini saqlaydi.)

### 4.4 Manager + Accountant layout (T4)
- `Container size="lg"` + `Stack` → header amal-tugmalari + 4-ustunli KPI grid (T1 kartalar) + `minmax(0,1fr) 360px` tana.
- Chap: restyle qilingan tushum kartasi (ichida `BarMini` revenue-by-service — **line chart deferred**, §6) + bugungi jadval kartasi (agar appointment data ulanibsa; manager'da yo'q → omit).
- O'ng rail: navbat kartasi (ruxsat bo'lsa). **Recall + activity OMIT** (data-gap, §6).
- `OnboardingChecklist` (manager) saqlanadi. Barcha mavjud hooklar (`useManagerKpi`, `useRevenueReport`, `useDailySummary`...) o'zgarmaydi.
- Header tugmalari **mavjud permission hook'lari bilan gate** qilinadi (appointment/cashier ruxsati yo'q rolda ko'rinmaydi).

### 4.5 Staff + fallback layout (T5)
Bir xil shell'ga: Doctor / Receptionist / Assistant / Technician / **Generic** (fallback).
- Header tugmalari (per-permission), KPI grid (StatCard bor joyda), ikki-ustunli tana: bugungi jadval (Doctor/Receptionist/Assistant — `ScheduleList`) + navbat rail (Receptionist — `QueueCard`), Technician = lab-order ro'yxati re-skin.
- **Generic** = no-role fallback: greeting `Title` saqlanadi (noma'lum rol uchun mazmunli), faqat karta chrome token `16px`/`--border`/`--shadow-sm`'ga re-skin qilinadi.
- Recall/activity har joyda OMIT. Barcha mavjud hooklar o'zgarmaydi.

## 5. Layout primitivlari

Token off-scale qiymatlar (`16px` radius, `14px` gap, `26px/-.03em` qiymat, `13px` padding) inline style + qisqa izoh bilan saqlanadi (parity). `minmax(0,1fr) 360px` grid CSS grid orqali (Mantine `Grid` 12-ustun modeliga sig'maydi → `Box`/`SimpleGrid` o'rniga inline `display:grid`). `Container size="lg"` olib tashlanadi — shell `main` padding (`24px 26px`) gutter beradi.

## 6. Deferred / omitted (DS12 katalogiga asoslangan — `ds12-deferred-backend.md` DS1)

Quyidagilar **data-gap** — chrome teriladi, data joyi omit/placeholder. **Hech qachon hook/endpoint/migration QO'SHILMAYDI** (#33 qulfi):

| Element | Sabab (ds12 katalog) | DS1 harakati |
|---|---|---|
| KPI 7-kunlik **sparkline** | per-metric time-series hook yo'q | `spark` prop ixtiyoriy → render qilinmaydi |
| **Period-over-period delta** (▲▼%) | period-comparison aggregate yo'q | `delta` prop ixtiyoriy → render qilinmaydi |
| Haftalik **revenue line chart** (7-kun seriya) | `getRevenueReport` total+byBranch/byService qaytaradi, kunlik seriya YO'Q | line chart **deferred**; karta shell + `BarMini` (by-service) re-skin saqlanadi |
| **Recall** rail kartasi | recall feed hook dashboard'da yo'q | OMIT (kalit ham qo'shilmaydi) |
| **Activity feed** rail kartasi | activity endpoint yo'q | OMIT (kalit ham qo'shilmaydi) |

**In-scope (data mavjud):** queue kartasi (`useQueueToday`), bugungi jadval (`useDoctorAppointments`/`useAppointments` + mavjud name-map mapperlar), KPI qiymatlar (`useManagerKpi`/`useRevenueReport`).

## 7. Test strategiyasi (TDD-able)

- **T1:** `StatCard.test.tsx` mavjud kontraktni saqlaydi (label/value/hint render) + yangi prop (icon-chip/unit/delta yo'qligida crash bo'lmaydi) uchun kengaytiriladi. BarMini/Mini_List token rang almashishi — vizual (test ixtiyoriy smoke).
- **T2:** yangi `ScheduleList.test.tsx` + `QueueCard.test.tsx` — prop berilganda qator (time/patient/status chip) render bo'lishini va bo'sh holatda crash bo'lmasligini tasdiqlaydi. **StatusPill tone mapping qoplamasi:** appointment `status` enum (`scheduled/confirmed/in_progress/completed/cancelled/no_show` va h.k.) va queue `status` enum har bir qiymat StatusPill tone'iga (success/warning/danger/info/accent/neutral) map qilinadi — **default tone** (neutral) fallback bilan, hech bir qator bo'sh/unmapped chip render qilmaydi. Test har enum qiymatini map orqali o'tkazadi.
- **T4/T5:** har rol komponenti uchun **characterization test** — mavjud data ko'rinishini tasdiqlaydi (KPI qiymatlari, appointment/queue qatorlari render bo'ladi; `DashboardRouter.test.tsx` rol→komponent tanlovini saqlaydi). "Behavior unchanged" verifikatsiyasi: re-skin oldidan/keyin bir xil matn/qiymat ko'rinadi.
- Global: `turbo test --filter @dental/web` yashil; biome 0; typecheck toza. Dark-mode kontrast qo'lda tekshiriladi (DS0 dars).

## 8. Task breakdown (disjoint — §plan'ga qarang)

T1 (widgetlar), T2 (yangi sub-komponentlar), T3 (i18n — SERIAL, yagona locale-touch), T4 (manager+accountant), T5 (staff×4 + generic). T1+T2 sof presentational, parallel. T4/T5 T1+T2+T3'ga bog'liq, lekin o'zaro disjoint fayllar (har rol alohida fayl). Faqat T3 `packages/i18n/src/locales/{uz,ru}.json`ga tegadi.
