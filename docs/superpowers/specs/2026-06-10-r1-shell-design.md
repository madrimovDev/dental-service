# R1 — Shell (rolga moslashuvchi qobiq): Design Spec

- **Sana:** 2026-06-10
- **Epik:** R1 / Linear CLI-19 (sub: CLI-20..23, CLI-31), Milestone M4
- **Bog'liq:** [RFC-0004](../../rfcs/0004-app-shell-navigation.md), [RFC-0002](../../rfcs/0002-frontend-architecture.md), [RFC-0003](../../rfcs/0003-design-system-theming.md), clinik bundle (`app/shell.js`, `app/kit.css`), R0 (`packages/ui`)
- **Status:** Approved (brainstorm), spec → plan'ga tayyor
- **Branch:** `feat/r1-shell` (main'dan, R0 merge qilingan — cc225a9)

## Maqsad

Mavjud `AppLayout` o'rniga yangi qobiq (shell): Mantine `AppShell` + clinik-dizaynli Topbar + Sidebar + deklarativ nav config + ikki qatlamli ruxsat (nav filtr + route guard). Barcha mavjud sahifalar yangi shell ichiga ko'chiriladi. R0 primitivlarining birinchi real iste'molchisi.

## Qamrov

**R1 ichida:** shell struktura, topbar, sidebar, nav config (to'liq clinik NAV), routing migratsiya, ruxsat guard (nav + route + 403), responsive, theme toggle (R0'dan ko'chirilgan).

**R1 dan TASHQARI (keyingi epiklar):**
- Rol dashboard'lar + rol-adaptive landing + rol manbai → **R3** (CLI-65). R1'da login → umumiy default route (`/`).
- ⌘K to'liq command palette → **R5**. R1'da stub.
- Bildirishnoma → **R4**. R1'da stub.
- Workspace switcher modal → **R5**. R1'da mavjud `/select-workspace` route.

## Qarorlar (brainstorm)

| # | Qaror | Asos |
|---|---|---|
| 1 | **R1 = faqat shell**, rol-adaptive landing R3'ga | YAGNI — landing bo'sh dashboard'larsiz ma'nosiz; auth'da rol nomi yo'q (faqat `permissions[]`) |
| 2 | **To'liq clinik NAV**, kelajak elementlar `disabled` | Foydalanuvchi to'liq vizyon tanladi |
| 3 | **Branch:** PR #1 main'ga merge → `feat/r1-shell` main'dan | Toza tarix, R1 mustaqil PR |

## Struktura (RFC-0004 §1)

```
apps/web/src/shell/
├── AppShell.tsx            # Mantine AppShell + Topbar + Sidebar + <Outlet/>
├── Topbar.tsx              # workspace switcher, search stub, theme, bell stub, til, profil
├── Sidebar.tsx             # nav-config'dan render, ruxsat filtr + disabled, active indikator
├── nav-config.ts           # deklarativ nav (yagona manba)
├── RequirePermission.tsx   # route-level ruxsat guard → /403
└── index.ts
```

- Mantine **`AppShell`** layout skeletoni: `header={{ height: 58 }}`, `navbar={{ width: 244, breakpoint: 'sm', collapsed: { mobile: !opened } }}`. O'lchamlar token'lardan (`--topbar-h` 58px, `--sidebar-w` 244px).
- Eski **`apps/web/src/components/layout/AppLayout.tsx` o'chiriladi** (g'oyalari ko'chiriladi: workspace switch, til, profil menu, perm-gated nav).

## Nav config — disabled-nav rule (advisor #1)

To'liq clinik NAV — 5 guruh (clinik `shell.js` NAV bilan mos):

```ts
type NavItem = {
  key: string;
  labelKey: string;          // i18n key (nav.*)
  icon: LucideIcon;          // lucide-react
  path: string;
  permission?: string | string[];  // LIVE — auth store hasPermission bilan filtrlanadi
  disabled?: true;                  // FUTURE (R3/R4) — hammaga ko'rinadi, bosib bo'lmaydi
  countKey?: string;                // ixtiyoriy badge (keyin)
};
type NavGroup = { labelKey: string; items: NavItem[] };
```

**Qoida (KRITIK — ikkitadan biri):**
- **LIVE element** (mavjud sahifa) → `permission` bor; `hasPermission` (`@owner` sentinel) bilan filtrlanadi; ruxsatsizga **yashirin**.
- **FUTURE element** (lab/rx/plans/payroll/stock/reports/audit/KPI/expenses — katalogda permission'i YO'Q) → `disabled: true`; **hammaga** kulrang "tez orada" ko'rinadi (permission tekshirilmaydi); bosib bo'lmaydi (`onClick` yo'q, `aria-disabled`).
- Element `permission` VA `disabled` ikkalasini olmaydi.

**Guruhlar + elementlar:**

| Guruh | Element | Holat | path / permission |
|---|---|---|---|
| **Bugun** | Bosh ekran | LIVE | `/` (permission yo'q — hammaga) |
| | Kalendar | LIVE | `/appointments` · `appointment.view` |
| | Navbat tablosi | LIVE | `/queue` · `queue.view` |
| **Bemorlar** | Bemorlar ro'yxati | LIVE | `/patients` · `patient.view` |
| | Yangi bemor | LIVE | `/patients/new` · `patient.create` |
| **Klinika** | Davolash rejalari | FUTURE | `disabled` |
| | Lab buyurtmalari | FUTURE | `disabled` |
| | Reseptlar | FUTURE | `disabled` |
| **Moliya** | Kassa | LIVE | `/cashier` · `cashier.view` |
| | Tranzaksiyalar | FUTURE | `disabled` |
| | Xarajatlar | FUTURE | `disabled` |
| | Ish haqi | FUTURE | `disabled` |
| **Boshqaruv** | Dashboard / KPI | FUTURE | `disabled` |
| | Hisobotlar | FUTURE | `disabled` |
| | Xizmatlar va narxlar | LIVE | `/settings/services` · `service.view` |
| | Filiallar | LIVE | `/settings/branches` · `branch.view` |
| | Rollar | LIVE | `/settings/roles` · `role.view` |
| | Foydalanuvchilar | LIVE | `/settings/users` · `user.view` |
| | Ombor | FUTURE | `disabled` |
| | Audit log | FUTURE | `disabled` |
| | Sozlamalar (tenant) | LIVE | `/settings/tenant` · `tenant.view` |

> Bo'sh guruh (hamma element yashirin) ko'rsatilmaydi. Active indikator joriy route bo'yicha (clinik: chap primary bar + `--primary-tint` fon).
> ⚠️ Oqibat: ruxsati cheklangan rol ham disabled "Payroll/Audit/Hisobot" ni ko'radi — "to'liq vizyon" qarori (ataylab).

## Routing tree (advisor #3)

`apps/web/src/app/App.tsx` qayta quriladi:

```
<BrowserRouter>
  <Routes>
    {/* Public — shell tashqarisida */}
    /login /register-tenant /forgot-password /reset-password /select-workspace

    {/* Dev — shell tashqarisida (sof galereya, R0) */}
    {import.meta.env.DEV && /dev/ds}

    {/* Protected — AppShell layout route, Outlet */}
    <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/patients" element={<RequirePermission perm="patient.view"><PatientsListPage/></RequirePermission>} />
      ... (barcha mavjud protected sahifalar, har biri RequirePermission bilan)
    </Route>

    /403 — RuxsatYo'q ekrani (shell ichida yoki tashqarisida — shell ichida, nav ko'rinsin)
    * — Navigate to "/"
  </Routes>
</BrowserRouter>
```

- **`ProtectedRoute`** (mavjud, auth tekshiruvi) — layout route'da bir marta; workspace tanlanmagan → `/select-workspace` redirect (mavjud xulq saqlanadi/qo'shiladi).
- **`RequirePermission perm="..."`** (yangi) — har himoyalangan element'ni o'raydi; `hasPermission` false → `<Navigate to="/403">`. Nav yashirin bo'lsa ham to'g'ridan URL'ni bloklaydi (RFC §3).
- **`/403`** — sodda ekran (R0 `Card` + `PageHead` + "Bosh ekranga qaytish" `Button`). Shell ichida (foydalanuvchi nav'dan boshqa joyga o'tsin).
- **`/dev/ds`** shell TASHQARISIDA saqlanadi (chrome'siz galereya).
- **R0 vaqtinchalik dark toggle App.tsx'dan OLIB TASHLANADI** → Topbar'ga ko'chadi.

## Topbar — R0 primitiv iste'moli (advisor #4)

clinik tartibi (`shell.js` topbarHTML): **workspace switcher · ⌘K search (stub) · spacer · theme toggle · bell (stub) · til (UZ/RU) · profil+rol**.

| Element | Komponent | Izoh |
|---|---|---|
| Workspace switcher | Mantine `UnstyledButton` + R0 `Avatar`/logo | `Klinika · Filial` + chevron → `/select-workspace` (modal R5) |
| ⌘K search | R0 `Input` (readonly) yoki sodda tugma | **stub** — ko'rinadi, no-op/`/403`siz; `⌘K` kbd hint; to'liq R5 |
| Theme toggle | R0 `IconButton` (sun/moon) | `useMantineColorScheme().toggleColorScheme`; R0 toggle shu yerga ko'chadi |
| Bell (bildirishnoma) | R0 `IconButton` (dot bilan) | **stub** — no-op; to'liq R4 |
| Til (UZ/RU) | Mantine `Menu` | `i18n.changeLanguage` (mavjud xulq) |
| Profil + rol | Mantine `Menu` + R0 `Avatar` | ism + (rol o'rniga workspace/telefon — rol R3); Profil, Workspace, Logout |

> **R0 gap signali (advisor):** agar `IconButton`/`Avatar` topbar'da toza kompoz qilinmasa — bu R0 kamchiligi, hozir aniqlanadi (R2'gacha arzonroq). Spec'da kuzatiladi.
> **Mantine (layout/overlay)** raw qoladi: `AppShell`, `Burger`, `Menu` (dropdown'lar).

## Sidebar

- `nav-config.ts` dan render. `sb-top` (joriy filial label — auth store'dan branch nomi). Guruhlar (`nav-grp` + `gl` label). `nav-item` (icon + label, + active indikator).
- **Ruxsat filtr:** LIVE element `hasPermission` bilan; FUTURE element disabled (filtrlanmaydi). Bo'sh guruh yashirin.
- **Active:** `useLocation().pathname` bo'yicha (`startsWith` parent route uchun). clinik active stili (chap bar + tint) — CSS Module yoki R0 token'lar.
- **Disabled stili:** kulrang (`--text-3`), `cursor: not-allowed`, `aria-disabled`, kichik "tez orada" belgisi (ixtiyoriy `Tag`).
- Lucide ikonkalar (RFC-0003 §5; 16-18px).

## Responsive (RFC-0004 §8)

Mantine `AppShell` `navbar.collapsed.mobile` + Topbar'da `Burger` (`hiddenFrom="sm"`). Desktop-first; mobil sidebar yig'iladi/ochiladi (`useDisclosure`).

## i18n (advisor #5)

- Yangi `nav.*` kalitlar (guruh labellari + barcha element labellari, LIVE va FUTURE) → **`packages/i18n` `uz.json` + `ru.json` ikkalasi**.
- Topbar labellari (`shell.search_placeholder`, `shell.notifications`, `shell.theme`, `shell.coming_soon`, `error.403.*` h.k.) → ikkala fayl.
- Hardcoded matn YO'Q (CLAUDE.md §3.9; R0 final review aynan shu xatoni topgan edi).

## Testlar

- `nav-config` filtr logikasi: LIVE element ruxsatsiz yashirin, ruxsat bilan ko'rinadi; FUTURE disabled hamma uchun ko'rinadi (unit test, `hasPermission` mock).
- `RequirePermission`: ruxsat bor → children; yo'q → `/403` redirect (render test).
- `Sidebar`: bo'sh guruh yashirin, active element belgilangan (render test).
- Smoke: `AppShell` Topbar + Sidebar + Outlet render (renderUI + MemoryRouter).

## Verifikatsiya

- `bun --filter @dental/web build` (tsc + vite) toza.
- `turbo test` o'tadi.
- Dev server `/` (shell ichida) — login→shell, nav ruxsat bo'yicha, disabled elementlar kulrang, active indikator, theme toggle, til, responsive collapse, `/403` to'g'ridan-URL'da.
- Vizual: clinik `app/*.html` shell bilan mos (topbar/sidebar) — inson tekshiruvi.

## Ochiq mayda nuqtalar (plan'da)

- `sb-top` filial nomi manbai (auth store'da branch nomi bormi yoki `/auth/me`).
- ⌘K stub aniq xulqi (no-op tugma vs sodda "tez orada" tooltip).
- Profil menu'da rol o'rniga nima ko'rsatish (rol R3 — hozir telefon/workspace).
