# DS9 — Xodimlar + Ombor (Settings / Stock / Payroll) — Dental OS re-skin Design Spec

**Sana:** 2026-06-22
**Milestone:** DS9 (Dental OS vizual redesign — `07-Dental-OS-Roadmap.md`)
**Dizayn manbasi:** `Dental OS.dc.html` (claude.ai/design), DS0 tokenlari (`packages/ui/src/theme/tokens.css`) — LOCKED, DS0 da remap qilingan.
**Qarorlar:** #32 (token remap-in-place), #33 (pixel-parity, funksiya saqlanadi), #35 (per-milestone sikl), #20 (form primitiv error signature), #21 (danger red token), CLI-181 (status indikator konvensiya), CLI-80 (dark kontrast).
**Eslatma:** Bu milestone uchun `docs/superpowers/briefs/ds9-gap.md` brief fayli mavjud emas edi (worktree'da yo'q). Spec to'g'ridan-to'g'ri mavjud kod + DS0 konvensiyalari + `docs/design-architecture-gap-analysis.md` + `packages/ui/STATUS-INDICATORS.md` asosida tuzildi.

---

## 1. Maqsad va doira

DS9 — **Boshqaruv** nav-guruhidagi uchta ekranni (Xodimlar/Settings, Ombor/Stock, Ish haqi/Payroll) DS0 token tizimiga **front-end-only re-skin** qilish. Layout va vizual til Dental OS dizayniga moslashtiriladi; **xulq, data-hook, API kontrakt, i18n kalit semantikasi, permission/vertical gating O'ZGARMAYDI**.

**Doirada (FAQAT shu fayllar):**
- `apps/web/src/features/settings/**` — `SettingsShell`, `UsersSettingsScreen`, `RolesSettingsScreen`, `BranchesSettingsScreen`, `TenantSettingsScreen`, `StaffProfileModal`, `RoleFormModal`, `PermissionBuilder`, `ConfirmModal`.
- `apps/web/src/features/stock/**` — `StockScreen`, `StockItemsTable`, `MovementHistory`, `BomPanel`, `ItemFormModal`, `MovementFormModal`, `BatchFormModal`.
- `apps/web/src/features/payroll/**` — `PayrollScreen`.
- `packages/i18n/src/locales/{uz,ru}.json` — FAQAT belgilangan i18n-task tegadi (yangi kalit qo'shilsa).

**Doiradan tashqari (INVARIANT — TEGILMAYDI):**
- `packages/ui/src/theme/*`, `packages/ui/src/primitives/*`, `packages/ui/src/patterns/*` (LOCKED — DS0). Token qiymatlari, StatusPill/PageHead/Card/Button/Input primitivlari o'zgarmaydi.
- `apps/web/src/shell/*`, `apps/web/src/stores/ui-store.ts` (LOCKED — DS0).
- Barcha `*.api.ts`, `*.keys.ts`, `*.mappers.ts`, `*.schema.ts`, `*.types.ts` — **logika** o'zgarmaydi (faqat agar re-skin DTO talab qilsa — talab qilmaydi). Backend TEGILMAYDI (yangi endpoint/migration/hook YO'Q).
- Permission gating (`hasPermission`, `canManage`, `SettingsShell` tab filtri), vertical gating, RBAC.
- Form xulqi: `@mantine/form` + `zod4Resolver`, validatsiya, submit oqimi, mutation `onError`/`onSuccess`.

## 2. Qulflangan qarorlar (DS0 konvensiyasidan meros)

