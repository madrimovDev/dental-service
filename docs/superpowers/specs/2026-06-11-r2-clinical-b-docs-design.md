# R2 — Klinik B (hujjatlar: reseptlar / lab buyurtmalar / rozilik): Design Spec

- **Sana:** 2026-06-11
- **Epik:** R2 / Linear CLI-52 (Klinik hujjatlar), Milestone M5
- **Bog'liq:** [RFC-0010](../../rfcs/0010-frontend-feature-architecture.md), [RFC-0009](../../rfcs/0009-backend-module-architecture.md), [RFC-0003](../../rfcs/0003-design-system-theming.md), R2-A (`features/patients/` etalon), R2-B (`features/appointments/`)
- **Status:** Draft (orchestrator review kutilmoqda)
- **Branch:** `feat/r2-clinical` (A/C guruhlar bilan birga; header — implementatsiya qaysi branch'ga tushishini hujjatlaydi)

## Maqsad

R2 ning klinik-hujjatlar guruhi (B): mavjud uchta M5 tab'ni — **Reseptlar** (`PrescriptionsTab`), **Lab buyurtmalar** (`LabOrdersTab`), **Rozilik / konsent** (`ConsentTab`) — `apps/web/src/components/clinical/` dan RFC-0010 `features/clinical/` ga ko'chiradi + teal dizaynga re-skin qiladi. Komponentlar hozir `api.*` ni bevosita chaqiradi va `useState` bilan form holatini boshqaradi; bu RFC-0010 qatlamlarga (keys/types/mappers/api hooks/schema/components) ajratiladi. Mavjud funksiya (CRUD, status o'tishlari, shablondan to'ldirish) **yo'qotilmaydi**.

## Qamrov

**Ichida:** `features/clinical/` (B-guruh qatlamlari + komponentlar), uchta tab re-skin (R0 primitivlar + teal token), sof mapperlar (status→rang, sana, emoji→lucide), Zod form sxemalar, hardcoded uz matnlarini `t()` ga ko'chirish, i18n uz+ru kalitlari saqlash/kengaytirish, `PatientCard.tsx` registry yangilash (yangi import yo'llari).

