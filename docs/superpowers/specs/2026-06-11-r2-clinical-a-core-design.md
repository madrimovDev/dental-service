# R2 — Klinik yadro (odontogram + davolash rejasi + vizit yozuvi): Design Spec

- **Sana:** 2026-06-11
- **Epik:** R2 / Linear CLI-52 (Klinik yadro re-skin), Milestone M5
- **Bog'liq:** [RFC-0010](../../rfcs/0010-frontend-feature-architecture.md), [RFC-0009](../../rfcs/0009-backend-module-architecture.md), [RFC-0003](../../rfcs/0003-design-system-theming.md), R2-A (`features/patients/` etalon), R2-B (`features/appointments/` etalon), R2-Queue (`features/queue/`)
- **Status:** Draft (orchestrator review kutilmoqda)
- **Branch:** `feat/r2-clinical` (main'dan)
- **Billing chegarasi:** [R2 Billing Foundation](./2026-06-11-r2-billing-foundation-design.md) — to'lov UI alohida unit; bu spec **payment-agnostic** qoladi.

## Maqsad

R2 ning klinik yadro guruhi: bemor kartasidagi uchta **mavjud, ishlaydigan** klinik tab (M4/M5 dan) RFC-0010 `features/clinical/` ga ko'chiriladi + teal dizaynga re-skin qilinadi. Funksiyalar **yo'qotilmaydi**:

- **Odontogram (tish kartasi)** — FDI 32/20 tish, holat tanlash, snapshot saqlash (`ToothChartTab` + `Odontogram`).
- **Davolash rejasi** — plan + stage (status o'tishlari, xarajat ko'rinishi) (`TreatmentPlansTab`).
- **Vizit yozuvi (SOAP)** — subjective/objective/assessment(ICD-10)/plan + erkin izoh (`VisitNotesTab`).

Eski joy: `apps/web/src/components/clinical/*` → to'g'ridan `api.clinical.*` chaqiradi, query-key inline, mapping komponent ichida (useEffect/useMemo). Yangi joy: `features/clinical/` (RFC-0010 qatlamlar) + R0 primitivlar (teal token).

## Qamrov

**Ichida:**
- `features/clinical/` (RFC-0010 qatlamlar: keys/types/mappers(sof)/api(hooks)/schema/components).
- Uchta tabning teal re-skini (R0 primitivlar, lucide ikonkalar, emoji 🦷/📅 olib tashlanadi).
- Inline mapping mantiqini sof `clinical.mappers.ts` ga ko'chirish (tooth states → Map, status → rang, diagnosisId → label).
- Vizit yozuvini **mavjud** `appointmentId` link'iga ulash (UI wiring — backend allaqachon qo'llab-quvvatlaydi).
- i18n: mavjud `tooth_chart.*` / `treatment_plan.*` / `visit_note.*` namespace'lar saqlanadi + kerakli yangi kalitlar (uz+ru).
- `PatientCard.tsx` registry (lazy-import + render switch) yangi `features/clinical/` yo'liga yo'naltiriladi.

