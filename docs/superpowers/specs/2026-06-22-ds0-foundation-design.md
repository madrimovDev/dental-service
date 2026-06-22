# DS0 — Foundation: Token + Shell (Dental OS re-skin) — Design Spec

**Sana:** 2026-06-22
**Milestone:** DS0 (epik CLI-254; tasklar CLI-255…261)
**Roadmap:** Obsidian `07-Dental-OS-Roadmap.md`
**Dizayn manbasi:** `Dental OS.dc.html` (claude.ai/design `deb58e7d`), lokal nusxa `/tmp/dental-os.html`
**Qarorlar:** #32 (token remap-in-place), #33 (pixel-parity, funksiya saqlanadi), #34 (DS0 keystone), #35 (per-milestone sikl)

---

## 1. Maqsad va doira

DS0 — Dental OS vizual redesignning **poydevori**. Butun ilovaning token tizimi va shell'i (sidebar, topbar, command palette, notif, theme) yangi dizaynga moslashtiriladi. Tugagach barcha ekran avtomatik yangi palitra + shriftga o'tadi; keyingi DS1–DS11 faqat per-ekran layout parity bilan shug'ullanadi.

**Doirada:** `packages/ui/src/theme/*` (tokenlar, shriftlar, Mantine theme), `apps/web/src/shell/*` (Sidebar, Topbar, AppShell, CommandPalette, nav-config), `apps/web/src/features/notifications/components/NotificationBell*`, i18n.

