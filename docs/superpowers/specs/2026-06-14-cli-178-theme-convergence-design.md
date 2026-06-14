# CLI-178 — Tugma oilasi single-source (Button + IconButton → Mantine wrapper)

**Sana:** 2026-06-14
**Epik:** CLI-177 (UI komponent izchilligi)
**Holat:** ❌ BEKOR QILINDI (2026-06-14) — quyidagi addendum'ga qarang.

---

## ⛔ ADDENDUM — task bekor qilindi (2026-06-14)

Advisor review + gap-validatsiya quyi spec'ning asosini rad etdi:

1. **Button wrapper divergensiyani tuzatmaydi.** Audit topilmasi — *adoption* nisbati (Button 114 raw vs 7 primitiv). @dental/ui Button'ni Mantine wrapper qilish bu nisbatni o'zgartirmaydi: 114 raw raw bo'lib qoladi, 7 primitiv primitiv. Faqat 7 komponentning *ichki* tuzilishi o'zgaradi. Discriminating check: **CLI-178'dan keyin foydalanuvchi bitta ham pikselni boshqacha ko'rmaydi** (cssVarsResolver + `primaryColor: 'teal'` allaqachon raw va primitiv tugmani bir tokendan render qiladi). Bu churn, fix emas.
2. **variantColorResolver'ning bugun iste'molchisi yo'q** (hech bir raw sayt `variant="primary/ghost/danger"` ishlatmaydi; @dental/ui Button o'z CSS'ida). YAGNI → **CLI-180'ga ko'chirildi**, u yerda `color="red"`→`variant="danger"` migration uni real talab qiladi.
3. **Dual-Button** — hozircha *token-shared coexistence* sifatida qabul qilinadi (rewrite emas). Agar kelajakda primitiv Button'ga tegilsa — *retire* (Mantine re-export + resolver, custom CSS o'chirish) wrap'dan ko'ra asoslangan, lekin keyingi emas.

**Natija:** CLI-177 arxitektura qarori (theme-convergent + lint) **saqlanadi**; bu faqat task-level scope tuzatish. Keyingi task → **CLI-179** (ko'rinmaydigan validatsiya xatosi — yagona kuzatilgan foydalanuvchi simptomi, CLI-178'dan mustaqil).

> Quyidagi v2 spec tarixiy yozuv sifatida saqlanadi (qaror izi).

---

## 0. Spec v1 → v2 (nega qayta yo'naltirildi)

v1 "theme convergence" deb yozilgan edi — 186 raw Mantine sayt teal bo'lib qoladi degan farazga asoslangan. **Gap-validatsiya buni rad etdi:**

- `primaryColor: 'teal'` + `cssVarsResolver` allaqachon raw Mantine Button/TextInput/Select/border/error'ni token-driven qiladi. "Bepul to'g'rilanadigan" raw sayt amalda **deyarli yo'q**.
- `DesignSystemPage.tsx` o'qildi — bu **qasddan showcase** sahifa; barcha `variant="primary/ghost/danger"` `@dental/ui` Button'da; raw Mantine (`MButton` alias) faqat standart `variant="default"` (Menu/Modal bridge testi). variantColorResolver o'zича bitta ham buzilgan raw saytni tuzatmaydi.

**Lekin haqiqiy nomuvofiqlik bor** (CLI-177 audit "ikki parallel tizim" ning yadrosi): tugma **ikki xil implementatsiyada** mavjud —
1. `@dental/ui` Button/IconButton — custom `UnstyledButton` + CSS module (`data-variant`),
2. raw Mantine `<Button>`/`<ActionIcon>` — Mantine variant tizimi.

Ikkalasi qo'lda, umumiy tokenlar orqali sinxron tutiladi — bu aynan divergensiyani keltirib chiqargan **dual-maintenance kasalligi**. v2 buni davolaydi: **bitta manba** — Mantine + theme.

## 1. Yechim

### 1.1 `@dental/ui` Button → Mantine `Button` wrapper

`UnstyledButton` + `Button.module.css` ni Mantine `Button` wrapper bilan almashtirish. Tashqi API **o'zgarmaydi** (7 ishlatuvchi + DesignSystemPage buzilmaydi):

| `@dental/ui` Button prop | Mantine Button ga map |
|---|---|
| `variant: 'default'\|'primary'\|'ghost'\|'danger'` | `variant` (custom variantlar variantColorResolver orqali) |
| `size: 'sm'\|'md'\|'lg'` | `size` (`sm`/`md`/`lg`) |
| `block` | `fullWidth` |
| `iconLeft` / `iconRight` | `leftSection` / `rightSection` |
| `disabled`, `onClick`, `type`, `children` | bevosita |

