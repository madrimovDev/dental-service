# CLI-179 — Form validatsiya xatosini ko'rinadigan qilish (Input/Select `error`)

**Sana:** 2026-06-14
**Epik:** CLI-177 (UI komponent izchilligi)
**Holat:** Spec — advisor approval kutilmoqda (solo dev oldindan tasdiqladi)

## 1. Muammo (kuzatilgan foydalanuvchi bug)

`@dental/ui` Input faqat `invalid?: boolean` qabul qiladi — `error` matni yo'q (`Input.tsx:9`). `@dental/ui` Select umuman `error` propga ega emas. Natijada form call-site'larida:

```tsx
<Input invalid={!!form.errors.fullName} onChange={(v) => form.setFieldValue('fullName', v)} />
```

validatsiya muvaffaqiyatsiz bo'lganda foydalanuvchi **faqat qizil ramka** ko'radi — "Ism majburiy" kabi XABAR hech qachon chiqmaydi. Ba'zi maydonlarda `invalid` ham berilmagan (`GeneralTab.tsx:164` `dateOfBirth`, `:198` `passport`) → hech qanday signal.

**Aralashlik tasdiqlandi:** bir xil formada Mantine native maydonlar (`Textarea`, `TagsInput`, `PhoneInput`, FamilyTab raw `Select`) `{...form.getInputProps()}` / `error={...}` orqali xatoni KO'RSATADI, `@dental/ui` Input/Select esa YO'Q. Foydalanuvchi bir formada ba'zi xatolarni ko'radi, ba'zilarini ko'rmaydi.

**Ko'lam:** @dental/ui Input — 13 ishlatish / 4 fayl; @dental/ui Select — 6 / 3 fayl (GeneralTab, PatientNewScreen, FamilyTab, MedicalTab).

## 2. Yondashuv qarori: `error` prop qo'shish (signature saqlanadi), TextInput wrapper EMAS

Advisor "custom-Input → Mantine TextInput wrapper + getInputProps migration" taklif qildi. Men **kichikroq yondashuvni** tanlayapman, sababi bilan (advisor approval'da hal qilinadi):

**Hal qiluvchi fakt:** barcha call-site `@mantine/form` ishlatmaydi. `MedicalTab` allergy ro'yxati Input/Select'ni **ephemeral state** bilan ishlatadi (`onChange={(v) => updateAllergy(i, { substance: v })}` — value-first, form yo'q, validatsiya yo'q). Input'ni TextInput wrapper qilib `onChange(event)`ga o'tkazish bu non-form call-site'larni buzadi va ular `getInputProps` ololmaydi (form yo'q).

Shuning uchun:
- **`onChange(value, e)` signature SAQLANADI** — non-form call-site'lar (allergy list, bloodType…) buzilmaydi.
- Asosiy bug `error` matnni ko'rsatish — bu signature o'zgarishini TALAB QILMAYDI.
- `icon` prop hech qayerda ishlatilmaydi → custom native input retire qilish ham faqat churn (CLI-178 darsi). YAGNI.

> Keyinroq, alohida tozalash kerak bo'lsa, Input'ni Mantine TextInput'ga *retire* qilish mumkin — lekin u hozir bug'ni tuzatmaydi, faqat ichki o'zgarish.

## 3. Yechim

### 3.1 `@dental/ui` Input — `error` + `disabled` qo'shish

`Input.tsx`:
- `error?: ReactNode` — bo'lsa: (a) `invalid` styling avtomatik yoqiladi (`data-invalid`), (b) field ostida `<span className={classes.error} role="alert">{error}</span>` render.
- `invalid` prop saqlanadi (orqaga moslik) — lekin `error` bo'lsa `invalid` shart emas (avtomatik).
- `disabled?: boolean` — native `<input disabled>` + `data-disabled` styling.
- `required?: boolean` — label'da `*` (ixtiyoriy, Mantine paritet).
- `aria-describedby` — error span bilan bog'lash (a11y).
- `onChange(value, e)` — **o'zgarmaydi**.

`Input.module.css`: `.error` (font `--text-sm`, `color: var(--danger)`, margin-top) + `data-disabled` (opacity/cursor).

### 3.2 `@dental/ui` Select — `error` + `disabled` pass-through

`Select.tsx` Mantine `Select` wrapper — `error?: ReactNode` va `disabled?: boolean` props qo'shib bevosita Mantine'ga uzatish (Mantine Select ikkalasini ham native qo'llab-quvvatlaydi, error matn + styling bepul).

### 3.3 Call-site migration (faqat form-bog'liq)

| Fayl | O'zgarish |
|---|---|
| `GeneralTab.tsx` | 4 Input `invalid={!!form.errors.X}` → `error={form.errors.X}`; 1 Select `error={form.errors.gender}` qo'shish |
| `PatientNewScreen.tsx` | 6 Input → `error={form.errors.X}`; 2 Select → `error` |
| `FamilyTab.tsx` | 1 Input → `error={form.errors.relationship}` (raw Mantine Select allaqachon `error` bilan — qoldiriladi) |
| `MedicalTab.tsx` | form-bog'liq Input (`bloodType` va sh.k.) → `error`; **allergy ro'yxati (non-form) O'ZGARMAYDI** |

> `invalid` boshqa joyda (DesignSystemPage showcase) qoladi — orqaga moslik saqlanadi.

## 4. Test strategiyasi

1. `Input.test.tsx` — mavjud 3 test (label/placeholder, `onChange(value)` signature, `invalid` data-attr) **yashil qoladi** (signature buzilmaydi). Yangi: `error` matnni render qiladi + `role="alert"` + `data-invalid` avtomatik.
2. `Select.test.tsx` — yangi: `error` propi Mantine error matnini ko'rsatadi.
3. Manual (Playwright ixtiyoriy): PatientNewScreen'da bo'sh `fullName` bilan submit → validatsiya XABARI ko'rinadi (avval faqat ramka edi).

## 5. Ko'lamdan tashqari
- Input'ni Mantine TextInput'ga to'liq retire → qilinmaydi (YAGNI, churn).
- `getInputProps` spread'ga ko'chirish → qilinmaydi (non-form call-site'lar tufayli; `value`+`onChange`+`error` qo'lda yetarli).
- Button vocabulary/lint → CLI-180; status → CLI-181.

## 6. DoD
- `@dental/ui` Input `error`/`disabled` qo'llab-quvvatlaydi; Select `error`/`disabled` pass-through.
- 4 fayldagi form call-site'lar `error` ko'rsatadi (allergy non-form list daxlsiz).
- `Input.test.tsx` + `Select.test.tsx` yashil; `bun test` (ui + web) o'tadi; `tsc` toza.
- Manual: bo'sh-form submit'da validatsiya XABARI ko'rinadi.
