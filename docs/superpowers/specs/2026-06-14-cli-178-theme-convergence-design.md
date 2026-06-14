# CLI-178 — Mantine theme component convergence

**Sana:** 2026-06-14
**Epik:** CLI-177 (UI komponent izchilligi)
**Holat:** Spec — advisor approval kutilmoqda (solo dev oldindan tasdiqladi)

## 1. Muammo

Audit (CLI-177) topdi: `@dental/ui` form-raqobatchi primitivlari chetlab o'tilgan — kodbaza ustun **raw Mantine** ishlatadi (Button 114, TextInput 48, ActionIcon 24). Lekin raw Mantine call-site'lar to'liq teal design system'ga ergashmaydi:

- Raw Mantine `<Button variant="primary">` (masalan `DesignSystemPage.tsx`) — Mantine `primary` variantni **tanimaydi** (standart: filled/light/outline/subtle/default/transparent/white). `variantColorResolver` yo'q → variant-styling qo'llanmaydi.
- `@dental/ui` Button (custom `UnstyledButton` + CSS module) `data-variant="primary|ghost|danger"` orqali teal beradi — lekin bu faqat primitiv ichida; raw Mantine'ga yetmaydi.

## 2. Qaror (CLI-177 epik darajasida qabul qilingan)

**Theme-convergent** — primitivlarga ommaviy migration o'rniga design system'ni Mantine theme'ga suramiz. Bu task **Foundation** qatlami: raw Mantine'ni teal/izchil qiladi, qolgan tasklar (Input retire, lint, status) uning ustiga quriladi.

## 3. Yechim

`packages/ui/src/theme/mantine-theme.ts` ga ikki narsa qo'shiladi:

### 3.1 `variantColorResolver` — custom variantlar

`@dental/ui` Button CSS'dagi `primary`/`ghost`/`danger` semantikasini raw Mantine variant tizimiga ko'taradi. Mavjud `defaultVariantColorsResolver`'ni o'rab, faqat 3 custom variant qo'shadi:

| variant | background | color | hover | border |
|---|---|---|---|---|
| `primary` | `var(--primary)` | `var(--text-on-primary)` | `var(--primary-hover)` | transparent |
| `ghost` | transparent | `var(--primary)` | `var(--primary-tint)` | transparent |
| `danger` | `var(--danger)` | `var(--text-on-danger)` | `color-mix(in srgb, var(--danger) 88%, black)` | transparent |

Boshqa barcha variantlar → `defaultVariantColorsResolver(input)` (o'zgarmaydi). `VariantColorsResolverResult` shakli: `{ background, hover, color, border, hoverColor? }`.

> Token'lar light/dark scheme bo'yicha `tokens.css` da o'zi almashadi (`[data-mantine-color-scheme]`), shuning uchun `var(--token)` qiymatlari scheme-agnostik — resolver'da scheme tarmoqlanishi shart emas.

### 3.2 `components` — `Component.extend` defaults/classNames

Input oilasi uchun teal radius/focus va izchil o'lcham:

- **`TextInput` / `Textarea` / `NumberInput` / `Select` / `PasswordInput`** — `.extend({ classNames: { input: classes.input } })`, bu yerda `input` klassi teal `--radius`, `min-height: 36px`, `--text-sm`, focus-ring (`@dental/ui` Input/Select CSS bilan moslab). Bu mavjud `cssVarsResolver` (border/error/placeholder) ustiga vizual nozikliklarni qo'shadi.
- **`Button`** — `defaultProps: { variant: 'default' }` (Mantine default `filled` o'rniga — teal'da `default` = surface tugma, `@dental/ui` Button default'iga mos). Primary glow shadow uchun `styles` (props.variant==='primary' bo'lsa `box-shadow`).
- **`Badge`** — keyinroq Task 4 (status konsolidatsiya) hal qiladi; bu task'da faqat variantColorResolver'dan foyda oladi (agar `variant="danger"` ishlatilsa).

> Aniq classNames ↔ CSS module bog'lanishi implementatsiyada (yangi `theme/components.module.css` yoki mavjud primitiv CSS qayta-ishlatish) hal qilinadi.

## 4. Primitiv ↔ raw Mantine vizual paritet

`@dental/ui` Button (UnstyledButton) `variantColorResolver`'dan FOYDALANMAYDI — u o'z CSS module'ida qoladi. Ikkalasi vizual mos kelishi shart:

- Bir xil token manbai (`--primary`, `--text-on-primary`…) → ranglar avtomatik mos.
- Farq xavfi: primary glow shadow (`0 2px 8px` — `@dental/ui` Button'da bor). Raw Mantine'da `Button.extend` styles orqali qo'shiladi → paritet.
- Padding/radius/size shkalasi: bu task ularni *to'liq birlashtirmaydi* (vocabulary Task 3). Faqat ranglar + radius + focus.

## 5. Risk va guard

- **teal-sync.test.ts** — teal tuple ↔ tokens.css drift guard. variantColorResolver teal tuple'ni o'zgartirmaydi → buzilmaydi. Test ishga tushirib tasdiqlanadi.
- **css-variables-resolver.test.ts** — `cssVarsResolver` o'zgarmaydi → buzilmaydi.
- **Regressiya xavfi:** raw Mantine `variant="filled"`/`"light"`/`"subtle"`/`"default"` ishlatuvchi 100+ Button — `defaultVariantColorsResolver` fallback ularni o'zgartirmasligi SHART. Bu eng katta regressiya yuzasi → snapshot/visual emas, balki resolver unit test (`primary`/`ghost`/`danger` custom qaytaradi, qolganlar default'ga teng).
- **`variantColorResolver` joylashuvi** — `createTheme({ variantColorResolver })` ichidami yoki `MantineProvider` propimi: implementatsiyada Mantine 7 API context7 bilan tasdiqlanadi (TDD birinchi qadam).

## 6. Test strategiyasi

1. **`variant-color-resolver.test.ts`** (yangi) — `primary`/`ghost`/`danger` to'g'ri `{background,color,hover,border}` qaytaradi; `filled`/`light`/`default` `defaultVariantColorsResolver` bilan AYNAN bir xil (regressiya guard).
2. Mavjud `teal-sync.test.ts` + `css-variables-resolver.test.ts` yashil qoladi.
3. Manual: `DesignSystemPage` da raw Mantine `variant="primary"` teal ko'rinadi; bir necha ekranda raw Button/TextInput regressiyasiz.

## 7. Ko'lamdan tashqari (boshqa tasklar)

- Vocabulary lint + `color="red"` migration → CLI-180
- Custom Input retire + form-compat → CLI-179
- StatusPill/Tag/Badge konsolidatsiya → CLI-181
- Raw Mantine → primitiv ommaviy migration → **qilinmaydi** (theme convergence buni keraksiz qiladi)

## 8. DoD

- `mantine-theme.ts` ga variantColorResolver + component extend qo'shildi.
- `variant-color-resolver.test.ts` + mavjud theme testlar yashil; `bun test` (ui) o'tadi; typecheck toza.
- `DesignSystemPage` raw `variant="primary"` teal; regressiya yo'q.