**Doiradan tashqari (INVARIANT — o'zgarmaydi):**
- Permission gating logikasi (`isVisible`, `RequirePermission`, `hasPermission`).
- Routing registry (`app/routes.tsx`, feature `*.routes.tsx`).
- Feature/vertical gating (`requireFeature`, `useVertical`, `nav-config` feature flag).
- Workspace/branch switch mexanizmi (`useSwitchWorkspace`, JWT, query clear).
- Backend — TEGILMAYDI (yangi endpoint yo'q).
- Per-ekran sahifa tarkibi (DS1+ da).

## 2. Qulflangan qarorlar (brainstorm 2026-06-22)

| # | Qaror |
|---|---|
| Token strategiya | **Remap-in-place** — nomlar saqlanadi, qiymat+shrift o'zgaradi (#32). |
| Shrift | **Self-host @fontsource** — `@fontsource-variable/hanken-grotesk` + `@fontsource/jetbrains-mono`. CDN EMAS (Electron/offline). |
| Ikonka | **Mavjud lucide-react'ni moslash** — dizayn ikonkalari → eng yaqin lucide. Nodir (tooth) inline SVG. Yangi ikonka tizimi YO'Q. |
| Nav guruhlash | Mavjud 5 guruh / 28 element → dizaynning **3 guruhi** (Asosiy / Klinika / Boshqaruv) **superset** sifatida. Hech qaysi element/funksiya yo'qotilmaydi. |
| Dark selektor | Mantine standarti `[data-mantine-color-scheme="dark"]` qoladi (dizayn `[data-theme]` EMAS). |
| DS11 | Alohida milestone (Polish & QA). |

## 3. DS0.1 — Token remap (`packages/ui/src/theme/tokens.css`)

Token NOMLARI saqlanadi; QIYMATLAR Dental OS'ga. `--*-bg` (mavjud consumerlar) saqlanadi VA `--*-soft` aliaslar qo'shiladi (bir xil qiymat) — dizayn-sodiq yangi kod uchun.

### Light (`:root`)
| Token | Eski | Yangi (Dental OS) |
|---|---|---|
| `--bg` | #f3f8f7 | **#F1F3EF** |
| `--surface` | #ffffff | #FFFFFF |
| `--surface-2` | #e9f2ef | **#F6F8F4** |
| `--surface-raised` | #ffffff | #FFFFFF |
| `--sidebar` *(yangi)* | — | **#FAFBF8** |
| `--border` | #dce7e4 | **#E4E8E1** |
| `--border-subtle` | #eaf1ef | **#EEF1EC** (derived) |
| `--border-strong` | #c4d6d2 | **#D3D9CF** |
| `--text` / `--ink` | #0e1f1d | **#192420** |
| `--text-2` / `--ink-2` | #41605b | **#4C5852** |
| `--text-3` / `--ink-3` | #52706a | **#7A857E** |
| `--text-on-primary` / `--on-primary` | #ffffff | #FFFFFF |
| `--primary` | #0e9384 | **#0B7A6B** |
| `--primary-hover` / `--primary-strong` | #0b7268 | **#096154** |
| `--primary-tint` / `--primary-soft` | #e9f8f4 | **#DDEFEA** |
| `--primary-tint-2` | #d2f0e8 | **#C9E7DF** (derived) |
| `--danger` | #dc2626 | **#CC3D3A** |
| `--danger-bg` / `--danger-soft` | #fbe6e5 | **#FBE7E5** |
| `--warning` | #b45309 | **#B57611** |
| `--warning-bg` / `--warning-soft` | #faefdb | **#F7ECD6** |
| `--info` | #0e7490 | **#2A66CC** |
| `--info-bg` / `--info-soft` | #e0f0f3 | **#E2EAFB** |
| `--success` | #15803d | **#0B7A6B** |
| `--success-bg` / `--success-soft` | #e6f4ea | **#DDEFEA** |
| `--violet` *(yangi)* | — | **#7C4DD6** |
| `--violet-soft` *(yangi)* | — | **#ECE4FB** |

### Dark (`[data-mantine-color-scheme="dark"]`)
| Token | Yangi |
|---|---|
| `--bg` | #0B100E |
| `--surface` | #161F1B |
| `--surface-2` / `--surface-raised` | #1D2824 |
| `--sidebar` | #0E1512 |
| `--border` | #2A352F · `--border-strong` #3B4A43 |
| `--text/ink` | #EDF2EF · `-2` #AAB6B0 · `-3` #7E8B84 |
| `--primary` | #2CB9A2 · `-strong` #40CFB7 · `-soft` #16332C · `--on-primary` #04130F |
| `--danger` | #F26B64 · soft #341917 |
| `--warning` | #E4AB44 · soft #332814 |
| `--info` | #6A9BF2 · soft #172642 |
| `--success` | #2CB9A2 · soft #16332C |
| `--violet` | #B093EE · soft #241B39 |

### Layout + shadow
- `--sidebar-w: 266px` (eski 244), yangi `--sidebar-rail-w: 76px`, `--topbar-h: 62px` (eski 58).
- Shadow qiymatlari dizayndan (sm/`--shadow`/lg) light+dark uchun.
- `--focus-ring`: `color-mix(in srgb, var(--primary) 40%, transparent)` (o'zgarmaydi, primary yangi).

### Mantine theme sync (`mantine-theme.ts`)
- `colors.teal` ramp 600/700 → #0B7A6B/#096154; 400 → #2CB9A2 (dark primary). Qolgan stoplar interpolatsiya. `primaryShade {light:6, dark:4}` qoladi. **`teal-sync.test.ts` kutilgan qiymatlari yangilanadi.**
- `colors.red` ramp danger → #CC3D3A (light 6) / #F26B64 (dark 4). **`danger-red-sync.test.ts` yangilanadi.**
- `fontFamily`/`fontFamilyMonospace` `var(--font-sans)`/`var(--font-mono)` qoladi (DS0.2 qiymatni o'zgartiradi).

## 4. DS0.2 — Shriftlar (`fonts.ts` + tokenlar)

- `package.json` (`packages/ui`): `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono` o'chiriladi; `@fontsource-variable/hanken-grotesk`, `@fontsource/jetbrains-mono` qo'shiladi.
- `fonts.ts`: importlar almashtiriladi (Hanken Grotesk variable wght 400-800; JetBrains Mono 400/500/700).
- `tokens.css`: `--font-sans: 'Hanken Grotesk Variable', system-ui, sans-serif`; `--font-mono: 'JetBrains Mono', ui-monospace, monospace`.
- `--num: "tnum" 1` (raqam tabular) saqlanadi.
- FOUT yo'q (self-host bundle).

## 5. DS0.3 — Sidebar (`shell/Sidebar.tsx` + `Sidebar.module.css` + `AppShell.tsx`)

### Rail-collapse (yangi imkoniyat)
- Zustand ui store'ga `sidebarRail: boolean` (persist). `AppShell` navbar width `rail ? var(--sidebar-rail-w) : var(--sidebar-w)`.
- Rail rejimida: workspace switcher faqat avatar; nav element icon-only (label `display:none`, tooltip); group label markazlashgan/yashirin; footer icon-only.
- Collapse toggle tugma (topbar chap, DS0.4) `sidebarRail` ni almashtiradi.

### Workspace switcher topbar'dan ko'chadi
- Sidebar header'ga "DD"-avatar + klinika nomi + filial qatori dropdown. Mavjud `BranchSwitcher` mantiqini (RBAC-safe `GET /auth/workspace-branches`, `useSwitchWorkspace`) qayta ishlatadi; faqat ko'rinish dizaynga. Workspace tanlash (`/select-workspace`) navigatsiyasi saqlanadi.

### Footer (yangi)
- Sticky footer: user avatar (gradient) + ism + rol nomi + logout IconButton. Logout amali mavjud profil-menyu logout bilan bir xil.

### Nav guruhlash (3 guruh superset)
`nav-config.ts` guruhlari qayta tashkil (elementlar/permission o'zgarmaydi, faqat guruh tegishliligi + label):
- **`nav.group.asosiy`:** Home, Yozilish (appointments), Navbat (queue), Bemorlar (patients), Kassa (cashier).
- **`nav.group.klinika`:** Davolash rejalari (plans), Lab, Retsept (rx), Doktor jadvali (schedule), Recall.
- **`nav.group.boshqaruv`:** Hisobotlar (reports), Xizmatlar (services), Xodimlar (users), Ombor (stock), Moliya (cashier transactions), Xarajat (expenses), Payroll, Filiallar (branches), Rollar (roles), Audit, Sozlamalar (tenant settings). *(KPI/transactions disabled-future saqlanadi.)*
- Active state: primary-soft bg + chap accent bar (mavjud naqsh, yangi tokenlar). Badge (recall) saqlanadi.

## 6. DS0.4 — Topbar (`shell/Topbar.tsx` + `Topbar.module.css`)

- Balandlik 62px (`--topbar-h`).
- **Chap:** sidebar collapse toggle (PanelLeft icon) + **breadcrumb + sahifa sarlavhasi**.
  - **Yangi infra:** route metadata. `app/routes.tsx` `AppRoute` ga ixtiyoriy `title?` (i18n kalit) + `parent?` qo'shiladi; topbar `useLocation()` bilan joriy route title/breadcrumb'ni hosil qiladi. Default: nav element labelidan olinadi (fallback).
- **Markaz:** ⌘K qidiruv bar (mavjud `.search`, restyle).
- **O'ng:** til (UZ/RU) + theme toggle + notif bell + **"Yangi bemor" tugma** (primary, +icon, `patient.create` gated) + user menyu.
- Workspace + branch switcher topbar'dan OLINADI (sidebar header'ga ko'chdi, §5).

## 7. DS0.5 — Command palette (`shell/CommandPalette.tsx`)

- `@mantine/spotlight` `classNames` (yoki `styles`) override — dizayn tipografiya/spacing/radius/rang. Logika (guruhlar, debounce, permission gating, patient/staff search) O'ZGARMAYDI.
- Ikonka chip (30×30, surface-2), mono hint, ESC ko'rsatma.

## 8. DS0.6 — Notif panel + theme toggle

- `NotificationBell` popover restyle: 344px, header + "Hammasi o'qildi", list (icon chip tone + sarlavha + vaqt + 2-qator), footer "Barchasini ko'rish". Ma'lumot manbai (`useNotifications`) o'zgarmaydi.
- Theme toggle: mavjud `useMantineColorScheme`; yangi dark tokenlar (DS0.1) bilan ishlaydi.

## 9. DS0.7 — i18n + verify

- Yangi i18n kalitlar uz/ru: `nav.group.asosiy/klinika/boshqaruv`, breadcrumb/sahifa sarlavhalari (route title), "Yangi bemor", collapse tooltip, palette/notif matnlari.
- **Verify:** `typecheck` · `biome` · `turbo test --filter @dental/web` · `build`.
- **Playwright rol-bo'yicha** (real restricted permset, @owner EMAS): sidebar 3 guruh rolga mos filtrlanadi, rail-collapse, ⌘K permission-aware, workspace/branch switch ishlaydi, theme toggle.
- Vizual: dizaynga side-by-side (light + dark).

## 10. Testlar (TDD)

- **tokens:** `teal-sync.test.ts` + `danger-red-sync.test.ts` yangi qiymatlarga (guard). Token nomlari mavjudligi (yangi `--ink*`, `--primary-soft`, `--violet*`).
- **Sidebar:** rail-collapse render (icon-only), 3-guruh filtri rol-bo'yicha (characterization — mavjud `visibleGroups` testi guruh nomlariga moslanadi), footer logout, workspace switcher render.
- **Topbar:** breadcrumb/title route'dan, "Yangi bemor" permission-gated, switcher topbar'da YO'Q.
- **nav-config:** `visibleGroups` 3 guruh qaytaradi; har element to'g'ri guruhda; permission/feature gating o'zgarmagan (regression).
- **Shell smoke:** mavjud shell testlari yashil (i18n kalitlar yangilangan).

## 11. Xavf-xatarlar

- **Nav regrouping regressioni:** element permission/feature gating tasodifan o'zgarishi. → Mitigatsiya: `visibleGroups` characterization testi har element-permission juftligini qulflaydi; faqat guruh tegishliligi o'zgaradi.
- **teal/red ramp drift:** Mantine `color="teal"`/`color="red"` ishlatuvchi joylar yangi qiymatga avtomatik o'tadi — kutilgan, lekin guard testlari yangilanishi shart (aks holda CI qizil).
- **Rail-collapse layout shift:** AppShell width transition + content reflow. → CSS transition + container query mavjud (tokens.css `@container`).
- **Breadcrumb infra:** route metadata yo'q route'lar uchun fallback (nav label) kerak — aks holda bo'sh sarlavha.
- **Shrift variable fayl:** `@fontsource-variable/hanken-grotesk` to'g'ri import yo'li (`/index.css` yoki `/wght.css`) tekshiriladi.

## 12. Bajarish tartibi (plan uchun)

1. DS0.1 token remap + guard testlar (mustaqil, global ta'sir).
2. DS0.2 shriftlar (DS0.1 bilan birga yoki ketma-ket).
3. DS0.3 sidebar (rail + switcher relocation + footer + nav regroup) — eng katta.
4. DS0.4 topbar (breadcrumb infra + new-patient + relocation).
5. DS0.5 palette + DS0.6 notif/theme (restyle, parallel).
6. DS0.7 i18n + verify + Playwright.
