# DS4 — Appointments / Scheduling Calendar — Design-vs-Code Gap Brief

Milestone: **DS4** (Dental OS pixel-parity re-skin). Scope: re-skin only the appointments
feature to match `Dental OS.dc.html`. Functionality / API / i18n keys / permissions
unchanged (Qaror #33). Foundation (tokens.css, shell, primitives) is locked (DS0 done).

Design source: `Dental OS.dc.html` (screen nav-key `'b'`, "Yozilish" / page title
"Boshqaruv paneli"→ appointments view). Calendar logic at byte ~212770 (`apptCalendar()`),
screen template at ~91542 (`scrAppt`), data `APPT_DOCS`/`WAITLIST` at ~209946.

Current code: `apps/web/src/features/appointments/`.

---

## 1. Design summary (calendar grid layout + per-component tokens/sizes)

### Page shell (template `scrAppt`, byte ~91542)
- Wrapper: `width:100%; animation:fadeUp .2s ease`.
- **Header row** (`display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-bottom:18px`):
  - **Date nav arrows**: two 34×34 buttons, `border:1px solid var(--border)`,
    `border-radius:9px`, `background:var(--surface)`, `color:var(--ink-2)`, icon `chevr`
    (left one `transform:rotate(180deg)`). Hover → `borderColor:var(--border-strong)`.
  - **Date title block**: `font-size:17px; font-weight:700; color:var(--ink)` ("21-iyun · Juma")
    over `font-size:12px; color:var(--ink-3)` subtitle ("13 ta yozilish · 3 doktor · Bosh filial").
  - **"Bugun" pill** (static, marks current day): `font-size:11.5px; font-weight:600;
    color:var(--primary); background:var(--primary-soft); border-radius:99px; padding:3px 10px`.
  - **Right cluster** (`margin-left:auto; gap:8px`):
    - **Day/Week segmented toggle**: outer `padding:3px; background:var(--surface-2);
      border-radius:10px; gap:2px`. Active button `height:30px; padding:0 13px; border-radius:7px;
      background:var(--surface); color:var(--ink); font-weight:600; font-size:12.5px;
      box-shadow:var(--shadow-sm)`. Inactive `background:transparent; color:var(--ink-3)`.
    - **"Yangi yozilish" button**: `height:38px; padding:0 14px; gap:7px;
      border:1px solid var(--primary); border-radius:10px; background:var(--primary);
      color:var(--on-primary); font-weight:600; font-size:13px`, leading `plus` icon.
      Hover → `background:var(--primary-strong)`.
- **Status-dot legend** (`display:flex; gap:16px; margin-bottom:14px`), each item
  `font-size:11.5px; color:var(--ink-2); font-weight:500`, 9×9 indicator:
  - **Tasdiqlangan (confirmed)**: filled dot `background:var(--ink-3)`.
  - **Kutilmoqda (pending)**: ring `border:2px solid var(--ink-3); box-sizing:border-box`.
  - **Qabulda (in_progress)**: filled dot `background:var(--warning); box-shadow:0 0 0 3px var(--warning-soft)`.
  - **Yakunlandi (done)**: `check` icon, `color:var(--ink-3)`.
  - Trailing italic hint (`margin-left:auto; color:var(--ink-3); font-style:italic`):
    "Yozuvni surib ko'chiring · bo'sh joyga bosib qo'shing".
- **Body layout**: `display:grid; grid-template-columns:minmax(0,1fr) 296px; gap:16px;
  align-items:start`. Left = calendar (`min-width:0; overflow-x:auto; border-radius:16px`),
  right = **296px rail**.

### Calendar grid (`apptCalendar()`, byte ~212770)
- Constants: `startH=8, endH=18, hourH=88, totalH=(18-8)*88=880`. Slots `30`-min (`halfs`).
  `toMin('HH:MM')` = h*60+m. Drag snaps to **15-min** (`Math.round(m/15)*15`).
- **Card container**: `background:var(--surface); border:1px solid var(--border);
  border-radius:16px; box-shadow:var(--shadow-sm); overflow:hidden; minWidth:580`.
- **Header strip** (`borderBottom:1px solid var(--border)`): 50px spacer gutter +
  per-doctor header cell (`flex:1 1 0; minWidth:160; borderLeft:1px solid var(--border);
  padding:10px 12px; gap:9`):
  - 30×30 avatar tile `borderRadius:9; background:var(<tone-soft>); color:var(<tone>);
    font-weight:700; font-size:11.5` with initials.
  - Name `font-weight:700; font-size:12.5; color:var(--ink)` + sub `font-size:10.5; color:var(--ink-3)`.
  - Count badge `font-family:var(--mono); font-size:11; font-weight:700; color:var(<tone>);
    background:var(<tone-soft>); border-radius:99; padding:1px 7px`.
- **Time gutter** (left, 50px wide): hour labels `position:absolute; top=(m-480)/60*88-7; right:9;
  font-size:10.5; font-family:var(--mono); color:var(--ink-3)` (`08:00`…`18:00`, hour rows only).
- **Doctor columns** (`flex:1 1 0; minWidth:160; height:880; borderLeft:1px solid var(--border);
  cursor:copy`). Each has:
  - **Grid lines** per 30-min: `height:1; background:var(--border)`; hour lines `opacity:1`,
    half-hour lines `opacity:.4`.
  - **Appointment blocks** (`top=(toMin(s)-480)/60*88 + 2; left:5; right:5; height=d/60*88 - 4;
    borderRadius:9; padding:5px 9px; boxShadow:var(--shadow-sm); overflow:hidden`):
    - Fill by **doctor tone** (not status): `background:var(<tone-soft>)`, `borderLeft:3px solid var(<tone>)`.
    - **`done`** state overrides: `background:var(--surface-2); opacity:.74`.
    - Top line: time+duration `font-family:var(--mono); font-size:10; font-weight:600; color:var(<tone>)`
      ("09:00 · 45daq") + status dot/check (see legend) right-aligned.
    - Patient name `font-weight:700; font-size:12; color:var(--ink)` (ellipsis).
    - Service line (only if `height>44`): `font-size:10.5; color:var(--ink-2)` (ellipsis).
- **Current-time red line** (`nowTop=(toMin('11:20')-480)/60*88`, `zIndex:6; pointerEvents:none`):
  - 2px bar `background:var(--danger)` spanning columns (left:50, right:0).
  - Time label badge `font-family:var(--mono); font-size:10; font-weight:700; color:#fff;
    background:var(--danger); border-radius:5; padding:2px 5px` at left gutter.
  - 9×9 dot `background:var(--danger)` at left edge. (Note: design's static dot has no pulse;
    pulse `animation:dotpulse` is used by the `in_progress` block dot and chip dots.)
- **Tones** (`TONES`): `primary`→`[--primary,--primary-soft]`, `info`, `violet`, `success`,
  `danger`, `warning`, `muted`→`[--ink-3,--surface-2]`. Design seeds 3 doctors:
  Karimova=primary, Saidov=info, Yusupova=violet.

### Right rail (296px, byte ~95558)
- **"Bugungi kun" 2×2 stats card** (`surface` card, `border-radius:16; box-shadow:var(--shadow-sm);
  padding:16px 18px`): title `font-size:13.5; font-weight:700`. Grid `1fr 1fr; gap:8`, each tile
  `background:var(--surface-2); border-radius:10; padding:11px 13px`, number
  `font-family:var(--mono); font-size:22; font-weight:600; line-height:1`, label
  `font-size:11; color:var(--ink-3)`. Tiles: Jami yozilish (`--ink`), Tasdiqlangan (`--success`),
  Kutilmoqda (`--warning`), Bo'sh slot (`--ink-3`).
- **"Kutish ro'yxati" (waiting list) card**: header `padding:14px 16px; borderBottom`,
  title + count badge (mono pill). Rows (`WAITLIST`, `padding:12px 16px; borderTop`): name +
  urgency `chip` (`danger` "Shoshilinch" / `muted` "Oddiy"), `svc · pref` line, and a full-width
  **"Slotga joylashtirish" button** (`height:32; border:1px solid var(--primary);
  border-radius:8; background:var(--primary-soft); color:var(--primary)`, hover → primary fill).
- (Design has no separate "doctor legend" card on this screen; doctor identity legend is the
  column headers themselves.)

---

## 2. Current state (files / components / hooks / paths)

Root: `apps/web/src/features/appointments/`

- **`components/CalendarScreen.tsx`** — page. `PageHead` (title + primary "Yangi yozilish"
  action, perm-gated `appointment.create`) → a flex row with a `Tabs variant="pill"` Day/Week
  toggle, a branch `Select`, and three `Button variant="default"` controls: `←`, "Bugun",
  `→` (raw arrow glyphs, no chevron icon). Body switches `CalendarGrid` (day) / `WeekGrid`
  (week) inside a `StateView` loading/error wrapper. Two Mantine `Modal`s: NewAppointmentWizard
  + appointment detail (read + cancel-with-reason). No date title/subtitle, no "Bugun" pill,
  no status legend, no right rail.
- **`components/CalendarGrid.tsx`** + **`CalendarGrid.module.css`** — day grid. Flex
  `.times` (56px gutter) + `.cols` (flex, `overflow-x:auto`). Per `.col`: `.colHead`
  (`Avatar size="sm"` + doctor name, centered, 40px, sticky) and `.colBody` with `.hourLine`
  rows (`height:40; border-bottom:1px dashed var(--border-subtle)`).
- **`components/AppointmentSlot.tsx`** — block `<button>`, `className=classes.slot`,
  `data-status={status}`. Positioned by `pos.top + 40 / pos.height / lane%`. Renders
  `slotTime` (mono) + patient name. Click → `onSlotClick` (opens detail modal).
- **`components/WeekGrid.tsx`** — same grid generalized to 7 day columns (`groupByDay`),
  reuses the CSS module + `AppointmentSlot`.
- **`appointments.types.ts`** — `GRID = { dayStartHour:8, dayEndHour:20, stepMin:30,
  pxPerMin:40/30 }`. (Note **end-hour 20**, **40px/hour-block**.) `CalendarEvent`, `SlotPosition`.
- **`appointments.mappers.ts`** — `localMinutes`/`localDateKey`/`localTimeLabel` (Asia/Tashkent),
  `toSlotPosition`, `assignLanes` (per-cluster overlap lanes), `groupByDoctor`/`groupByDay`.
  **Min slot height = `pxPerMin*10`.**
- **`appointments.api.ts`** — `useAppointments(range)`, `useDoctors`, `useServices`,
  `useBranches`, `useCreateAppointment`, `useCancelAppointment`.
- **`components/NewAppointmentWizard.tsx`** — wizard with **server-side conflict guard**:
  `useAvailability({doctorId,branchId,date,slotMinutes})` returns free `slots`; user picks a
  slot; create error → `t('appointments.conflict')`. The real overlap/business-hours guard
  lives HERE (server free-slots), not in the calendar grid.

### Status-color model (current) — CSS `.slot[data-status=…]`
Block colored **by status**: default `--primary-tint` bg + `--primary-hover` text + 3px
`--primary` border-left; `cancelled` → dim+`--surface-2`; `completed` → `--success`;
`no_show` → `--danger`. (No "doctor tone" coloring, no dot/check indicator.)

### Interaction (current)
Click block → opens read/cancel detail modal. **No drag-drop, no click-empty-to-add** in the
calendar (grep for `draggable`/`onDrag`/`onDrop`/`dataTransfer` = NONE). Creation is only via
the wizard modal.

---

## 3. Gap list (concrete visual deltas)

Grouped header / grid / blocks / rail. References file:line.

### Header (CalendarScreen.tsx)
- G1. **Date nav** is two `Button variant="default"` with raw `←`/`→` glyphs
  (`CalendarScreen.tsx:175,181`). Design = two 34×34 bordered icon-buttons with `chevr` icon
  (left rotated 180°), hover `border-strong`.
- G2. **No date title + subtitle block.** Design shows "21-iyun · Juma" (17px/700) over a
  "N ta yozilish · M doktor · Filial" subtitle (12px `--ink-3`). Current header has none.
- G3. **No "Bugun" current-day pill** (primary-soft chip). ("Bugun" today exists only as a
  reset `Button`, `CalendarScreen.tsx:178` — design's reset is the date-nav arrows; "Bugun" is
  a static state pill, semantically different.)
- G4. **Day/Week toggle**: current `Tabs variant="pill"` (`CalendarScreen.tsx:157`). Design =
  custom segmented control (surface-2 track, active surface tile + shadow-sm). Pill tabs are a
  different shape — re-skin or accept theme-convergent pill (decide; see Tasks).
- G5. **Branch Select** sits in the design's right cluster region but the design has NO branch
  Select on this screen (filial shown in subtitle text only). Keep the Select (functional
  filter) — just place/style consistently; do not remove.

### Calendar card + grid (CalendarGrid.tsx / .module.css / types.ts)
- G6. **Card chrome**: current grid uses `.grid` flat border + `--radius-lg`; design card adds
  `box-shadow:var(--shadow-sm)` and `border-radius:16px`, header strip with bottom border.
- G7. **Gutter width 56px** (`.times`, css:11) vs design **50px**; hour labels right-aligned
  `padding-right:8px` vs design absolute-positioned `right:9` with `-7px` vertical nudge.
- G8. **Hour-block height** 40px (`GRID.pxPerMin = 40/30`) vs design **88px/hour** (`hourH=88`).
  Blocks and grid are ~2.2× denser than design.
- G9. **Half-hour grid lines absent.** Current `.hourLine` draws only hour rows
  (`css:60`, dashed). Design draws a 1px line per 30-min, hour `opacity:1`, half `opacity:.4`,
  solid `--border` (not dashed).
- G10. **Column header**: current = centered `Avatar size="sm"` + name (`CalendarGrid.tsx:38`).
  Design = left-aligned 30×30 tinted initials tile + name(700/12.5) + sub(10.5) + mono count
  badge. Missing: specialty/cabinet sub, appointment count badge, tone-tinted tile.
- G11. **Column min-width** 120px (`css:37`) vs design **160px**.

### Appointment blocks (AppointmentSlot.tsx / .module.css)
- G12. **Color model differs (semantic remap, not a recolor).** Current colors the block by
  **status** (`.slot[data-status]`). Design colors by **doctor tone** (column identity:
  `--<tone>-soft` bg + `--<tone>` border-left), and conveys status via a **dot/check
  indicator** + dimming for `done`. Re-skin must (a) switch fill to doctor tone, (b) add the
  status dot/check, (c) dim+`surface-2` for completed. Design hardcodes 3 tones; production has
  N doctors → needs a **tone-cycling** strategy (e.g. index % tone-list).
- G13. **Block content**: current = `slotTime` + patient name only (`AppointmentSlot.tsx:29`).
  Design = mono "time · Ndaq" header row + status dot, bold patient name, and service line
  (shown only when block height > 44px).
- G14. **Block radius/padding**: current `--radius-sm` / `4px 6px` (css:69-70); design
  `border-radius:9; padding:5px 9px; left:5; right:5; top:+2; height:-4; box-shadow:var(--shadow-sm)`.
- G15. **Status→token mapping** differs from legend semantics: design legend uses
  `confirmed`=filled `--ink-3` dot, `pending`(=scheduled)=`--ink-3` ring,
  `in_progress`=`--warning` pulsing dot, `done`=`--ink-3` check. Current CSS has no dot layer
  and maps completed→success / no_show→danger fills. Reconcile status→indicator mapping
  (note current statuses: scheduled/confirmed/in_progress/completed/no_show/cancelled; design
  mock only models pending/confirmed/in_progress/done).

### Current-time line (NEW — absent in current code)
- G16. **No current-time red line.** Design renders a 2px `--danger` bar + mono time badge
  (`#fff` on `--danger`) + edge dot at the live time. Current grid has nothing. Net-new
  (compute live local-minute → top offset, day-view only, within 08–18 window).

### Right rail (NEW — absent in current code)
- G17. **No 296px right rail.** Body is grid `minmax(0,1fr) 296px` in design; current body is
  full-width grid only. Net-new:
  - G17a. "Bugungi kun" 2×2 stats (Jami / Tasdiqlangan / Kutilmoqda / Bo'sh slot). First three
    are derivable client-side from already-fetched `appts`; **"Bo'sh slot" has no data source**.
  - G17b. "Kutish ro'yxati" waiting-list card + per-row "Slotga joylashtirish" button —
    **no data source / endpoint exists**; this is a new feature, not a recolor.

### Out-of-scope interactions (design-only mock — do NOT port)
- G18. **Drag-to-reschedule** (`dropAppt`) and **click-empty-to-add** (`addApptAt`): the design
  is a **non-persistent mock** (`setState` on local `APPT_DOCS`, no API, no conflict recheck).
  Current code has neither. Per Qaror #33 (functionality unchanged) + the real conflict guard
  living server-side in the wizard (`useAvailability`), **do not add these in DS4**. The legend's
  "surib ko'chiring · bosib qo'shing" hint should be omitted or reworded (see Risks).

---

## 4. Tasks proposed (disjoint leaf tasks)

Pixel-parity re-skin only; no functional/API/permission change. i18n-touching tasks are
flagged **[i18n serial]** — they all edit shared `packages/i18n/src/locales/uz.json` + `ru.json`
and must serialize against each other (and any other DS milestone touching i18n).

- **T1 — Header re-skin** (`CalendarScreen.tsx`). Chevron icon nav buttons (34×34, left rotated),
  date title+subtitle block (formatted "DD-month · weekday" + "N ta yozilish · M doktor ·
  branch"), static "Bugun" pill for current day, restyle/convert Day/Week toggle to the
  segmented control shape (or accept theme-convergent pill — decide in spec), keep branch
  `Select` + "Yangi yozilish" primary button. **[i18n serial]** (subtitle template, possibly
  date formatting keys). Covers G1–G5.

- **T2 — Status legend strip** (`CalendarScreen.tsx`, new small component). Render the 4 dot/check
  legend items + (optional) trailing hint. Reuse the exact dot styles so they match the block
  indicators from T4. **[i18n serial]** ("Tasdiqlangan/Kutilmoqda/Qabulda/Yakunlandi" + hint
  text — reuse existing `appointments.status.*` where possible). Covers G15 legend half.

- **T3 — Grid/column chrome re-skin** (`CalendarGrid.module.css`, `CalendarGrid.tsx`,
  `WeekGrid.tsx`, `appointments.types.ts`). Card shadow + 16px radius + header strip; gutter
  50px + mono labels; 88px hour blocks (`GRID.pxPerMin` + min-height) — **see Risk R2 on
  end-hour**; per-30-min grid lines (hour opacity 1 / half .4, solid); column header = tinted
  initials tile + name + specialty/cabinet sub + mono count badge; min-width 160px. Doctor
  sub-line needs specialty data — if `Doctor` lacks it, fall back gracefully (no new endpoint).
  Covers G6–G11.

- **T4 — Appointment block re-skin** (`AppointmentSlot.tsx`, `CalendarGrid.module.css`). Switch
  fill to **doctor tone** with tone-cycling (index→TONES list), add status dot/check indicator
  layer, completed→`surface-2`+opacity .74, mono time·duration header + bold name + conditional
  service line (height>44), 9px radius / 5×9 padding / shadow-sm. Reconcile status→indicator
  mapping for the 6 real statuses (map cancelled→dim, completed→check, in_progress→pulsing
  warning dot, confirmed→filled, scheduled→ring, no_show→a documented choice). Covers G12–G15.
  Depends on tone palette decided in T3.

- **T5 — Current-time line** (new component in grid, day-view only). Compute live local minute
  → top offset within 08–18; render 2px danger bar + mono time badge + edge dot; hide when
  outside window; update on an interval. Covers G16. **[i18n serial]** only if any label is
  added (badge is a numeric time — likely none).

- **T6 — Right rail** (`CalendarScreen.tsx`, new components; body grid → `minmax(0,1fr) 296px`).
  "Bugungi kun" 2×2 stats computed from fetched `appts` (Jami/Tasdiqlangan/Kutilmoqda; **"Bo'sh
  slot" deferred or shown as "—"** — no data source). Waiting-list card: render **only if a data
  source is decided** — otherwise stub/omit (see Risk R5). **[i18n serial]** ("Bugungi kun",
  "Jami yozilish", "Tasdiqlangan", "Kutilmoqda", "Bo'sh slot", "Kutish ro'yxati",
  "Shoshilinch"/"Oddiy", "Slotga joylashtirish"). Covers G17.

> Sequencing: T3 before T4 (tone palette). T1/T2/T5/T6 are independent of each other except
> the shared i18n file. T4 and T2 should share the same dot/check style source.

---

## 5. Risks / notes

- **R1 — Drag-drop is a false premise; do NOT "preserve" or "add" it.** The task framing says
  "drag-drop behavior must be preserved," but current code has **no** drag-drop, and the design's
  drag/add is a **non-persistent local mock** (no API, no conflict recheck). The real conflict /
  business-hours guard is server-side in `NewAppointmentWizard` via `useAvailability`. Adding
  drag-to-reschedule would require a new PATCH endpoint + re-running availability — out of scope
  for a pixel-parity re-skin (Qaror #33). **Decision needed**: omit the legend "surib ko'chiring ·
  bosib qo'shing" hint or reword it to a non-interactive caption. Grid + block visual parity is
  fully achievable without the drag interaction.

- **R2 — End-hour 18 vs 20 is a behavior change, not styling.** Design grid is 08:00–18:00
  (`endH=18`); current `GRID.dayEndHour=20`. Narrowing 20→18 **hides any appointment after
  18:00**. Do not blindly set 18 for parity — confirm clinic working hours first. Safe option:
  keep end-hour 20 (or make it configurable) and only adopt the per-hour pixel density (88px)
  and styling. Flag for the spec.

- **R3 — Dark-mode contrast (CLAUDE.md standing lesson).** Two design choices are contrast-
  sensitive: (a) `done` blocks = `--surface-2` bg at `opacity:.74` — verify text (`--ink`/tone)
  stays ≥ WCAG AA in dark; (b) tone-soft block fills (`--info-soft`, `--violet-soft`,
  `--primary-soft`) with tone-colored mono time text — check each tone in both themes. The
  current-time badge uses literal `#fff` on `--danger` (matches design) — verify against dark
  `--danger`. Recheck dark-mode contrast on every token use here (DS0 regressed exactly this).

- **R4 — Color semantics shift (status→doctor).** T4 moves block fill from status-encoding to
  doctor-identity encoding. Status must NOT be lost — it moves to the dot/check indicator. The
  design mock only models 4 states (pending/confirmed/in_progress/done); production has 6
  (scheduled/confirmed/in_progress/completed/no_show/cancelled). Define the full indicator
  mapping in the T4 spec so cancelled/no_show stay visually distinct.

- **R5 — Right-rail data sources.** Stats Jami/Tasdiqlangan/Kutilmoqda are derivable from the
  already-fetched `appts` (no new API). **"Bo'sh slot"** and the **waiting list** have no data
  source in the current feature — treat as deferred/stubbed in DS4, not invented. The
  "Slotga joylashtirish" button is a new feature (needs reschedule/assign flow), not a recolor —
  keep out of DS4 functional scope.

- **R6 — i18n serial.** T1, T2, T6 (and possibly T5) add strings to shared
  `packages/i18n/src/locales/uz.json` + `ru.json`. Both files must be updated together, and
  these tasks serialize against each other to avoid merge churn. Reuse existing
  `appointments.status.*` keys where the legend overlaps.

- **R7 — Pixel values are design-mock constants.** Exact px (88, 50, 296, 9/12/160 etc.) come
  from the design's hardcoded mock and may be tuned against real responsive widths; treat them
  as targets, validate at the shell's `previewWidth` breakpoints.
