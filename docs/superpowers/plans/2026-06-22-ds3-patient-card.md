# DS3 — Bemor kartasi re-skin — Plan

**Spec:** `docs/superpowers/specs/2026-06-22-ds3-patient-card-design.md`
**Brief:** `docs/superpowers/briefs/ds3-gap.md`
**Worktree:** `/home/madrimov/Projects/ds-wt-ds3` (branch `feat/ds3-patient-card`)
**Sana:** 2026-06-22

## Disjoint task breakdown (8 leaf — fayl-disjoint, bittasi i18n egasi)

Brief DS3a/DS3b ikki-milestone split'ni tavsiya qiladi — bu **plan-darajadagi ketma-ketlik ko'rsatmasi**, ikki alohida output emas. Quyida bitta flat 8-task partition; har task disjoint fayl to'plamiga ega, faqat T8 i18n shared resursni egallaydi.

| # | Task | Fayllar | i18n |
|---|---|---|---|
| 1 | Header card + tab shell | `PatientCard.tsx`, yangi `PatientHeaderCard.tsx` (+`PatientCard.test.tsx`) | — |
| 2 | Odontogram (arch+SVG+detail+editor) | `Odontogram.tsx`, `ToothCell.tsx`, `ToothCell.module.css`, `OdontogramTab.tsx` (+`OdontogramTab.test.tsx`) | — |
| 3 | Plan tab | `TreatmentPlansTab.tsx`, `PlanCard.tsx`, `StageRow.tsx`, `EstimateView.tsx`, `PlanFormModal.tsx` (+tests) | — |
| 4 | Visits tab (SOAP) | `VisitNotesTab.tsx`, `VisitNoteCard.tsx`, `VisitNoteFormModal.tsx` (+test) | — |
| 5 | Retsept + Lab | `PrescriptionsTab.tsx`, `LabOrdersTab.tsx` (+tests) | — |
| 6 | Read-tabs | `GeneralTab.tsx`, `MedicalTab.tsx`, `ConsentTab.tsx`, `RecallTab.tsx`, `FamilyTab.tsx` (+tests) | — |
| 7 | Images + Payments | `PatientImagesTab.tsx`, `ImageCard.tsx`, `ImagePreviewModal.tsx`, `ImageUploadModal.tsx`, `PaymentsTab.tsx` (+tests) | — |
| 8 | **i18n** (serial, owns locales) | `packages/i18n/src/locales/uz.json`, `packages/i18n/src/locales/ru.json` | **yes** |

## Disjointness invariantlari

- **Hech qaysi task `visible-tabs.ts`'ni tegmaydi** (gating saqlanadi).
- **Shared modul fayllar read-only:** `clinical.{api,mappers,types,schema,keys}.ts`, `patients.{api,mappers,types,keys,schema}.ts`. Har task iste'mol qiladi, hech biri tahrirlamaydi.
- **Faqat T8 `packages/i18n/*`'ga yozadi.** Boshqa tasklar yangi kalit kerak bo'lsa — T8 oldindan kalitlarni qo'shadi (yoki T8 birinchi run qilinadi), boshqalar faqat `t('...')` chaqiradi.

## Ketma-ketlik (DS3a clinical-heavy → DS3b admin)

1. **T8 (i18n) BIRINCHI** — barcha kalitlar oldindan mavjud bo'lsin (downstream tasklar `t()` ishlatadi, missing-key crash bo'lmasin).
2. **T1 (header+tab shell)** — `PatientCard.tsx` shared shell; boshqa tab tasklaridan oldin/keyin izolyatsiya (faqat T1 bu faylda).
3. **DS3a parallel:** T2 (odontogram — eng katta), T3 (plan), T4 (visits), T5 (retsept+lab). Fayl-disjoint → parallel xavfsiz.
4. **DS3b parallel:** T6 (read-tabs), T7 (images+payments).

> T2–T7 o'zaro fayl-disjoint → `dispatching-parallel-agents` bilan parallel bajarilishi mumkin. T1 va T8 oldin (shell + i18n poydevor).

## Har task uchun majburiy (TDD + invariant)

- **Re-skin only:** funksiya/hook/API/permission/vertical-gating/enum O'ZGARMAYDI. Mavjud characterization testlar yashil.
- **Forms:** `@mantine/form` + `zod4Resolver` wiring saqlanadi (re-skin presentation only).
- **Dark-mode kontrast:** brand fill ustida `#fff` hardcode YO'Q → `--on-primary`/`--text-on-danger`. Status swatch + allergiya bar light+dark tekshiriladi.
- **`--mono`/`--ui` mockup alias EMAS:** `<Mono>`/`--font-mono`/`--font-sans`.
- **Pul:** `lib/format.ts` (`formatCurrency`/`formatNumber`), inline `Intl.NumberFormat` YO'Q.
- **Deferred/omit:** code chip + "Keyingi tashrif" segment OMIT (DTO field yo'q); `watch` status QO'SHILMAYDI.

## Verify (har task + yakuniy)

`typecheck` · `biome` · `turbo test --filter @dental/web` · `build`. Yakuniy: Playwright rol-bo'yicha (`general` vertical'da `odo`/`lab` yashirin, @owner EMAS) + dizayn side-by-side (light+dark).
