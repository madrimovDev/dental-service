# RFC-0004: App shell & rol-adaptive navigatsiya

- **Status:** Accepted
- **Sana:** 2026-06-09
- **Bog'liq:** [RFC-0002](./0002-frontend-architecture.md), [RFC-0003](./0003-design-system-theming.md), [`docs/ux-ia-concept.md`](../ux-ia-concept.md), R1 (CLI-19), Linear CLI-87

## Kontekst

R1 — mavjud `AppLayout` o'rniga yangi qobiq. UX/IA qarori: **sidebar (rolga qarab ruxsat bo'yicha filtrlanadi) + rol bosh ekrani** (A+B gibrid). Mavjud `AppLayout` da workspace switcher dropdown, til toggle, perm-gated nav allaqachon bor — undan g'oya olinadi, lekin yangi struktura va dizayn.

## Qaror

### 1. Shell strukturasi

`apps/web/src/shell/` — `AppShell` (layout), `Topbar`, `Sidebar`, `nav-config.ts`. Mantine **`AppShell`** primitivi layout skeletoni uchun (header `--topbar-h` 58px, navbar `--sidebar-w` 244px); tarkib custom (RFC-0003 tokenlari).

```
shell/
├── AppShell.tsx         # Mantine AppShell + Topbar + Sidebar + <Outlet/>
├── Topbar.tsx
├── Sidebar.tsx
├── nav-config.ts        # deklarativ nav (yagona manba)
└── use-role-landing.ts  # rol → bosh ekran route
```

### 2. Deklarativ nav config (yagona manba)

```ts
type NavItem = { key; labelKey; icon; path; permission?: string | string[] };
type NavGroup = { labelKey; items: NavItem[] };
```

Guruhlar (UX/IA): **Bugun · Bemorlar · Klinika · Moliya · Boshqaruv**. Sidebar shu config'dan render qilinadi; element `permission` bo'yicha **auth store `hasPermission`** (`@owner` sentinel) bilan filtrlanadi. Bo'sh guruh ko'rsatilmaydi. Active indikator — joriy route bo'yicha.

### 3. Ruxsat — ikki qatlam (nav + route)

- **Nav:** ko'rinish `hasPermission` bilan filtrlanadi (faqat huquqli elementlar).
- **Route:** har himoyalangan route `RequirePermission` guard bilan o'raladi (nav yashirilsa ham, to'g'ridan URL'ni bloklaydi). Ruxsat yo'q → 403 ekran.
- Manba: JWT `permissions[]` (workspace kontekstidagi), auth store'da.

### 4. Rol bosh ekrani (landing)

- Login + workspace tanlangach → `use-role-landing` rolni aniqlab, rol dashboard route'iga `navigate` qiladi (umumiy `home` emas).
- Rol → route map: registrator→`/dashboard/reception`, doktor→`/dashboard/doctor`, menejer→`/dashboard/manager`, buxgalter→`/dashboard/accountant`, asistent→`/dashboard/assistant`, texnik→`/dashboard/lab`. Dashboard'lar o'zi R3 (CLI-65).
- **Ko'p rol bo'lsa:** default — oxirgi ishlatilgan rol (localStorage); yo'q bo'lsa ruxsat kengligi bo'yicha (Owner→manager). *(Ochiq savol.)*
- Owner (implicit superuser) → default manager dashboard, lekin hamma nav ko'rinadi.

### 5. Workspace switcher

Topbar'da joriy `Klinika · Filial`. Almashtirish → mavjud `switch-workspace` (yangi JWT + permissions) → auth store yangilanadi → rol landing'ga reset. Ko'p tenant/branch ro'yxati `/auth/me` dan.

### 6. Topbar elementlari

Workspace switcher · ⌘K qidiruv (stub, R1) · bildirishnoma (stub, R1) · til toggle (uz/ru) · theme toggle (RFC-0003) · profil menyu. Har biri alohida task (CLI-23 ostida).

### 7. Routing

- React Router. **Public** route'lar (auth: login/register/select-workspace) — shell **tashqarisida**.
- **Himoyalangan** route'lar — `AppShell` ichida (`<Outlet/>`), `ProtectedRoute` (auth tekshiruvi) + `RequirePermission` (ruxsat).
- Workspace tanlanmagan bo'lsa → `/auth/select-workspace`.

### 8. Responsive

Mantine `AppShell` navbar `collapsed` (burger) kichik ekranda. Desktop-first, lekin sidebar yig'iladi (RFC dizayn tamoyili).

## Oqibatlar

- ➕ Nav yagona deklarativ config'dan — yangi ekran qo'shish = bitta config qatori + route.
- ➕ Ruxsat ikki qatlamda (nav yashirish + route guard) — xavfsiz.
- ➕ Rol-adaptive his: har rol o'z bosh ekraniga tushadi.
- ➖ Mavjud `AppLayout` va undagi route'lar yangi shell'ga ko'chiriladi (R1 task: routing migratsiya, CLI-22).
- 🔁 Ko'p-rol default landing qoidasi tajriba bilan sozlanishi mumkin.

## Ochiq savollar

- Ko'p rolli foydalanuvchi default bosh ekrani: oxirgi-ishlatilgan vs ruxsat-kengligi? — Taklif: oxirgi-ishlatilgan (localStorage), fallback ruxsat-kengligi.
- ⌘K va bildirishnoma — R1 da stub, to'liq funksiya R5 (⌘K) / R4 (bildirishnoma). Tasdiq.
