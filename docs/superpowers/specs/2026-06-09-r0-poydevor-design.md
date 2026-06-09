# R0 — Poydevor (Design System → Mantine): Design Spec

- **Sana:** 2026-06-09
- **Epik:** R0 / Linear CLI-2 (sub: CLI-3..9), Milestone M1
- **Bog'liq:** [RFC-0003](../../rfcs/0003-design-system-theming.md), [RFC-0002](../../rfcs/0002-frontend-architecture.md), Claude Design "clinik" bundle (`/home/madrimov/Загрузки/clinik.zip`)
- **Status:** Approved (brainstorm), spec → plan'ga tayyor

## Maqsad

clinik "Teal" dizayn tizimini (token'lar + 9 primitiv) Mantine v7'ga **Mantine-first + token override** usulida olib kirish. Har keyingi ekran (R1+) shu poydevorga tayanadi. Vizual haqiqat manbasi = clinik token'lari; Mantine ularga ergashadi (dual-drift yo'q).

## Qarorlar (brainstorm)

| # | Qaror | Asos |
|---|---|---|
| 1 | **Mantine-first + token override** — har primitiv = Mantine komponenti + theme override + CSS Module token | RFC-0003 §7; Mantine a11y/variant/props tizimi saqlanadi |
| 2 | **To'liq R0 qamrovi** — token+theme+font+dark (CLI-3..6) + 9 primitiv (CLI-9) + global naqsh (CLI-7) + token-map hujjat (CLI-8) bitta spec | yaxlit poydevor |
| 3 | **Joylashuv: `packages/ui`** — token CSS + theme + primitivlar | RFC-0003 ochiq savol → tavsiya; qayta ishlatiladi |
| 4 | **Shrift: self-host (fontsource)** — CDN emas | RFC-0003 §4; Electron/offline |

## Arxitektura — token bridge (yurak)

Mantine komponentlari `--mantine-color-*` CSS o'zgaruvchilarini ishlatadi, clinik esa `--surface/--text/--border/--primary`. **Bog'lanmasa**, Mantine'ning Paper/Card/Modal/Menu-dropdown default *kulrang* neytrallar bilan render bo'ladi va bizning sovuq-slate-teal neytrallardan ajraydi (RFC-0003 oqibat ogohlantirishi). Yechim — `cssVariablesResolver` orqali remap:

```
clinik tokens.css  (--bg, --surface, --text, --border, --primary …)   ← vizual manba
        │
   cssVariablesResolver(theme) → {
     light: { --mantine-color-body: var(--bg),
              --mantine-color-text: var(--text),
              --mantine-color-default-border: var(--border), … },
     dark:  { … }   // token'lar [data-mantine-color-scheme] orqali allaqachon almashadi,
   }                //  shuning uchun ko'p hollarda var(--token) ikkala scheme'da ham yetarli
        │
   createTheme (colors.teal, primaryShade, fontFamily, radius, shadows, components)
        │
   Primitivlar (Mantine baza + CSS Module, token'lardan)
```

> Eslatma: token CSS o'zi color-scheme'ga qarab qiymat almashtirgani uchun (`var(--surface)` light/dark'da har xil), resolver'ning asosiy vazifasi — Mantine semantic var'larini **`var(--token)`ga ko'rsatish**. `light`/`dark` bloklarini faqat token bermaydigan Mantine-maxsus joylar uchun ishlatamiz.

### `cssVariablesResolver` (Mantine v7.15 — context7 tasdiqlangan)

`MantineProvider` ga `cssVariablesResolver` prop sifatida beriladi; `(theme) => ({ variables, light, dark })` qaytaradi. Remap qilinadigan asosiy Mantine var'lar (to'liq ro'yxat plan'da, Styles API hujjatidan tasdiqlanadi):

- `--mantine-color-body` → `var(--bg)`
- `--mantine-color-text` → `var(--text)`
- `--mantine-color-default` (surface) → `var(--surface)`
- `--mantine-color-default-border` → `var(--border)`
- `--mantine-color-default-hover` → `var(--surface-2)`
- `--mantine-color-placeholder` / `--mantine-color-dimmed` → `var(--text-3)`
- `--mantine-color-error` → `var(--danger)`

## Fayl strukturasi

