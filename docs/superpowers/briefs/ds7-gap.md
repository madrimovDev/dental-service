# DS7 — Clinic ops gap brief

**Milestone:** DS7 — Clinic ops (treatment plans table, lab orders, doctor schedule, recall)
**Foundation:** DS0 done (tokens.css, shell, primitives locked). DS7 re-skins only the ops screens. Functionality / API / i18n / permissions unchanged (Qaror #33).
**Design source:** `tool-results/toolu_01GKUFvM7wVKLrAXM5m5CcRj.txt` (Dental OS `.dc.html` createElement dump). Sections read: `scrPlans` / `scrLab` / `scrSchedule` / `scrRecall` + `scheduleGrid()`, `chip()`, `bar()`, `TONES`, and the seed data arrays.

> ⚠️ **Headline — read first.** The design depicts MORE than the current code does on **all four** screens. DS7 cannot be executed as a pure four-screen token re-skin. Two of the four design screens (**Plans table**, **Lab table**) are **cross-patient tenant-wide list screens that do not exist in code at all** — only patient-card tabs exist (DS3-owned), and there is no tenant-wide API to feed a standalone list. The **Schedule** design is a read-only week grid; current code is a segment editor (no grid component). The **Recall** design adds 4 KPI cards + an **SMS delivery-status** column for which there is **no data field and no aggregate endpoint**. Each gap below is partitioned into **[re-skin: safe under #33]** vs **[net-new structure/data: exceeds #33, needs sign-off]**.

---

## 1. Design summary (4 screens)

### Shared tokens (light values, from `:root`)
| Token | Value | Used for |
|---|---|---|
| `--primary` / `--primary-soft` / `--on-primary` | `#0B7A6B` / `#DDEFEA` / `#FFFFFF` | primary buttons, work blocks, active chip |
| `--danger` / `--danger-soft` | `#CC3D3A` / `#FBE7E5` | vacation blocks (dashed), expense amounts |
| `--warning` / `--warning-soft` | `#B57611` / `#F7ECD6` | "Bajarilmoqda" / "Ishlanmoqda" status chip, "Ertaga" due chip |
| `--info` / `--info-soft` | `#2A66CC` / `#E2EAFB` | "Taklif qilingan" plan status chip |
| `--success` / `--success-soft` | `#0B7A6B` / `#DDEFEA` (= primary) | "Tugatildi", recall conversion %, "SMS yuborildi" |
| `--violet` / `--violet-soft` | `#7C4DD6` / `#ECE4FB` | (staff avatars; not in DS7 tables) |
| `--ink` / `--ink-2` / `--ink-3` | head/body/muted text | cells, labels |
| `--surface` / `--surface-2` / `--border` | card bg / row-hover + header strip / hairline | every card |
| `--mono` | mono font | tooth no., balance, dates, KPI numbers |
| `--shadow-sm` | `0 1px 2px …` | card elevation |
| radius | card `16px`, chip `999px`, button `8–10px`, block `7px`, bar `99px` | |

**`chip(text, tone)` (shared status pill):** `inline-flex; gap:6; padding:3px 9px; border-radius:999; font-size:11.5; font-weight:600; color:var(fg); background:var(bg)` where `[fg,bg]` comes from `TONES[tone]`. `TONES`: `success/danger/warning/info/primary/violet` → `[--X, --X-soft]`, `muted` → `[--ink-3, --surface-2]`. Optional pulsing `dot`.

**`bar(pct, tone)` (progress bar):** track `height:8; border-radius:99; background:var(--surface-2); overflow:hidden`; fill `width:pct%; height:100%; border-radius:99; background:var(tone-fg)` (solid, single color — no gradient).

### Screen A — Treatment plans table (`scrPlans`)
Single card, header "Faol davolash rejalari" + meta "4 ta reja · 3 doktor". CSS-grid table (NOT Mantine Table), header strip `background:var(--surface-2)`, uppercase 11px labels. Columns:
`minmax(0,1fr) | minmax(0,1.4fr) | 150px | minmax(0,1fr) | 150px | auto` =
**Bemor | Reja | Bosqichlar | Doktor | Balans(right) | Holat(right)**.
Each row `cursor:pointer`, hover `background:var(--surface-2)`, click → open patient. "Bosqichlar" cell = mono "2/4" + `bar(pct, primary)` side by side. Balans = mono. Holat = `chip` (warning="Bajarilmoqda", info="Taklif qilingan", success="Tugatildi"). **Data is cross-patient** (rows from different patients & doctors).

### Screen B — Lab orders table (`scrLab`)
Single card, header "Laboratoriya buyurtmalari" + primary "＋ Yangi buyurtma" button. CSS-grid table, columns:
`70px | minmax(0,1.2fr) | minmax(0,1.2fr) | minmax(0,1fr) | 110px | auto` =
**Tish | Ish turi | Material · rang | Bemor | Muddat | Holat(right)**.
Tish = mono bold; Material·rang = "Vita A2 · zirkoniy"; Muddat = mono "28-iyun"; Holat = `chip` (warning="Ishlanmoqda" etc.). **Data is cross-patient** (Bemor is a column).

### Screen C — Doctor schedule week grid (`scrSchedule` + `scheduleGrid()`)
Header "Doktor jadvali" / "Haftalik ish vaqti · availability". Right controls: **segmented doctor switcher** (3 pills in `--surface-2` track, active pill = `--surface` + `--shadow-sm`) + primary "📋 Ish vaqtini tahrirlash" button. Body = **read-only horizontal week grid**:
- 7 day rows (Dushanba…Yakshanba), label col `width:96`, timeline `flex:1; height:38; background:var(--surface-2); border-radius:8`.
- Time axis header 08:00→18:00 (mono 10.5px), window `sM=480, span=600` (08:00–18:00).
- **Work block:** `position:absolute; background:var(--primary-soft); border:1px solid var(--primary); border-radius:7; color:var(--primary)`; shows "09:00–13:00" if wide enough.
- **Vacation/busy block:** `background:var(--danger-soft); border:1px dashed var(--danger); color:var(--danger)` (tone `danger`), or `muted` (`--surface-2` + `--ink-3`) for full day-off.
- **Legend** (3 swatches 14×14 radius-4): Ish vaqti (primary-soft+primary solid), Band/ta'til (danger-soft+danger dashed), Bo'sh (surface-2+border).

### Screen D — Recall (`scrRecall`)
**4 KPI cards** (`grid repeat(4,1fr)`), each `surface` card 16×18 pad: uppercase 11.5px label + mono 26px number.
- Bugun chaqirish = `12` (primary) · Bu hafta = `38` (ink) · Javob bergan = `24` (ink) · Konversiya = `63%` (success).
Below, single card, header "Bugun chaqirish kerak" + refresh icon. CSS-grid table, columns:
`minmax(0,1.3fr) | minmax(0,1.4fr) | 130px | 130px | 150px | auto` =
**Bemor | Sabab | Muddat | So'nggi tashrif | SMS holati | Actions(right)**.
- Muddat = `dueChip` (`chip`: Bugun=primary, Ertaga=warning, else muted).
- So'nggi tashrif = mono date.
- **SMS holati = `smsChip`** with **SMS-delivery semantics**: "SMS yuborildi"=success, "Kutilmoqda"=muted, "Javob keldi"=primary.
- Actions = primary "Yozish" + outline "Bekor".

---

## 2. Current state (files, components, hooks)

### DS7-OWNED files (re-skin targets)
| Screen | File | Notes |
|---|---|---|
| Schedule | `apps/web/src/features/schedule/components/ScheduleScreen.tsx` | Page: `PageHead` + doctor/branch `Select` + **pill Tabs** (hours/timeoff). NOT a grid. |
| Schedule | `apps/web/src/features/schedule/components/WeeklyHoursEditor.tsx` | Per-weekday `TimeInput` segment editor (add/remove/save). |
| Schedule | `apps/web/src/features/schedule/components/TimeOffList.tsx`, `TimeOffForm.tsx` | Time-off CRUD. |
| Schedule | hooks: `schedule.api.ts` → `useWorkingHours`, `useSaveWorkingHours`; mappers `groupSegmentsByWeekday`/`toPutSegments`. | |
| Recall | `apps/web/src/features/recalls/components/RecallDashboard.tsx` | Mantine `Table` (NOT CSS-grid). Cols: Bemor / Telefon / Sabab / Muddat / **Status** / Actions. Uses `StatusPill`, `Mono`. Actions: contacted / schedule / dismiss. |
| Recall | `RecallNavBadge.tsx` (count badge) | |
| Recall | hooks: `recalls.api.ts` → `useRecalls({date})`, `useMarkRecallContacted`, `useUpdateRecall`; mappers `isOverdue`/`recallReasonLabelKey`/`recallStatusLabelKey`. | |

### DS3-OWNED files — patient-card tabs (DO NOT TOUCH in DS7)
These are `(patientId)`-scoped tab components inside the patient card; DS3 owns clinical tabs. They are the **only** existing implementation of treatment-plans & lab-orders UI:
- `apps/web/src/features/clinical/components/treatment-plans/TreatmentPlansTab.tsx` (+ `PlanCard.tsx`, `StageRow.tsx`, `PlanFormModal.tsx`, `EstimateView.tsx`)
- `apps/web/src/features/clinical/components/lab-orders/LabOrdersTab.tsx`
- plus odontogram / visit-notes / prescriptions / consent / images tabs (also DS3).

### What does NOT exist
- **No standalone Plans list screen, no standalone Lab list screen, no route.** Nav has `{key:'plans', path:'/plans', disabled:true}`, `{key:'lab', path:'/lab', feature:'labOrders', disabled:true}`, `{key:'rx', disabled:true}` in `apps/web/src/shell/nav-config.ts` — **disabled placeholders** added in DS0's nav superset. `app/routes.tsx` registers no element for `/plans` or `/lab`.
- **No tenant-wide / cross-patient list API.** `clinical.api.ts` exposes only `useTreatmentPlans(patientId)` and `useLabOrders(patientId)`. Backend `GET /treatment-plans` **requires** `patientId` query (`treatment-plans.routes.ts:51`, `medical_record.view`); lab-orders likewise patient-scoped.
- **No SMS delivery-status field.** `RecallDto` (generated) has `status` (workflow: pending/contacted/scheduled/dismissed), `contactAttempts`, `lastContactedAt` — but **no per-message delivery state** (yuborildi/kutilmoqda/javob keldi). No "So'nggi tashrif" field either (`dueDate` exists; last-visit date does not).
- **No recall KPI aggregate endpoint/hook** (no Bugun/Bu hafta/Javob bergan/Konversiya stats).
- **No schedule read-grid component.**

---

## 3. Gap list (visual deltas)

**Schedule — `ScheduleScreen.tsx` + `WeeklyHoursEditor.tsx`**
- G1 [re-skin]: Header uses `PageHead`; design wants inline title + subtitle "availability" + right-aligned control cluster. Doctor selection is a `Select`; design wants a **segmented pill switcher** (`--surface-2` track, active = surface + shadow). *(Pill switcher is a structural-ish change but token/layout-level, no new data.)*
- G2 [NET-NEW]: Design's primary body is a **read-only week grid** (absolute-positioned work/vacation blocks + time axis + legend). Current body is the editor (`TimeInput` rows). The grid is a new view; the editor belongs behind the "Ish vaqtini tahrirlash" button. **No grid component exists.**
- G3 [re-skin]: When/if the editor stays, its `TimeInput` rows + add/remove/save can take token styling, but visually they are not in the design's default screen.

**Recall — `RecallDashboard.tsx`**
- G4 [NET-NEW data]: 4 KPI cards (Bugun chaqirish / Bu hafta / Javob bergan / Konversiya). No data source; needs aggregate endpoint or client-side derivation (and "Konversiya"/"Javob bergan" have no field today).
- G5 [NET-NEW semantics]: design column **"SMS holati"** (delivery: yuborildi/kutilmoqda/javob keldi) ≠ current **"Status"** column (recall workflow). `RecallDto` carries no SMS-delivery field. Also design column **"So'nggi tashrif"** (last-visit date) has no field. Current "Telefon" column is absent from the design.
- G6 [re-skin]: Table swap — design is a **CSS-grid table** with `--surface-2` header strip + uppercase labels + `chip`/`dueChip`/`smsChip`; current is Mantine `<Table>` + `StatusPill`. A token re-skin of the existing columns (Bemor/Sabab/Muddat/Status/Actions) is achievable; mapping current `status` → design tones (Bugun/Ertaga due chip via `isOverdue`/`dueDate`) is straightforward.
- G7 [re-skin]: Action buttons — current `light`/`subtle` Mantine Buttons → design primary "Yozish" + outline "Bekor". Token/variant pass.

**Plans table — design `scrPlans`**
- G8 [NET-NEW screen+API]: Standalone cross-patient table does not exist. Requires (a) a new tenant-wide list API/hook, (b) a new screen + route, (c) enabling the `/plans` nav item. Progress bar `bar(pct, primary)` + stage "2/4" mono + status `chip` are new presentation. **Exceeds #33.**

**Lab table — design `scrLab`**
- G9 [NET-NEW screen+API]: Standalone cross-patient lab table does not exist. Same shape as G8 — new tenant-wide list API/hook + screen + route + enable `/lab` nav. Tooth/work/material·rang/Bemor/Muddat/Holat columns. **Exceeds #33.**

---

## 4. Tasks proposed (disjoint leaf tasks)

**Bucket 1 — pure re-skins (safe under #33, do these as DS7 proper):**

- **T1 — Schedule screen re-skin (no grid).** Re-skin `ScheduleScreen.tsx` header (inline title+subtitle), convert doctor selector to segmented pill switcher, token-pass the editor (`WeeklyHoursEditor.tsx`, `TimeOffList/Form`). Keep editor functionality. Files: `features/schedule/components/*`. (If T3 grid is approved, the editor moves behind the edit button; otherwise editor stays as default.)
- **T2 — Recall table re-skin (existing columns only).** Re-skin `RecallDashboard.tsx`: CSS-grid table look (surface-2 header strip, uppercase labels), map `status`→`chip` tones, `dueDate`/`isOverdue`→`dueChip` (Bugun/Ertaga/muted), action buttons → primary "Yozish" + outline "Bekor". Keep current columns (Bemor/Telefon/Sabab/Muddat/Status/Actions) and all handlers. Files: `features/recalls/components/RecallDashboard.tsx`.

**Bucket 2 — net-new / data-dependent (EXCEEDS #33 — flag for sign-off before building):**

- **T3 — Schedule read-only week grid (net-new view).** New component `WeekScheduleGrid.tsx` rendering `useWorkingHours` + time-off as absolute blocks (work=primary-soft, vacation=danger-soft dashed) + legend. Set as default body; editor behind "Ish vaqtini tahrirlash". New file, no new API (reuses existing hours/timeoff hooks). **Decision needed: is this in DS7 scope or deferred?**
- **T4 — Recall KPI cards + SMS-status column (net-new data).** Needs a recall stats endpoint (or client derivation) for 4 KPIs, and an SMS-delivery field on recall (or remap to notification log). **Blocked on data model decision — likely deferred to a backend milestone; do NOT fake.**
- **T5 — Standalone Plans table screen (net-new screen+API).** New tenant-wide list endpoint/hook + new `PlansListScreen.tsx` (NEW file in `clinical/`, file-disjoint from `TreatmentPlansTab.tsx`) + `/plans` route + enable nav. CSS-grid table with `bar()` progress. **Exceeds #33 — needs scope sign-off.**
- **T6 — Standalone Lab table screen (net-new screen+API).** New tenant-wide lab list endpoint/hook + new `LabListScreen.tsx` (NEW file in `clinical/`, disjoint from `LabOrdersTab.tsx`) + `/lab` route + enable nav. **Exceeds #33 — needs scope sign-off.**

**T7 — i18n keys (SERIAL — run last, not in parallel).** Any new label keys (KPI labels, grid legend, new column heads, pill switcher) → add to `packages/i18n` `uz.json` + `ru.json` in parity. ⚠️ **Serialize:** i18n files are shared; concurrent edits collide (CLI-182 / DS-wide i18n parity rule). One task, after T1–T6 land their key needs.

> Recommended DS7 minimal scope = **T1 + T2 (+ T7)** as pure re-skin. T3 is a reasonable stretch (new view, no API). **T4/T5/T6 should be split out** — they are net-new product surface, not re-skin, and contradict #33 unless explicitly re-scoped.

---

## 5. Risks / notes

- **DS3/DS7 file boundary in `clinical/`:** DS7 must **not** edit `TreatmentPlansTab.tsx`, `LabOrdersTab.tsx`, `PlanCard.tsx`, `StageRow.tsx`, `PlanFormModal.tsx`, `EstimateView.tsx` or any other patient-card tab — those are DS3-owned. Any new standalone plans/lab screens (T5/T6) must be **NEW files** (`PlansListScreen.tsx` / `LabListScreen.tsx`) so the two milestones stay file-disjoint. Same `clinical.api.ts` would gain a new hook (additive, low conflict) — coordinate if DS3 is in flight.
- **SMS-status semantics (pre-flagged):** The design's "SMS holati" is **message-delivery** state, semantically distinct from the existing recall **workflow** `status`. Do not relabel `status` as "SMS holati" — that would mislead. Resolving G5/T4 requires either a notification-delivery field on recall or joining a notification log; defer rather than misrepresent.
- **Dark-mode contrast (DS0 lesson):** every token remap must re-check dark-mode contrast (CLI-80 / CLI-255 regression: dark `--text-on-danger` dropped, broke WCAG AA). The `--danger` dashed vacation blocks and `--on-primary` button text in dark block must be verified. Chips use `--X-soft` backgrounds with `--X` foreground — confirm contrast holds in dark `:root`.
- **#33 pixel-parity-with-function-preserved** is violatable here: the design draws screens/data that don't exist. Treat the design as the visual target for screens that DO exist (schedule editor, recall table) and as a **product spec proposal** for the rest — surface that distinction to the user before building T3–T6.
- **CSS-grid vs Mantine Table:** design tables are raw CSS-grid (`display:grid; grid-template-columns:…`), not `<Table>`. Re-skin can either restyle Mantine Table to match or rebuild as grid; rebuilding risks regressions in sort/scroll/hover — prefer restyling unless grid-specific layout (right-aligned cols, header strip) forces a rebuild.
- **Verification:** role-by-role (NOT `@owner`) for any permission-gated screen (recall.view/manage, schedule.view/manage) — the recurring RBAC-gap lesson. Schedule/recall nav items are permission-gated already; plans/lab nav are disabled+feature-gated.

---

**Written:** `/home/madrimov/Projects/dental-service/docs/superpowers/briefs/ds7-gap.md`
