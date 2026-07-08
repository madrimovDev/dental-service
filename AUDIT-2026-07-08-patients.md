# Bemor/Mijoz Domenining Chuqur Logikaviy Audit — 2026-07-08

6 ta parallel READ-ONLY audit agenti: bemor backend yadrosi, moliyaviy hisob-kitob (balans/billing), klinik yozuvlar (odontogram/plan/vizit/rx/consent/lab-order/rasm), yozilish/navbat/recall/bildirishnoma, frontend bemor feature'i, hisobot/RBAC/eksport. 2026-07-06/07 kunlaridagi audit (CLI-405..453, 45 ticket, hammasi Linear'da "Done") natijalari kirish nuqtasi sifatida berildi — agentlar ularni qayta topmadi, faqat holistik tasdiqladi (aksariyati to'g'ri ishlayapti).

**Eng muhim topilma — CLI-412 status-kod nomuvofiqligi:** Linear'da "Done" deb belgilangan va "Implementatsiya tugadi" izohi bilan tasdiqlangan CLI-412 (Technician `lab_order.view`) o'zgarishi **hech qanday branch/commit'da mavjud emas** (`git log --all` — 0 ta mos commit; `main` va audit branch'lari orasida `role-templates.ts` uchun diff yo'q). Bu chuqurroq qidirishda **butun M5 klinik ruxsat oilasi** (`prescription.*`, `consent.*`, `lab_order.*`, `patient_image.*` — 8 kod) **hech qaysi rol shablonida yo'qligini** fosh qildi — quyida Critical-1.

---

## 🔴 CRITICAL

### C1. M5 klinik permissionlari (`prescription.*`, `consent.*`, `lab_order.*`, `patient_image.*`) hech qanday rol shablonida yo'q — owner'dan boshqa hech kim retsept yoza olmaydi, consent imzolay olmaydi, rasm yukliy olmaydi, lab-order ko'ra olmaydi

**Confidence:** Confirmed (qo'lda kod o'qib tasdiqlandi, 2 mustaqil agent + men)

`packages/core/src/role-templates.ts` (barcha 8 shablon, 21-253 qator) — `permissions.ts:310-357`da e'lon qilingan 8 kod (`prescription.view/manage`, `consent.view/manage`, `lab_order.view/manage`, `patient_image.view/upload`) HECH BIR shablonda ishlatilmagan. Seed yagona yo'l orqali (`auth.service.ts:51-76`, `template.permissions`dan `role_permissions`ga to'g'ridan-to'g'ri insert) — boshqa hech qanday migratsiya bu kodlarni qo'shmaydi. `requirePermission` faqat `@owner` sentinel bilan bypass qiladi.

**Ssenariy:** Yangi tenant ro'yxatdan o'tadi (yoki mavjud tenant — bu M5 qurilganidan beri, ya'ni oylar davomida shunday bo'lgan). Owner ikkinchi shifokorni **Doctor** rolida yollaydi (hujjatlashtirilgan, tavsiya etilgan oqim). Bu Doctor: `POST /prescriptions` → 403 (hech bir rolda `prescription.manage` yo'q), `POST /consent/forms` → 403, `GET/POST /patient-images` → 403. Xuddi shu — Nurse, Doctor+Assistant, Branch Manager, Receptionist, Accountant, Technician uchun. **Faqat owner shaxsan** bu 4 ta klinik modulni ishlata oladi — M5 milestone (reseptlar+konsent+rasm+lab orders, CLAUDE.md §8 bo'yicha alohida milestone) amalda faqat owner uchun ishlaydi.

**Yumshatuvchi:** `role.manage`ga ega tenant admin Settings→Roles orqali qo'lda tuzatishi mumkin — lekin bu default holat, hech qanday onboarding ogohlantirishisiz, va bugungi kungacha barcha tenantlarga tegishli.

