# DS3 — Bemor kartasi (8 tab + odontogram + SOAP) — Design vs Current-Code Gap Brief

> Milestone: **DS3** (Linear CLI-264) — the LARGEST Dental OS pixel-parity milestone.
> Scope rule (Qaror #33): re-skin only. **Functionality / API / RLS / i18n semantics / permissions / enums UNCHANGED.** DS0 foundation (tokens.css, shell, primitives) is LOCKED — DS3 consumes it, never edits it.
> Design source: `…/tool-results/toolu_01GKUFvM7wVKLrAXM5m5CcRj.txt` (claude.ai/design "Dental OS.dc.html", patient view).
> Code: `apps/web/src/features/patients/` (header + tab shell) and `apps/web/src/features/clinical/` (clinical tab bodies).

---

## 0. Two framing locks (read first — these gate the whole brief)

**Lock A — the design shows 8 tabs; the code has 12. We do NOT delete or merge tabs.**
The mockup is a *visual-language sample*, not the target tab spec. The code's 12 tabs are each backed by real features + permissions. DS3 keeps all 12 and applies the design's card/table/grid idiom to them. The 4 tabs not in the mockup (consent, recall, family + the gen/med split) inherit the same Paper+token treatment. 12→8 is a **noted decision point feeding the split question (§4)**, never a removal task.

**Lock B — the odontogram re-skin maps the design's visual treatment onto the EXISTING `ToothState` enum. It does NOT adopt the design's 8-status set.**
Design `STATUS` has `watch`/"Kuzatuv" which has **no enum backing** (adding it = forbidden API change). Code enum has `to_extract`, `temporary`, `veneer` which have **no design color** (the brief assigns tokens for them — see §1 mapping table). This table is the load-bearing artifact of the brief.

---

## 1. Design summary

### Header (custom card — NOT `PageHead`)
`PageHead` is a locked DS0 primitive; the design header is a bespoke feature-level card:
- Container: `var(--surface)` bg, `1px solid var(--border)`, `border-radius:18px`, `box-shadow:var(--shadow-sm)`, `overflow:hidden`.
- Top row `padding:20px 22px`, `gap:18px`, `flex-wrap`:
  - **Avatar 60×60**, `border-radius:16px`, `background:linear-gradient(135deg,var(--primary),var(--violet))`, white initials `font-weight:800; font-size:21px`.
  - **Name** `<h1>` `font-size:22px; font-weight:800; letter-spacing:-.02em; color:var(--ink)`.
  - **Code chip** mono, `#{{code}}`, `font-size:12px`, `background:var(--surface-2)`, `1px solid var(--border)`, `border-radius:7px`, `padding:2px 8px`.
  - **Tag pill** "★ Doimiy mijoz" `color:var(--primary)`, `background:var(--primary-soft)`, `border-radius:99px`, `padding:3px 10px`.
  - **Meta row** (`margin-top:7px`, `font-size:12.5px`, `color:var(--ink-3)`): `age · gender` | `phone` | `Manba: source` | `Keyingi tashrif: <b>nextVisit</b>`, separators are `|` in `var(--border-strong)`.
  - **Balance block** (`margin-left:auto`): label "Balans · qarz" uppercase `11px var(--ink-3)`; amount mono `21px font-weight:600 color:var(--danger)` + "so'm" suffix; **"To'lov qabul qilish" button** `height:40px`, `var(--primary)` bg, `var(--on-primary)` text, `border-radius:10px`.
- **Allergy bar** (always-on strip below header): `padding:12px 22px`, `background:var(--danger-soft)`, top border `color-mix(in srgb, var(--danger) 22%, transparent)`. `!` badge 30×30 `var(--danger)` bg white. Text `Allergiya — {sev}: {text}` (`var(--danger)` bold label + `var(--ink)` body). Right pill "Anesteziyadan oldin tasdiqlang".

### Tab bar
`display:flex; gap:2px; border-bottom:1px solid var(--border); overflow-x:auto`. Active tab: `color:var(--ink); font-weight:700` + 2.5px `var(--primary)` underline pill (`bottom:-1px`). Inactive: `color:var(--ink-3); font-weight:600`, hover→`var(--ink)`. `padding:11px 15px; font-size:13.5px`.
Design `PTABS` (8): `odontogram` "Tish kartasi", `plan` "Davolash rejasi", `visits` "Vizitlar", `umumiy` "Umumiy", `retsept` "Retsept", `lab` "Lab", `rasmlar` "Rasmlar", `moliya` "Moliya".

### Tab 1 — Odontogram "Tish kartasi" (most complex — near-total rewrite)
Two-column flex: **chart card** (`flex:1 0 500px`, radius 16, shadow-sm, padding 18) + **detail panel** (`flex:1 0 280px; max-width:340`).

**Status palette (design `STATUS`, token-based):**

| design key | label (uz) | token | tone (chip) |
|---|---|---|---|
| healthy | Sog'lom | `--ink-3` (swatch uses `--surface-2`) | muted |
| caries | Kariyes | `--danger` | danger |
| filling | Plomba | `--info` | info |
| crown | Koronka | `--warning` | warning |
| root | Ildiz davolash | `--primary` | primary |
| implant | Implant | `--violet` | violet |
| missing | Olib tashlangan | `--ink-3` (rendered as `--surface-2` + diagonal X) | muted |
| watch | Kuzatuv | `--warning` (rendered as `--surface` + dashed warning rect) | warning |

**Surface model:** each tooth = SVG (default 30px in arch, 108px in detail, 34px base). 5 surface paths via FDI-style trapezoids: `B`(buccal, top), `D`(distal, right), `L`(lingual, bottom), `M`(mesial, left), `O`(occlusal, center square). `surfFill()` returns `var(STATUS[s].color)` or `var(--surface)`; `whole:missing`→`--surface-2`+diagonal line, `whole:watch`→`--surface`+dashed warning rect. Stroke `var(--border-strong)` 0.8. Selected tooth: `box-shadow:0 0 0 2.5px var(--primary)`. Arch curvature: upper teeth offset up (`amp*t*t`), lower offset down, midline gap after index 8. FDI number label mono `10–10.5px`, selected→`var(--primary)` weight 700.
Arch layout: row labels "O'ng · yuqori"/"Chap · yuqori" uppercase `10.5px var(--ink-3)`, UPPER arch, 1px `var(--border)` midline, LOWER arch, bottom labels. Legend top-right (each non-healthy status: 11×11 swatch + label `11.5px var(--ink-2)`).

**Tooth detail modal/panel** (right column, `align-self:flex-start`):
- Header: FDI number mono `30px`, quadrant label (e.g. "Yuqori o'ng"), status chip.
- Big tooth SVG 108px centered.
- "Yuzalar" list: 5 rows B/M/O/D/L (`Bukkal (B)` … `Lingval (L)`), each `7px 0`, top-border `var(--border)`, status chip or "Sog'lom".
- Note box `var(--surface-2)`, radius 10, `12.5px var(--ink-2)`.
- **Editor** ("Yuzani tanlang" + "Holatni belgilang"): `surfPicker` = `[whole|B|M|O|D|L]` toggle buttons (height 30, active→`var(--primary-soft)`+`var(--primary)` border, mono for surface letters); `statusPalette` = 8 status buttons (height 30, swatch + label, `setToothStatus`).

### Tab 2 — Plan "Davolash rejasi"
2-col grid `minmax(0,1fr) 300px`. Left: card with header ("Davolash rejasi · 2026" + "N bosqich · M doktor"), table header row `34px 1fr 56px auto auto` (`# / Bosqich / Tish / Narx / Holat`, uppercase 11px), stage rows with status chip + acceptance chip, mono cost/tooth. Right: "Moliyaviy xulosa" card — Jami reja / To'langan(`--success`) / Qoldiq(`--danger`), progress bar (`linear-gradient(90deg,var(--primary),var(--primary-strong))`), "Reja PDF · konsent" button.

### Tab 3 — Visits "Vizitlar" (SOAP)
Header "Vizit yozuvlari · SOAP" + "Yangi vizit" primary button. Each visit = card (radius 16, shadow-sm, padding 18): tooth icon chip 34×34 `var(--primary-soft)`, title + `date · doctor`, dx chip (`violet`). **SOAP grid 2×2**: S(`--primary`), O(`--info`), A(`--violet`), P(`--warning`) — each cell `var(--surface-2)`, radius 10, mono letter + body `12.5px var(--ink-2)`.

### Tab 4 — Umumiy "Umumiy" (general; 3 cards)
`grid repeat(3,1fr)`: **Aloqa** (Telefon mono / Telegram / Manzil), **Tibbiy ma'lumot** (Qon guruhi mono / Surunkali / Allergiya in `--danger`), **Tashriflar** (So'nggi / Keyingi in `--primary` / Birinchi manba). Each card radius 16, padding 18, uppercase section title `11px var(--ink-3)`, field label `11.5px var(--ink-3)` + value.

