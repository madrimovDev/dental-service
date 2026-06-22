# DS9 — Staff directory + Inventory — Design-vs-Code Gap Brief

Milestone: **DS9** (Dental OS pixel-parity redesign). Re-skins **staff-as-directory** (Settings → Users), **stock/inventory**, and **payroll**.
Foundation locked (DS0 done): `packages/ui/src/theme/tokens.css`, shell, primitives — **do not change**. Functionality / API / i18n / permissions unchanged (Qaror #33).
DS9 and DS10 both touch `features/settings/` — file boundary is delineated in §2.

Design source: `…/tool-results/toolu_01GKUFvM7wVKLrAXM5m5CcRj.txt` (Dental OS mock, React-createElement). Sections read: `staffList`/`STAFF_LIST` (`scrStaff` render), `invList`/`INV_LIST` (`scrInventory` render), `FIN_KPIS`/`EXPENSE_CATS` (finance), `chip()`/`TONES` helpers, `:root` token values.

---

## 1. Design summary

### Tokens (mock `:root`, all present in locked `tokens.css`)
- Status fg/soft pairs via `TONES`: `success ['--success','--success-soft']`, `danger ['--danger','--danger-soft']`, `warning ['--warning','--warning-soft']`, `violet ['--violet','--violet-soft']`, `muted ['--ink-3','--surface-2']`.
  - Light: `--success:#0B7A6B / soft #DDEFEA`, `--danger:#CC3D3A / soft #FBE7E5`, `--warning:#B57611 / soft #F7ECD6`, `--violet:#7C4DD6 / soft #ECE4FB`.
  - Verified in code: `tokens.css` defines `--success/--success-soft`, `--warning/--warning-soft`, `--danger/--danger-soft`, `--violet/--violet-soft` for **both** light and dark blocks (lines 70–83, 166–175).
- Surfaces/ink: `--surface`, `--surface-2`, `--border`, `--ink`, `--ink-2`, `--ink-3`, `--shadow-sm`.
- Fonts: mock writes `var(--mono)` / `var(--ui)`; the **code tokens are `--font-mono` / `--font-sans`** (Hanken Grotesk / JetBrains Mono). The mock names are mock-local aliases — map to `--font-mono` for the qty cell. **Do not introduce `--mono`/`--ui` tokens.**

### Chip (status pill) — `chip(text, tone, dot)`
`inline-flex; gap:6; padding:3px 9px; border-radius:999; font-size:11.5; font-weight:600; color:var(fg); background:var(soft)`. Optional pulsing dot. In code this maps to the existing `StatusPill` / `Badge variant="light"` convention — **no new primitive** (DS0 primitives locked).

### Staff screen (`scrStaff`)
- Header row: title "Xodimlar" + subtitle "6 ta xodim · 2 filial" + primary button "Xodim taklif qilish" (icon + `--primary` fill, `--on-primary` text, `border-radius:10px`).
- **3-column card grid**: `display:grid; grid-template-columns:repeat(3,1fr); gap:14px`.
- Each card: `background:var(--surface); border:1px solid var(--border); border-radius:16px; box-shadow:var(--shadow-sm); padding:18px`.
  - Top row: **gradient avatar** `46×46, border-radius:13px, background:linear-gradient(135deg,var(--primary),var(--violet)), color:#fff` showing initials; name (700/14px, ellipsis) + role (12px `--ink-3`); **status chip** at right.
  - Body: two label/value rows — `Filial` → branch, `Yo'nalish` → specialty (label `--ink-3`, value `--ink-2` fw500).
- Status data is **`Faol` (success) / `Ta'tilda` (warning)** — i.e. **employment state, not online/offline presence**. (Task prompt said "online/offline" — the actual mock data does not have presence; do not introduce it.)
- Mock cards show **no per-row action icons** (simplified visual).

### Inventory screen (`scrInventory`)
- **Low-stock alert banner** (top): `background:var(--danger-soft); border:1px solid color-mix(--danger 22%)`; red `!` square badge; text "**2 ta material** minimal zaxiradan past — qayta buyurtma kerak."; right-aligned outline button "Buyurtma berish" (`--danger` border/text on `--surface`).
- **Table card**: `border:1px solid var(--border); border-radius:16px; box-shadow:var(--shadow-sm); overflow:hidden`.
  - Card header: "Ombor qoldiqlari · Bosh filial" + count "5 pozitsiya".
  - Column grid (header + rows identical template): `minmax(0,1.4fr) minmax(0,1fr) 120px 90px 130px auto` = **Material, Kategoriya, Qoldiq(right), Min(right), Narx(right), Holat(right)**. Header on `--surface-2`, uppercase 11px.
  - Row: name (fw600), category (`--ink-2`), **qty mono** (`font-family:var(--mono)` fw600 + unit suffix `--ink-3`), min (mono 12px `--ink-3`), price (right), status chip.
- Status data is **`Kam qoldi` (danger) / `Yetarli` (success)** — **2 states only** in the mock data. No "warning/critical" middle tier despite the task's "ok/warning/critical" paraphrase.

### Payroll
- The design has **no dedicated payroll-run screen**. The `finance` screen is an expense/P&L dashboard (FIN_KPIS, EXPENSE_CATS, EXPENSES) where payroll appears only as an **expense line** ("Ish haqi (payroll)", tone `violet`). There is no period-range run table, no commission-line table. **PayrollScreen has no pixel-parity target → convention-only restyle.**

---

## 2. Current state (files, components, hooks)

### Staff directory — `apps/web/src/features/settings/` (DS9 owns ONLY these)
- **`components/UsersSettingsScreen.tsx`** — DS9 PRIMARY. Mantine `Table` of assignments (full name / phone / role / branch / status `Badge`), filter row (search `TextInput` + branch `Select` + role `Select`), action icons per row (edit-profile `IconUserCog`, reset-password `IconKey`, remove `IconTrash`), invite `Modal` + temp-password `Alert`, reset-result `Modal`, two `ConfirmModal`s, `StaffProfileModal`.
- **`components/StaffProfileModal.tsx`** (+ `.test.tsx`) — DS9. Staff profile edit modal.
- Hooks (in shared `settings.api.ts`): `useUsers`, `useInviteUser`, `useRemoveAssignment`, `useResetPassword`, `useRoles`, `useBranches`. Mapper `filterAssignments` (`settings.mappers.ts`), schema `makeInviteSchema` (`settings.schema.ts`), `UsersFilter` (`settings.types.ts`).

### Stock/inventory — `apps/web/src/features/stock/` (DS9 owns whole folder)
- **`components/StockScreen.tsx`** — `Container` + `PageHead` + actions (batch-receive + create-item) + **expiring-batch `Alert` (orange)** + `Tabs` (items / bom) + branch `Select` + `Grid` (items table | movement-history) + modals (`ItemFormModal`, `BatchFormModal`, `MovementFormModal`). Uses `StateView` for loading/error.
- **`components/StockItemsTable.tsx`** (+ `.test.tsx`) — Mantine `Table`: name / unit / quantity / min-threshold / **status `Badge`** (binary `low`→red, `ok`→teal-light) / movement button. Qty cell red when low.
- **`components/{BomPanel,MovementHistory,ItemFormModal,BatchFormModal,MovementFormModal}.tsx`** — side panels/modals (functionality the mock omits).
- Hooks (`stock.api.ts`): `useStockItems`, `useStockMovements`, `useExpiringBatches`, `useBranches`, `useServices`. Mapper `toStockItemVM` + `stockStateOf` + `formatQty` (`stock.mappers.ts`). Type `StockItemVM` / `StockState='low'|'ok'` (`stock.types.ts`).

### Payroll — `apps/web/src/features/payroll/` (DS9 owns whole folder)
- **`components/PayrollScreen.tsx`** — `Container` + `Title` + create-run `Card` (DatePickerInput range) + runs `Table` + run-detail `Card` (commission-line `Table`). Status `Badge` (`finalized`→green, `draft`→gray). Uses `StateView` + `formatCurrency`.

### DS9 ↔ DS10 boundary in `features/settings/` (CRITICAL — keep file-disjoint)
| Owner | Files |
|---|---|
| **DS9** (this milestone) | `components/UsersSettingsScreen.tsx`, `components/StaffProfileModal.tsx` (+ tests) |
| **DS10** (Settings) | `components/{TenantSettingsScreen,RolesSettingsScreen,BranchesSettingsScreen,RoleFormModal,PermissionBuilder,ConfirmModal}.tsx`, integrations/notifications |
| **SHARED — co-owned, do NOT visually restyle in DS9** | `components/SettingsShell.tsx` (tab chrome wraps ALL settings tabs incl. Users), `settings.api.ts`, `settings.keys.ts`, `settings.mappers.ts`, `settings.schema.ts`, `settings.types.ts`, `settings.routes.tsx`, `index.ts` |

`SettingsShell.tsx` renders the pill-tab chrome around Users *and* tenant/roles/branches. **DS9 must restyle only inside `<SettingsShell active="users">…children`** and leave the shell itself for DS10 (or treat any shell change as a coordinated, separate decision). `ConfirmModal.tsx` is shared infra — used by both; not a DS9 visual target.

---

## 3. Gap list (concrete visual deltas)

### Staff (`UsersSettingsScreen.tsx`)
1. **Layout: table → 3-column card grid.** Current = `Table` (6 cols). Design = `repeat(3,1fr)` card grid. Biggest delta.
2. **Gradient avatar absent.** Design has 46px `linear-gradient(135deg,--primary,--violet)` initials chip; current has no avatar. Needs an initials helper (derive from `userFullName`).
3. **Status pill mapping.** Current `Badge color={isActive?'teal':'gray'}`. Design uses success/warning chips on employment state. Map active→success chip; the design's "Ta'tilda/warning" has **no backing field** in current data (`isActive` is binary) → keep binary active(success)/inactive(muted-or-warning); **do not invent a leave state** (#33).
4. **Card surface tokens.** Cards need `--surface / --border / --shadow-sm / border-radius:16px / padding:18px`.
5. **Header subtitle "N ta xodim · M filial"** — derivable from `assignments.data` + `branches.data`; currently absent (only `SettingsShell` PageHead title).
6. **Preserve (mock omits these):** search + branch + role filters; per-row edit-profile / reset-password / remove actions → **relocate into each card** (e.g. menu or icon row); all modals + `StaffProfileModal`.

### Inventory (`StockScreen.tsx` + `StockItemsTable.tsx`)
7. **Low-stock alert banner is NET-NEW.** Design banner = low-stock **count** + reorder button on `--danger-soft`. Current alert is the **expiring-batch** alert (orange) — a *different* concept. Derive count from `itemVMs.filter(i=>i.stockState==='low').length`; render only when `>0`. The "Buyurtma berish" button **has no backend** → render as no-op/omit (#33). Decide whether the existing expiring-batch alert stays alongside (recommend: keep both, distinct messages).
8. **Status: Badge → chip.** Current binary `low`(red)/`ok`(teal-light) maps **directly** to danger/success chips. Do NOT add a "warning/critical" middle tier — that's a threshold/functionality change (#33).
9. **⚠️ DATA GAP — Kategoriya + Narx columns impossible.** `StockItemWithLowStock` (api-client) and the backend `stock.schema.ts` have **no `category` and no `price`** fields (only id/branchId/name/unit/quantity/minThreshold/lowStock). The design table's `Kategoriya` and `Narx` columns **cannot be filled under #33** (no API change). → **Deviation, not a styling task.** Re-skin the columns the API supports (Material / Qoldiq / Min / Holat); **drop or visually placeholder** category+price. Flag for product decision if those columns are desired (requires backend schema + migration — out of DS9 scope).
10. **Qty cell mono.** Design qty uses `var(--mono)` fw600 + unit suffix. Code: use `--font-mono`. Current qty is plain text.
11. **Table-card chrome.** Design wraps the table in a bordered/rounded card with header ("Ombor qoldiqlari · <branch>" + position count). Current uses a generic `Card withBorder` around the `StockItemsTable`.
12. **Preserve (mock omits):** branch filter, BOM tab, MovementHistory side panel, item/batch/movement modals, `StateView` loading/error.

### Payroll (`PayrollScreen.tsx`)
13. **No pixel target.** Convention-only restyle to Dental OS tokens (status `Badge` → chip convention: `finalized`→success, `draft`→muted; surfaces/spacing aligned). No layout change. Lowest priority.

---

## 4. Tasks proposed (disjoint leaf tasks)

> Each task is file-disjoint to allow parallel work. **i18n is the one serial dependency** — any new i18n keys (staff subtitle, low-stock banner) must land in `packages/i18n` `uz.json` + `ru.json` together; run i18n-touching tasks serially or batch the key additions into one task to avoid merge conflicts. Per #33, *existing* i18n strings/keys are unchanged — only additive keys for net-new copy (subtitle, low-stock banner) are allowed.

- **DS9-T1 — Staff cards.** Rewrite `UsersSettingsScreen.tsx` body: table → 3-col card grid with gradient avatar, status chip, branch/specialty rows; relocate row actions into cards; add header subtitle. Touches: `UsersSettingsScreen.tsx` only (+ test). i18n: +subtitle key.
- **DS9-T2 — StaffProfileModal re-skin.** Token/spacing alignment of `StaffProfileModal.tsx` to Dental OS. Disjoint from T1. Touches: `StaffProfileModal.tsx` (+ test).
- **DS9-T3 — Inventory table + chips.** `StockItemsTable.tsx`: Badge→chip (danger/success), mono qty + unit suffix, card-header chrome; honor the **category/price data-gap deviation** (§3.9 — omit those columns). Touches: `StockItemsTable.tsx` (+ test), possibly `StockScreen.tsx` table card.
- **DS9-T4 — Low-stock alert banner.** Add net-new low-stock banner (count from `itemVMs`, `--danger-soft`, no-op reorder button) in `StockScreen.tsx`; reconcile with existing expiring-batch alert. Touches: `StockScreen.tsx`. **i18n serial:** +banner keys (coordinate with any other i18n task).
- **DS9-T5 — Payroll convention restyle.** Token/chip alignment of `PayrollScreen.tsx` (no layout change). Touches: `PayrollScreen.tsx` only. Lowest priority.

(5 tasks; T1/T3/T4 carry visual weight, T2/T5 are light. T4 is the only one with a hard i18n-serial flag plus a semantic decision.)

---

## 5. Risks & notes

- **DS9/DS10 settings boundary (highest risk).** `SettingsShell.tsx` + all `settings.*.ts` barrels are co-owned. DS9 must edit **only** `UsersSettingsScreen.tsx` + `StaffProfileModal.tsx` and stay inside the shell's children. Re-skinning the shell tab chrome belongs to DS10 (or a coordinated joint decision) — touching it in DS9 will conflict. **Re-skin Users in place under the Settings → Users tab — do NOT promote staff to a standalone nav screen** even though the mock shows one as a top-level screen; nav/IA is unchanged (#33).
- **Inventory category/price DATA GAP (§3.9).** Pixel parity for the `Kategoriya`/`Narx` columns is **not achievable** without an API/schema change, which #33 forbids in DS9. Treat as an explicit deviation; surface to product if those columns are wanted (backend `stock_items` schema + migration + mapper = separate, non-DS9 work).
- **Low-stock alert semantics.** Design banner = **low-stock count** (derive client-side from `stockState==='low'`); current alert = **expiring batches** (different). The reorder button ("Buyurtma berish") has **no backend** → no-op/omit. Keep the existing expiring-batch alert distinct; don't conflate the two.
- **Status semantics — don't invent states.** Staff = `Faol`/`Ta'tilda` is employment, not online/offline presence (current data only has `isActive` binary). Inventory = `Kam qoldi`/`Yetarli` is 2-state (no warning/critical tier). Map to chips 1:1; adding tiers/presence = functionality change (#33).
- **Dark-mode contrast (DS0 lesson — CLI-80/255 regression).** All status chips render fg-on-`*-soft`. Verify `--success/--success-soft`, `--warning/--warning-soft`, `--danger/--danger-soft`, `--violet/--violet-soft` AA-pass in **both** light and dark blocks of `tokens.css` (all present: lines 70–83 light, 166–175 dark). The gradient avatar uses fixed `#fff` text on `--primary→--violet` — fine in both modes, but confirm `--violet` dark value (`#b093ee`) keeps white legible. Don't expand scope beyond verifying these pairs.
- **Font token naming.** Mock writes `var(--mono)`/`var(--ui)`; code tokens are `--font-mono`/`--font-sans`. Use the code names; do not add the mock aliases.
- **Primitives locked.** Chips map to existing `StatusPill`/`Badge variant="light"` convention (`packages/ui/STATUS-INDICATORS.md`) — do not create a new chip primitive.
