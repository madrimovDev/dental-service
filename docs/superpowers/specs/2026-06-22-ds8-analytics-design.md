# DS8 — Analitika + Moliya (Dental OS re-skin) — Design Spec

**Sana:** 2026-06-22
**Milestone:** DS8 (epik CLI-269)
**Roadmap:** Obsidian `07-Dental-OS-Roadmap.md` (DS8 qatori, line 113)
**Dizayn manbasi:** `Dental OS.dc.html` (claude.ai/design) — `reports.html` + `expenses.html` ekranlari
**Qarorlar:** #32 (token remap-in-place), #33 (pixel-parity, funksiya saqlanadi), #35 (per-milestone sikl)

---

## 0. Authoring eslatma (manba mavjudligi)

> **Gap brief yo'q.** Belgilangan inputlar `docs/superpowers/briefs/ds8-gap.md` va
> `docs/superpowers/briefs/ds12-deferred-backend.md` **authoring vaqtida mavjud emas edi**
> (worktree'da `docs/superpowers/briefs/` papkasi yo'q). Shu sababli gap-tahlil + data-gap'lar
> **feature kodidan** (`features/reports`, `features/expenses`) + **generated DTO shakllaridan**
> (`packages/api-client/src/generated/model`) + **DS0 dizayn-tizimidan** (tokenlar + `@dental/ui`
> primitivlar) qayta tiklandi. DS8 dizayn-niyat manbai sifatida Obsidian `07-Dental-OS-Roadmap.md`
> DS8 qatori (line 113) ishlatildi — per-ekran pixel mockup (HTML) authoring vaqtida ochilmadi,
> shuning uchun layout o'lchamlari (chart 720×220, heatmap 6×10) **niyat sifatida** keltirilgan,
> piksel-da'vo sifatida emas. Implement vaqtida `Dental OS.dc.html` ochiq bo'lsa, DesignSync
> bilan side-by-side solishtirish DS11 (Polish) ga deferred.

---

## 1. Maqsad va doira

DS8 — Dental OS redesignning **Analitika + Moliya** ekranlarini yangi dizayn tizimiga
(DS0 tokenlar + shriftlar + primitivlar) vizual moslashtirish. **FRONT-END-ONLY re-skin**:
funksiya, data hook, API kontrakt, i18n kalit, permission/vertical gating **o'zgarmaydi**;
xulq saqlanadi (characterization testlar yashil).