### Tab 5 — Retsept "Retsept" (rx grid)
`grid repeat(3,1fr)`. Header bar "Faol reseptlar" + "Resept chop etish" primary button. Each rx = card radius 14: pill icon chip 32×32 `var(--info-soft)`/`var(--info)`, med name, rows Doza/Qabul/Davomiylik(mono), note footer `11.5px var(--ink-3)` top-bordered.

### Tab 6 — Lab "Lab" (table)
Single card radius 16. Header "Laboratoriya buyurtmalari". Table grid `40px 1fr 1fr 90px auto` (`Tish / Ish turi / Material · rang / Muddat / Holat`). Tooth mono, deadline mono, status icon right-aligned.

### Tab 7 — Rasmlar "Rasmlar" (4-grid + upload)
`grid repeat(4,1fr)`. Each thumb `aspect-ratio:4/3`, radius 14, `var(--surface-2)` bg, image icon + caption `12px`. Last cell = dashed upload tile (`1.5px dashed var(--border-strong)`, hover→`var(--primary)`), plus icon + "Rasm yuklash".

### Tab 8 — Moliya "Moliya" (txn history)
Single card radius 16. Header "To'lov tarixi" + "Joriy balans: −{amount} so'm" (`--danger` mono). Each txn row `14px 18px` top-bordered: date mono, desc, method, amount.

