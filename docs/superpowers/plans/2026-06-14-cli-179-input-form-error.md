# CLI-179 — Form validatsiya xatosini ko'rinadigan qilish (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use `- [ ]` tracking.

**Goal:** `@dental/ui` Input/Select `error` prop qo'llab-quvvatlasin va form call-site'lar validatsiya xabarini ko'rsatsin (hozir faqat qizil ramka).

**Architecture:** Input'ga `error?: ReactNode` qo'shiladi (native input qoladi, `onChange(value)` signature SAQLANADI — non-form allergy list buzilmasin). Select Mantine wrapper'ga `error`/`disabled` pass-through. Schema xato beradigan call-site'lar (`fullName`, `insurance.*`, `relationship`) `invalid`→`error` ga ko'chiriladi. Bug guard'i = form-level test.

**Tech Stack:** React 18, Mantine v7, `@mantine/form`, Zod 4, Vitest, `@testing-library/react`.

---

### Task 1: `@dental/ui` Input — `error` + `disabled`

**Files:**
- Modify: `packages/ui/src/primitives/Input/Input.tsx`
- Modify: `packages/ui/src/primitives/Input/Input.module.css`
- Test: `packages/ui/src/primitives/Input/Input.test.tsx`

- [ ] **Step 1: Failing test qo'shish** (`Input.test.tsx` `describe` ichiga)

```tsx
it('error matnni role=alert bilan korsatadi va data-invalid avtomatik', () => {
  renderUI(<Input label="Ism" error="Ism majburiy" />);
  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent('Ism majburiy');
  expect(screen.getByRole('textbox').closest('[data-invalid]')).not.toBeNull();
});

it('disabled holatda input ochirilgan', () => {
  renderUI(<Input label="Ism" disabled />);
  expect(screen.getByRole('textbox')).toBeDisabled();
});
```

- [ ] **Step 2: Test fail bo'lishini tasdiqlash**

Run: `cd packages/ui && bun run test -- Input` (yoki `bunx vitest run src/primitives/Input`)
Expected: FAIL — `error`/`disabled` propi yo'q, `role="alert"` topilmaydi.

- [ ] **Step 3: Input.tsx implementatsiya**

`InputProps` ga qo'shish: `error?: ReactNode;`, `disabled?: boolean;`, `required?: boolean;`. Funksiya signature: `error`, `disabled = false`, `required = false` destructure. `invalid` o'rniga effektiv invalid hisoblash:

```tsx
export interface InputProps {
  label?: string;
  value?: string;
  placeholder?: string;
  icon?: ReactNode;
  invalid?: boolean;
  error?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  onChange?: (value: string, e: ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}

export function Input({
  label, value, placeholder, icon, invalid = false, error,
  disabled = false, required = false, onChange, type = 'text',
}: InputProps) {
  const isInvalid = invalid || error != null;
  const field = (
    <div className={classes.wrap} data-invalid={isInvalid || undefined} data-disabled={disabled || undefined}>
      {icon}
      <input
        className={classes.input}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={isInvalid || undefined}
        onChange={onChange ? (e) => onChange(e.target.value, e) : undefined}
      />
    </div>
  );
  const errorNode = error != null ? <span className={classes.error} role="alert">{error}</span> : null;
  if (!label) return <>{field}{errorNode}</>;
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: input nested via `field` variable (implicit association)
    <label className={classes.field}>
      <span>{label}{required && <span className={classes.req}> *</span>}</span>
      {field}
      {errorNode}
    </label>
  );
}
```

- [ ] **Step 4: Input.module.css — `.error`, `.req`, `data-disabled`**

```css
.error {
  font-size: var(--text-sm);
  color: var(--danger);
  margin-top: 2px;
}
.req {
  color: var(--danger);
}
.wrap[data-disabled="true"] {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--surface-2);
}
```

- [ ] **Step 5: Test pass + mavjud testlar yashil**

