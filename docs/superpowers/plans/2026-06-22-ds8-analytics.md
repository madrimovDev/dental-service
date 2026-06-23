# DS8 — Analitika + Moliya (Dental OS re-skin) — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-22-ds8-analytics-design.md`
**Milestone:** DS8 (epik CLI-269) · Worktree: `/home/madrimov/Projects/ds-wt-ds8` · branch `feat/ds8-analytics`
**Scope policy:** FRONT-END-ONLY re-skin (Qaror #33). Backend/migration/yangi endpoint YO'Q.
Tokens.css / `packages/ui/src/theme|primitives` / `apps/web/src/shell` / `ui-store.ts` LOCKED (DS0).

> **Manba eslatma:** `briefs/ds8-gap.md` + `briefs/ds12-deferred-backend.md` authoring vaqtida
> mavjud emas edi; gap + data-gap'lar feature kodi + generated DTO + DS0 dizayn-tizimidan tiklandi
> (spec §0). DS8 niyat manbai = Obsidian `07-Dental-OS-Roadmap.md` (line 113).

---

## Vazifalar ketma-ketligi

```
DS8-T1 (i18n)  ──┐
                 ├──> DS8-T3 (ReportsScreen)   ──┐
DS8-T2 (BarMini)─┤                               │
                 ├──> DS8-T4 (Expenses screen)  ──┤──> verify (typecheck/biome/test/build)
                 └──> DS8-T5 (Expenses modals)  ──┘
```

- **T1** birinchi: 2 yangi `reports` kaliti (`revenue_trend`, `top_services`) uz+ru (grep bilan
  tasdiqlandi — mavjud emas). T3 shu kalitlarni o'qiydi. (Expenses KPI'lari mavjud kalitlarni
  qayta ishlatadi → T4/T5 i18n'ga tegmaydi.)
- **T2** ikkinchi (shared `BarMini` token-fix; T3/T4 import qiladi).
- **T3/T4/T5** file-disjoint → T1+T2 tugagach parallel mumkin.

## Disjoint fayl egaligi (har task o'z fayllariga TEGADI, boshqaga emas)

| Task | Egasi bo'lgan fayllar | touchesI18n |
|---|---|---|
| DS8-T1 | `packages/i18n/src/locales/uz.json`, `…/ru.json` | **true** |
| DS8-T2 | `apps/web/src/features/reports/components/BarMini.tsx` (+ yangi `BarMini.test.tsx`) | false |
| DS8-T3 | `apps/web/src/features/reports/components/ReportsScreen.tsx` | false |
| DS8-T4 | `apps/web/src/features/expenses/components/ExpensesScreen.tsx`, `ExpenseSummaryCard.tsx`, `ExpensesTable.tsx` | false |
| DS8-T5 | `apps/web/src/features/expenses/components/ExpenseFormModal.tsx`, `CategoryManagerModal.tsx` | false |

> Hech bir task fayl ulashmaydi (i18n locallaridan tashqari — faqat T1 ularga tegadi). T3/T4
> `BarMini`'ni FAQAT import qiladi (T2 egasi), tahrirlemaydi.

## TDD reja

- **T2:** YANGI `BarMini.test.tsx` — RED: token (`--surface-2`/`--primary`) + `color?` override +
  `formatNumber`/width characterization. GREEN: token-fix + ixtiyoriy `color` propi.
- **T3:** mavjud `reports.export.test.ts` O'ZGARMASDAN yashil (regression guard). KPI render testi
  (ixtiyoriy): StatCard label/qiymat mavjud datadan; delta render QILINMAGAN (assert).
- **T4:** mavjud `expenses.mappers.test.ts` O'ZGARMASDAN yashil. KPI sum (`Σ count`) mavjud mapper
  chiqishidan; gating (`expense.manage`) render saqlanadi.
- **T5:** forma submit/validatsiya xulqi characterization (`zod4Resolver` + mutation hook chaqiruvi
  o'zgarmaydi); modal chrome vizual.

## Invariantlar (har task tekshiradi)

- Permission gating: `report.view` (branch Select), `expense.view`/`expense.manage` saqlanadi.
- Data hook / API kontrakt / query-key / mapper / schema / export mantiq — O'ZGARMAYDI.
- Forma: `@mantine/form` + `zod4Resolver`; schema o'zgarmaydi.
- Dark kontrast: brand-fill ustida `color:#fff` hardcode YO'Q (`--on-primary`/`--text-on-danger`).
- Mockup `--ui`/`--mono` aliaslari YO'Q → `--font-sans`/`--font-mono`.
- Data-gap (donut / heatmap / KPI delta): chrome render qilinmaydi, data uydirilmaydi (spec §6).

## Verify (har task oxirida + milestone yakunida)

```
bun run typecheck
bun run biome check
turbo test --filter @dental/web
turbo build --filter @dental/web
```

Vizual: DS0 light + dark side-by-side (DesignSync — DS11 polish'ga deferred per-screen mockup yo'q bo'lsa).

## Sync (per-task)

- Linear CLI-269 epik ostida har task issue (Done belgilanadi).
- Obsidian `07-Dental-OS-Roadmap.md` DS8 qatori progress yangilanadi.
- main push'siz (foydalanuvchi push qilmaguncha) — lokal task-branch → DS8 branch merge.