**Tashqarida:**
- **Imzo (signature) tasviri / PDF eksport** → M6 (konsent jadvali o'zi shunday belgilaydi: `consent.ts:74` — "signature image M6+ da qo'shiladi"). Yangi infra kerak.
- **Resept / konsent chop etish (print)** → M6 (PDF generatsiya infra). R2 qamrovidan tashqari.
- **Lab buyurtma 1C / xarajat hisobotlari** → R3+ (billing).
- **Backend o'zgarishi YO'Q** (quyida har sub-feature uchun asoslangan).

## Qarorlar (brainstorm)

| # | Qaror | Asos |
|---|---|---|
| 1 | **Re-skin + RFC-0010 ko'chirish**, backend tegilmaydi | Uchta modul backend'i R2 qamrovi uchun to'liq |
| 2 | **Bitta `features/clinical/` feature** (A/B/C umumiy), B-guruh fayllari shu ichida | A va C guruhlar bilan kelishilgan; bitta klinik feature mantiqiy |
| 3 | **Resept: create+list saqlanadi**; edit/delete (backend bor) — ixtiyoriy/tashqarida | Gold-plate qilinmaydi; mavjud UI funksiyasi yo'qotilmaydi |
| 4 | **STATUS_COLORS / sana / emoji** → sof mapper/types (MAJBURIY) | RFC-0010: mapper biznes-prezentatsiyani ko'taradi, komponent emas |

## 1. Backend gaplari (RFC-0009) — har sub-feature **YO'Q**, asos bilan

Har bir taklif-gap tekshirildi va asoslandi (ixtiro qilinmadi):

### 1.1 Reseptlar — **backend gap YO'Q**
- `prescriptions.routes.ts` to'liq CRUD: `GET /` (list), `POST /` (create), `GET /:id`, `PATCH /:id` (update), `DELETE /:id`. Schema (`createPrescriptionSchema`) item array + diagnoz + notes.
- **Print/template gap:** chop etish — M6 (PDF infra); shablon konsepti resept'da yo'q va re-skin talab qilmaydi. → **YO'Q.**
- **Asimmetriya eslatmasi:** backend `update`+`delete` ochiq (`routes:37-49`), frontend faqat create+list. Re-skin create+list ni saqlaydi (qaror #3). Agar keyin delete tugmasi qo'shilsa — yangi Mantine confirm modal o'sha yerda (hozir qamrovda emas).

### 1.2 Lab buyurtmalar — **backend gap YO'Q**
- `lab-orders.routes.ts`: `GET /` (patientId+status filtr), `POST /`, `GET /:id`, `PATCH /:id`.
- **Status tracking gap:** allaqachon to'liq — 6-holatli enum (`draft/sent/in_progress/ready/delivered/cancelled`) + `update` da avto-sana (`lab-orders.service.ts:70-71`: `sent`→`sentDate`, `delivered`→`deliveredDate`). → **YO'Q.**

### 1.3 Rozilik / konsent — **backend gap YO'Q**
- `consent.routes.ts`: shablon CRUD (`/templates` GET/POST/GET:id/PATCH:id) + imzolangan forma (`/forms` GET/POST). `signForm` snapshot pattern (`bodyText` imzo paytidagi nusxa).
- **Signature capture / PDF gap:** konsent jadvalining o'zi M6 ga kechiktiradi (`consent.ts:74`). Hozir `patientSignatureName` (matn) yetarli. Constraint: PDF/fiscal R2 ga tortilmaydi. → **YO'Q.**

> Xulosa: B-guruh **sof frontend re-skin** — `packages/api-client` mavjud endpointlari yetarli (CLI-92 zod-openapi migratsiyasidan keyin hook nomi o'zgarishi mumkin, lekin yangi backend yo'q).

## 2. `features/clinical/` (kanonik RFC-0010 — B-guruh ulushi)

```
apps/web/src/features/clinical/
├── index.ts                      # umumiy (A/B/C eksport — B: tab'larni qo'shadi)
├── clinical.keys.ts              # B: prescriptions(patientId) / labOrders(patientId,status?) / consentForms(patientId) / consentTemplates
├── clinical.types.ts             # B: PrescriptionVM, LabOrderVM, ConsentFormVM, ConsentTemplateVM, LAB_STATUS_META
├── clinical.mappers.ts           # B (sof): toPrescriptionVM / toLabOrderVM (status→rang+label) / toConsentFormVM (sana, til, qisqartirish)
├── clinical.api.ts               # B hooks: usePrescriptions/useCreatePrescription · useLabOrders/useCreateLabOrder/useUpdateLabOrderStatus · useConsentForms/useConsentTemplates/useSignConsent/useCreateConsentTemplate
├── clinical.schema.ts            # B Zod form: prescriptionForm (item array) · labOrderForm · consentSignForm · consentTemplateForm
└── components/
    ├── PrescriptionsTab.tsx       # re-skin (create+list)
    ├── LabOrdersTab.tsx           # re-skin (create+list+status Select)
    └── ConsentTab.tsx             # re-skin (sign + template create)
```

> **Eslatma (A/C bilan umumiy):** `index.ts`, `clinical.keys.ts`, `clinical.types.ts`, `clinical.mappers.ts`, `clinical.api.ts`, `clinical.schema.ts` — A (odontogram/davolash rejasi) va C (vizit yozuvi/rasm) guruhlar bilan **birga tahrirlanadi**. Build planda kontensiya (§7).

**Qatlam:** `components → clinical.api.ts (hooks) → api-client`. Komponent `api.*` ni bevosita chaqirmaydi (hozirgi `import { api }` olib tashlanadi). `clinical.mappers.ts` — sof funksiya (izolyatsiyada test).

## 3. Re-skin (mavjud funksiya yo'qotilmaydi)

### 3.1 Umumiy (uchala tab)
- **R0 primitivlar:** `Button`, `Card`, `Badge`/`StatusPill`, `Select`, `Input`/`Textarea`, `NumberInput`, `Modal`, `Mono` (sana/raqam), teal token.
- **Emoji → lucide:** `💊` (resept) → `IconPill`, `🦷` (lab) → `IconDental`/`IconTooth`, `📝` (konsent) → `IconFileText`/`IconWriting`. Hozirgi sarlavhalardagi emoji'lar olib tashlanadi.
- **Sof mapper:** DB row → VM; sana formatlash, status→rang/label, body qisqartirish — komponentdan mapperga ko'chadi.
- **Permission gating saqlanadi:** `prescription.view/manage`, `lab_order.view/manage`, `consent.view/manage`.

### 3.2 Hardcoded uz matnlari → `t()` (constraint #1 — hozirgi buzilishlar)
Re-skin paytida tuzatiladi:
- `PrescriptionsTab.tsx:115` — `` `, ${it.durationDays} kun` `` → `t('prescription.duration_days_suffix', { days })` (yoki VM ichida formatlash).
- `LabOrdersTab.tsx:186` — `` ` (tish: ${...})` `` → `t('lab_order.teeth_inline', { teeth })`.
- Boshqa barcha matn allaqachon `t()` orqali (tekshirildi).

### 3.3 `confirm()` / `prompt()` — **N/A (tekshirildi)**
Uchala komponent ham `confirm()`/`prompt()` ishlatmaydi; hammasi Mantine `Modal` (constraint #2 qondirilgan). Yangi Modal faqat ixtiyoriy resept-delete qo'shilsa kerak bo'ladi (hozir qamrovda emas).

### 3.4 Mapper substansiyasi (RFC-0010 mapperlar MAJBURIY)
- **Lab:** `STATUS_COLORS` (`LabOrdersTab.tsx:48-55`) + `STATUS_OPTIONS` + `TYPE_OPTIONS` → `clinical.types.ts` (`LAB_STATUS_META`, `LAB_TYPE_OPTIONS`). `toLabOrderVM(row)` → `{ ..., statusColor, statusLabelKey, costText }`. Tish raqamlarini inline matn — VM da (`t()` bilan komponent yoki mapper'ga param sifatida).
- **Resept:** `toPrescriptionVM(row)` → `{ id, issuedDateText, diagnosis, items, notes }`; item suffix (`kun`) i18n.
- **Konsent:** `toConsentFormVM(row)` → `{ title, typeKey, languageUpper, signedAtText, signerName, bodyPreview (240) }`.

## 4. Form holati — `useState` → schema + hooks

Hozirgi tab'lar form holatini `useState` da ushlaydi (item array drafts ham). Re-skin:
- **`@mantine/form` + zod-resolver** (`clinical.schema.ts`) — item array `form.insertListItem`/`removeListItem` bilan (hozirgi qo'lda `setItems([...])` o'rniga).
- **Manual binding** (R2-A/B saboq: `getInputProps` o'rniga `value` + `onChange`) kerak bo'lsa R0 inputlar uchun.
- Mutation hooklar `clinical.api.ts` da; `onSuccess` da `queryClient.invalidateQueries({ queryKey: clinicalKeys.* })` (hozirgi qo'lda `qc.invalidateQueries(['prescriptions', patientId])` o'rniga).
- **Konsent shablondan to'ldirish** (`applyTemplate`, til tanlash `bodyUz/bodyRu`) — saqlanadi, lekin til logikasi mapper/hook yordamchisiga (sof) ko'chiriladi.

## 5. PatientCard registry (A/C bilan umumiy — kontensiya)

`apps/web/src/features/patients/components/PatientCard.tsx`:
- **lazy importlar (27-37-qatorlar):** `@/components/clinical/PrescriptionsTab` → `@/features/clinical/components/PrescriptionsTab` (lab + konsent ham). A/C guruhlar boshqa import qatorlarini o'zgartiradi — **bir xil blok**.
- **render (104-107):** `{active === 'rx' && ...}`, `{active === 'lab' && ...}`, `{active === 'cons' && ...}` — yo'l import o'zgargani uchun komponent o'zi o'zgarmaydi, faqat import manzili.
- Eski `apps/web/src/components/clinical/*.tsx` (3 fayl) o'chiriladi (ko'chirilgandan keyin).

## 6. i18n + R0 primitiv

- `prescription.*`, `lab_order.*`, `consent.*` namespace'lari **saqlanadi** + yangi kalitlar: `prescription.duration_days_suffix`, `lab_order.teeth_inline` → **uz + ru**.
- Yangi matn (bo'sh-holat, helper) bo'lsa — ikkala fayl (`packages/i18n/uz.json`, `ru.json`).
- R0 primitivlar (§3.1). i18n fayllari A/C bilan umumiy (kontensiya — §7).

## 7. Shared-fayl kontensiya (build plan uchun)

B-guruh A va C bilan quyidagilarni **umumiy tahrirlaydi** — serialize yoki koordinatsiya kerak:
1. `features/clinical/` skelet fayllari: `index.ts`, `clinical.keys.ts`, `clinical.types.ts`, `clinical.mappers.ts`, `clinical.api.ts`, `clinical.schema.ts` — A/B/C har biri o'z bo'limini qo'shadi.
2. `PatientCard.tsx` lazy-import registry (27-37) + render (99-108) — A/B/C bir xil blokni tahrirlaydi.
3. `packages/i18n/uz.json` + `ru.json` — har guruh o'z namespace'ini qo'shadi (merge konflikti ehtimoli).

**Tavsiya:** skelet fayllarni avval bitta guruh yaratadi (yoki bo'lim-marker bilan), keyin A/B/C parallel qatlam qo'shadi; PatientCard registry — bitta merge nuqtasi.

## 8. Testlar

- **`clinical.mappers.test.ts`** (B ulushi, eng muhim): `toLabOrderVM` (status→rang/label har 6 holat, costText), `toConsentFormVM` (240 qisqartirish, til upper, sana), `toPrescriptionVM` (item formatlash).
- **`clinical.keys.test.ts`**: B factory (prescriptions/labOrders/consentForms/consentTemplates).
- **Komponent behavioral:** `PrescriptionsTab` (item qo'shish → create chaqiruvi), `LabOrdersTab` (status Select → updateStatus chaqiruvi), `ConsentTab` (shablon tanlash → body to'ladi → sign chaqiruvi).
- **Backend testi YO'Q** (backend o'zgarmaydi).

## 9. Verifikatsiya

- `turbo test --filter @dental/web` (exit 0) + `bun --filter @dental/web build` + typecheck.
- Lint: hardcoded uz matn qolmaganini tekshirish (grep `kun\`` / `tish:`); `import { api }` to'g'ridan komponentda yo'qligini tekshirish.
- Dev fidelity (inson): uchala tab teal, emoji yo'q (lucide), resept create+list, lab create+list+status o'zgartirish (avto-sana), konsent shablon→imzo + til; permission gating; PatientCard tab'lari yangi yo'ldan ochiladi.

## 10. Qurilish tartibi (plan'da)

1. **Skelet (A/C bilan koordinatsiya):** `clinical.keys.ts` → `clinical.types.ts` (LAB_STATUS_META, opsionlar) → `clinical.mappers.ts` (+test) → `clinical.api.ts` (B hooks).
2. **PrescriptionsTab re-skin** (eng sodda: create+list, mapper, schema) + behavioral test.
3. **LabOrdersTab re-skin** (status Select + mapper rang) + test.
4. **ConsentTab re-skin** (2 modal: sign + template, shablon→til logika) + test.
5. **PatientCard registry** import yo'llari + eski `components/clinical/*` o'chirish.
6. **i18n** (suffix/inline kalitlar uz+ru).
7. Verifikatsiya (test + build + typecheck + dev fidelity).

## 11. Ochiq mayda nuqtalar (plan'da)

- Item array — `@mantine/form` list (`insertListItem`) vs hozirgi `useState` array: form list afzal (validatsiya integratsiya), lekin R0 input manual binding bilan mosligini plan'da aniqlash.
- `LAB_STATUS_META` (rang+labelKey) — `clinical.types.ts` da konstanta vs mapper ichida: konstanta afzal (test va re-use).
- Resept edit/delete UI: hozir tashqarida; agar qo'shilsa — delete uchun Mantine confirm modal.
- Konsent til-tanlash helper (`bodyUz/bodyRu` → imzo body) — sof funksiya sifatida mapper/yordamchiga (komponentdan tashqari).