Run: `cd packages/ui && bunx vitest run src/primitives/Input`
Expected: PASS (5 test — 3 mavjud + 2 yangi). `onChange(value)` signature testi buzilmaydi.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/primitives/Input/
git commit -m "feat(ui): Input error/disabled prop support (CLI-179)"
```

---

### Task 2: `@dental/ui` Select — `error` + `disabled` pass-through

**Files:**
- Modify: `packages/ui/src/primitives/Select/Select.tsx`
- Test: `packages/ui/src/primitives/Select/Select.test.tsx`

- [ ] **Step 1: Failing test** (`Select.test.tsx`ga)

```tsx
it('error matnni korsatadi', () => {
  renderUI(<Select label="Jins" error="Tanlang" data={[{ value: 'm', label: 'Erkak' }]} />);
  expect(screen.getByText('Tanlang')).toBeInTheDocument();
});
```

- [ ] **Step 2: Fail tasdiqlash**

Run: `cd packages/ui && bunx vitest run src/primitives/Select`
Expected: FAIL — `error` propi `SelectProps`da yo'q (TS xato yoki matn topilmaydi).

- [ ] **Step 3: Select.tsx — error/disabled qo'shish**

`SelectProps` ga `error?: ReactNode;` va `disabled?: boolean;` qo'shib, Mantine `Select`ga uzatish:

```tsx
export interface SelectProps {
  label?: string;
  value?: string | null;
  onChange?: (value: string | null) => void;
  placeholder?: string;
  error?: ReactNode;
  disabled?: boolean;
  data: ComponentProps<typeof MantineSelect>['data'];
}

export function Select({ label, value, onChange, placeholder, error, disabled, data }: SelectProps) {
  return (
    <MantineSelect
      label={label}
      value={value}
      onChange={(v) => onChange?.(v)}
      placeholder={placeholder}
      error={error}
      disabled={disabled}
      data={data}
      classNames={{ input: classes.input, dropdown: classes.dropdown, option: classes.option }}
    />
  );
}
```
(`ReactNode` importini `react`'dan qo'shish.)

- [ ] **Step 4: Test pass**

Run: `cd packages/ui && bunx vitest run src/primitives/Select`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/primitives/Select/
git commit -m "feat(ui): Select error/disabled pass-through (CLI-179)"
```

---

### Task 3: Form-level guard test (RED) — bug'ning haqiqiy isboti

**Files:**
- Modify: `apps/web/src/features/patients/components/PatientNewScreen.test.tsx`

- [ ] **Step 1: Form-level test qo'shish**

