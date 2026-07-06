# DS9 — Xodimlar + Ombor (Settings / Stock / Payroll) — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-22-ds9-staff-stock-design.md`
**Doira:** front-end-only re-skin (DS0 tokenlari), xulq/data/API/permission O'ZGARMAS.
**Worktree:** `/home/madrimov/Projects/ds-wt-ds9`

## Disjoint task breakdown (fayl-bo'yicha kesishmaydi)

Har task **CONCRETE fayl to'plamiga** ega; tasklar fayl bo'yicha kesishmaydi. FAQAT bitta task (DS9-5) i18n locale'larga tegadi (serial resurs). Har task TDD: avval test qulflanadi/yoziladi, keyin re-skin, oxirida verify.

### DS9-1 — Stock re-skin
**Fayllar:** `apps/web/src/features/stock/components/StockScreen.tsx`, `StockItemsTable.tsx`, `MovementHistory.tsx`, `BomPanel.tsx`, `ItemFormModal.tsx`, `MovementFormModal.tsx`, `BatchFormModal.tsx`, `StockItemsTable.test.tsx`.
**Ish:** `Badge low/ok` → `StatusPill danger/success`; row-selection `--mantine-color-blue-light` → `--primary-soft`; `c="red"` → `var(--danger)`; card/tab/spacing parity; modal/section parity. Off-brand expiring `Alert` saqlanadi (CLI-181 deferred). i18n kalit O'ZGARMAYDI (mavjud label qayta ishlatiladi). Test: `StockItemsTable.test.tsx` yashil (low/ok label + onSelect/onMovement).

### DS9-2 — Payroll re-skin
**Fayllar:** `apps/web/src/features/payroll/components/PayrollScreen.tsx` (+ ixtiyoriy yangi `PayrollScreen.test.tsx`).
**Ish:** `Title order={2}` → `PageHead`; `statusBadge` → `StatusPill success/neutral`; row-selection → `--primary-soft`; "Finalize" `color="green"` → token `color="teal"`; davr-card + jadval spacing parity; mono raqamlar (ixtiyoriy). `formatCurrency`/mapper O'ZGARMAYDI. Test: render-smoke (PageHead title, status label, finalize gating).

### DS9-3 — Settings re-skin A (Users + Shell + StaffProfile)
**Fayllar:** `apps/web/src/features/settings/components/SettingsShell.tsx`, `UsersSettingsScreen.tsx`, `UsersSettingsScreen.test.tsx`, `StaffProfileModal.tsx`, `StaffProfileModal.test.tsx`, `SettingsShell.test.tsx`.
**Ish:** active/inactive `Badge` → `StatusPill success/neutral`; `ActionIcon` ranglari token-mos (edit=gray subtle, reset=info subtle, delete=danger subtle); temp-parol `ff="monospace"` → `--font-mono`; filtr qatori + modal spacing parity; `Alert` token-variant. Invite oqimi (`alreadyExists` CLI-158), `notifications.show`, permission gating, `zod4Resolver` O'ZGARMAYDI. Test: characterization yashil (tab filtri, invite, label matni).

### DS9-4 — Settings re-skin B (Roles + Branches + Tenant + form modallar)
**Fayllar:** `apps/web/src/features/settings/components/RolesSettingsScreen.tsx`, `BranchesSettingsScreen.tsx`, `TenantSettingsScreen.tsx`, `RoleFormModal.tsx`, `RoleFormModal.test.tsx`, `PermissionBuilder.tsx`, `PermissionBuilder.test.tsx`, `ConfirmModal.tsx`.
**Ish:** Roles "system" `Badge color="blue"` → `StatusPill accent`; Branches xodim-soni `Badge` SAQLANADI (sanoq, CLI-181); Tenant warning `Alert` (off-brand) saqlanadi (deferred), transfer `Button color="red"` token-danger saqlanadi, vertical Select gating O'ZGARMAYDI; `ActionIcon color="red"` token saqlanadi; `ConfirmModal confirmColor` token-mos; card/modal/section spacing parity. `zod4Resolver` + permission gating O'ZGARMAYDI. Test: `RoleFormModal.test.tsx`, `PermissionBuilder.test.tsx` yashil.

### DS9-5 — i18n parity + yakuniy verify (i18n OWNER)
**Fayllar:** `packages/i18n/src/locales/uz.json`, `packages/i18n/src/locales/ru.json`.
**Ish:** Agar DS9-1..4 yangi ko'rinadigan matn talab qilsa (StatusPill label allaqachon mavjud kalitdan kelsa — yangi kalit SHART EMAS), uz+ru parity bilan qo'shiladi. uz/ru kalit parity tekshiruvi. **Yakuniy verify:** `bun run typecheck` · `bun run biome` · `turbo test --filter @dental/web` · light+dark vizual + dark kontrast (StatusPill/primary-soft/danger). Bu task DS9-1..4 dan keyin ishlaydi (ular yangi kalit talab qilsa).

## Parallelizm
- DS9-1, DS9-2, DS9-3, DS9-4 fayl-disjoint → parallel ishlashi mumkin.
- DS9-5 (i18n + final verify) oxirgi — ular yangi kalit qo'shsa serial.

## Invariant guard (har task)
- `packages/ui/**`, `apps/web/src/shell/**`, `apps/web/src/stores/ui-store.ts` — TEGILMAYDI.
- `*.api.ts` / `*.keys.ts` / `*.mappers.ts` / `*.schema.ts` / `*.types.ts` — logika TEGILMAYDI.
- Backend — TEGILMAYDI (yangi endpoint/migration YO'Q).
- `color:#fff` brand fill ustida YO'Q → `--on-primary`/`--text-on-danger`.
- `--ui`/`--mono` mockup alias YO'Q → `--font-sans`/`--font-mono`.
