# DS2 — Patients list + New patient form — Design-vs-Code Gap Brief

> Milestone: **DS2** of the Dental OS pixel-parity redesign.
> Scope: re-skin only — patients **list** (nav-key `'patients'`, "Bemorlar") + **new patient** form (design view-key `'patient_new'`). Functionality / API / i18n keys / permissions unchanged (Qaror #33). DS0 foundation (tokens.css, shell, primitives) is locked.
> Patient **card / detail** (view `'patient'`) is **out of scope** — that is DS3.
> Design source (read via bounded `dd`): `…/tool-results/toolu_01GKUFvM7wVKLrAXM5m5CcRj.txt` (React-createElement prototype, `sc-if`/`sc-for` template). Token names below are the prototype's CSS vars (`--ink`, `--surface`, `--primary` …); the DS0 remap keeps token **names** so these map onto our locked `packages/ui/src/theme/tokens.css`.

---

## 1. Design summary

### 1A. Patients LIST (view `isPatients`)

Container: `width:100%; animation:fadeUp .2s ease`.

**Header row** (`display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-bottom:16px`):
- Left title block: title `font-size:17px; font-weight:700; color:var(--ink)` = "Bemorlar"; sub-line `font-size:12px; color:var(--ink-3)` = "1 284 ta bemor · Bosh filial" (**count + branch name**).
- Right cluster (`margin-left:auto; display:flex; gap:8px; flex-wrap:wrap`):
  - **Search field**: a styled wrapper `height:38px; padding:0 12px; min-width:230px; border:1px solid var(--border); border-radius:10px; background:var(--surface); color:var(--ink-3)`, search icon + bare `<input>` (`font-size:13px; color:var(--ink)`), placeholder "Ism, telefon yoki #kod…".
  - **"Yangi bemor" button**: `height:38px; padding:0 14px; gap:7px; border:1px solid var(--primary); border-radius:10px; background:var(--primary); color:var(--on-primary); font-weight:600; font-size:13px`; hover `background:var(--primary-strong)`; plus icon + label.

**Filter pills** (`display:flex; gap:7px; margin-bottom:14px; flex-wrap:wrap`), 4 pills: `Barchasi`, `Doimiy mijozlar`, `Qarzdorlar`, `Arxiv`.
- Pill base: `height:32px; padding:0 14px; border-radius:99px; font-weight:600; font-size:12.5px`.
- Active: `border:1px solid var(--primary); background:var(--primary-soft); color:var(--primary)`.
- Inactive: `border:1px solid var(--border); background:var(--surface); color:var(--ink-2)`; hover `borderColor:var(--border-strong)`.

**Table card**: `background:var(--surface); border:1px solid var(--border); border-radius:16px; box-shadow:var(--shadow-sm); overflow-x:auto; overflow-y:hidden`.
- **Header row**: `display:grid; grid-template-columns:minmax(0,1.6fr) 170px 120px 170px 150px; min-width:780px; padding:11px 18px; background:var(--surface-2); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:var(--ink-3)`. Columns: **Bemor / Telefon / Yosh · jins / So'nggi tashrif / Balans** (Balans right-aligned). 5 columns.
- **Data row** (same grid): `min-width:780px; align-items:center; padding:12px 18px; border-top:1px solid var(--border); cursor:pointer; font-size:13px`; hover `background:var(--surface-2)`; whole row clickable → opens patient.
  - **Avatar**: `width:38px; height:38px; border-radius:11px; background:linear-gradient(135deg,var(--primary),var(--violet)); color:#fff; font-weight:700; font-size:13px`, gradient initials (NOT a flat Avatar).
  - **Name line**: name `font-weight:600; color:var(--ink)` ellipsised; optional **alert dot** (allergy) `width:16px; height:16px; border-radius:99px; background:var(--danger); color:#fff; font-size:10px; font-weight:800` content "!"; optional **tag chip** `font-size:10.5px; font-weight:600; color:var(--primary); background:var(--primary-soft); border-radius:99px; padding:1px 8px`.
  - **Code line** (under name): `font-family:var(--mono); font-size:11px; color:var(--ink-3)` = `#CODE`.
  - **Phone** col: `font-family:var(--mono); font-size:12.5px; color:var(--ink-2)`.
  - **Age · gender** col: `color:var(--ink-2)`, text `{age} · {gender}`.
  - **Last visit** col: `font-family:var(--mono); font-size:12px; color:var(--ink-3)`.
  - **Balance** col: right-aligned chip (`chip()` helper — paid → "To'langan" muted tone, else amount with tone).
- **Empty state** (inside card, `patEmpty`): `min-width:780px; padding:50px 18px; text-align:center; border-top:1px solid var(--border)`; 54×54 rounded (`border-radius:15px; background:var(--surface-2); color:var(--ink-3)`) search icon; title `font-size:14.5px; font-weight:700; color:var(--ink)` "Bu bo'limda bemor yo'q"; desc `font-size:12.5px; color:var(--ink-3)` "Boshqa filtrni tanlang yoki yangi bemor qo'shing"; CTA button `height:36px; padding:0 16px; border-radius:9px; background:var(--primary); color:var(--on-primary); font-weight:600; font-size:12.5px`.

> Note: design has **no separate pagination control** in this view (mock is single-page); the prototype filters client-side.

### 1B. NEW patient form (view `isNewPatient`)

Container: `width:100%; max-width:1140px; animation:fadeUp .2s ease`.
- **Back link** (top): `inline-flex; gap:5px; background:none; border:none; color:var(--ink-3); font-size:12.5px; font-weight:600; margin-bottom:14px`; hover `color:var(--primary)`; text "‹ Bemorlar ro'yxati".
- **Two-column grid**: `display:grid; grid-template-columns:minmax(0,1fr) 320px; gap:20px; align-items:start`. Left = stacked cards; right = sticky rail (**~320px**).

**Left column** (`display:flex; flex-direction:column; gap:16px`) — 3 cards, each:
`background:var(--surface); border:1px solid var(--border); border-radius:16px; box-shadow:var(--shadow-sm); overflow:hidden`.
- **Card header**: `display:flex; align-items:center; gap:12px; padding:15px 20px; border-bottom:1px solid var(--border)`; 34×34 icon tile (`border-radius:10px; display:grid; place-items:center`); title `font-size:14.5px; font-weight:700; color:var(--ink)`; sub `font-size:11.5px; color:var(--ink-3)`.
  - Card 1 **"Shaxsiy ma'lumot"** — icon tile `background:var(--primary-soft); color:var(--primary)` (users icon); sub "Ism, familiya va tug'ilgan sana".
  - Card 2 **"Aloqa"** — `background:var(--primary-soft); color:var(--primary)` (phone icon); sub "Telefon — eslatma va recall uchun".
  - Card 3 **"Tibbiy ma'lumot"** — `background:var(--danger-soft); color:var(--danger)` (pulse icon); sub "Allergiya anesteziya xavfsizligi uchun muhim".
- **Card body**: `padding:20px`; field grids `display:grid; grid-template-columns:1fr 1fr; gap:16px` (full-width fields use `grid-column:span 2`).
- **Field input style** (every text input): `width:100%; height:44px; padding:0 13px; border:1px solid var(--border); border-radius:11px; background:var(--surface-2); color:var(--ink); font-family:var(--ui); font-size:14px`; focus `borderColor:var(--primary); background:var(--surface)`. Mono fields (DOB, phone) use `font-family:var(--mono)`. The **allergy** input focus uses `borderColor:var(--danger)`.
- **Field label**: `font-size:12px; font-weight:600; color:var(--ink-2); margin-bottom:7px`; required ones append `<span style="color:var(--danger)">*</span>`.
- **Selects** (source / blood group): same `height:44px` shell, `cursor:pointer`.
- **Segmented toggles** (`npSeg`, gender Erkak/Ayol): `flex:1; height:44px; border:1.5px solid …; border-radius:11px; font-weight:600; font-size:13.5px`; on → `border:var(--primary); background:var(--primary-soft); color:var(--primary)`, off → `border:var(--border); background:var(--surface); color:var(--ink-2)`.
- **Severity toggles** (`npSegD`, Yengil/O'rta/Og'ir): `height:38px; padding:0 16px; border:1.5px solid …; border-radius:10px; font-size:12.5px`; on → danger-tinted (`border:var(--danger); background:var(--danger-soft); color:var(--danger)`).

Card fields (design): **Personal** = Ism\*, Familiya\*, Tug'ilgan sana, Jins(segmented). **Aloqa** = Telefon\*, Telegram, Manzil(span2), Qayerdan kelgan/manba select(span2). **Tibbiy** = Qon guruhi select, Surunkali kasallik, Allergiya(span2) + severity segmented.

**Right rail** (`position:sticky; top:0; display:flex; flex-direction:column; gap:14px`):
- **Preview card** (`box-shadow:var(--shadow)` — stronger than left cards):
  - Head (`padding:22px 20px 18px; text-align:center; border-bottom:1px solid var(--border)`): 64×64 gradient avatar `border-radius:18px; background:linear-gradient(135deg,var(--primary),var(--violet)); color:#fff; font-weight:800; font-size:23px` (initials, "··" placeholder); name `font-size:16.5px; font-weight:800; color:var(--ink)` ("Yangi bemor" fallback); phone `font-family:var(--mono); font-size:12.5px; color:var(--ink-3)`; two meta chips (gender, source) `font-size:11.5px; font-weight:600; color:var(--ink-2); background:var(--surface-2); border:1px solid var(--border); border-radius:99px; padding:3px 10px`.
  - **Allergy banner** (conditional): `background:var(--danger-soft); border-bottom:1px solid color-mix(in srgb,var(--danger) 20%,transparent); padding:12px 16px`; 22×22 danger "!" badge; "Allergiya: {text}".
  - **Required checklist** (`padding:16px`): heading `font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-3)` = "To'ldirilishi shart"; rows (gap:9px) each a 16×16 status dot (`border-radius:99px; background:{{ ok* }}; transition:background .15s`) + label `color:var(--ink-2)`. Dots: **Ism / Familiya / Telefon** (3 required fields). Dot color via `okC()` (filled when value present).
- **Action buttons** (`display:flex; flex-direction:column; gap:9px`):
  - **Save** (`saveBtnStyle`): `height:44px; padding:0 22px; border-radius:11px; font-weight:700; font-size:13.5px`; enabled → `background:var(--primary); color:var(--on-primary)`, disabled → `background:var(--border-strong); color:var(--ink-3); cursor:not-allowed`. Enabled only when first+last+phone present.
  - **Cancel/back** (goPatients): `height:42px; padding:0 18px; border:1px solid var(--border); border-radius:11px; background:var(--surface); color:var(--ink-2); font-weight:600; font-size:13.5px`.

### Token cheat-sheet (VERIFIED against `packages/ui/src/theme/tokens.css`)
DS0 already defines the prototype's token names **as literal aliases** in tokens.css — no translation needed, the prototype vars resolve directly:
- `--ink` → `var(--text)` (#192420), `--ink-2` → `--text-2`, `--ink-3` → `--text-3` — all present.
- `--surface` (#fff), `--surface-2` (#f6f8f4) — present.
- `--border` (#e4e8e1), `--border-subtle` (#eef1ec), `--border-strong` (#d3d9cf) — present.
- `--primary` (teal-600), `--primary-soft` (= `--primary-tint` #ddefea), `--primary-strong` (teal-700) — present.
- `--on-primary` (= `--text-on-primary` #fff light / **#04130f dark**) — present.
- `--danger` (red-600), `--danger-soft` (= `--danger-bg` #fbe7e5 light / #341917 dark) — present.
- **`--violet` (#7c4dd6 light / #b093ee dark) — present** ✅ (gradient-avatar end colour exists; gradient avatars buildable WITHOUT touching locked tokens — no scope conflict).
- `--shadow-sm`, `--shadow` — present (theme-aware).
- `--ui` in prototype ≈ our `--font-sans` (Hanken Grotesk); `--mono` ≈ `--font-mono` (JetBrains Mono). The prototype literally writes `var(--ui)`/`var(--mono)` — our tokens.css does **not** alias those two names. Use `--font-sans`/`--font-mono` (primitives already do), or add `--ui`/`--mono` aliases — but adding aliases edits locked tokens.css, so **prefer using `--font-sans`/`--font-mono` directly** in the re-skin CSS modules.
- Radius: prototype `16px` card ≈ no exact token (`--radius-xl`=14px); `11px` input ≈ between `--radius-lg`(12) and `--radius-md`(9); `99px` pill = `--radius-pill`. Minor radius literals are acceptable in feature CSS, or round to nearest token — decide in spec (low risk).
- Hardcoded `color:#fff` on gradient avatars / "!" badges in the prototype: in our theme prefer `--on-primary` / `--text-on-danger` so dark mode stays AA (see Risks).

---

## 2. Current state (files / components / hooks)

Feature root: `apps/web/src/features/patients/`

| Path | Role |
|---|---|
| `components/PatientsListScreen.tsx` | List screen (in DS2 scope) |
| `components/PatientsListScreen.module.css` | List styles (`.toolbar`, `.searchField`, `.row`, `.identity`, `.name`, `.age`) |
| `components/PatientNewScreen.tsx` | New patient form (in DS2 scope) |
| `components/PatientNewScreen.module.css` | Form styles (`.fields`, `.grid2`) |
| `patients.api.ts` | Hooks — `usePatients(params)`, `useCreatePatient()`, `useArchivePatient()` (+ many detail hooks not used here) |
| `patients.mappers.ts` | `toPatientListItem` (id, fullName, phone, age, genderLabel, tags, balance), `calcAge`, `formatDate` |
| `patients.types.ts` | `PatientListItem`, `ListParams`, `PatientDetail` |
| `patients.schema.ts` | `patientFormSchema` (Zod 4) + `PatientFormValues` |
| `patients.routes.tsx` | routes: `/patients`, `/patients/new`, `/patients/:id` |
| `patients.keys.ts` | query-key factory |
| `../../components/BalanceBadge.tsx` | balance render (Mantine `Text`, `c="red"/"teal"`, `formatCurrency`) |
| `../../components/PhoneInput.tsx` | phone field used in form |

Primitives used (from `@dental/ui`, locked): `Avatar`, `Button`, `Card` (`bodyless`, `title` props), `IconButton`, `Input` (supports `error` prop — CLI-179), `Mono`, `PageHead`, `StateView` (`loading`/`error`/`empty`, `skeleton="table"`), `Tag`, `Select`. Mantine direct: `Pagination`, `Switch`, `Checkbox`, `Group`, `TagsInput`, `Textarea`.

**List current behaviour**: `PageHead` title + "Yangi bemor" action button; toolbar = `Input` search + `Switch` "show archived"; results in a `Card bodyless` with flex `.row`s: `Avatar name` + identity (name + `Mono` phone) + `Tag`s + `BalanceBadge` + age span + view/archive `IconButton`s; real `Pagination` when `total > pageSize`; `StateView` for loading/error/empty.

**New current behaviour**: single `PageHead` + **one** `Card title="Asosiy ma'lumot"` containing a flat `.fields` column (full name, DOB+gender grid, two phones grid, passport, address, notes, tags, source, insurance block of 4 + active checkbox); footer `Group` with Cancel (ghost) + Save (primary). `@mantine/form` + `zod4Resolver(patientFormSchema)`; `error` prop wired on `Input`/`Select` (CLI-179); on success navigates to `/patients/:id`. **No second column, no preview rail, no per-card sections, no required-field checklist.**

---

## 3. Gap list (concrete visual deltas)

### List (`PatientsListScreen.tsx` / `.module.css`)
1. **Header sub-line missing** — design shows `{count} ta bemor · {branch}` under the title; current `PageHead` has title only. Data: `data.meta.total` (count) + active branch name (from auth/shell store). *(Re-skin: add count; branch name optional if available.)*
2. **Toolbar layout differs** — design puts search + "Yangi bemor" in a right cluster on the header line; current splits action into `PageHead.actions` and a separate `.toolbar` row with `Input`+`Switch`. The **archived Switch** has no design equivalent — it is folded into the **"Arxiv" filter pill** (see #3). Decide: keep Switch (functionality) but restyle, or move archived into a pill. Re-skin-safe: keep Switch but visually align; pills are additive.
3. **Filter pills absent** — design has 4 pills (Barchasi / Doimiy mijozlar / Qarzdorlar / Arxiv). Current has none (only archived toggle). True parity needs client-side `patFilter` state. **Caution:** "Doimiy"/"Qarzdorlar" filters in the mock are pure client-side over mock data; our list is server-paginated. Implementing real semantic filters is *functional* change → out of re-skin scope. Recommend: render pills as a **presentational** control mapping only to what the API already supports (Barchasi / Arxiv ↔ `archived` flag); leave Doimiy/Qarzdorlar as visual-only or defer. Flag in tasks.
4. **Row is a card-table, not a flex list** — design = CSS grid `minmax(0,1.6fr) 170px 120px 170px 150px`, `min-width:780px`, sticky-ish uppercase header row (`--surface-2`), `border-top` separators, hover `--surface-2`, full-row click. Current = flat `.row` flex with `border-bottom`, no column header, no grid alignment.
5. **Avatar mismatch** — design = 38×38 `border-radius:11px` **gradient** tile `linear-gradient(135deg,var(--primary),var(--violet))` with initials; current uses `<Avatar name size="md">` primitive (likely circular, not gradient). Need a gradient-initial avatar variant (square 11px radius). Confirm whether `Avatar` primitive can express this or a local span is needed.
6. **Patient code line — CONFIRMED data-absent.** Design shows `#CODE` (`--mono`, 11px) under the name. The generated DTO `PatientListItem = Patient & { balance }` (`packages/api-client/src/generated/model/patientListItemAllOf.ts` + `patient.ts`) has **no** code/MRN field. → **Omit in DS2.** Adding a patient code is backend/DTO work, out of re-skin scope.
7. **Alert dot — CONFIRMED data-absent; tag chip — restyle.** Design name line has a red "!" allergy dot + inline pill tag. The DTO has **no** allergy/alert field → **omit the alert dot in DS2**. The `tags: string[]` field DOES exist — restyle the existing `Tag` render to the inline `--primary-soft` pill (10.5px) shown in the design (keep first tag inline, as the mock shows one).
8. **Columns — Telefon/Yosh·jins OK; So'nggi tashrif CONFIRMED data-absent.** Design has Bemor / Telefon / Yosh·jins / So'nggi tashrif / Balans. `phone`, `dateOfBirth` (→ age via `calcAge`), `gender` all exist → those columns are buildable. **`lastVisit` is NOT in the DTO** → either drop the "So'nggi tashrif" column (4-col grid) or render a `—` placeholder. Recommend dropping the column and using a 4-column grid for a clean table. Decide in spec.
9. **Balance presentation** — design uses a right-aligned `chip()` (paid → "To'langan" muted). Current `BalanceBadge` is inline `Text` (red/teal + currency). Re-skin `BalanceBadge` styling to a chip, or render a chip in the balance column. Keep `formatCurrency` + `t()` usage.
10. **Empty state differs** — design empty lives **inside** the table card (54×54 icon tile, title, desc, CTA "Yangi bemor qo'shish"). Current uses generic `StateView status="empty"` (separate). Decide: keep `StateView` (locked primitive) but pass the right title/desc/icon/action, or build inline. Re-skin-safe: keep `StateView`, supply DS2 copy + an action button if the primitive supports one.
11. **Table card radius/shadow** — design card `border-radius:16px; box-shadow:var(--shadow-sm)`. Confirm `Card` primitive matches; the bodyless list card likely already follows DS0 tokens.

### New patient form (`PatientNewScreen.tsx` / `.module.css`)
12. **Single card vs 3 sectioned cards** — current = one `Card title`. Design = 3 cards (Shaxsiy / Aloqa / Tibbiy) each with an icon-tile header (primary-soft × 2, danger-soft × 1). Major structural re-skin.
13. **No two-column / sticky preview rail** — design = `minmax(0,1fr) 320px` grid with sticky right rail (preview avatar card + required checklist + Save/Cancel). Current has neither; Save/Cancel are a bottom `Group`. The rail Save button is the primary action; current bottom-bar Save stays functionally but should move/duplicate per design. **Layout is the biggest delta.**
14. **Required-field checklist absent** — design rail shows live dots for Ism/Familiya/Telefon. Current has no live checklist (relies on submit-time validation). This is presentational live-state derived from `form.values` — re-skin-safe to add.
15. **Live preview avatar/name/meta absent** — design rail mirrors typed first/last → initials + name + phone + gender/source chips + allergy banner. Current has no live preview. Additive, derived from `form.values`.
16. **Field/control styling** — design inputs are 44px tall, `--surface-2` fill, 11px radius, primary focus ring; gender/severity are **segmented toggles**, not a Select/(no severity field at all). Current uses `Input`/`Select`/Mantine `TagsInput`/`Textarea`/`Checkbox` with default styling. Re-skin to match heights/radii/fills; gender could stay a `Select` (functional parity) or become segmented (visual parity) — segmented is presentational over the same enum.
17. **Field-set divergence (do NOT silently drop/add fields)** — design cards expose Telegram, manba(source as select w/ specific options), qon guruhi, surunkali kasallik, allergiya + severity; current form has passport, notes, tags, full insurance block (provider/policy/coverage/expiry/active), source as 4-option select. **These field sets differ.** Per Qaror #33 (functionality unchanged), DS2 must **keep the existing fields/schema** and only re-skin; do **not** adopt the mock's medical/telegram fields (those are not in `patientFormSchema` / API). Treat the mock's medical card as illustrative — map our existing fields into the 3-card visual shell instead. Call this out explicitly in the spec.
18. **Back link missing** — design has "‹ Bemorlar ro'yxati" top link; current uses `PageHead title` only + bottom Cancel. Additive.
19. **Validation display (CLI-179)** — keep `error` prop wiring already present on `Input`/`Select`; ensure the re-skinned inputs still surface `form.errors.*` as **text**, not just border. The mock shows required `*` markers + the checklist but no inline error text — our CLI-179 contract (text errors) must be preserved on top of the new styling.

---

## 4. Tasks proposed (disjoint leaf tasks)

> All within `apps/web/src/features/patients/` + `BalanceBadge`. Re-skin only — no API/schema/permission change (Qaror #33). **Tasks are file-disjoint:** T1 owns the list files, T2 owns the form files, T3 owns `BalanceBadge`, T4 (i18n) is SERIAL on shared locale files. T1/T2/T3 touch non-overlapping files → safe to parallelise; T4 must land alone. (Data-surface question is already resolved in §3 — see #6/#7/#8 — so no spike task is needed.)

- **T1 — List re-skin** (`components/PatientsListScreen.tsx` + `PatientsListScreen.module.css`): the WHOLE list screen as one leaf — (a) header: title + count sub-line (`data.meta.total`) + branch name (from auth/shell store if available); (b) right cluster restyled search + "Yangi bemor" button; (c) presentational filter-pill row mapping only to API-backed states (Barchasi / Arxiv ↔ `archived`; Doimiy/Qarzdorlar visual-only or omit — decide in spec); (d) flex list → DS2 grid table (uppercase `--surface-2` header row, 4-column grid since `lastVisit` is absent, `border-top` rows, hover `--surface-2`, full-row click); (e) 38×38 gradient-initial avatar (`--primary`→`--violet`, initials, `--on-primary` text); (f) inline restyled tag pill (omit alert dot + `#code` — data-absent); (g) DS2 empty-state copy/icon/CTA via locked `StateView`; keep permission gating, view/archive `IconButton`s, and real `Pagination`. Consumes balance chip from T3.
- **T2 — New form re-skin** (`components/PatientNewScreen.tsx` + `PatientNewScreen.module.css`): the WHOLE form screen as one leaf — (a) top back-link "‹ Bemorlar ro'yxati"; (b) two-column `minmax(0,1fr) 320px` grid; (c) existing fields split into 3 sectioned icon-tile cards (primary-soft ×2 / danger-soft ×1) — **keep `useForm`/`patientFormSchema`/current field set unchanged** (Qaror #33; do NOT adopt mock-only telegram/blood/severity fields); (d) restyle inputs/selects to 44px / `--surface-2` / focus `--primary`; optional segmented gender toggle; (e) sticky right rail: live preview avatar (gradient initials from `fullName`) + name/phone/meta chips + live required-field checklist mapped to **actual** required fields (`fullName`, `phone` — our schema has a single `fullName`, not separate Ism/Familiya, so the checklist must reflect that) + Save (primary, gated on form validity) / Cancel (secondary); (f) preserve CLI-179 text-error display via `Input`/`Select` `error` prop.
- **T3 — BalanceBadge → chip** (`apps/web/src/components/BalanceBadge.tsx`): restyle the balance render to the DS2 right-aligned chip (paid → "To'langan" muted, debt → danger tone, credit → teal tone). Keep `formatCurrency(…, t)` + existing `balance` prop API. Isolated file → parallel-safe; T1 consumes the result.
- **T4 — i18n strings (SERIAL)** (`packages/i18n/src/locales/uz.json` + `ru.json`): add **new** UI strings the re-skin introduces (count sub-line "{n} ta bemor", branch suffix, filter-pill labels, "Yosh / jins"/"So'nggi tashrif" column heads if kept, empty-state title/desc/CTA, back-link, "To'ldirilishi shart" checklist heading + items, "Bemorni saqlash"). Reuse existing `patients.*` / `patients.form.*` keys (see §2). Keep uz/ru parity. Serial because it mutates shared locale files all screens reference.

---

## 5. Risks / notes

- **Qaror #33 (functionality frozen)** is the dominant constraint. The mock's **field sets differ from our schema** (mock medical/telegram/severity fields are not in `patientFormSchema` or the API). DS2 must re-skin the *existing* fields into the new visual shell, NOT adopt new fields. Gap #17 is the highest-risk place to accidentally exceed scope.
- **Data gaps for list parity — RESOLVED (confirmed absent).** `PatientListItem = Patient & { balance }` has **no** `#code`, **no** `lastVisit`, **no** allergy/alert flag. So DS2 omits the code line, the alert dot, and the "So'nggi tashrif" column (4-col grid). `tags`, `phone`, `dateOfBirth`(→age), `gender`, `balance` all exist and are buildable. Do NOT ship dead columns. Adding any of the missing fields is backend/DTO work, not DS2.
- **Form field-name mismatch**: our schema has a single `fullName` (not separate Ism/Familiya like the mock). The live required-field checklist must reflect actual fields — `fullName` + `phone` (DOB/gender are optional in `patientFormSchema`). Don't blindly copy the mock's Ism/Familiya/Telefon trio.
- **Filter pills semantics**: "Doimiy mijozlar"/"Qarzdorlar" in the mock are client-side over mock rows; our list is server-paginated. Real semantic filtering = functional change. Keep pills presentational and map only to API-backed `archived`; defer the rest.
- **Dark-mode contrast (DS0 lesson — CLI-80/CLI-255)**: tokens.css defines dark overrides for every token used here, incl. `--on-primary` (#04130f), `--text-on-danger` (#2a0f0d), `--violet` (#b093ee), `--danger-soft`, `--surface-2`, `--ink-3`. **Risk: the prototype hardcodes `color:#fff`** on the gradient avatars, the "!" badge, and (in the new-form allergy banner) the badge — `#fff` does NOT flip in dark mode. In our re-skin use `--on-primary` on the gradient avatar (teal-400 base in dark → needs dark text) and `--text-on-danger` on the danger badge, NOT literal `#fff`. Also re-check `--ink-3` on `--surface-2` column headers and disabled Save (`--ink-3` on `--border-strong`) for AA in both themes. This is exactly the CLI-80/255 trap — verify every on-tinted text combo in dark mode.
- **Form validation display (CLI-179)**: the `error` prop wiring on `Input`/`Select` is already correct and **must survive** the re-skin — errors must render as **text**, not only a border colour. The mock shows only `*` markers + a checklist; do not regress to border-only. The live checklist is additive UX, not a replacement for text errors.
- **Empty states**: prefer keeping the locked `StateView` primitive (DS0) and feeding DS2 copy/icon/action rather than hand-rolling an inline empty block, unless `StateView` can't express the in-card 54×54 tile + CTA — then localise the deviation. Don't fork the primitive.
- **`max-width:1140px`** on the new-patient view and the **sticky rail (`position:sticky; top:0`)** depend on the DS0 shell's scroll container; verify the rail actually sticks within the content area (not the viewport) before committing the layout.
- **Pagination**: design mock omits pagination; our list genuinely paginates. Keep the real `Pagination` control (functional), restyle if needed — do not drop it to match the static mock.