**Doirada (FAQAT bu fayllar):**
- `apps/web/src/features/reports/components/ReportsScreen.tsx`
- `apps/web/src/features/reports/components/BarMini.tsx`
- `apps/web/src/features/expenses/components/ExpensesScreen.tsx`
- `apps/web/src/features/expenses/components/ExpenseSummaryCard.tsx`
- `apps/web/src/features/expenses/components/ExpensesTable.tsx`
- `apps/web/src/features/expenses/components/ExpenseFormModal.tsx`
- `apps/web/src/features/expenses/components/CategoryManagerModal.tsx`
- `packages/i18n/src/locales/{uz,ru}.json` (FAQAT belgilangan i18n task'i tegadi)

**Doiradan tashqari (INVARIANT — TEGILMAYDI):**
- `tokens.css`, `packages/ui/src/theme/*`, `packages/ui/src/primitives/*`, `apps/web/src/shell/*`,
  `apps/web/src/stores/ui-store.ts` (DS0 LOCKED).
- Backend, migration, yangi endpoint/hook, yangi data field — **YO'Q**.
- `*.api.ts`, `*.keys.ts`, `*.routes.ts(x)`, `*.schema.ts`, `*.mappers.ts`, `*.types.ts`,
  `*.export.ts`, `index.ts` (data/route/forma qatlami) — **o'zgarmaydi**.
- Permission gating (`hasPermission('report.view')`, `'expense.view'`, `'expense.manage')`),
  branch filtr (`report.view` Select), forma validatsiya (`zod4Resolver`).

## 2. Target design (DS8 roadmap niyat)

Roadmap DS8 qatori (line 113):

> **Hisobotlar (reports):** 4 KPI · tushum dinamikasi line chart (720×220) · doktor yuklamasi bar ·
> top xizmatlar bar · to'lov usullari donut · bandlik heatmap (6×10).
> **Moliya (expenses):** 3 KPI · xarajat kategoriya bar · so'nggi xarajat list · 1C eksport.

Dizayn tili (DS0'dan): yumshoq `--bg` fon, `--surface` kartalar, `--radius-xl` burchak,
`--shadow-sm`, Hanken Grotesk sarlavha + JetBrains Mono raqam (`--num` tnum), `--text-3`
label, primary-soft accent chip, pill-shaped delta/status.

## 3. Token map (DS8'da ishlatiladigan — barchasi mavjud, YANGI token YO'Q)

| Maqsad | Token | Eslatma |
|---|---|---|
| Sahifa fon | `--bg` | Container default (shell beradi) |
| Karta sirt | `--surface` | StatCard/Card/Paper |
| Karta-ichi sirt / chart track | `--surface-2` | BarMini orqa fon (eski `--mantine-color-gray-1` o'rniga) |
| Chegara | `--border` | |
| Asosiy matn | `--text` / `--ink` | |
| Ikkilamchi | `--text-2` | |
| Label / dimmed | `--text-3` | |
| Chart bar (asosiy) | `--primary` | BarMini fill (eski `--mantine-color-blue-5` o'rniga) |
| Chart accent chip | `--primary-tint` / `--primary-hover` | StatCard `accent` |
| Multi-series rang sikli | `--primary` · `--info` · `--violet` · `--warning` | ko'p-kategoriya bar/donut uchun |
| Ijobiy / delta-up | `--success` / `--success-bg` | StatCard delta (DS8'da ishlatilmaydi — §6 data-gap) |
| Salbiy / delta-down / o'chirish | `--danger` / `--danger-bg` | `color="red"` Button/ActionIcon (DS0 token-remap'langan) |
| Mono raqam | `--font-mono` + `"tnum"` | StatCard `value` allaqachon shunga ega |

> **Mockup `--ui`/`--mono` aliaslari mavjud EMAS** → `--font-sans` / `--font-mono` ishlatiladi.
> **Dark kontrast:** brand-fill ustida `color:#fff` hardcode QILINMAYDI — `--on-primary` /
> `--text-on-danger` (DS0/CLI-80 WCAG AA). DS8'da brand-fill matn faqat `@dental/ui` Button
> (token-ishlatadi) orqali — yangi inline fill yozilmaydi.

## 4. Mavjud primitivlar (qayta ishlatiladi — yangi yaratilmaydi)

| Primitiv | Manba | DS8'da |
|---|---|---|
| `StatCard` | `@dental/ui` (`label/value/unit/icon/accent/delta/deltaDir`) | KPI kartalar (reports 4, expenses 3) |
| `PageHead` | `@dental/ui` (`title/subtitle/actions`) | sahifa sarlavhasi (ReportsScreen hozir raw `Title order={2}` — PageHead'ga ko'chadi) |
| `StateView` | `@dental/ui` (loading/error/empty) | mavjud holatlar — **o'zgarmaydi** |
| `BarMini` | feature-lokal (`reports/components/BarMini.tsx`) | token'lashtiriladi + ixtiyoriy ko'p-rang |
| `Card`/`Paper`/`Table`/`Group`/`Stack`/`SimpleGrid` | Mantine (DS0 theme-convergent, teal/red remap) | layout — token avtomatik |

> Dashboard'dagi lokal `features/dashboard/.../widgets/StatCard` — **ALOHIDA** komponent,
> doira tashqarisida. DS8 faqat `@dental/ui` `StatCard` primitividan foydalanadi.

## 5. Komponent-ma-komponent

### 5.1 `BarMini.tsx` (reports/components) — chart primitiv token-fix
**Hozir:** `background: var(--mantine-color-gray-1)` (track) + `var(--mantine-color-blue-5)` (fill)
— **off-token** (CLI-181 STATUS-INDICATORS konvensiyasini buzadi, DS0 palitraga ko'rinmas).
**Target:**
- Track → `var(--surface-2)`; fill → `var(--primary)`; `borderRadius` → `var(--radius-sm)` (yoki mavjud).
- Label `Text` → `--text-2`, qiymat `--text` (mono allaqachon `formatNumber`).
- **Ko'p-rang (ixtiyoriy, signature-saqlash bilan):** `BarMiniDatum`ga ixtiyoriy `color?: string`
  qo'shiladi; chaqiruvchi bermasa default `--primary`. Bu — qo'shimcha, mavjud chaqiruvlar
  o'zgarishsiz ishlaydi (token fill default). Donut/multi-series rang siklini chaqiruvchi
  (ReportsScreen) beradi, BarMini majburlamaydi.
- **Xulq invariant:** `max` hisobi, `width %`, `Math.max(2, …)` floor, `formatNumber` — saqlanadi.

### 5.2 `ReportsScreen.tsx` (reports/components) — re-skin
- **Sarlavha:** raw `Title order={2}` → `PageHead title={t('reports.title')}` (1C eksport tugma
  `actions`'ga ko'chishi mumkin — yoki filtr kartasida qoladi; xulq bir xil).
- **Filtr kartasi:** `DatePickerInput` range + branch `Select` (gated) + 1C `Button` — Mantine
  theme-convergent (token avtomatik). Layout `Card withBorder` → DS0 surface (token).
- **4 KPI qatori (YANGI chrome, mavjud datadan):** `SimpleGrid cols={{base:1,sm:2,lg:4}}` —
  `StatCard`:
  1. Daromad jami — `revenue.data.total` (`formatCurrency`), `accent`, icon.
  2. Qabullar jami — `appointments.data.total` (`formatNumber`), icon.
  3. Kelmaganlar (no-show) — `pct(appointments.data.noShowRate)`, icon.
  4. Bandlik (slot) — `pct(appointments.data.slotUtilization)`, icon.
  - **delta YO'Q** (§6 data-gap: davr-ustiga-davr taqqoslash hook yo'q).
  - Har KPI loading'da `StateView`/skeleton yoki `—` placeholder (mavjud `isLoading` flag).
- **Tushum dinamikasi (line chart niyat → bar fallback):** `revenue.data.byPeriod` (`{date,total}[]`)
  MAVJUD → `BarMini` (sana label) bilan ko'rsatiladi. **Haqiqiy chart kutubxonasi qo'shilmaydi**
  (yangi dep = scope tashqari); 720×220 line — DS11/keyin. Bu — chrome+real-data, omit emas.
- **Top xizmatlar bar:** mavjud `revenue.byService` `BarMini`, sarlavha `t('reports.top_services')`
  (token-fix orqali yangi ko'rinish).
- **Doktor yuklamasi bar:** roadmap "doktor yuklamasi **bar**" → `doctorWorkload` `BarMini` (label=ism,
  value=total). Mavjud jadval BarMini'ga ko'chadi (xulq: bir xil data, vizual bar). Yakunlangan/jami
  ikkala metrik kerak bo'lsa jadval qoldirilishi mumkin — lekin asosiy ko'rinish **bar**.
- **Davolash rejalari / Dental analitika kartalari:** mavjud `BarMini` + jadval — token avtomatik,
  layout DS0 surface.
- **To'lov usullari donut → OMIT (data-gap, §6).** Donut placeholder: bo'sh `StateView`
  yoki ko'rsatilmaydi (yangi data so'ralmaydi).
- **Bandlik heatmap 6×10 → OMIT (data-gap, §6).** Skalar `slotUtilization` KPI'da qoladi;
  per-slot grid render qilinmaydi.

### 5.3 `ExpensesScreen.tsx` (expenses/components) — re-skin
- **Sarlavha:** mavjud `PageHead` — saqlanadi (DS0 primitiv).
- **3 KPI qatori (YANGI chrome, mavjud datadan):** `StatCard`:
  1. Jami xarajat — `summary.data.grandTotal` (`formatCurrency`), `accent`.
  2. Yozuvlar soni — `Σ byCategory.count` (client-side sum, mavjud `summaryRows`/DTO'dan).
  3. Kategoriyalar — `summaryRows.length` (yoki `byCategory.length`).
  - delta YO'Q (data-gap).
- **Filtr qatori:** date `TextInput`×2 + kategoriya/filial `Select` — token avtomatik.
- **Xarajat kategoriya bar:** roadmap "xarajat kategoriya **bar**" → `summaryRows` `BarMini`
  (kategoriya nomi + total), `ExpenseSummaryCard` ichida. Jadval `grandTotal` qatori uchun qoladi
  (count + total raqamli ko'rinish), bar = vizual breakdown — bar asosiy element.
- **So'nggi xarajat list:** mavjud `ExpensesTable` — saqlanadi, DS0 surface/token.
- **O'chirish modal:** mavjud — token avtomatik (`color="red"` DS0 token).

### 5.4 `ExpenseSummaryCard.tsx` — re-skin
- `Paper withBorder` → DS0 surface (token avtomatik). `Title order={4}` + `IconChartBar`.
- **Kategoriya breakdown:** mavjud `Table` saqlanadi (count+total raqamlar) + `BarMini` qo'shiladi
  (`rows` → label+total vizual bar; mavjud `rows` propi yetarli, yangi data yo'q). `grandTotal`
  qatori fw=700 saqlanadi.
- Bo'sh holat `Text c="dimmed"` → `--text-3` (token avtomatik).

### 5.5 `ExpensesTable.tsx` — re-skin
- `Table` token-convergent (DS0 theme). `ActionIcon color="red"` — DS0 token (o'zgarmaydi).
- Bo'sh `Text c="dimmed"` → token avtomatik. Sana/summa/note ustun layout saqlanadi.

### 5.6 `ExpenseFormModal.tsx` + `CategoryManagerModal.tsx` — modal re-skin
- `Modal` chrome DS0 theme-convergent (radius/surface/border token avtomatik).
- Forma maydonlari (`NumberInput`/`TextInput`/`Select`/`Textarea`) — Mantine theme.
- **INVARIANT:** `@mantine/form` + `zod4Resolver`, `expenseFormSchema`/`categoryFormSchema`,
  `useCreateExpense`/`useCreateCategory`/`useDeleteCategory` — **o'zgarmaydi**.
- `Button color="red"` (delete) DS0 token. `withAsterisk`, validatsiya xato matni saqlanadi.

## 6. Deferred / Omitted (data-gap — chrome render, data omit)

| Dizayn element | Holat | Sabab |
|---|---|---|
| KPI davr-ustiga-davr **delta** (↑/↓ %) | OMIT | Hech bir hook taqqoslash davri bermaydi. `StatCard` `delta`/`deltaDir` propi BERILMAYDI (uydirma yo'q). |
| To'lov usullari **donut** | OMIT | Hech bir report hook payment-method breakdown bermaydi. Render qilinmaydi (yangi endpoint/hook YO'Q). |
| Bandlik **heatmap 6×10** | OMIT | Faqat skalar `slotUtilization` bor; per-slot/day grid data yo'q. Skalar KPI'da qoladi. |
| Tushum dinamikasi **haqiqiy line chart** | CHROME (bar fallback) | `revenue.byPeriod` MAVJUD → `BarMini` bilan real data. SVG line chart kutubxonasi = yangi dep (scope tashqari) → DS11/keyin. |
| Expenses 1C eksport | NO-OP (joyida qoladi) | Roadmap "moliya" guruhiga qo'shsa-da, 1C eksport hozir **ReportsScreen**'da (`useOneCExport`). Ko'chirilmaydi (xulq o'zgarishi = scope tashqari). |

> Deferred elementlar **kutilgan yo'q** — bu to'g'ri, to'liq emaslik EMAS. Backend chaqiruv,
> uydirma maydon, migration, endpoint/hook **qo'shilmaydi**.

## 7. Test strategiyasi (TDD)

- **`BarMini.test.tsx` (YANGI, co-located):** (a) track/fill DS0 token (`--surface-2`/`--primary`)
  ishlatishi — DOM style yoki snapshot; (b) `color?` berilsa shu rangni qo'llashi, berilmasa
  default; (c) `formatNumber` chiqishi + `max`-nisbat width xulqi (characterization).
- **Reports characterization:** mavjud `reports.export.test.ts` (export qatori) **o'zgarishsiz
  yashil** — re-skin export mantiqiga tegmaydi. KPI render testi (ixtiyoriy): `StatCard` label/qiymat
  mavjud datadan; delta YO'Q (assert delta render qilinmaganini).
- **Expenses characterization:** mavjud `expenses.mappers.test.ts` (`toSummaryRows`/`toExpenseVMs`)
  **o'zgarishsiz yashil**. KPI sum (`Σ count`) testi mavjud `summaryRows`/mapper chiqishidan
  hisoblanadi (client-side, yangi data yo'q).
- **Gating regression:** `report.view` branch Select, `expense.manage` tugmalar/o'chirish —
  permission-gated render saqlanadi (mavjud `hasPermission` mock bilan).
- **Verify:** `typecheck` · `biome` · `turbo test --filter @dental/web` · `build`.
  Vizual: DS0 light+dark side-by-side (dark kontrast: brand-fill matn token orqali).
- **i18n parity:** uz/ru yangi kalitlar (agar bo'lsa) ikkala faylda mavjud (parity guard).

## 8. i18n (kalitlar grep bilan aniqlandi — qaror qulflandi)

Mavjud kalitlar `uz.json`/`ru.json`'da tekshirildi. **Aniq qaror:**

**Yangi kalitlar (FAQAT 2 ta — `reports`, uz+ru):**
- `reports.revenue_trend` — "Tushum dinamikasi" / "Динамика выручки" (line/bar chart sarlavhasi; hozir yo'q).
- `reports.top_services` — "Top xizmatlar" / "Топ услуг" (`byService` bar sarlavhasi; hozir yo'q).

**Qayta ishlatiladigan mavjud kalitlar (yangi kalit QO'SHILMAYDI):**
- Reports 4 KPI: `reports.revenue`, `reports.appointments`, `reports.no_show`, `reports.utilization` (hammasi mavjud).
- Expenses 3 KPI: `expenses.grand_total`, `expenses.count`, `expenses.categories` ("Kategoriyalar" — mavjud) (hammasi mavjud).

> Yangi 2 kalit **faqat DS8-T1** (`touchesI18n=true`) tomonidan uz+ru ga **parity bilan** qo'shiladi.
> Re-skin tasklar (T3) bu kalitlarni FAQAT `t('reports.revenue_trend')` / `t('reports.top_services')`
> orqali **o'qiydi** — i18n fayllarga tegmaydi. T1 birinchi ketadi (T3 shu kalitlarga qarshi TDD-able).
> Expenses (T4/T5) yangi kalit ishlatmaydi → i18n fayllarga tegmaydi.

## 9. Bajarish tartibi (plan uchun)

1. **DS8-T1 (i18n)** — yangi kalitlar (agar kerak) uz+ru, parity. Birinchi (re-skin tasklar shularga tayanadi).
2. **DS8-T2 (BarMini token-fix)** — shared chart primitiv. T3/T4 import qiladi → ulardan oldin.
3. **DS8-T3 (ReportsScreen re-skin)** — PageHead + 4 KPI + BarMini ishlatish + donut/heatmap omit. (T1+T2'ga tayanadi.)
4. **DS8-T4 (Expenses screen+summary+table re-skin)** — 3 KPI + kategoriya bar + list. (T1+T2'ga tayanadi.)
5. **DS8-T5 (Expenses modallar re-skin)** — forma/kategoriya modal chrome. (T1'ga tayanadi.)

T3/T4/T5 o'zaro **file-disjoint** → parallel mumkin (T1+T2 tugagach).

## 10. Xavf-xatarlar

- **Off-token BarMini drift:** track/fill DS0 palitraga ko'rinmas edi → token-fix barcha BarMini
  chaqiruvchilarga (reports+expenses) ta'sir qiladi (kutilgan, yagona manba).
- **KPI placeholder:** loading/empty holat mavjud `StateView`/`—` bilan — bo'sh KPI grid emas.
- **Data-gap yashirin "to'liqsizlik" sifatida ko'rinishi:** donut/heatmap/delta render qilinmasligi
  TO'G'RI (§6). Reviewer "yetishmayapti" deb o'qimasligi uchun spec'da aniq belgilangan.
- **Characterization test buzilishi:** export/mapper testlar re-skin'da O'ZGARMASLIGI shart — agar
  o'zgarsa, re-skin xulqqa tegib ketgan (regression signal).
- **PageHead ko'chirish (reports):** raw `Title` → `PageHead` — sarlavha matni/joylashuvi DS0
  primitivga moslanadi; 1C tugma joylashuvi xulqni o'zgartirmasligi tekshiriladi.