**Tashqarida:**
- **To'lov / paid / balans UI** — YO'Q (Constraint #1). Plan faqat stage/xarajat/status ko'rsatadi; per-stage paid status → R3.
- Reseptlar / konsent / rasm / lab orders (boshqa R2 guruh — `clinical/` ning qolgan tablari).
- Tooth surface (M/D/B/L/O/I) per-yuza tahrirlash — hozir `whole` saqlanadi, kengaytirish → keyin.
- Odontogram SVG redizayn / drag-tanlash → keyin (R5 sayqal); hozir mavjud Box-grid teal token bilan re-skin qilinadi.
- Davolash rejasi → appointment/queue avtomatik bog'lash → keyin.

## Qarorlar (brainstorm)

| # | Qaror | Asos |
|---|---|---|
| 1 | **Re-skin + RFC-0010 ko'chirish** (funksiya saqlanadi) | R2 doirasi (re-skin, qayta qurish emas) |
| 2 | **Backend gap YO'Q** — uchala sub-feature backend to'liq | Quyida §1 file:line dalil bilan; Constraint #4 (gap o'ylab topilmaydi) |
| 3 | **Plan payment-agnostic** — to'lov UI qo'shilmaydi, faqat xarajat/status | Constraint #1; billing alohida unit; per-stage paid → R3 |
| 4 | **Vizit yozuvi → appointmentId UI wiring** — mavjud (lekin ishlatilmagan) link'ni ulash | Backend tayyor; faqat frontend wiring |
| 5 | **Mappers sof va mazmunli** — tooth-states→Map, status→rang, dx→label komponentdan chiqariladi | RFC-0010; testlanadigan sof funksiya |
| 6 | **diagnoses — read-only katalog dependency** (`useDiagnoses` hook), 4-chi re-skin nishoni emas | Vizit yozuvi assessment uchun lookup |

## 1. Backend gaplari (RFC-0009)

> ⚠️ Brief ikkita ehtimoliy gapni eslatdi (visit-notes `appointmentId` link, tooth-chart versioning). **Ikkalasi ham allaqachon kodda mavjud.** Constraint #4 bo'yicha o'ylab topilgan gap qo'shilmaydi — dalil bilan "gap YO'Q".

### 1.1 Vizit yozuvi — **backend gap YO'Q**
- `appointmentId` FK: `packages/db-schema/src/tables/visit-notes.ts:30-32` (`onDelete: 'set null'`).
- Zod: `clinical.schema.ts:44` — `appointmentId: z.uuid().optional()`.
- Service: `clinical.service.ts:195` — `appointmentId: input.appointmentId ?? null` saqlanadi (+ `updateVisitNote` 224-qator).
- Bemor bo'yicha yozuvni tanlash uchun kerakli appointments ro'yxati: `api.appointments.list({ patientId })` **allaqachon mavjud** (`packages/api-client/src/endpoints.ts:253` + backend `appointments.service.ts:44` `eq(appointments.patientId, ...)`).
- **Xulosa:** faqat **frontend wiring** — create-note formaga appointment Select qo'shish (mavjud `patientId` filtr bilan). Backend tegilmaydi.

### 1.2 Tooth chart (odontogram) — **backend gap YO'Q**
- Snapshot/versioning **dizaynning o'zi**: `tooth-charts.ts` izoh "tarix saqlanadi"; har save yangi `toothCharts` row + `toothStates`.
- `getLatestToothChart` (`clinical.service.ts:261`) + `listToothCharts` (history desc, 252) ikkalasi ham mavjud, api-client'da ham (`getLatestToothChart`/`listToothCharts`).
- **Xulosa:** versioning to'liq. Re-skin'da hozir faqat `latest` ishlatiladi (history viewer → keyin, R5).

### 1.3 Davolash rejasi — **backend gap YO'Q**
- To'liq CRUD + stage status PATCH (`clinical.routes.ts:40-72`, `clinical.service.ts:64-164`).
- Payment-agnostic: jadval/service'da paid/balance maydoni yo'q (`treatment-plans.ts`); `totalCost`/per-stage `cost` faqat smeta. `consentSignedAt` — konsent, billing emas (UI'da o'qilmaydi).
- **Xulosa:** backend tayyor. To'lov maydoni qo'shilmaydi (Constraint #1).

### 1.4 Umumiy xulosa
**Uchala sub-feature uchun backend gap YO'Q.** Bu R2 guruh — sof frontend re-skin + RFC-0010 ko'chirish. Migratsiya yo'q, schema/service/routes/api-client tegilmaydi.

## 2. `features/clinical/` (kanonik RFC-0010)

```
apps/web/src/features/clinical/
├── index.ts
├── clinical.keys.ts        # clinicalKeys.toothChartLatest(patientId) / plans(patientId)
│                           #   / planDetail(planId) / visitNotes(patientId) / diagnoses / appointmentsForPatient(patientId)
├── clinical.types.ts       # ToothCellVM, ToothStateOption, PlanCardVM, StageRowVM, VisitNoteVM, DiagnosisOptionVM
├── clinical.mappers.ts     # REAL (sof):
│                           #   toToothStateMap(states[]) -> Map<toothNumber, ToothState>
│                           #   toToothCellsVM(map, quadrants) -> ToothCellVM[]  (rang/border token map)
│                           #   draftStatesToCreateInput(map, isPrimary, notes)  (sof transform)
│                           #   toPlanCardVM(plan) / toStageRowVM(stage)  (status -> StatusPill tone)
│                           #   toVisitNoteVM(note, diagnosisMap, lang)  (dx id -> label, SOAP bloklar)
│                           #   toDiagnosisOptions(diagnoses[], lang)
├── clinical.api.ts         # hooks: useLatestToothChart / useCreateToothChart
│                           #        useTreatmentPlans / usePlanDetail / useCreatePlan / useUpdateStage
│                           #        useVisitNotes / useCreateVisitNote
│                           #        useDiagnoses (staleTime 1h) / usePatientAppointments(patientId)
├── clinical.schema.ts      # Zod form: toothChartSnapshotSchema, treatmentPlanFormSchema (+ stageSchema), visitNoteFormSchema
└── components/
    ├── odontogram/
    │   ├── OdontogramTab.tsx     # ToothChartTab re-skin (snapshot draft + save)
    │   ├── Odontogram.tsx        # FDI grid (teal token, tish hujayralari)
    │   └── ToothCell.tsx         # bitta tish (StatusPill/rang, selected ring teal)
    ├── treatment-plans/
    │   ├── TreatmentPlansTab.tsx # plan ro'yxati + "Reja qo'shish"
    │   ├── PlanCard.tsx          # plan sarlavha + status pill + smeta (xarajat/vizit) + stage'lar
    │   ├── StageRow.tsx          # stage qatori (tish raqamlari, xarajat, status Select)
    │   └── PlanFormModal.tsx     # plan + dinamik stage forma (Mantine Modal)
    └── visit-notes/
        ├── VisitNotesTab.tsx     # SOAP yozuvlari ro'yxati + "Yozuv qo'shish"
        ├── VisitNoteCard.tsx     # bitta yozuv (sana Mono, S/O/A/P bloklar, dx Tag'lar)
        └── VisitNoteFormModal.tsx# SOAP forma + diagnoz MultiSelect + appointment Select
```

**Qatlam:** `components → clinical.api.ts (hooks) → api-client`. Komponent `api.clinical.*` ni bevosita chaqirmaydi (hozirgi anti-pattern). `clinical.mappers.ts` — sof funksiya; biznes mantiq (rang map, dx-label, tooth-Map) komponentdan chiqariladi.

## 3. Re-skin tafsiloti (funksiya yo'qotilmaydi)

### 3.1 Odontogram (`OdontogramTab` + `Odontogram` + `ToothCell`)
- **Saqlanadi:** FDI 4 kvadrant (permanent 32 / primary 20), tish tanlash, holat Select, snapshot save (`useCreateToothChart`), `isPrimaryDentition` Switch (almashganda draft tozalash), legend, snapshot notes.
- **Teal:** hardcoded MUI-ko'k `#228be6` selected ring → teal token; tish rang map (`STATE_COLORS`/`STATE_BORDER`) `clinical.mappers.ts` ga ko'chiriladi (sof). Box-grid Mantine `Card`/`Paper` o'rniga R0 `Card`. 🦷 emoji → lucide ikonka yoki Mono raqam.
- **Mapping:** hozir `ToothChartTab` `useEffect` (states→Map) + `useMemo` (Map→statesArray) — `toToothStateMap` / `draftStatesToCreateInput` mapper'ga.

### 3.2 Davolash rejasi (`TreatmentPlansTab` + `PlanCard` + `StageRow` + `PlanFormModal`)
- **Saqlanadi:** plan ro'yxati, lazy detail (`usePlanDetail`), stage status Select o'tishlari, dinamik stage forma (qo'shish/o'chirish), tish raqamlari CSV → number[] parse (mapper'ga ko'chiriladi), smeta (xarajat/vizit ko'rinishi).
- **Payment-agnostic (Constraint #1):** `totalCost`, per-stage `cost`, `totalVisits` — ruxsat etilgan (smeta). **Qo'shilmaydi:** paid/to'langan/qoldiq/balans badge yoki ustun. Per-stage paid status → R3. `consentSignedAt` o'qilmaydi.
- **Teal:** `planStatusColors`/`stageStatusColors` (hozir inline Mantine ranglar) → mapper `StatusPill` tone'lariga. R0 `Card`, `StatusPill`, `Button`, `Select`, `Mono` (xarajat). `IconPlus`/`IconTrash` lucide.

### 3.3 Vizit yozuvi (`VisitNotesTab` + `VisitNoteCard` + `VisitNoteFormModal`)
- **Saqlanadi:** SOAP ro'yxati (sana desc), diagnoz MultiSelect (ICD-10, searchable, `useDiagnoses` 1h stale), S/O/A/P bloklar, erkin izoh, badge dx labellar.
- **Yangi (UI wiring):** formaga **appointment Select** (`usePatientAppointments(patientId)` — mavjud `patientId` filtr) → `appointmentId` create body'da yuboriladi (backend allaqachon saqlaydi). Ixtiyoriy maydon.
- **Teal:** 📅 emoji → lucide ikonka + `Mono` sana. SOAP rang aksentlari (blue/cyan/orange/green) → teal-mos token/`Tag`. R0 `Card`, `Tag` (dx), `Button`.

## 4. i18n

- Mavjud namespace'lar **saqlanadi**: `tooth_chart.*` (states, kvadrantlar, primary_dentition, save_snapshot, ...), `treatment_plan.*` (status_*, stage_status_*, cost, stages, ...), `visit_note.*` (subjective/objective/assessment/plan/free_notes, ...).
- **Yangi kalitlar (uz+ru):** vizit yozuvi appointment Select (`visit_note.appointment`, `visit_note.no_appointment`/"Yozuvsiz"), kerak bo'lsa bo'sh-holat / yangi label'lar. Emoji olib tashlanganda matn label'lar (`tooth_chart.selected_tooth` 🦷siz).
- Diagnoz label tili: `i18n.language === 'ru' ? nameRu : nameUz` — mapper'ga (`toDiagnosisOptions(diagnoses, lang)`), komponentda emas.

## 5. R0 primitivlar

`Card`, `Button`, `IconButton`, `Select`, `Input`, `StatusPill`, `Tag`, `Mono`, `Avatar`, `Tabs` (mavjud `@dental/ui`). Mantine: `Modal`, `Textarea`, `NumberInput`, `MultiSelect`, `Switch`, `Tooltip` (R0'da yo'q — Mantine'dan, teal token bilan). lucide ikonkalar (`@tabler` o'rnida loyiha lucide standartiga moslash — queue spec presedenti).

## 6. confirm() → modal (Constraint #3)

**N/A — bu uchta tabda `confirm()` ishlatilmaydi.** Stage o'chirish (`PlanFormModal`) — lokal draft state filtri (server emas), tasdiq talab qilmaydi. Yangi destructive amal qo'shilmaydi; agar kelajakda kerak bo'lsa — Mantine modal (R2 pattern).

## 7. Testlar

- **`clinical.mappers.test.ts`** (eng muhim, sof):
  - `toToothStateMap` (states[] `whole` → Map; per-yuza fallback `Odontogram` mantiqi).
  - `draftStatesToCreateInput` (Map → CreateToothChartInput shakli).
  - `toPlanCardVM` / `toStageRowVM` (status → StatusPill tone; xarajat format).
  - `toVisitNoteVM` (dx id → label, dx topilmasa fallback id; SOAP bo'sh bloklar tashlab ketiladi).
  - `toDiagnosisOptions` (lang uz/ru tanlash; `code — name` format).
  - tish raqamlari CSV parse (`"11, 12, 36"` → `[11,12,36]`, NaN tashlab).
- **`clinical.keys.test.ts`**: factory.
- **`VisitNoteFormModal`** behavioral: diagnoz tanlash + appointment tanlash → `createVisitNote` (`appointmentId` bilan) chaqiruvi; appointmentsiz → `appointmentId` undefined.
- **`OdontogramTab`** behavioral: tish tanlash → holat o'zgartirish → save → `createToothChart` to'g'ri states bilan; primary switch draft tozalaydi.
- **`TreatmentPlansTab`/`PlanCard`** smoke: plan ro'yxati render, stage status Select → `updateStage`; **paid/balans elementi yo'qligini** tekshirish (regression guard, Constraint #1).
- **Backend:** o'zgarmaydi → yangi backend test yo'q (mavjud clinical testlar saqlanadi).

## 8. Verifikatsiya

- `turbo test --filter @dental/web` (exit 0) + build + typecheck. Backend tegilmagani uchun `@dental/api` test o'zgarishsiz yashil.
- Dev fidelity (inson):
  - Odontogram teal: tish tanlash, holat o'rnatish, snapshot save → latest yangilanadi; primary/permanent toggle.
  - Davolash rejasi teal: plan yaratish (stage'lar), stage status o'tish; smeta ko'rinadi; **to'lov/paid UI yo'q**.
  - Vizit yozuvi teal: SOAP forma + diagnoz; appointment tanlab yozuv yaratish → keyin yozuvda appointment ko'rinadi (yoki backend'da `appointmentId` saqlanadi).
  - Permission gating saqlanadi (`medical_record.view`/`edit`).

## Qurilish tartibi (plan'da)

1. **`features/clinical/` skelet:** keys → types → mappers (+ `clinical.mappers.test.ts`) → api hooks → schema.
2. **Odontogram:** `odontogram/` (Odontogram + ToothCell + OdontogramTab) re-skin + behavioral test.
3. **Davolash rejasi:** `treatment-plans/` (PlanCard + StageRow + PlanFormModal + Tab) re-skin + smoke/regression test (payment-agnostic guard).
4. **Vizit yozuvi:** `visit-notes/` (VisitNoteCard + VisitNoteFormModal + Tab) re-skin + appointment Select wiring + behavioral test.
5. **i18n:** yangi kalitlar uz+ru (appointment Select, emoji-siz label'lar). Mavjud kalitlar saqlanadi.
6. **Registry swap (CONTENTION — yagona kech qadam):** `PatientCard.tsx` lazy-import'lar (16-26) + render switch (101-103) `features/clinical/` yo'liga; eski `components/clinical/{ToothChartTab,TreatmentPlansTab,VisitNotesTab,Odontogram}.tsx` o'chiriladi. ⚠️ `PatientCard.tsx` + i18n fayllari R2 boshqa klinik guruhlar (rx/consent/img/lab) bilan **umumiy** — registry swap'ni bitta atomik qadamda qiling, parallel guruhlar bilan merge konflikt nuqtasi.
7. Verifikatsiya (test + build + typecheck + dev fidelity).

## Ochiq mayda nuqtalar (plan'da)

- **Tooth rang token:** hozir hardcoded MUI palitra (`#e8f5e9` ...). Teal redizaynda klinik holat ranglari saqlanishi mumkin (rang-kodlash semantik), faqat selected ring + chrome teal bo'ladi. Plan'da: rang map'ni o'zgartirmaslik (klinik aniqlik) yoki teal-tonal palitra — inson tasdiqi.
- **Odontogram primitiv joyi:** `ToothCell` — feature-local (klinikaga xos), `packages/ui` ga ko'tarilmaydi. Tasdiqlangan.
- **Appointment Select bo'sh holat:** bemorda yozuv bo'lmasa — "Yozuv yo'q" disabled option; `appointmentId` ixtiyoriy qoladi.
- **Diagnoz lookup hajmi:** `useDiagnoses` butun ICD-10 katalogni oladi (1h stale) — hozirgi xulq saqlanadi; pagination/server-search → keyin.
- **Shared i18n fayl:** R2 klinik guruhlar bir vaqtda yangi kalit qo'shsa — `uz.json`/`ru.json` merge konflikt; orchestrator ketma-ketligida hisobga olinadi.