---

## 2. Current state (tab → file(s) + hooks)

**Shell/header:** `apps/web/src/features/patients/components/PatientCard.tsx`
- Uses locked `PageHead` primitive for header (`Avatar size="lg"`, `Mono` phone subtitle, `BalanceBadge`). **No** gradient avatar, code chip, tag pill, meta row, balance block, or pay button.
- Allergy = `Mantine <Alert color="red" variant="filled">` rendered **conditionally** (only `severity==='severe' && type==='anesthetic'`), not an always-on bar.
- Tab bar = `@dental/ui` `<Tabs>` primitive (DS0-themed).
- **12 tabs** (`TABS` array): `gen, med, odo, plan, vis, rx, img, lab, cons, rec, fam, pay`. Vertical-gating via `filterPatientTabs(TABS, hasPermission, vertical)` (`visible-tabs.ts`): `odo` gated on `feature:'odontogram'`, `lab` on `feature:'labOrders'` (uses `useVertical()`). **Preserve this gating untouched.**
- Hooks: `usePatient`, `useMedicalRecord`, `usePatientBalance`.

| design tab | current tab(s) | file(s) | data hooks |
|---|---|---|---|
| odontogram | `odo` | `clinical/components/odontogram/OdontogramTab.tsx` + `Odontogram.tsx` + `ToothCell.tsx` (+`.module.css`) | `useLatestToothChart`, `useToothChartHistory`, `useDiagnoses`, `useCreateToothChart` |
| plan | `plan` | `clinical/components/treatment-plans/TreatmentPlansTab.tsx` + `PlanCard`, `StageRow`, `EstimateView`, `PlanFormModal` | `useTreatmentPlans`, `useCreatePlan`, `useUpdateStage`, `useUpdateStageAcceptance`, `useAcceptAllStages`, `useSignPlanConsent`, `useUpdatePlanStatus` |
| visits | `vis` | `clinical/components/visit-notes/VisitNotesTab.tsx` + `VisitNoteCard`, `VisitNoteFormModal` | `useVisitNotes`, `useDiagnoses`, `usePatientAppointments`, `useCreateVisitNote` |
| umumiy | `gen` (+ `med`) | `patients/components/tabs/GeneralTab.tsx`, `MedicalTab.tsx` | `usePatientRaw`, `useUpdatePatient`; medical hooks |
| retsept | `rx` | `clinical/components/prescriptions/PrescriptionsTab.tsx` | `usePrescriptions`, `useCreatePrescription` |
| lab | `lab` | `clinical/components/lab-orders/LabOrdersTab.tsx` | lab-order hooks |
| rasmlar | `img` | `clinical/components/images/PatientImagesTab.tsx` + `ImageCard`, `ImagePreviewModal`, `ImageUploadModal` | patient-image hooks (upload = multipart hand exception) |
| moliya | `pay` | `patients/components/tabs/PaymentsTab.tsx` | balance/txn hooks |
| (no design tab) | `cons` | `clinical/components/consent/ConsentTab.tsx` | consent hooks |
| (no design tab) | `rec` | `patients/components/tabs/RecallTab.tsx` | recall hooks |
| (no design tab) | `fam` | `patients/components/tabs/FamilyTab.tsx` | emergency-contact hooks |