```
packages/ui/
├── package.json                 # Mantine peerDependencies; exports: ".", "./tokens.css"
└── src/
    ├── theme/
    │   ├── tokens.css            # clinik colors+spacing+typography birlashtirilgan,
    │   │                         #   dark selector rewrite qilingan (pastga qarang)
    │   ├── fonts.ts              # @fontsource/* import (self-host)
    │   ├── mantine-theme.ts      # createTheme(...) + components overrides
    │   ├── css-variables-resolver.ts  # Mantine var → token bridge
    │   └── index.ts             # { mantineTheme, cssVarsResolver } eksport
    ├── primitives/
    │   ├── Button/{Button.tsx, Button.module.css, Button.test.tsx}
    │   ├── IconButton/  Card/  Input/  Select/  Tag/  StatusPill/
    │   ├── Avatar/  Tabs/  StatCard/
    │   └── index.ts
    ├── patterns/
    │   ├── Mono.tsx              # raqam/ID/sana/vaqt/narx — mono+tnum (CLI-7)
    │   ├── PageHead.tsx          # sahifa sarlavhasi naqshi (CLI-7)
    │   └── index.ts
    └── index.ts                  # public re-export
```

**`apps/web` o'zgarishlari:**
- `apps/web/src/theme/mantine-theme.ts` (joriy bo'sh stub) **o'chiriladi**.
- `MantineProvider` (`App.tsx`/`main.tsx`) → `theme={mantineTheme}` + `cssVariablesResolver={cssVarsResolver}` + `defaultColorScheme` `@dental/ui`'dan.
- `apps/web/src/styles.css` → `@import '@dental/ui/tokens.css'` qo'shiladi; eski system-font bloki olib tashlanadi.

## Token tizimi (clinik'dan aynan)

clinik 4 token faylidan ko'chiriladi (qiymatlar o'zgarmaydi):
- **Ranglar** (`colors.css`): teal 50–900, neutral 0–900, status (green/amber/red/cyan), semantic alias (`--bg/--surface/--surface-2/--border/--text/--text-2/--text-3/--primary/--focus-ring` + status-bg), light + dark.
- **Spacing/radius/elevation/motion** (`spacing.css`): space 0–12 (4px baza), radius xs5/sm6/8/md9/lg12/xl14/pill, shadow sm/base/lg, ease/dur, `--topbar-h:58px`, `--sidebar-w:244px`.
- **Tipografika** (`typography.css`): `--font-sans/--font-mono`, type scale (2xs10…display27), weights, line-heights, letter-spacing, `--num:"tnum"`.

### KRITIK: dark selector rewrite

clinik token CSS dark mode'ni **`[data-theme="dark"]`** da kalitlaydi (`colors.css:63`, `spacing.css:40`, `components.css`). Mantine esa `<html>` ga **`data-mantine-color-scheme="dark"`** qo'yadi va `data-theme`'ni hech qachon qo'ymaydi. tokens.css'ga ko'chirishda har bir `[data-theme="dark"]` → `[data-mantine-color-scheme="dark"]` ga **almashtirilishi shart**, aks holda dark palitra hech qachon yoqilmaydi.

## Mantine theme (`mantine-theme.ts`)

```ts
createTheme({
  primaryColor: 'teal',
  primaryShade: { light: 6, dark: 4 },   // light #0E9384, dark #2FC6B2
  colors: { teal: ['#E9F8F4','#C9F0E7','#9FE4D5','#6FD7C7','#2FC6B2',
                    '#14B8A6','#0E9384','#0B7268','#0A5A52','#0A4A44'] },
  fontFamily: 'var(--font-sans)',
  fontFamilyMonospace: 'var(--font-mono)',
  defaultRadius: 'md',
  // Mantine radius shkalasi → token var'lariga bog'lanadi (drift yo'q).
  // Eslatma: token --radius (default) = 8px, --radius-md = 9px — ikkalasi alohida.
  // Mantine 'md' = token --radius (8px); primitiv CSS Module'lar kerak joyda
  // to'g'ridan var(--radius-md) (9px) ishlatadi (clinik .ds-btn bilan mos).
  radius: { xs:'var(--radius-xs)', sm:'var(--radius-sm)', md:'var(--radius)',
            lg:'var(--radius-lg)', xl:'var(--radius-xl)' },
  shadows: { sm:'var(--shadow-sm)', md:'var(--shadow)', lg:'var(--shadow-lg)' },
  headings: { fontWeight: '600' },
  components: { /* Button, Input, Card… default props + Styles API vars */ },
})
```

## Shrift (self-host)

`packages/ui` deps: `@fontsource/ibm-plex-sans` (400/500/600/700) + `@fontsource/ibm-plex-mono` (400/500/600). `theme/fonts.ts` ularni import qiladi; `apps/web` entry shu modulni import qiladi. clinik `fonts.css`'dagi Google CDN `@import` **ishlatilmaydi**.

