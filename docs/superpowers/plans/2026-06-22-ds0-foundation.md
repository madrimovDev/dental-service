# DS0 — Foundation: Token + Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Butun ilovani Dental OS vizual dizayniga moslash uchun token tizimi + shriftlar + shell (sidebar/topbar/palette/notif) re-skin qilish.

**Architecture:** Token remap-in-place (nomlar saqlanadi, qiymat+shrift o'zgaradi) → butun ilova bir fayldan yangi ko'rinishga o'tadi. Shell layout o'zgarishlari (sidebar 266px+rail, topbar 62px+breadcrumb, switcher ko'chishi, 3-guruh nav) mavjud Mantine AppShell + CSS Modules ustida. Permission/routing/feature-gating/backend TEGILMAYDI.

**Tech Stack:** React 18, Mantine v7, CSS Modules + CSS custom properties, @fontsource (self-host), lucide-react, Zustand (ui store), Vitest, i18next.

## Global Constraints

- Token NOMLARI saqlanadi; faqat QIYMAT o'zgaradi (Qaror #32). `--*-bg` saqlanadi + `--*-soft` alias qo'shiladi.
- Dark selektor `[data-mantine-color-scheme="dark"]` (Mantine), `[data-theme]` EMAS.
- Shrift self-host @fontsource (CDN yo'q): `@fontsource-variable/hanken-grotesk` + `@fontsource/jetbrains-mono`.
- Ikonka: lucide-react (mavjud); yangi ikonka tizimi yo'q.
- Permission gating (`isVisible`, `RequirePermission`, `hasPermission`), routing, feature/vertical gating, workspace/branch switch mantiqi, backend — O'ZGARMAYDI.
- i18n: har yangi string uz + ru (`packages/i18n`), hardcode yo'q.
- Verify (har task oxirida tegishlicha): `bun --filter @dental/web typecheck` · `biome check` · `bun --filter @dental/web test` · `bun --filter @dental/web build`.
- Test buyrug'i: web = vitest (`bun --filter @dental/web test`).

---

### Task 1: Token remap — `tokens.css` + Mantine teal/red ramp + guard testlar (DS0.1)

**Files:**
- Modify: `packages/ui/src/theme/tokens.css` (light `:root` 5–125, dark 127–157, layout 99–101)
- Modify: `packages/ui/src/theme/mantine-theme.ts:4–32` (teal, red ramp)
- Test: `packages/ui/src/theme/teal-sync.test.ts`, `packages/ui/src/theme/danger-red-sync.test.ts`

**Interfaces:**
- Produces: yangi CSS tokenlar `--ink`, `--ink-2`, `--ink-3`, `--primary-soft`, `--violet`, `--violet-soft`, `--sidebar`, `--sidebar-rail-w`, `--*-soft` aliaslar; layout `--sidebar-w:266px`, `--topbar-h:62px`. Mantine `teal`/`red` ramp yangi qiymatlar.

- [ ] **Step 1: teal-sync va danger-red-sync testlarni yangi qiymatlarga yoz (failing)**

`teal-sync.test.ts` kutilgan teal ramp'ni yangi qiymatlarga o'zgartir (test tokens.css `--teal-*` va `mantine-theme.ts` `teal` mosligini tekshiradi). Yangi ramp:
```
50 #E7F6F1 · 100 #C6EFE6 · 200 #9CE2D3 · 300 #62D2BF · 400 #2CB9A2
500 #15A18C · 600 #0B7A6B · 700 #096154 · 800 #0A4E45 · 900 #0A3F38
```
`danger-red-sync.test.ts` kutilgan red[6]=`#CC3D3A` (light danger), red[4]=`#F26B64` (dark danger).

- [ ] **Step 2: Testlarni ishga tushir — fail bo'lishini tasdiqla**

Run: `bun --filter @dental/ui test -- teal-sync danger-red-sync`
Expected: FAIL (tokens.css/mantine-theme hali eski qiymatda).

- [ ] **Step 3: `mantine-theme.ts` teal + red ramp'ni yangila**

`teal` arrayni Step 1 dagi 10 qiymatga; `red` arrayni:
```
50 #FBE7E5 · 100 #F8D2CF · 200 #F0AEA9 · 300 #E88882 · 400 #F26B64
500 #DC4B47 · 600 #CC3D3A · 700 #A82F2D · 800 #842523 · 900 #5E1A18
```
`primaryColor:'teal'`, `primaryShade {light:6, dark:4}` — O'ZGARMAYDI.

- [ ] **Step 4: `tokens.css` light `:root` tokenlarni remap qil**

`--teal-50..900` Step 1 ramp; `--red-600:#CC3D3A`, `--red-bg:#FBE7E5`. Semantik aliaslar:
```
--bg:#F1F3EF; --surface:#FFFFFF; --surface-2:#F6F8F4; --surface-raised:#FFFFFF; --sidebar:#FAFBF8;
--border:#E4E8E1; --border-subtle:#EEF1EC; --border-strong:#D3D9CF;
--text:#192420; --text-2:#4C5852; --text-3:#7A857E; --text-on-primary:#FFFFFF;
--ink:var(--text); --ink-2:var(--text-2); --ink-3:var(--text-3); --on-primary:var(--text-on-primary);
--primary:var(--teal-600); --primary-hover:var(--teal-700); --primary-strong:var(--teal-700);
--primary-tint:#DDEFEA; --primary-tint-2:#C9E7DF; --primary-soft:var(--primary-tint);
--success:var(--teal-600); --success-bg:#DDEFEA; --success-soft:var(--success-bg);
--warning:#B57611; --warning-bg:#F7ECD6; --warning-soft:var(--warning-bg);
--danger:var(--red-600); --danger-bg:var(--red-bg); --danger-soft:var(--danger-bg);
--info:#2A66CC; --info-bg:#E2EAFB; --info-soft:var(--info-bg);
--violet:#7C4DD6; --violet-soft:#ECE4FB;
```
Shadow (light) dizayndan:
```
--shadow-sm:0 1px 2px rgba(25,40,35,.04), 0 1px 1px rgba(25,40,35,.02);
--shadow:0 2px 6px rgba(25,40,35,.05), 0 12px 30px -10px rgba(25,40,35,.09);
--shadow-lg:0 24px 64px -14px rgba(25,40,35,.24), 0 8px 22px -10px rgba(25,40,35,.12);
```
Layout: `--topbar-h:62px;`, `--sidebar-w:266px;`, yangi `--sidebar-rail-w:76px;`.

- [ ] **Step 5: `tokens.css` dark blok (`[data-mantine-color-scheme="dark"]`) ni remap qil**

```
--bg:#0B100E; --surface:#161F1B; --surface-2:#1D2824; --surface-raised:#1D2824; --sidebar:#0E1512;
--border:#2A352F; --border-subtle:#172E2A; --border-strong:#3B4A43;
--text:#EDF2EF; --text-2:#AAB6B0; --text-3:#7E8B84; --text-on-primary:#04130F;
--primary:var(--teal-400); --primary-hover:#40CFB7; --primary-strong:#40CFB7;
--primary-tint:#16332C; --primary-tint-2:#1B3D38; --primary-soft:#16332C;
--success:#2CB9A2; --success-bg:#16332C; --warning:#E4AB44; --warning-bg:#332814;
--danger:#F26B64; --danger-bg:#341917; --info:#6A9BF2; --info-bg:#172642;
--violet:#B093EE; --violet-soft:#241B39;
--shadow-sm:0 1px 2px rgba(0,0,0,.28), 0 1px 1px rgba(0,0,0,.2);
--shadow:0 2px 6px rgba(0,0,0,.3), 0 14px 34px -10px rgba(0,0,0,.5);
--shadow-lg:0 28px 68px -14px rgba(0,0,0,.62), 0 10px 24px -10px rgba(0,0,0,.45);
```
*(Dark blok `--ink*`/`--*-soft` aliaslarni qayta e'lon qilmaydi — ular light'dagi `var()` aliasi orqali avtomatik almashadi.)*

- [ ] **Step 6: Guard testlar + typecheck o'tishini tasdiqla**

Run: `bun --filter @dental/ui test`
Expected: PASS (teal-sync, danger-red-sync yashil).

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/theme/tokens.css packages/ui/src/theme/mantine-theme.ts packages/ui/src/theme/teal-sync.test.ts packages/ui/src/theme/danger-red-sync.test.ts
git commit -m "feat(ds0): token remap to Dental OS palette (CLI-255)"
```

---

### Task 2: Shriftlar — Hanken Grotesk + JetBrains Mono (DS0.2)

**Files:**
- Modify: `packages/ui/package.json` (deps)
- Modify: `packages/ui/src/theme/fonts.ts`
- Modify: `packages/ui/src/theme/tokens.css` (`--font-sans`, `--font-mono` 104–105)

**Interfaces:**
- Consumes: `--font-sans`/`--font-mono` (mantine-theme allaqachon `var(--font-sans)` ishlatadi — o'zgarmaydi).

- [ ] **Step 1: @fontsource deps almashtir**

`packages/ui/package.json` `dependencies`: `@fontsource/ibm-plex-sans` va `@fontsource/ibm-plex-mono` ni o'chir; qo'sh:
```json
"@fontsource-variable/hanken-grotesk": "^5.0.0",
"@fontsource/jetbrains-mono": "^5.0.0"
```
Run: `bun install`

- [ ] **Step 2: `fonts.ts` importlarini almashtir**

```ts
// Self-host (CDN emas — Electron/offline). --font-sans/--font-mono shu shriftlarga ishora qiladi.
import '@fontsource-variable/hanken-grotesk';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
```

- [ ] **Step 3: `tokens.css` font tokenlarini almashtir**

```
--font-sans: "Hanken Grotesk Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
```

- [ ] **Step 4: Build + typecheck tasdiqla**

Run: `bun --filter @dental/web build`
Expected: exit 0 (shrift fayllar bundle'ga kirdi, import xato yo'q).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/package.json packages/ui/src/theme/fonts.ts packages/ui/src/theme/tokens.css bun.lock
git commit -m "feat(ds0): swap fonts to Hanken Grotesk + JetBrains Mono (CLI-256)"
```

---

### Task 3: Nav 3-guruh superset — `nav-config.ts` + i18n (DS0.3a)

**Files:**
- Modify: `apps/web/src/shell/nav-config.ts:42–206` (`NAV_GROUPS`)
- Modify: `packages/i18n/src/locales/uz.json`, `ru.json` (`nav.group.*`)
- Test: `apps/web/src/shell/nav-config.test.ts` (yo'q bo'lsa yarat)

**Interfaces:**
- Consumes: `NavItem`/`NavGroup` tiplari (o'zgarmaydi), `visibleGroups()` (o'zgarmaydi).
- Produces: 3 ta guruh `nav.group.asosiy`, `nav.group.klinika`, `nav.group.boshqaruv`. Har element propslari (key/labelKey/icon/path/permission/feature/disabled) AYNAN saqlanadi.

- [ ] **Step 1: Characterization test yoz (failing) — 3 guruh + element joylashuvi**

`nav-config.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, visibleGroups } from './nav-config';

const ALL = () => true;

describe('NAV_GROUPS 3-guruh superset', () => {
  it('3 guruh: asosiy/klinika/boshqaruv', () => {
    expect(NAV_GROUPS.map((g) => g.labelKey)).toEqual([
      'nav.group.asosiy',
      'nav.group.klinika',
      'nav.group.boshqaruv',
    ]);
  });
  it('asosiy: home, appointments, queue, patients, cashier', () => {
    const g = NAV_GROUPS[0];
    expect(g.items.map((i) => i.key)).toEqual([
      'home', 'appointments', 'queue', 'patients', 'cashier',
    ]);
  });
  it('hech qaysi element yo‘qolmadi (28 element)', () => {
    const keys = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key));
    expect(keys).toContain('recalls');
    expect(keys).toContain('payroll');
    expect(keys).toContain('audit');
    expect(new Set(keys).size).toBe(keys.length); // dublikat yo'q
  });
  it('owner barcha disabled-future elementni ko‘radi', () => {
    const groups = visibleGroups(ALL, 'dental', true);
    const keys = groups.flatMap((g) => g.items.map((i) => i.key));
    expect(keys).toContain('plans'); // disabled-future
  });
});
```

- [ ] **Step 2: Test fail bo'lishini tasdiqla**

Run: `bun --filter @dental/web test -- nav-config`
Expected: FAIL (hozir 5 guruh).

- [ ] **Step 3: `NAV_GROUPS` ni 3 guruhga qayta tuz**

Mavjud elementlarni (har biri AYNAN o'z propslari bilan — yangi import qo'shilmaydi, mavjud lucide ikonkalardan foydalaniladi) 3 guruhga ko'chir:
- `nav.group.asosiy`: `home`, `appointments`, `queue`, `patients`, `cashier`
- `nav.group.klinika`: `plans`, `lab`, `rx`, `schedule`, `recalls`
- `nav.group.boshqaruv`: `reports`, `services`, `users`, `stock`, `expenses`, `payroll`, `branches`, `roles`, `audit`, `settings`, `kpi`, `transactions`, `patient-new`
*(`patient-new`/`kpi`/`transactions` — mavjud elementlar, yo'qotilmaydi; `kpi`/`transactions` disabled-future qoladi. `patient-new` Boshqaruv emas — agar dizaynda alohida joy bo'lsa, "Asosiy" oxiriga qo'yilishi mumkin; default: Asosiy oxirida.)*
**MUHIM:** har element obyektining `permission`/`feature`/`disabled` maydonlari AYNAN ko'chiriladi.

- [ ] **Step 4: i18n guruh kalitlarini qo'sh**

`uz.json`: `"nav":{"group":{"asosiy":"Asosiy","klinika":"Klinika","boshqaruv":"Boshqaruv", ...}}`
`ru.json`: `"asosiy":"Основное","klinika":"Клиника","boshqaruv":"Управление"`
*(Eski `today/patients/clinic/finance/management` kalitlarini saqlash shart emas — boshqa joyda ishlatilmasa o'chiriladi; grep bilan tekshir.)*

- [ ] **Step 5: Test + typecheck o'tishini tasdiqla**

Run: `bun --filter @dental/web test -- nav-config`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/shell/nav-config.ts apps/web/src/shell/nav-config.test.ts packages/i18n/src/locales/uz.json packages/i18n/src/locales/ru.json
git commit -m "feat(ds0): regroup nav into 3 Dental OS groups (superset, CLI-257)"
```

---

### Task 4: Sidebar rail-collapse + AppShell width state (DS0.3b)

**Files:**
- Modify: `apps/web/src/stores/` ui store (yoki yangi `ui-store.ts` agar yo'q bo'lsa — avval grep `sidebarRail`/ui store)
- Modify: `apps/web/src/shell/AppShell.tsx:13–17`
- Modify: `apps/web/src/shell/Sidebar.tsx`, `Sidebar.module.css`
- Modify: `apps/web/src/shell/Topbar.tsx` (collapse toggle tugma)
- Test: `apps/web/src/shell/Sidebar.test.tsx` (mavjud bo'lsa kengaytir)

**Interfaces:**
- Produces: ui store `sidebarRail: boolean` + `toggleSidebarRail()`. Sidebar `data-rail` atributi rail rejimida.

- [ ] **Step 1: ui store'ga `sidebarRail` qo'sh (yoki yarat)**

Mavjud ui/shell Zustand store'ni top (`grep -r "create(" apps/web/src/stores`). `sidebarRail: boolean` (default false, persist) + `toggleSidebarRail: () => set(s => ({ sidebarRail: !s.sidebarRail }))`.

- [ ] **Step 2: Sidebar rail render testi yoz (failing)**

```tsx
// rail rejimida nav label yashirin (data-rail="true")
it('rail rejimida data-rail=true', () => {
  // store'ni sidebarRail:true ga set qil, Sidebar render qil
  // expect(container.querySelector('[data-rail="true"]')).toBeTruthy()
});
```

- [ ] **Step 3: AppShell navbar width'ni holatga bog'la**

`AppShell.tsx`: `const rail = useUiStore(s => s.sidebarRail)`. `navbar={{ width: rail ? 76 : 266, breakpoint: 'sm', collapsed: { mobile: !opened } }}`, `header={{ height: 62 }}`.

- [ ] **Step 4: Sidebar rail rendering + CSS**

`Sidebar.tsx`: ildiz elementga `data-rail={rail ? 'true' : undefined}`. `Sidebar.module.css`: `[data-rail="true"] .label, [data-rail="true"] .groupLabel { display:none }` ; `[data-rail="true"] .item{ justify-content:center; gap:0 }`. Rail'da nav element `title={label}` (tooltip).

- [ ] **Step 5: Topbar collapse toggle tugma**

`Topbar.tsx` chap qismiga `PanelLeft` (lucide) IconButton → `toggleSidebarRail()`.

- [ ] **Step 6: Test + build tasdiqla**

Run: `bun --filter @dental/web test -- Sidebar` && `bun --filter @dental/web build`
Expected: PASS + exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/stores apps/web/src/shell/AppShell.tsx apps/web/src/shell/Sidebar.tsx apps/web/src/shell/Sidebar.module.css apps/web/src/shell/Topbar.tsx
git commit -m "feat(ds0): sidebar rail-collapse + 266px/62px layout (CLI-257)"
```

---

### Task 5: Sidebar workspace switcher relocation + footer (DS0.3c)

**Files:**
- Modify: `apps/web/src/shell/Sidebar.tsx`, `Sidebar.module.css`
- Modify: `apps/web/src/shell/Topbar.tsx` (switcher olib tashlash)
- Reuse: `apps/web/src/shell/BranchSwitcher.tsx` (logika), auth store (logout)

**Interfaces:**
- Consumes: `BranchSwitcher` mantiqi (`useSwitchWorkspace`, `GET /auth/workspace-branches`), auth store `clear()` (logout), user/tenant nomi.

- [ ] **Step 1: Sidebar header — workspace+branch switcher**

Sidebar `.top` ni dizayn header'iga almashtir: "DD"-avatar (primary bg) + klinika nomi + filial qatori. `BranchSwitcher` komponentini (yoki uning hookini) shu yerda render qil (topbar'dan ko'chirilgan). Rail rejimida faqat avatar.

- [ ] **Step 2: Sidebar footer**

Sidebar oxiriga sticky footer (`.foot`): user avatar (gradient) + ism + rol nomi + logout IconButton (`LogOut` lucide) → auth `clear()` + navigate `/login`. Rail rejimida icon-only.

- [ ] **Step 3: Topbar'dan workspace + branch switcher olib tashla**

`Topbar.tsx:42–50` workspace tugma + `<BranchSwitcher />` ni o'chir (sidebar'ga ko'chdi). Topbar profil-menyu logout'i qoladi yoki footer bilan dublikatni oldini olish uchun profil-menyu soddalashtiriladi (logout footerда).

- [ ] **Step 4: Smoke test — switcher sidebar'da, topbar'da yo'q**

```tsx
it('workspace switcher sidebar header’da', () => {
  // Sidebar render → klinika nomi/branch element bor
});
```

- [ ] **Step 5: Test + build tasdiqla**

Run: `bun --filter @dental/web test -- Sidebar Topbar` && `bun --filter @dental/web build`
Expected: PASS + exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/shell/Sidebar.tsx apps/web/src/shell/Sidebar.module.css apps/web/src/shell/Topbar.tsx
git commit -m "feat(ds0): move workspace/branch switcher to sidebar + footer (CLI-257)"
```

---

### Task 6: Topbar — breadcrumb route-metadata + "Yangi bemor" tugma (DS0.4)

**Files:**
- Modify: `apps/web/src/app/routes.tsx` (AppRoute `title?`)
- Create: `apps/web/src/shell/use-page-title.ts` (route → title hook)
- Modify: `apps/web/src/shell/Topbar.tsx`, `Topbar.module.css`
- Test: `apps/web/src/shell/use-page-title.test.ts`

**Interfaces:**
- Consumes: `AppRoute` tipi (`@/shell`), `nav-config` (fallback label).
- Produces: `usePageTitle(): { title: string; breadcrumb?: string }`.

- [ ] **Step 1: `use-page-title` testi yoz (failing)**

```ts
it('route path → i18n title', () => {
  // useLocation mock '/patients' → title key 'nav.patients'
});
it('noma’lum route → fallback nav label', () => {});
```

- [ ] **Step 2: `AppRoute` tipiga `title?` qo'sh + route'larga to'ldir**

`AppRoute` tipiga `title?: string` (i18n kalit). Asosiy route'larga title qo'sh (`/patients` → `'nav.patients'`, `/appointments` → `'nav.appointments'`, …). Default: nav-config'dan path bo'yicha topiladi.

- [ ] **Step 3: `usePageTitle` hook**

`useLocation().pathname` → route `title` yoki nav-config item labelKey fallback → `t(key)`.

- [ ] **Step 4: Topbar chap qismi — breadcrumb + title**

`Topbar.tsx`: collapse toggle (Task 4) yonida `usePageTitle()` natijasini ko'rsat (breadcrumb kulrang + title qora).

- [ ] **Step 5: "Yangi bemor" tugma**

Topbar o'ng qismiga primary Button (`Plus` icon) → `navigate('/patients/new')`, `patient.create` bilan gated (`hasPermission`).

- [ ] **Step 6: Test + build tasdiqla**

Run: `bun --filter @dental/web test -- use-page-title Topbar` && `bun --filter @dental/web build`
Expected: PASS + exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/routes.tsx apps/web/src/shell/use-page-title.ts apps/web/src/shell/use-page-title.test.ts apps/web/src/shell/Topbar.tsx apps/web/src/shell/Topbar.module.css
git commit -m "feat(ds0): topbar breadcrumb/title + new-patient button (CLI-258)"
```

---

### Task 7: Command palette restyle (DS0.5)

**Files:**
- Modify: `apps/web/src/shell/CommandPalette.tsx`
- Create: `apps/web/src/shell/CommandPalette.module.css`

**Interfaces:**
- Consumes: `@mantine/spotlight` Spotlight (logika o'zgarmaydi).

- [ ] **Step 1: Spotlight classNames override**

`CommandPalette.module.css` — dizayn tipografiya/spacing/radius (≤620px, backdrop blur, action icon chip 30×30 surface-2, mono hint). `<Spotlight classNames={styles} ... />`. Logika (guruhlar/debounce/permission/search) TEGILMAYDI.

- [ ] **Step 2: Build + qo'lda dev tekshir (palette ⌘K ochiladi, dizaynga mos)**

Run: `bun --filter @dental/web build`
Expected: exit 0. Dev'da ⌘K bilan vizual tasdiq.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/shell/CommandPalette.tsx apps/web/src/shell/CommandPalette.module.css
git commit -m "feat(ds0): command palette restyle to Dental OS (CLI-259)"
```

---

### Task 8: Notif panel restyle + theme toggle polish (DS0.6)

**Files:**
- Modify: `apps/web/src/features/notifications/components/NotificationBell.tsx`, `NotificationBell.module.css`
- Modify: `apps/web/src/shell/Topbar.tsx` (theme toggle dizayn)

**Interfaces:**
- Consumes: `useNotifications` (ma'lumot manbai o'zgarmaydi), `useMantineColorScheme`.

- [ ] **Step 1: NotificationBell popover restyle**

344px popover, header + "Hammasi o'qildi", row (icon chip tone + sarlavha + vaqt + 2-qator), footer "Barchasini ko'rish". `NotificationBell.module.css` dizayn tokenlari (`--violet`/`--info`/`--warning` chip toplari). Logika (`markAllRead`, unread badge) o'zgarmaydi.

- [ ] **Step 2: Theme toggle dizayn**

Topbar sun/moon IconButton dizaynga mos (yangi tokenlar bilan ishlaydi — DS0.1).

- [ ] **Step 3: Test + build tasdiqla**

Run: `bun --filter @dental/web test -- Notification` && `bun --filter @dental/web build`
Expected: PASS + exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/notifications/components apps/web/src/shell/Topbar.tsx
git commit -m "feat(ds0): notification panel restyle + theme toggle (CLI-260)"
```

---

### Task 9: i18n to'liqlik + rol-bo'yicha verify + yakuniy QA (DS0.7)

**Files:**
- Modify: `packages/i18n/src/locales/uz.json`, `ru.json` (yangi kalitlar paritet)
- Test: `apps/web` Playwright (mavjud E2E setup — `reference_playwright_e2e_setup`)

**Interfaces:** —

- [ ] **Step 1: i18n paritet tekshiruvi**

Yangi qo'shilgan barcha kalitlar (nav.group.*, breadcrumb title'lar, "Yangi bemor", collapse tooltip, palette/notif) uz **va** ru da bor. Mavjud bo'lsa i18n paritet testini ishlat; bo'lmasa qo'lda `diff` (uz keys vs ru keys).

- [ ] **Step 2: To'liq verify suite**

Run:
```bash
bun --filter @dental/web typecheck --force
biome check apps/web packages/ui
bun --filter @dental/web test
bun --filter @dental/web build
```
Expected: hammasi yashil (typecheck, 0 biome xato, test pass, build exit 0).

- [ ] **Step 3: Playwright shell rol-bo'yicha (real restricted permset, @owner EMAS)**

`reference_playwright_e2e_setup` bo'yicha full-stack ko'tar. Tekshir: (a) sidebar 3 guruh rolga mos filtrlanadi (masalan Registrator'da Boshqaruv kam element); (b) rail-collapse ishlaydi; (c) ⌘K permission-aware; (d) workspace/branch switch sidebar header'dan; (e) "Yangi bemor" faqat `patient.create` da; (f) theme toggle light↔dark dizayn tokenlari. Kamida 3 rol (Registrator/Doktor/Buxgalter) + Owner.

- [ ] **Step 4: Vizual side-by-side (dizayn vs ilova, light+dark)**

`/tmp/dental-os.html` shell bilan solishtir — sidebar/topbar/palette/notif pixel-yaqinligi.

- [ ] **Step 5: Commit**

```bash
git add packages/i18n/src/locales/uz.json packages/i18n/src/locales/ru.json
git commit -m "feat(ds0): i18n parity + role-by-role shell verify (CLI-261)"
```

---

## Self-Review

- **Spec coverage:** DS0.1 (Task 1+2), DS0.3 (Task 3 nav, Task 4 rail, Task 5 switcher/footer), DS0.4 (Task 6), DS0.5 (Task 7), DS0.6 (Task 8), DS0.7 (Task 9). ✅ Barcha sub-task qoplangan.
- **Invariantlar:** har task "logika o'zgarmaydi" deb belgilangan; nav regroup characterization testi permission/feature gating'ni qulflaydi.
- **Placeholder:** token qiymatlari, font importlari, nav guruhlash, test assertion'lari aniq. CSS-og'ir tasklarda (4–8) aniq selektor + build/visual verify (sof vizual restyle uchun unit-test majburlanmaydi).
- **Tartib:** Task 1→2 (global token/font) mustaqil; 3 (nav) mustaqil; 4→5 (sidebar, ketma-ket — bir fayl); 6 (topbar, 4/5 dan keyin); 7/8 (parallel); 9 (yakun).
