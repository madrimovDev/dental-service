# Design Tokens — @dental/ui

clinik "Teal" dizayn tizimining token manbasi. **Vizual haqiqat = `packages/ui/src/theme/tokens.css`.** Mantine theme (`mantine-theme.ts`) + bridge (`css-variables-resolver.ts`) bularga ergashadi.

## Foydalanish

- **CSS Module / CSS:** to'g'ridan `var(--token)` — masalan `color: var(--text-2); background: var(--surface);`
- **Mantine props:** `color="teal"`, `radius="md"`, Mantine komponentlari token bridge orqali avtomatik to'g'ri surface/border/text oladi.
- **Raqam/sana/narx:** `<Mono>` (`@dental/ui`) yoki `.t-mono` util.
- **Dark mode:** `useMantineColorScheme().setColorScheme('dark')` — bitta switch token + Mantine'ni birga almashtiradi.

## Semantic ranglar

| Token | Light | Dark | Vazifa |
|---|---|---|---|
| `--bg` | #F3F8F7 | #0A1817 | App fon |
| `--surface` | #FFFFFF | #102220 | Karta/panel |
| `--surface-2` | #E9F2EF | #16302C | Inset/hover |
| `--border` | #DCE7E4 | #21352F | Chegara |
| `--text` | #0E1F1D | #E4F0ED | Asosiy matn |
| `--text-2` | #41605B | #9DB8B3 | Ikkilamchi |
| `--text-3` | #869E9A | #65827D | Muted/placeholder |
| `--primary` | #0E9384 | #2FC6B2 | Brand/teal |

Status: `--success/--warning/--danger/--info` (+ `-bg` variantlar).

## Token → Mantine CSS var bridge

`css-variables-resolver.ts` quyidagilarni bog'laydi (to'liq ro'yxat fayl ichida):
`--mantine-color-body`→`--bg`, `--mantine-color-text`→`--text`, `--mantine-color-default`→`--surface`, `--mantine-color-default-border`→`--border`, `--mantine-color-dimmed`/`--mantine-color-placeholder`→`--text-3`, `--mantine-color-error`→`--danger`.

## Spacing / radius / typografika

- Spacing: `--space-1..12` (4px baza).
- Radius: `--radius-xs 5 / sm 6 / (default) 8 / md 9 / lg 12 / xl 14 / pill`. Mantine `radius` shkalasi shularga bog'langan (`md` = `--radius` 8px).
- Type scale: `--text-2xs 10 … --text-display 27`. Font: `--font-sans` (IBM Plex Sans), `--font-mono` (IBM Plex Mono, tabular).

## Manba

clinik bundle (`clinik.zip`) → `tokens/*.css`, `components/components.css`. RFC: [`docs/rfcs/0003-design-system-theming.md`](./rfcs/0003-design-system-theming.md).