## Primitivlar (9 + IconButton)

Har biri: Mantine baza komponenti + `*.module.css` (token'lar) + `*.test.tsx` (render/variant smoke). clinik `.ds-*` (`components/components.css`) — vizual referens (1:1 mos bo'lishi kerak).

| Primitiv | Mantine baza | clinik referens | Variantlar |
|---|---|---|---|
| Button | `Button`/`UnstyledButton` | `.ds-btn` | primary, default, ghost, danger; sm/md/lg; block; icon |
| IconButton | `ActionIcon` | `.ds-iconbtn` | bordered, sm, dot (badge) |
| Input | `TextInput`/`Input` | `.ds-input`,`.ds-field` | invalid, icon (left/right), label |
| Select | `Select` | `.ds-select` | placeholder holati, dropdown token bilan |
| Tag | `Badge`/markup | `.ds-tag` | default (border) |
| StatusPill | `Badge`/markup | `.ds-pill` | success/warning/danger/info/accent; dot |
| Avatar | `Avatar` | `.ds-avatar` | sm/md/lg; initials |
| Tabs | `Tabs` | `.ds-tabs`,`.ds-tabs--pill` | underline, pill; active |
| StatCard | `Paper`+markup | `.ds-stat` | chip (accent), mono value, delta up/down |
| Card | `Paper`/`Card` | `.ds-card` | header (title/sub/actions), body |

**Mono konvensiyasi:** StatCard value, narx, sana, vaqt, ID — `<Mono>` (`font-mono` + `font-feature-settings:"tnum"`).

## Dark mode

- Yagona switch: Mantine `useMantineColorScheme().setColorScheme`. Mantine `<html>` ga `data-mantine-color-scheme` qo'yadi.
- Token CSS shu selektorga ulangani uchun (rewrite, yuqorida) bitta toggle Mantine + token'larni birga almashtiradi.
- localStorage'da saqlanadi (Mantine default). Toggle UI — R1 topbar (bu yerda faqat mexanizm + dev toggle).
- `MantineProvider`: `defaultColorScheme="light"`; `<ColorSchemeScript>` `index.html`/entry'da (FOUC oldini olish).

## Qurilish ketma-ketligi (advisor — scope kesilmaydi, faqat tartib)

1. `packages/ui` skeleton (package.json, exports, peerDeps, tsconfig)
2. **tokens.css** (clinik 4 fayl birlashtirilgan + dark selector rewrite)
3. **mantine-theme.ts** + **cssVariablesResolver bridge**
4. Shrift self-host (`fonts.ts` + deps)
5. `apps/web` integratsiya (provider, styles, eski stub o'chirish) + dark toggle (dev sinov)
6. **Button** — birinchi interaktiv primitiv, end-to-end, `.ds-btn` bilan solishtirib pattern tasdiqlanadi
7. **Input** — bridge'ni stress qiladi (border/focus/placeholder token'lari)
8. Qolgan 7 primitiv + IconButton — shu pattern bo'yicha
9. Mono + PageHead (CLI-7) + token-map hujjat `docs/` (CLI-8)
10. Fidelity gallery route + verification

## Verification — fidelity gallery

- `apps/web` da **`/dev/ds`** dev-only route: barcha primitivlar galereyasi, har biri clinik `.ds-*` referens yonma-yon, light+dark toggle.
- Qabul mezoni: **bundle screenshot'lari (`clinik/screenshots/`, `app/*.html`) bilan vizual mos.**
- Har primitivda smoke test (`*.test.tsx`) — render + asosiy variantlar.
- `bun run build` (tsc + vite) toza; `turbo test` o'tadi.
- Visual companion'da galereya ko'rsatilishi mumkin (light/dark).

## Qamrovdan tashqari (R0 emas)

- Topbar/sidebar shell, theme toggle UI joylashuvi → **R1** (CLI-19).
- Ekran-darajadagi kompozitsiya (bemor/yozilish…) → **R2**.
- Murakkab data komponentlari (kalendar, jadval konfiguratsiyasi) → tegishli ekran epigida.

## Ochiq mayda nuqtalar (plan'da hal qilinadi)

- To'liq Mantine var → token map ro'yxati (Styles API hujjatidan tasdiqlanadi).
- `mantine-react-table` token integratsiyasi — R0 da emas, ishlatilganda (R2 jadval).
- `lucide-react` ikonka o'lchami konvensiyasi (16/18px) — primitiv API'da qabul qilinadi.