```tsx
it("bosh ism bilan submit qilsa validatsiya xabari korinadi (CLI-179 bug guard)", async () => {
  renderApp(<PatientNewScreen />);
  fireEvent.click(screen.getByText('Saqlash'));
  // fullName '' → min(2) buziladi → form.errors.fullName o'rnatiladi → Input error render
  await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(createMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Test fail bo'lishini tasdiqlash (bug mavjud)**

Run: `cd apps/web && bunx vitest run src/features/patients/components/PatientNewScreen.test.tsx`
Expected: FAIL — `getByRole('alert')` topilmaydi (call-site `invalid` ishlatadi, error matn yo'q). **Bu bug'ning aynan o'zi.**

> Agar `createMock` allaqachon chaqirilmagan bo'lsa — bu kutilgan (validatsiya bloklaydi). Fail faqat `alert` yo'qligidan.

---

### Task 4: Call-site migration (GREEN) — `invalid` → `error`

**Files:**
- Modify: `apps/web/src/features/patients/components/PatientNewScreen.tsx`
- Modify: `apps/web/src/features/patients/components/tabs/GeneralTab.tsx`
- Modify: `apps/web/src/features/patients/components/tabs/FamilyTab.tsx`

- [ ] **Step 1: PatientNewScreen.tsx — `@dental/ui` Input/Select `error` qo'shish**

Har `@dental/ui` `<Input>` da `invalid={...}` ni `error={form.errors.X}` bilan almashtirish; `invalid` bo'lmagan Input'larga `error={form.errors.X}` qo'shish. Select'larga `error={form.errors.X}` qo'shish. Aniq:
- `fullName` Input: `invalid={!!form.errors.fullName}` → `error={form.errors.fullName}`
- `dateOfBirth` Input: `error={form.errors.dateOfBirth}` qo'shish
- `passport` Input: `error={form.errors.passport}`
- `address` Input: `error={form.errors.address}`
- `insurance.provider` Input: `error={form.errors['insurance.provider']}`
- `insurance.policyNumber` Input: `error={form.errors['insurance.policyNumber']}`
- `gender` Select: `error={form.errors.gender}`
- `source` Select: `error={form.errors.source}`

- [ ] **Step 2: GeneralTab.tsx — bir xil**

- `fullName` Input: `invalid={!!form.errors.fullName}` → `error={form.errors.fullName}`
- `dateOfBirth`/`passport`/`address` Input: `error={form.errors.X}` qo'shish
- `gender` Select: `error={form.errors.gender}`
- (form `useUpdatePatient` + `patientEditSchema`, `fullName` min(2) ✓)

- [ ] **Step 3: FamilyTab.tsx — `relationship` Input**

`relationship` Input: `invalid={!!form.errors.relationship}` → `error={form.errors.relationship}`. (raw Mantine `Select` allaqachon `error` — daxlsiz.)

> MedicalTab daxlsiz (schema barchasi optional; allergy non-form).

- [ ] **Step 4: Form-level test PASS**

Run: `cd apps/web && bunx vitest run src/features/patients/components/PatientNewScreen.test.tsx`
Expected: PASS — bo'sh submit endi `alert` ko'rsatadi. Mavjud "create id bilan chaqiriladi" testi ham yashil (valid submit ishlaydi).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/patients/
git commit -m "fix(web): show validation errors on patient forms (CLI-179)

@dental/ui Input/Select error prop wired to form.errors on schema-validating
fields (fullName, insurance, relationship). Previously only a red border showed."
```

---

### Task 5: To'liq verifikatsiya

- [ ] **Step 1: UI paket testlari**

Run: `cd packages/ui && bunx vitest run`
Expected: barcha PASS (Input, Select, teal-sync, css-vars-resolver…).

- [ ] **Step 2: Web testlari**

Run: `cd apps/web && bunx vitest run src/features/patients`
Expected: PASS.

- [ ] **Step 3: Typecheck + lint**

Run: `cd /home/madrimov/Projects/dental-service && bun run typecheck && bunx biome check packages/ui/src/primitives apps/web/src/features/patients`
Expected: toza (yoki mavjud baseline bilan bir xil).

- [ ] **Step 4: Manual smoke (ixtiyoriy, Playwright)** — PatientNewScreen bo'sh submit → "ism" validatsiya xabari ekranda.

---

## Self-review

- **Spec coverage:** Input error (T1) ✓, Select error (T2) ✓, form-level guard (T3) ✓, call-site migration schema-verified (T4) ✓, full verify (T5) ✓. MedicalTab ataylab tashqarida (spec §3.3). FamilyTab Select qaydi (spec §3.2).
- **Placeholder scan:** kod bloklar to'liq, exact path, exact command. ✓
- **Type consistency:** `error?: ReactNode` Input & Select'da bir xil; `data-invalid` atribut nomi Input.tsx ↔ test ↔ CSS bir xil. ✓
- **Risk:** `form.errors['insurance.provider']` — Mantine nested error key nuqta bilan; agar `getInputProps` formatdan farq qilsa, implementatsiyada `form.errors` obyektini tekshirish (nested path Mantine'da nuqtali kalit). Bu T4 Step 1'da tasdiqlash kerak.