**Tokenization status (spot-checked TreatmentPlansTab, VisitNotesTab, GeneralTab, PrescriptionsTab):** all use `@dental/ui` primitives (`Card`, `StateView`, `Mono`, `Input`, `Select`, `Button`) + Mantine `Stack/Group/Title/SimpleGrid` — already teal-themed by DS0. These are **layout-only deltas** (Mantine card idiom → design's specific grid/Paper layout + mono fields + table styling). The forms use `@mantine/form` + `zod4Resolver` (ConsentTab, PrescriptionsTab, LabOrdersTab, VisitNoteFormModal, PlanFormModal, ImageUploadModal). **The odontogram is the sole outlier** with hardcoded Material hex palette.

---

## 3. Gap list (concrete visual deltas)

**Header (`PatientCard.tsx`)** — largest non-odontogram gap:
- Replace `PageHead`-based header with a bespoke feature header card: gradient avatar 60px, code chip, tag pill, meta row with `|` separators, balance block (mono `--danger` amount) + "To'lov qabul qilish" button.
- Allergy: design is an **always-on bar** in the header card; code is a **conditional `Alert`** (severe anesthetic only). Decision: make it a styled persistent bar **but do not change what triggers/what data it shows** unless product confirms — keep the existing conditional logic; only re-skin the rendered element to the design's bar (it stays hidden when no severe allergy). Confirm with product whether the bar should render for non-severe allergies (that would be a behavior change → defer).

**Odontogram** (`Odontogram.tsx`, `ToothCell.tsx`, `ToothCell.module.css`) — near-total rewrite:
- `ToothCell` uses **hardcoded hex** (`#ffeb3b`, `#90caf9`, `#bcaaa4`…) + square button. Replace with token-driven SVG 5-surface tooth.
- `Odontogram` renders 4 flat quadrant `Group`s (no arch curvature, no surface rendering, no per-surface fill). Replace with curved UPPER/LOWER arches + midline + row labels + legend.
- No surface picker, no status-palette editor, no per-surface detail panel — the current editor is `Select(state)` + `Select(surface)` + `Select(diagnosis)` in `OdontogramTab`. Re-skin to the design's surfPicker + statusPalette + detail panel (FDI big number, quadrant, status chip, 5 surface rows, note box) **while keeping `useCreateToothChart`/draft/snapshot-history/diagnosis logic intact**.

**Status → enum reconciliation (mandatory; design 8 ↔ code 10):**

| code `ToothState` | design key | assigned token | swatch render |
|---|---|---|---|
| healthy | healthy | `--ink-3` | `--surface-2` |
| caries | caries | `--danger` | fill |
| filling | filling | `--info` | fill |
| crown | crown | `--warning` | fill |
| root_canal | root | `--primary` | fill |
| implant | implant | `--violet` | fill |
| missing | missing | `--ink-3` | `--surface-2` + diagonal X |
| to_extract | (none) | **assign `--danger`** (or a danger-strong variant) + distinct mark | needs token decision |
| temporary | (none) | **assign `--warning`** (or warning-soft) | needs token decision |
| veneer | (none) | **assign `--violet-soft`** / a distinct token | needs token decision |
| — | watch | **N/A — not in enum, do NOT add** | — |

> The 3 code-only states (`to_extract`, `temporary`, `veneer`) have no design color: the implementer must pick distinct tokens from the locked palette so all 10 enum legend entries render unambiguously. `watch` is design-only and must NOT be added (enum/API change forbidden).

**Surfaces:** design renders 5 (B/M/O/D/L). Code `SURFACE_OPTIONS = ['whole','M','D','B','L','O','I']` includes **`I` (incisal)** and `O` (occlusal). The new SVG must handle `whole`, the 5 design faces, **and `I`** (incisal — map onto the occlusal-center region or add a 6th face). Don't drop `I` from the surface picker.

**Plan tab:** current `PlanCard`/`StageRow` are card-list; design is a single table + side financial-summary panel. Layout delta only (re-skin to `34px 1fr 56px auto auto` grid + summary card + progress bar).

**Visits tab:** current `VisitNoteCard` exists; design wants the 2×2 SOAP grid with per-letter tokens (S=`--primary`, O=`--info`, A=`--violet`, P=`--warning`). Re-skin card body to the SOAP grid.

**Umumiy / general:** design's "Umumiy" = a read-only 3-card layout (Aloqa / Tibbiy / Tashriflar). Current `gen` is an editable form + `med` is separate. Re-skin `GeneralTab` to borrow the 3-card *visual* layout for read-only mode **without merging gen+med** (keep both tabs).

**Retsept / Lab / Rasmlar / Moliya:** layout-only re-skins to the design's grid/table/thumbnail idioms (rx 3-col card grid, lab 5-col table, images 4-grid + dashed upload tile, moliya txn-row card). All hooks/forms unchanged.

**Consent / Recall / Family:** not in mockup → inherit the same Paper+token+card idiom from sibling tabs (no new design spec; apply established patterns).

**Fonts:** design JSX uses `var(--mono)` and `var(--ui)` — these are **mockup-only aliases that do NOT exist in tokens.css**. The code vehicle is the locked `<Mono>` primitive / `--font-mono` (`"JetBrains Mono"…`) and the default UI font. **Do not invent `--mono`/`--ui` tokens.**

---

## 4. Proposed tasks (disjoint leaf tasks)

Recommend **splitting DS3 into 2 milestones** (per the roadmap open question, line 145). Grounds: the odontogram alone is a near-total rewrite (SVG 5-surface paths, arch curvature, surface picker, status-palette editor, detail panel) — milestone-sized by itself; pairing it with the other 11 tabs overloads one milestone.

**DS3a — Clinical-heavy (odontogram + clinical content tabs):**
1. **Header card** (`PatientCard.tsx`) — bespoke header + allergy bar re-skin (conditional logic preserved). *Touches the shared `PatientCard.tsx`; sequence before/after the tab-shell task to avoid conflict.*
2. **Tab shell / tab bar** (`PatientCard.tsx`) — re-skin the `<Tabs>` to the design's underline-pill bar; keep all 12 tabs + vertical-gating.
3. **Odontogram — arch + tooth SVG** (`Odontogram.tsx`, `ToothCell.tsx`, `.module.css`) — token palette + 5/6-surface SVG + curved arches + legend. *(Largest single task; own leaf.)*
4. **Odontogram — detail panel + editor** (`OdontogramTab.tsx`) — surfPicker + statusPalette + FDI detail panel; preserve draft/snapshot/diagnosis logic.
5. **Plan tab** (`TreatmentPlansTab` + `PlanCard`/`StageRow`/`EstimateView`) — table + financial-summary re-skin.
6. **Visits tab** (`VisitNotesTab` + `VisitNoteCard`) — 2×2 SOAP grid re-skin.
7. **Retsept tab** (`PrescriptionsTab`) — 3-col rx card grid.
8. **Lab tab** (`LabOrdersTab`) — 5-col table re-skin.

**DS3b — Admin tabs + images + finance:**
9. **Umumiy/general + medical** (`GeneralTab`, `MedicalTab`) — 3-card layout (no merge).
10. **Rasmlar tab** (`PatientImagesTab` + cards/modals) — 4-grid + dashed upload tile.
11. **Moliya/payments tab** (`PaymentsTab`) — txn-row card re-skin.
12. **Consent / Recall / Family** (`ConsentTab`, `RecallTab`, `FamilyTab`) — apply sibling card idiom.

**Serial i18n task (flag — do NOT parallelize):** any new keys (surface labels B/M/O/D/L/I, status legend labels, allergy pill "Anesteziyadan oldin tasdiqlang", balance label, source label, etc.) go in **one** serial task touching `packages/i18n/uz.json` + `ru.json`. Parallel leaf tasks collide on these shared files. **CLI-182 (Zod message i18n / global errorMap) stays deferred to DS11** — not in DS3 scope.

> If the split is rejected, run as a single DS3 milestone with tasks 1–12 + the i18n serial task; sequence header/tab-shell (both in `PatientCard.tsx`) to avoid file conflict.

---

## 5. Risks / notes

- **Odontogram complexity** is the dominant risk: SVG path math (trapezoidal surfaces, arch amplitude curve, midline gap), per-surface fill from the enum map, selection ring, primary-vs-permanent dentition, snapshot read-only mode. Keep all data/draft/history logic (`useCreateToothChart`, `toToothDraftMap`, snapshot viewing) untouched — re-skin only the render layer. Budget this as its own milestone-sized chunk (tasks 3+4).
- **Enum ≠ design palette (Lock B):** never add `watch`; always assign tokens for `to_extract`/`temporary`/`veneer`. Never widen `ToothState` or `ToothSurface` — those are hand-maintained enum types (per CLAUDE.md M3 notes), changing them is an API change.
- **Vertical-gating must survive:** `odo` (feature `odontogram`) and `lab` (feature `labOrders`) stay gated via `filterPatientTabs`/`useVertical()`. The re-skin must not bypass the gate (CLI-153/useVertical regression precedent — caught only by holistic review). Verify the gated tabs still 403-safe and hidden for `general` vertical.
- **Dark-mode contrast (DS0 lesson):** every token used in the odontogram (status swatches on `--surface`/`--surface-2`, `--danger`/`--warning`/`--violet` fills, selection ring) must be checked in both light and dark. DS0 had a `--text-on-danger` regression (WCAG AA). Tooth-status colors-on-dark and the allergy bar (`--danger-soft` bg + `--danger` text) are the highest-risk spots.
- **WCAG 1.4.1 (color-alone):** current `ToothCell` adds an `aria-label` "number — state". The SVG rewrite must keep status conveyed by more than color (label/tooltip/aria), and keep the legend.
- **Forms stay `@mantine/form` + `zod4Resolver`:** SOAP (VisitNoteFormModal), consent, rx, lab, plan, image-upload forms keep their resolver wiring; re-skin only presentation. Don't refactor form state.
- **Header is custom, `PageHead` is locked:** build the header as a feature component; do not edit the DS0 `PageHead` primitive.
- **`--mono`/`--ui` are mockup aliases:** use `<Mono>`/`--font-mono`; do not add those tokens to the locked tokens.css.
- **Evidence note:** design side read for all 8 tabs; current side fully read for odontogram, spot-checked (heads) for plan/visits/general/rx. The "already tokenized, layout-only" classification for the non-odontogram tabs is verified at the import/primitive level; per-tab pixel deltas should be confirmed against the running app during each leaf task.

---

_Brief written: `docs/superpowers/briefs/ds3-gap.md`. Read-only analysis; no source modified._
