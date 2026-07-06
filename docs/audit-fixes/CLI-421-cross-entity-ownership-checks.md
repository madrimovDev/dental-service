# CLI-421 — Cross-entity ownership tekshiruvlari yo'q (yozuv boshqa bemorga havola qila oladi; FK cross-tenant ID qabul qiladi)

> Audit: MEDIUM M8. Bemor A visit-note'i B planини "complete" qiladi (recall B'ga ketadi); FK RLS'ni chetlab cross-tenant UUID insert qiladi.

## Bog'liq ticketlar

- **CLI-422** — patient-images upload validatsiyasi. Ikkalasi ham upload yo'lига (`patient-images.service.ts:74-111`)
  tegadi. **Yagona tartib:** shakl/schema-validatsiya (422) → **ownership (421)** → storage write → insert.
- **CLI-414/415** — visit-note stageId oqimi; ownership tekshiruvi CLI-415 plan-guard'дан **oldin**
  ishlaydi (avval "bu stage shu bemornikimi", so'ng "plan statusи ruxsat beradimi").

## 1. Muammo va ildiz sabab

Tenant-scoped jadvallar RLS bilan himoyalangan, lekin **FK constraint RLS'ни chetlаб o'tadi**:
`treatment_stages.id`, `visit_notes.id`, `appointments.id`, `patients.id` ga FK yozganда Postgres
faqat *satr mavjudligини* tekshiradi — RLS policy INSERT vaqtidаги FK lookup'ga qo'llanмаydi.
Shu sabab **cross-tenant UUID** ham qabul qilinadi va **bir tenant ichида bошqa bemorга** havola qilинади:

- `visit-notes.service.ts:52-54` (create): `stageId` berilса `completeStageForVisit` chaqiriladi —
  stage `input.patientId`ga tegishli ekани **tekshirilмаydi**. Bemor A visit-note'i B bemor bosqichини
  yopadi → recall B'ga ketadi. `89-91` (update) ham xuddi shunday.
- `patient-images.service.ts:74-111` (upload): `patientId`/`visitNoteId` mavjudлиги/egалиги tekshirilmaydi.
- `tooth-charts.service.ts:32-47` (create): `patientId`/`visitNoteId` tekshirilмайди.
- `prescriptions.service.ts:41-58` (create): `patientId`/`doctorId`/`visitNoteId` tekshirilмайди.

**Mexanizm tasdig'i:** har entity `getDb(c)` (RLS tx-bound) orqали `SELECT`. Cross-tenant UUID
`getDb(c).select().where(eq(id, ...))` — RLS policy `tenant_id = current_setting(...)` bilan filtрлaydi
→ **bo'sh natija** (satr boshqa tenantда). Shu bilan cross-tenant havola aniqlanadi. Bir-tenant
mixed-patient uchun esa satr keladi, lekin uning `patientId`si mos kelmайди.

## 2. Dizayn qarori

**Aniq yechim (tanlangan) — kichik qayta-ishlatiluvchi ownership validator.**

`apps/api/src/modules/clinical/clinical.ownership.ts` (yoki `apps/api/src/lib/ownership.ts`) —
`getDb(c)` (RLS-scoped) select'lar bilan quyidagi sof-async tekshiruvlar; muvaffaqiyatsizликда
`CrossEntityError` (typed) otiladi, routes uni **400** (`ownership.mismatch`)ga aylantiradi:

```
createOwnershipValidator() → {
  assertPatientExists(c, patientId)          // RLS select patients → yo'q bo'lsa 400
  assertUserExists(c, userId)                // doctorId platform-level; user_assignments bilan tenantда aktivми
  assertStageBelongsToPatient(c, stageId, patientId)     // stage→plan.patientId === patientId
  assertVisitNoteBelongsToPatient(c, visitNoteId, patientId)
  assertAppointmentBelongsToPatient(c, appointmentId, patientId)
}
```

Har entity o'ziga tegishли kombinatsiyани chaqiradi (§3). Validator service'ларга **factory DI**
orqали (Qaror §3.5) yoki to'g'ridан import qilinган sof funksiya sifatida ulanади — DI afzal
(mavjud pattern).

**Muhim nuans (doctorId):** `users`да `tenant_id` YO'Q (CLAUDE.md §3.1). Shu sabab doctorId
tekshiruvи `user_assignments` bo'yicha — bu tenantда aktив assignment'и bormi. RLS `users`ga
qo'llanмаydi; assignment tekshiruvи `getDb(c)` (RLS-scoped `user_assignments`) bilan.

**Failure code:** cross-tenant/mixed-patient — bu **noto'g'ri request body**, shu sabab **400**
(`ownership.mismatch` / `ownership.not_found`), **404 EMAS** (resource "topilmади" emas, havola
noto'g'ri).

**Rad etilган alternativalar:**

- *DB-level: composite FK (id, patient_id) yoki RLS'ни FK'ga majburлаш* — katta migratsiya, har
  jadvалга `patient_id` denormalizatsiyа kerak. **Rad:** app-level validator yengil va yetarli.
- *Har service ichида inline select* — takror kod, testlash qiyin. **Rad:** yagona helper.

## 3. Spec — entity bo'yicha tekshiruvlar

| Entity / amal | Tekshiruvlar |
|---|---|
| **visit-note create/update** | `assertPatientExists(patientId)`; `stageId?` → `assertStageBelongsToPatient`; `appointmentId?` → `assertAppointmentBelongsToPatient`; `doctorId` → `assertUserExists` |
| **patient-image upload** | `assertPatientExists(patientId)`; `visitNoteId?` → `assertVisitNoteBelongsToPatient` |
| **tooth-chart create** | `assertPatientExists(patientId)`; `visitNoteId?` → `assertVisitNoteBelongsToPatient` |
| **prescription create** | `assertPatientExists(patientId)`; `doctorId` → `assertUserExists`; `visitNoteId?` → `assertVisitNoteBelongsToPatient` |

**Tartib (per-entity):** schema-validatsiya (createRoute) → **ownership** → (CLI-415 plan guard) → biznes mantiq.

**Chekka holatlar:**

- Ixtiyoriy maydonlar (`undefined`) → tekshirilmайди.
- `stageId` visit-note'да: avval stage bemорга tegishlими (421), keyin plan status ruxsatми (415).
- Cross-tenant UUID → RLS bo'sh select → 400.
- Mixed-patient (bir tenant, boshqa bemор stage) → satr keladi, `patientId` mos kelмайди → 400.

**Test caselar (bun test):**

1. Bemor A visit-note, `stageId` = B bemor bosqichи → 400, stage yopilмади, recall yo'q.
2. Cross-tenant `patientId` visit-note create → 400/404 (bo'sh RLS select).
3. `visitNoteId` boshqa bemorники (patient-image upload) → 400.
4. Prescription `doctorId` bu tenantда aktив assignment'siz → 400.
5. To'g'ri (hammasi bir bemор, aktив doctor) → 201 (regressiya yo'q).

## 4. Implementatsiya rejasi (TDD)

1. **Failing test** — `clinical.ownership.test.ts` + har service testiga mixed-patient case; 1-4 qizil.
2. **Impl:**
   - Yangi `clinical.ownership.ts` — `createOwnershipValidator()` + typed `CrossEntityError`.
   - Har service (`visit-notes`, `patient-images`, `tooth-charts`, `prescriptions`) factory'сига
     `ownership` dep qo'sh; create/update boshida tegishли assert'ларни chaqir.
   - Routes: `CrossEntityError` catch → `fail('ownership.mismatch', ...)` 400. (visit-notes routes'да
     mavjud `InvalidTransitionError` catch yonида.)
   - Wiring: `clinical.routes.ts` + `patient-images.routes.ts` factory'ларга validator uzat.
3. **Verify:** `bun test` yashил; `bun run typecheck`; `bun run check:rls` (yangi jadval yo'q, o'zgармаsligини tasdiqlash).

## 5. Migratsiya / rollout / xavflar

- **Migratsiya YO'Q** — app-level tekshiruv.
- **Xavf:** mavjud (buggy) ma'lumotда allaqачон cross/mixed havolalar bo'lса, ular *yangi* mutatsiyада
  400 berishi mumkin — bu to'g'ri xulq; lekin backfill/cleanup skript alohида ko'rib chiqilsin (scope tashqаri).
- **Performance:** har mutatsiyада 1-3 qo'shимча RLS select (indeksли PK/patientId lookup) — arzon.
- **Rollout:** feature-branch, TDD, lokal verify, main merge.

## 6. Qabul mezonlari

- [ ] Mixed-patient stage-linked visit note → 400 (recall yo'q).
- [ ] Cross-tenant patientId → 400/404.
- [ ] Cross/mixed visitNoteId (image/chart/prescription) → 400.
- [ ] Aktив bo'lmagan doctorId (prescription) → 400.
- [ ] To'g'ri yo'l ishlaydi (regressiya yo'q).
- [ ] `bun test` + `typecheck` + `check:rls` yashил.

## 7. Ta'sirlangan fayllar

- **Yangi:** `apps/api/src/modules/clinical/clinical.ownership.ts` (`createOwnershipValidator`, `CrossEntityError`)
- `apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts:45-116`
- `apps/api/src/modules/patient-images/patient-images.service.ts:74-132`
- `apps/api/src/modules/clinical/tooth-charts/tooth-charts.service.ts:32-47`
- `apps/api/src/modules/prescriptions/prescriptions.service.ts:41-58`
- Routes/DI wiring: `clinical.routes.ts`, `patient-images.routes.ts`, `prescriptions.routes.ts`
- Testlar: `clinical.ownership.test.ts` + service testlari (API)
