# Mantiqiy audit reyestri — 2026-11-19

Usul: `.claude/workflows/logic-audit.js` (run `wf_a8620dbb-75d`, 47 agent): 9 oqim × `auditor` (A2 sonnet/high; money/rbac/tenancy/license — A3 opus/high) → dedupe → 36 eng og'ir topilma × `refuter` (critical — 2 lens) → tanqidchi. Faqat statik o'qish; real-DB/brauzerda qayta ishlab chiqarilmagan. Kod TEGILMAGAN. Advisor chaqiruvi: 0.

**Natija:** 92 noyob topilma → tekshirildi 36: **34 tasdiqlandi**, 1 hal bo'lmadi, 1 rad etildi; **56 tekshirilmagan** (maxVerify chegarasi — asosan low).

ID: `LA-NN`. Og'irlik refuter qayta baholagan qiymat (`auditor → refuter`).

## Xulosa

| ID | Og'irlik | Oqim | Topilma |
|---|---|---|---|
| LA-01 | high | Litsenziya | needsVendor holatida aktivatsiya formasi butunlay yashiriladi, vendor prepare-reinstall'dan keyin ham u yo'qolmaydi: o'sha kompyuterda baza yo'qolsa mahsulot ichida tiklanish yo'q (C1 qaytadi) |
| LA-02 | high | Xabarlar | Anketa qoralamasi faqat yoziladi — API ham, web ham o'qimaydi (shifokor hech qachon ko'rmaydi) |
| LA-03 | high | Pul | Rejadagi bosqichga bog'langan vizit kassada «kutilayotgan vizit» sifatida ham chiqadi, shuning uchun bemordan ikki marta pul olinadi |
| LA-04 | high | Ruxsatlar | Klinika miqyosidagi (branchId=null) egasi bo'lmagan xodim UI'da eng eski filialga qulflanib qoladi: filial almashtirib bo'lmaydi, yozilish ustasi filial tanlamaydi |
| LA-05 | high | Izolyatsiya | Recall create skips the cross-tenant patientId check, and the recall worker's admin join sends SMS to another tenant's patient (patient name and phone read from tenant B) |
| LA-06 | high | Izolyatsiya | Bare-/api modules' app.use('*', rlsMiddleware) leaks onto /api/*, so clinical and patient-images requests open 2-4 nested transactions on separate pool connections (pool exhaustion and deadlock) |
| LA-07 | medium | Bron | Faol->faol o'tish (scheduled->confirmed/in_progress) ham ish-soati/time-off bilan qayta tekshiriladi: Kelaman tugmasi va navbat->yozilish sync jimgina yiqiladi |
| LA-08 | medium | Bron | Bot va yozilish ekrani filialga biriktirilmagan shifokorni taklif qiladi (P10 fallback assignment tekshirmaydi); create() ham tekshirmaydi |
| LA-09 | medium | Bron | Telegram 'Boshqa vaqt': yangi yozilish ESKISI bekor qilinishidan oldin yaratiladi — recall qayta ochiladi va bemor eski yozilish bilan to'qnashadi |
| LA-10 | medium | Bron | 'Faol' no_show sweep ulanmagan: kelmagan bemorlar hech qachon avtomatik strike olmaydi |
| LA-11 | medium | Ombor | UI'da 'Inventarizatsiya' (adjustment) set-to-value ekani ko'rsatilmaydi va 0 ga tushirib bo'lmaydi |
| LA-12 | medium | Ombor | Ko'p filialli tenantda BOM avto-chiqimi filialni hisobga olmaydi (filial itemlari noto'g'ri sarflanadi) |
| LA-13 | medium | Lab | Klinikada bekor qilingan Hub buyurtma Hub'ga yetmaydi; bekor qilingan buyurtmaga ham narx tasdiqlanib xarajat yoziladi |
| LA-14 | medium | Litsenziya | Tiklash uploads yoki migratsiya bosqichida yiqilsa baza eski zaxirada qoladi, natija esa 'failed' deb ko'rsatiladi; API eski sxemali bazada qayta ishga tushadi |
| LA-15 | medium | Xabarlar | Muvaffaqiyatsiz boshlangan bot qayta yuklanmaydi: Telegraf.stop() 'Bot is not running!' otadi |
| LA-16 | medium | Pul | Vizit orqali POS to'lovida doktorga komissiya yozilmaydi va daromad doktorga bog'lanmaydi |
| LA-17 | medium | Pul | /api/reports/pnl'da reportBranchScope yo'q: filial menejeri boshqa filial va butun klinika moliyasini ko'radi |
| LA-18 | medium | Pul | Payroll draft snapshot'idan keyin davr ichida yozilgan to'lov va refund finalize'da yo'qoladi |
| LA-19 | medium | Pul | Debt-aging qarz yoshini eng eski (allaqachon to'langan) bosqich yoki tranzaksiyadan hisoblaydi |
| LA-20 | medium | Pul | Kassa filial doirasini tekshirmaydi: istalgan filial nomidan to'lov, refund va kunlik xulosa |
| LA-21 | medium | Ruxsatlar | Filial mudiri (Branch Manager) taklif orqali butun klinikaga tegishli (branchId=null) tayinlov yarata oladi: filial doirasi eskalatsiyasi, IR-06 aylanib o'tiladi |
| LA-22 | medium | Ruxsatlar | Filial doirasi faqat hisobotlarda majburlanadi: kassa/kunlik xulosa endpoint'lari har qanday branchId'ni qabul qiladi, shuning uchun IR-06 operatsion endpoint'lar orqali aylanib o'tiladi |
| LA-23 | medium | Davolash | Reja 'completed' tugmasi bajarilmagan qabul qilingan bosqichlarni tekshirmaydi va ularni qaytarib bo'lmas qarzga qulflaydi |
| LA-24 | medium | Davolash | Plan qabul qilinganda bosqichlar acceptance='accepted' bo'lmaydi, lekin bosqich baribir bajarilib 'completed' bo'ladi — bajarilgan ish hisoblanmaydi |
| LA-25 | medium | Davolash | Bajarilgan bosqich qarzi keyin acceptance o'zgartirish yoki planni bekor qilish bilan o'chib ketadi |
| LA-26 | medium | Davolash | Vizit POS va plan-bosqich qarzi bir xil ishni ikki marta hisoblashi mumkin |
| LA-27 | medium | Davolash | Odontogramma ↔ bosqich sinxroni (recordStageCompletion) web'dan erishib bo'lmaydi: resultingToothState hech qachon o'rnatilmaydi |
| LA-28 | medium | Davolash | Dori↔allergiya tekshiruvi fail-open va faqat bitta UI yo'lida; serverda umuman yo'q |
| LA-29 | medium | Davolash | Bosqich 'completed' qoralama (imzolanmagan) vizit yozuvi saqlanishi bilan terminal bo'ladi; ko'p-vizitli bosqich birinchi vizitdayoq yopiladi |
| LA-30 | medium | Davolash | Rejasiz davolash: imzolangan lekin to'lanmagan vizit ertasi kuni kassa 'kutilayotgan' ro'yxatidan yo'qoladi |
| LA-31 | low | Bron | Bron so'rovi 'qotib qolishi': o'tib ketgan/band slot uchun faqat Rad etish mumkin; web doktor/vaqt almashtirishni yubormaydi; bemor muddat tugashidan xabar topmaydi |
| LA-32 | low | Ombor | Vizit tahririda qaytarish JORIY BOM bo'yicha hisoblanadi, haqiqiy chiqim movement'lari bo'yicha emas (ombor drifti) |
| LA-33 | low | Ombor | Imzolangan vizit yozuvi / bekor qilingan yozilish uchun ombor chiqimini qaytarish yo'li yo'q |
| LA-34 | low | Izolyatsiya | Appointment create/update does not check that doctorId/patientId belong to the tenant; the global (tenant_id-free) EXCLUDE constraints let tenant A block tenant B's bookings |

## Tasdiqlangan topilmalar

### LA-01 [high] needsVendor holatida aktivatsiya formasi butunlay yashiriladi, vendor prepare-reinstall'dan keyin ham u yo'qolmaydi: o'sha kompyuterda baza yo'qolsa mahsulot ichida tiklanish yo'q (C1 qaytadi)

- **Oqim:** Litsenziya · auditor `high` → refuter `high`
- **Invariant:** I1
- **Scenariy:** Server PC'da Postgres klasteri buziladi yoki postgres\data o'chiriladi, C:\ProgramData\DentalService\license.lic esa qoladi. Desktop start -> bootstrap {hasLicense:true, hasTenant:false} -> /activate «ta'minotchiga murojaat qiling» matnini ko'rsatadi. Vendor «Qayta o'rnatishga tayyorlash»ni bosib, telefon + vaqtinchalik parolni beradi. Mijoz sahifani qayta ochadi: .lic hamon o'qiladi (imzo va fingerprint o'sha mashinaniki), tenant yo'q -> yana needsVendor, kalit kiritish formasi yo'q. Heartbeat NOT_ACTIVATED oladi va .lic'ni saqlab qoladi. Klinika ProgramData'dagi .lic faylini qo'lda o'chirmaguncha yoki POST /api/activate'ni curl bilan chaqirmaguncha ishlay olmaydi. Yangi kompyuterda (.lic yo'q) bu oqim ishlaydi, eski mashinada esa yo'q.
- **Dalil:**
  - apps/web/src/features/auth/pages/activate.page.tsx:72 — `const needsVendor = bootstrap.data?.hasLicense === true && bootstrap.data?.hasTenant === false;` va :122-130 — needsVendor bo'lsa faqat matn chiqadi, forma/tugma render qilinmaydi (activate.page.test.tsx:176-179 buni qulflaydi)
  - apps/api/src/routes/bootstrap-status.ts:54-57 — `hasLicense: lic !== null` faqat lokal .lic'ni o'qiydi; vendor amali lokal holatni o'zgartirmaydi
  - apps/supervisor-api/src/modules/licenses/licenses.service.ts:300-311 — prepareReinstall faqat Supervisor bazasida parol + `fingerprint: null` yozadi
  - apps/api/src/lib/license-heartbeat-scheduler.ts:68-78 — heartbeat NOT_ACTIVATED (fingerprint NULL) olganda `.lic` tegilmaydi, faqat INVALID_KEY'da o'chiriladi
- **Tuzatish yo'nalishi:** In the needsVendor state on activate.page.tsx, add a "Ta'minotchi tayyorladi — kalitni kiriting" button below the vendor text that reveals the existing activation form. The server already accepts activation over an existing .lic and provisions when the tenant table is empty. Update activate.page.test.tsx to match.

### LA-02 [high] Anketa qoralamasi faqat yoziladi — API ham, web ham o'qimaydi (shifokor hech qachon ko'rmaydi)

- **Oqim:** Xabarlar · auditor `high` → refuter `high`
- **Invariant:** Bot orqali yig'ilgan ma'lumot (allergiya, surunkali kasallik, dorilar) shifokorga ko'rinishi va 'Anamnezni tasdiqlash'da ko'chirilishi mumkin bo'lishi kerak
- **Scenariy:** Bemor botda 5 savolga javob beradi: 'penitsillinga allergiya'. Javob DB'ga tushadi, lekin tibbiy karta endpoint'i uni qaytarmaydi va MedicalTab'da ko'rsatish yo'q. Shifokor/registrator javobni hech qachon ko'rmaydi, bemor esa 'anketa topshirildi' deb o'ylaydi → allergiya haqidagi xavfsizlik ma'lumoti yo'qoladi (drug-allergy tekshiruvi faqat qo'lda kiritilgan allergies'ga qaraydi). Qayta topshirilsa oldingi javoblar jimgina ustiga yoziladi.
- **Dalil:**
  - `apps/api/src/lib/telegram/questionnaire.ts:47-52 questionnaireAnswers/questionnaireAt yoziladi (izoh: 'shifokor ... o'zi ko'chiradi')`
  - `apps/api/src/modules/patients/patients.schema.ts:249-267 medicalRecordDtoSchema va patients.mapper.ts:127-143 toMedicalRecordDto'da questionnaire* maydonlari YO'Q`
  - `grep 'questionnaire' apps/web/src, packages/api-client — natija 0 (faqat bot kodi, schema va test)`
  - `docs/FINDINGS-REGISTER FU-35…38 da bu qayd etilmagan (FU-36 faqat audit)`
- **Tuzatish yo'nalishi:** `medicalRecordDtoSchema` va mapper'ga `questionnaireAnswers` / `questionnaireAt`ni qo'shing, MedicalTab'da «Bemor anketasi (qoralama)» bloki va «tibbiy kartaga ko'chirish» tugmasini yarating (yoki confirm endpoint'ini javoblarni allergiya, surunkali kasallik va dorilar maydonlariga ko'chiradigan qilib kengaytiring). Qayta topshirishda eski javoblarni ustiga yozmaslik uchun tarix saqlang yoki shifokorni ogohlantiring.

### LA-03 [high] Rejadagi bosqichga bog'langan vizit kassada «kutilayotgan vizit» sifatida ham chiqadi, shuning uchun bemordan ikki marta pul olinadi

- **Oqim:** Pul · auditor `high` → refuter `high`
- **Invariant:** I1: bitta bajarilgan ish bir marta undiriladi
- **Scenariy:** 1) Doktor 'Plomba 36' bosqichi (cost 500 000, plan accepted) bo'yicha vizit ochadi, 'Plomba' xizmatini belgilaydi, radioda shu bosqichni tanlaydi va imzolaydi. Bosqich completed bo'ladi. 2) Kassir 'Kutilayotgan vizitlar'da vizitni ko'radi va 500 000 ni POS orqali oladi (non-plan tx, treatmentPlanId=null). 3) Bosqichga allocation yo'q, shuning uchun reja balansida 500 000 qarz qoladi, debt-aging va «Qarzdorlar»da bemor qarzdor ko'rinadi. 4) Registrator reja bo'yicha yana 500 000 oladi. Natija: bemor ikki marta to'laydi, nonPlan tx esa hech qayerda reja bilan bog'lanmaydi.
- **Dalil:**
  - apps/api/src/modules/cashier/cashier.service.ts:664-671 — pending-visits filtri: `isNotNull(visitNotes.signedAt) ... array_length(performedServices)>0 ... NOT EXISTS (cashier_transactions ct WHERE ct.visit_note_id = ...)`; `visitNotes.stageId` umuman tekshirilmaydi
  - apps/api/src/modules/cashier/cashier.service.ts:348-381 — create() vizit yo'lida ham stageId tekshirilmaydi, to'lov `treatmentPlanId: null` bilan yoziladi (P7 :332-333)
  - packages/db-schema/src/tables/visit-notes.ts:44,56 — bitta yozuvda bir vaqtda `stageId` ham, `performedServices` ham bo'ladi
  - `apps/web/src/features/clinical/components/visit-notes/VisitNotePage.tsx:467-475 (xizmatlar MultiSelect, narx va «Jami») va :575-605 (reja bosqichi radiosi) — ikkalasi bitta formada`
- **Tuzatish yo'nalishi:** The smallest fix is in the cashier: in `listPendingVisits`, exclude (or flag) visits with `visitNotes.stageId IS NOT NULL`, and in the `create()` visit path, either reject a visit that has a stageId or route its payment as an allocation to that stage instead of the non-plan items path.

### LA-04 [high] Klinika miqyosidagi (branchId=null) egasi bo'lmagan xodim UI'da eng eski filialga qulflanib qoladi: filial almashtirib bo'lmaydi, yozilish ustasi filial tanlamaydi

- **Oqim:** Ruxsatlar · auditor `high` → refuter `high`
- **Invariant:** I3: faol tayinlovi bor har filialda xodim UI orqali ishlay olishi va yozuv to'g'ri filialga tushishi kerak
- **Scenariy:** Klinikada 2 filial bor (A eski, B yangi). Owner Tenant Admin'ni (yoki Receptionist'ni) 'Barcha filiallar' bilan taklif qiladi, bu standart holat. Xodim kiradi va workspace'ni tanlaydi: abid=A. Sidebar'da filial almashtirgich yo'q (branches=[]), /select-workspace'da faqat 'Barcha filiallar' bor, u yana A'ga olib boradi. Xodim B filialda ishlayapti: Bugun/Navbat/Kassa standart ko'rinishi A ni ko'rsatadi. /appointments/new ustasi filial selektorini ko'rsatmaydi va yozilishni A filialga, A ish soatlari bo'yicha yaratadi. Natija: B bemorlari A kalendariga tushadi, B navbat/kunlik kassa ekranlari bo'sh. Davolash rejasi narxi (treatment-plans.service.ts:178-182 activeBranchId bo'yicha narx) ham A narxidan olinadi.
- **Dalil:**
  - apps/api/src/modules/auth/auth.service.ts:780-788: branchId berilmasa va assignedBranchId null bo'lsa `resolvedBranchId = first?.id` (eng eski filial)
  - apps/api/src/modules/auth/auth.service.ts:487-497 `allowAllBranches = asg.some((a) => a.branchId === null); const branchIds = [...].filter((b): b is string => b !== null)`: tenant-wide xodimga konkret filiallar ro'yxati BO'SH qaytadi
  - apps/web/src/shell/Sidebar.tsx:34 `totalChoices = (data?.branches.length ?? 0) + (data?.allowAllBranches ? 1 : 0)` = 1, :43 `if (!data || totalChoices <= 1 ...)`: filial menyusi umuman chiqmaydi
  - apps/web/src/features/auth/pages/select-workspace.page.tsx:260-262 `branchId: opt.branchId ?? undefined`: yagona variant 'Barcha filiallar', u branchId'siz yuboriladi
- **Tuzatish yo'nalishi:** workspaceBranches allowAllBranches=true bo'lgan xodimga ham klinikaning barcha o'chirilmagan filiallarini qaytarsin (egasidagi kabi), shunda Sidebar menyusi chiqadi. Yoki NewAppointmentWizard'da filial selektori klinika miqyosidagi foydalanuvchiga doim ko'rsatilsin (`needsBranchSelect = allowAllBranches || activeBranchId == null`).

### LA-05 [high] Recall create skips the cross-tenant patientId check, and the recall worker's admin join sends SMS to another tenant's patient (patient name and phone read from tenant B)

- **Oqim:** Izolyatsiya · auditor `critical` → refuter `high`
- **Invariant:** I3 + I4: a foreign ID in the body must be checked under RLS, and admin-connection joins must compare tenant_id
- **Scenariy:** A doctor or administrator works in both clinic A and clinic B. That is normal: users are platform-level and user_assignments spans several tenants. In B's workspace they see the patient UUID (URL /patients/<uuid>). They switch to A's workspace, where their role has recall.manage, and send POST /api/recalls {patientId: <B patient uuid>, dueDate: '<today>'}. The insert succeeds (the FK bypasses RLS), findById returns null, and the reply is 400 insert.failed. Because this is fail() 4xx, the tx COMMITS and the recall stays in A as a ghost row: A's list uses innerJoin, so the row is invisible and nobody can cancel it. At the next daily scan the worker reads B's patient fullName and phone over the admin connection and sends 'Hello <B patient>, time for a check-up at <clinic A>' through A's Eskiz/Telegram channel. This is a tenant-isolation break: B's PII is used under A's context, and A can 'poach' B's patients. recall_logs also reveal whether the patient has a phone: an outcome of 'no_phone' versus 'sent'. The same thing can happen through appointment completion: an appointment with B's patientId, then B4 creates a preventive recall automatically.
- **Dalil:**
  - apps/api/src/modules/recalls/recalls.service.ts:92-110 -- `const created = await repo.insert(c, { tenantId, patientId: input.patientId, ... assignedDoctorId: input.assignedDoctorId ?? null ...})` (no ownership/RLS SELECT; createOwnershipValidator is not used in this module)
  - apps/api/src/modules/recalls/recalls.repository.ts:81-86,69-77 -- `insert` then `findById` with `.innerJoin(patients, eq(patients.id, recalls.patientId))`: B's patient is hidden by RLS, so the result is null
  - apps/api/src/modules/recalls/recalls.routes.ts:117 -- `if (!created) return c.json(fail('insert.failed', 'insert.failed'), 400);` -> fail() 4xx -> rlsMiddleware COMMITS (rls.ts:52), so the recall row persists while the user sees an error
  - apps/api/src/lib/recall-worker.ts:80-103 -- `deps.adminDb.select({ patientName: patients.fullName, patientPhone: patients.phone, telegramChatId: patients.telegramChatId, integrationSettings: tenantSettings.integrationSettings ...}).from(recalls).innerJoin(patients, eq(patients.id, recalls.patientId)
- **Tuzatish yo'nalishi:** In recalls create, validate patientId (and treatmentPlanId/assignedDoctorId/branchId) under RLS with createOwnershipValidator before the insert and return 404 if it is foreign, and add eq(patients.tenantId, recalls.tenantId) to the worker's admin join (optionally also a composite (tenant_id, id) FK).

### LA-06 [high] Bare-/api modules' app.use('*', rlsMiddleware) leaks onto /api/*, so clinical and patient-images requests open 2-4 nested transactions on separate pool connections (pool exhaustion and deadlock)

- **Oqim:** Izolyatsiya · auditor `high` → refuter `high`
- **Invariant:** I1: one request = one tenant tx = one connection
- **Scenariy:** GET /api/treatment-plans passes expenses' auth + rls (txB, connection 1) and then clinical's auth + rls (txC, connection 2). GET /api/patients/{id}/images passes patients' rls (txA), expenses' (txB), clinical's (txC) and patient-images' (txD): 4 connections. Each outer tx stays 'idle in transaction' until the end of the request. The patient card loads tooth-charts/treatment-plans/visit-notes/images in parallel. On cloud, ~20 concurrent clinical requests at peak each hold their first connection and wait for the second. postgres.js puts them in a queue with no timeout, so the whole API (including /api/health and every tenant) hangs until a restart. On desktop it is worse: 20 - 3 reserved = 17 slots, while the API pool (20) and in-process workers share the same pool. With 5-6 clients opening patient cards at the same time, 'remaining connection slots are reserved' leads to 500s. Writes go to the innermost tx, so there is no correctness break; the problem is resources and hangs. Fix direction: in rlsMiddleware, `if (c.get('db') && c.get('afterCommit')) return next();` (reentrancy guard), or mount auth/rls once at the parent level.
- **Dalil:**
  - apps/api/src/app.ts:310,325,326 -- `app.route('/api', expensesRoutes(...)); app.route('/api', clinicalRoutes(...)); app.route('/api', patientImagesRoutes(...));`
  - apps/api/src/modules/expenses/expenses.routes.ts:52-53 -- `app.use('*', authMiddleware()); app.use('*', rlsMiddleware(deps.db));` (mounted under /api, so it becomes /api/*)
  - apps/api/src/modules/clinical/clinical.routes.ts:72-73 and patient-images.routes.ts:63-64 -- the same `app.use('*', rlsMiddleware(deps.db))`; patients.routes.ts:94 -- `/api/patients/*` also matches /api/patients/{id}/images and /tooth-charts
  - apps/api/src/modules/clinical/clinical.routes.ts:45-50 -- the codebase's own runtime probe comment: "A bare `app.use('*', ...)` here flattens to `/api/*` in the composed router and bleeds onto every OTHER route group mounted after this one"
- **Tuzatish yo'nalishi:** rlsMiddleware ichida qayta kirishga qarshi guard qo'shish: c.get('afterCommit') allaqachon o'rnatilgan bo'lsa, yangi tranzaksiya ochmasdan next() ga o'tish (tenantId bir xil). Muqobil yo'l: auth/rls'ni bare-`/api` modullaridan olib, ota darajada bir marta mount qilish.

### LA-07 [medium] Faol->faol o'tish (scheduled->confirmed/in_progress) ham ish-soati/time-off bilan qayta tekshiriladi: Kelaman tugmasi va navbat->yozilish sync jimgina yiqiladi

- **Oqim:** Bron · auditor `medium` → refuter `medium`
- **Invariant:** Holat o'tishi vaqt/doktor o'zgarmasa jadval tekshiruvini talab qilmasligi kerak (qayta tekshiruv faqat cancelled/no_show -> faol uchun mo'ljallangan)
- **Scenariy:** Registrator shifokorga ertangi kunga 3 ta yozilish qo'yadi. Keyin shifokorga ertaga uchun time-off (yoki ish soati o'zgarishi) kiritiladi — mavjud yozilishlar tegilmaydi. (1) Bemor Telegram eslatmasida 'Kelaman' bosadi -> update(confirmed) schedule.doctor_on_time_off qaytaradi -> bemorga 'already' (noto'g'ri xabar), status scheduled'da qoladi. (2) Registrator kalendarda 'Tasdiqlandi' bossa 409. (3) Kun kelganda shifokor navbatdan bemorni chaqiradi (call-own/PATCH in_progress): ticket in_progress bo'ladi, yozilish scheduled'da qoladi; 'done'da scheduled->completed taqiqlangani uchun yozilish hech qachon completed bo'lmaydi (recall/preventive, hisobotlar, kassa bog'lanishi buziladi). Faqat appointmentSyncError toast chiqadi.
- **Dalil:**
  - apps/api/src/modules/appointments/appointments.service.ts:386-412: `if (timeOrDoctorChanged || (targetActive && beforeStatus !== targetStatus)) { ... checkConflict ... checkSchedule(c, doctor, branch, start, end) -> return { ok:false, code:'schedule.doctor_on_time_off' } }` — scheduled->confirmed/in
  - apps/api/src/lib/telegram/reminder-actions.ts:74-75: `const res = await deps.appointments.update(c, row.id, { status: 'confirmed' }); return { outcome: res.ok ? 'confirmed' : 'already', ...base };`
  - apps/api/src/modules/queue/queue.service.ts:230-245: in_progress update natijasi (`{ok:false}`) tekshirilmaydi, so'ng completed'ga scheduled->completed urinishi AppointmentTransitionError beradi -> faqat syncError
  - `apps/api/src/modules/schedule/schedule.service.ts:84-113 createTimeOff mavjud yozilishlarni tekshirmaydi (SC-20)`
- **Tuzatish yo'nalishi:** appointments.service.ts:389 shartini `timeOrDoctorChanged || (targetActive && !isActiveStatus(beforeStatus))` ga o'zgartirish (faqat cancelled/no_show -> faol qayta tekshirilsin), shuningdek reminder-actions.ts va queue.service.ts dagi {ok:false} natijalarni ochiq ishlash.

### LA-08 [medium] Bot va yozilish ekrani filialga biriktirilmagan shifokorni taklif qiladi (P10 fallback assignment tekshirmaydi); create() ham tekshirmaydi

- **Oqim:** Bron · auditor `medium` → refuter `medium`
- **Invariant:** Bron faqat shu filialda ishlaydigan (assignment bor) shifokorga
- **Scenariy:** Klinikada 2 filial. Dr. A faqat A filialga assign qilingan va faqat A filialda jadvali bor. Bemor botda B filialni tanlaydi -> doktorlar ro'yxatida Dr. A ham chiqadi, 'har qanday doktor' tanlansa B filial ish soatida (09-18) Dr. A slotlari ko'rinadi. So'rov yuboriladi, registrator 'Tasdiqlash' bosadi: isWithinWorkingHours ham o'sha fallback tufayli o'tadi -> Dr. A uchun B filialda yozilish yaratiladi, Dr. A u yerda emas. Aynan shu yo'l web NewAppointmentWizard (useDoctors + getAvailability) uchun ham ochiq.
- **Dalil:**
  - apps/api/src/lib/telegram/booking.ts:90: `s.doctors = await deps.appointments.listDoctors(c);` (tenant bo'yicha barcha is_practitioner, filtrsiz)
  - `apps/api/src/modules/appointments/appointments.service.ts:587-605 listDoctors: faqat isActive+acceptedAt+isPractitioner, branch yo'q`
  - apps/api/src/modules/schedule/schedule.service.ts:138-151 segmentsForDay: shu filialda jadvali yo'q bo'lsa butun kun segmenti (`startMinute:0,endMinute:1440`) — doctor shu filialga assign qilinganmi, tekshirilmaydi (getBranchAvailability esa assignment bilan filtrlaydi: schedule.repository.ts:207-23
  - `apps/api/src/modules/appointments/appointments.service.ts:270-303 create(): doctorId/branchId mosligi tekshirilmaydi`
- **Tuzatish yo'nalishi:** Doktor-filial moslik tekshiruvini bitta umumiy helperda yarating (user_assignments: isActive, acceptedAt, branchId IS NULL yoki = branchId, isPractitioner) va uni listDoctors(branchId) filtri hamda segmentsForDay fallback'i va create()/update() ichida (checkSchedule yonida, masalan 'schedule.doctor_not_in_branch') qo'llang. Bot va wizard doktor ro'yxatini tanlangan filial bo'yicha so'rasin.

### LA-09 [medium] Telegram 'Boshqa vaqt': yangi yozilish ESKISI bekor qilinishidan oldin yaratiladi — recall qayta ochiladi va bemor eski yozilish bilan to'qnashadi

- **Oqim:** Bron · auditor `medium` → refuter `medium`
- **Invariant:** Ko'chirilgan bemorning bitta faol yozilishi + recall faqat bitta joyda yopiq; ko'chirish atomik
- **Scenariy:** Bemorning 15-dekabr 10:00 yozilishi bor va u recall'ni yopgan (scheduled, eski appt'ga bog'langan). Bemor eslatmada 'Boshqa vaqt' -> 16-dekabr slotini tanlaydi. Registrator tasdiqlaydi: yangi appt yaratiladi (closeOpenOnRebook ochiq recall topmaydi), keyin eski appt bekor qilinadi -> reopenOnCancel recall'ni pending'ga qaytaradi. Bemor allaqachon yozilgan, lekin dashboard/recall ro'yxatida 'bog'lanish kerak' bo'lib qoladi va recall xabari ketishi mumkin. Bundan tashqari ko'chirish eski bilan vaqt jihatdan kesishsa (boshqa shifokor, 10:15) conflict.patient_busy 409 — so'rov pending'da qotadi.
- **Dalil:**
  - apps/api/src/modules/booking-requests/booking-requests.service.ts:75-103: avval `deps.appointments.create(...)`, keyin `deps.appointments.update(c, row.rescheduleOfAppointmentId, {status:'cancelled', ...})`
  - apps/api/src/modules/appointments/appointments.service.ts:462-468: cancelled bo'lganda `recall.reopenOnCancel(c, id)` — eski yozilish yopgan scheduled recall pending'ga qaytadi
  - `apps/api/src/modules/recalls/recalls.service.ts:281-295 reopenOnCancel faqat eski appointmentId bo'yicha; yangi yozilish uni qayta bog'lamaydi`
  - `apps/api/src/modules/appointments/appointments.service.ts:295-298 checkPatientConflict yangi slotni ESKI (hali faol) yozilish bilan solishtiradi`
- **Tuzatish yo'nalishi:** confirm()da `rescheduleOfAppointmentId` bo'lsa eski yozilishni create'dan OLDIN bekor qilish (yoki create'ga eski id'ni `excludeId` sifatida berib checkPatientConflict'dan chiqarish), va reopenOnCancel o'rniga eski yozilish yopgan recall'ni yangi yozilishga qayta bog'lash (scheduledAppointmentId = yangi id).

### LA-10 [medium] 'Faol' no_show sweep ulanmagan: kelmagan bemorlar hech qachon avtomatik strike olmaydi

- **Oqim:** Bron · auditor `medium` → refuter `medium`
- **Invariant:** Kelmagan yozilish no_show bo'lib strike yoziladi (CLI-474/483 mo'ljali)
- **Scenariy:** Bemor yozilgan, kelmaydi, ticket ham olmaydi. Registrator kalendarda qo'lda 'Kelmadi' bosmasa yozilish abadiy scheduled/confirmed qoladi: strike yozilmaydi, noShowRate past, recall reopen bo'lmaydi, kechagi waiting ticket'lar missed bo'lmaydi. Strike tizimi faqat qo'l mehnatiga bog'liq.
- **Dalil:**
  - `apps/api/src/modules/queue/queue.service.ts:413-465 sweepNoShows mavjud, lekin hech qayerda chaqirilmaydi (faqat queue.routes.ts:268 route; web/cron yo'q)`
  - `docs/FINDINGS-REGISTER-2026-11-11.md:132 SC-11 — ochiq (📄)`
- **Tuzatish yo'nalishi:** Kunlik sweep'ni ulash: recall-scheduler.ts uslubida BullMQ repeatable job (yoki in-process setInterval) qo'shib, har tenant uchun withTenant kontekstida `sweepNoShows` ni Toshkent vaqti bilan kun oxirida chaqirish. Ishga tushirishni index.ts va worker.ts da RUN_REMINDER_WORKER gating bilan qilish.

### LA-11 [medium] UI'da 'Inventarizatsiya' (adjustment) set-to-value ekani ko'rsatilmaydi va 0 ga tushirib bo'lmaydi

- **Oqim:** Ombor · auditor `medium` → refuter `medium`
- **Invariant:** INV5: adjustment = set-to-value; UI va API ma'nosi mos bo'lishi shart
- **Scenariy:** Ombor menejeri anestetikdan 120 ta bor, 5 tasi singanini yozmoqchi: 'Inventarizatsiya' tanlab 5 kiritadi (delta deb o'ylaydi). Backend qoldiqni 120 -> 5 ga o'rnatadi (ledgerga -115), 'Kam qoldi' ogohlantirishi chiqadi; hech qanday tasdiq yo'q. Aksincha, sanoqda hammasi tugagan bo'lsa 0 kiritib saqlab bo'lmaydi (client validatsiyasi positive) - menejer 'out' bilan aylanib o'tadi.
- **Dalil:**
  - apps/web/src/features/stock/components/MovementFormModal.tsx:~73 `<NumberInput label={t('stock.quantity')} min={0} ...>` — tur adjustment bo'lsa ham yorliq 'Miqdor'
  - packages/i18n/src/locales/uz.json:1509 `"counted_qty": "Aniqlangan qoldiq"` — kalit mavjud, lekin web'da hech qayerda ishlatilmaydi (grep bo'sh) — uxlab yotgan matn
  - apps/web/src/features/stock/stock.schema.ts:22 `quantity: z.coerce.number().positive()` — backend esa adjustment uchun 0 ni ruxsat beradi (apps/api/src/modules/stock/stock.schema.ts:24-37, stock.calc.ts:26)
  - `MovementFormModal.tsx: formada joriy qoldiq ko'rsatilmaydi, boshlang'ich qiymat 1`
- **Tuzatish yo'nalishi:** MovementFormModal'da type==='adjustment' bo'lsa yorliqni t('stock.counted_qty') qiling, joriy qoldiqni ko'rsating (boshlang'ich qiymat = item.quantity), web movementFormSchema'da quantity'ni adjustment uchun nonnegative qiling (superRefine, API bilan bir xil) va ixtiyoriy ravishda katta pasayishda tasdiq so'rang.

### LA-12 [medium] Ko'p filialli tenantda BOM avto-chiqimi filialni hisobga olmaydi (filial itemlari noto'g'ri sarflanadi)

- **Oqim:** Ombor · auditor `medium` → refuter `medium`
- **Invariant:** INV6: filial itemi shu filial vizitida sarflanadi
- **Scenariy:** Tenantda Filial A va B, har birida o'z 'Lidokain' itemi (branchId=A/B). BOM xizmat->Lidokain(A). B filialdagi doktor shu xizmatni yozadi: chiqim A itemidan ketadi, B ombori hech qachon kamaymaydi, B uchun low-stock/'necha kunga yetadi' yolg'on, A filial menejeriga ogohlantirish ketadi. Yagona to'g'ri sozlama - tenant-darajali (branchId=null) item, lekin filial bo'yicha qoldiq UI ko'rsatilgan.
- **Dalil:**
  - `apps/api/src/modules/stock/stock.service.ts:436-439 BOM tanlovi faqat serviceId bo'yicha; filial/vizit filiali ishlatilmaydi`
  - packages/db-schema/src/tables/service-materials.ts:~22 `unique('service_materials_unique').on(t.serviceId, t.itemId)` — BOM tenant-darajali, filialga bog'lanmagan
  - packages/db-schema/src/tables/stock-items.ts: `branchId` bor (filial itemi); visit_notes jadvalida branch_id yo'q
- **Tuzatish yo'nalishi:** BOM tanlovida vizit filialini hisobga ol: `service_materials`ga ixtiyoriy branch_id qo'sh (yoki item nomi bo'yicha filialga mos itemni tanla), `deductForServices`/`reconcileForServices`da `activeBranchId` bo'yicha item tanla (branchId=null item fallback), `createBom`da item filialini tekshir.

### LA-13 [medium] Klinikada bekor qilingan Hub buyurtma Hub'ga yetmaydi; bekor qilingan buyurtmaga ham narx tasdiqlanib xarajat yoziladi

- **Oqim:** Lab · auditor `medium` → refuter `medium`
- **Invariant:** Klinika holati = Hub holati; bekor qilingan ishga pul xarajati yozilmaydi; muddati o'tgan ish PHI'si saqlash qoidasi (L9) bo'yicha o'chadi
- **Scenariy:** Shifokor (lab_order.manage) Hub'ga yuborilgan buyurtmani status select orqali 'cancelled' qiladi (UI shuni ruxsat etadi: LabOrdersTab/LabOrderDetailPage allowedLabOrderStatuses). Hub'da ish 'sent'/'accepted' bo'lib qoladi, lab ishlashni davom ettiradi va narx taklif qiladi. Poll 'price_proposed' cancelled buyurtmaga ham proposedPrice yozadi (sync.ts applyEvent, approvedPrice tekshiruvi xolos); LabOrderHubPanel `proposed && canApprovePrice` bo'lsa 'Tasdiqlash' tugmasini ko'rsatadi (status tekshirilmaydi). Shifokor bosadi -> Hub approved_price oladi (lab akt-sverkasiga tushadi) va klinika expenses'ga 'Laboratoriya' xarajati yoziladi. Shuningdek bekor qilingan ishning bemor ismi/fayllari Hub'da 12 oydan keyin ham o'chmaydi.
- **Dalil:**
  - `apps/api/src/modules/lab-orders/lab-orders.service.ts:199-264 update(): before.labHubCaseRef bo'lganda faqat 'delivered' va 'upsert_case' op navbatga qo'yiladi; status='cancelled' uchun hech qanday op/guard yo'q`
  - `apps/lab-hub-api/src: 'cancel' so'zi umuman yo'q (grep bo'sh) — Hub'da bekor qilish holati/endpointi mavjud emas`
  - `apps/api/src/modules/lab-orders/lab-orders.hub.ts:132-139 approvePrice(): faqat labHubCaseRef va proposedPrice tekshiriladi, order.status tekshirilmaydi`
  - apps/api/src/lib/lab-hub/price.ts:64-66 bookHubConfirmedPrice(): `if (!order || order.approvedPrice != null) return` — status tekshiruvi yo'q
- **Tuzatish yo'nalishi:** Klinika update()da status='cancelled' bo'lganda Hub'ga 'cancel' op yuborish va Hub'da cancelled holati (+ retention'ga qo'shish) qo'shish; approvePrice/bookHubConfirmedPrice/price_proposed'da order.status==='cancelled' bo'lsa rad etish va panelda Tasdiqlash tugmasini yashirish.

### LA-14 [medium] Tiklash uploads yoki migratsiya bosqichida yiqilsa baza eski zaxirada qoladi, natija esa 'failed' deb ko'rsatiladi; API eski sxemali bazada qayta ishga tushadi

- **Oqim:** Litsenziya · auditor `high` → refuter `medium`
- **Invariant:** I2
- **Scenariy:** Owner Sozlamalar -> Zaxira orqali bir oy oldingi nusxani tiklaydi. pg_restore muvaffaqiyatli o'tadi (joriy ma'lumotlar o'chadi), keyin tar extract yiqiladi (disk to'lgan yoki antivirus) yoki migratsiya yiqiladi (masalan, eski nusxadagi takroriy telefonlar 0043'da qonuniy to'xtaydi). Natijada restore-result 'failed', lastError «tiklash muvaffaqiyatsiz». API esa baza eski nusxada turgan holda qayta yonadi. Migratsiya yiqilgan bo'lsa API eski sxemada ishlaydi, keyingi qayta yonishda esa «Ma'lumotlarni qaytarib bo'lmadi» bilan yopiladi. Uploads yiqilgan bo'lsa xodimlar «tiklash bo'lmadi» deb o'ylab bir oy eskirgan bazada ishlashni davom ettiradi: oxirgi oydagi to'lovlar va vizitlar ko'rinmaydi. Ular faqat dental-<pre-restore> papkasida qoladi va buni hech kim aytmaydi. Keyin bu nusxa qaytarilsa, oradagi yangi yozuvlar yo'qoladi.
- **Dalil:**
  - apps/desktop/src/backup-scheduler.ts:228-242 — pre-restore'ga qaytish (rollback) FAQAT `deps.restoreDb(dbFile)` throw qilganda bajariladi
  - apps/desktop/src/backup-scheduler.ts:243-249 — `deps.extractUploads(uploadsFile)` va `deps.migrate()` DB allaqachon almashtirilgandan KEYIN chaqiriladi; ular uchun rollback yo'q
  - apps/desktop/src/backup-scheduler.ts:250-253 — catch faqat `writeState({ lastError: `tiklash muvaffaqiyatsiz (...)` })` yozadi
  - apps/desktop/src/backup-scheduler.ts:261-263 — finally `deps.startApi()` ni baribir chaqiradi
- **Tuzatish yo'nalishi:** performRestore'da restoreDb muvaffaqiyatli o'tgandan keyin extractUploads va migrate'ni ham rollback qamroviga olish (yiqilsa pre-restore db.dump'ga qaytarish va xatoda «baza avvalgi holatga qaytarildi / qaytarilmadi» deb aniq yozish), yoki faqat uploads yiqilganda natijani «baza tiklandi, fayllar tiklanmadi» deb farqlash.

### LA-15 [medium] Muvaffaqiyatsiz boshlangan bot qayta yuklanmaydi: Telegraf.stop() 'Bot is not running!' otadi

- **Oqim:** Xabarlar · auditor `high` → refuter `medium`
- **Invariant:** Har qanday launch holatidan (muvaffaqiyatsiz ham) reload yangi tokenni ishga tushira olishi kerak
- **Scenariy:** Owner Sozlamalar→Integratsiyalar'da botToken'ni xato kiritadi (yoki desktop internetsiz yoqiladi). launch→getMe 401/tarmoq xatosi, 'bot launch failed' log, lekin bots map'da dead Telegraf qoladi. Owner to'g'ri token kiritadi → telegram:reload → reload() → stop() throw 'Bot is not running!' → `bots.delete` ham, readToken/launch ham bajarilmaydi ('bot reload failed' log). Bot jarayon qayta ishga tushirilmaguncha ishlamaydi (bulutda owner qayta ishga tushira olmaydi). stopAll() (:264) ham xuddi shu sabab bitta dead bot'da qolgan botlarni to'xtatmay va sub.quit() chaqirmay to'xtaydi.
- **Dalil:**
  - apps/api/src/lib/telegram-bot-manager.ts:209 `void bot.launch().catch(...)` va :210 `bots.set(tenantId, bot)` — launch rad etilsa ham bot map'da qoladi
  - apps/api/src/lib/telegram-bot-manager.ts:217 `bot.stop('reload')` — try/catch yo'q, :222 reload `await stop()` birinchi
  - node_modules/telegraf/lib/telegraf.js:217 `if (this.polling === undefined && this.webhookServer === undefined) throw new Error('Bot is not running!')`; launch() da getMe() polling o'rnatilishidan OLDIN (satr ~190) — noto'g'ri token/tarmoq yo'q bo'lsa polling hech qachon o'rnatilmaydi
- **Tuzatish yo'nalishi:** `stop()` va `stopAll()` da `bot.stop()` ni try/catch ichiga ol (yoki "running" holatini kuzat), `bots.delete` har holda bajarilsin. Launch rad etilganda `.catch` ichida `bots.delete(tenantId)` (faqat shu instance bo'lsa) qilinsin.

### LA-16 [medium] Vizit orqali POS to'lovida doktorga komissiya yozilmaydi va daromad doktorga bog'lanmaydi

- **Oqim:** Pul · auditor `high` → refuter `medium`
- **Invariant:** I2: doktor tushumi payroll komissiyasiga tushadi
- **Scenariy:** Davolash rejasisiz ishlaydigan klinika (kichik klinikalarda keng tarqalgan): doktor (commissionPercent=30) bir oy davomida 20 ta vizitni imzolaydi, kassa ularni 'Kutilayotgan vizitlar'dan 10 000 000 ga undiradi. Oy oxirida createRun: attributedRevenue=0, komissiya=0. Owner «Bugun» ekranida doktor daromadi 0, hammasi 'tayinlanmagan'. Doktor 3 000 000 komissiyani olmaydi.
- **Dalil:**
  - apps/api/src/modules/payroll/payroll.service.ts:88-94 — `.innerJoin(treatmentPlans, eq(cashierTransactions.treatmentPlanId, treatmentPlans.id))`: komissiya faqat reja bilan bog'langan tx'dan hisoblanadi
  - apps/api/src/modules/cashier/cashier.service.ts:332-333,511 — vizit yo'li items rejimi, shuning uchun `treatmentPlanId` doim null (vizitning `doctorId`si ma'lum bo'lsa ham)
  - apps/api/src/modules/reports/reports.service.ts:306-319 (revenue.byDoctor) va :876-880 (ownerToday.doctors) — xuddi shu INNER JOIN, vizit tushumi `doctorId: null`ga tushadi
  - `apps/api/src/modules/cashier/cashier.service.ts:864-867 izohi faqat anonim erkin POS'ni nazarda tutadi; FX-handoff (vizit -> kassa) undan keyin qo'shilgan`
- **Tuzatish yo'nalishi:** Payroll createRun va reports byDoctor/doctorRev'da doktorni `COALESCE(treatment_plans.doctor_id, visit_notes.doctor_id)` sifatida oling (`cashier_transactions.visit_note_id` orqali LEFT JOIN), refund hook'idagi payrollDoctorId'ni ham shunga moslang, va bu Qaror #16 ni kengaytirish ekani uchun mahsulot tasdig'ini oling.

### LA-17 [medium] /api/reports/pnl'da reportBranchScope yo'q: filial menejeri boshqa filial va butun klinika moliyasini ko'radi

- **Oqim:** Pul · auditor `medium` → refuter `medium`
- **Invariant:** I4: hisobotda filial doirasi serverda majburlanadi (IR-06)
- **Scenariy:** Branch Manager faqat A filialiga tayinlangan (report.view). 1) `GET /api/reports/pnl?from=2026-11-01&to=2026-11-30&branchId=<B>` -> 200, B filialining tushumi va xarajati qaytadi (boshqa hisobotlarda 403 `report.branch_forbidden`). 2) branchId'siz chaqirilsa -> butun klinika tushumi, barcha filiallar va tenant-darajali xarajatlar hamda payroll jami. revenue/owner-today'da bu chaqiruvchi cheklangan bo'lgani uchun ekranlar bir-biriga zid raqam ko'rsatadi.
- **Dalil:**
  - apps/api/src/modules/reports/reports.routes.ts:215 — `middleware: [requirePermission('report.view')] as const` (boshqa hisobotlarda `reportBranchScope()` bor, masalan :50,:65,:159)
  - apps/api/src/modules/reports/reports.service.ts:198-201 scopeIds — `reportBranchIds` o'rnatilmasa so'ralgan `branchId` o'zgarishsiz ishlatiladi
  - apps/api/src/modules/reports/reports.service.ts:976-979 — xarajat filtri to'g'ridan-to'g'ri `range.branchId`dan, branchId yo'q bo'lsa butun tenant xarajati; :985-998 branchId yo'q bo'lsa butun tenant payroll'i
- **Tuzatish yo'nalishi:** /pnl middleware'iga `reportBranchScope({ tenantWide: true })` qo'shing (payroll filialga bog'lanmagani uchun), yoki `reportBranchScope()` qo'shib pnl()da xarajatni `scopeIds` bo'yicha filtrlang va scoped chaqiruvchi uchun payroll'ni o'tkazib yuboring.

### LA-18 [medium] Payroll draft snapshot'idan keyin davr ichida yozilgan to'lov va refund finalize'da yo'qoladi

- **Oqim:** Pul · auditor `medium` → refuter `medium`
- **Invariant:** I2/I3: har refund bir marta clawback qilinadi, davr ichidagi har to'lov komissiyaga kiradi
- **Scenariy:** Buxgalter 30-noyabr soat 15:00 da noyabr uchun draft run yaratadi (10-noyabrdagi 1 000 000 reja to'lovi kiradi, komissiya 30%=300 000). 30-noyabr 17:00 da shu to'lov to'liq refund qilinadi: finalized run yo'q, adjustment yozilmaydi. 1-dekabr noyabr run'i finalize qilinadi (300 000 bilan). Dekabr run'i refund'ni ko'rmaydi (createdAt noyabrda). Clawback abadiy yo'qoladi, doktorga 300 000 ortiqcha to'lanadi. Teskarisi: 17:00 dagi yangi to'lov ham hech qaysi run'ga kirmaydi va doktor kam oladi. MO-22 ga yaqin, lekin u boshqa holat (hech bir davr qamramagan bo'shliq).
- **Dalil:**
  - apps/api/src/modules/payroll/payroll.service.ts:88-115 — revenue faqat createRun paytida, `createdAt` [start,end) bo'yicha hisoblanadi, payroll_lines ga muzlatiladi
  - `apps/api/src/modules/payroll/payroll.service.ts:350-394 — finalizeRun faqat status'ni o'zgartiradi, snapshot'dan keyingi tx'larni qayta hisoblamaydi va ogohlantirmaydi`
  - apps/api/src/modules/payroll/payroll.service.ts:458-468 — recordRefundAdjustment faqat `status='finalized'` run'ni qidiradi: draft davrdagi to'lov refundi uchun adjustment yozilmaydi (`if (!run) return;`)
  - `apps/api/src/modules/payroll/payroll.schema.ts:5-15 — periodTo kelajakda bo'lishi taqiqlanmagan`
- **Tuzatish yo'nalishi:** finalizeRun ichida draft'ning davri uchun daromadni qayta hisoblab payroll_lines bilan solishtiring: farq bo'lsa finalize'ni rad eting (stale_snapshot) yoki avtomatik qayta hisoblang. Muqobil: recordRefundAdjustment draft run'ga tushgan refund uchun ham adjustment yozsin yoki draft'ni stale deb belgilasin.

### LA-19 [medium] Debt-aging qarz yoshini eng eski (allaqachon to'langan) bosqich yoki tranzaksiyadan hisoblaydi

- **Oqim:** Pul · auditor `medium` → refuter `medium`
- **Invariant:** I5: qarz yoshi joriy to'lanmagan qarzning yoshi
- **Scenariy:** Bemorning rejasi 150 kun oldin yaratilgan, 5 bosqichi 140 kun oldin bajarilib to'liq to'langan. Kecha shu rejaga 200 000 lik yangi bosqich qo'shildi va bajarildi (qarz 200 000). Rahbar bosh sahifasida bu 1 kunlik qarz '90+ kun' bucket'ida va over90Count'da chiqadi. Rahbar yangi qarzni eski deb qabul qiladi.
- **Dalil:**
  - apps/api/src/modules/reports/reports.service.ts:729 — `MIN(COALESCE(treatmentStages.completedAt, treatmentPlans.createdAt))` bemorning barcha qarzga kiruvchi bosqichlari bo'yicha, to'langanlik e'tiborga olinmaydi
  - apps/api/src/modules/reports/reports.service.ts:801 — `npAnchor` barcha non-plan to'lovlarning (to'liq to'langan yoki refund qilinganlari ham) eng eskisi
  - apps/api/src/modules/reports/reports.service.ts:815-817 — `anchor = Math.min(planAnchor, npAnchor)`, butun balans shu bucket'ga tushadi
- **Tuzatish yo'nalishi:** Langarni to'lanmagan qoldiq bo'yicha hisobla: bosqichlarni FIFO tartibida (completedAt/createdAt bo'yicha) allocation yig'indisi bilan yopib, birinchi to'liq yopilmagan bosqichning sanasini langar qil. Non-plan uchun ham faqat qoldig'i bor (total − paid + refund > 0) tranzaksiyalarning eng eskisini ol. Yoki balansni bucket'larga ulushlab bo'l.

### LA-20 [medium] Kassa filial doirasini tekshirmaydi: istalgan filial nomidan to'lov, refund va kunlik xulosa

- **Oqim:** Pul · auditor `medium` → refuter `medium`
- **Invariant:** I4: filialga tayinlangan kassir faqat o'z filiali kassasida ishlaydi
- **Scenariy:** Faqat A filialiga tayinlangan Receptionist (cashier.view, cashier.create_transaction): 1) `GET /api/cashier/daily-summary?branchId=<B>` bilan B kassasining kunlik summalarini ko'radi; 2) `POST /transactions {branchId: B, ...}` bilan B filiali narxida to'lov yozadi, natijada B ning kunlik kassasi va owner-today'dagi B tushumi soxta ko'payadi; 3) cashier.refund'i bo'lsa B ning tranzaksiyasini refund qiladi va B kassasida chiqim paydo bo'ladi. (Butun tizim bo'yicha dizayn bo'shlig'i bo'lishi mumkin, shuning uchun ishonch o'rtacha.)
- **Dalil:**
  - apps/api/src/modules/cashier/cashier.service.ts:509 — `branchId: input.branchId` (JWT `activeBranchId` bilan solishtirilmaydi; modulda `activeBranchId` umuman ishlatilmaydi)
  - `apps/api/src/modules/cashier/cashier.service.ts:757-761 — refund id bo'yicha, faqat RLS (tenant), filial tekshiruvi yo'q`
  - apps/api/src/modules/cashier/cashier.service.ts:908-931 va cashier.schema.ts:139-142 — daily-summary'da `branchId` erkin query parametri
  - apps/api/src/middleware/auth.ts:63 — `activeBranchId` kontekstga qo'yiladi, lekin cashier/require-permission uni ishlatmaydi
- **Tuzatish yo'nalishi:** Kassa route'larida (daily-summary, create transaction, pending-visits, refund original.branchId) so'ralgan/yozilayotgan branchId ni `report-scope.ts` naqshiga o'xshash tayinlangan filiallar ro'yxati (yoki JWT `abid`) bilan solishtirib, mos kelmasa 403 qaytar. Owner va tenant-wide tayinlov istisno.

### LA-21 [medium] Filial mudiri (Branch Manager) taklif orqali butun klinikaga tegishli (branchId=null) tayinlov yarata oladi: filial doirasi eskalatsiyasi, IR-06 aylanib o'tiladi

- **Oqim:** Ruxsatlar · auditor `high` → refuter `medium`
- **Invariant:** I1/I2: assertCanGrant faqat permission kodlarini tekshiradi, filial doirasini emas. Filialga biriktirilgan chaqiruvchi branchId=null (barcha filiallar) yoki boshqa filialga tayinlov bera oladi
- **Scenariy:** Owner A filialiga X'ni Branch Manager qilib tayinlagan (branchId=A). X Xodimlar sahifasida yangi telefon raqam (masalan, o'zining ikkinchi SIM'i yoki soxta +998900000001), rol = Branch Manager (yoki Accountant) bilan taklif yuboradi va filial chip'ini tegmaydi (standartda 'Barcha filiallar'). Javobda tempPassword qaytadi va accepted_at=now bo'ladi (yangi foydalanuvchi). X shu hisob bilan kiradi va parolni almashtiradi. Endi reportBranchScope kind='all' beradi, ya'ni debt-aging, pnl, owner-today va barcha filiallar daromadi ochiq. Birinchi qadamdagi 403 'report.branch_forbidden' himoyasi butunlay chetlab o'tiladi. Xuddi shunday, BM boshqa filialga (B) Receptionist/Accountant ham tayinlay oladi.
- **Dalil:**
  - apps/api/src/modules/users/users.service.ts:115 `assertCanGrant(callerPerms(c), (await loadRolePermissionCodes(dbContext, input.roleId)) ?? []);` (filial tekshiruvi yo'q)
  - `apps/api/src/modules/users/users.service.ts:117-123: faqat filial tenantda borligi tekshiriladi, chaqiruvchining filialiga tegishliligi tekshirilmaydi`
  - apps/api/src/modules/users/users.service.ts:230 `branchId: input.branchId ?? null,` va `acceptedAt: createdNow ? new Date() : null`
  - apps/web/src/features/settings/components/UsersSettingsScreen.tsx:77 `initialValues: { ..., branchId: '' }` va :332-334 `<Chip value="">{t('users.all_branches')}</Chip>`: 'Barcha filiallar' standart holatda tanlangan
- **Tuzatish yo'nalishi:** `invite`da (va `addAssignment`/`updateAssignment`da ham) owner bo'lmagan chaqiruvchi uchun shunday tekshiruv qo'shish kerak: berilayotgan `branchId` chaqiruvchining tenant-wide bo'lmagan faol tayinlov filiallari ichida bo'lsin, `branchId=null` esa faqat chaqiruvchida tenant-wide tayinlov bo'lsa ruxsat etilsin. Aks holda 403 `branch.escalation` qaytsin.

### LA-22 [medium] Filial doirasi faqat hisobotlarda majburlanadi: kassa/kunlik xulosa endpoint'lari har qanday branchId'ni qabul qiladi, shuning uchun IR-06 operatsion endpoint'lar orqali aylanib o'tiladi

- **Oqim:** Ruxsatlar · auditor `medium` → refuter `medium`
- **Invariant:** I2: filialga biriktirilgan xodim boshqa filial moliyasini ko'rmasligi kerak (IR-06 reports'da majburlangan, lekin bir xil ma'lumot boshqa yo'ldan ochiq)
- **Scenariy:** Accountant faqat A filialga tayinlangan. /reports'da B filialni so'rasa 403 'report.branch_forbidden' oladi (IR-06 ishlaydi). Lekin Kassa ekranida filial selektoridan B'ni tanlaydi yoki to'g'ridan-to'g'ri GET /api/cashier/daily-summary?branchId=B va GET /api/cashier/transactions?branchId=B chaqiradi: B'ning kunlik tushumi, to'lov turlari bo'yicha taqsimot va tranzaksiyalari 200 bilan keladi. cashier.refund bo'lgani uchun B tranzaksiyasini qaytara ham oladi. Hisobot himoyasi bir xil raqamlar uchun teatr bo'lib qoladi. (Qaror #29 bu jadvallarni 'branch-scoped' deb belgilaydi, lekin kirish chegarasi qarorda aniq aytilmagan, shuning uchun confidence=medium.)
- **Dalil:**
  - apps/api/src/middleware/report-scope.ts:93 `fail('report.branch_forbidden', ...)`: loyihada filial ruxsati tekshiriladigan YAGONA joy (grep 'branch_forbidden|assertBranchAccess' faqat shu)
  - apps/api/src/modules/cashier/cashier.routes.ts:280-283 `path: '/daily-summary'` ... `requirePermission('cashier.view')`: filial tekshiruvisiz
  - apps/api/src/modules/cashier/cashier.schema.ts:93 `branchId: z.uuid(),` (so'rovdan olinadi, JWT abid/tayinlov bilan solishtirilmaydi)
  - apps/api/src/modules/cashier/cashier.service.ts:261 `if (query.branchId) filters.push(eq(cashierTransactions.branchId, query.branchId));`
- **Tuzatish yo'nalishi:** Cashier endpoint'lariga (daily-summary, transactions list, pending-visits, refund) `reportBranchScope`'ga o'xshash umumiy filial-doira middleware'ini qo'shish va `branchId` ni tayinlangan filiallar bilan solishtirish; `branchId` berilmasa ruxsat etilgan filiallar bilan cheklash.

### LA-23 [medium] Reja 'completed' tugmasi bajarilmagan qabul qilingan bosqichlarni tekshirmaydi va ularni qaytarib bo'lmas qarzga qulflaydi

- **Oqim:** Davolash · auditor `high` → refuter `medium`
- **Invariant:** Plan completed bo'lganda unda bajarilmagan accepted bosqich bo'lmasligi yoki u tuzatilishi mumkin bo'lishi kerak
- **Scenariy:** Doktor 3 bosqichli rejani qabul qildirdi (acceptance=accepted, jami 3 mln). 1-bosqich bajarildi, 2 va 3 pending. Doktor adashib «Rejani yakunlash» ni bosadi -> plan completed (terminal). Endi 2 va 3-bosqichlar pending+accepted holatida qarzga kiradi (completed plan DEBT statusi), bosqichni skipped/rejected qilish PlanLockedError (400) bilan rad etiladi, plan qaytarilmaydi. Bemor bajarilmagan davolash uchun qarzdor bo'lib qoladi va tuzatish yo'li (UI ham, API ham) yo'q; faqat refund/qo'lda DB.
- **Dalil:**
  - `apps/api/src/modules/clinical/treatment-plans/treatment-plans.service.ts:230-244 — updatePlan: faqat assertPlanTransition(in_progress→completed) va accepted uchun konsent; bosqichlar holati tekshirilmaydi`
  - apps/web/src/features/clinical/components/treatment-plans/PlanCard.tsx:207-216 — `plan.status === 'in_progress'` bo'lsa bitta bosish bilan onSetPlanStatus(plan.id,'completed'), tasdiqlash dialogi yo'q
  - `apps/api/src/modules/clinical/treatment-plans/treatment-plans.transitions.ts:160-162 — completed plan: har qanday bosqich mutatsiyasi PlanLockedError`
  - `apps/api/src/modules/cashier/cashier.billing.ts:63 — DEBT_PLAN_STATUSES = accepted,in_progress,completed`
- **Tuzatish yo'nalishi:** `updatePlan`da in_progress->completed paytida accepted+pending/in_progress bosqichlar bo'lsa rad etish (yoki ularni avtomatik skipped qilish), UI'da tasdiqlash dialogi qo'shish; muqobil sifatida owner/admin uchun completed->in_progress qaytarish yo'lini ochish.

### LA-24 [medium] Plan qabul qilinganda bosqichlar acceptance='accepted' bo'lmaydi, lekin bosqich baribir bajarilib 'completed' bo'ladi — bajarilgan ish hisoblanmaydi

- **Oqim:** Davolash · auditor `high` → refuter `medium`
- **Invariant:** Bajarilgan (completed) bosqich hisoblanadigan (acceptance=accepted) bo'lishi shart
- **Scenariy:** Registrator/doktor rejani taqdim etib konsent bog'laydi va planni 'accepted' qiladi, lekin alohida «Hammasini qabul qilish» (useAcceptAllStages) ni bosmaydi -> barcha bosqichlar 'proposed'. Doktor vizit yozuvida shu bosqichni tanlaydi -> completeStageForVisit stage'ni completed qiladi (guard o'tadi). Hisob-kitobda totalAccepted=0, qarz 0: bajarilgan davolash hech qayerda to'lov talab qilmaydi (rad etilgan 'rejected' bosqich ham xuddi shunday jimgina bajariladi).
- **Dalil:**
  - `apps/api/src/modules/clinical/treatment-plans/treatment-plans.service.ts:236-243 — presented→accepted faqat konsentni tekshiradi, bosqichlar acceptance'iga tegmaydi`
  - `apps/api/src/modules/clinical/treatment-plans/treatment-plans.transitions.ts:156-168 — assertStageMutationAllowedForPlan acceptance'ni umuman ko'rmaydi (accepted/in_progress planda completed ruxsat)`
  - `apps/api/src/modules/cashier/cashier.billing.ts:132-136 — acceptance!=='accepted' bosqich cost=0 (qarzdan tashqari)`
  - `apps/web/src/features/clinical/components/visit-notes/VisitNotePage.tsx:191-200 — stageOptions: faqat status!=='completed' filtri, acceptance/plan statusi/skipped filtri yo'q`
- **Tuzatish yo'nalishi:** updateStage'da toStatus==='completed' bo'lganda effektiv acceptance 'accepted' ekanini talab qiling (aks holda 400 yoki bosqichni avto-accept qiling). Bunga completeStageForVisit ham kiradi. Qo'shimcha: VisitNotePage stageOptions'ni acceptance==='accepted', status!=='skipped' va reja accepted/in_progress bo'yicha filtrlang. Variant: presented→accepted'da proposed bosqichlarni accepted qiling.

### LA-25 [medium] Bajarilgan bosqich qarzi keyin acceptance o'zgartirish yoki planni bekor qilish bilan o'chib ketadi

- **Oqim:** Davolash · auditor `medium` → refuter `medium`
- **Invariant:** Completed bosqich qarzi bajarilgandan keyin yo'qolmasligi kerak
- **Scenariy:** Bosqich bajarildi (completed), bemor qarzdor. medical_record.edit huquqli xodim bosqichni 'rejected'ga o'tkazadi yoki butun rejani 'cancelled' qiladi -> computePlanBalance cost=0, allaqachon to'langan summa kredit bo'lib qoladi, bajarilgan ish uchun qarz yo'qoladi. Faqat audit_log iz qoldiradi, oldini oluvchi guard yo'q.
- **Dalil:**
  - `apps/api/src/modules/clinical/treatment-plans/treatment-plans.service.ts:306-309 — acceptance o'tishi bosqich status'iga qaramay (completed bo'lsa ham) accepted→rejected ruxsat`
  - `apps/api/src/modules/clinical/treatment-plans/treatment-plans.transitions.ts:82-87 — STAGE_ACCEPTANCE_TRANSITIONS: accepted→rejected/proposed`
  - `apps/api/src/modules/clinical/treatment-plans/treatment-plans.transitions.ts:43 — in_progress→cancelled ruxsat; cancelled DEBT statuslarida yo'q (cashier.billing.ts:63)`
- **Tuzatish yo'nalishi:** `updateStage` da `current.status==='completed'` bo'lsa acceptance'ni accepted'dan rejected/proposed'ga o'tkazishni rad et, `updatePlan` da `in_progress→cancelled` o'tishida completed bosqichlar mavjud bo'lsa (yoki to'lanmagan qarz qolsa) rad et yoki alohida ruxsat/sabab talab qil.

### LA-26 [medium] Vizit POS va plan-bosqich qarzi bir xil ishni ikki marta hisoblashi mumkin

- **Oqim:** Davolash · auditor `medium` → refuter `medium`
- **Invariant:** Bir bajarilgan xizmat faqat bitta yo'l bilan hisoblansin
- **Scenariy:** Doktor rejaga bog'langan vizit yozadi: stageId=2-bosqich (accepted, 500 ming) va ombor chiqimi uchun performedServices ni belgilaydi. Imzolaydi. Kassada «Kutilayotgan vizitlar»da shu vizit chiqadi, kassir POS orqali 500 ming oladi (items rejimi, allocation yo'q). Plan balansi esa 2-bosqich qarzini hali ochiq ko'rsatadi -> bemor ikki marta to'laydi yoki balans noto'g'ri qoladi.
- **Dalil:**
  - `apps/api/src/modules/cashier/cashier.service.ts:640-680 — listPendingVisits: visit_notes.stageId ni hisobga olmaydi, performedServices bor har bir imzolangan vizitni 'kutilayotgan' deb chiqaradi`
  - `apps/api/src/modules/cashier/cashier.service.ts:348-380 — create(visitNoteId): visit.stageId tekshirilmaydi; faqat signedAt, bemor, items⊆performedServices, hali to'lanmagan`
  - `apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts:145-167 — bir vizit ham stageId, ham performedServices (BOM ombor chiqimi uchun to'ldiriladi) bilan saqlanadi`
- **Tuzatish yo'nalishi:** listPendingVisits'da stageId IS NOT NULL vizitlarni chiqarmaslik (yoki ularni «reja bo'yicha to'lang» deb belgilash), create(visitNoteId)da visit.stageId bo'lsa VisitLinkedToPlanStage xatosi bilan rad etish (yoki allocation'ga yo'naltirish).

### LA-27 [medium] Odontogramma ↔ bosqich sinxroni (recordStageCompletion) web'dan erishib bo'lmaydi: resultingToothState hech qachon o'rnatilmaydi

- **Oqim:** Davolash · auditor `medium` → refuter `medium`
- **Invariant:** Bosqich tugaganda odontogramma shu tish holatiga o'tishi kerak
- **Scenariy:** Doktor odontogrammada 16-tishni 'caries' qilib, «Rejaga qo'shish» bilan plomba bosqichini yaratadi. Bosqich bajarilib completed bo'ladi (vizit yoki Select orqali). Odontogramma 16-tishni 'caries' deb ko'rsatishda davom etadi: auto-snapshot hech qachon yozilmaydi, chunki UI resultingToothState yubormaydi. CLI-488 backend'da qurilgan, lekin foydalanuvchi uchun 'uxlab yotgan'.
- **Dalil:**
  - apps/api/src/modules/clinical/treatment-plans/treatment-plans.service.ts:383 — hook faqat `updated.resultingToothState && toothNumbers?.length` bo'lsa ishlaydi
  - `apps/api/src/modules/clinical/treatment-plans/treatment-plans.schema.ts:30-45 — createTreatmentPlanSchema stage'ida resultingToothState/labOrderId yo'q; faqat PATCH /treatment-stages qabul qiladi (:60-70)`
  - `apps/web/src/features/clinical/clinical.api.ts:175-176,204-205,223 — updateTreatmentStage faqat {status} yoki {acceptance} yuboradi; web src'da (generated'dan tashqari) resultingToothState umuman yo'q (grep bo'sh)`
  - `apps/web/src/features/clinical/components/odontogram/OdontogramTab.tsx:134-152 — addToPlan stage'ni toothNumbers bilan yaratadi, holat bermaydi`
- **Tuzatish yo'nalishi:** `createTreatmentPlanSchema` stage'iga ixtiyoriy `resultingToothState` qo'shib, `OdontogramTab.addToPlan` da tanlangan tish holatini uzating. Qo'shimcha: StageRow'ga resultingToothState (va labOrderId) Select'ini qo'shib, `useUpdateStage` orqali PATCH qiling. Yoki holatni backend'da stage `toothNumbers` + service'dan hosil qiling.

### LA-28 [medium] Dori↔allergiya tekshiruvi fail-open va faqat bitta UI yo'lida; serverda umuman yo'q

- **Oqim:** Davolash · auditor `medium` → refuter `medium`
- **Invariant:** Allergiya ma'lumoti noma'lum/yuklanmagan bo'lsa ham dori retsepti jimgina o'tmasin; barcha retsept yo'llarida qoida bir xil
- **Scenariy:** Penitsillinga allergik bemor. Doktor vizit sahifasini ochadi, medical-record so'rovi 5xx/sekin; Amoksitsillin yozadi -> to'qnashuv aniqlanmaydi (allergies=null), saqlash/imzolash o'tadi, retsept yaratiladi. Yoki doktor bemor kartasidagi «Retseptlar» tabidan to'g'ridan yozadi — hech qanday ogohlantirish yo'q. API'ga to'g'ridan so'rov ham ruxsat.
- **Dalil:**
  - apps/web/src/features/clinical/components/visit-notes/VisitNotePage.tsx:159 — `allergies = medicalQuery.data?.allergies ?? null`; :251 persist guard null allergiya bilan [] qaytaradi, saqlashni to'smaydi (faqat :230-231 'allergyUnknown' status qatori)
  - `apps/web/src/features/clinical/components/prescriptions/PrescriptionsTab.tsx:38-52 — retsept yaratishda allergiya tekshiruvi yo'q (findDrugAllergyConflicts faqat VisitNotePage/visit-note-form'da ishlatiladi)`
  - `apps/api/src/modules/clinical — prescriptions/visit-notes service'larida allergiya tekshiruvi yo'q (grep 'allerg' faqat metadata/patients/dashboard)`
- **Tuzatish yo'nalishi:** VisitNotePage'da allergiya noma'lum (isError/loading/403) bo'lsa retsept bilan saqlash/imzolashni CriticalActionDialog tasdig'i bilan bog'la, PrescriptionsTab'ga ham xuddi shu core findDrugAllergyConflicts tekshiruvini qo'sh, va (ixtiyoriy, kuchliroq) prescriptions/visit-notes service'da shu core funksiya bilan server tomonda tekshirib, override sababisiz 409 qaytar.

### LA-29 [medium] Bosqich 'completed' qoralama (imzolanmagan) vizit yozuvi saqlanishi bilan terminal bo'ladi; ko'p-vizitli bosqich birinchi vizitdayoq yopiladi

- **Oqim:** Davolash · auditor `medium` → refuter `medium`
- **Invariant:** Qaytarib bo'lmas terminal holat (stage completed + recall + ombor chiqimi) tasdiqlangan yozuvdan keyin o'rnatilsin
- **Scenariy:** Doktor 3 vizitli implant bosqichi (estimatedVisits=3) uchun 1-vizitda stageId tanlab «Saqlash» (hali imzolamagan) bosadi: bosqich darhol completed, recall yaratiladi, odontogramma (agar o'rnatilgan bo'lsa) yangilanadi, BOM ombordan yechiladi. Vizit bekor qilinsa yoki qoralama tashlansa ham bosqich completed qoladi; 2-3 vizit yozuvlarini bosqichga bog'lab bo'lmaydi (yoki stageId'siz yoziladi).
- **Dalil:**
  - `apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts:145-147,167 — create: completeStageForVisit + deductStock sign'dan OLDIN, qoralamada`
  - `apps/api/src/modules/clinical/treatment-plans/treatment-plans.transitions.ts:61-67 — completed terminal, qaytish yo'q`
  - `apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts:187-193 — keyin stage'ni boshqasiga ko'chirish ham bloklangan; vizit o'chirish route'i yo'q`
  - `apps/api/src/modules/clinical/treatment-plans/treatment-plans.schema.ts:41 — estimatedVisits mavjud, lekin ko'p-vizitli bosqich uchun oraliq vizit yozuvi yo'li yo'q`
- **Tuzatish yo'nalishi:** Stage completion + recall + odontogramma yangilanishini `sign()` ichiga ko'chirish (yoki update/create'da faqat `signedAt` mavjud bo'lganda), va ko'p-vizitli bosqich uchun stage'ni yopmasdan bog'lash (masalan vizit-bosqich bog'lanishi alohida «yakunlovchi vizit» bayrog'i bilan).

### LA-30 [medium] Rejasiz davolash: imzolangan lekin to'lanmagan vizit ertasi kuni kassa 'kutilayotgan' ro'yxatidan yo'qoladi

- **Oqim:** Davolash · auditor `medium` → refuter `medium`
- **Invariant:** Bajarilgan, imzolangan, hisoblanmagan xizmat hech qachon yo'qolmasin (kamida eslatma bilan)
- **Scenariy:** Rejasiz davolash: doktor kech soatda vizitni imzolaydi, bemor to'lamay ketadi yoki kassir bandligi tufayli to'lov olinmaydi. Ertasi kuni listPendingVisits uni qaytarmaydi (signedAt < dayStart); POS'da vizit bilan bog'lash yo'li yo'q, ombor allaqachon yechilgan -> xizmat jimgina hisobsiz qoladi. Imzolanmagan qoralamalar esa umuman ko'rinmaydi.
- **Dalil:**
  - `apps/api/src/modules/cashier/cashier.service.ts:~662-668 — listPendingVisits: gte(visitNotes.signedAt, dayStart) faqat BUGUNGI imzolangan vizitlar; limit(100)`
  - `apps/web/src/features/cashier/components/PendingVisitsCard.tsx — vizitga to'lovni boshlashning yagona UI yo'li shu karta`
  - `apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts:167 — xizmatlar uchun ombor chiqimi yozuv yaratilganda allaqachon bajarilgan`
- **Tuzatish yo'nalishi:** listPendingVisits'dan `gte(signedAt, dayStart)` ni olib tashlash yoki uni N kunlik oynaga (masalan 30 kun) almashtirish, eskilarini «kechikkan» deb belgilash, `limit(100)` o'rniga sahifalash qo'yish va PendingVisitsCard'da yoshi bo'yicha ajratish.

### LA-31 [low] Bron so'rovi 'qotib qolishi': o'tib ketgan/band slot uchun faqat Rad etish mumkin; web doktor/vaqt almashtirishni yubormaydi; bemor muddat tugashidan xabar topmaydi

- **Oqim:** Bron · auditor `medium` → refuter `low`
- **Invariant:** pending so'rov hal etilishi mumkin bo'lishi yoki avtomatik yopilib bemorga xabar berilishi kerak; backend qurgan doctorId imkoniyati UI'da bo'lishi kerak
- **Scenariy:** Bemor soat 09:50 da bugungi 10:00 slotni so'raydi. Registrator 10:10 da tasdiqlashga urinadi -> time.in_past (409), UI umumiy 'slot band' xabari. Boshqa vaqt/doktor taklif qilish tugmasi yo'q; faqat 'Rad etish' (sabab majburiy). Rad etilmasa so'rov 24 soat pending, bemor shu vaqt davomida botda boshqa so'rov yubora olmaydi va expire bo'lganda xabar ham olmaydi. Xuddi shu holat ikki bemor bir slotni so'raganda ikkinchisi uchun ham yuz beradi.
- **Dalil:**
  - apps/web/src/features/dashboard/reception.api.ts:98: `mutationFn: ({ id }) => confirmBookingRequest(id, {})` — doctorId hech qachon yuborilmaydi (backend: booking-requests.schema.ts:46-49 `doctorId` optional, service.ts:66-69 `doctor_required`)
  - apps/api/src/modules/booking-requests/booking-requests.service.ts:62-64: TTL faqat createdAt'ga nisbatan (24 soat), requestedStart o'tganini tekshirmaydi; o'tgan slot create()da `time.in_past` 409 -> so'rov pending qoladi (service.ts:73-83)
  - `apps/api/src/lib/telegram/booking.ts:157-164: pending bor bo'lsa bemor yangi so'rov yubora olmaydi ('alreadyPending')`
  - `apps/api/src/modules/booking-requests/booking-requests.repository.ts:14-29 expireStale: bemorga xabar yubormaydi (sendBookingDecision faqat confirmed/declined)`
- **Tuzatish yo'nalishi:** expireStale'ni requestedStart o'tganini ham qamrab olib, expire bo'lganda onAfterCommit/messenger orqali bemorga xabar yuborish (sendBookingDecision'ga 'expired' qo'shish); web'da 409 da doktor tanlash (Select) bilan confirmBookingRequest(id, {doctorId}) ni yuborish.

### LA-32 [low] Vizit tahririda qaytarish JORIY BOM bo'yicha hisoblanadi, haqiqiy chiqim movement'lari bo'yicha emas (ombor drifti)

- **Oqim:** Ombor · auditor `medium` → refuter `low`
- **Invariant:** INV1/INV3: chiqim va qaytarish simmetrik; qoldiq = ledger
- **Scenariy:** 1) Doktor X xizmati bilan vizit yozuvini (qoralama) saqlaydi: BOM X->Anestetik 2 ta, ombordan 2 chiqadi. 2) Ombor menejeri BOM'ni o'chirib qayta qo'shadi (3 ta qilib) yoki butunlay o'chiradi. 3) Doktor qoralamani tahrirlab X'ni olib tashlaydi: reconcile 3 ta qaytaradi (haqiqatda 2 chiqqan -> +1 fantom qoldiq) yoki BOM yo'q bo'lsa 0 qaytaradi (2 ta abadiy yo'qoladi). Teskarisi: BOM vizit saqlangandan KEYIN qo'shilgan bo'lsa, X'ni olib tashlash hech qachon chiqmagan materialni 'qaytaradi'. Ombor qoldig'i va 'necha kunga yetadi' noto'g'ri bo'ladi, hech qanday xato ko'rsatilmaydi.
- **Dalil:**
  - apps/api/src/modules/stock/stock.service.ts:528-531 `const boms = await db.select().from(serviceMaterials).where(inArray(serviceMaterials.serviceId, [...deltas.keys()]))` — qaytarish uchun ham hozirgi BOM o'qiladi
  - apps/api/src/modules/stock/stock.service.ts:543-551 `quantity: bom.qtyPerService` — `source_visit_note_id` bo'yicha oldingi 'out' qatorlari qidirilmaydi
  - `apps/api/src/modules/stock/stock.routes.ts:~270-285 BOM uchun PATCH yo'q, faqat POST/DELETE (qty o'zgartirish = o'chirish+qayta qo'shish)`
- **Tuzatish yo'nalishi:** `reconcileForServices`da `delta < 0` bo'lsa miqdorni joriy BOM'dan emas, shu `sourceVisitNoteId` va `itemId` bo'yicha `visit_auto` `out` va `visit_edit_return` `in` movement'lari yig'indisidan hisoblang (ledger-based qaytarish).

### LA-33 [low] Imzolangan vizit yozuvi / bekor qilingan yozilish uchun ombor chiqimini qaytarish yo'li yo'q

- **Oqim:** Ombor · auditor `medium` → refuter `low`
- **Invariant:** INV3: bekor qilingan vizit moddiy sarfi qaytadi yoki qaytarish yo'li bor
- **Scenariy:** Doktor vizitni yozadi (yozilishga avtomatik bog'lanadi, VisitNotePage persist), xizmat BOM'i chiqadi, imzolaydi. So'ng xato xizmat tanlangani ma'lum bo'ladi yoki registrator in_progress yozilishni 'cancelled'/'no_show' qiladi. Yozuv 409 bilan tahrirlanmaydi, bekor qilish stockka tegmaydi; yagona yo'l - qo'lda 'in' harakat (sababi bog'lanmagan, avto-jurnalda ko'rinmaydi). Natijada materiallar abadiy hisobdan chiqib ketadi va 'necha kunga yetadi' sarfi oshiq ko'rsatiladi. Bundan tashqari cancelled->scheduled qayta faollashtirib yana yozuv yaratilsa ikkinchi chiqim bo'ladi (bitta yozilishga bir nechta yozuv cheklovi yo'q).
- **Dalil:**
  - apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts:182 `if (before.signedAt) throw new VisitNoteSignedError(id);` — imzodan keyin reconcile yo'li yopiq
  - `apps/api/src/modules/clinical/visit-notes/visit-notes.routes.ts: faqat get/post/get-by-id/patch/sign marshrutlari (DELETE/void yo'q)`
  - apps/api/src/modules/appointments/appointments.transitions.ts:~44-50 `in_progress: ['completed','cancelled','no_show']` — appointments.service.ts:460-500 cancel/no_show hook'lari faqat recall/queue/plan bilan bog'liq, stock yo'q
- **Tuzatish yo'nalishi:** Yozilish cancelled/no_show ga o'tganda yoki imzolangan yozuv bekor qilinganda bog'liq visit_note uchun stock chiqimini teskari harakat bilan qaytaradigan servis qo'shing (`reconcileForServices(before, [], noteId)`), idempotent qiling va appointmentId bo'yicha bitta faol yozuv cheklovini kiriting.

### LA-34 [low] Appointment create/update does not check that doctorId/patientId belong to the tenant; the global (tenant_id-free) EXCLUDE constraints let tenant A block tenant B's bookings

- **Oqim:** Izolyatsiya · auditor `medium` → refuter `low`
- **Invariant:** I3 + I5: a foreign ID is checked under RLS; one tenant's rows must not limit another tenant
- **Scenariy:** (a) Doctor D works in clinics A and B. A receptionist in A (appointment.create) books D for all day, or for days ahead. In B, availability shows the slot as free (the RLS-scoped list cannot see A's appointments), but B's receptionist gets 409 conflict.doctor_busy for every booking and the conflict cannot be seen anywhere. Clinic B learns indirectly when D is busy in A. (b) A dual-role user puts B's patient UUID into an A appointment: the FK passes and A's list shows a nameless appointment. B can no longer book its own patient at that time (409 patient_busy, invisible to B), and deleting the patient in B cascades and deletes A's appointment. Note: blocking a doctor across tenants may be intentional ('one person cannot be in two places'), but it is not documented (CLI-408 doc covers only `doctor_id WITH =`). The missing doctorId/patientId check is a plain gap either way.
- **Dalil:**
  - apps/api/src/modules/appointments/appointments.service.ts:288-325 -- checkConflict/checkPatientConflict are RLS-scoped (they cannot see other tenants), then `sp.insert(appointments).values({ tenantId, branchId: input.branchId, patientId: input.patientId, doctorId: input.doctorId, ...})`; no ownershi
  - apps/api/src/modules/schedule/schedule.service.ts:138-151 -- if the doctor has no schedule at all, `return [{ weekday, startMinute: 0, endMinute: 1440, ... }]` (fallback), so doctorId need not be a member of the tenant
  - apps/api/drizzle/0029_appointments_no_overlap.sql:2 -- `EXCLUDE USING gist ("doctor_id" WITH =, tstzrange("start_time", "end_time") WITH &&) WHERE ("status" <> 'cancelled')` (no tenant_id; compare 0030 payroll: `tenant_id WITH =`)
  - apps/api/drizzle/0035_appointments_no_patient_overlap.sql:18 -- `EXCLUDE USING gist ("patient_id" WITH =, ...)` (no tenant_id)
- **Tuzatish yo'nalishi:** `create` va `update`da `patientId` (RLS ostida patients'dan), `doctorId`/`assistantId` (shu tenantdagi faol `user_assignments`dan) mavjudligini tekshirib, topilmasa 404/422 qaytarish; global EXCLUDE'ni tenant'ga bog'lash (`tenant_id WITH =`) yoki ikki-tenant doktor bloki qasddan ekanini hujjatlashtirish.

## Hal bo'lmagan (unproven)

- [low] Ruxsatlar: Payroll uchun maosh/komissiya kiritish faqat user.manage bilan ochiq: Accountant va Branch Manager payroll.manage'ga ega, lekin hisob asosini o'zgartira olmaydi — Kod faktlari to'g'ri, lekin bu bug emas, mahsulot qarori bo'lishi mumkin.

Tasdiqlangan faktlar:
- `apps/api/src/modules/users/users.routes.ts:327-330`: PUT /users/{id}/profile `requirePermission('user.manage')` va `requirePermissionIfFieldsPresent(['baseSalary','commissionPercent'],'payroll.manage')` ni talab qiladi.
- `payroll.service.ts` oylikni `staffProfiles.baseSalary` va `commissionPercent`

## Rad etilgan

- Davolash: Lab gating (CLI-487) UI'dan bog'lanmaydi, bitta so'rov bilan aylanib o'tiladi va vizit yozuvini ham to'sib qo'yishi mumkin — Kod faktlari to'g'ri, lekin ularning ikkitasi qasddan qilingan qaror, uchinchisi hujjatlashtirilgan follow-up. Bu defekt emas.

1. Aylanib o'tish (b). treatment-plans.service.ts:346-353 da gate haqiqatan `effectiveLabOrderId` bo'yicha ishlaydi, shuning uchun `{labOrderId:null,status:'completed'}` gate'dan o'tadi. Lekin bu qasddan. apps/api/tests/integration/cli-487-488-api-wiring.test.ts:242 da te

## Tekshirilmagan (maxVerify dan tashqari)

| Og'irlik | Ishonch | Oqim | Topilma |
|---|---|---|---|
| medium | high | Lab | Lab rad etgan (yoki uzilgan) ish umrbod 'yuborilgan' holatda qotadi — boshqa labga qayta yuborish, qayta urinish yo'li yo'q; rad etilgan ishga narx tasdiqlash mumkin |
| medium | medium | Lab | upsert_case 'applied:false' e'tiborsiz: lab qabul qilgan ishga lokal tahrir jimgina Hub'ga yetmaydi, lekin 'synced' deb belgilanadi |
| medium | medium | Lab | Qayta urinib bo'lmaydigan ('failed') outbox op'lari uchun qayta navbatga qo'yish ham, ko'rinadigan chora ham yo'q; kutilayotgan narx tasdig'i abadiy 'kutilmoqda'da qolishi mumkin |
| medium | medium | Litsenziya | Retention 'eng yangisi'ni vaqt bo'yicha emas, nom (mahalliy soat) bo'yicha tanlaydi: soat orqaga ketsa yangi olingan zaxira darhol o'chiriladi, holat esa 'muvaffaqiyatli' bo'lib qoladi |
| medium | high | Litsenziya | Heartbeat Supervisor javobini imzo/fingerprint tekshiruvisiz .lic ustiga yozadi: yaroqli litsenziya yaroqsiziga almashib, darhol to'liq blok bo'ladi |
| medium | medium | Litsenziya | INVALID_KEY imzosiz signal va 'litsenziya topilmadi' holatida ham qaytadi: Supervisor bazasi zaxiradan tiklansa, keyingi klinikalarning .lic'lari ommaviy o'chiriladi, uzaytirishlar esa bekor bo'ladi |
| medium | high | Litsenziya | Vendor orqali owner parolini tiklash refresh token'larni bekor qilmaydi va must_change_password'ni tozalamaydi |
| medium | low | Litsenziya | /api/activate va /api/reset-owner-password bulutda ham shartsiz ulangan; skip yo'li 'birinchi tenant' owner telefonini qaytaradi, reset esa 'eng eski tenant' owner'ini o'zgartiradi. Himoya faqat tasodifiy konteyner xususiyatlariga tayanadi |
| medium | medium | Xabarlar | telegram:reload tx COMMIT'dan OLDIN publish qilinadi — bot-manager eski tokenni o'qiydi |
| medium | high | Xabarlar | Oilaviy telefon: faqat eng eski bemor bog'lanadi; qolgan oila a'zolari Telegram'dan chetda, bot noto'g'ri bemor nomidan ishlaydi |
| medium | medium | Xabarlar | Telegram yuborilmasa SMS'ga fallback yo'q; bog'lanish hech qachon eskirmaydi/ochilmaydi (token almashtirish, telefon o'zgarishi, bot bloklangan) |
| medium | high | Xabarlar | reminderLeadHours sozlamasi UI'da tahrirlanadi, lekin eslatma doim 24 soat oldin yuboriladi |
| low | medium | Bron | Booking-requests ro'yxati filial bo'yicha filtrlanmaydi: bir filial registratori boshqa filial so'rovlarini ko'radi va tasdiqlay oladi |
| low | medium | Bron | Kelajakdagi yozilishni no_show qilish mumkin -> strike darhol yoziladi |
| low | medium | Bron | Shifokor navbatda 'Keyingisini chaqirish' tugmasi boshqa shifokor bemorini ko'rsatadi -> 403 |
| low | medium | Bron | Slot tugmasi indeksi eskirgan xabarlarda boshqa kunning slotiga mos keladi (bot) |
| low | low | Bron | Ko'chirilgan 'confirmed' yozilish confirmed'ligicha qoladi va bemorga xabar ketmaydi; <24 soat qolsa eslatma ham yo'q |
| low | medium | Bron | Bot 'Bekor' tugmasi erta check-in qilingan bemorning ochiq navbat ticket'ini yopmaydi |
| low | low | Bron | No-show strike faqat maslahat: Telegram o'z-o'zidan bron va so'rov kartasi 'flagged' bemorni ko'rsatmaydi |
| low | low | Bron | Tasdiqlashda doctorId/branchId/patientId tenantga tegishliligi tekshirilmaydi, faqat FK (platform-global users) |
| low | medium | Bron | Bron so'rovi kartasida vaqt brauzer mintaqasida (uz-UZ, TZ'siz) ko'rsatiladi |
| low | low | Ombor | BOM/partiya/harakat endpointlari item/xizmat mavjudligi va tenant egaligini tekshirmaydi (500 yoki begona UUID'li yetim yozuv) |
| low | low | Ombor | Parallel vizit PATCH'larida reconcile qulfsiz 'before' ustida ishlaydi (qo'sh/yo'qolgan chiqim) |
| low | medium | Ombor | 'Necha kunga yetadi': 30 kunga bo'lish yangi itemda sarfni kamaytirib ko'rsatadi; eski vizit qaytarishi oynani manfiy qiladi |
| low | low | Ombor | deductForServices BOM qatorlarini tartibsiz yangilaydi (parallel vizitlarda deadlock -> vizit saqlanmaydi) |
| low | high | Lab | Klinika Hub'dagi 'remake' oqimini umuman ishga tushira olmaydi (uxlab yotgan feature); tasdiqlangan narx qayta ishlash uchun o'zgartirilmaydi |
| low | medium | Lab | Outbox FIFO: diskda yo'q fayl (ENOENT) cheksiz qayta uriniladi va shu buyurtmaning approve_price/message/delivered op'larini bloklaydi |
| low | medium | Lab | Hub tasdig'idan yozilgan 'Laboratoriya' xarajati erkin tahrir/o'chirishga ochiq — approved_price bilan uzilib qoladi va qayta yozilmaydi |
| low | high | Litsenziya | Tiklash tokeni tenant borligi tekshirilishidan oldin sarflanadi: reset.no_tenant (va tx xatosi) tokenni behuda yoqib yuboradi |
| low | medium | Litsenziya | Aktivatsiyada tenant yaratilib .lic yozilmay qolsa, qayta urinish 'avvalgi parolingiz o'zgarmadi' deb noto'g'ri maslahat beradi |
| low | medium | Litsenziya | Heartbeat monotonik langarni Date.now() bilan ko'taradi va hech qachon pasaytirmaydi: soat xato oldinga surilib heartbeat o'tsa, litsenziya o'sha sanagacha bloklanadi (izoh aksini da'vo qiladi) |
| low | medium | Litsenziya | Supervisor so'rovlarida timeout yo'q: «Qayta tekshirish» va aktivatsiya osilib qolishi mumkin |
| low | low | Litsenziya | Tiklashdan keyin Valkey'dagi eslatma job'lari tiklangan bazaga mos kelmaydi |
| low | medium | Litsenziya | Backup/restore so'rov fayli audit yozuvidan oldin diskka yoziladi: audit yiqilsa (500 -> rollback) tiklash baribir bajariladi, lekin izi qolmaydi |
| low | high | Litsenziya | pre-migrate dump'lari retention'siz to'planadi; migratsiya qayta-qayta yiqilsa har startda yangi dump qo'shiladi |
| low | medium | Xabarlar | Arxivlangan bemor Telegram/recall oqimlarida faol hisoblanadi |
| low | medium | Xabarlar | Reminder/recall tashqi HTTP chaqiruvi tx ichida, timeout'siz; Telegram 'Kelaman' tugmasi muvaffaqiyatsizlikni 'allaqachon' deb ko'rsatadi |
| low | low | Xabarlar | Bemor Telegram orqali bekor qilganda xodimga bildirishnoma yo'q; muvaffaqiyatsiz bo'lgan eslatma job'i keyingi reschedule'da qayta qo'yilmaydi |
| low | low | Xabarlar | Bir xil bot tokeni ikki tenantda ishlatilishi tekshirilmaydi; kontakt guruh chat'ida ham bemorni bog'laydi |
| low | high | Pul | Vizit to'lovi refund qilingach vizitni qayta undirib bo'lmaydi; qisman undirish ham vizitni 'to'langan' qiladi |
| low | medium | Pul | Finalized run'da doktor qatori bo'lmasa refund keyingi davrda komissiya olinmagan daromaddan ayiriladi |
| low | medium | Pul | Fiskal payload izchil emas: amount=paidAmount, items chegirmasiz subtotal, discount maydoni yo'q; reja to'lovida items bo'sh |
| low | medium | Pul | Bekor qilingan reja krediti umumiy balansda boshqa reja qarzini neytrallaydi, lekin kreditni qo'llash yo'li yo'q |
| low | high | Ruxsatlar | Yozilish uchun shifokorlar ro'yxati muddati o'tgan (validTo < now) tayinlovlarni ham qaytaradi |
| low | medium | Ruxsatlar | Ko'p tayinlovli foydalanuvchida rol layout'i/dashboard va standart filial tartibsiz (ORDER BY yo'q) birinchi qatordan olinadi |
| low | high | Ruxsatlar | Ishlamaydigan 'o'lik' permission'lar: staff.view/invite/edit/delete va user.deactivate hech bir endpoint/ekranda tekshirilmaydi, lekin rol quruvchida tanlanadi |
| low | medium | Ruxsatlar | ManagerDashboard filialga biriktirilgan Branch Manager uchun tenant-wide hisobotlarni so'raydi va jim 403 oladi (Qarz KPI '—', ogohlantirish yo'q) |
| low | high | Ruxsatlar | Sidebar'dagi 'Barcha filiallar' bandi endi eng eski filialga o'tkazadi (owner uchun ham), yorliq natijaga mos emas |
| low | medium | Izolyatsiya | Other create endpoints also accept cross-tenant FK IDs without an RLS check (queue walk-in patientId/branchId/serviceId, cashier branchId) |
| low | medium | Izolyatsiya | Bot (Telegram) path: onAfterCommit runs immediately in the fake Context, before the withTenant tx commits (the P4 invariant breaks in the bot path) |
| low | medium | Izolyatsiya | Deleting a patient image or lab-order file removes it from disk before commit; if the tx rolls back, the DB row points to a missing file |
| low | low | Izolyatsiya | The Soliq fiscal provider sends fetch inside the cashier tx (no timeout, while the stage row is locked FOR UPDATE); if the tx rolls back, the receipt is already registered with the tax authority |
| low | medium | Davolash | Bosqichni plan ekranidan (Select) completed qilish ombor BOM chiqimini bajarmaydi — bir xil ma'no uchun ikki yo'l |
| low | low | Davolash | Konsent: terminal planda qayta bog'lash, bemor imzosisiz forma va default 'muddatsiz' |
| low | low | Davolash | Odontogramma snapshot'i last-write-wins: eski qoralamadan saqlash avto-snapshot'ni (bosqich tugashi) ustiga yozadi |
| low | low | Davolash | Plan bosqichlarini tahrirlab bo'lmaydi (bosqich qo'shish/narx o'zgartirish yo'q), reja totalCost qotib qoladi |

## Qamrov bo'shliqlari (tanqidchi)

- **rbac** (A3): Rol bo'yicha (cheklangan permset bilan) ekran→endpoint juftliklari tekshirilmagan: Bemor kartasi bo'limlari, Ombor, Moliya(pnl), Lab, Recalls, Schedule. CLAUDE.md'da bu naqsh 8 marta takrorlangan; aynan shu bo'shliq eng ehtimolli yangi topilma manbai. role-templates.ts matritsasi (Receptionist/Nurse/Technician/Accountant) bo'yicha medical_record/consent/prescription 403 sinovi ham yo'q.
- **tenancy** (A3): Filial doirasi (activeBranchId vs input.branchId, IR-06) appointments/queue/stock/expenses/payroll/schedule uchun tekshirilmagan (faqat kassa). Barcha modullarda begona tenant/filial FK-ID (expenses categoryId, stock itemId/batchId, schedule doctorId, service-prices, recalls scheduledAppointmentId, relatives) satrma-satr tekshirilmagan: RLS FK'ni to'sishi kafolatlanmagan.
- **tenancy** (A3): Lab Hub serveri (apps/lab-hub-api): hubClinicId o'zgarganda kursor va lab_hub_applied_events qayta o'rnatilishi, seq global-mi, hub key tekshiruvi va withClinic/withLab RLS siyosatlari mazmuni o'qilmagan; klinika tomonigina ko'rilgan.
- **lab** (A3): lab-hub-web va lab foydalanuvchilari autentifikatsiyasi (login, JWT, lead/texnik rollari), internal.routes.ts (Supervisor->Hub lab yaratish, vaqtinchalik parol), keyring/crypto, Hub DB tiklanganda kursor ortda qolishi, poll applyEvent vs PATCH poygasi — hammasi qamralmagan.
- **messaging** (A2): Reminder/recall worker ikki skan ustma-ust tushganda dublikat xabar (FOR UPDATE yo'q), SaaS obunasi tugagan tenant uchun worker/bot xabar yuborishda davom etishi, Telegram bot-manager launch/webhook transporti va chat_id bog'lash, FU-15 phone-verify ichki mantiqi tekshirilmagan. Bular booking va tenancy audit notCovered'ida ham takrorlanadi, hech bir oqim egallamagan.
- **license** (A3): Cloud (SaaS) rejimi bo'shligi: requireValidSubscriptionInCloud/supervisor-saas sinxroni yuzaki; bulutda /api/activate fingerprint (systemInformation) ishonchi past; Desktop klient rejimi (TOFU discovery, reconnect), auto-updater, restore-result.json'ni hech kim o'qimasligi, Supervisor admin auth/rate-limit — qamralmagan.
- **money** (A3): expenses moduli, oneCExport, ombor BOM tannarxi/margin, dentalAnalytics pul hisoblari va PlanBillingPanel/TransactionsTable/ReceiptModal UI (to'lov summasini yuborish, refund tugmasi holatlari) tekshirilmagan; refund vs payroll createRun/finalizeRun va parallel allocation poygalari faqat statik o'qilgan.
- **treatment** (A3): Vizit->ombor chiqimi (deductForServices/reconcileForServices) tx ichida 4xx (stock.insufficient) bo'lganda vizit yozuvi commit/rollback holati, appointment->vizit avto-bog'lash va yozilish statusi o'zgarishi, doimiy/sut tish aralash snapshot, prescriptions.create ichki qoidalari (allergiya server tomonda tekshiriladimi) tekshirilmagan. Treatment va inventory chegarasida hech bir oqim bu tutashuvni to'liq bosib o'tmagan.
- **booking** (A2): QueueDisplayBoard (TV) PII ochilishi (ommaviy ekranda bemor ismi/telefoni, autentifikatsiyasiz endpoint-mi), CheckInDialog, ScheduleScreen/WeekGrid, booking_requests RLS policy mazmuni, savepoint+EXCLUDE real-DB xulqi o'qilmagan.
- **booking** (A2): Desktop rejimida (offline/modul gate/litsenziya bloki) umuman hech bir biznes oqim (booking, kassa, ombor, treatment) bosib o'tilmagan: requireModuleInDesktop + license-expired blokning /uploads va ish oqimiga ta'siri, grace davridagi xulq. Cloud-vs-desktop farqi alohida oqim sifatida audit qilinmagan.
- **inventory** (A2): Web StockScreen/BomPanel/ItemFormModal/BatchFormModal oqimlari (409 stock.insufficient xabari, query invalidation) va stock.low_threshold bildirishnomasining Notifications UI/kanalga yetib borishi ko'rilmagan; begona itemId bilan FK/RLS xulqi real DB'da tasdiqlanmagan (confidence low).