| # | Qaror |
|---|---|
| Token | Faqat DS0 tokenlarini iste'mol qil (`var(--…)`). Yangi token YARATILMAYDI. `--ui`/`--mono` mockup aliaslari YO'Q → `--font-sans`/`--font-mono`. |
| Dark kontrast | Brand fill ustida `color:#fff` hardcode YO'Q → `--on-primary`/`--text-on-danger` (CLI-80 WCAG AA). |
| Status indikatori | **Semantik, cheklangan holat** → `StatusPill` (token-izchil, dot). **Dinamik/boolean/sanoq** → Mantine `Badge` qoladi (CLI-181). Off-brand `green/blue/yellow/orange` → quyidagi §4 mapping bo'yicha token-statusga ko'chiriladi. |
| Tanlangan qator (row selection) | `bg='var(--mantine-color-blue-light)'` (off-brand) → `bg='var(--primary-soft)'` (token, light+dark ishlaydi). Bu **vizual parity tuzatish**, xulq o'zgarmas. |
| Sahifa sarlavhasi | Raw `<Title order={2}>` (Payroll) → `PageHead` (boshqa ekranlar bilan parity). |
| Form primitivlari | Mantine `TextInput`/`Select`/`NumberInput` teal-tema bilan allaqachon DS0-mos (Qaror #19/#20). Migratsiya YO'Q — faqat `color="…"` token-statusga, modal/card spacing parity. |
| i18n | Yangi kalit FAQAT yangi ko'rinadigan matn kerak bo'lsa (masalan StatusPill label allaqachon mavjud kalitdan kelsa — yangi kalit shart emas). Mavjud kalitlar QAYTA ishlatiladi. |

## 3. Token cheat-sheet (DS0 — iste'mol uchun)

| Maqsad | Token |
|---|---|
| Fon / sahifa | `--bg` |
| Karta yuzasi | `--surface`, ko'tarilgan `--surface-raised`, ikkilamchi `--surface-2` |
| Chegara | `--border`, kuchli `--border-strong`, nozik `--border-subtle` |
| Matn | `--text` / `--ink`, ikkilamchi `--text-2`, uchlamchi `--text-3` |
| Brand | `--primary`, hover `--primary-hover`/`--primary-strong`, yumshoq `--primary-soft`/`--primary-tint` |
| Brand ustidagi matn | `--on-primary` |
| Status (success) | `--success` / `--success-soft` |
| Status (warning/amber) | `--warning` / `--warning-soft` |
| Status (danger) | `--danger` / `--danger-soft`, matn `--text-on-danger` |
| Status (info) | `--info` / `--info-soft` |
| Mono (raqam/parol) | `--font-mono` |
| Radius | `--radius-*` (pill `--radius-pill`) |
| Soya | `--shadow-sm` / `--shadow` / `--shadow-lg` |

## 4. Komponent-bo'yicha re-skin

### 4.1 Settings (`features/settings`)

**`SettingsShell`** — `padding: 24` inline → token-mos konteyner; `PageHead` allaqachon ishlatadi (saqlanadi). Pill `Tabs` (`@dental/ui` Tabs) saqlanadi (DS0-mos). Tab filtri (`hasPermission`) O'ZGARMAYDI. Yumshoq spacing/heading parity.

**`UsersSettingsScreen`:**
- Filtr qatori (`TextInput` qidiruv + 2× `Select`): surface-card ichiga olib, spacing parity.
- Jadval: `StatusPill` ga ko'chirish — `Badge color={isActive?'teal':'gray'}` → `<StatusPill status={isActive?'success':'neutral'}>` (semantik, cheklangan holat; CLI-181 "success/neutral"). Label kalitlari (`users.active`/`users.inactive`) O'ZGARMAYDI.
- `ActionIcon` ranglari: `color="gray"` (edit) saqlanadi (neutral), `color="blue"` (reset) → token-mos `color="teal"` yoki `var(--info)` style; `color="red"` (delete) saqlanadi (CLI-180 token-danger). **Qaror:** edit=subtle gray, reset=subtle (info tone), delete=subtle danger — token izchil.
- Modal (`Invite`, `Reset result`): temp-parol matni `ff="monospace"` → `--font-mono` (DS0 mono). `Alert color="teal"/"blue"` → token-mos variant; xabar matni i18n O'ZGARMAYDI.
- Submit oqimi, `alreadyExists` xabari (CLI-158), `notifications.show` O'ZGARMAYDI.

**`RolesSettingsScreen`:**
- `Badge color="blue">{system}</Badge>` (tizim roli yorlig'i — semantik, cheklangan) → `<StatusPill status="accent">` (brand-tint, system roli = aksent).
- `ActionIcon color="red"` (delete) saqlanadi. Jadval spacing/heading parity.

**`BranchesSettingsScreen`:**
- "Xodimlar soni" `Badge` (CLI-159, sanoq/count) → **Mantine `Badge` SAQLANADI** (CLI-181: sanoq StatusPill emas). Token-neutral ko'rinish.
- `ActionIcon color="red"` (delete) saqlanadi. Modal spacing parity.

**`TenantSettingsScreen`:**
- `Alert color="yellow"` (ogohlantirish) → `Alert color="orange"` token-warning emas — Mantine `yellow`≠amber (CLI-181 won't-fix). **Qaror:** warning Alert'lar `var(--warning)` ohangiga moslash uchun `variant="light"` saqlanadi; agar churn past bo'lsa `Alert` ni surface-warning card bilan o'rab token-amber beriladi. Aks holda `color="yellow"` **saqlanadi** (CLI-181 deferred — off-brand, won't-fix). PII/ownership transfer xulqi O'ZGARMAYDI.
- "Transfer ownership" `Button color="red" variant="light"` saqlanadi (danger token). Vertical Select (Stomatologiya/Umumiy) gating O'ZGARMAYDI.
- Parol/maxfiy maydon `PasswordInput` saqlanadi.

**`StaffProfileModal`, `RoleFormModal`, `PermissionBuilder`, `ConfirmModal`:** spacing/heading/section parity; form xulqi va `zod4Resolver` O'ZGARMAYDI. `ConfirmModal` `confirmColor` token-mos (danger=red token).

### 4.2 Stock (`features/stock`)

**`StockScreen`:**
- `PageHead` saqlanadi. `Alert color="orange"` (expiring batches ogohlantirishi) → token-warning ohang: Mantine `orange`≈amber, lekin token izchillik uchun `var(--warning)` ohangiga moslash — **Qaror:** `color="orange"` **saqlanadi** (warning ohangi, CLI-181 off-brand deferred) YOKI surface-warning card bilan o'rash. Tavsiya: saqlash (past churn, deferred-consistent).
- `Tabs` (items/bom) DS0-mos teal-tema (saqlanadi).
- Filtr `Select` + `Grid` (jadval 7 / tarix 5) layout parity; `Card withBorder` → token surface/border (Mantine `withBorder` allaqachon `--border` token oladi DS0 cssVarsResolver orqali — saqlanadi).

**`StockItemsTable`:**
- Tanlangan qator: `bg='var(--mantine-color-blue-light)'` → `bg='var(--primary-soft)'` (token, off-brand fix).
- `Badge color="red">{low}</Badge>` / `Badge color="teal" variant="light">{ok}</Badge>` → `StatusPill`: low → `status="danger"`, ok → `status="success"` (semantik, cheklangan). Label kalitlari O'ZGARMAYDI.
- Past-qoldiq miqdor `Text c={low?'red':undefined}` → `c={low?'var(--danger)':undefined}` (token). `formatQty` O'ZGARMAYDI.
- "Harakat" `Button variant="light"` saqlanadi (teal token), `stopPropagation` xulqi O'ZGARMAYDI.

**`MovementHistory`, `BomPanel`, `*FormModal`:** spacing/heading/section parity; `BomPanel` `color="red"` (delete) saqlanadi; form xulqi + `zod4Resolver` O'ZGARMAYDI.

### 4.3 Payroll (`features/payroll`)

**`PayrollScreen`:**
- Raw `<Title order={2}>{payroll.title}</Title>` → **`PageHead title={t('payroll.title')}`** (boshqa ekran bilan parity). Yangi import.
- `statusBadge`: `Badge color={finalized?'green':'gray'}` → `StatusPill`: finalized → `status="success"`, draft → `status="neutral"`. Label kalitlari (`payroll.status_label.*`) O'ZGARMAYDI.
- Tanlangan run qatori: `bg='var(--mantine-color-blue-light)'` → `bg='var(--primary-soft)'` (token, off-brand fix). 2 sayt (runs jadval + agar mavjud bo'lsa).
- "Finalize" `Button color="green"` → token-mos: `color="teal"` (success=primary token DS0 da `--success`=`--primary`). Mutation `finalizeRun` xulqi O'ZGARMAYDI.
- Davr-tanlash `Card` + `DatePickerInput type="range"` + submit: spacing parity, form `zod4Resolver` O'ZGARMAYDI. `formatCurrency`/`formatNumber` O'ZGARMAYDI.
- Run-detali jadval (employee/salary/revenue/commission/total): `fw={600}` total ustun saqlanadi; raqam ustunlar `ta="right"` saqlanadi; ixtiyoriy mono (`--font-mono`) raqamlar uchun parity.

## 5. Deferred / omitted (data-gap)

- **Yangi backend YO'Q.** Hech bir ekran yangi field/endpoint/hook qo'shmaydi. Mavjud data-hook'lar (`useStockItems`, `usePayrollRuns`, `useUsers`, `useBranches`, `useRoles`, …) O'ZGARMAGAN holda qoladi.
- **Off-brand status (CLI-181 deferred):** `green/blue/yellow/orange` Mantine default palitralari — semantik, cheklangan holatlar `StatusPill` token-statusga ko'chiriladi (§4). Qolgan **dinamik/sanoq** `Badge`'lar (branch xodim soni) off-brand bo'lib **saqlanadi** (won't-fix, CLI-181 — nom≠semantika, churn nomutanosib). Warning `Alert`lar (`yellow`/`orange`) token-amber'ga to'liq mos kelmaydi → past-churn uchun saqlanadi (deferred).
- **Vertical gating UI** (TenantSettings vertikal Select) — mavjud, o'zgarmaydi.

## 6. Test strategiyasi (TDD, characterization)

Har task **avval test** (mavjud testni qulflash yoki yangi parity test), keyin re-skin.

- **Settings:** `UsersSettingsScreen.test.tsx`, `SettingsShell.test.tsx`, `PermissionBuilder.test.tsx`, `RoleFormModal.test.tsx`, `StaffProfileModal.test.tsx` mavjud — yashil qolishi shart (characterization: tab filtri, invite oqimi, permission gating). StatusPill ko'chgan joyda label matni (`users.active`/`inactive`) hali ham DOM'da bo'lishini tasdiqlovchi assertion (selector `Badge`→`StatusPill`'ga moslanadi).
- **Stock:** `StockItemsTable.test.tsx` mavjud — low/ok holat va `onSelect`/`onMovement` xulqi yashil. StatusPill migratsiyasidan keyin label assertion'lar saqlanadi (matn-bo'yicha, role-bo'yicha emas).
- **Payroll:** `payroll.mappers.test.ts` mavjud — VM mapping O'ZGARMAYDI (re-skin mapper'ga tegmaydi). Yangi yengil `PayrollScreen` render-smoke test (PageHead title, status pill label, finalize gating) ixtiyoriy qo'shiladi.
- **Mappers/keys/schema testlari** (`settings.mappers.test.ts`, `settings.keys.test.ts`, `stock.mappers.test.ts`, `stock.keys.test.ts`) — TEGILMAYDI, yashil qoladi (re-skin logikaga tegmaydi).
- **Verify (har task oxirida):** `bun run typecheck` · `bun run biome` · `turbo test --filter @dental/web`. Vizual: dizaynga side-by-side (light + dark), dark kontrast (StatusPill/danger/primary-soft).

## 7. Xavf-xatarlar

- **StatusPill label regressioni:** `Badge`→`StatusPill` ko'chishda i18n label tasodifan o'zgarishi. → Mitigatsiya: label `t(...)` kalitini O'ZGARTIRMASLIK; characterization test matnni qulflaydi.
- **Row-selection token (`--primary-soft`) kontrasti:** dark-mode'da tanlangan qator + matn kontrasti. → DS0 `--primary-soft` dark qiymati (#16332C) tekshiriladi; matn `--text` ustida AA.
- **Off-brand Alert (warning) saqlanishi:** dizayndan piksel-farq qolishi mumkin (amber emas, yellow/orange). → CLI-181 deferred-consistent; DS11 (Polish) da named-token palette bilan hal qilinadi. DS9 da churn nomutanosib.
- **PageHead kiritish (Payroll):** import + layout shift. → `Container size="xl"` + `Stack` saqlanadi; faqat `Title`→`PageHead` almashinadi.
- **i18n serial resurs:** faqat bitta task `touchesI18n=true`. Yangi kalit MINIMAL (ko'pchilik mavjud kalitni qayta ishlatadi).

## 8. Bajarish tartibi (plan uchun)

1. Stock re-skin (StockScreen + StockItemsTable + MovementHistory/BomPanel/modallar) — StatusPill + token row-selection.
2. Payroll re-skin (PayrollScreen) — PageHead + StatusPill + token row-selection.
3. Settings re-skin A (SettingsShell + UsersSettingsScreen + StaffProfileModal) — StatusPill + ActionIcon token.
4. Settings re-skin B (Roles + Branches + Tenant + RoleFormModal + PermissionBuilder + ConfirmModal) — StatusPill (system role) + token Alert/Button.
5. i18n parity (yangi kalit bo'lsa uz+ru) + yakuniy verify (typecheck/biome/test, light+dark vizual).
