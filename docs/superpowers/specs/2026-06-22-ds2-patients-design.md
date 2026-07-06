# DS2 — Bemorlar list + Yangi bemor (Dental OS re-skin) — Design Spec

**Sana:** 2026-06-22
**Milestone:** DS2 (Dental OS pixel-parity redesign)
**Branch:** `feat/ds2-patients` (worktree `/home/madrimov/Projects/ds-wt-ds2`)
**Dizayn manbasi:** Dental OS prototip (React-createElement, `isPatients` + `isNewPatient` viewlar) — gap-brief `docs/superpowers/briefs/ds2-gap.md`
**Qarorlar:** #32 (token remap-in-place), #33 (pixel-parity, **funksiya saqlanadi**), #35 (per-milestone sikl)
**Deferred katalog:** `docs/superpowers/briefs/ds12-deferred-backend.md`

---

## 1. Maqsad va doira

DS2 — bemorlar **ro'yxati** (nav-key `patients`, "Bemorlar") + **yangi bemor formasi** (`/patients/new`) ekranlarini Dental OS dizayniga **front-end-only re-skin** qilish. Funksiya, API, schema, i18n kalit semantikasi, permission/vertical gating **o'zgarmaydi** (Qaror #33). DS0 poydevori (tokens.css, shell, primitivlar) **qulflangan** — tegilmaydi.

**Doirada (FAQAT shu fayllar):**
- `apps/web/src/features/patients/components/PatientsListScreen.tsx` + `.module.css`
- `apps/web/src/features/patients/components/PatientNewScreen.tsx` + `.module.css`
- (ixtiyoriy yangi, feature ichida) `apps/web/src/features/patients/components/BalanceChip.tsx` — lokal balans chip
- Mavjud test fayllar (characterization — yashil qoladi)
- `packages/i18n/src/locales/{uz,ru}.json` — **FAQAT** belgilangan i18n task (T3) tegadi

**Doiradan TASHQARI (INVARIANT — TEGILMAYDI):**
- `packages/ui/src/theme/*`, `packages/ui/src/primitives/*` (DS0 locked) — jumladan `Avatar`, `Card`, `Input`, `Select`, `StateView`, `Button`, `IconButton`, `Tag`, `Mono`, `PageHead`.
- `apps/web/src/shell/*`, `apps/web/src/stores/ui-store.ts`.
- **`apps/web/src/components/BalanceBadge.tsx`** — SHARED app-level komponent (cashier `PosPanel`, `PatientCard`, `PaymentsTab` ham ishlatadi). Restyle qilish DS2 doirasidan tashqari ekranlarga **vizual oqim** beradi → **TEGILMAYDI**. DS2 list balans chipini feature ichida lokal `BalanceChip` bilan teradi.
- **`apps/web/src/components/PhoneInput.tsx`** — SHARED (auth login/register/reset, settings branches/users ham ishlatadi). Telefon maskalash funksiyasi shu komponentda → **TEGILMAYDI** va **almashtirilmaydi** (`Input`ga almashtirish maskani yo'qotadi = funksiya o'zgarishi). Form re-skini PhoneInput **atrofidagi** label/grid layoutni teradi; telefon control'ning o'z ko'rinishi saqlanadi (qabul qilingan deviation).
- Backend / API / migration / yangi hook / yangi field — **YO'Q** (Qaror #33).
- Bemor **kartochka/detal** (`/patients/:id`, `PatientCard` + tablar) — bu **DS3**, DS2 emas.

---

## 2. Qulflangan qarorlar (brainstorm + advisor 2026-06-22)

| # | Qaror | Sabab |
|---|---|---|
| Shared komponent | `BalanceBadge` + `PhoneInput` **TEGILMAYDI** | Binding scope = faqat `features/patients/`; ikkalasi ham boshqa ekranlarda ishlatiladi (oqim xavfi). |
| Balans chip | Feature ichida **lokal** `BalanceChip` | Shared `BalanceBadge`ni o'zgartirmasdan DS2 chip ko'rinishini beradi. `formatCurrency(…, t)` qayta ishlatiladi. |
| Gradient avatar | **Lokal `<span>`** (primitiv emas) | `Avatar` primitivi dumaloq + gradient yo'q (DS0 locked) → 38×38 / 11px radius gradient tile lokal element. |
| Empty state | Locked `StateView` (`icon`/`title`/`description`/`action` slotlari) | StateView allaqachon CTA `action` slotini qo'llaydi → fork shart emas. |
| Filter pills | **Faqat API-backed:** Barchasi / Arxiv (↔ `archived`). Doimiy/Qarzdorlar **OMIT** | Ishlamaydigan pill = "funksional yolg'on"; mock filtrlari client-side mock data ustida, bizniki server-paginated. |
| `lastVisit` / `#code` / allergy alert-dot | **OMIT** (data-absent) | DTO'da yo'q (`PatientListItem = Patient & { balance }`). Qo'shish = backend (DS12). |
| Shrift | `--font-sans` / `--font-mono` (prototip `--ui`/`--mono` aliaslari **yo'q**) | tokens.css bu ikki nomni alias qilmaydi; qo'shish = locked tokens.css edit. |
| Dark kontrast | Gradient avatar matni `--on-primary`, danger "!" badge `--text-on-danger` — **`#fff` EMAS** | CLI-80/255 darsi; `#fff` dark'da flip qilmaydi. |
| Form field-set | Mavjud `patientFormSchema` field'lari **saqlanadi** | Qaror #33; mock'ning telegram/qon-guruhi/severity field'lari schema'da yo'q → qabul qilinmaydi. |

---

## 3. Token map (VERIFIED — tokens.css'da mavjud, tarjima shart emas)

DS0 prototip token nomlarini literal alias sifatida saqlagan, demak prototip vars to'g'ridan-to'g'ri resolve bo'ladi:

| Prototip var | Bizning token | Qiymat (light / dark) |
|---|---|---|
| `--ink` / `--ink-2` / `--ink-3` | `--text` / `--text-2` / `--text-3` | #192420 / #4C5852 / #7A857E |
| `--surface` / `--surface-2` | bir xil | #FFFFFF / #F6F8F4 |
| `--border` / `--border-strong` | bir xil | #E4E8E1 / #D3D9CF |
| `--primary` / `--primary-strong` | bir xil | #0B7A6B / #096154 |
| `--primary-soft` | (= `--primary-tint`) | #DDEFEA / dark #16332C |
| `--on-primary` | (= `--text-on-primary`) | #FFFFFF light / **#04130F dark** |
| `--danger` / `--danger-soft` | (`--danger-bg`) | #CC3D3A / #FBE7E5 (dark #341917) |
| `--text-on-danger` | bir xil | #fff light / **#2a0f0d dark** |
| `--violet` | bir xil (DS0 yangi) | #7C4DD6 / dark #B093EE |
| `--shadow-sm` / `--shadow` | bir xil | theme-aware |
| `--ui` → `--font-sans`; `--mono` → `--font-mono` | (alias YO'Q) | Hanken Grotesk / JetBrains Mono |

**Radius:** karta `16px` (≈ token yo'q, literal qabul); input `11px` (literal qabul); pill `99px` = `--radius-pill`. Minor radius literallari feature CSS'da maqbul (past xavf).

---

## 4. Komponent-ma-komponent

### 4A. PatientsListScreen (T1)

Mavjud xulq saqlanadi: `usePatients({ search, archived, page })`, `useArchivePatient()`, `useAuthStore().hasPermission`, `useNavigate`, real `Pagination` (`total > pageSize`), `StateView` loading(`skeleton="table"`)/error(retry).

**Header (re-skin):**
- Title "Bemorlar" (`patients.title`, 17px/700/`--ink`) + sub-line `{count} ta bemor` (`data.meta.total`) · filial nomi (auth/shell store'da mavjud bo'lsa; aks holda faqat count). Yangi i18n: `patients.count` ("{{count}} ta bemor" interpolatsiya).
- O'ng klaster: restyle qilingan qidiruv (mavjud `Input` `icon={<Search/>}` + `placeholder` saqlanadi — wrapper 38px/230px-min/10px-radius) + "Yangi bemor" `Button variant="primary" iconLeft={<Plus/>}` (`patient.create` gated — saqlanadi). `PageHead` o'rniga lokal header div (yoki `PageHead` + qo'shimcha sub-line — implementatsiya tanlovi, lekin permission gating saqlanadi).

**Filter pills (additive, presentational):** 2 pill — `Barchasi` (active=`!archived`) / `Arxiv` (active=`archived`). `archived` state'ni almashtiradi (mavjud `Switch` o'rnini bosadi; `setPage(1)` saqlanadi). Doimiy/Qarzdorlar **OMIT**. Yangi i18n: `patients.filter.all`, `patients.filter.archived`.

**Table card:** `Card bodyless` ichida CSS grid jadval:
- Header qator: grid `minmax(0,1.6fr) 170px 120px 150px` (**4 ustun** — `lastVisit` data-absent bo'lgani uchun tushirildi). Ustunlar: Bemor / Telefon / Yosh · jins / Balans (Balans o'ng). `--surface-2` bg, 11px/700/uppercase/`--ink-3`. Yangi i18n: `patients.col.patient/phone/age_gender/balance`.
- Data qator (bir xil grid): `border-top:1px solid var(--border)`, hover `--surface-2`, butun qator bosiladi → `navigate('/patients/:id')`.
  - **Gradient avatar (lokal span):** 38×38, `border-radius:11px`, `background:linear-gradient(135deg,var(--primary),var(--violet))`, `color:var(--on-primary)`, initials (mavjud `Avatar` initials mantig'ini takrorlash yoki inline). `Avatar` primitivi ishlatilmaydi (dumaloq).
  - Ism qator: `fullName` (600/`--ink`, ellipsis) + mavjud `tags` birinchisi inline pill (`--primary-soft`/`--primary`/10.5px). **Alert-dot va `#code` OMIT** (data-absent).
  - Telefon ustun: `--font-mono`/12.5px/`--ink-2` (mavjud `phone`).
  - Yosh·jins: `{age} · {genderLabel}` (`--ink-2`). `genderLabel` allaqachon `PatientListItem`da mavjud (mapper beradi) — render qilinadi.
  - Balans ustun: o'ng, lokal `<BalanceChip balance={p.balance}/>` (T1 yoki BalanceChip fayli).
  - View/archive `IconButton`lar saqlanadi (`patient.delete` gated archive) — qator ichida, qator-click bilan to'qnashmasligi uchun `stopPropagation`.

**Empty state (StateView):** `status="empty"` + `icon` (54×54 tile ko'rinishi — Search ikon), `title` (`patients.empty_title` "Bu bo'limda bemor yo'q"), `description` (`patients.empty_desc`), `action` (`patient.create` bo'lsa "Yangi bemor qo'shish" `Button` → `/patients/new`). Locked StateView fork qilinmaydi.

**Characterization (yashil qolishi shart):** "Ali Valiyev" + "VIP" ko'rinadi; balans "150" ko'rinadi; `aria-busy` loading; "Arxivlash" IconButton archive'ni `'p1'` bilan chaqiradi.

### 4B. PatientNewScreen (T2)

Mavjud xulq saqlanadi: `useForm<PatientFormValues>` + `zod4Resolver(patientFormSchema)`, `useCreatePatient`, `onSuccess → navigate('/patients/:id')`, **barcha mavjud field'lar** (fullName, dateOfBirth, gender, phone, phoneSecondary, passport, address, notes, tags, source, insurance{provider, policyNumber, coverageType, expiryDate, isActive}), CLI-179 `error` prop wiring.

**Layout (re-skin):**
- Top back-link "‹ Bemorlar ro'yxati" (`patients.back_to_list`, `--ink-3`, hover `--primary`) → `navigate('/patients')`. Additive.
- Container `max-width:1140px`. Two-column grid `minmax(0,1fr) 320px` (rail desktop'da sticky; mobil <X px → 1 ustun). **Eslatma:** sticky rail DS0 shell scroll konteyneriga bog'liq — implementatsiyada tekshiriladi (agar sticky ishlamasa, statik rail qabul qilinadi).

**Chap ustun — 3 sectioned karta** (`Card` primitivi yoki lokal karta div; icon-tile header):
- **Karta 1 "Shaxsiy ma'lumot"** (`patients.form.section_personal`) — primary-soft icon tile (Users) — sub `patients.form.sub_personal`. Field'lar: `fullName`*, `dateOfBirth`, `gender`. Jins: `Select` saqlanadi (funksional parity) — segmented toggle ixtiyoriy (presentational, bir xil enum); birinchi pass `Select` qoladi.
- **Karta 2 "Aloqa"** (`patients.form.section_contact`) — primary-soft icon tile (Phone) — `phone`* (`PhoneInput` — **as-is**, atrofi re-skin), `phoneSecondary` (`PhoneInput` as-is), `address`, `source` (`Select`). 
- **Karta 3 "Qo'shimcha / Sug'urta"** (`patients.form.section_extra`) — **mavjud insurance bloki shu yerga joylashtiriladi** (gap #17 — insurance + source + passport + notes + tags silliq tushmasligi shart): `passport`, `notes` (`Textarea`), `tags` (`TagsInput`), insurance{provider, policyNumber, coverageType, expiryDate, isActive}. Mock'ning danger-tinted "Tibbiy" kartasi illyustrativ — bizning field-set bilan to'ldiriladi (allergy/severity field'lari schema'da yo'q → qo'shilmaydi).

> **Field-set MUHIM:** characterization test "To'liq ism", "Manba", "Sug'urta" ko'rinishini talab qiladi. Re-skin bu uch label'ni (`patients.form.full_name`/`source`/`insurance`) **ushlab turishi shart** — 3-kartali vizual ularni jim tushirib yubormasin.

**O'ng rail (additive, presentational — `form.values`dan):**
- Preview karta (`box-shadow:var(--shadow)`): 64×64 gradient avatar (`fullName` initials yoki "··" fallback, `--on-primary` matn) + name (`fullName` yoki "Yangi bemor" fallback) + phone (mono) + meta chip(lar) (gender/source). Allergy banner **OMIT** (schema'da allergy yo'q).
- Required checklist (`patients.form.checklist_title` "To'ldirilishi shart"): bizning schema'ga mos — `fullName` + `phone` status dot'lari (mock'ning Ism/Familiya/Telefon trio'si EMAS — bizda yagona `fullName`). Dot to'lgan = qiymat mavjud (`form.values`). i18n: `patients.form.checklist_name`, `patients.form.checklist_phone`.
- Action tugmalar (rail): Save (`patients.form.save` yoki `common.save`, primary, `createMut.isPending` disabled) `type="submit"` + Cancel/back (`common.cancel`, secondary → `/patients`). Mavjud bottom `Group` rail'ga ko'chadi (yoki duplikat saqlanmaydi — bittasi).

**Field styling:** label 12px/600/`--ink-2` + required `*` (`--danger`); input 44px/`--surface-2` fill/11px radius/focus `--primary`. `Input`/`Select` primitivlari (locked) — module CSS orqali wrapper styling, primitiv signature o'zgarmaydi. **CLI-179:** `error` prop wiring saqlanadi — xato **matn** sifatida ko'rinadi (faqat ramka emas). Mock'ning `*` + checklist additive UX, text-error o'rnini bosmaydi.

**Characterization (yashil qolishi shart):** "To'liq ism" / "Manba" / "Sug'urta" ko'rinadi; "To'liq ism"ga yozib "Saqlash" bosilsa `createMut.mutate({fullName:'Yangi Bemor'}, …)`; bo'sh ism bilan submit → `role="alert"` (CLI-179 text error), create chaqirilmaydi.

### 4C. BalanceChip (T1 ichida yoki alohida fayl)

Feature-lokal balans chip — `BalanceBadge`ni almashtirmaydi (shared, tegilmaydi). O'ng-tekislangan chip:
- `balance === 0` → "To'langan" muted tone (yangi i18n `patients.balance_paid`).
- `balance > 0` (qarz) → danger tone + `formatCurrency(balance, t)` + `patients.balance_debt`.
- `balance < 0` (kredit) → teal/primary tone + `−formatCurrency(|balance|, t)` + `patients.balance_credit`.
- `formatCurrency(…, t)` (`@/lib/format`) qayta ishlatiladi (hardcoded `so'm`/`Intl` YO'Q). `balance` prop API saqlanadi.

---

## 5. Deferred / omitted (DS12 yoki schema o'zgarishi shart)

| Element | Sabab | Holat |
|---|---|---|
| Bemor `#code`/MRN qatori | DTO'da field yo'q | OMIT (DS12) |
| Allergy alert-dot (list) | DTO'da allergy flag yo'q | OMIT (DS12) |
| "So'nggi tashrif" ustuni | DTO'da `lastVisit` yo'q | OMIT — 4 ustunli grid |
| Doimiy/Qarzdorlar filter pill | Server-paginated, semantik filter = funksional | OMIT (ishlamaydigan pill qo'shilmaydi) |
| Form: telegram / qon guruhi / surunkali kasallik / allergiya + severity | `patientFormSchema`'da yo'q (Qaror #33) | QABUL QILINMAYDI (mock illyustrativ) |
| Preview allergy banner (form rail) | Schema'da allergy yo'q | OMIT |
| Shared `BalanceBadge` / `PhoneInput` re-skin | Binding scope tashqarisi (shared) | TEGILMAYDI (lokal chip / atrof re-skin) |

---

## 6. Test strategiyasi (TDD)

- **Characterization (mavjud testlar yashil qoladi — regressiya guard):**
  - `PatientsListScreen.test.tsx`: Ali Valiyev + VIP + "150" + `aria-busy` + "Arxivlash" archive('p1'). Mock `genderLabel` mavjud → yangi yosh·jins ustun shuni ishlatadi.
  - `PatientNewScreen.test.tsx`: "To'liq ism"/"Manba"/"Sug'urta" ko'rinadi; create wiring; CLI-179 `role="alert"` text error.
- **Yangi (re-skin uchun, agar qo'shilsa):**
  - Filter pill: "Arxiv" pill bosilsa `usePatients` `archived:true` bilan chaqiriladi (behavioral).
  - Empty state: items=0 → `patients.empty_title` + (permission bo'lsa) CTA tugma ko'rinadi.
  - BalanceChip: 0 → "To'langan"; >0 → debt tone; <0 → credit tone (`formatCurrency` qiymati).
  - Form checklist: `fullName` yozilganda mos dot "to'lgan" holatga o'tadi (presentational, `form.values`).
- **Verify (har task):** `turbo test --filter @dental/web` · `typecheck` · `biome` · `build`.
- **Vizual:** dizaynga side-by-side (light + dark). Dark'da gradient avatar matni (`--on-primary`) + balans danger chip (`--text-on-danger`/`--danger`) + `--ink-3` ustun header kontrasti AA tekshiriladi (CLI-80/255 trap).

---

## 7. Xavf-xatarlar

- **Scope leak (eng yuqori):** `BalanceBadge`/`PhoneInput` shared — tegilsa cashier/auth/settings ekranlari vizual o'zgaradi. → Mitigatsiya: lokal `BalanceChip`, PhoneInput as-is (atrof re-skin). Binding scope = faqat `features/patients/`.
- **Field-set jim tushishi (Qaror #33):** 3-kartali vizual insurance/source/passport/notes/tags'ni tushirib yuborishi mumkin. → Karta 3 mavjud field'larni to'liq ushlaydi; characterization "Manba"/"Sug'urta" guard.
- **Dark kontrast (CLI-80/255):** prototip `#fff` hardcode (gradient avatar, "!" badge). → `--on-primary`/`--text-on-danger` ishlatiladi; dark'da har on-tinted matn AA tekshiriladi.
- **CLI-179 regressiya:** re-skin `error` prop'ni uzib qo'yishi mumkin → text error o'rniga faqat ramka. → `error` wiring saqlanadi, `role="alert"` test guard.
- **Sticky rail:** `position:sticky` DS0 shell scroll konteyneriga bog'liq — ishlamasa statik rail qabul (deviation lokalizatsiya qilinadi).
- **Locked primitiv:** `Avatar` dumaloq → gradient tile lokal span. `StateView`/`Card`/`Input`/`Select` signature o'zgarmaydi (faqat module CSS atrofi).
