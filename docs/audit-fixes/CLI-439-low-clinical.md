# CLI-439 — LOW-B: Clinical domain hardening

> Guruhlangan LOW topilmalar (9 sub-item). Manba: `AUDIT-2026-07-06.md` §🟡 LOW, `scratchpad/audit-02-clinical.md`. Har band: Muammo (file:line) → Fix yondashuvi → qabul mezoni. Yengil hujjat — har band alohida kichik PR/commit bo'lishi mumkin.

---

## B1. Medical-record history + estimate reads audit-logged emas (§3.10 / CLI-363 gap)

**Muammo** (`patients.service.ts:405-432` `medicalRecordHistory`; `treatment-plans.service.ts:221-270` `estimate`): `GET /patients/{id}/medical/history` audit_log'dan to'liq before/after klinik kontentni qaytaradi lekin "viewed" yozuvини YOZMAYDI (`getMedicalRecord` yozadi). Xuddi shu `GET /treatment-plans/{id}/estimate` (`medical_record.view` o'qishi, audit yo'q). CLAUDE.md §3.10 sensitive-read audit talabini buzadi.

**Fix yondashuvi:** ikkala yo'lда ham `getMedicalRecord`даgi kabi "viewed" audit yozuvи (kontent'siz, faqat ko'rilgani) qo'shish.

- [ ] `GET /patients/{id}/medical/history` audit_log'ga viewed qatori yozadi.
- [ ] `GET /treatment-plans/{id}/estimate` audit_log'ga viewed qatori yozadi.

---

## B2. Lab orders holat-mashinasi yo'q; sana maydonlari regressда tozalanmaydi

**Muammo** (`lab-orders.service.ts:115-150`; frontend `LabOrdersTab` Select 6 statusni shartsiz taklif qiladi): istalgan status→status mumkin (`delivered→draft`, `cancelled→delivered`); `sentDate`/`deliveredDate` regressда tozalanmaydi → `deliveredDate`li order `delivered→draft` keyin yana overdue bo'lib qaytadi.

