# DS3 — Bemor kartasi (8 tab + odontogram + SOAP) — Design Spec

**Sana:** 2026-06-22
**Milestone:** DS3 (Linear CLI-264) — eng katta Dental OS pixel-parity milestone'i
**Brief:** `docs/superpowers/briefs/ds3-gap.md`
**Deferred katalog:** `docs/superpowers/briefs/ds12-deferred-backend.md` (DS3 uchun kategoriya-3 element YO'Q — barcha tab real hook bilan ta'minlangan)
**Dizayn manbasi:** claude.ai/design "Dental OS.dc.html" (patient view), brief §1
**Qarorlar:** #32 (token remap-in-place), #33 (pixel-parity, funksiya saqlanadi), DS0 keystone (tokens/shell/primitives LOCKED)

---

## 1. Maqsad va doira

DS3 — bemor kartasini (header + 12 tab + odontogram) Dental OS dizayniga **front-end-only re-skin**. DS0 poydevori (tokens.css, shell, `@dental/ui` primitivlari) ISHLATILADI, hech qachon tahrirlanmaydi. Funksiya, API kontrakti, RLS, permission/vertical gating, i18n semantikasi, enum'lar O'ZGARMAYDI.

**Doirada (FAQAT shu fayllar tahrirlanadi):**
- `apps/web/src/features/patients/components/PatientCard.tsx` (+ ixtiyoriy yangi `PatientHeaderCard.tsx`)
- `apps/web/src/features/patients/components/tabs/*` (GeneralTab, MedicalTab, PaymentsTab, RecallTab, FamilyTab)
- `apps/web/src/features/clinical/components/**` (odontogram, treatment-plans, visit-notes, prescriptions, lab-orders, images, consent)
- `packages/i18n/src/locales/{uz,ru}.json` — **FAQAT belgilangan i18n task** (serial shared resurs)

**Doiradan tashqari (INVARIANT — TEGILMAYDI):**
- `packages/ui/src/theme/*`, `packages/ui/src/primitives/*` — DS0 LOCKED.
- `apps/web/src/shell/*`, `apps/web/src/stores/ui-store.ts` — DS0 LOCKED.
- **Shared feature modullar (read-only — har task iste'mol qiladi, hech qaysi tahrirlamaydi):**
  `clinical.api.ts`, `clinical.mappers.ts`, `clinical.types.ts`, `clinical.schema.ts`, `clinical.keys.ts`,
  `patients.api.ts`, `patients.mappers.ts`, `patients.types.ts`, `patients.keys.ts`, `patients.schema.ts`.
  **`visible-tabs.ts` — TEGILMAYDI** (gating saqlanishi shart — bu yerga edit = vertical-gating buzilishi, CLI-153/useVertical regressiya precedent).
- Backend — yangi endpoint/hook/migration/field YO'Q.
- `ToothState` / `ToothSurface` enum'lari — hand-maintained (M3), kengaytirilmaydi.

## 2. Qulflangan qarorlar (brief §0 ikki framing-lock + DTO tekshiruvi)

| # | Qaror |
|---|---|
| **Lock A — tab soni** | Dizayn 8 tab ko'rsatadi; kod 12 tab. **12 tab SAQLANADI** (har biri real feature+permission). Dizayn = vizual-til namunasi, tab spec emas. 4 mockup'siz tab (`cons`, `rec`, `fam` + `gen`/`med` split) qardosh tablardan bir xil Paper+token idiomni meros oladi. **Tab o'chirish/birlashtirish YO'Q.** |
| **Lock B — odontogram enum** | Dizaynning vizual treatmenti MAVJUD `ToothState` enumiga map qilinadi. Dizaynning 8-statusli to'plami QABUL QILINMAYDI. `watch`/"Kuzatuv" enum'da yo'q → **QO'SHILMAYDI**. Kod-only `to_extract`/`temporary`/`veneer` → token tayinlanadi (§4.2). |
| **Tab bar** | DS0 `@dental/ui` `Tabs` primitivi ALLAQACHON dizayn idiomi (`gap:2px`, `border-bottom:1px var(--border)`, active `--primary` 2px underline — `Tabs.module.css` tasdiqlandi). **Tab bar re-skin TALAB QILINMAYDI** — `<Tabs>` o'z holicha qoladi. (Primitiv LOCKED bo'lgani uchun bu mos keladi.) |
| **Header** | `PageHead` LOCKED primitiv → header **bespoke feature-komponent** sifatida quriladi (DS0'da `PageHead`'ni tahrirlash man etilgan). |
| **Header DTO gap (DTO tasdiqlandi)** | `Patient`/`PatientDetail`'da `code` va `nextVisit` field YO'Q. Scope policy → **omit** (ixtiro qilinmaydi, soxta placeholder YO'Q). `source`, `tags`, `age`, `gender`, `phone`, `balance` MAVJUD → teriladi. |
| **Allergiya bar** | Dizayn doimiy bar; kod shartli `Alert` (faqat `severity==='severe' && type==='anesthetic'`). **Shartli logika SAQLANADI** — faqat render qilingan element dizayn bariga re-skin qilinadi (severe allergiya yo'q bo'lsa baribir yashirin). Non-severe uchun ko'rsatish = behavior-change → defer (product tasdig'i). |
| **Shrift** | `--mono`/`--ui` = mockup-only alias, tokens.css'da YO'Q. **`<Mono>` primitivi / `--font-mono` ishlatiladi; default UI font = `--font-sans`.** Yangi token QO'SHILMAYDI. |