- CLI-175 hover-lift micro-interaction (`translateY(-1px)`) — `Button.extend` `classNames`/CSS module orqali saqlanadi (reduced-motion guard global `styles.css` da qoladi).
- Primary glow shadow — `Button.extend` `styles` (props.variant==='primary') yoki classNames orqali.

### 1.2 `@dental/ui` IconButton → Mantine `ActionIcon` wrapper

| IconButton prop | ActionIcon ga map |
|---|---|
| `label` | `aria-label` + `title` |
| `size: 'sm'\|'md'` | `size` |
| `bordered` | `variant` (`default` bordered ↔ `subtle`/`transparent`) |
| `dot` | qo'shimcha absolyut `<span>` (mavjud `IconButton.module.css` `.dot` saqlanadi) |
| `disabled`, `onClick`, `children` | bevosita |

### 1.3 `variantColorResolver` (theme)

`mantine-theme.ts` `createTheme({ variantColorResolver })` — custom `primary`/`ghost`/`danger`. Endi **@dental/ui Button (Mantine wrapper bo'lgach)** + har qanday kelajak raw Mantine `variant="primary"` ikkalasi bir manbadan rang oladi:

| variant | background | color | hover | border |
|---|---|---|---|---|
| `primary` | `var(--primary)` | `var(--text-on-primary)` | `var(--primary-hover)` | transparent |
| `ghost` | transparent | `var(--primary)` | `var(--primary-tint)` | transparent |
| `danger` | `var(--danger)` | `var(--text-on-danger)` | `color-mix(in srgb, var(--danger) 88%, black)` | transparent |

Boshqa barcha variantlar → `defaultVariantColorsResolver(input)` (o'zgarmaydi — regressiya guard). `VariantColorsResolverResult`: `{ background, hover, color, border, hoverColor? }`. Token'lar scheme-agnostik (`tokens.css` light/dark o'zi almashadi) → resolver'da scheme tarmoqlanishi shart emas.

> Mantine 7 API: `variantColorResolver` `createTheme()` ning xossasi (context7 snippet tasdiqlagan: `theme.variantColorResolver`). Implementatsiyada TDD birinchi qadam bilan tasdiqlanadi.

## 2. Ko'lamdan tashqari

- **Input oilasi** (custom Input → Mantine TextInput wrapper, Select pass-through, form-compat) → **CLI-179**.
- Form error call-site bug fix → CLI-179.
- Vocabulary lint (`color="red"` ban, size cheklash) + `loading` parity → CLI-180.
- StatusPill/Tag/Badge → CLI-181.
- Raw Mantine → primitiv ommaviy migration → **qilinmaydi** (single-source theme buni keraksiz qiladi).

## 3. Risk va guard

- **Eng katta regressiya yuzasi:** Mantine Button standart variantlari (`default` 14+, `filled`, `light`, `subtle`) — `defaultVariantColorsResolver` fallback ularni AYNAN saqlashi shart. → resolver unit test guard.
- **@dental/ui Button API regressiya** — 7 ishlatuvchi + DesignSystemPage showcase. Mavjud `Button.test.tsx`/`IconButton.test.tsx` characterization sifatida yashil qolishi shart; kerak bo'lsa kengaytiriladi (variant→Mantine variant, fullWidth, leftSection render).
- **teal-sync.test.ts / css-variables-resolver.test.ts** — teal tuple va cssVarsResolver o'zgarmaydi → buzilmaydi.
- **CLI-175 hover-lift** — wrapper'da yo'qolmasligi (test yoki manual).

## 4. Test strategiyasi

1. `variant-color-resolver.test.ts` (yangi) — `primary`/`ghost`/`danger` to'g'ri `{background,color,hover,border}`; `filled`/`light`/`default` `defaultVariantColorsResolver` bilan AYNAN teng (regressiya guard).
2. Mavjud `Button.test.tsx` / `IconButton.test.tsx` — wrapper'dan keyin yashil (API paritet); zarur bo'lsa yangi case (variant prop → Mantine'ga o'tadi, `block`→fullWidth, `iconLeft` render).
3. `teal-sync` + `css-variables-resolver` testlar yashil.
4. Manual (Playwright ixtiyoriy): `DesignSystemPage` Buttons kartasi v1 bilan vizual mos (primary/ghost/danger/default/sizes/disabled + IconButton dot/bordered); hover-lift saqlangan.

## 5. DoD

- `@dental/ui` Button/IconButton Mantine wrapper; `UnstyledButton`+`Button.module.css` custom variant CSS retire (yoki `Button.extend` ga ko'chirildi).
- `variantColorResolver` theme'da; `variant-color-resolver.test.ts` + mavjud theme/primitiv testlar yashil.
- `bun test` (ui paketi) o'tadi; `tsc` toza.
- DesignSystemPage showcase regressiyasiz; CLI-175 hover-lift bor.