**Tuzatish yo'nalishi:** `prescription.view/manage`, `consent.view/manage`, `lab_order.view/manage`, `patient_image.view/upload`ni tegishli shablonlarga qo'shish (kamida Doctor, Doctor+Assistant; Technician — `lab_order.*`; Nurse — ehtimol `patient_image.view`). Mavjud tenantlar uchun backfill migratsiya kerak (yangi qaror — CLI-412 spec'i buni "qasddan qilinmadi, tenant qo'lda tuzatishi kerak" deb belgilagan edi, lekin bu qaror ham hech qachon amalga oshirilmagan).

**Runtime tasdiq (advisor tavsiyasi bilan qo'shimcha tekshirildi):** M5 klinik modullarida (`prescriptions`/`consent`/`lab-orders`/`patient-images`) HECH QANDAY unit test (`apps/api/src/modules/{prescriptions,consent}/*.test.ts` — mavjud emas) va yagona tegishli integration test (`cli-364-prescriptions-audit.test.ts:30`) faqat `{ perms: ['@owner'] }` bilan autentifikatsiya qiladi. Ya'ni bu 4 modul hech qachon real cheklangan rol permset'i bilan sinalmagan — aynan shu sabab bilan bug oylar davomida (M5 qurilganidan beri) hech qanday review yoki E2E'da ushlanmagan. Bu — loyiha xotirasida bir necha marta qayd etilgan "@owner test rol-gap'larni yashiradi" pattern'ining eng yirik namunasi.

**⚠️ Process eslatma:** CLI-412 Linear'da "Done" + "implementatsiya tugadi (faqat template, kelishilganidek)" izohi bilan yopilgan, lekin `git log --all -- packages/core/src/role-templates.ts` da mos commit yo'q, `docs-audit-local` branch'ida ham fayl `main` bilan bir xil. Bu — ilgari xotirada qayd etilgan "Workflow worktree eskirgan commit'dan boshlanishi mumkin" xavfining yangi, tasdiqlangan namunasi: bu safar reviewer/agent commit qilmasdan yoki commit worktree'da qolib ketib, "Done" deb belgilagan. **Boshqa 44 ticket ham xuddi shunday tasdiqlanmagan bo'lishi extsizsiz emas** — bu audit faqat bemor-domenidagi tasodifiy spot-check orqali buni topdi, tizimli qayta-tekshiruv qilinmadi.

---

### C2. Bemor tanlash UI eng so'nggi 100 ta bemor bilan cheklangan — qidiruv ishlamaydi, eski bemorlar yozilish/kassa/navbatda "yo'q" bo'lib ko'rinadi

**Confidence:** High

**Fayl:** `apps/web/src/features/appointments/components/NewAppointmentWizard.tsx:51,179-185`, `apps/web/src/features/cashier/cashier.api.ts:69-74` (`usePatientsAll`) → `CashierScreen.tsx`, `apps/web/src/features/queue/queue.api.ts:58-63` → `CheckInDialog.tsx`

Uchalasi ham `listPatients({ pageSize: 100 })` qidiruv so'zisiz chaqiradi, backend `desc(createdAt)` bo'yicha tartiblaydi. Mantine `searchable` Select faqat OLINGAN 100 ta yozuv ICHIDA client-side filtrlaydi — server so'rovi hech qachon qayta yuborilmaydi. Solishtirish uchun: `PatientsListScreen` va `CommandPalette`/`AddRelativeForm` to'g'ri debounced server-search ishlatadi — bu tasodifiy emas, aynan shu 3 joy unutilgan.

**Ssenariy:** Tenant 100 dan ortiq bemorga ega bo'lgach (1-10 doktorli klinika uchun bir necha oyda yetadigan chegara), 100 ta "eng yangi" ro'yxatga kirmagan HAR bir bemor yozilish wizard'ida, kassa to'lov tanlovchisida va navbat check-in'da qidiruvda umuman topilmaydi — xatosiz, "topilmadi" ko'rinishida, aslida qidiruv server'ga yetib bormagan.

**Tuzatish yo'nalishi:** `CommandPalette`dagi pattern (debounced `search` param `usePatients`/`usePatientsAll`ga) uch joyga ham ko'chirish.

---

## 🟠 HIGH

### H1. Bemor moduli o'zida CLI-421 cross-entity ownership tekshiruvi yo'q — `addRelative`/`addEmergencyContact` boshqa tenant bemoriga bog'lanishi mumkin

**Confidence:** High

**Fayl:** `apps/api/src/modules/patients/patients.service.ts:538-563` (`addRelative`), `:607-638` (`addEmergencyContact`)

CLI-421 (`apps/api/src/lib/ownership.ts`) visit-notes/patient-images/tooth-charts/prescriptions(create)ga ulangan — FK constraint RLS'ni chetlab o'tishi mumkinligi uchun (FK mavjudlikni istalgan tenant bo'yicha tekshiradi). `patients.service.ts`ning o'ziga esa ulanmagan.

**Ssenariy:** Tenant A xodimi (`patient.edit`), Tenant B'ga tegishli haqiqiy bemor UUID'ni bilsa (yoki topsa), `POST /patients/{A_patient}/relatives {relativePatientId: B_patient}` — FK+RLS `WITH CHECK` faqat yangi qator `tenant_id=A`ligini tekshiradi, `relative_patient_id`ning A'ga tegishliligini emas. Insert o'tadi — CLAUDE.md §3.2 qat'iy taqiqlagan cross-tenant bemor bog'lanishi paydo bo'ladi (to'g'ridan-to'g'ri PHI sizib chiqmaydi, lekin arxitektura qoidasi buziladi + kelajakdagi kam ehtiyot bo'lgan feature uchun xavfli asos qoladi).

**Tuzatish yo'nalishi:** `createOwnershipValidator()`ni `addRelative` (ikkala patientId) va `addEmergencyContact` (URL patientId)ga ulash.

---

### H2. Bemorning ixtiyoriy maydonini (telefon/passport/manzil/izoh/tug'ilgan sana) tozalash jim ishlamaydi — eski qiymat saqlanib qoladi

**Confidence:** High

**Fayl:** `apps/api/src/modules/patients/patients.schema.ts:41-63` (`.optional()`, `.nullable()` EMAS — `insurance`dan farqli), `patients.service.ts:357-361` (`update()` spread), frontend `apps/web/src/features/patients/components/tabs/GeneralTab.tsx:174-184` (`values.phone || undefined`)

Frontend bo'sh maydonni `undefined`ga aylantiradi → Zod kalitni tashlab yuboradi → `update()`dagi `.set({...input})` bu ustunga umuman tegmaydi. API'da "maydonni tozalash"ning hech qanday yo'li yo'q.

**Ssenariy:** Bemorning telefoni bor. Foydalanuvchi formada Telefon maydonini bo'shatib, Saqlashni bosadi. Server 200 qaytaradi, lekin DB'dagi eski telefon o'zgarmay qoladi — foydalanuvchi o'z tahriri saqlanmaganini bilmaydi.

**Tuzatish yo'nalishi:** shu maydonlarni `.nullable()` qilish (`insurance` patterniga o'xshab), frontend `undefined` o'rniga `null` yuborsin, `update()` "kalit yo'q" (no-op) va "kalit `null`" (tozalash) holatlarini ajratsin.

---

### H3. "To'lovlar" tab `cashier.view` bilan gate qilinmagan + xatoni "to'lov yo'q" deb ko'rsatadi — balans chip bilan zid (4/8 rolda)

**Confidence:** High (role-template'lar bilan bevosita tasdiqlangan)

**Fayl:** `apps/web/src/features/patients/components/PatientCard.tsx:72` (`pay` tab — `permission` maydoni yo'q, boshqa hamma data-tab'da bor), `PaymentsTab.tsx:13-29` (faqat `isLoading`, `isError` tekshirilmaydi)

Backend `GET /cashier/transactions` — `cashier.view` talab qiladi (`patient.view`dan qattiqroq). **Doctor, Doctor+Assistant, Nurse, Technician** — 8 tadan 4 tasi — `patient.view` bor, `cashier.view` yo'q.

**Ssenariy:** Doctor rolida login, qarzdor bemor kartasini och — balans chip (`patient.view` bilan gate) qarzni to'g'ri ko'rsatadi, to'g'ridan-to'g'ri pastdagi "To'lovlar" tab esa 403'ni "to'lov tarixi yo'q" deb ko'rsatadi — ziddiyatli, tushunarsiz UX.

**Tuzatish yo'nalishi:** `pay` tab'ga `permission: 'cashier.view'` qo'shish (boshqa gated tab'lar kabi butunlay yashirish) + `isError` handling.

---

### H4. Navbat tiket raqami — unique constraint amalda hech qachon ishlamaydi (race condition, xuddi CLI-408 sinfidan, tuzatilmagan)

**Confidence:** High

**Fayl:** `apps/api/src/modules/queue/queue.service.ts:126-149`, `packages/db-schema/src/tables/queue-tickets.ts:35,44-50`

`ticketDate` ustuni `defaultNow()` — insert paytida mikrosekund-aniq vaqt yoziladi. `UNIQUE(tenantId, branchId, ticketDate, queueNumber)` constraint shu sababli HECH QACHON to'qnashmaydi (har yozuv boshqa `ticketDate`ga ega). `queueNumber` `MAX(...)+1` orqali `FOR UPDATE`siz, READ COMMITTED izolyatsiyada hisoblanadi — xuddi CLI-408 (doktor overlap, EXCLUDE constraint bilan tuzatilgan) bilan bir xil sinfdagi race, lekin bu yerda hech qanday DB-darajasidagi himoya yo'q.

**Ssenariy:** Ikki registrator bir vaqtda bitta filialda ikkita bemorni navbatga qo'yadi → ikkalasi ham bir xil `MAX+1`ni o'qiydi → ikkalasi bir xil `queueNumber` bilan insert qiladi, DB rad etmaydi (constraint ishlamagani uchun) → navbat taxtasida ikki bemor bitta raqamga ega.

**Tuzatish yo'nalishi:** `ticketDate`ni kun boshiga (`tashkentDayStart()`) anchor qilib yozish + unique constraint shunga tayansin, YOKI `create()`da branch+kun bo'yicha `FOR UPDATE` qulf (payroll'dagi pattern bilan izchil).

---

### H5. `medicalRecordHistory` audit_log'ga yozilmaydi — CLAUDE.md §3.10 buzilishi (2 mustaqil agent tasdiqladi)

**Confidence:** High

**Fayl:** `apps/api/src/modules/patients/patients.service.ts:463-490`

`getMedicalRecord` (403-419) `action:'viewed'` audit qiladi. Bir xil `medical_record.view` permission bilan gate qilingan qardosh endpoint `medicalRecordHistory` (to'liq PHI diff tarixi — allergiya, surunkali kasallik, homiladorlik, HIV/gepatit natijalari) — audit chaqiruvi UMUMAN yo'q. Bitta permission ostidagi ikki endpoint'ning biri iz qoldiradi, ikkinchisi yo'q.

**Tuzatish yo'nalishi:** `getMedicalRecord`dagi audit chaqiruvini ko'chirish.

---

### H6. Bulk bemor ro'yxati PII ko'rinishi audit qilinmaydi (2 mustaqil agent tasdiqladi)

**Confidence:** High

**Fayl:** `apps/api/src/modules/patients/patients.service.ts:65-208`, ayniqsa 202-204

`findById` PII ochilganda `action:'viewed_pii'` yozadi. `list()` xuddi shu `userHasPiiAccess(c)` shartini hisoblaydi va sahifadagi HAR bir qatorga (100 tagacha) niqobsiz telefon/passport/manzil qaytaradi — audit chaqiruvi yo'q. Bu yagona-yozuv ko'rinishidan kattaroq, muntazam PII-ochilish sirti, aynan shu audit qilinmagan.

**Tuzatish yo'nalishi:** list chaqiruvi uchun bitta batch audit yozuvi (`{count, patientIds}`) qo'shish.

---

## 🟡 MEDIUM

### M1. Kassa `create()` plan-billing rejimida `paidAmount` allocation yig'indisiga TENG bo'lishi majburiy emas (faqat ≤)

Faqat raw API orqali (hozirgi frontend har doim `paidAmount = Σ allocations` yuboradi) — himoya-chuqurlik toifasi. `apps/api/src/modules/cashier/cashier.service.ts:223-233` — guard bir tomonlama. Kassa kunlik hisobot (fizik naqd) bilan bemor plan-qarzi orasidagi rekonsilyatsiya buzilishi mumkin. *Tuzatish:* tenglik guard yoki server-side derive (CLI-443 narx patterniga mos).

### M2. `patientId`/`treatmentPlanId` allocation'dagi haqiqiy stage egaligi bilan tekshirilmaydi

Raw API orqali `patientId`/`treatmentPlanId`ni bo'sh qoldirish mumkin — bemor balansi to'g'ri kamayadi (stageId orqali), lekin (a) bemorning "To'lovlar" tabida yozuv ko'rinmay qoladi, (b) payroll INNER JOIN `treatmentPlanId`ga tayanadi — komissiya HECH KIMGA hisoblanmaydi (real moliyaviy yo'qotish). `cashier.service.ts:240-256,279-316` + `payroll.service.ts:82-97`. *Tuzatish:* allocation'lardan `treatmentPlanId`/`patientId`ni derive/tekshirish.

### M3. Consent moduli — muddat tushunchasi umuman yo'q + rejani "accepted" qilish rasmiy consent-form yozuvidan uzilgan

`consent_forms` jadvalida `expiresAt` yo'q; treatment-plan accept gate faqat `consentSignedAt` bo'sh timestamp'ga tayanadi, `consent_forms`ga hech qachon murojaat qilmaydi. `POST /treatment-plans/{id}/consent` bo'sh `{}` bilan planni "accepted" qiladi — rasmiy imzolangan hujjat hech qachon tekshirilmaydi. `treatment-plans.service.ts:161-222`.

### M4. Stage "completed" bo'lishi mumkin — hech qanday visit-note yaratilmasdan

`PATCH /treatment-stages/{id} {status:'completed'}` to'g'ridan-to'g'ri — SOAP yozuvi mavjudligini talab qilmaydi, lekin billing-eligible bo'ladi va recall fire bo'ladi. `treatment-plans.service.ts:224-279`.

### M5. Emergency contact `isPrimary` eksklyuzivligi majburlanmagan

Bir nechta contact bir vaqtda `isPrimary=true` bo'lishi mumkin — demote logikasi yo'q, DB partial unique index yo'q. `patients.service.ts:607-638`.

### M6. `dateOfBirth` kelajak sanani qabul qiladi

Yuqori chegara `.refine()` yo'q. `patients.schema.ts:43`.

### M7. Eslatma (reminder) — bemor telefoni yo'qligida jim, izsiz fail bo'ladi (recall-worker bilan nomuvofiq)

`reminder-worker.ts:51-57` — telefon yo'q bo'lsa SMS bloki umuman ishga tushmaydi, hech qanday log/audit. Qiyoslash uchun `recall-worker.ts:118-128` xuddi shu holatni `outcome:'no_phone'` bilan yozadi (kuzatiladigan). *Tuzatish:* reminder-worker'ni recall-worker patterniga moslashtirish.

### M8. Recall `summary()` "overdue" KPI — Postgres `CURRENT_DATE` (taxminan UTC)ga tayanadi, loyihaning boshqa hamma joyida ishlatiladigan Asia/Tashkent kun chegarasiga emas

`recalls.repository.ts:260`. Agar DB session UTC bo'lsa (tekshirilmagan taxmin — production/desktop deploy'da alohida tasdiqlash kerak) — har kuni 00:00–05:00 Tashkent oralig'ida kechagi muddat kelgan recall'lar "overdue" hisobiga kirmay qoladi.

### M9. Patient-card tab'larida sistemli StateView/error handling yo'q — ikki xil noto'g'ri xatti-harakat

`MedicalTab`/`GeneralEditForm` — xato holatida CHEKSIZ "loading" spinner (yomonroq — jim yutishdan ham); `PaymentsTab`/`FamilyTab`/`RecallTab` — xatoni "bo'sh" deb ko'rsatadi (H3 bilan bir xil shakl, lekin RBAC'dan tashqari har qanday tarmoq/500 xatosida ham). `PatientsListScreen`/`CashierScreen`dagi to'g'ri `StateView` patterni bu yerda ishlatilmagan.

### M10. `PatientHeaderCard` balans — `formatCurrency`ni chetlab, inline `toLocaleString('ru-RU')` ishlatadi (CLI-166 buzilishi)

`PatientHeaderCard.tsx:173` — valyuta suffiksisiz, til tanlovidan qat'iy nazar doim rus-uslubidagi raqam guruhlash. `BalanceBadge`/`BalanceChip` to'g'ri ishlatadi.

### M11. Sug'urta pastki maydonlari (`coverageType`/`expiryDate`/`isActive`) — `provider` bo'sh qolsa jim tashlab yuboriladi

`patients.schema.ts:22-34` refine faqat `provider`↔`policyNumber`ni tekshiradi. `PatientNewScreen.tsx:46` — `insurance = values.insurance?.provider ? values.insurance : null` — foydalanuvchi to'ldirgan boshqa maydonlar ogohlantirishsiz yo'qoladi.

### M12. Accountant — Payroll ekranida xodim ismi qidiruvida cross-domain 403 (RBAC pattern yana takrorlandi, ilgari qo'lga olinmagan)

`payroll.api.ts:17-22` (`useUserAssignments`) shartsiz chaqiriladi, backend `user.view` talab qiladi — Accountant shablonida yo'q (faqat `payroll.view/manage` bor). Xato jim yutiladi — payroll qatorlarida ism o'rniga bo'sh/ID ko'rinadi. CLI-154/155 precedentiga mos tor endpoint kerak.

### M13. Prescriptions `update()` — CLI-421 ownership tekshiruvi yo'q (naqshdagi yagona istisno)

`prescriptions.service.ts:83-112` — `create()`da ownership tekshiruvi bor, `update()`da yo'q. `PATCH /prescriptions/{id}` bilan `visitNoteId`ni boshqa (bir tenant ichidagi) bemorning vizitiga o'zgartirish mumkin — cross-patient bog'lanish.

### M14. Bemorda bir nechta faol yozilish — faqat DOKTOR darajasida tekshiriladi, bemor darajasida umuman yo'q (mahsulot qarori kerak)

`appointments.service.ts:106-132`, DB EXCLUDE constraint ham faqat `doctor_id`. Bitta bemor ikki xil doktorga bir vaqtga yozilishi mumkin, tizim buni sezmaydi.

### M15. Aniq `report.export` permission yo'q — 1C eksport (bemor-nomi bilan bog'langan to'liq tranzaksiya) xuddi diagramma ko'rish bilan bir xil `report.view` bilan gate qilingan

`reports.routes.ts:128-142`. Amaldagi ta'sir kichik (faqat `report.view` egalari), lekin sezgirlik darajasi boshqacha bo'lishi kerak.

### M16. `netServiceAggregates` `service_name` matn bo'yicha guruhlaydi, `service_id` emas — ikki xizmat bir xil nomga ega bo'lsa margin hisobi buziladi

`reports.service.ts:105-162`. `services.nameUz` uchun unique constraint yo'q. Bu CLI-450 (yaqinda tuzatilgan margin hisoboti)ning tannarx bazasiga bevosita ta'sir qiladi.

---

## 🟢 LOW

- **L1.** Relatives/emergency-contacts **list** (GET) endpoint'lari `patient.edit` bilan gate qilingan, `patient.view` emas — Nurse/Technician/Accountant favqulodda aloqani ko'ra olmaydi. Test kommentariyasida "qasddan, mavjud pattern'ni mirror qiladi" deyilgan, lekin bu qaror o'zi qayta ko'rib chiqilishi kerak. (`patients.routes.ts:287,363`)
- **L2.** `PlanCard.tsx` da hardcoded uz/ru matn (i18n, CLAUDE.md §3.9) — kod izohida allaqachon "keyingi pass" deb belgilangan, hali ochiq qarz.
- **L3.** Emergency contact `phone` formatga tekshirilmaydi (patient.phone'dan farqli, erkin 40-belgigacha matn).
- **L4.** O'z-o'ziga bog'langan relative link bloklanmagan (bemor o'ziga "qarindosh" bo'lishi mumkin).
- **L5.** Reciprocal relative link ikki marta (A→B va B→A) qo'shilishi mumkin — ro'yxatda ikki marta ko'rinadi.
- **L6.** Retention metrikasi cancelled/no-show appointment'larni "bemor qaytdi" deb hisoblaydi — dizayn noaniqligi, aniq bug emas.
- **L7.** Bemor darajasidagi no-show strike/tracking yo'q — faqat agregat `noShowRate` bor.
- **L8.** Favqulodda aloqa ma'lumoti saqlanadi, lekin hech qanday recall/reminder/eskalatsiya oqimida ishlatilmaydi (faqat ko'rsatish uchun).
- **L9.** Avtomatik yaratilgan recall'larda (`autoCreateFromStage`/`autoCreatePreventive`) `assignedDoctorId` doim `null` — chaqiruvchida doktor ID mavjud bo'lsa ham uzatilmaydi.
- **L10.** Telegram>SMS priority factory (`createNotificationChannel`) mavjud, lekin reminder/recall worker'lar to'g'ridan-to'g'ri `createSmsChannel`ni chaqiradi — hujjatlashtirilgan scaffold chegarasi, lekin real faollashtirishda eslab qolinishi kerak wiring nuqtasi.
- **L11.** Arxivlangan bemor ro'yxatida faol "Arxivlash" tugmasi hali ko'rinadi; unarchive/restore endpoint umuman yo'q.
- **L12.** `treatment-plans`/`lab-orders` `create()` CLI-421 ownership-validator ishlatmaydi — xavfsizlik teshigi emas (RLS himoyalaydi), lekin noto'g'ri `patientId` xom Postgres FK-xatosi (500) qaytaradi, toza 400 o'rniga.
- **L13.** `patientEditSchema` telefon maydonlarida format regex yo'q (`patientFormSchema`dan farqli) — amalda `PhoneInput` orqali yumshatilgan, lekin latent nomuvofiqlik.

---

## Tekshirilib, muammo topilmagan (ijobiy natijalar, qisqacha)

- Ko'p aktiv plan, plan-cancel balans, refund-ning-refundi, non-plan+plan aralash balans, discount+refund kombinatsiyasi, race condition (overpay guard) — hammasi to'g'ri.
- Odontogram versiyalash, lab-order state machine, klinik audit-log qamrovi (2 tadan tashqari — H5/H6) — toza.
- Multi-branch aralashish, reminder lifecycle, recall due-date arifmetikasi (TZ'dan tashqari) — toza.
- Query invalidation (to'lov/refund'dan keyin balans UI yangilanishi), double-submit himoyasi, i18n kalit sinxronligi (uz/ru) — toza.
- Branch-scoping asimmetriyasi (CLI-431 klassidan) boshqa metrikalarda takrorlanmagan.

---

## Ticket holati: Reopen vs Yangi

Ba'zi topilmalar mavjud (Done deb belgilangan) ticket'larning **to'liq bajarilmagan qismi**, yangi mustaqil bug emas — Linear'da bular **reopen** qilinishi kerak, yangi ticket emas:

| Topilma | Bog'liq ticket | Holat |
|---|---|---|
| C1 (M5 permissionlari) | CLI-412 | Done deb belgilangan, kod hech qachon commit qilinmagan — **reopen + izohni tuzatish** |
| H5 (medicalRecordHistory audit) | CLI-439 (B1) | Qardosh endpoint (`estimate()`) tuzatilgan, bu ikkinchisi qolib ketgan — **reopen** |
| H1 / M13 (ownership tekshiruvi yo'q) | CLI-421 | Pattern boshqa 5+ joyga ulangan, `patients.service.ts` va `prescriptions.update()`da qolib ketgan — **reopen** (yoki kengaytirilgan qamrov sifatida qo'shimcha comment) |

Qolgan barcha topilmalar (C2, H2-H4, H6, M1-M16, L1-L13) — **yangi**, hech qanday mavjud ticket bilan bog'liq emas.

**Linear holati (2026-07-08, team Clinik, label `audit-2026-07-08`):** CLI-412 reopened+expanded (C1, Urgent), CLI-439 va CLI-421 reopened+comment (H5, H1/M13). Yangi: CLI-454 (C2), CLI-455-458 (H2/H3/H4/H6), CLI-459-466 (M1-M8), CLI-467-473 (M9-M12,M14-M16), CLI-474 (Low bundle, L1-L13).

## Metodologik eslatma

Bu audit 2026-07-06/07 audit natijalarini (45 ticket, barchasi Linear "Done") kirish nuqtasi sifatida oldi va ularni qayta tekshirmadi — **CLI-412 istisno**, u tasodifan ochib qoldi va "Done" statusining har doim haqiqiy kod holatini aks ettirmasligini ko'rsatdi. Boshqa 44 ticket bu auditda **tizimli qayta-tekshirilmadi** (faqat patient-domenida duch kelingan ~15 tasi yuzaki spot-check qilindi va barchasi to'g'ri tasdiqlandi). Agar "Done" statusining ishonchliligi muhim bo'lsa, alohida to'liq-qamrovli verifikatsiya tavsiya etiladi.