## 3. Token cheat-sheet (DS0'dan, brief §1/§4)

Status/tone tokenlari (light+dark ikkalasi DS0'da aniqlangan):
`--primary`, `--primary-soft`, `--primary-strong`, `--on-primary`, `--danger`, `--danger-soft`, `--text-on-danger`, `--warning`, `--warning-soft`, `--info`, `--info-soft`, `--success`, `--success-soft`, `--violet`, `--violet-soft`.
Yuza: `--surface`, `--surface-2`, `--bg`. Matn: `--ink`/`--text`, `--ink-2`/`--text-2`, `--ink-3`/`--text-3`. Chegara: `--border`, `--border-strong`. Soya: `--shadow-sm`. Radius: `--radius-*`, `--radius-pill`. Shrift: `--font-sans`, `--font-mono`.

**Dark-mode kontrast (DS0/CLI-80 darsi):** brand fill ustida HECH QACHON `color:#fff` hardcode qilinmaydi → `--on-primary` (primary fill), `--text-on-danger` (danger fill). Har status swatch + allergiya bar (`--danger-soft` bg + `--danger` text) light VA dark'da tekshiriladi.

## 4. Komponent-bo'yicha spek

### 4.1 Header card + tab shell (`PatientCard.tsx` + yangi `PatientHeaderCard.tsx`)

`PageHead` o'rniga bespoke header card (brief §1):
- Konteyner: `var(--surface)` bg, `1px solid var(--border)`, `border-radius:18px`, `box-shadow:var(--shadow-sm)`, `overflow:hidden`.
- Top row `padding:20px 22px`, `gap:18px`, `flex-wrap`:
  - **Avatar 60×60** `border-radius:16px`, `linear-gradient(135deg,var(--primary),var(--violet))`, oq bosh harflar `font-weight:800; font-size:21px`. (`Avatar` primitiv gradient'ni bermaydi → header ichida bespoke `div`.)
  - **Ism** `<h1>` `22px/800`, `letter-spacing:-.02em`, `color:var(--ink)`.
  - **Tag pill** — `tags[0]` MAVJUD bo'lsa: `--primary` text, `--primary-soft` bg, `radius:99px`, `padding:3px 10px`. (Mockup "★ Doimiy mijoz" = `tags` massividan; tag yo'q bo'lsa OMIT.)
  - **Meta row** (`margin-top:7px`, `12.5px`, `--ink-3`): `age · gender` | `phone` | `Manba: {source}`. Separatorlar `|` `--border-strong`'da. **`Keyingi tashrif` segmenti OMIT** (DTO'da `nextVisit` yo'q). **Code chip OMIT** (DTO'da `code` yo'q).
  - **Balance block** (`margin-left:auto`): label "Balans" uppercase `11px --ink-3`; miqdor `<Mono>` `21px/600`, qarz bo'lsa `--danger` (mavjud `BalanceBadge`/`usePatientBalance` ma'lumotidan); **"To'lov qabul qilish" tugma** `--primary` bg + `--on-primary` text, `height:40px`, `radius:10px`, `cashier`/`pay` permissioni bo'yicha gated bo'lsa — **mavjud xulq saqlanadi** (agar hozir tugma yo'q bo'lsa, navigatsiya/amal qo'shilmaydi — faqat ko'rinish; amal kerak bo'lsa mavjud `pay` tab'ga yo'naltirish, yangi mutation YO'Q).
- **Allergiya bar** (header ostida, shartli — §2 lock): `padding:12px 22px`, `background:var(--danger-soft)`, top border `color-mix(in srgb, var(--danger) 22%, transparent)`. `!` badge 30×30 `--danger` bg + `--text-on-danger`. Matn `Allergiya — {sev}: {substance}` (`--danger` bold label + `--ink` body). O'ng pill "Anesteziyadan oldin tasdiqlang". **Render sharti `severeAllergy` o'zgarmaydi.**

**Tab shell:** `<Tabs items={tabItems} value={active} onChange={setActive} />` AYNAN qoladi (DS0 primitivi allaqachon dizayn idiomi). `TABS` massiv, `filterPatientTabs`, `useVertical()`, `useEffect` active-fallback — **O'ZGARMAYDI**. Suspense lazy-tab render o'zgarmaydi.

### 4.2 Odontogram (BITTA task, 4 fayl — `Odontogram.tsx`, `ToothCell.tsx`, `ToothCell.module.css`, `OdontogramTab.tsx`)

Eng murakkab — yaqin-to'liq render qayta yozish. **Bitta task** sababi: status token palitra (`STATE_COLORS`/`STATE_BORDER`) `ToothCell.tsx`'da yashaydi va legend (`Odontogram`) HAM editor status-palette (`OdontogramTab`) HAM iste'mol qiladi. Bo'lish = shared-file edit (man etilgan) yoki mo'rt export-bog'liqlik → TDD mustaqilligini buzadi. Cohesive 4-fayl task to'g'ri.

**Status → enum token map (load-bearing, brief §3):**

| `ToothState` | dizayn key | token | swatch render |
|---|---|---|---|
| healthy | healthy | `--ink-3` | `--surface-2` fon |
| caries | caries | `--danger` | fill |
| filling | filling | `--info` | fill |
| crown | crown | `--warning` | fill |
| root_canal | root | `--primary` | fill |
| implant | implant | `--violet` | fill |
| missing | missing | `--ink-3` | `--surface-2` + diagonal X |
| to_extract | (yo'q) | **`--danger`** + distinct mark (qalin/qatlam belgi) | fill + belgi |
| temporary | (yo'q) | **`--warning-soft`** | soft fill |
| veneer | (yo'q) | **`--violet-soft`** | soft fill |
| — | watch | **N/A — QO'SHILMAYDI** | — |

> `to_extract` `caries` bilan bir xil `--danger` token'ni ulashadi → ajratish uchun distinct vizual belgi (masalan ❌ overlay yoki qalin chegara) + legend label. 10 enum legend entry'si bir-biridan farqlanadigan ko'rinishga ega bo'lishi shart (WCAG: rang yolg'iz emas).

**Tooth SVG (brief §1 Tab 1):** har tish = SVG 5 yuza path (FDI trapezoid): `B`(buccal/top), `D`(distal/right), `L`(lingual/bottom), `M`(mesial/left), `O`(occlusal/center kvadrat). `surfFill()` → `var(STATUS[s].token)` yoki `var(--surface)`. `whole:missing`→`--surface-2`+diagonal; `to_extract`→belgi. Stroke `--border-strong` 0.8. Tanlangan: `box-shadow:0 0 0 2.5px var(--primary)`. FDI raqam mono `10–10.5px`, tanlangan→`--primary` 700.
- **`I` (incisal) saqlanadi:** kod `SURFACE_OPTIONS = ['whole','M','D','B','L','O','I']` — `I`ни surface picker'dan tushirmaslik; SVG'da occlusal-markaz mintaqasiga map yoki 6-yuza sifatida render. `whole` + 6 yuza qabul qilinadi.

**Arch layout (`Odontogram.tsx`):** 4 tekis quadrant `Group` o'rniga egri UPPER/LOWER yoylar. Yuqori tishlar yuqoriga offset (`amp*t*t`), pastki pastga, index 8'dan keyin midline gap. Qatorlar yorlig'i "O'ng · yuqori"/"Chap · yuqori" uppercase `10.5px --ink-3`, 1px `--border` midline. Legend (har non-healthy status: 11×11 swatch + label `11.5px --ink-2`). `--mantine-color-teal-2` divider → `--border`.

**Detail panel + editor (`OdontogramTab.tsx`):** mavjud `Select(state)`+`Select(surface)`+`Select(diagnosis)` editorni dizayn idiomiga re-skin:
- Detail panel (o'ng ustun): FDI raqam mono 30px, quadrant label, status chip, katta tooth SVG 108px, "Yuzalar" 5-qator (B/M/O/D/L status chip yoki "Sog'lom"), note box `--surface-2`.
- Editor: `surfPicker` = `[whole|B|M|O|D|L|I]` toggle tugma (active→`--primary-soft`+`--primary` border, surface harflar mono); `statusPalette` = 10 status tugma (swatch + label).
- **SAQLANADI:** `useCreateToothChart`, `useLatestToothChart`, `useToothChartHistory`, `useDiagnoses`, draft/snapshot logika (`toToothDraftMap`, `draftMapToCreateInput`, `EMPTY_TOOTH_DRAFT`), `viewingId` read-only snapshot rejimi, `isPrimary` switch, history Select, save tugma. Faqat render qatlami o'zgaradi.

### 4.3 Plan tab (`TreatmentPlansTab.tsx`, `PlanCard.tsx`, `StageRow.tsx`, `EstimateView.tsx`, `PlanFormModal.tsx`)

2-ustunli grid `minmax(0,1fr) 300px`. Chap: card header ("Davolash rejasi · {yil}" + "{N} bosqich · {doktor}"), table header `34px 1fr 56px auto auto` (`# / Bosqich / Tish / Narx / Holat`, uppercase 11px), stage qatorlar status chip + acceptance chip + mono narx/tish. O'ng: "Moliyaviy xulosa" card — Jami/To'langan(`--success`)/Qoldiq(`--danger`), progress bar `linear-gradient(90deg,var(--primary),var(--primary-strong))`, "Reja PDF · konsent" tugma. Hooklar/forma (`@mantine/form`+`zod4Resolver`) O'ZGARMAYDI.

### 4.4 Visits tab (`VisitNotesTab.tsx`, `VisitNoteCard.tsx`, `VisitNoteFormModal.tsx`)

Header "Vizit yozuvlari · SOAP" + "Yangi vizit" primary tugma. Har vizit card (radius 16, shadow-sm): tooth chip 34×34 `--primary-soft`, title + `sana · doktor`, dx chip (`--violet`). **SOAP grid 2×2**: S(`--primary`), O(`--info`), A(`--violet`), P(`--warning`) — har cell `--surface-2`, mono harf + body `12.5px --ink-2`. Forma resolver wiring saqlanadi.

### 4.5 Retsept + Lab (`PrescriptionsTab.tsx`, `LabOrdersTab.tsx`)

Ikkalasi table/grid idiomi (bitta task). **Retsept:** `grid repeat(3,1fr)`, header "Faol reseptlar" + "Resept chop etish" tugma; har rx card radius 14, pill chip 32×32 `--info-soft`/`--info`, med nomi, Doza/Qabul/Davomiylik(mono), note footer top-bordered. **Lab:** bitta card radius 16, header "Laboratoriya buyurtmalari", table grid `40px 1fr 1fr 90px auto` (Tish/Ish turi/Material·rang/Muddat/Holat), tish+muddat mono, status icon o'ngda. Hooklar/forma o'zgarmaydi.

### 4.6 Read-tabs (`GeneralTab.tsx`, `MedicalTab.tsx`, `ConsentTab.tsx`, `RecallTab.tsx`, `FamilyTab.tsx`)

- **GeneralTab + MedicalTab:** dizayn "Umumiy" = read-only 3-card layout (Aloqa / Tibbiy / Tashriflar). **gen+med BIRLASHTIRILMAYDI** — har biri o'z tab'i; 3-card *vizual* layoutni read-only ko'rinish uchun qarz oladi. GeneralTab tahrirlash formasi saqlanadi (re-skin only). Card radius 16, uppercase section title `11px --ink-3`, field label `11.5px --ink-3`.
- **ConsentTab / RecallTab / FamilyTab:** mockup'da yo'q → qardosh tablardan o'rnatilgan Paper+token+card idiomni qo'llaydi (yangi dizayn spec yo'q). Forma resolver wiring saqlanadi.

### 4.7 Images + Payments (`PatientImagesTab.tsx`, `ImageCard.tsx`, `ImagePreviewModal.tsx`, `ImageUploadModal.tsx`, `PaymentsTab.tsx`)

- **Rasmlar:** `grid repeat(4,1fr)`, har thumb `aspect-ratio:4/3`, radius 14, `--surface-2` bg, image icon + caption `12px`. Oxirgi cell = dashed upload tile (`1.5px dashed --border-strong`, hover→`--primary`), plus icon + "Rasm yuklash". Upload = multipart hand exception — O'ZGARMAYDI. ImageUploadModal forma resolver saqlanadi.
- **Moliya/payments:** bitta card radius 16, header "To'lov tarixi" + "Joriy balans: −{amount} so'm" (`--danger` mono). Har txn qatori `14px 18px` top-bordered: sana mono, desc, method, amount. Pul formatlash `lib/format.ts` (`formatCurrency`) — inline `Intl.NumberFormat` YO'Q.

### 4.8 i18n (`packages/i18n/src/locales/{uz,ru}.json`) — SERIAL task

Yangi kalitlar (uz+ru ikkalasi): surface labellar B/M/O/D/L/I (mavjud `tooth_chart.surfaces.*` tekshiriladi — bo'lsa qayta ishlatiladi), status legend (mavjud `tooth_chart.states.*` qayta ishlatiladi), allergiya pill "Anesteziyadan oldin tasdiqlang", balance label "Balans", "To'lov qabul qilish", "Manba", SOAP letter tooltip'lar, "Moliyaviy xulosa"/"Jami reja"/"To'langan"/"Qoldiq", "Faol reseptlar"/"Resept chop etish", "Rasm yuklash", "Vizit yozuvlari · SOAP" va h.k. **uz/ru parity majburiy.** CLI-182 (Zod errorMap i18n) → DS11'da defer, DS3 scope'da EMAS.

## 5. Deferred / omitted (scope policy)

- **Code chip `#{code}`** — OMIT (DTO'da field yo'q; ixtiro qilinmaydi).
- **"Keyingi tashrif" meta segmenti** — OMIT (DTO'da `nextVisit` yo'q).
- **`watch`/"Kuzatuv" status** — QO'SHILMAYDI (enum'da yo'q, API change man etilgan).
- **Allergiya bar non-severe ko'rsatish** — DEFER (behavior change, product tasdig'i).
- **Header "To'lov qabul qilish" tugma** — faqat ko'rinish + mavjud navigatsiya (`pay` tab); yangi mutation/hook YO'Q.
- DS12 katalogida DS3 uchun kategoriya-3 element YO'Q — barcha tab real hook bilan ta'minlangan.

## 6. Test strategiyasi (TDD, characterization)

- **Har task:** mavjud `*.test.tsx` characterization testlar YASHIL qoladi (xulq o'zgarmagan). Re-skin = render-only, shuning uchun render-assertion (matn, role, hook chaqiruvi) o'zgarmasligi kerak.
- **PatientCard.test.tsx:** 12 tab ko'rinishi, vertical-gating (`odo`/`lab` `general` vertical'da yashirin), active-fallback `gen`'ga. Allergiya bar shartli render (severe anesthetic only) — yangi test bar matni uchun.
- **Odontogram:** ToothCell aria-label "{number} — {state}" SAQLANADI (WCAG 1.4.1); legend 10 enum entry; surface picker `I` mavjud; `OdontogramTab.test.tsx` save/draft/snapshot characterization yashil.
- **visible-tabs.test.ts:** O'ZGARMAYDI (gating regression guard) — fayl tegilmaydi.
- **Forms:** `@mantine/form`+`zod4Resolver` wiring testlari (ConsentTab, PrescriptionsTab, ImageUploadModal, VisitNoteFormModal, StageRow) yashil.
- **Verify:** `typecheck` · `biome` · `turbo test --filter @dental/web` · `build`.
- **Dark-mode:** har status swatch + allergiya bar + SOAP cell light+dark kontrast (DS0 `--text-on-danger`/`--on-primary` darsi).
- **Vertical-gating Playwright (rol-bo'yicha, @owner EMAS):** `general` vertical'da `odo`/`lab` tab yashirin + 403-safe.

## 7. Xavf-xatarlar

- **Odontogram SVG math** dominant xavf (trapezoid yuza, arch amplitude, midline gap, per-surface fill, selection ring, primary-vs-permanent, snapshot read-only). Faqat render qatlami; barcha data/draft/history logika tegilmaydi.
- **Enum ≠ dizayn palitra (Lock B):** `watch` qo'shilmaydi; `to_extract`/`temporary`/`veneer` token tayinlanadi; `ToothState`/`ToothSurface` kengaytirilmaydi.
- **Vertical-gating omon qolishi:** `odo`/`lab` `filterPatientTabs`/`useVertical()` bilan gated qoladi; `visible-tabs.ts` tegilmaydi.
- **Shared-modul collision:** `clinical.*`/`patients.*` modul fayllari read-only — har task iste'mol qiladi, edit = yashirin cross-task collision.
- **`--mono`/`--ui`** mockup alias — `<Mono>`/`--font-mono` ishlatiladi, token qo'shilmaydi.
- **Dark kontrast** (DS0 darsi) — danger/violet/warning fill + `--*-soft` bg har ikkala rejimda tekshiriladi.

---

_Spec yozildi: `docs/superpowers/specs/2026-06-22-ds3-patient-card-design.md`. Brief §0–§5 va DTO tekshiruviga asoslangan._
