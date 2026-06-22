# DS1 — Dashboard re-skin — Plan

**Sana:** 2026-06-22
**Spec:** `docs/superpowers/specs/2026-06-22-ds1-dashboard-design.md`
**Brief:** `docs/superpowers/briefs/ds1-gap.md` · **Deferred:** `docs/superpowers/briefs/ds12-deferred-backend.md` (DS1)

Front-end-only re-skin. Mavjud `tokens.css` tokenlari (DS0 qulflangan). Logic fayllar (`dashboard.api.ts`, `*.keys.ts`, `*.mappers.ts`, `DashboardRouter.tsx`, `role-dashboard-map.ts`) TEGILMAYDI. Hook/endpoint/migration QO'SHILMAYDI (#33). Faqat T3 locale fayllarga tegadi.

## Tasklar (disjoint fayllar)

### DS1-T1 — Shared widget re-skin
`StatCard.tsx` (token karta + uppercase label + icon-chip + unit + mono qiymat + ixtiyoriy delta/spark prop), `BarMini.tsx` (token rang), `MiniList.tsx` (token chrome). Eski signature saqlanadi.
- Files: `widgets/StatCard.tsx`, `widgets/StatCard.test.tsx`, `widgets/BarMini.tsx`, `widgets/MiniList.tsx`
- TDD: `StatCard.test.tsx` kontraktni saqlaydi + yangi prop crash-safe.

### DS1-T2 — Yangi presentational sub-komponentlar
`ScheduleList.tsx` (bugungi jadval qator layouti) + `QueueCard.tsx` (navbat) — sof presentational, `@dental/ui` `StatusPill` chip. Hook YO'Q.
- Files: `widgets/ScheduleList.tsx`, `widgets/ScheduleList.test.tsx`, `widgets/QueueCard.tsx`, `widgets/QueueCard.test.tsx`
- TDD: prop→qator render + StatusPill tone mapping butun status enum'ni qoplaydi (default neutral fallback).

### DS1-T3 — i18n kalitlar (SERIAL)
Yangi `dashboard.*` kalitlar + header tugma labellari `uz.json` + `ru.json`. Recall/activity kaliti QO'SHILMAYDI (omit).
- Files: `packages/i18n/src/locales/uz.json`, `packages/i18n/src/locales/ru.json` (touchesI18n)

### DS1-T4 — Manager + Accountant layout
Header amal-tugmalari (permission-gated) + 4-ustun KPI grid + `minmax(0,1fr) 360px` tana + restyle revenue (BarMini, line chart deferred) + queue rail (ruxsatda). OnboardingChecklist saqlanadi. Recall/activity omit.
- Files: `components/ManagerDashboard.tsx`, `components/AccountantDashboard.tsx`, `components/ManagerDashboard.test.tsx`, `components/AccountantDashboard.test.tsx`
- TDD: characterization — KPI qiymat + ro'yxat qatorlari render bo'lishini tasdiqlaydi.

### DS1-T5 — Staff + fallback layout
Doctor/Receptionist/Assistant/Technician/Generic bir xil shell'ga re-skin. ScheduleList + QueueCard (ruxsatda) ishlatiladi. Generic = chrome-only re-skin (greeting saqlanadi). Recall/activity omit.
- Files: `components/DoctorDashboard.tsx`, `components/ReceptionistDashboard.tsx`, `components/AssistantDashboard.tsx`, `components/TechnicianDashboard.tsx`, `components/GenericDashboard.tsx`, `components/ReceptionistDashboard.test.tsx`
- TDD: characterization — appointment/queue qatorlari + KPI render bo'lishini tasdiqlaydi.

## Ketma-ketlik
T1 + T2 parallel (sof presentational). T3 erta (stub kalitlar). T4 + T5 T1/T2/T3'dan keyin, o'zaro parallel (disjoint rol fayllar).
