# DS10 — Settings (6 sections) — Design vs Current-Code Gap Brief

> Dental OS pixel-parity redesign. DS10 re-skins **only** the settings feature shell + the
> non-user sections to match `Dental OS.dc.html`. Foundation (tokens, shell, primitives) is
> DS0-locked — do not change. Functionality / API / i18n / permissions unchanged (Qaror #33).
> **DS9** separately re-skins the users/staff directory; the DS9/DS10 file boundary is a hard
> contract — see §2 and §5.

Design source (read, bounded ranges):
`…/tool-results/toolu_01GKUFvM7wVKLrAXM5m5CcRj.txt` — settings render at byte ~34000–54200,
data/state defs at ~232706–253600. Screen key `'settings'` (`scrSettings`, "Sozlamalar").

---

## 1. Design summary

Settings screen = a CSS grid `212px minmax(0,1fr)` (left-nav + main pane), `gap:20px`,
`align-items:start`, `animation:fadeUp .2s ease`.

### Left-nav (212px, sticky)
- Sticky column (`position:sticky; top:0`).
- Eyebrow heading: `font-size:11px; font-weight:700; text-transform:uppercase;
  letter-spacing:.06em; color:var(--ink-3); padding:4px 12px 8px` → "Sozlamalar".
- **6 nav buttons** (`setNav`), order + keys verbatim from source:
  `tenant`→"Klinika", `branches`→"Filiallar", `roles`→"Rollar va ruxsatlar",
  `users`→"Foydalanuvchilar", `notify`→"Bildirishnomalar", `integrations`→"Integratsiyalar".
- Active button: `padding:9px 12px; margin:1px 0; border:none; border-radius:9px;
  background:var(--primary-soft); color:var(--primary); font-weight:600; font-size:13.5px`.
- Inactive: `background:transparent; color:var(--ink-2); font-weight:500`,
  hover `{ background:'var(--surface-2)', color:'var(--ink)' }`.

### The 6 sections (main pane)
1. **roles** (`setRoles`) — **master-detail two-pane** grid `266px minmax(0,1fr)`, `gap:16px`:
   - **Left pane** (role list card, radius 16, `--shadow-sm`): header "Rollar" + 28×28 `+`
     icon-button; body `padding:8px`. Each role button (`roleList`): active = `border:1px solid
     var(--primary); border-radius:10px; background:var(--primary-soft)`, name `color:var(--primary)
     font-weight:700`, type-chip (Tizim/Maxsus), desc `11px var(--ink-2)`, users line
     `"{n} foydalanuvchi" 11px var(--ink-3)`. Inactive = transparent border, hover `surface-2`.
   - **Right pane** (permission grid card, radius 16): header row — role name `16px/700` + system
     badge "**Tizim shabloni**" pill (`10.5px; color:var(--ink-3); background:var(--surface-2);
     border:1px solid var(--border); border-radius:99px; padding:2px 9px`), subtitle
     "{desc} · {permCount} ruxsat"; right side **inline** buttons "Nusxalash" (outline) + "Saqlash"
     (`background:var(--primary); color:var(--on-primary)`). Body `padding:6px 18px 18px`.
   - **Permission grid** (`permCats` → 5 categories, ~4 perms each): each category has an uppercase
     label (`11px/700; letter-spacing:.05em; color:var(--ink-3)`), then per-perm rows
     `display:flex; justify-content:space-between; padding:9px 0; border-top:1px solid var(--border)`
     — left: perm label `13px var(--ink)`; right: **pill toggle switch** 38×22, on =
     `background:var(--primary)` knob right `#fff`, off = `background:var(--surface-2);
     border:1px solid var(--border)` knob left `var(--ink-3)`.
   - Demo source categories: Bemorlar / Klinik / Operatsion / Moliya va hisobot / Boshqaruv.
2. **users** (`setUsers`) — card + custom CSS-grid table, 5 cols
   `minmax(0,1.4fr) minmax(0,1.2fr) 150px 160px auto` (Foydalanuvchi / Aloqa / Rol / Filial /
   Holat), header "Foydalanuvchilar" + "Taklif qilish" primary button; avatar = 34×34
   `linear-gradient(135deg,var(--primary),var(--violet)) #fff`. **→ owned by DS9, not DS10.**
3. **tenant / clinic-info** (`setTenant`) — single card `padding:22px; max-width:620px`, title
   "Klinika ma'lumotlari". Form grid `1fr 1fr; gap:14px`: Klinika nomi (span 2), Slug (mono input),
   Asosiy til (select), **Vertical = segmented two-button toggle** (span 2): "Stomatologiya"
   active = `border:1.5px solid var(--primary); background:var(--primary-soft); color:var(--primary)`,
   "Umumiy klinika" inactive = `border:1.5px solid var(--border); background:var(--surface)`.
   Footer row: subscription line ("Faol · Pro tarif · 18 ta seat") + "Saqlash" primary button.
   Inputs: `height:42px; border-radius:10px; background:var(--surface-2)`, focus
   `{ borderColor:'var(--primary)', background:'var(--surface)' }`.
4. **branches** (`setBranches`) — card + CSS-grid table, 5 cols
   `minmax(0,1fr) minmax(0,1.3fr) 150px 110px auto` (Nomi / Manzil / Telefon / Xodimlar / Holat),
   header "Filiallar" + "Yangi filial" primary button. Phone = mono; staff count right-aligned mono;
   status chip right-aligned.
5. **notify** (`setNotify`) — card `max-width:680px`, title "Bildirishnoma sozlamalari", then a list
   (`notifyPrefs`) of rows `padding:14px 18px; border-top:1px solid var(--border)`: name `13.5px/600`
   + desc `12px var(--ink-3)` on the left, **same 38×22 pill toggle** on the right. **Net-new section.**
6. **integrations** (`setIntegrations`) — **card grid** `repeat(2,1fr); gap:14px`. Each card
   (`integrationsL`, radius 16, `padding:18px`): 40×40 icon tile (`surface-2`) + status chip top row,
   name `14px/700`, desc `12.5px var(--ink-3)`, then a setup button — `on` → "Sozlash" (outline),
   `off` → "Ulash" (primary). **Net-new section.** Demo cards: Eskiz.uz SMS / Telegram bot /
   Soliq.uz fiskal / 1C eksport.

### Tokens (all DS0-locked, verified present in `packages/ui/src/theme/tokens.css`)
`--primary`, `--primary-soft`, `--on-primary`, `--ink`, `--ink-2`, `--ink-3`, `--border`,
`--border-strong`, `--surface`, `--surface-2`, `--success`, `--warning`, `--violet`, `--shadow-sm`.
**Font-token mapping:** design `var(--ui)` = code `var(--font-sans)`; design `var(--mono)` =
code `var(--font-mono)` (no `--ui`/`--mono` aliases exist — use the `--font-*` names).

### Recurring sizes
Card radius 16 (`border-radius:16px`), inputs radius 10 / height 42, nav buttons radius 9, role
buttons radius 10, toggle 38×22 (knob 18, inset 2px), section card header padding `16px 18px`,
table header band `background:var(--surface-2)` uppercase `11px/700`.

---

## 2. Current state

Feature root: `apps/web/src/features/settings/`

| File | Role |
|---|---|
| `components/SettingsShell.tsx` | **Shell + nav.** Uses `@dental/ui` `Tabs variant="pill"` (horizontal), `PageHead`, `padding:24`. `SettingsTab = 'tenant'\|'roles'\|'branches'\|'users'` (**4 tabs only**), permission-gated via `useAuthStore().hasPermission`. **Boundary file — see §5.** |
| `components/RolesSettingsScreen.tsx` | Roles section. **Table** (name / type Badge / edit+delete `ActionIcon`) + opens `RoleFormModal`. No master-detail, no inline permission grid. |
| `components/RoleFormModal.tsx` | Mantine `Modal size="lg"` — name/description `TextInput` + `<PermissionBuilder>` + Cancel/Save. |
| `components/PermissionBuilder.tsx` | Permission editor: per-resource `Card` with a group `Checkbox` (indeterminate) + child `Checkbox` rows showing perm `code` (mono) + description. **Checkbox-based, not toggle-switch.** Driven by `groupPermissionsByResource(usePermissions())` — **dynamic real perms (~46)**, not the design's 5 hardcoded categories. |
| `components/TenantSettingsScreen.tsx` | Clinic-info. Three `Card`s: (a) name + default-language `Select` (b) **clinic settings**: vertical `Select`, `currency` `TextInput`, `reminderLeadHours` `NumberInput` (c) **transfer-ownership** card + modal + confirm. Vertical is a **`Select`**, not a segmented toggle. |
| `components/BranchesSettingsScreen.tsx` | Branches. Mantine `Table` (name/address/phone/**staff_count Badge**/edit+delete) + create/edit `Modal` (`PhoneInput`). Staff count computed client-side (CLI-159). |
| `components/UsersSettingsScreen.tsx` | Users/staff directory: search+filter, Mantine `Table`, invite `Modal`, reset-password, `StaffProfileModal`. **→ DS9 owns this.** |
| `components/StaffProfileModal.tsx` | Staff profile edit modal. **→ DS9.** |
| `components/ConfirmModal.tsx` | Shared confirm dialog (reused by roles/branches/users). |
| `settings.api.ts` | Hooks: `useRoles/useRole/usePermissions/useUpsertRole/useDeleteRole`, `useUsers/useInviteUser/useRemoveAssignment/useResetPassword/useStaffProfile/useUpsertProfile`, `useBranches/useUpsertBranch/useDeleteBranch`, `useTenant/useUpdateTenant/useTenantSettings/useTenantVertical/useVertical/useUpdateTenantSettings/useTransferOwnership`. **No `notify`/`integrations` hooks.** |
| `settings.routes.tsx` | `AppRoute[]`: `/settings/{services,tenant,branches,roles,users}` — **no `/settings/notify` or `/settings/integrations` routes.** |
| `settings.schema.ts` / `settings.mappers.ts` / `settings.keys.ts` / `settings.types.ts` | Zod forms, `groupPermissionsByResource`/`filterAssignments`, query keys, types. |

**Confirmed net-new:** grep of `apps/web/src/features` finds **no** notification-preferences or
integrations feature anywhere; no `notify`/`integration` i18n keys exist. Both DS10 sections are
brand new UI (consistent with V3 scaffold posture — static/demo, no backend hook).

### DS10 ⇄ DS9 file boundary (explicit)
- **DS10 owns:** `SettingsShell.tsx` (nav rewrite), `RolesSettingsScreen.tsx`, `RoleFormModal.tsx`,
  `PermissionBuilder.tsx`, `TenantSettingsScreen.tsx`, `BranchesSettingsScreen.tsx`, **+ new**
  notify & integrations screens + their routes. Plus i18n keys for those.
- **DS9 owns:** `UsersSettingsScreen.tsx` body + `StaffProfileModal.tsx` only.
- **Shared/locked:** `ConfirmModal.tsx`, `settings.api.ts`, `settings.routes.tsx` (DS10 adds rows;
  DS9 must not). **The only file both milestones could touch is `SettingsShell.tsx` → assigned to
  DS10.** Contract: DS10 extends `SettingsTab` to add `'notify' | 'integrations'`; DS9 keeps
  passing `active="users"` and **must not touch the shell**.

---

## 3. Gap list (concrete visual deltas)

1. **Nav model: horizontal pill `Tabs` → vertical 212px left-nav.** `SettingsShell.tsx` renders
   `PageHead` + `<Tabs variant="pill">` above the content. Design wants a sticky left-nav column in a
   `212px minmax(0,1fr)` grid with the eyebrow heading. Structural rewrite of the shell layout.
2. **Section count: 4 → 6.** Shell `TAB_CONFIG` / `SettingsTab` lacks `notify` + `integrations`;
   routes lack `/settings/notify` + `/settings/integrations`. Two new screens + routes + nav entries.
3. **Roles: Table+Modal → inline master-detail.** `RolesSettingsScreen.tsx` is a flat table opening
   `RoleFormModal`. Design has a 266px role-list pane (selected role highlighted in `--primary-soft`,
   users-count + type-chip + desc inline) beside an **inline** permission grid with **Saqlash inline**
   (no modal). Flow change.
4. **Permission control: `Checkbox` → pill toggle switch.** `PermissionBuilder.tsx` uses Mantine
   `Checkbox` (group + children, showing perm `code` mono). Design uses the 38×22 pill toggle per perm
   row, label only (no code shown), grouped under uppercase category headers with `border-top` row
   dividers. Re-skin of the editor's control + layout.
5. **System-role badge.** Current shows a `Badge color="blue"`("Tizim"). Design shows a neutral pill
   "Tizim shabloni" (`surface-2` bg, `--ink-3`) in the detail header.
6. **Clinic-info vertical: `Select` → segmented two-button toggle.** `TenantSettingsScreen.tsx`
   vertical is a Mantine `Select`; design is two side-by-side buttons (Stomatologiya / Umumiy klinika)
   with the active one in `--primary-soft`/`--primary`.
7. **Clinic-info card styling.** Current is three stacked Mantine `Card`s (name card / settings card /
   transfer card); design is a single `max-width:620px` card with a 2-col input grid + footer
   subscription/Save row. Re-skin to design card; **preserve** the extra fields/cards (see §5 note).
8. **Branches table → design grid.** Mantine `Table` vs design CSS-grid 5-col table with `surface-2`
   header band, mono phone/staff, right-aligned staff+status chips. Re-skin.
9. **Notifications section — entirely missing.** No screen/route exists. Build the toggle-list card
   (`max-width:680px`) per design §1.5.
10. **Integrations section — entirely missing.** No screen/route exists. Build the 2-col card grid per
    design §1.6 (icon tile + status chip + name/desc + Sozlash/Ulash button).
11. **Status chips.** Design uses a `chip(label, tone)` helper (success/warning/muted/primary). Map to
    project `StatusPill`/`Badge` convention (`packages/ui/STATUS-INDICATORS.md`) — don't introduce raw
    off-token colors.

---

## 4. Tasks proposed (disjoint leaf tasks)

Each task = one re-skin unit; all under `features/settings/`. Sequence **T1 first** (shell owns the
new frame everything renders inside).

- **T1 — Settings shell + left-nav.** Rewrite `SettingsShell.tsx`: `212px minmax(0,1fr)` grid, sticky
  left-nav, eyebrow heading, 6 nav buttons (active `--primary-soft`/`--primary`, inactive hover
  `--surface-2`). Extend `SettingsTab` → `+ 'notify' | 'integrations'`; keep permission gating
  (`hasPermission`). Add `/settings/notify` + `/settings/integrations` to `settings.routes.tsx`.
  **Land first** (DS9's re-skinned users table renders inside this frame).
- **T2 — Roles master-detail + permission grid.** Recast `RolesSettingsScreen.tsx` into the
  266px-pane + permission-grid two-pane; convert `PermissionBuilder.tsx` Checkbox → pill toggle
  switches under uppercase category headers; move Save inline; add neutral "Tizim shabloni" badge.
  **Largest task** — modal→inline flow change + control change; keep `usePermissions`/`useUpsertRole`,
  keep dynamic `groupPermissionsByResource` (do NOT hardcode the design's 5 categories). May warrant
  its own brainstorm/spec depth (see §5).
- **T3 — Clinic-info card + vertical segmented toggle.** Re-skin `TenantSettingsScreen.tsx` to the
  single `max-width:620px` card + 2-col grid + footer Save; convert vertical `Select` → segmented
  two-button toggle. **Preserve** currency, reminder-lead-hours, default-language, and the
  transfer-ownership flow (Qaror #33) — style them in, don't drop to match the demo.
- **T4 — Branches grid.** Re-skin `BranchesSettingsScreen.tsx` table to the design CSS-grid 5-col
  table (`surface-2` header band, mono phone/staff, right-aligned chips). Keep create/edit modal +
  client-side staff count (CLI-159).
- **T5 — Notifications section (net-new, static).** New `NotificationsSettingsScreen.tsx` + route:
  toggle-list card per design §1.5. No backend hook exists → static/scaffold prefs (V3 posture);
  do not invent an API.
- **T6 — Integrations section (net-new, static).** New `IntegrationsSettingsScreen.tsx` + route:
  2-col card grid per design §1.6. Static/scaffold cards (Eskiz/Telegram/Soliq/1C); Sozlash/Ulash
  buttons no-op or link to relevant existing settings; no backend hook.

> **i18n — serial, not a standalone task.** New keys land in **both** `packages/i18n/src/locales/uz.json`
> **and** `ru.json` (notify labels/descs, integration names/descs, roles "Tizim shabloni" / "ruxsat" /
> "Nusxalash", `settings.nav_notify` / `settings.nav_integrations`). This is a shared serialization
> point → **flag conflict risk if T1/T2/T5/T6 run in parallel**; serialize the i18n edits or have one
> task own the key additions.

---

## 5. Risks / notes

- **DS9/DS10 sequencing (the load-bearing one).** Code-disjoint, but DS9's re-skinned users table
  *renders inside* DS10's new shell. If DS9 lands first, it looks correct against the **old** pill-Tabs
  frame and visually shifts once T1 lands. **Recommend T1 (shell) lands before DS9 users re-skin, or
  the two coordinate.** Hard contract: DS10 extends `SettingsTab` (`+notify|integrations`); DS9 keeps
  `active="users"` and never edits `SettingsShell.tsx`.
- **Roles is a flow + control change, not a pure re-skin (Qaror #33 tension).** Modal→inline and
  Checkbox→Switch. It preserves *function* (same perms catalog, same upsert, same save) so it is
  defensible under #33, but name the tension — this is the one task that may need its own
  brainstorm→spec depth. The other five are genuine re-skins.
- **Design data is all DEMO — wire structure to real sources, not the mockup's data.**
  `PERM_CATS` (5 cats), `SET_ROLES`, `NOTIFY_PREFS`, `INTEGRATIONS` are hardcoded in the design.
  - Roles: keep dynamic `groupPermissionsByResource(usePermissions())` (~46 real perms); don't pin to 5.
  - Clinic-info: the mockup **omits** currency, reminder-lead-hours, and the **transfer-ownership**
    card that exist today — #33 says preserve function; style them in, don't shrink the form to the demo.
- **Notify + integrations are net-new scaffolds.** No API hooks, no i18n, no routes today (confirmed
  by grep). Build as static/scaffold UI consistent with V3 scaffolding; do not fabricate endpoints.
- **Dark-mode contrast (the DS0/CLI-80 lesson — verify, don't assume).** Toggle knobs hardcode `#fff`
  and the users-avatar gradient text is `#fff`; verify `#fff`-on-`--primary` and `--on-primary`
  contrast hold in **dark** mode after re-skin. Re-run the DS0 dark-mode WCAG check on the toggle
  switches, primary buttons (Saqlash/Ulash/Taklif qilish), and the `--primary-soft`/`--primary`
  active states.
- **Status chips → project convention.** Map the design's `chip(tone)` (success/warning/muted/primary)
  onto `StatusPill`/`Badge` per `packages/ui/STATUS-INDICATORS.md`; avoid raw off-token colors.
- **Nav key correction.** Use nav key `'branches'` (authoritative from the real source
  `[{key:'tenant'…},{key:'branches'…},{key:'roles'…}…]`), not the prompt's shorthand `'b'`.
- **Font tokens.** Use `var(--font-sans)` / `var(--font-mono)` in code; the design's `var(--ui)` /
  `var(--mono)` are the DesignSync aliases for those.
