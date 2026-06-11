# R2 — Settings (tenant/roles/branches/users): Design Spec

- **Sana:** 2026-06-11
- **Epik:** R2 / Linear CLI-60 (Settings: tenant, roles, branches, users/staff), Milestone M5
- **Bog'liq:** [RFC-0010](../../rfcs/0010-frontend-feature-architecture.md), R2 etalon, RBAC (CLAUDE.md §3.3), roles/users/branches/tenants modullari
- **Status:** Approved (brainstorm), spec → plan'ga tayyor
- **Branch:** `feat/r2-settings` (main'dan; mustaqil — billing/klinik'ga bog'liq emas)

## Maqsad

Mavjud 4 settings sahifasi (`tenant.page` 117q, `roles.page` 250q permission builder, `branches.page` 175q, `users.page` 261q) RFC-0010 `features/settings/` ga ko'chiriladi + teal re-skin, **yagona Settings shell + sub-nav** ostida. UX yaxshilash: permission builder resurs bo'yicha guruhlangan, users qidiruv/filter, `confirm()` → modal. Backend o'zgarmaydi.

> **Xizmatlar** (`services.page`) bu spec'dan **tashqarida** — alohida CLI-36 (`features/services/`).

## Qamrov

**Ichida:** `features/settings/` yagona shell + sub-nav (tenant/roles/branches/users), 4 sub-ekran re-skin, permission builder guruhlangan, users qidiruv, `confirm()`→modal, i18n uz+ru.

**Tashqarida:**
- Backend o'zgarishi YO'Q (mavjud endpointlar yetarli).
- Audit-log o'qish ekrani → R3.
- Rol shabloni/import → keyin.
- Xizmatlar katalogi → CLI-36.

## Qarorlar (brainstorm)

| # | Qaror | Asos |
|---|---|---|
| 1 | **Yagona Settings shell + sub-nav** | Yagona IA, R0 shell'ga mos |
| 2 | **Re-skin + UX** (backend o'zgarmaydi) | Foydalanuvchi tanladi |
| 3 | **Permission builder resurs bo'yicha guruhlangan** | 250q checkbox'lar — guruhlash o'qilishini oshiradi |
| 4 | **Users qidiruv/filter + status** | 261q ro'yxat — qulaylik |

## 1. `features/settings/` (kanonik RFC-0010)

```
apps/web/src/features/settings/
├── index.ts
├── settings.keys.ts        # settingsKeys.roles / role(id) / users / branches / tenant / permissions
├── settings.types.ts       # PermissionGroup, RoleVM, UserAssignmentVM, BranchVM
├── settings.mappers.ts     # REAL (sof): groupPermissionsByResource(perms); role→VM; assignment→VM; users qidiruv filtri
├── settings.api.ts         # hooks: useRoles/useRole/useUpsertRole/useDeleteRole/usePermissions/useUsers/useInviteUser/useAssignment.../useBranches/useUpsertBranch/useTenant/useUpdateTenant
├── settings.schema.ts      # role/branch/tenant/invite form Zod
└── components/
    ├── SettingsShell.tsx       # PageHead + sub-nav (Tabs yoki SegmentedControl) → 4 sub-ekran
    ├── TenantSettingsScreen.tsx
    ├── RolesSettingsScreen.tsx     # rollar ro'yxati + RoleFormModal
    ├── RoleFormModal.tsx           # nom/tavsif + PermissionBuilder
    ├── PermissionBuilder.tsx       # resurs bo'yicha guruhlangan checkbox'lar (guruh toggle + individual)
    ├── BranchesSettingsScreen.tsx  # branch CRUD
    └── UsersSettingsScreen.tsx     # assignments ro'yxati + qidiruv/filter + invite + reset-password
```

**Qatlam:** `components → settings.api.ts (hooks) → api-client`. `settings.mappers.ts` sof (permission guruhlash, qidiruv filtri).

## 2. Settings shell + routing

- **SettingsShell:** `PageHead` ("Sozlamalar") + sub-nav (`Tabs` yoki vertical `NavLink` guruhi): Tenant · Rollar · Filiallar · Xodimlar. Har biri ruxsat bilan filtr (`tenant.view`/`role.view`/`branch.view`/`user.view`).
- **Routing:** `/settings/*` ostida sub-route'lar yoki bitta sahifada tab-state. Mavjud route'lar (`/settings/tenant`, `/settings/roles`, ...) saqlanadi — App.tsx page'lari yupqa entry, shell sub-nav ularga mos. Plan'da: yo nested routes yo tab-state (mavjud route nomlari buzilmaydi).

## 3. Sub-ekranlar (re-skin)

### 3.1 RolesSettingsScreen + PermissionBuilder (asosiy UX)
- Rollar ro'yxati (Card/Table) + "Yangi rol" (`role.manage`).
- **RoleFormModal:** nom + tavsif + **PermissionBuilder**.
- **PermissionBuilder:** `api.permissions.list` (yoki mavjud manba) → mapper resurs bo'yicha guruhlaydi (`patient.*`, `cashier.*`, `appointment.*`, ...). Har guruh: sarlavha + "hammasini tanlash" toggle + individual checkbox'lar. Tanlangan permission'lar role'ga (`role.manage`).
- **Owner superuser** — implicit, role'da ko'rsatilmaydi (CLAUDE.md §3.3).

### 3.2 UsersSettingsScreen
- Assignments ro'yxati (user × branch × role) — qidiruv (ism/telefon) + filial/rol filter (mapper sof filtr).
- Invite (`user.invite`), assignment qo'shish/tahrirlash/o'chirish (`user.manage`), reset-password (modal confirm).
- Status ko'rsatish (faol/taklif kutilmoqda).

### 3.3 BranchesSettingsScreen
- Branch CRUD (Card/Table) — create/edit modal, delete (modal confirm). `branch.create/edit/delete` gating.

### 3.4 TenantSettingsScreen
- Tenant nomi/ma'lumot (`tenant.edit`), transfer ownership (ehtiyotkor — confirm modal).

## 4. i18n + R0 primitiv

- `settings.*` namespace: shell nav, permission guruh nomlari (resurs bo'yicha), users qidiruv/status, confirm modallar → **uz + ru**. Mavjud `roles.*`/`users.*`/`branches.*`/`tenant.*` kalitlar saqlanadi/birlashtiriladi.
- R0: `PageHead`, `Tabs`/`SegmentedControl`/`NavLink`, `Card`, `Table`, `Modal`, `Checkbox`, `TextInput`, `Select`, `Badge`/`StatusPill`, `Button`.

## 5. Testlar

- **`settings.mappers.test.ts`** (eng muhim): `groupPermissionsByResource` (kod prefiksi bo'yicha guruh, tartib); users qidiruv filtri (ism/telefon); role→VM.
- **`settings.keys.test.ts`**: factory.
- **`PermissionBuilder`** behavioral: guruh toggle hammasini tanlaydi; individual checkbox; saqlash → `upsertRole` to'g'ri permission ro'yxati bilan.
- **`UsersSettingsScreen`** behavioral: qidiruv filtrlaydi.
- **`SettingsShell`** smoke: sub-nav ko'rsatadi.

## 6. Verifikatsiya

- `turbo test --filter @dental/web` + typecheck + build.
- Dev fidelity (inson): shell sub-nav, rol yaratish + guruhlangan permission builder, users qidiruv/invite/reset, branch CRUD, tenant edit, ruxsat gating.

## Qurilish tartibi (plan'da)

1. `features/settings/` skelet: keys → types → mappers (+test) → api hooks → schema.
2. SettingsShell + sub-nav + routing migratsiya (mavjud route nomlari saqlanadi).
3. RolesSettingsScreen + RoleFormModal + PermissionBuilder (guruhlangan) + behavioral test.
4. UsersSettingsScreen (qidiruv/invite/reset) + BranchesSettingsScreen + TenantSettingsScreen.
5. i18n + yupqa page entry'lar (4 settings page → features komponentlari).
6. Verifikatsiya.

## Ochiq mayda nuqtalar (plan'da)

- Routing: nested `/settings/*` route'lar vs bitta sahifa tab-state — mavjud route nomlari va shell nav'ga moslab plan'da.
- Permission manbai: `api.permissions.list` mavjudligini tekshirish (yo'q bo'lsa, qaysi endpoint). Resurs guruh nomlari i18n.
- `confirm()` → Mantine modal pattern (queue/services bilan bir xil).
