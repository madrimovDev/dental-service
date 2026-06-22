# DS2 — Bemorlar list + Yangi bemor — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-22-ds2-patients-design.md`
**Branch:** `feat/ds2-patients` (worktree `/home/madrimov/Projects/ds-wt-ds2`)
**Tartib:** T1/T2 fayl-disjoint → parallel xavfsiz. T3 (i18n) **SERIAL** — shared locale fayllarni mutatsiya qiladi, yolg'iz lend bo'ladi. T3'ni birinchi yoki oxirgi lend qilish mumkin; tavsiya: **T3 birinchi** (T1/T2 yangi i18n kalitlarga tayanadi), keyin T1‖T2.

## Binding scope (har task uchun)
- FAQAT `apps/web/src/features/patients/` (+ T3 uchun i18n locale). `apps/web/src/components/BalanceBadge.tsx` va `PhoneInput.tsx` — **SHARED, TEGILMAYDI**. `packages/ui/*`, `apps/web/src/shell/*`, `stores/ui-store.ts` — locked.
- Backend / API / migration / yangi hook / yangi field — YO'Q (Qaror #33).
- Funksiya, permission/vertical gating, API kontrakt, CLI-179 text-error, `@mantine/form`+`zod4Resolver` — saqlanadi.
- Dark kontrast: `#fff` EMAS → `--on-primary` / `--text-on-danger`. `--ui`/`--mono` EMAS → `--font-sans`/`--font-mono`.

## Tasklar

### T1 — Bemorlar ro'yxati re-skin (+ lokal BalanceChip)
**Fayllar:** `apps/web/src/features/patients/components/PatientsListScreen.tsx`, `PatientsListScreen.module.css`, (yangi) `apps/web/src/features/patients/components/BalanceChip.tsx`, `PatientsListScreen.test.tsx` (yangi pill/empty/chip testlari).
- Header: title + `{count} ta bemor` sub-line (`data.meta.total`) + filial (mavjud bo'lsa); o'ng klaster restyle search (`Input` saqlanadi) + "Yangi bemor" Button (`patient.create` gated).
- Filter pills: Barchasi / Arxiv ↔ `archived` (Switch o'rnini bosadi, `setPage(1)`). Doimiy/Qarzdorlar OMIT.
- Flex `.row` → CSS grid jadval `minmax(0,1.6fr) 170px 120px 150px` (4 ustun, `lastVisit` OMIT): uppercase `--surface-2` header, `border-top` qator, hover `--surface-2`, butun-qator click → `/patients/:id`.
- Gradient avatar lokal span (38×38, 11px radius, `--primary`→`--violet`, `--on-primary` matn). `#code` + alert-dot OMIT.
- Tag birinchisi inline `--primary-soft` pill; telefon mono; yosh·jins (`age` · `genderLabel`).
- `BalanceChip` (lokal): 0→"To'langan" muted, qarz→danger, kredit→teal; `formatCurrency(…, t)`.
- Empty: locked `StateView` `icon`/`title`/`description`/`action` (CTA `patient.create` bo'lsa).
- Saqlanadi: view/archive `IconButton` (gated, `stopPropagation`), real `Pagination`, StateView loading/error.
- **Characterization yashil:** Ali Valiyev+VIP+"150"+aria-busy+Arxivlash('p1').

### T2 — Yangi bemor formasi re-skin
**Fayllar:** `apps/web/src/features/patients/components/PatientNewScreen.tsx`, `PatientNewScreen.module.css`, `PatientNewScreen.test.tsx` (yangi checklist/back-link testlari).
- Back-link "‹ Bemorlar ro'yxati" → `/patients`.
- `max-width:1140px`, two-column `minmax(0,1fr) 320px` grid (rail sticky, ishlamasa statik).
- Chap: 3 sectioned karta (icon-tile header — primary-soft ×2, qo'shimcha ×1). **Mavjud field'lar saqlanadi**, 3 kartaga taqsimlanadi: K1 Shaxsiy (fullName/dob/gender), K2 Aloqa (phone/phoneSecondary `PhoneInput` **as-is**, address, source), K3 Qo'shimcha/Sug'urta (passport, notes, tags, insurance bloki to'liq). Telegram/qon-guruhi/severity QO'SHILMAYDI.
- Input styling: 44px/`--surface-2`/11px/focus `--primary` (module CSS wrapper; primitiv signature saqlanadi). CLI-179 `error` prop wiring saqlanadi (text error, `role="alert"`).
- O'ng rail: live preview (gradient avatar `--on-primary`, name/phone/meta chip; allergy banner OMIT) + required checklist (`fullName`+`phone` — Ism/Familiya EMAS) + Save (primary, `isPending` disabled, `type="submit"`)/Cancel.
- Saqlanadi: `useForm`+`zod4Resolver(patientFormSchema)`, `useCreatePatient`, `onSuccess→/patients/:id`, butun field-set + submit shakli.
- **Characterization yashil:** "To'liq ism"/"Manba"/"Sug'urta" ko'rinadi; create wiring; bo'sh ism → `role="alert"`, create chaqirilmaydi.

### T3 — i18n (SERIAL — shared locale)
**Fayllar:** `packages/i18n/src/locales/uz.json`, `packages/i18n/src/locales/ru.json`.
- Yangi kalitlar (uz+ru parity): `patients.count` ("{{count}} ta bemor"), `patients.filter.all`/`filter.archived`, `patients.col.patient`/`col.phone`/`col.age_gender`/`col.balance`, `patients.empty_title`/`empty_desc`, `patients.balance_paid` ("To'langan"), `patients.back_to_list`, `patients.form.section_personal`/`section_contact`/`section_extra` (+ `sub_*`), `patients.form.checklist_title`/`checklist_name`/`checklist_phone`.
- Mavjud kalitlar qayta ishlatiladi: `patients.title/create/search_placeholder/balance_debt/balance_credit`, `patients.form.*` (mavjud field labellar), `common.save/cancel/view/archive`, `states.*`.
- uz/ru parity majburiy. Hech qanday mavjud kalit semantikasi o'zgarmaydi (faqat qo'shish).

## Verify (har task, lend oldidan)
`turbo test --filter @dental/web` · `bun run typecheck` · `biome check` · `turbo build --filter @dental/web`. Dark+light vizual (gradient avatar `--on-primary`, balans danger chip `--text-on-danger`, `--ink-3`/`--surface-2` header AA).

## Lend tartibi
1. **T3** (i18n) — yolg'iz, birinchi (kalitlar mavjud bo'lishi uchun).
2. **T1 ‖ T2** — fayl-disjoint, parallel; har biri characterization + yangi testlar yashil.
3. Whole-branch review: dark-mode kontrast (CLI-80/255 trap), scope-leak yo'qligi (`BalanceBadge`/`PhoneInput` o'zgarmagan), Qaror #33 (field-set saqlangan).
