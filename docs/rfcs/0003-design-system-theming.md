# RFC-0003: Design system & theming (teal ↔ Mantine)

- **Status:** Accepted
- **Sana:** 2026-06-09
- **Bog'liq:** [RFC-0002](./0002-frontend-architecture.md), Claude Design "clinik" `tokens/` + `components.css`, R0 (CLI-2), Linear CLI-86

## Kontekst

R0 — dizayn-tizimni Mantine'ga olib kirish. Manba: Claude Design "Teal" tizimi (primary `#0E9384`, IBM Plex Sans/Mono, light+dark, semantic CSS tokenlar, `.ds-*` komponentlar). Qaror (brainstorm): **Mantine'da qolamiz**, `.ds-*` ni qabul qilmaymiz — tokenlar/shrift/primitivlarni Mantine'ga map qilamiz.

Asosiy texnik savol: ikkita theming manbasi (Mantine'ning o'z CSS-o'zgaruvchilari **va** dizaynning semantic tokenlari) qanday yarashtiriladi.

## Qaror

### 1. Semantic tokenlar = yagona manba (CSS o'zgaruvchilar)

Dizaynning `tokens/*.css` (rang, spacing, radius, soya, tipografika) loyihaga **CSS o'zgaruvchilar** sifatida kiritiladi (`packages/ui` yoki `apps/web/src/theme/tokens.css`). Komponentlar `var(--surface)`, `var(--text-2)`, `var(--border)`… ni bevosita ishlatadi (xuddi `.ds-*` kabi). Bu — vizual haqiqat manbasi.

### 2. Mantine theme — tokenlarga moslashtiriladi

`theme/mantine-theme.ts`:
- **Custom `teal` rang** (10 shade, dizayn shkalasidan): `[#E9F8F4, #C9F0E7, #9FE4D5, #6FD7C7, #2FC6B2, #14B8A6, #0E9384, #0B7268, #0A5A52, #0A4A44]` (index 0→9 = teal-50→900).
- **`primaryColor: 'teal'`**, `primaryShade: { light: 6, dark: 4 }` — light'da `#0E9384`, dark'da `#2FC6B2` (dizayn dark primary).
- **`fontFamily`:** IBM Plex Sans; **`fontFamilyMonospace`:** IBM Plex Mono.
- **`defaultRadius: 'md'`** (8px); radius shkalasi tokenlarga moslanadi (sm 6, md 8, lg 12, xl 14).
- **`shadows`** dizayn `--shadow-sm/base/lg` ga moslanadi.

Mantine komponentlari avtomatik teal/shrift/radius oladi; qo'shimcha ustun joylarda `var(--token)`.

### 3. Dark mode — bitta tugma ikkalasini boshqaradi

- Mantine color scheme (`MantineProvider defaultColorScheme`, `useMantineColorScheme`) — yagona switch. Mantine `html`'ga `data-mantine-color-scheme="dark"` qo'yadi.
- Dizayn tokenlari **`[data-mantine-color-scheme="dark"]`** selektoriga moslanadi (dizayndagi `[data-theme="dark"]` o'rniga) — shunda bitta toggle Mantine + bizning tokenlarni birga almashtiradi.
- Theme toggle (R1 topbar) → `setColorScheme`. localStorage'da saqlanadi (Mantine default).

### 4. Shriftlar — self-host (fontsource)

`@fontsource/ibm-plex-sans` + `@fontsource/ibm-plex-mono` (CDN emas) — offline/Electron va performance uchun. `apps/web` da import.

### 5. Ikonkalar — Lucide

`lucide-react` (stroke 1.7, dizayn SKILL tavsiyasi). Bitta to'plamga sodiq; aralashtirmaymiz. 16px (inline/tugma), 18px (topbar/nav).

### 6. Ma'lumot = monospace konvensiyasi

Raqam/ID/sana/vaqt/narx — har doim mono, tabular. `packages/ui` da `<Mono>` komponent yoki `.mono` util klass (`font-family: var(--font-mono); font-feature-settings: "tnum"`). Narx: `2 400 000 so'm`, sana `08.06.2026`, vaqt `10:30`.

### 7. Primitiv komponentlar (`packages/ui`)

R0 primitivlari (CLI-9 ostidagi tasklar): Button, Card, Input, Select, Tag, StatusPill, Avatar, Tabs, StatCard. Har biri — Mantine komponentini dizayn tokenlari bilan o'rab/uslublab, `.ds-*` vizualiga mos. Biznes-mantiqsiz. Feature'lar shulardan quriladi (RFC-0002).

## Oqibatlar

- ➕ Vizual haqiqat bitta joyda (semantic tokenlar); Mantine ularga ergashadi — ikkilik drift yo'q.
- ➕ Dark mode bitta switch; tokenlar + Mantine birga.
- ➕ `var(--token)` dizayndan ko'chirilgan `.ds-*` HTML bilan deyarli 1:1 (ko'chirish oson).
- ➖ Mantine'ning ba'zi ichki CSS o'zgaruvchilari bilan bizning tokenlar orasida moslash kerak (masalan `--mantine-color-body` ↔ `--bg`) — R0 da bir marta sozlanadi.
- 🔁 Agar Mantine theming bizning tokenlarni to'liq ko'tara olmasa, ba'zi komponentlarda `styles`/CSS module override kerak bo'ladi (kutilyapti, normal).

## Ochiq savollar

- Tokenlarni `packages/ui` da (umumiy) yoki `apps/web/src/theme` da saqlaymizmi? — Taklif: `packages/ui` (primitivlar bilan birga, qayta ishlatiladi).