**Fix yondashuvi:** lab-order status transition jadvali (Qaror #25 uslubi, InvalidTransition→400); status orqага qaytса mos sana maydonini null qilish (yoki forward-only qilish); frontend Select faqat ruxsat etilgan keyingi statuslarni ko'rsatadi.

- [ ] `delivered→draft` kabi noto'g'ri o'tish 400 qaytaradi.
- [ ] Status orqага ketса bog'liq sana maydoni tozalanadi / regress bloklanadi.

---

## B3. `/rx` route perm mismatch (medical_record.view vs prescription.view)

**Muammo** (`clinical.routes.tsx:16` — frontend route `medical_record.view` bilan gated; `prescriptions.routes.ts:44` — API `prescription.view` talab qiladi): CLI-153 anti-pattern'i — `medical_record.view` bor lekin `prescription.view` yo'q rol `/rx`ни ko'radi, so'ng 403 oladi. Qo'shimcha: `useAllPrescriptions` paginatsiyalanmaган.

**Fix yondashuvi:** frontend route perm'ni API bilan moslash (`prescription.view`); `useAllPrescriptions`ga pagination/`pageSize` cap qo'shish (CLI-435 naqshi).

- [ ] `/rx` route `prescription.view` bilan gated (API bilan mos).
- [ ] `prescription.view`siz rol nav'da `/rx` ko'rmaydi, 403 olmaydi.

---

## B4. Plan lifecycle UI'дан tugatib/bekor qilib bo'lmaydi

**Muammo** (`PlanCard.tsx:105-153`): faqat `draft→presented`, `presented→accepted` o'tishlar UI'да bor; `accepted→in_progress/completed/cancelled` hech qерда yo'q → har plan `accepted`да qotib qoladi.

**Fix yondashuvi:** `PlanCard`ga qolgan lifecycle amallarини qo'shish (backend transition jadvaliga mos — `accepted→in_progress/completed/cancelled`), `useUpdatePlanStatus` orqali; permission-gated.

- [ ] Accepted planни UI'дан `completed`/`cancelled` qilib bo'ladi.
- [ ] Faqat backend transition jadvalида ruxsat etilган o'tishlar ko'rsatiladi.

---

## B5. Consent qayta-imzolash oldingi imzoни jim tozalaydi/ustiga yozadi

**Muammo** (`treatment-plans.service.ts:141-158` `setConsent`; `PlanCard.tsx:206-213`): DOIM `consentSignatureUrl ?? null` yozadi, `consentSignedAt`ни reset qiladi, har statusда ishlaydi; bo'sh submit imzoni null qiladi → yuridik yozuv yo'qoladi (faqat audit_log'dan tiklanadi).

**Fix yondashuvi:** imzo mavjud bo'lса ustiga yozishни bloklash yoki append-only qilish (yangi imzo alohida versiya); bo'sh `consentSignatureUrl` submit'ini rad qilish; qayta-imzo faqat aniq ruxsat bilan.

- [ ] Bo'sh submit mavjud imzoni null qilmaydi.
- [ ] Qayta-imzo oldingi imzoni jim o'chirmaydi (versiya/append yoki blok).

---

## B6. Odontogram bir tishда bir nechta surface-state'ни collapse qiladi (round-trip data loss)

**Muammo** (`clinical.mappers.ts:93-117`; backend dup qatorlarга ruxsat `tooth-charts.repository.ts:49-68`, `(chart,tooth,surface)`да uniqueness yo'q): UI draft `Map<tooth, one state>` — bir tishда >1 surface yozuvи bo'lса yuklashда bittadan boshqasi yo'qoladi, keyingi save qisqartirilган to'plamни saqlaydi. Shuningdek dup `(tooth,surface)` va primary chart'да doimiy tish qabul qilinadi.

**Fix yondashuvi:** UI modelini `Map<tooth, Map<surface, state>>` (yoki per-surface) qilib surface darajасида saqlash; backend `(chart, tooth, surface)`ga unique constraint; primary chart'да FDI validatsiyasi.

- [ ] Bir tishда bir nechta surface-state round-trip'да saqlanadi.
- [ ] Dup `(tooth,surface)` qatori yaratilmaydi.

---

## B7. PlanFormModal muvaffaqiyatli create'дан keyin reset qilinmaydi (tasodifiy dublikat plan)

**Muammo** (`PlanFormModal.tsx:74-93`, `TreatmentPlansTab.tsx:134`): create muvaffaqiyatida faqat `close()` chaqiriladi, `form.reset()` emas → modal qайta ochilса eski qiymatlar qoladi → tasodifiy dublikat plan submit.

**Fix yondашuvi:** `onSuccess`да `form.reset()` (yoki modal ochilishда reset) qo'shish.

- [ ] Modal muvaffaqiyatli create'дан keyin bo'sh form bilan ochiladi.
- [ ] Ketma-ket ikki ochilishда oldingi qiymatlar qolmaydi.

---

## B8. PATCH /patient-images/{id} bo'sh body → Drizzle `.set({})` → 500

**Muammo** (`patient-images.service.ts:134-151`): bo'sh body'да `.set({})` Drizzle'да throw qiladi → 500. Guard `visit-note-templates.service.ts:53-54`да bor, bu yerда takrorlanmagan.

**Fix yondashuvi:** update'дан oldin bo'sh-patch guard (0 maydon → 400 `no_fields` yoki no-op qaytarish), `visit-note-templates.service.ts` naqshi bo'yicha.

- [ ] Bo'sh body PATCH 500 emas, 400/no-op qaytaradi.
- [ ] Kamida bitta maydonли PATCH oldingidek ishlaydi.

---

## B9. Audit / versioning polish (no-op qatorlar, JSON.stringify diff, updateStage before yo'q)

**Muammo** (`patients.service.ts:387-395`, `patients.mapper.ts:37-50`, `treatment-plans.service.ts:180-187`):
- (a) `updateMedicalRecord` no-op patch'да ham audit qatori yozadi → bo'sh diff qatorlari.
- (b) diff JSONB'ни `JSON.stringify` bilan solishtiradi → kalit-tartib false-positive (masalan `testResults`).
- (c) `updateStage` audit'ида faqat `after` bor, `before` yo'q → stage tarixini tiklab bo'lmaydi.

**Fix yondashuvi:** (a) o'zgarish bo'lmasа audit yozmaslik (before==after guard); (b) diff'ни normalizatsiyalangan/deep-equal bilan solishtirish (kalit-tartibдан mustaqil); (c) `updateStage` audit'ига `before` snapshot qo'shish.

- [ ] No-op medical-record patch audit qatori yaratmaydi.
- [ ] Kalit-tartib farqи false diff bermaydi.
- [ ] `updateStage` audit `before`+`after` ikkаласини yozadi.

---

## Umumiy eslatma

- B1/B2/B5/B6/B8/B9 (backend) TDD bilan (`bun test --env-file=../../.env`); B3/B4/B7 (frontend) vitest.
- B2/B4 backend transition jadvali (Qaror #25) bilan koordinatsiya; frontend faqat ruxsat etilган o'tishни ko'rsatishга bog'liq.
- B6 va B9 migratsiya (unique constraint) talab qilishi mumkin — alohida drizzle migration.
