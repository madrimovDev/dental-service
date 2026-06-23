# DS4 — Appointments re-skin — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-22-ds4-appointments-design.md`
**Gap brief:** `docs/superpowers/briefs/ds4-gap.md`
**Worktree:** `/home/madrimov/Projects/ds-wt-ds4` · branch `feat/ds4-appointments`
**Scope:** front-end-only re-skin (Qaror #33). Funksiya/API/permission o'zgarmaydi.

## Disjoint task partition (fayl-egaligi bo'yicha)

Brief T1–T6 vizual-soha bo'yicha edi va hub-fayllarda to'qnashardi (CalendarScreen → T1/T2/T6; CalendarGrid.module.css → T3/T4). Qayta bo'lingan — **fayl-egaligi** bo'yicha, 4 disjoint task.

| Task | Egalik (tahrirlanadigan fayllar) | i18n |
|---|---|---|
| **DS4-1 Grid internals** | `appointments.types.ts`, `appointments.mappers.ts`, `components/CalendarGrid.tsx`, `components/CalendarGrid.module.css`, `components/WeekGrid.tsx`, `components/AppointmentSlot.tsx`, YANGI `components/StatusIndicator.tsx`, YANGI `components/CurrentTimeLine.tsx` (+ test fayllari) | yo'q |
| **DS4-2 Rail + legend (new files)** | YANGI `components/StatusLegend.tsx`, `components/DayStatsCard.tsx`, `components/WaitlistCard.tsx` (+ testlar). `StatusIndicator`'ni Task 1'dan IMPORT qiladi (tahrir emas) | yo'q |
| **DS4-3 Screen chrome** | `components/CalendarScreen.tsx` (+ test). Task 2 komponentlarini IMPORT/montaj qiladi | yo'q |
| **DS4-4 i18n** | `packages/i18n/src/locales/uz.json`, `ru.json` | **ha** |

Disjoint tasdiq: 1/2/3 hech qanday faylni bo'lishmaydi. Import (StatusIndicator, rail komponentlari) fayl tahriri emas → to'qnashuv yo'q, faqat sequence.

## Sequencing

1. **DS4-1** birinchi (StatusIndicator + geometriya — 2/3 unga tayanadi).
2. **DS4-2** (StatusIndicator import).
3. **DS4-3** (1+2 montaj).
4. **DS4-4** istalgan vaqt; i18n serial resurs — boshqa DS milestone i18n bilan ketma-ket.

## Qulflangan qarorlar (reopen QILMA)

- Ish soati: `GRID.dayEndHour=20` SAQLANADI; dizayn 18 kosmetik e'tiborsiz (ds12). Faqat 88px/soat zichlik.
- Drag-drop: port qilinmaydi; legend hint olib tashlanadi.
- Blok rangi = doktor-toni; status = dot/check indikator.
- Rail: Jami/Tasdiqlangan/Kutilmoqda client-side; "Bo'sh slot" = `—`; waiting list = chrome+empty, amal yo'q.
- StatCard primitivi EMAS — bespoke 2×2 tile.

## TDD checkpointlar (har task)

- Mavjud characterization yashil: "Kun"/"Hafta", "Dr. Ali", "Bemor X", mappers (pxPerMin pozitsiya px yangilanadi, lane mantiq emas).
- Yangi unit: StatusIndicator (6 status), CurrentTimeLine (oyna/offset), DayStatsCard (sanoq+bo'sh→0+`—`), tone-cycling.
- **Dark-mode kontrast MAJBURIY** (done/cancelled surface-2 opacity; tone-soft + tone mono matn; danger badge `--text-on-danger`). DS0/CLI-80 darsi.
- `CalendarScreen.test.tsx` mock'da `isError`/`refetch` yo'q → rail `appts ?? []`'dan xavfsiz.
- Verify har task: `typecheck` · `biome` · `turbo test --filter @dental/web`.

## Invariantlar

- `packages/ui/**`, `shell/**`, `ui-store.ts`, backend — TEGILMAYDI.
- `appointments.api.ts`, `appointments.schema.ts`, `appointments.routes.tsx`, NewAppointmentWizard mantiqi — O'ZGARMAYDI.
- `#fff` hardcode YO'Q → `--on-primary`/`--text-on-danger`. `--ui`/`--mono` alias YO'Q → `--font-sans`/`--font-mono`.
