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

> **Qayd (audit root-cause takrori):** `FamilyTab` raw Mantine `Select` ishlatadi, chunki `searchable`/`searchValue`/`onSearchChange`/`nothingFoundMessage` kerak — `@dental/ui` Select wrapper bu props'larni ochmaydi (under-featured primitiv — auditning asl sababi). Bu task'da qoldiriladi; kelajak kengaytirish (CLI-181-yondosh yoki yangi task) uchun qayd.

### 3.3 Call-site migration (FAQAT schema xato ishlab chiqaradigan maydonlar)

⚠️ **Schema-tekshirildi** (advisor must-fix — `form.errors.X` doim undefined bo'lsa wire foydasiz):

| Fayl | Schema | O'zgarish |
|---|---|---|
| `GeneralTab.tsx` | `patientEditSchema`: `fullName` min(2) ✓ | `fullName` Input `invalid` → `error={form.errors.fullName}` (asosiy). Boshqalar (dateOfBirth/passport/address optional yoki max-only) `error` qo'shiladi — **zararsiz, kelajakka tayyor**, lekin test'da guard qilinmaydi |
| `PatientNewScreen.tsx` | `patientFormSchema`: `fullName` min(2) ✓, `insurance` refine→`policyNumber` ✓ | `fullName` + `insurance.provider`/`insurance.policyNumber` Input → `error` (validatsiya qiladi); qolgan Input/Select → `error` (zararsiz) |
| `FamilyTab.tsx` | `addRelativeFormSchema`: `relationship` min(1) ✓ | `relationship` Input → `error={form.errors.relationship}` (raw Mantine Select allaqachon `error` — qoldiriladi, §3.2 note) |
| `MedicalTab.tsx` | `medicalRecordFormSchema`: **barchasi `optional`** | ❌ **O'ZGARMAYDI** — hech bir maydon validatsiya xatosi bermaydi → `error` wire foydasiz. Allergy ro'yxati ham non-form. MedicalTab bu task'dan tashqarida |

> `invalid` boshqa joyda (DesignSystemPage showcase) qoladi — orqaga moslik. Yangi kodda `error` afzal (mini-inconsistency, lekin ikkalasi yashaydi).

## 4. Test strategiyasi

1. **Form-level guard (advisor must-fix — ASOSIY)** — `PatientNewScreen` (yoki kamroq bog'liqlikli GeneralTab) render, bo'sh `fullName` bilan submit, validatsiya XABARI DOM'da paydo bo'lishini assert. ⚠️ Bu **bugun fail bo'ladi, fix'dan keyin pass** — chunki bug integration-level (call-site `invalid` o'rniga `error` uzatadi). Component test buni guard QILMAYDI (0 call-site migrate qilinса ham o'tadi). Implementatsiyada `apps/web` test-utils provider'lari (router/i18n/query) tekshiriladi; validatsiya fail submit'ni bloklaydi → API mock shart emas.
2. `Input.test.tsx` — mavjud 3 test (label/placeholder, `onChange(value)` signature, `invalid` data-attr) **yashil qoladi** (signature buzilmaydi). Yangi: `error` matnni render qiladi + `role="alert"` + `data-invalid` avtomatik.
3. `Select.test.tsx` — yangi: `error` propi Mantine error matnini ko'rsatadi.
4. Manual (Playwright ixtiyoriy): PatientNewScreen'da bo'sh `fullName` submit → xabar ko'rinadi.

> Test darsi (CLI-153 precedent): real xulqni guard qil, komponent qobiliyatini emas. Form-level test #1 = bug'ning haqiqiy guard'i.

## 5. Ko'lamdan tashqari
- Input'ni Mantine TextInput'ga to'liq retire → qilinmaydi (YAGNI, churn).
- `getInputProps` spread'ga ko'chirish → qilinmaydi (non-form call-site'lar tufayli; `value`+`onChange`+`error` qo'lda yetarli).
- Button vocabulary/lint → CLI-180; status → CLI-181.

## 6. DoD
- `@dental/ui` Input `error`/`disabled` qo'llab-quvvatlaydi; Select `error`/`disabled` pass-through.
- 4 fayldagi form call-site'lar `error` ko'rsatadi (allergy non-form list daxlsiz).
- `Input.test.tsx` + `Select.test.tsx` yashil; `bun test` (ui + web) o'tadi; `tsc` toza.
- Manual: bo'sh-form submit'da validatsiya XABARI ko'rinadi.
