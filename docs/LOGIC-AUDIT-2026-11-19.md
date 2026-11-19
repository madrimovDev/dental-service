# Mantiqiy audit reyestri — 2026-11-19

**Usul.** `.claude/workflows/logic-audit.js` (run `wf_a8620dbb-75d`, 47 agent, ~3,8M subagent token): 9 oqim × `auditor` (booking/treatment/inventory/lab/messaging — A2 sonnet/high; money/rbac/tenancy/license — A3 opus/high) → dedupe → og'irlik bo'yicha 36 topilma × `refuter` (critical — 2 lens) → tanqidchi. Ikkinchi run `wf_5888349a-1ce` (12 agent, ~0,7M): cheklovdan tashqarida qolgan barcha 12 medium topilma. Kod TEGILMAGAN.

**Tekshiruv chuqurligi — muhim.** «Tasdiqlangan» = mustaqil refuter kodni qayta o'qib scenariy o'tishini tasdiqlagan (📖 statik). Faqat 2 ta topilma runtime'da tasdiqlangan (🧪). Pul topilmalari real bazada qayta ishlab chiqarilmagan — tuzatishdan oldin har biriga failing test yoziladi.

**Hisob.** Auditorlar 96 xom topilma; 4 tasi ma'lum qaror (`knownDecision`) sifatida tashlandi → 92 noyob. Tekshirildi 48: **46 tasdiqlandi** (LA-03≈LA-39 va LA-27≈LA-30 bir xil ildizli — amalda 44 mustaqil muammo; LA-35 = CLINIC-FEEDBACK #11), 1 hal bo'lmadi, 1 rad etildi. **44 tekshirilmagan** — hammasi `low` (birinchi runda cheklov oqim tartibi bo'yicha kesgan edi; medium'lar ikkinchi runda yopildi).

**Advisor.** Ikkala run transkriptlarida `server_tool_use advisor` grep'i: 0.

Belgilar: 👤 dizayn savoli (Qaror #29/#37 bilan solishtirish kerak — bug bo'lmasligi mumkin) · 🧪 runtime/real-DB tasdiq · 📖 statik.

## Xulosa

| ID | Og'irlik | Oqim | Tekshiruv | Topilma |
|---|---|---|---|---|
| LA-01 | high | Litsenziya | 📖 statik | needsVendor holatida aktivatsiya formasi butunlay yashiriladi, vendor prepare-reinstall'dan keyin ham u yo'qolmaydi: o'sha kompyuterda baza yo'qolsa mahsulot ichida tiklanish yo'q (C1 qaytadi) |
| LA-02 | high | Xabarlar | 📖 statik | Anketa qoralamasi faqat yoziladi — API ham, web ham o'qimaydi (shifokor hech qachon ko'rmaydi) |
| LA-03 | high | Pul | 📖 statik | Rejadagi bosqichga bog'langan vizit kassada «kutilayotgan vizit» sifatida ham chiqadi, shuning uchun bemordan ikki marta pul olinadi |
| LA-04 | high | Ruxsatlar | 📖 statik | Klinika miqyosidagi (branchId=null) egasi bo'lmagan xodim UI'da eng eski filialga qulflanib qoladi: filial almashtirib bo'lmaydi, yozilish ustasi filial tanlamaydi |
| LA-05 | high | Izolyatsiya | 🧪 Hono runtime probe | Bare `/api`ga mount qilingan modullarning `app.use('*', rlsMiddleware)` i `/api/*` ga oqadi: clinical va patient-images so'rovlari 2–4 ta ichma-ich tranzaksiyani alohida pool ulanishlarida ochadi (pool tugashi, osilish) |
| LA-06 | high | Izolyatsiya | 🧪 real-DB probe | Recall yaratishda patientId tenantga tegishliligi tekshirilmaydi; recall worker admin join'i boshqa tenant bemoriga (B ning ismi/telefoni) A klinikasi nomidan SMS yuboradi |
| LA-07 | medium | Bron | 📖 statik | 'Faol' no_show sweep ulanmagan: kelmagan bemorlar hech qachon avtomatik strike olmaydi |
| LA-08 | medium | Bron | 📖 statik | Bot va yozilish ekrani filialga biriktirilmagan shifokorni taklif qiladi (P10 fallback assignment tekshirmaydi); create() ham tekshirmaydi |
| LA-09 | medium | Bron | 📖 statik | Faol->faol o'tish (scheduled->confirmed/in_progress) ham ish-soati/time-off bilan qayta tekshiriladi: Kelaman tugmasi va navbat->yozilish sync jimgina yiqiladi |
| LA-10 | medium | Bron | 📖 statik | Telegram 'Boshqa vaqt': yangi yozilish ESKISI bekor qilinishidan oldin yaratiladi — recall qayta ochiladi va bemor eski yozilish bilan to'qnashadi |
| LA-11 | medium | Ombor | 📖 statik 👤 | Ko'p filialli tenantda BOM avto-chiqimi filialni hisobga olmaydi (filial itemlari noto'g'ri sarflanadi) |
| LA-12 | medium | Ombor | 📖 statik | UI'da 'Inventarizatsiya' (adjustment) set-to-value ekani ko'rsatilmaydi va 0 ga tushirib bo'lmaydi |
| LA-13 | medium | Lab | 📖 statik | Klinikada bekor qilingan Hub buyurtma Hub'ga yetmaydi; bekor qilingan buyurtmaga ham narx tasdiqlanib xarajat yoziladi |
| LA-14 | medium | Lab | 📖 statik | Lab rad etgan (yoki uzilgan) ish umrbod 'yuborilgan' holatda qotadi — boshqa labga qayta yuborish, qayta urinish yo'li yo'q; rad etilgan ishga narx tasdiqlash mumkin |
| LA-15 | medium | Litsenziya | 📖 statik | Heartbeat Supervisor javobini imzo/fingerprint tekshiruvisiz .lic ustiga yozadi: yaroqli litsenziya yaroqsiziga almashib, darhol to'liq blok bo'ladi |
| LA-16 | medium | Litsenziya | 📖 statik | INVALID_KEY imzosiz signal va 'litsenziya topilmadi' holatida ham qaytadi: Supervisor bazasi zaxiradan tiklansa, keyingi klinikalarning .lic'lari ommaviy o'chiriladi, uzaytirishlar esa bekor bo'ladi |
| LA-17 | medium | Litsenziya | 📖 statik | Retention 'eng yangisi'ni vaqt bo'yicha emas, nom (mahalliy soat) bo'yicha tanlaydi: soat orqaga ketsa yangi olingan zaxira darhol o'chiriladi, holat esa 'muvaffaqiyatli' bo'lib qoladi |
| LA-18 | medium | Litsenziya | 📖 statik | Tiklash uploads yoki migratsiya bosqichida yiqilsa baza eski zaxirada qoladi, natija esa 'failed' deb ko'rsatiladi; API eski sxemali bazada qayta ishga tushadi |
| LA-19 | medium | Litsenziya | 📖 statik | Vendor orqali owner parolini tiklash refresh token'larni bekor qilmaydi va must_change_password'ni tozalamaydi |
| LA-20 | medium | Xabarlar | 📖 statik | Muvaffaqiyatsiz boshlangan bot qayta yuklanmaydi: Telegraf.stop() 'Bot is not running!' otadi |
| LA-21 | medium | Xabarlar | 📖 statik | Oilaviy telefon: faqat eng eski bemor bog'lanadi; qolgan oila a'zolari Telegram'dan chetda, bot noto'g'ri bemor nomidan ishlaydi |
| LA-22 | medium | Xabarlar | 📖 statik | Telegram yuborilmasa SMS'ga fallback yo'q; bog'lanish hech qachon eskirmaydi/ochilmaydi (token almashtirish, telefon o'zgarishi, bot bloklangan) |
| LA-23 | medium | Xabarlar | 📖 statik | reminderLeadHours sozlamasi UI'da tahrirlanadi, lekin eslatma doim 24 soat oldin yuboriladi |
| LA-24 | medium | Xabarlar | 📖 statik | telegram:reload tx COMMIT'dan OLDIN publish qilinadi — bot-manager eski tokenni o'qiydi |
| LA-25 | medium | Pul | 📖 statik | /api/reports/pnl'da reportBranchScope yo'q: filial menejeri boshqa filial va butun klinika moliyasini ko'radi |
| LA-26 | medium | Pul | 📖 statik | Debt-aging qarz yoshini eng eski (allaqachon to'langan) bosqich yoki tranzaksiyadan hisoblaydi |
| LA-27 | medium | Pul | 📖 statik 👤 | Kassa filial doirasini tekshirmaydi: istalgan filial nomidan to'lov, refund va kunlik xulosa |
| LA-28 | medium | Pul | 📖 statik | Payroll draft snapshot'idan keyin davr ichida yozilgan to'lov va refund finalize'da yo'qoladi |
| LA-29 | medium | Pul | 📖 statik | Vizit orqali POS to'lovida doktorga komissiya yozilmaydi va daromad doktorga bog'lanmaydi |
| LA-30 | medium | Ruxsatlar | 📖 statik 👤 | Filial doirasi faqat hisobotlarda majburlanadi: kassa/kunlik xulosa endpoint'lari har qanday branchId'ni qabul qiladi, shuning uchun IR-06 operatsion endpoint'lar orqali aylanib o'tiladi |
| LA-31 | medium | Ruxsatlar | 📖 statik | Filial mudiri (Branch Manager) taklif orqali butun klinikaga tegishli (branchId=null) tayinlov yarata oladi: filial doirasi eskalatsiyasi, IR-06 aylanib o'tiladi |
| LA-32 | medium | Davolash | 📖 statik | Bajarilgan bosqich qarzi keyin acceptance o'zgartirish yoki planni bekor qilish bilan o'chib ketadi |
| LA-33 | medium | Davolash | 📖 statik 👤 | Bosqich 'completed' qoralama (imzolanmagan) vizit yozuvi saqlanishi bilan terminal bo'ladi; ko'p-vizitli bosqich birinchi vizitdayoq yopiladi |
| LA-34 | medium | Davolash | 📖 statik | Dori↔allergiya tekshiruvi fail-open va faqat bitta UI yo'lida; serverda umuman yo'q |
| LA-35 | medium | Davolash | 📖 statik | Odontogramma ↔ bosqich sinxroni (recordStageCompletion) web'dan erishib bo'lmaydi: resultingToothState hech qachon o'rnatilmaydi |
| LA-36 | medium | Davolash | 📖 statik | Plan qabul qilinganda bosqichlar acceptance='accepted' bo'lmaydi, lekin bosqich baribir bajarilib 'completed' bo'ladi — bajarilgan ish hisoblanmaydi |
| LA-37 | medium | Davolash | 📖 statik 👤 | Reja 'completed' tugmasi bajarilmagan qabul qilingan bosqichlarni tekshirmaydi va ularni qaytarib bo'lmas qarzga qulflaydi |
| LA-38 | medium | Davolash | 📖 statik | Rejasiz davolash: imzolangan lekin to'lanmagan vizit ertasi kuni kassa 'kutilayotgan' ro'yxatidan yo'qoladi |
| LA-39 | medium | Davolash | 📖 statik | Vizit POS va plan-bosqich qarzi bir xil ishni ikki marta hisoblashi mumkin |
| LA-40 | low | Bron | 📖 statik | Bron so'rovi 'qotib qolishi': o'tib ketgan/band slot uchun faqat Rad etish mumkin; web doktor/vaqt almashtirishni yubormaydi; bemor muddat tugashidan xabar topmaydi |
| LA-41 | low | Ombor | 📖 statik | Imzolangan vizit yozuvi / bekor qilingan yozilish uchun ombor chiqimini qaytarish yo'li yo'q |
| LA-42 | low | Ombor | 📖 statik | Vizit tahririda qaytarish JORIY BOM bo'yicha hisoblanadi, haqiqiy chiqim movement'lari bo'yicha emas (ombor drifti) |
| LA-43 | low | Lab | 📖 statik | Qayta urinib bo'lmaydigan ('failed') outbox op'lari uchun qayta navbatga qo'yish ham, ko'rinadigan chora ham yo'q; kutilayotgan narx tasdig'i abadiy 'kutilmoqda'da qolishi mumkin |
| LA-44 | low | Lab | 📖 statik | upsert_case 'applied:false' e'tiborsiz: lab qabul qilgan ishga lokal tahrir jimgina Hub'ga yetmaydi, lekin 'synced' deb belgilanadi |
| LA-45 | low | Litsenziya | 📖 statik | /api/activate va /api/reset-owner-password bulutda ham shartsiz ulangan; skip yo'li 'birinchi tenant' owner telefonini qaytaradi, reset esa 'eng eski tenant' owner'ini o'zgartiradi. Himoya faqat tasodifiy konteyner xususiyatlariga tayanadi |
| LA-46 | low | Izolyatsiya | 📖 statik 👤 | Yozilish create/update doctorId/patientId tenantga tegishliligini tekshirmaydi; tenant_id'siz global EXCLUDE constraint'lar A tenantiga B tenantining bronlarini bloklash imkonini beradi |

## Tasdiqlangan topilmalar

### LA-01 [high] needsVendor holatida aktivatsiya formasi butunlay yashiriladi, vendor prepare-reinstall'dan keyin ham u yo'qolmaydi: o'sha kompyuterda baza yo'qolsa mahsulot ichida tiklanish yo'q (C1 qaytadi)

- **Oqim:** Litsenziya · auditor `high` → refuter `high` · 📖 statik
- **Izoh:** 2026-08-07 jonli tekshiruvi `/api/activate`ni bevosita chaqirgan — UI yo'li (forma yashirilgani) sinalmagan; qarama-qarshilik yo'q.
- **Invariant:** I1
- **Scenariy:** Server PC'da Postgres klasteri buziladi yoki postgres\data o'chiriladi, C:\ProgramData\DentalService\license.lic esa qoladi. Desktop start -> bootstrap {hasLicense:true, hasTenant:false} -> /activate «ta'minotchiga murojaat qiling» matnini ko'rsatadi. Vendor «Qayta o'rnatishga tayyorlash»ni bosib, telefon + vaqtinchalik parolni beradi. Mijoz sahifani qayta ochadi: .lic hamon o'qiladi (imzo va fingerprint o'sha mashinaniki), tenant yo'q -> yana needsVendor, kalit kiritish formasi yo'q. Heartbeat NOT_ACTIVATED oladi va .lic'ni saqlab qoladi. Klinika ProgramData'dagi .lic faylini qo'lda o'chirmaguncha yoki POST /api/activate'ni curl bilan chaqirmaguncha ishlay olmaydi. Yangi kompyuterda (.lic yo'q) bu oqim ishlaydi, eski mashinada esa yo'q.
- **Dalil:**
  - apps/web/src/features/auth/pages/activate.page.tsx:72 — `const needsVendor = bootstrap.data?.hasLicense === true && bootstrap.data?.hasTenant === false;` va :122-130 — needsVendor bo'lsa faqat matn chiqadi, forma/tugma render qilinmaydi (activate.page.test.tsx:176-179 buni qulflaydi)
  - apps/api/src/routes/bootstrap-status.ts:54-57 — `hasLicense: lic !== null` faqat lokal .lic'ni o'qiydi; vendor amali lokal holatni o'zgartirmaydi
  - apps/supervisor-api/src/modules/licenses/licenses.service.ts:300-311 — prepareReinstall faqat Supervisor bazasida parol + `fingerprint: null` yozadi
  - apps/api/src/lib/license-heartbeat-scheduler.ts:68-78 — heartbeat NOT_ACTIVATED (fingerprint NULL) olganda `.lic` tegilmaydi, faqat INVALID_KEY'da o'chiriladi
- **Tuzatish yo'nalishi:** In the needsVendor state on activate.page.tsx, add a "Ta'minotchi tayyorladi — kalitni kiriting" button below the vendor text that reveals the existing activation form. The server already accepts activation over an existing .lic and provisions when the tenant table is empty. Update activate.page.test.tsx to match.

### LA-02 [high] Anketa qoralamasi faqat yoziladi — API ham, web ham o'qimaydi (shifokor hech qachon ko'rmaydi)

- **Oqim:** Xabarlar · auditor `high` → refuter `high` · 📖 statik
- **Invariant:** Bot orqali yig'ilgan ma'lumot (allergiya, surunkali kasallik, dorilar) shifokorga ko'rinishi va 'Anamnezni tasdiqlash'da ko'chirilishi mumkin bo'lishi kerak
- **Scenariy:** Bemor botda 5 savolga javob beradi: 'penitsillinga allergiya'. Javob DB'ga tushadi, lekin tibbiy karta endpoint'i uni qaytarmaydi va MedicalTab'da ko'rsatish yo'q. Shifokor/registrator javobni hech qachon ko'rmaydi, bemor esa 'anketa topshirildi' deb o'ylaydi → allergiya haqidagi xavfsizlik ma'lumoti yo'qoladi (drug-allergy tekshiruvi faqat qo'lda kiritilgan allergies'ga qaraydi). Qayta topshirilsa oldingi javoblar jimgina ustiga yoziladi.
- **Dalil:**
  - apps/api/src/lib/telegram/questionnaire.ts:47-52 questionnaireAnswers/questionnaireAt yoziladi (izoh: 'shifokor ... o'zi ko'chiradi')
  - apps/api/src/modules/patients/patients.schema.ts:249-267 medicalRecordDtoSchema va patients.mapper.ts:127-143 toMedicalRecordDto'da questionnaire* maydonlari YO'Q
  - grep 'questionnaire' apps/web/src, packages/api-client — natija 0 (faqat bot kodi, schema va test)
  - docs/FINDINGS-REGISTER FU-35…38 da bu qayd etilmagan (FU-36 faqat audit)
- **Tuzatish yo'nalishi:** `medicalRecordDtoSchema` va mapper'ga `questionnaireAnswers` / `questionnaireAt`ni qo'shing, MedicalTab'da «Bemor anketasi (qoralama)» bloki va «tibbiy kartaga ko'chirish» tugmasini yarating (yoki confirm endpoint'ini javoblarni allergiya, surunkali kasallik va dorilar maydonlariga ko'chiradigan qilib kengaytiring). Qayta topshirishda eski javoblarni ustiga yozmaslik uchun tarix saqlang yoki shifokorni ogohlantiring.

### LA-03 [high] Rejadagi bosqichga bog'langan vizit kassada «kutilayotgan vizit» sifatida ham chiqadi, shuning uchun bemordan ikki marta pul olinadi

- **Oqim:** Pul · auditor `high` → refuter `high` · 📖 statik
- **Izoh:** Ikkinchi to'lovni kassir qo'lda oladi; UI buni oldini olmaydi. LA-26 bilan bir oila.
- **Invariant:** I1: bitta bajarilgan ish bir marta undiriladi
- **Scenariy:** 1) Doktor 'Plomba 36' bosqichi (cost 500 000, plan accepted) bo'yicha vizit ochadi, 'Plomba' xizmatini belgilaydi, radioda shu bosqichni tanlaydi va imzolaydi. Bosqich completed bo'ladi. 2) Kassir 'Kutilayotgan vizitlar'da vizitni ko'radi va 500 000 ni POS orqali oladi (non-plan tx, treatmentPlanId=null). 3) Bosqichga allocation yo'q, shuning uchun reja balansida 500 000 qarz qoladi, debt-aging va «Qarzdorlar»da bemor qarzdor ko'rinadi. 4) Registrator reja bo'yicha yana 500 000 oladi. Natija: bemor ikki marta to'laydi, nonPlan tx esa hech qayerda reja bilan bog'lanmaydi.
- **Dalil:**
  - apps/api/src/modules/cashier/cashier.service.ts:664-671 — pending-visits filtri: `isNotNull(visitNotes.signedAt) ... array_length(performedServices)>0 ... NOT EXISTS (cashier_transactions ct WHERE ct.visit_note_id = ...)`; `visitNotes.stageId` umuman tekshirilmaydi
  - apps/api/src/modules/cashier/cashier.service.ts:348-381 — create() vizit yo'lida ham stageId tekshirilmaydi, to'lov `treatmentPlanId: null` bilan yoziladi (P7 :332-333)
  - packages/db-schema/src/tables/visit-notes.ts:44,56 — bitta yozuvda bir vaqtda `stageId` ham, `performedServices` ham bo'ladi
  - apps/web/src/features/clinical/components/visit-notes/VisitNotePage.tsx:467-475 (xizmatlar MultiSelect, narx va «Jami») va :575-605 (reja bosqichi radiosi) — ikkalasi bitta formada
- **Tuzatish yo'nalishi:** The smallest fix is in the cashier: in `listPendingVisits`, exclude (or flag) visits with `visitNotes.stageId IS NOT NULL`, and in the `create()` visit path, either reject a visit that has a stageId or route its payment as an allocation to that stage instead of the non-plan items path.

### LA-04 [high] Klinika miqyosidagi (branchId=null) egasi bo'lmagan xodim UI'da eng eski filialga qulflanib qoladi: filial almashtirib bo'lmaydi, yozilish ustasi filial tanlamaydi

- **Oqim:** Ruxsatlar · auditor `high` → refuter `high` · 📖 statik
- **Invariant:** I3: faol tayinlovi bor har filialda xodim UI orqali ishlay olishi va yozuv to'g'ri filialga tushishi kerak
- **Scenariy:** Klinikada 2 filial bor (A eski, B yangi). Owner Tenant Admin'ni (yoki Receptionist'ni) 'Barcha filiallar' bilan taklif qiladi, bu standart holat. Xodim kiradi va workspace'ni tanlaydi: abid=A. Sidebar'da filial almashtirgich yo'q (branches=[]), /select-workspace'da faqat 'Barcha filiallar' bor, u yana A'ga olib boradi. Xodim B filialda ishlayapti: Bugun/Navbat/Kassa standart ko'rinishi A ni ko'rsatadi. /appointments/new ustasi filial selektorini ko'rsatmaydi va yozilishni A filialga, A ish soatlari bo'yicha yaratadi. Natija: B bemorlari A kalendariga tushadi, B navbat/kunlik kassa ekranlari bo'sh. Davolash rejasi narxi (treatment-plans.service.ts:178-182 activeBranchId bo'yicha narx) ham A narxidan olinadi.
- **Dalil:**
  - apps/api/src/modules/auth/auth.service.ts:780-788: branchId berilmasa va assignedBranchId null bo'lsa `resolvedBranchId = first?.id` (eng eski filial)
  - apps/api/src/modules/auth/auth.service.ts:487-497 `allowAllBranches = asg.some((a) => a.branchId === null); const branchIds = [...].filter((b): b is string => b !== null)`: tenant-wide xodimga konkret filiallar ro'yxati BO'SH qaytadi
  - apps/web/src/shell/Sidebar.tsx:34 `totalChoices = (data?.branches.length ?? 0) + (data?.allowAllBranches ? 1 : 0)` = 1, :43 `if (!data || totalChoices <= 1 ...)`: filial menyusi umuman chiqmaydi
  - apps/web/src/features/auth/pages/select-workspace.page.tsx:260-262 `branchId: opt.branchId ?? undefined`: yagona variant 'Barcha filiallar', u branchId'siz yuboriladi
- **Tuzatish yo'nalishi:** workspaceBranches allowAllBranches=true bo'lgan xodimga ham klinikaning barcha o'chirilmagan filiallarini qaytarsin (egasidagi kabi), shunda Sidebar menyusi chiqadi. Yoki NewAppointmentWizard'da filial selektori klinika miqyosidagi foydalanuvchiga doim ko'rsatilsin (`needsBranchSelect = allowAllBranches || activeBranchId == null`).

### LA-05 [high] Bare `/api`ga mount qilingan modullarning `app.use('*', rlsMiddleware)` i `/api/*` ga oqadi: clinical va patient-images so'rovlari 2–4 ta ichma-ich tranzaksiyani alohida pool ulanishlarida ochadi (pool tugashi, osilish)

- **Oqim:** Izolyatsiya · auditor `high` → refuter `high` · 🧪 Hono runtime probe
- **Izoh:** Refuter in-memory OpenAPIHono bilan mount tartibini takrorlab middleware chaqiruvlarini sanadi.
- **Invariant:** I1: one request = one tenant tx = one connection
- **Scenariy:** GET /api/treatment-plans passes expenses' auth + rls (txB, connection 1) and then clinical's auth + rls (txC, connection 2). GET /api/patients/{id}/images passes patients' rls (txA), expenses' (txB), clinical's (txC) and patient-images' (txD): 4 connections. Each outer tx stays 'idle in transaction' until the end of the request. The patient card loads tooth-charts/treatment-plans/visit-notes/images in parallel. On cloud, ~20 concurrent clinical requests at peak each hold their first connection and wait for the second. postgres.js puts them in a queue with no timeout, so the whole API (including /api/health and every tenant) hangs until a restart. On desktop it is worse: 20 - 3 reserved = 17 slots, while the API pool (20) and in-process workers share the same pool. With 5-6 clients opening patient cards at the same time, 'remaining connection slots are reserved' leads to 500s. Writes go to the innermost tx, so there is no correctness break; the problem is resources and hangs. Fix direction: in rlsMiddleware, `if (c.get('db') && c.get('afterCommit')) return next();` (reentrancy guard), or mount auth/rls once at the parent level.
- **Dalil:**
  - apps/api/src/app.ts:310,325,326 -- `app.route('/api', expensesRoutes(...)); app.route('/api', clinicalRoutes(...)); app.route('/api', patientImagesRoutes(...));`
  - apps/api/src/modules/expenses/expenses.routes.ts:52-53 -- `app.use('*', authMiddleware()); app.use('*', rlsMiddleware(deps.db));` (mounted under /api, so it becomes /api/*)
  - apps/api/src/modules/clinical/clinical.routes.ts:72-73 and patient-images.routes.ts:63-64 -- the same `app.use('*', rlsMiddleware(deps.db))`; patients.routes.ts:94 -- `/api/patients/*` also matches /api/patients/{id}/images and /tooth-charts
  - apps/api/src/modules/clinical/clinical.routes.ts:45-50 -- the codebase's own runtime probe comment: "A bare `app.use('*', ...)` here flattens to `/api/*` in the composed router and bleeds onto every OTHER route group mounted after this one"
- **Tuzatish yo'nalishi:** rlsMiddleware ichida qayta kirishga qarshi guard qo'shish: c.get('afterCommit') allaqachon o'rnatilgan bo'lsa, yangi tranzaksiya ochmasdan next() ga o'tish (tenantId bir xil). Muqobil yo'l: auth/rls'ni bare-`/api` modullaridan olib, ota darajada bir marta mount qilish.

### LA-06 [high] Recall yaratishda patientId tenantga tegishliligi tekshirilmaydi; recall worker admin join'i boshqa tenant bemoriga (B ning ismi/telefoni) A klinikasi nomidan SMS yuboradi

- **Oqim:** Izolyatsiya · auditor `critical` → refuter `high` · 🧪 real-DB probe
- **Izoh:** FK tekshiruvi RLS'ni chetlab o'tishi vaqtinchalik bazada tasdiqlandi (A tenant B bemorini 0 ko'radi, lekin unga recall insert qiladi).
- **Invariant:** I3 + I4: a foreign ID in the body must be checked under RLS, and admin-connection joins must compare tenant_id
- **Scenariy:** A doctor or administrator works in both clinic A and clinic B. That is normal: users are platform-level and user_assignments spans several tenants. In B's workspace they see the patient UUID (URL /patients/<uuid>). They switch to A's workspace, where their role has recall.manage, and send POST /api/recalls {patientId: <B patient uuid>, dueDate: '<today>'}. The insert succeeds (the FK bypasses RLS), findById returns null, and the reply is 400 insert.failed. Because this is fail() 4xx, the tx COMMITS and the recall stays in A as a ghost row: A's list uses innerJoin, so the row is invisible and nobody can cancel it. At the next daily scan the worker reads B's patient fullName and phone over the admin connection and sends 'Hello <B patient>, time for a check-up at <clinic A>' through A's Eskiz/Telegram channel. This is a tenant-isolation break: B's PII is used under A's context, and A can 'poach' B's patients. recall_logs also reveal whether the patient has a phone: an outcome of 'no_phone' versus 'sent'. The same thing can happen through appointment completion: an appointment with B's patientId, then B4 creates a preventive recall automatically.
- **Dalil:**
  - apps/api/src/modules/recalls/recalls.service.ts:92-110 -- `const created = await repo.insert(c, { tenantId, patientId: input.patientId, ... assignedDoctorId: input.assignedDoctorId ?? null ...})` (no ownership/RLS SELECT; createOwnershipValidator is not used in this module)
  - apps/api/src/modules/recalls/recalls.repository.ts:81-86,69-77 -- `insert` then `findById` with `.innerJoin(patients, eq(patients.id, recalls.patientId))`: B's patient is hidden by RLS, so the result is null
  - apps/api/src/modules/recalls/recalls.routes.ts:117 -- `if (!created) return c.json(fail('insert.failed', 'insert.failed'), 400);` -> fail() 4xx -> rlsMiddleware COMMITS (rls.ts:52), so the recall row persists while the user sees an error
  - apps/api/src/lib/recall-worker.ts:80-103 -- `deps.adminDb.select({ patientName: patients.fullName, patientPhone: patients.phone, telegramChatId: patients.telegramChatId, integrationSettings: tenantSettings.integrationSettings ...}).from(recalls).innerJoin(patients, eq(patients.id, recalls.patientId))` -- no `patients.t
- **Tuzatish yo'nalishi:** In recalls create, validate patientId (and treatmentPlanId/assignedDoctorId/branchId) under RLS with createOwnershipValidator before the insert and return 404 if it is foreign, and add eq(patients.tenantId, recalls.tenantId) to the worker's admin join (optionally also a composite (tenant_id, id) FK).

### LA-07 [medium] 'Faol' no_show sweep ulanmagan: kelmagan bemorlar hech qachon avtomatik strike olmaydi

- **Oqim:** Bron · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** Kelmagan yozilish no_show bo'lib strike yoziladi (CLI-474/483 mo'ljali)
- **Scenariy:** Bemor yozilgan, kelmaydi, ticket ham olmaydi. Registrator kalendarda qo'lda 'Kelmadi' bosmasa yozilish abadiy scheduled/confirmed qoladi: strike yozilmaydi, noShowRate past, recall reopen bo'lmaydi, kechagi waiting ticket'lar missed bo'lmaydi. Strike tizimi faqat qo'l mehnatiga bog'liq.
- **Dalil:**
  - apps/api/src/modules/queue/queue.service.ts:413-465 sweepNoShows mavjud, lekin hech qayerda chaqirilmaydi (faqat queue.routes.ts:268 route; web/cron yo'q)
  - docs/FINDINGS-REGISTER-2026-11-11.md:132 SC-11 — ochiq (📄)
- **Tuzatish yo'nalishi:** Kunlik sweep'ni ulash: recall-scheduler.ts uslubida BullMQ repeatable job (yoki in-process setInterval) qo'shib, har tenant uchun withTenant kontekstida `sweepNoShows` ni Toshkent vaqti bilan kun oxirida chaqirish. Ishga tushirishni index.ts va worker.ts da RUN_REMINDER_WORKER gating bilan qilish.

### LA-08 [medium] Bot va yozilish ekrani filialga biriktirilmagan shifokorni taklif qiladi (P10 fallback assignment tekshirmaydi); create() ham tekshirmaydi

- **Oqim:** Bron · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** Bron faqat shu filialda ishlaydigan (assignment bor) shifokorga
- **Scenariy:** Klinikada 2 filial. Dr. A faqat A filialga assign qilingan va faqat A filialda jadvali bor. Bemor botda B filialni tanlaydi -> doktorlar ro'yxatida Dr. A ham chiqadi, 'har qanday doktor' tanlansa B filial ish soatida (09-18) Dr. A slotlari ko'rinadi. So'rov yuboriladi, registrator 'Tasdiqlash' bosadi: isWithinWorkingHours ham o'sha fallback tufayli o'tadi -> Dr. A uchun B filialda yozilish yaratiladi, Dr. A u yerda emas. Aynan shu yo'l web NewAppointmentWizard (useDoctors + getAvailability) uchun ham ochiq.
- **Dalil:**
  - apps/api/src/lib/telegram/booking.ts:90: `s.doctors = await deps.appointments.listDoctors(c);` (tenant bo'yicha barcha is_practitioner, filtrsiz)
  - apps/api/src/modules/appointments/appointments.service.ts:587-605 listDoctors: faqat isActive+acceptedAt+isPractitioner, branch yo'q
  - apps/api/src/modules/schedule/schedule.service.ts:138-151 segmentsForDay: shu filialda jadvali yo'q bo'lsa butun kun segmenti (`startMinute:0,endMinute:1440`) — doctor shu filialga assign qilinganmi, tekshirilmaydi (getBranchAvailability esa assignment bilan filtrlaydi: schedule.repository.ts:207-232)
  - apps/api/src/modules/appointments/appointments.service.ts:270-303 create(): doctorId/branchId mosligi tekshirilmaydi
- **Tuzatish yo'nalishi:** Doktor-filial moslik tekshiruvini bitta umumiy helperda yarating (user_assignments: isActive, acceptedAt, branchId IS NULL yoki = branchId, isPractitioner) va uni listDoctors(branchId) filtri hamda segmentsForDay fallback'i va create()/update() ichida (checkSchedule yonida, masalan 'schedule.doctor_not_in_branch') qo'llang. Bot va wizard doktor ro'yxatini tanlangan filial bo'yicha so'rasin.

### LA-09 [medium] Faol->faol o'tish (scheduled->confirmed/in_progress) ham ish-soati/time-off bilan qayta tekshiriladi: Kelaman tugmasi va navbat->yozilish sync jimgina yiqiladi

- **Oqim:** Bron · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** Holat o'tishi vaqt/doktor o'zgarmasa jadval tekshiruvini talab qilmasligi kerak (qayta tekshiruv faqat cancelled/no_show -> faol uchun mo'ljallangan)
- **Scenariy:** Registrator shifokorga ertangi kunga 3 ta yozilish qo'yadi. Keyin shifokorga ertaga uchun time-off (yoki ish soati o'zgarishi) kiritiladi — mavjud yozilishlar tegilmaydi. (1) Bemor Telegram eslatmasida 'Kelaman' bosadi -> update(confirmed) schedule.doctor_on_time_off qaytaradi -> bemorga 'already' (noto'g'ri xabar), status scheduled'da qoladi. (2) Registrator kalendarda 'Tasdiqlandi' bossa 409. (3) Kun kelganda shifokor navbatdan bemorni chaqiradi (call-own/PATCH in_progress): ticket in_progress bo'ladi, yozilish scheduled'da qoladi; 'done'da scheduled->completed taqiqlangani uchun yozilish hech qachon completed bo'lmaydi (recall/preventive, hisobotlar, kassa bog'lanishi buziladi). Faqat appointmentSyncError toast chiqadi.
- **Dalil:**
  - apps/api/src/modules/appointments/appointments.service.ts:386-412: `if (timeOrDoctorChanged || (targetActive && beforeStatus !== targetStatus)) { ... checkConflict ... checkSchedule(c, doctor, branch, start, end) -> return { ok:false, code:'schedule.doctor_on_time_off' } }` — scheduled->confirmed/in_progress ham `targe
  - apps/api/src/lib/telegram/reminder-actions.ts:74-75: `const res = await deps.appointments.update(c, row.id, { status: 'confirmed' }); return { outcome: res.ok ? 'confirmed' : 'already', ...base };`
  - apps/api/src/modules/queue/queue.service.ts:230-245: in_progress update natijasi (`{ok:false}`) tekshirilmaydi, so'ng completed'ga scheduled->completed urinishi AppointmentTransitionError beradi -> faqat syncError
  - apps/api/src/modules/schedule/schedule.service.ts:84-113 createTimeOff mavjud yozilishlarni tekshirmaydi (SC-20)
- **Tuzatish yo'nalishi:** appointments.service.ts:389 shartini `timeOrDoctorChanged || (targetActive && !isActiveStatus(beforeStatus))` ga o'zgartirish (faqat cancelled/no_show -> faol qayta tekshirilsin), shuningdek reminder-actions.ts va queue.service.ts dagi {ok:false} natijalarni ochiq ishlash.

### LA-10 [medium] Telegram 'Boshqa vaqt': yangi yozilish ESKISI bekor qilinishidan oldin yaratiladi — recall qayta ochiladi va bemor eski yozilish bilan to'qnashadi

- **Oqim:** Bron · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** Ko'chirilgan bemorning bitta faol yozilishi + recall faqat bitta joyda yopiq; ko'chirish atomik
- **Scenariy:** Bemorning 15-dekabr 10:00 yozilishi bor va u recall'ni yopgan (scheduled, eski appt'ga bog'langan). Bemor eslatmada 'Boshqa vaqt' -> 16-dekabr slotini tanlaydi. Registrator tasdiqlaydi: yangi appt yaratiladi (closeOpenOnRebook ochiq recall topmaydi), keyin eski appt bekor qilinadi -> reopenOnCancel recall'ni pending'ga qaytaradi. Bemor allaqachon yozilgan, lekin dashboard/recall ro'yxatida 'bog'lanish kerak' bo'lib qoladi va recall xabari ketishi mumkin. Bundan tashqari ko'chirish eski bilan vaqt jihatdan kesishsa (boshqa shifokor, 10:15) conflict.patient_busy 409 — so'rov pending'da qotadi.
- **Dalil:**
  - apps/api/src/modules/booking-requests/booking-requests.service.ts:75-103: avval `deps.appointments.create(...)`, keyin `deps.appointments.update(c, row.rescheduleOfAppointmentId, {status:'cancelled', ...})`
  - apps/api/src/modules/appointments/appointments.service.ts:462-468: cancelled bo'lganda `recall.reopenOnCancel(c, id)` — eski yozilish yopgan scheduled recall pending'ga qaytadi
  - apps/api/src/modules/recalls/recalls.service.ts:281-295 reopenOnCancel faqat eski appointmentId bo'yicha; yangi yozilish uni qayta bog'lamaydi
  - apps/api/src/modules/appointments/appointments.service.ts:295-298 checkPatientConflict yangi slotni ESKI (hali faol) yozilish bilan solishtiradi
- **Tuzatish yo'nalishi:** confirm()da `rescheduleOfAppointmentId` bo'lsa eski yozilishni create'dan OLDIN bekor qilish (yoki create'ga eski id'ni `excludeId` sifatida berib checkPatientConflict'dan chiqarish), va reopenOnCancel o'rniga eski yozilish yopgan recall'ni yangi yozilishga qayta bog'lash (scheduledAppointmentId = yangi id).

### LA-11 [medium] Ko'p filialli tenantda BOM avto-chiqimi filialni hisobga olmaydi (filial itemlari noto'g'ri sarflanadi)

- **Oqim:** Ombor · auditor `medium` → refuter `medium` · 📖 statik
- 👤 **Dizayn savoli:** Qaror #29 (filial scoping) / #37 (stage completed moslashuvchan) bilan solishtiring.
- **Invariant:** INV6: filial itemi shu filial vizitida sarflanadi
- **Scenariy:** Tenantda Filial A va B, har birida o'z 'Lidokain' itemi (branchId=A/B). BOM xizmat->Lidokain(A). B filialdagi doktor shu xizmatni yozadi: chiqim A itemidan ketadi, B ombori hech qachon kamaymaydi, B uchun low-stock/'necha kunga yetadi' yolg'on, A filial menejeriga ogohlantirish ketadi. Yagona to'g'ri sozlama - tenant-darajali (branchId=null) item, lekin filial bo'yicha qoldiq UI ko'rsatilgan.
- **Dalil:**
  - apps/api/src/modules/stock/stock.service.ts:436-439 BOM tanlovi faqat serviceId bo'yicha; filial/vizit filiali ishlatilmaydi
  - packages/db-schema/src/tables/service-materials.ts:~22 `unique('service_materials_unique').on(t.serviceId, t.itemId)` — BOM tenant-darajali, filialga bog'lanmagan
  - packages/db-schema/src/tables/stock-items.ts: `branchId` bor (filial itemi); visit_notes jadvalida branch_id yo'q
- **Tuzatish yo'nalishi:** BOM tanlovida vizit filialini hisobga ol: `service_materials`ga ixtiyoriy branch_id qo'sh (yoki item nomi bo'yicha filialga mos itemni tanla), `deductForServices`/`reconcileForServices`da `activeBranchId` bo'yicha item tanla (branchId=null item fallback), `createBom`da item filialini tekshir.

### LA-12 [medium] UI'da 'Inventarizatsiya' (adjustment) set-to-value ekani ko'rsatilmaydi va 0 ga tushirib bo'lmaydi

- **Oqim:** Ombor · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** INV5: adjustment = set-to-value; UI va API ma'nosi mos bo'lishi shart
- **Scenariy:** Ombor menejeri anestetikdan 120 ta bor, 5 tasi singanini yozmoqchi: 'Inventarizatsiya' tanlab 5 kiritadi (delta deb o'ylaydi). Backend qoldiqni 120 -> 5 ga o'rnatadi (ledgerga -115), 'Kam qoldi' ogohlantirishi chiqadi; hech qanday tasdiq yo'q. Aksincha, sanoqda hammasi tugagan bo'lsa 0 kiritib saqlab bo'lmaydi (client validatsiyasi positive) - menejer 'out' bilan aylanib o'tadi.
- **Dalil:**
  - apps/web/src/features/stock/components/MovementFormModal.tsx:~73 `<NumberInput label={t('stock.quantity')} min={0} ...>` — tur adjustment bo'lsa ham yorliq 'Miqdor'
  - packages/i18n/src/locales/uz.json:1509 `"counted_qty": "Aniqlangan qoldiq"` — kalit mavjud, lekin web'da hech qayerda ishlatilmaydi (grep bo'sh) — uxlab yotgan matn
  - apps/web/src/features/stock/stock.schema.ts:22 `quantity: z.coerce.number().positive()` — backend esa adjustment uchun 0 ni ruxsat beradi (apps/api/src/modules/stock/stock.schema.ts:24-37, stock.calc.ts:26)
  - MovementFormModal.tsx: formada joriy qoldiq ko'rsatilmaydi, boshlang'ich qiymat 1
- **Tuzatish yo'nalishi:** MovementFormModal'da type==='adjustment' bo'lsa yorliqni t('stock.counted_qty') qiling, joriy qoldiqni ko'rsating (boshlang'ich qiymat = item.quantity), web movementFormSchema'da quantity'ni adjustment uchun nonnegative qiling (superRefine, API bilan bir xil) va ixtiyoriy ravishda katta pasayishda tasdiq so'rang.

### LA-13 [medium] Klinikada bekor qilingan Hub buyurtma Hub'ga yetmaydi; bekor qilingan buyurtmaga ham narx tasdiqlanib xarajat yoziladi

- **Oqim:** Lab · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** Klinika holati = Hub holati; bekor qilingan ishga pul xarajati yozilmaydi; muddati o'tgan ish PHI'si saqlash qoidasi (L9) bo'yicha o'chadi
- **Scenariy:** Shifokor (lab_order.manage) Hub'ga yuborilgan buyurtmani status select orqali 'cancelled' qiladi (UI shuni ruxsat etadi: LabOrdersTab/LabOrderDetailPage allowedLabOrderStatuses). Hub'da ish 'sent'/'accepted' bo'lib qoladi, lab ishlashni davom ettiradi va narx taklif qiladi. Poll 'price_proposed' cancelled buyurtmaga ham proposedPrice yozadi (sync.ts applyEvent, approvedPrice tekshiruvi xolos); LabOrderHubPanel `proposed && canApprovePrice` bo'lsa 'Tasdiqlash' tugmasini ko'rsatadi (status tekshirilmaydi). Shifokor bosadi -> Hub approved_price oladi (lab akt-sverkasiga tushadi) va klinika expenses'ga 'Laboratoriya' xarajati yoziladi. Shuningdek bekor qilingan ishning bemor ismi/fayllari Hub'da 12 oydan keyin ham o'chmaydi.
- **Dalil:**
  - apps/api/src/modules/lab-orders/lab-orders.service.ts:199-264 update(): before.labHubCaseRef bo'lganda faqat 'delivered' va 'upsert_case' op navbatga qo'yiladi; status='cancelled' uchun hech qanday op/guard yo'q
  - apps/lab-hub-api/src: 'cancel' so'zi umuman yo'q (grep bo'sh) — Hub'da bekor qilish holati/endpointi mavjud emas
  - apps/api/src/modules/lab-orders/lab-orders.hub.ts:132-139 approvePrice(): faqat labHubCaseRef va proposedPrice tekshiriladi, order.status tekshirilmaydi
  - apps/api/src/lib/lab-hub/price.ts:64-66 bookHubConfirmedPrice(): `if (!order || order.approvedPrice != null) return` — status tekshiruvi yo'q
- **Tuzatish yo'nalishi:** Klinika update()da status='cancelled' bo'lganda Hub'ga 'cancel' op yuborish va Hub'da cancelled holati (+ retention'ga qo'shish) qo'shish; approvePrice/bookHubConfirmedPrice/price_proposed'da order.status==='cancelled' bo'lsa rad etish va panelda Tasdiqlash tugmasini yashirish.

### LA-14 [medium] Lab rad etgan (yoki uzilgan) ish umrbod 'yuborilgan' holatda qotadi — boshqa labga qayta yuborish, qayta urinish yo'li yo'q; rad etilgan ishga narx tasdiqlash mumkin

- **Oqim:** Lab · auditor `medium` → refuter `medium` · 📖 statik · 2-run
- **Invariant:** Rad etilgan ish uchun klinika asosiy oqimni davom ettira olishi kerak; pul faqat qabul qilingan ishga
- **Scenariy:** Klinika ishni Lab A'ga yuboradi; lab ishni narx taklif qilib (status 'sent'da ham mumkin) so'ng 'rejected' (sabab bilan) qiladi. Klinikada buyurtma lokal 'sent', hub_status 'rejected'. sendToHub 409 already_sent qaytaradi — boshqa labga yuborib bo'lmaydi; yagona yo'l: lokal 'cancelled' qilib (1-topilma: Hub'ga yetmaydi) bemor/tish/fayllarni qayta kiritish. Shu orada 'Tasdiqlash' bosilsa Hub (status tekshirmaydi) narxni tasdiqlaydi va rad etilgan ish uchun xarajat yoziladi. Xuddi shunday link bekor qilinsa/lab obunasi tugasa upsert_case 'link.not_active'/'lab.subscription_expired' (retryable) sifatida cheksiz backoff'da qoladi va ref allaqachon qo'yilgani uchun qayta yo'naltirib bo'lmaydi.
- **Dalil:**
  - apps/api/src/modules/lab-orders/lab-orders.hub.ts:80 `if (order.labHubCaseRef) throw new LabHubOrderError(409, 'lab_hub.already_sent')` — ref bir marta qo'yilgach hech qachon tozalanmaydi
  - apps/api/src/lib/lab-hub/sync.ts:HUB_TO_CLINIC (~344-350): 'rejected' lokal statusga ko'chmaydi, faqat hub_status/hub_reject_reason
  - apps/web/src/features/clinical/components/lab-orders/LabOrderHubPanel.tsx: linked bo'lsa faqat narx va yozishma ko'rsatiladi; rejected holatda qayta yuborish/lab almashtirish tugmasi yo'q, approve tugmasi esa `proposed && canApprovePrice` bo'lsa chiqadi
  - apps/lab-hub-api/src/modules/lab/lab.routes.ts:400-430 narx taklifi ish holatiga qaramaydi (faqat approvedPrice IS NULL); clinic.routes.ts:525-560 approve-price ham status tekshirmaydi
- **Tuzatish yo'nalishi:** sendToHub'ga rad etilgan holatda (hubStatus='rejected') qayta yuborishga ruxsat bering va shunda labHubCaseRef/hubStatus/proposedPrice'ni tozalang (yoki 'reassign' amali qo'shing). approvePrice va Hub'dagi lab/clinic narx endpointlarida rad etilgan ish uchun 409 qaytaring, panelda esa rejected holatda 'Tasdiqlash' tugmasini yashirib 'Boshqa labga yuborish' tugmasini ko'rsating.

### LA-15 [medium] Heartbeat Supervisor javobini imzo/fingerprint tekshiruvisiz .lic ustiga yozadi: yaroqli litsenziya yaroqsiziga almashib, darhol to'liq blok bo'ladi

- **Oqim:** Litsenziya · auditor `medium` → refuter `medium` · 📖 statik · 2-run
- **Invariant:** I4
- **Scenariy:** (a) Vendor Supervisor RSA juftligini almashtiradi (FU-54 aynan shunday bo'lgan), eski build'dagi desktop'da esa eski ochiq kalit qoladi. 4 soat ichida heartbeat yangi kalit bilan imzolangan javobni yozadi, yaroqli eski .lic yo'qoladi va muddat tugashini kutmasdan klinika bloklanadi. (b) Supervisor HTTP/IP rejimida bo'lsa (VM'da shunday edi), MITM soxta 200 JSON qaytaradi va .lic yaroqsizga almashadi. Ikkala holatda ham /activate ham yordam bermaydi: javob yana xuddi shunday imzolangan bo'ladi.
- **Dalil:**
  - apps/api/src/lib/license-heartbeat-scheduler.ts:55-56 — `const fresh = await deps.sendHeartbeat(lic.licenseKey); await deps.writeLicense(fresh);` (isLicenseValid/verifyLicenseSignature chaqirilmaydi)
  - apps/api/src/lib/license-client.ts:41-52 — `post()` 2xx bo'lsa istalgan JSON'ni `LicenseData` deb qaytaradi
  - apps/api/src/lib/license.ts:325 — imzo mos kelmasa getLicenseState -> 'none' -> global gate 403 LICENSE_NOT_FOUND
  - FINDINGS-REGISTER DT-14 (ochiq, 📄)
- **Tuzatish yo'nalishi:** license-heartbeat-scheduler.ts da writeLicense'dan oldin `isLicenseValid(fresh, await getFingerprint(), anchor)` (kamida imzo+fingerprint) tekshiring; muvaffaqiyatsiz bo'lsa log qilib eski .lic'ni saqlang (activate.ts da litsenziya payload'i uchun ham shunday).

### LA-16 [medium] INVALID_KEY imzosiz signal va 'litsenziya topilmadi' holatida ham qaytadi: Supervisor bazasi zaxiradan tiklansa, keyingi klinikalarning .lic'lari ommaviy o'chiriladi, uzaytirishlar esa bekor bo'ladi

- **Oqim:** Litsenziya · auditor `medium` → refuter `medium` · 📖 statik · 2-run
- **Invariant:** I4
- **Scenariy:** Supervisor VPS'ida baza buziladi va infra/supervisor/backup.sh bilan olingan 10 kun oldingi dump tiklanadi. So'nggi 10 kunda yaratilgan klinikalarning litsenziya qatori yo'q, shuning uchun keyingi heartbeat INVALID_KEY qaytaradi va ularning .lic fayli o'chiriladi (darhol LICENSE_NOT_FOUND). Shu 10 kunda uzaytirilgan klinikalar heartbeat'da eski expiresAt bilan qayta imzolanadi va to'lov qilgan bo'lsa ham bloklanadi. Supervisor oddiy HTTP'da bo'lsa, MITM 403 `{"error":{"code":"INVALID_KEY"}}` qaytarib, istalgan klinikani masofadan o'chira oladi.
- **Dalil:**
  - apps/supervisor-api/src/modules/licenses/licenses.service.ts:154-156 — `if (!lic || !lic.isActive) throw ... 'INVALID_KEY'` (qator topilmasa ham, deaktivatsiya bo'lsa ham)
  - apps/api/src/lib/license-heartbeat-scheduler.ts:68-74 — `if (code === 'INVALID_KEY') { await deps.invalidateLicense(); ...}` (status/body imzosiz, 403 + `{error:{code}}` yetarli)
  - apps/supervisor-api/src/modules/licenses/licenses.service.ts:193 — heartbeat `expiresAt`ni DB'dan qayta imzolaydi (zaxiradagi eski qiymat ham)
  - Bog'liq qaror: CLAUDE.md «heartbeat scheduler faqat INVALID_KEY da .lic ni bekor qiladi» (qasddan). Bu topilma qarorning o'zini emas, INVALID_KEY'ning ikki ma'nosi va imzosizligini ko'rsatadi
- **Tuzatish yo'nalishi:** Make the Supervisor return separate codes for "row missing" and "deactivated", and make the deactivation response signed so the client verifies it before deleting the .lic. For example: `LICENSE_REVOKED` with a signed payload of licenseKey+fingerprint+issuedAt, and `UNKNOWN_KEY` that only gets logged. Also keep the old `.lic` in writeLicense if the new `expiresAt` is less than the current one.

### LA-17 [medium] Retention 'eng yangisi'ni vaqt bo'yicha emas, nom (mahalliy soat) bo'yicha tanlaydi: soat orqaga ketsa yangi olingan zaxira darhol o'chiriladi, holat esa 'muvaffaqiyatli' bo'lib qoladi

- **Oqim:** Litsenziya · auditor `medium` → refuter `medium` · 📖 statik · 2-run
- **Invariant:** I3
- **Scenariy:** Eski klinika PC'sida CMOS batareyasi o'ladi yoki BIOS soati yil/oy xato bilan qo'yiladi, NTP o'chiq (oflayn LAN). Papkada 14 ta real sanali nusxa bor. 20:00'da `dental-20000101-200000` olinadi, leksikografik bo'yicha eng oxirgi bo'lib qoladi va shu zahoti retention'da o'chiriladi. Har kuni shu takrorlanadi: yangi zaxira bitta ham saqlanmaydi, lastError null, UI esa «zaxira olindi» deydi. Litsenziya monotonik langar tufayli ishlashda davom etadi, ya'ni muammo hech qayerda ko'rinmaydi. Shu davrda disk buzilsa so'nggi ma'lumotlar yo'qoladi.
- **Dalil:**
  - apps/desktop/src/backup-scheduler.ts:151 — `const name = `dental-${backupStamp(deps.now())}`;` (mahalliy soat)
  - apps/desktop/src/backup-scheduler.ts:125-137 — `.sort().reverse()` leksikografik tartib
  - apps/desktop/src/backup-scheduler.ts:140-145 — `names.slice(Math.max(1, BACKUP_RETENTION))` o'chiriladi
  - apps/desktop/src/backup-scheduler.ts:171-172 — retention'dan keyin `writeState({ lastSuccessAt: ..., lastError: null })`
- **Tuzatish yo'nalishi:** applyRetention'da shu chaqiruvda yaratilgan `name`ni o'chirishdan chetlating va retention'dan keyin bu nusxa diskda borligini tekshiring. Bundan tashqari, yangi stamp mavjud eng yangi nomdan kichik bo'lsa (soat orqaga ketgan), `lastError` orqali soat haqida ogohlantirish yozing.

### LA-18 [medium] Tiklash uploads yoki migratsiya bosqichida yiqilsa baza eski zaxirada qoladi, natija esa 'failed' deb ko'rsatiladi; API eski sxemali bazada qayta ishga tushadi

- **Oqim:** Litsenziya · auditor `high` → refuter `medium` · 📖 statik
- **Invariant:** I2
- **Scenariy:** Owner Sozlamalar -> Zaxira orqali bir oy oldingi nusxani tiklaydi. pg_restore muvaffaqiyatli o'tadi (joriy ma'lumotlar o'chadi), keyin tar extract yiqiladi (disk to'lgan yoki antivirus) yoki migratsiya yiqiladi (masalan, eski nusxadagi takroriy telefonlar 0043'da qonuniy to'xtaydi). Natijada restore-result 'failed', lastError «tiklash muvaffaqiyatsiz». API esa baza eski nusxada turgan holda qayta yonadi. Migratsiya yiqilgan bo'lsa API eski sxemada ishlaydi, keyingi qayta yonishda esa «Ma'lumotlarni qaytarib bo'lmadi» bilan yopiladi. Uploads yiqilgan bo'lsa xodimlar «tiklash bo'lmadi» deb o'ylab bir oy eskirgan bazada ishlashni davom ettiradi: oxirgi oydagi to'lovlar va vizitlar ko'rinmaydi. Ular faqat dental-<pre-restore> papkasida qoladi va buni hech kim aytmaydi. Keyin bu nusxa qaytarilsa, oradagi yangi yozuvlar yo'qoladi.
- **Dalil:**
  - apps/desktop/src/backup-scheduler.ts:228-242 — pre-restore'ga qaytish (rollback) FAQAT `deps.restoreDb(dbFile)` throw qilganda bajariladi
  - apps/desktop/src/backup-scheduler.ts:243-249 — `deps.extractUploads(uploadsFile)` va `deps.migrate()` DB allaqachon almashtirilgandan KEYIN chaqiriladi; ular uchun rollback yo'q
  - apps/desktop/src/backup-scheduler.ts:250-253 — catch faqat `writeState({ lastError: `tiklash muvaffaqiyatsiz (...)` })` yozadi
  - apps/desktop/src/backup-scheduler.ts:261-263 — finally `deps.startApi()` ni baribir chaqiradi
- **Tuzatish yo'nalishi:** performRestore'da restoreDb muvaffaqiyatli o'tgandan keyin extractUploads va migrate'ni ham rollback qamroviga olish (yiqilsa pre-restore db.dump'ga qaytarish va xatoda «baza avvalgi holatga qaytarildi / qaytarilmadi» deb aniq yozish), yoki faqat uploads yiqilganda natijani «baza tiklandi, fayllar tiklanmadi» deb farqlash.

### LA-19 [medium] Vendor orqali owner parolini tiklash refresh token'larni bekor qilmaydi va must_change_password'ni tozalamaydi

- **Oqim:** Litsenziya · auditor `medium` → refuter `medium` · 📖 statik · 2-run
- **Invariant:** I6
- **Scenariy:** Ishdan ketgan administrator owner parolini bilgan va registratura PC'sida owner sessiyasi ochiq qolgan. Owner parolni o'zgartirmoqchi, lekin eskisini eslay olmaydi, shuning uchun vendor token oladi va /reset-owner-password orqali yangi parol qo'yadi. Begona qurilmadagi refresh token rotatsiya bilan yashashda davom etadi, ya'ni owner huquqlari (zaxirani tiklash, xodim parolini tiklash, moliya) saqlanib qoladi. Alohida holat: provisioning'dan keyin vaqtinchalik parolni almashtirishdan oldin unutgan owner tiklashdan keyin ham /change-password-required'ga tushadi va hozirgina qo'ygan parolini 'joriy' deb yana kiritishi kerak bo'ladi.
- **Dalil:**
  - apps/api/src/routes/reset-owner-password.ts:84-88 — `.set({ passwordHash, phoneVerifiedAt: null, updatedAt: now })`: refreshTokens UPDATE yo'q, mustChangePassword o'zgarmaydi
  - apps/api/src/modules/auth/auth.service.ts:966-972 — changePassword `mustChangePassword: false` qo'yadi va barcha refresh'ni revoke qiladi
  - apps/api/src/modules/users/users.service.ts:505-523 — owner admin-reset ham barcha refresh token'larni revoke qiladi
  - FINDINGS-REGISTER DT-17 (revoke qismi ochiq, 📄); must_change_password qismi reyestrda yo'q
- **Tuzatish yo'nalishi:** reset-owner-password.ts tranzaksiyasiga owner'ning faol refresh token'larini `revokedAt = now` bilan bekor qilishni va `mustChangePassword: false` qo'yishni qo'shish kerak, xuddi `changePassword` va admin-reset'dagidek.

### LA-20 [medium] Muvaffaqiyatsiz boshlangan bot qayta yuklanmaydi: Telegraf.stop() 'Bot is not running!' otadi

- **Oqim:** Xabarlar · auditor `high` → refuter `medium` · 📖 statik
- **Invariant:** Har qanday launch holatidan (muvaffaqiyatsiz ham) reload yangi tokenni ishga tushira olishi kerak
- **Scenariy:** Owner Sozlamalar→Integratsiyalar'da botToken'ni xato kiritadi (yoki desktop internetsiz yoqiladi). launch→getMe 401/tarmoq xatosi, 'bot launch failed' log, lekin bots map'da dead Telegraf qoladi. Owner to'g'ri token kiritadi → telegram:reload → reload() → stop() throw 'Bot is not running!' → `bots.delete` ham, readToken/launch ham bajarilmaydi ('bot reload failed' log). Bot jarayon qayta ishga tushirilmaguncha ishlamaydi (bulutda owner qayta ishga tushira olmaydi). stopAll() (:264) ham xuddi shu sabab bitta dead bot'da qolgan botlarni to'xtatmay va sub.quit() chaqirmay to'xtaydi.
- **Dalil:**
  - apps/api/src/lib/telegram-bot-manager.ts:209 `void bot.launch().catch(...)` va :210 `bots.set(tenantId, bot)` — launch rad etilsa ham bot map'da qoladi
  - apps/api/src/lib/telegram-bot-manager.ts:217 `bot.stop('reload')` — try/catch yo'q, :222 reload `await stop()` birinchi
  - node_modules/telegraf/lib/telegraf.js:217 `if (this.polling === undefined && this.webhookServer === undefined) throw new Error('Bot is not running!')`; launch() da getMe() polling o'rnatilishidan OLDIN (satr ~190) — noto'g'ri token/tarmoq yo'q bo'lsa polling hech qachon o'rnatilmaydi
- **Tuzatish yo'nalishi:** `stop()` va `stopAll()` da `bot.stop()` ni try/catch ichiga ol (yoki "running" holatini kuzat), `bots.delete` har holda bajarilsin. Launch rad etilganda `.catch` ichida `bots.delete(tenantId)` (faqat shu instance bo'lsa) qilinsin.

### LA-21 [medium] Oilaviy telefon: faqat eng eski bemor bog'lanadi; qolgan oila a'zolari Telegram'dan chetda, bot noto'g'ri bemor nomidan ishlaydi

- **Oqim:** Xabarlar · auditor `medium` → refuter `medium` · 📖 statik · 2-run
- **Invariant:** Bir telefondagi (oilaviy) barcha bemorlarga xabar/eslatma yetishi va bot/anketa to'g'ri bemorga yozishi kerak
- **Scenariy:** Ona o'z raqamini ulashadi; shu raqamda 2 ta bola yozuvi ham bor. Faqat eng eski yozuv bog'lanadi. Bolalarning 24 soatlik eslatmalari/chek/retseptlari Telegram'ga yetmaydi (SMS sozlanmagan bo'lsa NoOp — hech qayerga). Agar bola yozuvi onadan eski bo'lsa: ona bola yozuviga bog'lanadi, anketa (allergiya, homiladorlik, anesteziya) BOLANING tibbiy kartasiga qoralama bo'lib yoziladi, 'Yozilish' so'rovi bola nomidan yaratiladi, onaning o'z chek/retsepti esa kelmaydi, bolaning cheki esa onaga ketadi. Foydalanuvchi bola/onani tanlay olmaydi.
- **Dalil:**
  - apps/api/src/lib/telegram-bot-manager.ts:56-68 linkPatientByContact: `.orderBy(asc(patients.createdAt)).limit(1)` — faqat bitta bemor `telegramChatId` oladi
  - apps/api/src/lib/telegram/flows.ts:41-47 resolveLinked izohi 'Bir chat'ga bir nechta bemor (oila)' deydi, lekin hech qaysi kod boshqa bemorni bog'lamaydi (telegramChatId yozuvchilar faqat :69 va phone-verify)
  - apps/api/src/lib/reminder-worker.ts:121 va telegram/notify.ts:67 — xabar faqat o'sha bemorning o'z telegramChatId'siga; flows.ts reminder 'reschedule' shoxi (r.patientId ?? l.patientId) amalda o'lik kod
- **Tuzatish yo'nalishi:** Telefon bo'yicha topilgan barcha bemorlarni shu chat'ga bog'lashga ruxsat berish (yoki alohida bemor-chat bog'lanish jadvali) va botda bemor tanlash qadamini qo'shish. Eslatma, chek va retsept esa har bemorning o'z yozuvi bo'yicha yuborilsin.

### LA-22 [medium] Telegram yuborilmasa SMS'ga fallback yo'q; bog'lanish hech qachon eskirmaydi/ochilmaydi (token almashtirish, telefon o'zgarishi, bot bloklangan)

- **Oqim:** Xabarlar · auditor `medium` → refuter `medium` · 📖 statik · 2-run
- **Invariant:** Kanal prioriteti Telegram>SMS: tanlangan kanal ishlamasa xabar yo'qolmasligi yoki kuzatilishi kerak; chat bog'lanishi telefon/bot o'zgarganda tuzatilishi kerak
- **Scenariy:** (a) Klinika bot tokenini yangi botga almashtiradi (yoki BotFather'da revoke) — barcha bog'langan bemorlar yangi bot'ni hech qachon /start qilmagan: Telegram 403, eslatmalar jimgina yo'qoladi, SMS sozlangan bo'lsa ham ishlatilmaydi. (b) Bemor botni bloklagan — xuddi shu. (c) Bemor telefoni xato/eskirgan raqamdan to'g'rilanadi yoki raqam boshqa odamga o'tadi: eski chat bog'langan qoladi (chek/retsept PII eski egasiga ketadi), haqiqiy egasi kontakt ulashsa 'already_linked' — xodimda ajratish UI/endpoint yo'q.
- **Dalil:**
  - apps/api/src/lib/tenant-channel.ts:38 `if (telegramChatId && tg?.botTokenEnc)` — chat_id bo'lsa har doim Telegram, SMS tekshirilmaydi
  - apps/api/src/modules/notifications/notifications.service.ts:63-70 `if (!res.ok) console.error(...)` — natija yutiladi, job muvaffaqiyatli deb tugaydi; shifokorga 'appointment_reminder' in-app yozuvi har holda yoziladi
  - telegramChatId'ni null qiladigan/almashtiradigan kod yo'q (grep: faqat telegram-bot-manager.ts:69 va phone-verify.ts yozadi); telegram-bot-manager.ts:67 `p.chat && p.chat !== o.chatId -> 'already_linked'`
  - apps/api/src/lib/recall-worker.ts:221-:250 recall ham xuddi shunday (failed → har kuni qayta urinadi, SMS'ga o'tmaydi)
- **Tuzatish yo'nalishi:** Telegram send `ok:false` bo'lganda (403/blocked) `resolveTenantChannel`ning SMS tarmog'iga o'tish (yoki job'ni fail qilib qayta urinish va natijani kuzatiladigan yozuvga chiqarish), 403 da bemor `telegramChatId`ni tozalash, bemor telefoni o'zgarganda yoki bot tokeni almashtirilganda bog'lanishni bekor qilish va xodimga «Telegram'ni ajratish» endpointini berish.

### LA-23 [medium] reminderLeadHours sozlamasi UI'da tahrirlanadi, lekin eslatma doim 24 soat oldin yuboriladi

- **Oqim:** Xabarlar · auditor `medium` → refuter `medium` · 📖 statik · 2-run
- **Invariant:** Sozlamada ko'rinadigan va saqlanadigan parametr xulqqa ta'sir qilishi kerak
- **Scenariy:** Owner 'Eslatma necha soat oldin' = 3 qilib saqlaydi. Barcha eslatmalar baribir 24 soat oldin ketadi; <24 soat qolgan yozilishlarga (bugungi/ertangi ertalabki) umuman eslatma qo'yilmaydi (delay null) — sozlamani 3 ga qo'yish ularni qamrab olishi kerak edi.
- **Dalil:**
  - apps/api/src/lib/reminder-delay.ts:5 `leadHours = 24` default; appointments.service.ts:344 va :532,:547 `reminderDelayMs(start, new Date())` — leadHours uzatilmaydi
  - apps/web/src/features/settings/components/TenantSettingsScreen.tsx:286 reminderLeadHours input; tenant-settings.schema.ts:81 (0–168) saqlanadi
  - grep reminderLeadHours apps/api/src: faqat schema/mapper, hech qanday xulq
- **Tuzatish yo'nalishi:** appointments.service'da reminderDelayMs chaqirishdan oldin tenant_settings.reminder_lead_hours ni o'qib, uni leadHours sifatida uzating. Sozlama o'zgarganda mavjud job'larni qayta rejalashtirish ixtiyoriy.

### LA-24 [medium] telegram:reload tx COMMIT'dan OLDIN publish qilinadi — bot-manager eski tokenni o'qiydi

- **Oqim:** Xabarlar · auditor `medium` → refuter `medium` · 📖 statik · 2-run
- **Invariant:** Token o'zgargach bot-manager FAQAT commit bo'lgan yangi tokenni o'qishi kerak (P1/P4 qoidasi: tashqi side-effect faqat commit'dan keyin)
- **Scenariy:** Owner token'ni saqlaydi: PATCH tx ichida UPDATE → publish → bot-manager (alohida jarayon/ulanish) darhol reload() → readToken hali COMMIT bo'lmagan qatorni ko'rmaydi → birinchi saqlashda token yo'q (null) → bot ishga tushmaydi; token almashtirishda eski token bilan qayta ishga tushadi; token o'chirishda (telegram:null) eski bot to'xtatiladi-yu qaytadan eski token bilan ko'tariladi (o'chirilgan integratsiya ishlayveradi). Poyga: COMMIT ms'larda bo'ladi, shuning uchun vaqti-vaqti bilan yoki tez-tez yuz beradi; keyingi reload bo'lmaguncha tuzalmaydi.
- **Dalil:**
  - apps/api/src/modules/tenant-settings/tenant-settings.service.ts:132 `await getRedisPub().publish('telegram:reload', tenantId)` — to'g'ridan-to'g'ri, `onAfterCommit` emas
  - apps/api/src/middleware/rls.ts: har so'rov `db.transaction` ichida, COMMIT handler qaytgandan keyin; `runAfterCommit` faqat commit'dan so'ng
  - apps/api/src/lib/telegram-bot-manager.ts:222-226 reload: stop → readToken(adminDb) alohida ulanishda (READ COMMITTED, uncommitted ko'rmaydi)
- **Tuzatish yo'nalishi:** publish'ni `onAfterCommit(c, async () => { await getRedisPub().publish('telegram:reload', tenantId); })` ichiga o'rang (P4 qoidasi, xuddi shu tenant-settings.service.ts:132 joyida).

### LA-25 [medium] /api/reports/pnl'da reportBranchScope yo'q: filial menejeri boshqa filial va butun klinika moliyasini ko'radi

- **Oqim:** Pul · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I4: hisobotda filial doirasi serverda majburlanadi (IR-06)
- **Scenariy:** Branch Manager faqat A filialiga tayinlangan (report.view). 1) `GET /api/reports/pnl?from=2026-11-01&to=2026-11-30&branchId=<B>` -> 200, B filialining tushumi va xarajati qaytadi (boshqa hisobotlarda 403 `report.branch_forbidden`). 2) branchId'siz chaqirilsa -> butun klinika tushumi, barcha filiallar va tenant-darajali xarajatlar hamda payroll jami. revenue/owner-today'da bu chaqiruvchi cheklangan bo'lgani uchun ekranlar bir-biriga zid raqam ko'rsatadi.
- **Dalil:**
  - apps/api/src/modules/reports/reports.routes.ts:215 — `middleware: [requirePermission('report.view')] as const` (boshqa hisobotlarda `reportBranchScope()` bor, masalan :50,:65,:159)
  - apps/api/src/modules/reports/reports.service.ts:198-201 scopeIds — `reportBranchIds` o'rnatilmasa so'ralgan `branchId` o'zgarishsiz ishlatiladi
  - apps/api/src/modules/reports/reports.service.ts:976-979 — xarajat filtri to'g'ridan-to'g'ri `range.branchId`dan, branchId yo'q bo'lsa butun tenant xarajati; :985-998 branchId yo'q bo'lsa butun tenant payroll'i
- **Tuzatish yo'nalishi:** /pnl middleware'iga `reportBranchScope({ tenantWide: true })` qo'shing (payroll filialga bog'lanmagani uchun), yoki `reportBranchScope()` qo'shib pnl()da xarajatni `scopeIds` bo'yicha filtrlang va scoped chaqiruvchi uchun payroll'ni o'tkazib yuboring.

### LA-26 [medium] Debt-aging qarz yoshini eng eski (allaqachon to'langan) bosqich yoki tranzaksiyadan hisoblaydi

- **Oqim:** Pul · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I5: qarz yoshi joriy to'lanmagan qarzning yoshi
- **Scenariy:** Bemorning rejasi 150 kun oldin yaratilgan, 5 bosqichi 140 kun oldin bajarilib to'liq to'langan. Kecha shu rejaga 200 000 lik yangi bosqich qo'shildi va bajarildi (qarz 200 000). Rahbar bosh sahifasida bu 1 kunlik qarz '90+ kun' bucket'ida va over90Count'da chiqadi. Rahbar yangi qarzni eski deb qabul qiladi.
- **Dalil:**
  - apps/api/src/modules/reports/reports.service.ts:729 — `MIN(COALESCE(treatmentStages.completedAt, treatmentPlans.createdAt))` bemorning barcha qarzga kiruvchi bosqichlari bo'yicha, to'langanlik e'tiborga olinmaydi
  - apps/api/src/modules/reports/reports.service.ts:801 — `npAnchor` barcha non-plan to'lovlarning (to'liq to'langan yoki refund qilinganlari ham) eng eskisi
  - apps/api/src/modules/reports/reports.service.ts:815-817 — `anchor = Math.min(planAnchor, npAnchor)`, butun balans shu bucket'ga tushadi
- **Tuzatish yo'nalishi:** Langarni to'lanmagan qoldiq bo'yicha hisobla: bosqichlarni FIFO tartibida (completedAt/createdAt bo'yicha) allocation yig'indisi bilan yopib, birinchi to'liq yopilmagan bosqichning sanasini langar qil. Non-plan uchun ham faqat qoldig'i bor (total − paid + refund > 0) tranzaksiyalarning eng eskisini ol. Yoki balansni bucket'larga ulushlab bo'l.

### LA-27 [medium] Kassa filial doirasini tekshirmaydi: istalgan filial nomidan to'lov, refund va kunlik xulosa

- **Oqim:** Pul · auditor `medium` → refuter `medium` · 📖 statik
- **Izoh:** «Filial doirasi faqat hisobotlarda» topilmasi bilan bir xil ildiz.
- 👤 **Dizayn savoli:** Qaror #29 (filial scoping) / #37 (stage completed moslashuvchan) bilan solishtiring.
- **Invariant:** I4: filialga tayinlangan kassir faqat o'z filiali kassasida ishlaydi
- **Scenariy:** Faqat A filialiga tayinlangan Receptionist (cashier.view, cashier.create_transaction): 1) `GET /api/cashier/daily-summary?branchId=<B>` bilan B kassasining kunlik summalarini ko'radi; 2) `POST /transactions {branchId: B, ...}` bilan B filiali narxida to'lov yozadi, natijada B ning kunlik kassasi va owner-today'dagi B tushumi soxta ko'payadi; 3) cashier.refund'i bo'lsa B ning tranzaksiyasini refund qiladi va B kassasida chiqim paydo bo'ladi. (Butun tizim bo'yicha dizayn bo'shlig'i bo'lishi mumkin, shuning uchun ishonch o'rtacha.)
- **Dalil:**
  - apps/api/src/modules/cashier/cashier.service.ts:509 — `branchId: input.branchId` (JWT `activeBranchId` bilan solishtirilmaydi; modulda `activeBranchId` umuman ishlatilmaydi)
  - apps/api/src/modules/cashier/cashier.service.ts:757-761 — refund id bo'yicha, faqat RLS (tenant), filial tekshiruvi yo'q
  - apps/api/src/modules/cashier/cashier.service.ts:908-931 va cashier.schema.ts:139-142 — daily-summary'da `branchId` erkin query parametri
  - apps/api/src/middleware/auth.ts:63 — `activeBranchId` kontekstga qo'yiladi, lekin cashier/require-permission uni ishlatmaydi
- **Tuzatish yo'nalishi:** Kassa route'larida (daily-summary, create transaction, pending-visits, refund original.branchId) so'ralgan/yozilayotgan branchId ni `report-scope.ts` naqshiga o'xshash tayinlangan filiallar ro'yxati (yoki JWT `abid`) bilan solishtirib, mos kelmasa 403 qaytar. Owner va tenant-wide tayinlov istisno.

### LA-28 [medium] Payroll draft snapshot'idan keyin davr ichida yozilgan to'lov va refund finalize'da yo'qoladi

- **Oqim:** Pul · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I2/I3: har refund bir marta clawback qilinadi, davr ichidagi har to'lov komissiyaga kiradi
- **Scenariy:** Buxgalter 30-noyabr soat 15:00 da noyabr uchun draft run yaratadi (10-noyabrdagi 1 000 000 reja to'lovi kiradi, komissiya 30%=300 000). 30-noyabr 17:00 da shu to'lov to'liq refund qilinadi: finalized run yo'q, adjustment yozilmaydi. 1-dekabr noyabr run'i finalize qilinadi (300 000 bilan). Dekabr run'i refund'ni ko'rmaydi (createdAt noyabrda). Clawback abadiy yo'qoladi, doktorga 300 000 ortiqcha to'lanadi. Teskarisi: 17:00 dagi yangi to'lov ham hech qaysi run'ga kirmaydi va doktor kam oladi. MO-22 ga yaqin, lekin u boshqa holat (hech bir davr qamramagan bo'shliq).
- **Dalil:**
  - apps/api/src/modules/payroll/payroll.service.ts:88-115 — revenue faqat createRun paytida, `createdAt` [start,end) bo'yicha hisoblanadi, payroll_lines ga muzlatiladi
  - apps/api/src/modules/payroll/payroll.service.ts:350-394 — finalizeRun faqat status'ni o'zgartiradi, snapshot'dan keyingi tx'larni qayta hisoblamaydi va ogohlantirmaydi
  - apps/api/src/modules/payroll/payroll.service.ts:458-468 — recordRefundAdjustment faqat `status='finalized'` run'ni qidiradi: draft davrdagi to'lov refundi uchun adjustment yozilmaydi (`if (!run) return;`)
  - apps/api/src/modules/payroll/payroll.schema.ts:5-15 — periodTo kelajakda bo'lishi taqiqlanmagan
- **Tuzatish yo'nalishi:** finalizeRun ichida draft'ning davri uchun daromadni qayta hisoblab payroll_lines bilan solishtiring: farq bo'lsa finalize'ni rad eting (stale_snapshot) yoki avtomatik qayta hisoblang. Muqobil: recordRefundAdjustment draft run'ga tushgan refund uchun ham adjustment yozsin yoki draft'ni stale deb belgilasin.

### LA-29 [medium] Vizit orqali POS to'lovida doktorga komissiya yozilmaydi va daromad doktorga bog'lanmaydi

- **Oqim:** Pul · auditor `high` → refuter `medium` · 📖 statik
- **Invariant:** I2: doktor tushumi payroll komissiyasiga tushadi
- **Scenariy:** Davolash rejasisiz ishlaydigan klinika (kichik klinikalarda keng tarqalgan): doktor (commissionPercent=30) bir oy davomida 20 ta vizitni imzolaydi, kassa ularni 'Kutilayotgan vizitlar'dan 10 000 000 ga undiradi. Oy oxirida createRun: attributedRevenue=0, komissiya=0. Owner «Bugun» ekranida doktor daromadi 0, hammasi 'tayinlanmagan'. Doktor 3 000 000 komissiyani olmaydi.
- **Dalil:**
  - apps/api/src/modules/payroll/payroll.service.ts:88-94 — `.innerJoin(treatmentPlans, eq(cashierTransactions.treatmentPlanId, treatmentPlans.id))`: komissiya faqat reja bilan bog'langan tx'dan hisoblanadi
  - apps/api/src/modules/cashier/cashier.service.ts:332-333,511 — vizit yo'li items rejimi, shuning uchun `treatmentPlanId` doim null (vizitning `doctorId`si ma'lum bo'lsa ham)
  - apps/api/src/modules/reports/reports.service.ts:306-319 (revenue.byDoctor) va :876-880 (ownerToday.doctors) — xuddi shu INNER JOIN, vizit tushumi `doctorId: null`ga tushadi
  - apps/api/src/modules/cashier/cashier.service.ts:864-867 izohi faqat anonim erkin POS'ni nazarda tutadi; FX-handoff (vizit -> kassa) undan keyin qo'shilgan
- **Tuzatish yo'nalishi:** Payroll createRun va reports byDoctor/doctorRev'da doktorni `COALESCE(treatment_plans.doctor_id, visit_notes.doctor_id)` sifatida oling (`cashier_transactions.visit_note_id` orqali LEFT JOIN), refund hook'idagi payrollDoctorId'ni ham shunga moslang, va bu Qaror #16 ni kengaytirish ekani uchun mahsulot tasdig'ini oling.

### LA-30 [medium] Filial doirasi faqat hisobotlarda majburlanadi: kassa/kunlik xulosa endpoint'lari har qanday branchId'ni qabul qiladi, shuning uchun IR-06 operatsion endpoint'lar orqali aylanib o'tiladi

- **Oqim:** Ruxsatlar · auditor `medium` → refuter `medium` · 📖 statik
- **Izoh:** «Kassa filial doirasini tekshirmaydi» bilan bir xil ildiz.
- 👤 **Dizayn savoli:** Qaror #29 (filial scoping) / #37 (stage completed moslashuvchan) bilan solishtiring.
- **Invariant:** I2: filialga biriktirilgan xodim boshqa filial moliyasini ko'rmasligi kerak (IR-06 reports'da majburlangan, lekin bir xil ma'lumot boshqa yo'ldan ochiq)
- **Scenariy:** Accountant faqat A filialga tayinlangan. /reports'da B filialni so'rasa 403 'report.branch_forbidden' oladi (IR-06 ishlaydi). Lekin Kassa ekranida filial selektoridan B'ni tanlaydi yoki to'g'ridan-to'g'ri GET /api/cashier/daily-summary?branchId=B va GET /api/cashier/transactions?branchId=B chaqiradi: B'ning kunlik tushumi, to'lov turlari bo'yicha taqsimot va tranzaksiyalari 200 bilan keladi. cashier.refund bo'lgani uchun B tranzaksiyasini qaytara ham oladi. Hisobot himoyasi bir xil raqamlar uchun teatr bo'lib qoladi. (Qaror #29 bu jadvallarni 'branch-scoped' deb belgilaydi, lekin kirish chegarasi qarorda aniq aytilmagan, shuning uchun confidence=medium.)
- **Dalil:**
  - apps/api/src/middleware/report-scope.ts:93 `fail('report.branch_forbidden', ...)`: loyihada filial ruxsati tekshiriladigan YAGONA joy (grep 'branch_forbidden|assertBranchAccess' faqat shu)
  - apps/api/src/modules/cashier/cashier.routes.ts:280-283 `path: '/daily-summary'` ... `requirePermission('cashier.view')`: filial tekshiruvisiz
  - apps/api/src/modules/cashier/cashier.schema.ts:93 `branchId: z.uuid(),` (so'rovdan olinadi, JWT abid/tayinlov bilan solishtirilmaydi)
  - apps/api/src/modules/cashier/cashier.service.ts:261 `if (query.branchId) filters.push(eq(cashierTransactions.branchId, query.branchId));`
- **Tuzatish yo'nalishi:** Cashier endpoint'lariga (daily-summary, transactions list, pending-visits, refund) `reportBranchScope`'ga o'xshash umumiy filial-doira middleware'ini qo'shish va `branchId` ni tayinlangan filiallar bilan solishtirish; `branchId` berilmasa ruxsat etilgan filiallar bilan cheklash.

### LA-31 [medium] Filial mudiri (Branch Manager) taklif orqali butun klinikaga tegishli (branchId=null) tayinlov yarata oladi: filial doirasi eskalatsiyasi, IR-06 aylanib o'tiladi

- **Oqim:** Ruxsatlar · auditor `high` → refuter `medium` · 📖 statik
- **Invariant:** I1/I2: assertCanGrant faqat permission kodlarini tekshiradi, filial doirasini emas. Filialga biriktirilgan chaqiruvchi branchId=null (barcha filiallar) yoki boshqa filialga tayinlov bera oladi
- **Scenariy:** Owner A filialiga X'ni Branch Manager qilib tayinlagan (branchId=A). X Xodimlar sahifasida yangi telefon raqam (masalan, o'zining ikkinchi SIM'i yoki soxta +998900000001), rol = Branch Manager (yoki Accountant) bilan taklif yuboradi va filial chip'ini tegmaydi (standartda 'Barcha filiallar'). Javobda tempPassword qaytadi va accepted_at=now bo'ladi (yangi foydalanuvchi). X shu hisob bilan kiradi va parolni almashtiradi. Endi reportBranchScope kind='all' beradi, ya'ni debt-aging, pnl, owner-today va barcha filiallar daromadi ochiq. Birinchi qadamdagi 403 'report.branch_forbidden' himoyasi butunlay chetlab o'tiladi. Xuddi shunday, BM boshqa filialga (B) Receptionist/Accountant ham tayinlay oladi.
- **Dalil:**
  - apps/api/src/modules/users/users.service.ts:115 `assertCanGrant(callerPerms(c), (await loadRolePermissionCodes(dbContext, input.roleId)) ?? []);` (filial tekshiruvi yo'q)
  - apps/api/src/modules/users/users.service.ts:117-123: faqat filial tenantda borligi tekshiriladi, chaqiruvchining filialiga tegishliligi tekshirilmaydi
  - apps/api/src/modules/users/users.service.ts:230 `branchId: input.branchId ?? null,` va `acceptedAt: createdNow ? new Date() : null`
  - apps/web/src/features/settings/components/UsersSettingsScreen.tsx:77 `initialValues: { ..., branchId: '' }` va :332-334 `<Chip value="">{t('users.all_branches')}</Chip>`: 'Barcha filiallar' standart holatda tanlangan
- **Tuzatish yo'nalishi:** `invite`da (va `addAssignment`/`updateAssignment`da ham) owner bo'lmagan chaqiruvchi uchun shunday tekshiruv qo'shish kerak: berilayotgan `branchId` chaqiruvchining tenant-wide bo'lmagan faol tayinlov filiallari ichida bo'lsin, `branchId=null` esa faqat chaqiruvchida tenant-wide tayinlov bo'lsa ruxsat etilsin. Aks holda 403 `branch.escalation` qaytsin.

### LA-32 [medium] Bajarilgan bosqich qarzi keyin acceptance o'zgartirish yoki planni bekor qilish bilan o'chib ketadi

- **Oqim:** Davolash · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** Completed bosqich qarzi bajarilgandan keyin yo'qolmasligi kerak
- **Scenariy:** Bosqich bajarildi (completed), bemor qarzdor. medical_record.edit huquqli xodim bosqichni 'rejected'ga o'tkazadi yoki butun rejani 'cancelled' qiladi -> computePlanBalance cost=0, allaqachon to'langan summa kredit bo'lib qoladi, bajarilgan ish uchun qarz yo'qoladi. Faqat audit_log iz qoldiradi, oldini oluvchi guard yo'q.
- **Dalil:**
  - apps/api/src/modules/clinical/treatment-plans/treatment-plans.service.ts:306-309 — acceptance o'tishi bosqich status'iga qaramay (completed bo'lsa ham) accepted→rejected ruxsat
  - apps/api/src/modules/clinical/treatment-plans/treatment-plans.transitions.ts:82-87 — STAGE_ACCEPTANCE_TRANSITIONS: accepted→rejected/proposed
  - apps/api/src/modules/clinical/treatment-plans/treatment-plans.transitions.ts:43 — in_progress→cancelled ruxsat; cancelled DEBT statuslarida yo'q (cashier.billing.ts:63)
- **Tuzatish yo'nalishi:** `updateStage` da `current.status==='completed'` bo'lsa acceptance'ni accepted'dan rejected/proposed'ga o'tkazishni rad et, `updatePlan` da `in_progress→cancelled` o'tishida completed bosqichlar mavjud bo'lsa (yoki to'lanmagan qarz qolsa) rad et yoki alohida ruxsat/sabab talab qil.

### LA-33 [medium] Bosqich 'completed' qoralama (imzolanmagan) vizit yozuvi saqlanishi bilan terminal bo'ladi; ko'p-vizitli bosqich birinchi vizitdayoq yopiladi

- **Oqim:** Davolash · auditor `medium` → refuter `medium` · 📖 statik
- 👤 **Dizayn savoli:** Qaror #29 (filial scoping) / #37 (stage completed moslashuvchan) bilan solishtiring.
- **Invariant:** Qaytarib bo'lmas terminal holat (stage completed + recall + ombor chiqimi) tasdiqlangan yozuvdan keyin o'rnatilsin
- **Scenariy:** Doktor 3 vizitli implant bosqichi (estimatedVisits=3) uchun 1-vizitda stageId tanlab «Saqlash» (hali imzolamagan) bosadi: bosqich darhol completed, recall yaratiladi, odontogramma (agar o'rnatilgan bo'lsa) yangilanadi, BOM ombordan yechiladi. Vizit bekor qilinsa yoki qoralama tashlansa ham bosqich completed qoladi; 2-3 vizit yozuvlarini bosqichga bog'lab bo'lmaydi (yoki stageId'siz yoziladi).
- **Dalil:**
  - apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts:145-147,167 — create: completeStageForVisit + deductStock sign'dan OLDIN, qoralamada
  - apps/api/src/modules/clinical/treatment-plans/treatment-plans.transitions.ts:61-67 — completed terminal, qaytish yo'q
  - apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts:187-193 — keyin stage'ni boshqasiga ko'chirish ham bloklangan; vizit o'chirish route'i yo'q
  - apps/api/src/modules/clinical/treatment-plans/treatment-plans.schema.ts:41 — estimatedVisits mavjud, lekin ko'p-vizitli bosqich uchun oraliq vizit yozuvi yo'li yo'q
- **Tuzatish yo'nalishi:** Stage completion + recall + odontogramma yangilanishini `sign()` ichiga ko'chirish (yoki update/create'da faqat `signedAt` mavjud bo'lganda), va ko'p-vizitli bosqich uchun stage'ni yopmasdan bog'lash (masalan vizit-bosqich bog'lanishi alohida «yakunlovchi vizit» bayrog'i bilan).

### LA-34 [medium] Dori↔allergiya tekshiruvi fail-open va faqat bitta UI yo'lida; serverda umuman yo'q

- **Oqim:** Davolash · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** Allergiya ma'lumoti noma'lum/yuklanmagan bo'lsa ham dori retsepti jimgina o'tmasin; barcha retsept yo'llarida qoida bir xil
- **Scenariy:** Penitsillinga allergik bemor. Doktor vizit sahifasini ochadi, medical-record so'rovi 5xx/sekin; Amoksitsillin yozadi -> to'qnashuv aniqlanmaydi (allergies=null), saqlash/imzolash o'tadi, retsept yaratiladi. Yoki doktor bemor kartasidagi «Retseptlar» tabidan to'g'ridan yozadi — hech qanday ogohlantirish yo'q. API'ga to'g'ridan so'rov ham ruxsat.
- **Dalil:**
  - apps/web/src/features/clinical/components/visit-notes/VisitNotePage.tsx:159 — `allergies = medicalQuery.data?.allergies ?? null`; :251 persist guard null allergiya bilan [] qaytaradi, saqlashni to'smaydi (faqat :230-231 'allergyUnknown' status qatori)
  - apps/web/src/features/clinical/components/prescriptions/PrescriptionsTab.tsx:38-52 — retsept yaratishda allergiya tekshiruvi yo'q (findDrugAllergyConflicts faqat VisitNotePage/visit-note-form'da ishlatiladi)
  - apps/api/src/modules/clinical — prescriptions/visit-notes service'larida allergiya tekshiruvi yo'q (grep 'allerg' faqat metadata/patients/dashboard)
- **Tuzatish yo'nalishi:** VisitNotePage'da allergiya noma'lum (isError/loading/403) bo'lsa retsept bilan saqlash/imzolashni CriticalActionDialog tasdig'i bilan bog'la, PrescriptionsTab'ga ham xuddi shu core findDrugAllergyConflicts tekshiruvini qo'sh, va (ixtiyoriy, kuchliroq) prescriptions/visit-notes service'da shu core funksiya bilan server tomonda tekshirib, override sababisiz 409 qaytar.

### LA-35 [medium] Odontogramma ↔ bosqich sinxroni (recordStageCompletion) web'dan erishib bo'lmaydi: resultingToothState hech qachon o'rnatilmaydi

- **Oqim:** Davolash · auditor `medium` → refuter `medium` · 📖 statik
- **Izoh:** = CLINIC-FEEDBACK #11.
- **Invariant:** Bosqich tugaganda odontogramma shu tish holatiga o'tishi kerak
- **Scenariy:** Doktor odontogrammada 16-tishni 'caries' qilib, «Rejaga qo'shish» bilan plomba bosqichini yaratadi. Bosqich bajarilib completed bo'ladi (vizit yoki Select orqali). Odontogramma 16-tishni 'caries' deb ko'rsatishda davom etadi: auto-snapshot hech qachon yozilmaydi, chunki UI resultingToothState yubormaydi. CLI-488 backend'da qurilgan, lekin foydalanuvchi uchun 'uxlab yotgan'.
- **Dalil:**
  - apps/api/src/modules/clinical/treatment-plans/treatment-plans.service.ts:383 — hook faqat `updated.resultingToothState && toothNumbers?.length` bo'lsa ishlaydi
  - apps/api/src/modules/clinical/treatment-plans/treatment-plans.schema.ts:30-45 — createTreatmentPlanSchema stage'ida resultingToothState/labOrderId yo'q; faqat PATCH /treatment-stages qabul qiladi (:60-70)
  - apps/web/src/features/clinical/clinical.api.ts:175-176,204-205,223 — updateTreatmentStage faqat {status} yoki {acceptance} yuboradi; web src'da (generated'dan tashqari) resultingToothState umuman yo'q (grep bo'sh)
  - apps/web/src/features/clinical/components/odontogram/OdontogramTab.tsx:134-152 — addToPlan stage'ni toothNumbers bilan yaratadi, holat bermaydi
- **Tuzatish yo'nalishi:** `createTreatmentPlanSchema` stage'iga ixtiyoriy `resultingToothState` qo'shib, `OdontogramTab.addToPlan` da tanlangan tish holatini uzating. Qo'shimcha: StageRow'ga resultingToothState (va labOrderId) Select'ini qo'shib, `useUpdateStage` orqali PATCH qiling. Yoki holatni backend'da stage `toothNumbers` + service'dan hosil qiling.

### LA-36 [medium] Plan qabul qilinganda bosqichlar acceptance='accepted' bo'lmaydi, lekin bosqich baribir bajarilib 'completed' bo'ladi — bajarilgan ish hisoblanmaydi

- **Oqim:** Davolash · auditor `high` → refuter `medium` · 📖 statik
- **Invariant:** Bajarilgan (completed) bosqich hisoblanadigan (acceptance=accepted) bo'lishi shart
- **Scenariy:** Registrator/doktor rejani taqdim etib konsent bog'laydi va planni 'accepted' qiladi, lekin alohida «Hammasini qabul qilish» (useAcceptAllStages) ni bosmaydi -> barcha bosqichlar 'proposed'. Doktor vizit yozuvida shu bosqichni tanlaydi -> completeStageForVisit stage'ni completed qiladi (guard o'tadi). Hisob-kitobda totalAccepted=0, qarz 0: bajarilgan davolash hech qayerda to'lov talab qilmaydi (rad etilgan 'rejected' bosqich ham xuddi shunday jimgina bajariladi).
- **Dalil:**
  - apps/api/src/modules/clinical/treatment-plans/treatment-plans.service.ts:236-243 — presented→accepted faqat konsentni tekshiradi, bosqichlar acceptance'iga tegmaydi
  - apps/api/src/modules/clinical/treatment-plans/treatment-plans.transitions.ts:156-168 — assertStageMutationAllowedForPlan acceptance'ni umuman ko'rmaydi (accepted/in_progress planda completed ruxsat)
  - apps/api/src/modules/cashier/cashier.billing.ts:132-136 — acceptance!=='accepted' bosqich cost=0 (qarzdan tashqari)
  - apps/web/src/features/clinical/components/visit-notes/VisitNotePage.tsx:191-200 — stageOptions: faqat status!=='completed' filtri, acceptance/plan statusi/skipped filtri yo'q
- **Tuzatish yo'nalishi:** updateStage'da toStatus==='completed' bo'lganda effektiv acceptance 'accepted' ekanini talab qiling (aks holda 400 yoki bosqichni avto-accept qiling). Bunga completeStageForVisit ham kiradi. Qo'shimcha: VisitNotePage stageOptions'ni acceptance==='accepted', status!=='skipped' va reja accepted/in_progress bo'yicha filtrlang. Variant: presented→accepted'da proposed bosqichlarni accepted qiling.

### LA-37 [medium] Reja 'completed' tugmasi bajarilmagan qabul qilingan bosqichlarni tekshirmaydi va ularni qaytarib bo'lmas qarzga qulflaydi

- **Oqim:** Davolash · auditor `high` → refuter `medium` · 📖 statik
- 👤 **Dizayn savoli:** Qaror #29 (filial scoping) / #37 (stage completed moslashuvchan) bilan solishtiring.
- **Invariant:** Plan completed bo'lganda unda bajarilmagan accepted bosqich bo'lmasligi yoki u tuzatilishi mumkin bo'lishi kerak
- **Scenariy:** Doktor 3 bosqichli rejani qabul qildirdi (acceptance=accepted, jami 3 mln). 1-bosqich bajarildi, 2 va 3 pending. Doktor adashib «Rejani yakunlash» ni bosadi -> plan completed (terminal). Endi 2 va 3-bosqichlar pending+accepted holatida qarzga kiradi (completed plan DEBT statusi), bosqichni skipped/rejected qilish PlanLockedError (400) bilan rad etiladi, plan qaytarilmaydi. Bemor bajarilmagan davolash uchun qarzdor bo'lib qoladi va tuzatish yo'li (UI ham, API ham) yo'q; faqat refund/qo'lda DB.
- **Dalil:**
  - apps/api/src/modules/clinical/treatment-plans/treatment-plans.service.ts:230-244 — updatePlan: faqat assertPlanTransition(in_progress→completed) va accepted uchun konsent; bosqichlar holati tekshirilmaydi
  - apps/web/src/features/clinical/components/treatment-plans/PlanCard.tsx:207-216 — `plan.status === 'in_progress'` bo'lsa bitta bosish bilan onSetPlanStatus(plan.id,'completed'), tasdiqlash dialogi yo'q
  - apps/api/src/modules/clinical/treatment-plans/treatment-plans.transitions.ts:160-162 — completed plan: har qanday bosqich mutatsiyasi PlanLockedError
  - apps/api/src/modules/cashier/cashier.billing.ts:63 — DEBT_PLAN_STATUSES = accepted,in_progress,completed
- **Tuzatish yo'nalishi:** `updatePlan`da in_progress->completed paytida accepted+pending/in_progress bosqichlar bo'lsa rad etish (yoki ularni avtomatik skipped qilish), UI'da tasdiqlash dialogi qo'shish; muqobil sifatida owner/admin uchun completed->in_progress qaytarish yo'lini ochish.

### LA-38 [medium] Rejasiz davolash: imzolangan lekin to'lanmagan vizit ertasi kuni kassa 'kutilayotgan' ro'yxatidan yo'qoladi

- **Oqim:** Davolash · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** Bajarilgan, imzolangan, hisoblanmagan xizmat hech qachon yo'qolmasin (kamida eslatma bilan)
- **Scenariy:** Rejasiz davolash: doktor kech soatda vizitni imzolaydi, bemor to'lamay ketadi yoki kassir bandligi tufayli to'lov olinmaydi. Ertasi kuni listPendingVisits uni qaytarmaydi (signedAt < dayStart); POS'da vizit bilan bog'lash yo'li yo'q, ombor allaqachon yechilgan -> xizmat jimgina hisobsiz qoladi. Imzolanmagan qoralamalar esa umuman ko'rinmaydi.
- **Dalil:**
  - apps/api/src/modules/cashier/cashier.service.ts:~662-668 — listPendingVisits: gte(visitNotes.signedAt, dayStart) faqat BUGUNGI imzolangan vizitlar; limit(100)
  - apps/web/src/features/cashier/components/PendingVisitsCard.tsx — vizitga to'lovni boshlashning yagona UI yo'li shu karta
  - apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts:167 — xizmatlar uchun ombor chiqimi yozuv yaratilganda allaqachon bajarilgan
- **Tuzatish yo'nalishi:** listPendingVisits'dan `gte(signedAt, dayStart)` ni olib tashlash yoki uni N kunlik oynaga (masalan 30 kun) almashtirish, eskilarini «kechikkan» deb belgilash, `limit(100)` o'rniga sahifalash qo'yish va PendingVisitsCard'da yoshi bo'yicha ajratish.

### LA-39 [medium] Vizit POS va plan-bosqich qarzi bir xil ishni ikki marta hisoblashi mumkin

- **Oqim:** Davolash · auditor `medium` → refuter `medium` · 📖 statik
- **Izoh:** LA-03 bilan bir xil ildiz (vizit stageId + performedServices).
- **Invariant:** Bir bajarilgan xizmat faqat bitta yo'l bilan hisoblansin
- **Scenariy:** Doktor rejaga bog'langan vizit yozadi: stageId=2-bosqich (accepted, 500 ming) va ombor chiqimi uchun performedServices ni belgilaydi. Imzolaydi. Kassada «Kutilayotgan vizitlar»da shu vizit chiqadi, kassir POS orqali 500 ming oladi (items rejimi, allocation yo'q). Plan balansi esa 2-bosqich qarzini hali ochiq ko'rsatadi -> bemor ikki marta to'laydi yoki balans noto'g'ri qoladi.
- **Dalil:**
  - apps/api/src/modules/cashier/cashier.service.ts:640-680 — listPendingVisits: visit_notes.stageId ni hisobga olmaydi, performedServices bor har bir imzolangan vizitni 'kutilayotgan' deb chiqaradi
  - apps/api/src/modules/cashier/cashier.service.ts:348-380 — create(visitNoteId): visit.stageId tekshirilmaydi; faqat signedAt, bemor, items⊆performedServices, hali to'lanmagan
  - apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts:145-167 — bir vizit ham stageId, ham performedServices (BOM ombor chiqimi uchun to'ldiriladi) bilan saqlanadi
- **Tuzatish yo'nalishi:** listPendingVisits'da stageId IS NOT NULL vizitlarni chiqarmaslik (yoki ularni «reja bo'yicha to'lang» deb belgilash), create(visitNoteId)da visit.stageId bo'lsa VisitLinkedToPlanStage xatosi bilan rad etish (yoki allocation'ga yo'naltirish).

### LA-40 [low] Bron so'rovi 'qotib qolishi': o'tib ketgan/band slot uchun faqat Rad etish mumkin; web doktor/vaqt almashtirishni yubormaydi; bemor muddat tugashidan xabar topmaydi

- **Oqim:** Bron · auditor `medium` → refuter `low` · 📖 statik
- **Invariant:** pending so'rov hal etilishi mumkin bo'lishi yoki avtomatik yopilib bemorga xabar berilishi kerak; backend qurgan doctorId imkoniyati UI'da bo'lishi kerak
- **Scenariy:** Bemor soat 09:50 da bugungi 10:00 slotni so'raydi. Registrator 10:10 da tasdiqlashga urinadi -> time.in_past (409), UI umumiy 'slot band' xabari. Boshqa vaqt/doktor taklif qilish tugmasi yo'q; faqat 'Rad etish' (sabab majburiy). Rad etilmasa so'rov 24 soat pending, bemor shu vaqt davomida botda boshqa so'rov yubora olmaydi va expire bo'lganda xabar ham olmaydi. Xuddi shu holat ikki bemor bir slotni so'raganda ikkinchisi uchun ham yuz beradi.
- **Dalil:**
  - apps/web/src/features/dashboard/reception.api.ts:98: `mutationFn: ({ id }) => confirmBookingRequest(id, {})` — doctorId hech qachon yuborilmaydi (backend: booking-requests.schema.ts:46-49 `doctorId` optional, service.ts:66-69 `doctor_required`)
  - apps/api/src/modules/booking-requests/booking-requests.service.ts:62-64: TTL faqat createdAt'ga nisbatan (24 soat), requestedStart o'tganini tekshirmaydi; o'tgan slot create()da `time.in_past` 409 -> so'rov pending qoladi (service.ts:73-83)
  - apps/api/src/lib/telegram/booking.ts:157-164: pending bor bo'lsa bemor yangi so'rov yubora olmaydi ('alreadyPending')
  - apps/api/src/modules/booking-requests/booking-requests.repository.ts:14-29 expireStale: bemorga xabar yubormaydi (sendBookingDecision faqat confirmed/declined)
- **Tuzatish yo'nalishi:** expireStale'ni requestedStart o'tganini ham qamrab olib, expire bo'lganda onAfterCommit/messenger orqali bemorga xabar yuborish (sendBookingDecision'ga 'expired' qo'shish); web'da 409 da doktor tanlash (Select) bilan confirmBookingRequest(id, {doctorId}) ni yuborish.

### LA-41 [low] Imzolangan vizit yozuvi / bekor qilingan yozilish uchun ombor chiqimini qaytarish yo'li yo'q

- **Oqim:** Ombor · auditor `medium` → refuter `low` · 📖 statik
- **Invariant:** INV3: bekor qilingan vizit moddiy sarfi qaytadi yoki qaytarish yo'li bor
- **Scenariy:** Doktor vizitni yozadi (yozilishga avtomatik bog'lanadi, VisitNotePage persist), xizmat BOM'i chiqadi, imzolaydi. So'ng xato xizmat tanlangani ma'lum bo'ladi yoki registrator in_progress yozilishni 'cancelled'/'no_show' qiladi. Yozuv 409 bilan tahrirlanmaydi, bekor qilish stockka tegmaydi; yagona yo'l - qo'lda 'in' harakat (sababi bog'lanmagan, avto-jurnalda ko'rinmaydi). Natijada materiallar abadiy hisobdan chiqib ketadi va 'necha kunga yetadi' sarfi oshiq ko'rsatiladi. Bundan tashqari cancelled->scheduled qayta faollashtirib yana yozuv yaratilsa ikkinchi chiqim bo'ladi (bitta yozilishga bir nechta yozuv cheklovi yo'q).
- **Dalil:**
  - apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts:182 `if (before.signedAt) throw new VisitNoteSignedError(id);` — imzodan keyin reconcile yo'li yopiq
  - apps/api/src/modules/clinical/visit-notes/visit-notes.routes.ts: faqat get/post/get-by-id/patch/sign marshrutlari (DELETE/void yo'q)
  - apps/api/src/modules/appointments/appointments.transitions.ts:~44-50 `in_progress: ['completed','cancelled','no_show']` — appointments.service.ts:460-500 cancel/no_show hook'lari faqat recall/queue/plan bilan bog'liq, stock yo'q
- **Tuzatish yo'nalishi:** Yozilish cancelled/no_show ga o'tganda yoki imzolangan yozuv bekor qilinganda bog'liq visit_note uchun stock chiqimini teskari harakat bilan qaytaradigan servis qo'shing (`reconcileForServices(before, [], noteId)`), idempotent qiling va appointmentId bo'yicha bitta faol yozuv cheklovini kiriting.

### LA-42 [low] Vizit tahririda qaytarish JORIY BOM bo'yicha hisoblanadi, haqiqiy chiqim movement'lari bo'yicha emas (ombor drifti)

- **Oqim:** Ombor · auditor `medium` → refuter `low` · 📖 statik
- **Invariant:** INV1/INV3: chiqim va qaytarish simmetrik; qoldiq = ledger
- **Scenariy:** 1) Doktor X xizmati bilan vizit yozuvini (qoralama) saqlaydi: BOM X->Anestetik 2 ta, ombordan 2 chiqadi. 2) Ombor menejeri BOM'ni o'chirib qayta qo'shadi (3 ta qilib) yoki butunlay o'chiradi. 3) Doktor qoralamani tahrirlab X'ni olib tashlaydi: reconcile 3 ta qaytaradi (haqiqatda 2 chiqqan -> +1 fantom qoldiq) yoki BOM yo'q bo'lsa 0 qaytaradi (2 ta abadiy yo'qoladi). Teskarisi: BOM vizit saqlangandan KEYIN qo'shilgan bo'lsa, X'ni olib tashlash hech qachon chiqmagan materialni 'qaytaradi'. Ombor qoldig'i va 'necha kunga yetadi' noto'g'ri bo'ladi, hech qanday xato ko'rsatilmaydi.
- **Dalil:**
  - apps/api/src/modules/stock/stock.service.ts:528-531 `const boms = await db.select().from(serviceMaterials).where(inArray(serviceMaterials.serviceId, [...deltas.keys()]))` — qaytarish uchun ham hozirgi BOM o'qiladi
  - apps/api/src/modules/stock/stock.service.ts:543-551 `quantity: bom.qtyPerService` — `source_visit_note_id` bo'yicha oldingi 'out' qatorlari qidirilmaydi
  - apps/api/src/modules/stock/stock.routes.ts:~270-285 BOM uchun PATCH yo'q, faqat POST/DELETE (qty o'zgartirish = o'chirish+qayta qo'shish)
- **Tuzatish yo'nalishi:** `reconcileForServices`da `delta < 0` bo'lsa miqdorni joriy BOM'dan emas, shu `sourceVisitNoteId` va `itemId` bo'yicha `visit_auto` `out` va `visit_edit_return` `in` movement'lari yig'indisidan hisoblang (ledger-based qaytarish).

### LA-43 [low] Qayta urinib bo'lmaydigan ('failed') outbox op'lari uchun qayta navbatga qo'yish ham, ko'rinadigan chora ham yo'q; kutilayotgan narx tasdig'i abadiy 'kutilmoqda'da qolishi mumkin

- **Oqim:** Lab · auditor `medium` → refuter `low` · 📖 statik · 2-run
- **Invariant:** Hech bir op jimgina yo'qolmasligi; kutilayotgan holat doimiy xatoda tozalanishi yoki qayta urinishi kerak
- **Scenariy:** Klinika 0 baytli yoki Hub rad etadigan fayl (masalan file.empty 400, file.too_large) yuklaydi, yoki approve_price Hub'da doimiy 4xx (case.not_found/purged) oladi. Op 'failed' bo'ladi, buyurtma 'hub_sync_status=failed', faqat umumiy hisoblagich o'sadi. approve_price bo'lsa buyurtma ekranida 'narx tasdig'i kutilmoqda' abadiy turadi, qayta bosish 'pending' qaytaradi va hech narsa yubormaydi; xarajat hech qachon yozilmaydi, foydalanuvchi uchun chiqish yo'li yo'q.
- **Dalil:**
  - apps/api/src/lib/lab-hub/sync.ts:294-322 non-retryable LabHubError -> outbox status='failed', lab_orders.hub_sync_status='failed' (hech qachon 'pending'ga qaytmaydi)
  - apps/api/src/modules/lab-hub/lab-hub.routes.ts: faqat GET /status (failedOutbox soni), requeue/retry endpointi yo'q
  - apps/api/src/lib/lab-hub/sync.ts:284-292 faqat PRICE_REJECTED kodlari (price.mismatch/not_proposed/already_approved) approve_price uchun kutish holatini tozalaydi; boshqa doimiy 4xx (masalan case.not_found, 400 validatsiya, case.purged) pending approval'ni (price_approval_requested_*) tozalamaydi
  - apps/api/src/modules/lab-orders/lab-orders.hub.ts:154-165 takroriy bosish `status:'pending'` qaytaradi (idempotent), qayta navbatga qo'ymaydi
- **Tuzatish yo'nalishi:** sync.ts da approve_price uchun har qanday retryable bo'lmagan xatoda ham rejectPriceApprovalOp (kutish holatini tozalash) ni chaqiring va/yoki 'failed' qatorlarni qayta navbatga qo'yadigan (status='pending', next_attempt_at=now) requeue endpoint + tugma qo'shing.

### LA-44 [low] upsert_case 'applied:false' e'tiborsiz: lab qabul qilgan ishga lokal tahrir jimgina Hub'ga yetmaydi, lekin 'synced' deb belgilanadi

- **Oqim:** Lab · auditor `medium` → refuter `low` · 📖 statik · 2-run
- **Invariant:** 'synced' belgisi Hub o'zgarishni haqiqatan qo'llaganini bildirishi kerak
- **Scenariy:** Lab 10:00:10 da ishni 'accepted' qiladi. Poll hali kelmaganligi sababli klinikada hub_status='sent'. 10:00:30 da shifokor tish raqami/rang/ish turini tahrirlaydi: lokal tekshiruv o'tadi, DB yangilanadi, 'upsert_case' navbatga tushadi. Push: Hub 'sent' emasligi uchun applied:false qaytaradi; klinika buni 'synced' deb belgilaydi. Lab eski tish/rang bo'yicha ishlaydi, klinika ekranida esa yangi qiymat va yashil 'sinxronlangan' — xabar yo'q.
- **Dalil:**
  - apps/lab-hub-api/src/modules/clinic/clinic.routes.ts:397-404 `if (existing.status !== 'sent') return c.json({... created:false, applied:false })` — tahrir qo'llanmaydi
  - apps/api/src/lib/lab-hub/sync.ts:111-125 executeOp 'upsert_case': putCase javobidagi `applied` o'qilmaydi, har doim hubSyncStatus:'synced' yoziladi
  - apps/api/src/modules/lab-orders/lab-orders.service.ts:199-211,264 tahrir 'locked_by_lab' bilan faqat lokal hubStatus != 'sent' bo'lganda bloklanadi; hubStatus poll orqali (60 s sikl) yangilanadi
- **Tuzatish yo'nalishi:** executeOp 'upsert_case' da `res.applied === false` bo'lsa 'synced' yozmang: hubSyncStatus ni 'failed' (yoki yangi 'rejected_locked') qiling va hubStatus ni `res.status` bilan yangilang. Shunda keyingi tahrirlar 'locked_by_lab' bilan bloklanadi va shifokor xabarni labga xabar orqali yuboradi.

### LA-45 [low] /api/activate va /api/reset-owner-password bulutda ham shartsiz ulangan; skip yo'li 'birinchi tenant' owner telefonini qaytaradi, reset esa 'eng eski tenant' owner'ini o'zgartiradi. Himoya faqat tasodifiy konteyner xususiyatlariga tayanadi

- **Oqim:** Litsenziya · auditor `medium` → refuter `low` · 📖 statik · 2-run
- **Invariant:** I8
- **Scenariy:** Desktop mijozi o'z litsenziya kalitiga ega. Vendor unga prepare-reinstall qiladi (fingerprint NULL). Mijoz kalitni bulut ilovasining https://app.../api/activate manziliga yuboradi. Konteyner fingerprint hisoblay olsa va LICENSE_PATH yoziladigan bo'lsa (volume, root image, keyinchalik Dockerfile o'zgarishi), .lic bulut konteynerida yoziladi va skip javobi boshqa SaaS klinika owner'ining telefonini qaytaradi. So'ng vendordan reset token olib /api/reset-owner-password chaqirilsa, eng eski SaaS tenant owner'ining paroli almashadi. Hozir buni USER bun va DMI'ning o'qilmasligi bloklaydi (FINGERPRINT_UNAVAILABLE yoki LICENSE_WRITE_FAILED). Shuning uchun ishonch past, lekin aniq desktop-only guard yo'q.
- **Dalil:**
  - apps/api/src/app.ts:159,167 — `app.route('/api/activate', ...)`, `app.route('/api/reset-owner-password', ...)` DENTAL_LOCAL_DESKTOP tekshiruvisiz
  - apps/api/src/routes/activate.ts:60-76 — `select ... from(tenants).limit(1)` (tenants'da RLS yo'q) -> owner telefoni javobga
  - apps/api/src/routes/reset-owner-password.ts:68-88 — `findFirst(orderBy createdAt asc)` -> o'sha owner'ning password_hash'i
  - apps/api/Dockerfile:69 — `USER bun` (/var/lib/dental-service'ga yozish va DMI uuid'ni o'qish odatda imkonsiz: bu yo'lni hozir faqat shu yopib turibdi)
- **Tuzatish yo'nalishi:** Eng kichik tuzatish: `app.ts`da `/api/activate` va `/api/reset-owner-password` route'larini faqat `env.DENTAL_LOCAL_DESKTOP` rost bo'lganda ulash (yoki bulutda handler'da darhol 404 qaytarish), shunda himoya fayl ruxsatlariga emas, rejim tekshiruviga tayanadi.

### LA-46 [low] Yozilish create/update doctorId/patientId tenantga tegishliligini tekshirmaydi; tenant_id'siz global EXCLUDE constraint'lar A tenantiga B tenantining bronlarini bloklash imkonini beradi

- **Oqim:** Izolyatsiya · auditor `medium` → refuter `low` · 📖 statik
- 👤 **Dizayn savoli:** Qaror #29 (filial scoping) / #37 (stage completed moslashuvchan) bilan solishtiring.
- **Invariant:** I3 + I5: a foreign ID is checked under RLS; one tenant's rows must not limit another tenant
- **Scenariy:** (a) Doctor D works in clinics A and B. A receptionist in A (appointment.create) books D for all day, or for days ahead. In B, availability shows the slot as free (the RLS-scoped list cannot see A's appointments), but B's receptionist gets 409 conflict.doctor_busy for every booking and the conflict cannot be seen anywhere. Clinic B learns indirectly when D is busy in A. (b) A dual-role user puts B's patient UUID into an A appointment: the FK passes and A's list shows a nameless appointment. B can no longer book its own patient at that time (409 patient_busy, invisible to B), and deleting the patient in B cascades and deletes A's appointment. Note: blocking a doctor across tenants may be intentional ('one person cannot be in two places'), but it is not documented (CLI-408 doc covers only `doctor_id WITH =`). The missing doctorId/patientId check is a plain gap either way.
- **Dalil:**
  - apps/api/src/modules/appointments/appointments.service.ts:288-325 -- checkConflict/checkPatientConflict are RLS-scoped (they cannot see other tenants), then `sp.insert(appointments).values({ tenantId, branchId: input.branchId, patientId: input.patientId, doctorId: input.doctorId, ...})`; no ownership validator call (41
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

## Tekshirilmagan (44, hammasi low)

| Ishonch | Oqim | Topilma |
|---|---|---|
| low | Bron | Ko'chirilgan 'confirmed' yozilish confirmed'ligicha qoladi va bemorga xabar ketmaydi; <24 soat qolsa eslatma ham yo'q |
| low | Bron | No-show strike faqat maslahat: Telegram o'z-o'zidan bron va so'rov kartasi 'flagged' bemorni ko'rsatmaydi |
| low | Bron | Tasdiqlashda doctorId/branchId/patientId tenantga tegishliligi tekshirilmaydi, faqat FK (platform-global users) |
| medium | Bron | Booking-requests ro'yxati filial bo'yicha filtrlanmaydi: bir filial registratori boshqa filial so'rovlarini ko'radi va tasdiqlay oladi |
| medium | Bron | Kelajakdagi yozilishni no_show qilish mumkin -> strike darhol yoziladi |
| medium | Bron | Shifokor navbatda 'Keyingisini chaqirish' tugmasi boshqa shifokor bemorini ko'rsatadi -> 403 |
| medium | Bron | Slot tugmasi indeksi eskirgan xabarlarda boshqa kunning slotiga mos keladi (bot) |
| medium | Bron | Bot 'Bekor' tugmasi erta check-in qilingan bemorning ochiq navbat ticket'ini yopmaydi |
| medium | Bron | Bron so'rovi kartasida vaqt brauzer mintaqasida (uz-UZ, TZ'siz) ko'rsatiladi |
| low | Ombor | BOM/partiya/harakat endpointlari item/xizmat mavjudligi va tenant egaligini tekshirmaydi (500 yoki begona UUID'li yetim yozuv) |
| low | Ombor | Parallel vizit PATCH'larida reconcile qulfsiz 'before' ustida ishlaydi (qo'sh/yo'qolgan chiqim) |
| low | Ombor | deductForServices BOM qatorlarini tartibsiz yangilaydi (parallel vizitlarda deadlock -> vizit saqlanmaydi) |
| medium | Ombor | 'Necha kunga yetadi': 30 kunga bo'lish yangi itemda sarfni kamaytirib ko'rsatadi; eski vizit qaytarishi oynani manfiy qiladi |
| high | Lab | Klinika Hub'dagi 'remake' oqimini umuman ishga tushira olmaydi (uxlab yotgan feature); tasdiqlangan narx qayta ishlash uchun o'zgartirilmaydi |
| medium | Lab | Outbox FIFO: diskda yo'q fayl (ENOENT) cheksiz qayta uriniladi va shu buyurtmaning approve_price/message/delivered op'larini bloklaydi |
| medium | Lab | Hub tasdig'idan yozilgan 'Laboratoriya' xarajati erkin tahrir/o'chirishga ochiq — approved_price bilan uzilib qoladi va qayta yozilmaydi |
| high | Litsenziya | Tiklash tokeni tenant borligi tekshirilishidan oldin sarflanadi: reset.no_tenant (va tx xatosi) tokenni behuda yoqib yuboradi |
| high | Litsenziya | pre-migrate dump'lari retention'siz to'planadi; migratsiya qayta-qayta yiqilsa har startda yangi dump qo'shiladi |
| low | Litsenziya | Tiklashdan keyin Valkey'dagi eslatma job'lari tiklangan bazaga mos kelmaydi |
| medium | Litsenziya | Aktivatsiyada tenant yaratilib .lic yozilmay qolsa, qayta urinish 'avvalgi parolingiz o'zgarmadi' deb noto'g'ri maslahat beradi |
| medium | Litsenziya | Heartbeat monotonik langarni Date.now() bilan ko'taradi va hech qachon pasaytirmaydi: soat xato oldinga surilib heartbeat o'tsa, litsenziya o'sha sanagacha bloklanadi (izoh aksini da'vo qiladi) |
| medium | Litsenziya | Supervisor so'rovlarida timeout yo'q: «Qayta tekshirish» va aktivatsiya osilib qolishi mumkin |
| medium | Litsenziya | Backup/restore so'rov fayli audit yozuvidan oldin diskka yoziladi: audit yiqilsa (500 -> rollback) tiklash baribir bajariladi, lekin izi qolmaydi |
| low | Xabarlar | Bemor Telegram orqali bekor qilganda xodimga bildirishnoma yo'q; muvaffaqiyatsiz bo'lgan eslatma job'i keyingi reschedule'da qayta qo'yilmaydi |
| low | Xabarlar | Bir xil bot tokeni ikki tenantda ishlatilishi tekshirilmaydi; kontakt guruh chat'ida ham bemorni bog'laydi |
| medium | Xabarlar | Arxivlangan bemor Telegram/recall oqimlarida faol hisoblanadi |
| medium | Xabarlar | Reminder/recall tashqi HTTP chaqiruvi tx ichida, timeout'siz; Telegram 'Kelaman' tugmasi muvaffaqiyatsizlikni 'allaqachon' deb ko'rsatadi |
| high | Pul | Vizit to'lovi refund qilingach vizitni qayta undirib bo'lmaydi; qisman undirish ham vizitni 'to'langan' qiladi |
| medium | Pul | Finalized run'da doktor qatori bo'lmasa refund keyingi davrda komissiya olinmagan daromaddan ayiriladi |
| medium | Pul | Fiskal payload izchil emas: amount=paidAmount, items chegirmasiz subtotal, discount maydoni yo'q; reja to'lovida items bo'sh |
| medium | Pul | Bekor qilingan reja krediti umumiy balansda boshqa reja qarzini neytrallaydi, lekin kreditni qo'llash yo'li yo'q |
| high | Ruxsatlar | Yozilish uchun shifokorlar ro'yxati muddati o'tgan (validTo < now) tayinlovlarni ham qaytaradi |
| high | Ruxsatlar | Ishlamaydigan 'o'lik' permission'lar: staff.view/invite/edit/delete va user.deactivate hech bir endpoint/ekranda tekshirilmaydi, lekin rol quruvchida tanlanadi |
| high | Ruxsatlar | Sidebar'dagi 'Barcha filiallar' bandi endi eng eski filialga o'tkazadi (owner uchun ham), yorliq natijaga mos emas |
| medium | Ruxsatlar | Ko'p tayinlovli foydalanuvchida rol layout'i/dashboard va standart filial tartibsiz (ORDER BY yo'q) birinchi qatordan olinadi |
| medium | Ruxsatlar | ManagerDashboard filialga biriktirilgan Branch Manager uchun tenant-wide hisobotlarni so'raydi va jim 403 oladi (Qarz KPI '—', ogohlantirish yo'q) |
| low | Izolyatsiya | The Soliq fiscal provider sends fetch inside the cashier tx (no timeout, while the stage row is locked FOR UPDATE); if the tx rolls back, the receipt is already registered with the tax authority |
| medium | Izolyatsiya | Other create endpoints also accept cross-tenant FK IDs without an RLS check (queue walk-in patientId/branchId/serviceId, cashier branchId) |
| medium | Izolyatsiya | Bot (Telegram) path: onAfterCommit runs immediately in the fake Context, before the withTenant tx commits (the P4 invariant breaks in the bot path) |
| medium | Izolyatsiya | Deleting a patient image or lab-order file removes it from disk before commit; if the tx rolls back, the DB row points to a missing file |
| low | Davolash | Konsent: terminal planda qayta bog'lash, bemor imzosisiz forma va default 'muddatsiz' |
| low | Davolash | Odontogramma snapshot'i last-write-wins: eski qoralamadan saqlash avto-snapshot'ni (bosqich tugashi) ustiga yozadi |
| low | Davolash | Plan bosqichlarini tahrirlab bo'lmaydi (bosqich qo'shish/narx o'zgartirish yo'q), reja totalCost qotib qoladi |
| medium | Davolash | Bosqichni plan ekranidan (Select) completed qilish ombor BOM chiqimini bajarmaydi — bir xil ma'no uchun ikki yo'l |

## Qamrov bo'shliqlari (tanqidchi) — ixtiyoriy 2-round

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

---

# 2-round: qamrov bo'shliqlari (run `wf_52f45158-dac`, 42 agent, ~3,6M token)

Tanqidchining 11 bo'shlig'i oqim sifatida (rbac/tenancy/lab/license/money/treatment — A3 opus; messaging/booking/inventory — A2). 80 noyob topilma → 30 tekshirildi, **30 tasdiqlandi**; 50 tasi alohida refuter run'ida (`FIX-BACKLOG` To'lqin 10). Advisor grep: 0.

| ID | Og'irlik | Oqim | Topilma |
|---|---|---|---|
| LB-01 | high | booking-gap8 | Navbat sahifalarida bemor ismi faqat eng yangi 100 bemordan hal qilinadi: check-in ro'yxati va navbat kartalarida '—' |
| LB-02 | high | lab-gap3 | Hub bazasi zaxiradan tiklangandan keyin klinika sinxroni jimgina buziladi: seq qayta ishlatiladi va dedupe uni tashlab yuboradi, yangi klasterda esa tx_id kursordan kichik bo'lib qoladi |
| LB-03 | high | lab-gap3 | Lab foydalanuvchilari uchun parolni tiklash yo'li umuman yo'q: lead ham, texnik ham. Supervisor javobi yo'qolsa, lead vaqtinchalik parolini hech qachon olmaydi |
| LB-04 | high | license-gap5 | Klient PC saqlangan (TOFU) server manziliga health-check'siz ulanadi: server IP o'zgarsa yoki server kechroq yonsa mahsulot ichida qayta ulanish yo'li yo'q |
| LB-05 | high | messaging-gap4 | Desktop: Valkey doimiylikka ega emas — har qayta ishga tushganda kutilayotgan barcha 24 soatlik eslatmalar yo'qoladi, DB'dan qayta tiklash yo'q |
| LB-06 | high | tenancy-gap2 | Qayta ulanishda (hubClinicId o'zgarganda) kursor va lab_hub_applied_events qayta o'rnatilmaydi — yangi Hub hodisalari jimgina yo'qoladi |
| LB-07 | high | tenancy-gap2 | Kursor/dedup kaliti Postgres klaster xid'i va sequence qiymatiga bog'langan — Hub pg_dump'dan tiklansa barcha klinikalar sinxroni jimgina to'xtaydi yoki hodisalar tashlanadi |
| LB-08 | medium | booking-gap9 | Starter tarif desktop'da shifokor yarata olmaydi: 'staff' moduli yo'q -> /api/users/invite 403 -> yozilish (booking) oqimi ishlamaydi |
| LB-09 | medium | lab-gap3 | Vaqtinchalik parol noto'g'ri kiritilsa, ChangePasswordPage xatoni ko'rsatmaydi: global 401 handler sessiyani o'chiradi va foydalanuvchini /login ga otadi |
| LB-10 | medium | license-gap5 | SaaS 'Qayta tekshirish' tugmasi access token muddati o'tgach doim 'hali tugagan' deydi: vendor renew qilgan bo'lsa ham klinika ochilmaydi |
| LB-11 | medium | license-gap5 | Vendor SaaS klinikani to'xtata olmaydi: deactivate faqat litsenziya qatorini qidiradi, renew o'tgan sanani rad etadi, admin UI'da SaaS uchun tugma yo'q |
| LB-12 | medium | license-gap5 | Blok ekranida chiqish va workspace almashtirish yo'q: ko'p klinikali xodim faol bo'lmagan klinikada qamalib qoladi |
| LB-13 | medium | license-gap5 | Server discovery javobida birinchi tashqi IPv4 interfeysini yuboradi, so'rov kelgan interfeysni emas: virtual/VPN adapterli serverda klient noto'g'ri manzilni saqlaydi |
| LB-14 | medium | messaging-gap4 | Obunasi/litsenziyasi tugagan tenant uchun worker (eslatma, recall) va Telegram bot to'liq ishlashda davom etadi — blok faqat HTTP'da |
| LB-15 | medium | money-gap6 | Xarajatlar modulida filial doirasi umuman yo'q: filial mudiri boshqa filial va klinika miqyosidagi xarajatlarni ko'radi, yaratadi, tahrirlaydi va o'chiradi |
| LB-16 | medium | money-gap6 | Xizmat foydasi (procedureMix) va revenue.byService faqat erkin POS item'laridan: davolash rejasi orqali to'langan barcha xizmatlar «Qaysi xizmat ko'p foyda beradi?» javobidan tushib qoladi |
| LB-17 | medium | money-gap6 | Refund dialogi va tranzaksiya jadvali hisob-faktura summasini (totalAmount) ko'rsatadi, server esa faqat qolgan paidAmount'ni qaytaradi: qisman to'langan sotuvda kassir ko'rsatilgandan kam yozilgan pulni qaytarib beradi |
| LB-18 | medium | rbac-gap0 | Lab navbati/diqqat widget'lari faqat eng yangi 20 ta buyurtma ustida hisoblanadi: eski faol va muddati o'tgan buyurtmalar Texnik, Shifokor va Registrator dashboard'idan yo'qoladi |
| LB-19 | medium | rbac-gap0 | 'Yozish' tugmalari (Bemorlar ro'yxati, Recall paneli) patientId'ni URL'da uzatadi, lekin yozilish ekrani uni o'qimaydi: bemor oldindan tanlanmaydi |
| LB-20 | medium | rbac-gap0 | patient_image.upload (Nurse'da ham bor) rasmni butunlay o'chirishga ruxsat beradi, imzolangan vizit yozuviga biriktirilgan rentgenni ham |
| LB-21 | medium | rbac-gap0 | Lab buyurtma 'shifokori' doim ekranni ochgan foydalanuvchi: Technician (lab_order.manage) yaratgan buyurtma Hub'ga texnik nomi bilan ketadi va haqiqiy shifokorga ko'rinmaydi |
| LB-22 | medium | tenancy-gap1 | A Branch Manager assigned to one branch can edit another branch's settings and its doctors' schedules and time off, which breaks booking in that branch |
| LB-23 | medium | tenancy-gap1 | Expenses: decision D-8 restricts expenses to the caller's branches, but there is no FX item. The screen loads the whole clinic's expenses by default, and a branch user can edit or delete another branch's expenses |
| LB-24 | medium | tenancy-gap1 | Stock: a doctor or Branch Manager assigned to one branch can adjust, set to zero or move another branch's stock items |
| LB-25 | medium | tenancy-gap1 | Payroll is clinic-wide, but the Branch Manager template has payroll.manage: a branch-assigned manager sees every branch's salaries and can create, finalize and delete the clinic-wide run |
| LB-26 | medium | treatment-gap7 | Vizitning yozilishga avto-bog'lanishi faqat «bugungi birinchi bekor qilinmagan yozilish» bo'yicha, tanlash UI'si yo'q: o'tgan kun bandi hech qachon yopilmaydi, boshqa shifokor yozilishi bog'lanadi |
| LB-27 | medium | treatment-gap7 | «Imzolanmagan vizit yozuvi» hisoblagichi qoralamani bajarilgan deb hisoblaydi (signedAt tekshirilmaydi) |
| LB-28 | low | lab-gap3 | lab_users.phone butun Hub bo'yicha unique, hisobni o'chirib ham, telefonini o'zgartirib ham bo'lmaydi: labdan ketgan texnik boshqa labga qo'shila olmaydi va o'z labining lead'i bo'la olmaydi |
| LB-29 | low | messaging-gap4 | Recall worker: `contacted`ga UPDATE shartsiz va qator qulflanmagan — tashqi send davomida (timeout'siz) parallel o'zgarish ustidan yoziladi |
| LB-30 | low | rbac-gap0 | Registrator 'Bugun' ekranidagi 'Lab muddati o'tgan' diqqat bandi Receptionist roli uchun hech qachon chiqmaydi va havolasi taqiqlangan sahifaga olib boradi |

### LB-01 [high] Navbat sahifalarida bemor ismi faqat eng yangi 100 bemordan hal qilinadi: check-in ro'yxati va navbat kartalarida '—'

- **Oqim:** booking-gap8 · auditor `high` → refuter `high` · 📖 statik
- **Invariant:** Har navbat/check-in satrida bemor ismi tenant'dagi istalgan bemor uchun to'g'ri ko'rsatilishi kerak
- **Scenariy:** Klinikada 400 bemor bor. Registrator ertalab 'Yangi chipta' -> 'Yozilishdan' ni ochadi: bugungi 15 ta yozilishdan eski (eng yangi 100 ga kirmagan) bemorlar qatorida ism o'rnida '—' va faqat vaqt. Qaysi bemor kelganini tanlab bo'lmaydi, adashib boshqa kishining yozilishini check-in qilish mumkin. Xuddi shu '—' QueueBoard'dagi 'Hozir xizmatda', 'Keyingi' va 'Hali kelmagan' kartalarida ham chiqadi. Testlar mockda 5 ta bemor beradi, shuning uchun ushlanmagan.
- **Dalil:**
  - apps/web/src/features/queue/components/CheckInDialog.tsx:23 `const patients = usePatientsAll();` va :66 `const patientName = (id: string) => patients.data?.data.find((p) => p.id === id)?.fullName ?? '—';`
  - apps/web/src/features/queue/queue.api.ts: usePatientsAll -> `listPatients({ search: search || undefined, pageSize: 100 })`; apps/api/src/modules/patients/patients.service.ts:221 `.orderBy(desc(patients.createdAt)).limit(query.pageSize)` va patients.schema.ts:115 `max(100)` (faqat eng yangi 100 ta)
  - apps/web/src/features/queue/components/QueueBoard.tsx:44,54,88 — `patientNameById` ham shu 100 talik ro'yxatdan, `?? '—'`; check-in-candidates DTO (queue.mapper.ts:toCheckInCandidateDto) patientName qaytarmaydi
  - Dashboard bu muammoni allaqachon hal qilgan (reception.api.ts:34 usePatientNames -> getPatient(id) per id), navbat sahifalari ko'chirilmagan; CheckInDialog.tsx:19-21 izohi 'cheklanmagan' deydi, aslida cheklangan
- **Tuzatish yo'nalishi:** Navbat ticketlari va check-in-candidates DTO'siga backend'da `patientName` qo'shish (patients bilan join), yoki web'da reception.api.ts dagi usePatientNames(ids) (per-id getPatient) ni QueueBoard va CheckInDialog'ga ko'chirish; usePatientsAll'ni nom lookup uchun ishlatmaslik.

### LB-02 [high] Hub bazasi zaxiradan tiklangandan keyin klinika sinxroni jimgina buziladi: seq qayta ishlatiladi va dedupe uni tashlab yuboradi, yangi klasterda esa tx_id kursordan kichik bo'lib qoladi

- **Oqim:** lab-gap3 · auditor `high` → refuter `high` · 📖 statik
- **Invariant:** I1
- **Scenariy:** Vendor kunlik zaxiradan (seq=N) hujjatlashtirilgan pg_restore bilan Hub bazasini tiklaydi. Klinika A tiklashdan oldin seq N+1..M gacha hodisalarni qo'llagan, ular lab_hub_applied_events'da turibdi. (a) Tiklash o'sha klasterda bo'lsa: setval sequence'ni N ga qaytaradi. Lab yangi ishni 'accepted', keyin 'ready' qiladi, narx taklif qiladi, xabar yozadi. Bu hodisalar yana N+1..M seq'larini oladi. tx_id yangi va katta, shuning uchun /changes ularni qaytaradi. Lekin klinika `if (!fresh) continue` bilan hammasini «allaqachon qo'llangan» deb o'tkazib yuboradi va kursorni oldinga suradi. Natijada klinikada holat, narx taklifi va lab xabarlari ko'rinmaydi, xato ham chiqmaydi. (b) Tiklash yangi klasterda bo'lsa (VPS yoki volume yo'qolgani uchun tiklash): xid kichik sondan boshlanadi. Klinika kursori `<eski katta tx>.<seq>` bo'lgani uchun `(tx_id,seq) > cursor` hech qachon bajarilmaydi. Barcha klinikalar uchun poll abadiy 0 hodisa qaytaradi, lastError bo'sh, lab bilan sinxron butunlay to'xtaydi.
- **Dalil:**
  - apps/api/src/lib/lab-hub/sync.ts:514-519 `.insert(labHubAppliedEvents).values({ tenantId, seq: ev.seq }).onConflictDoNothing()... if (!fresh) continue; // allaqachon qo'llangan` (dedupe faqat Hub seq bo'yicha)
  - packages/db-schema/src/tables/lab-hub.ts:161 `primaryKey({ columns: [t.tenantId, t.seq] })`
  - apps/lab-hub-api/src/db/schema.ts:245-249 `seq: bigserial(...)`, `txId ... default(sql`(pg_current_xact_id()::text)::bigint`)` (xid klasterga xos)
  - apps/lab-hub-api/src/modules/clinic/clinic.routes.ts:692-693 `txId < pg_snapshot_xmin(...)` va `(txId, seq) > (sinceTx, sinceSeq)`
- **Tuzatish yo'nalishi:** Hub'ga instansiya yoki davr identifikatorini (masalan, `hub_epoch`ni Hub DB'da `system_identifier` yoki restore'dan keyin yangilanadigan UUID sifatida) qo'shish kerak. Uni `/changes` javobida qaytarish, klinika esa epoch o'zgarganini ko'rganda kursorni '0.0'ga tushirishi va `lab_hub_applied_events`ni tozalashi (yoki dedupe kalitini (epoch, seq) qilishi) kerak. Eng kam yo'l: README'ga restore'dan keyin barcha klinika kursorlarini qayta o'rnatish qadamini va epoch tekshiruvini qo'shish.

### LB-03 [high] Lab foydalanuvchilari uchun parolni tiklash yo'li umuman yo'q: lead ham, texnik ham. Supervisor javobi yo'qolsa, lead vaqtinchalik parolini hech qachon olmaydi

- **Oqim:** lab-gap3 · auditor `high` → refuter `high` · 📖 statik
- **Invariant:** I2
- **Scenariy:** 1) Texnik T parolini unutadi. Lead StaffPage'da faqat «o'chirish/faollashtirish»ni ko'radi. Yangi hisob ham ochib bo'lmaydi, chunki telefon band (409). T portalga qayta kira olmaydi. 2) Lead parolini unutadi. Vendor Supervisor'da ham, Hub ichki API'da ham hech narsa qila olmaydi. Lab ish taqsimlash, narx taklif qilish, ulanishlarni tasdiqlash va akt-sverkadan butunlay mahrum bo'ladi. 3) Vendor lab yaratadi. Hub commit qiladi, lekin javob 10 s ichida kelmaydi (argon2 + sekin tarmoq) yoki uziladi. Admin 502 ko'radi va qayta bosadi, endi 409 phone_taken keladi. Lab katalogda paydo bo'lgan, lekin lead'ning vaqtinchalik paroli hech kimda yo'q va uni tiklab bo'lmaydi. Labni o'chirish endpointi ham yo'q. 4) Ikki lead bir vaqtda bir-birini o'chiradi va labda faol lead qolmaydi; tiklash yo'li yo'q.
- **Dalil:**
  - apps/lab-hub-api/src/modules/lab/lab.routes.ts:198-201 passwordHash faqat change-password'da o'zgaradi va u currentPassword'ni talab qiladi
  - apps/lab-hub-api/src/modules/lab/lab.routes.ts:832-839 PATCH /users/{id} faqat `fullName`, `isActive` qabul qiladi (`.strict()`), parolni tiklash yo'q
  - apps/lab-hub-api/src/modules/internal/internal.routes.ts:75-192 ichki API'da faqat GET/POST/PATCH labs va POST clinics bor, lab_users uchun reset yo'q
  - apps/supervisor-api/src/modules/labs/labs.routes.ts:11-12 `Lead vaqtinchalik paroli Supervisor'da SAQLANMAYDI — yaratish javobida bir marta ko'rsatiladi`; :50 `AbortSignal.timeout(10_000)`, :54-55 `catch { return 502 LAB_HUB_UNREACHABLE }`
- **Tuzatish yo'nalishi:** Add `POST /internal/labs/{id}/users/{userId}/reset-password` with a Supervisor proxy and a button that resets the lead (new temporary password plus `mustChangePassword = true`), and in the Lab Hub add a lead-only `POST /users/{id}/reset-password` for technicians. Optionally make lab creation idempotent and add a guard that prevents deactivating the last active lead.

### LB-04 [high] Klient PC saqlangan (TOFU) server manziliga health-check'siz ulanadi: server IP o'zgarsa yoki server kechroq yonsa mahsulot ichida qayta ulanish yo'li yo'q

- **Oqim:** license-gap5 · auditor `high` → refuter `high` · 📖 statik
- **Invariant:** I6
- **Scenariy:** Klinika routeri DHCP bilan server PC'ga 192.168.1.10 beradi, shifokor xonasidagi klient bir marta tasdiqlab uni config.json'ga saqlaydi. Elektr o'chib-yongandan keyin server 192.168.1.14 oladi. Ertasi kuni klient http://192.168.1.10:8080 ni ochadi: Electron oynasi bo'sh, tray esa '✅ Ulangan: 192.168.1.10' deydi. Tray -> Sozlamalar ham o'sha o'lik manzilni ochadi, fon qayta qidiruvi ishlamaydi, reinstall config'ni saqlaydi. Klient PC ProgramData/DentalService/config.json'dan serverUrl qo'lda o'chirilmaguncha ishlamaydi. Ertalab klient serverdan oldin yonganda ham xuddi shunday bo'sh oyna chiqadi va xabar yo'q.
- **Dalil:**
  - apps/desktop/src/main.ts:485-487 — `if (trustedUrl) { createTray('client', { serverUrl: trustedUrl }, connectedCallbacks(trustedUrl)); openBrowser(trustedUrl); }` — tekshiruv yo'q, reconnect loop ishga tushmaydi
  - apps/desktop/src/main.ts:449-454 — ulangan holatdagi tray 'Sozlamalar': `onSettings: () => openBrowser(`${url}/settings/integrations`)` — o'sha yetib bo'lmaydigan serverdan sahifa so'raydi
  - apps/desktop/src/main.ts:142 — `did-fail-load` faqat dev-wrap rejimida; prod openBrowser (main.ts:181-209) yuklash xatosini ushlamaydi
  - apps/desktop/src/main.ts:510-546 — CLI-404 qo'lda manzil kiritish oynasi faqat 'server topilmadi' tarmog'ida
- **Tuzatish yo'nalishi:** In the trustedUrl branch, run the same `/api/health` check from settings-ipc.ts `defaultCheckConnection` before opening the window. If it fails, switch to the 'Server topilmadi' state (the CLI-404 prompt plus the reconnect/discovery loop). Also add a `did-fail-load` handler to `openBrowser` that shows a local error page or that state.

### LB-05 [high] Desktop: Valkey doimiylikka ega emas — har qayta ishga tushganda kutilayotgan barcha 24 soatlik eslatmalar yo'qoladi, DB'dan qayta tiklash yo'q

- **Oqim:** messaging-gap4 · auditor `high` → refuter `high` · 📖 statik
- **Invariant:** Rejalashtirilgan yozilish eslatmasi infra qayta ishga tushganda yo'qolmasligi kerak (yoki boot'da DB'dan qayta quriladi)
- **Scenariy:** Klinika desktop (Server rejimi) o'rnatilgan. Registrator juma kuni dushanba 10:00 ga yozilish yaratadi -> yakshanba 10:00 ga delayed job Redis'ga qo'yiladi. Shanba kechqurun server kompyuteri o'chiriladi yoki Windows yangilanishi/Electron avto-update qayta ishga tushiradi (yoki valkey crash supervision restart). Valkey qayta ko'tarilganda xotira bo'sh (RDB/AOF yo'q) — barcha delayed 'appointment-reminder' joblar yo'q. API qayta boot bo'lganda faqat recall cron qayta ro'yxatga olinadi, eslatmalar tiklanmaydi. Yakshanba 10:00 da bemorlarga hech narsa yuborilmaydi, hech qanday xato/log/bildirishnoma yo'q; faqat kunlik clinic ish bilan ketayotgan, ertasi kunga yozilganlar uchun ishlaydigan eslatma (Telegram/SMS 'Kelaman/Bekor' tugmalari bilan) yozilishdan >1 kun oldin qo'yilgan hammasi uchun jimgina buziladi, no-show ko'payadi. Qo'shimcha: dushanba 11:00 recall cron ham kompyuter o'chiq bo'lsa o'sha kun o'tkazib yuboriladi (keyingi kun lte-dueDate bilan yetib oladi — bu faqat bir kun kechikish).
- **Dalil:**
  - infra/valkey-win.conf:10-11 `appendonly no` / `save ""` (infra/valkey-linux.conf:12-13 ham xuddi shunday) — desktop first-run shu konfni dataDir'ga ko'chiradi (apps/desktop/src/first-run.ts:174) va valkey faqat shu bilan spawn qilinadi (apps/desktop/src/process-manager.ts:341)
  - apps/api/src/modules/appointments/appointments.service.ts:344-348 — eslatma faqat `enqueueReminder` orqali BullMQ delayed job sifatida qo'yiladi (`reminderDelayMs(start, now)`); DB'da 'reminder yuborilishi kerak' belgisi yoki ustun yo'q
  - apps/api/src/index.ts:46-59 — boot'da faqat `startReminderWorker()` va `registerRecallScheduler()` chaqiriladi; mavjud yozilishlar uchun eslatmalarni qayta enqueue qiluvchi (reconcile/backfill) kod yo'q (enqueueReminder chaqiruvchilari: faqat appointments.service.ts:346,533,547 va telegram/deps.ts:30)
  - infra/docker-compose.prod.yml:39 — bulutda `--appendonly yes`; muammo faqat desktop topologiyasida (CLAUDE.md: desktop in-process worker, birlamchi maqsad)
- **Tuzatish yo'nalishi:** Desktop valkey konfida `appendonly yes` (yoki `save 60 1`, `dir` dataDir) yoqish va/yoki API boot'da kelajakdagi scheduled/confirmed yozilishlar uchun enqueueReminder'ni idempotent (jobId dedupe) qayta qurish.

### LB-06 [high] Qayta ulanishda (hubClinicId o'zgarganda) kursor va lab_hub_applied_events qayta o'rnatilmaydi — yangi Hub hodisalari jimgina yo'qoladi

- **Oqim:** tenancy-gap2 · auditor `high` → refuter `high` · 📖 statik
- **Invariant:** I1, I2, I3: kursor/dedup (Hub, hubClinicId) juftligiga bog'liq; juftlik o'zgarsa reset bo'lishi shart
- **Scenariy:** 1) Klinika A (SaaS yoki desktop) oylar davomida Hub bilan ishlagan, lab_hub_state.cursor = '48211.1530', applied_events'da A uchun seq 1..1530 oralig'idagi yuzlab qiymat bor. 2) Hub VPS volume'i yo'qoladi (FU-55: zaxira cron'i yo'q) va Hub toza o'rnatiladi; Supervisor lablarni qayta yaratadi. 3) A'ning eski kaliti 401 'clinic.unauthorized' (retryable) — owner Sozlamalar -> Laboratoriyalar -> «Qayta ulash»ni bosadi: Hub yangi clinics qatori (yangi hubClinicId) va kalit beradi; klinika faqat hubClinicId/kalitni yangilaydi, cursor '48211.1530' qoladi. 4) Link qayta tasdiqlanadi, shifokor yangi buyurtma yuboradi; lab qabul qiladi, narx taklif qiladi, xabar yozadi. Yangi Hub klasterida tx_id ~800, seq 1..N. 5) Poll `(800,k) > (48211,1530)` sharti bilan hech narsa olmaydi, nextCursor = since — xato ham yo'q, lastError null, lastPollAt yangilanib 'sinxronlangan' ko'rinadi. Natija: statuslar, narx takliflari (demak Hub tasdig'i va 'Laboratoriya' xarajati ham), lab xabarlari/fayllari klinikaga hech qachon yetmaydi; tx_id 48211 dan oshgach ham seq 1..1530 bilan to'qnashgan hodisalar applied_events'da 'allaqachon qo'llangan' deb tashlanadi. Qo'shimcha: eski buyurtmalarning labHubCaseRef'i yangi namespace'da yo'q — keyingi tahrir upsert_case'i (link faol bo'lsa) Hub'da YANGI 'sent' ish yaratadi (lab dublikat buyurtma oladi), approve_price/delivered/message esa 404 case.not_found -> outbox 'failed'. Xuddi shu yo'l desktop'da .lic boshqa Supervisor klinika id'si bilan qayta aktivatsiya qilinganda yoki LAB_HUB_URL boshqa Hub'ga almashtirilganda ham ochiladi.
- **Dalil:**
  - apps/api/src/modules/lab-hub/lab-hub.routes.ts:166-176 — `const values = { hubClinicId: res.clinicId, hubKeyEnc: encryptSecret(res.hubKey), connectedAt: now, lastError: null, updatedAt: now }; ... .onConflictDoUpdate({ target: labHubState.tenantId, set: values })` — cursor tegilmaydi, eski hubClinicId bilan solishtiril
  - packages/db-schema/src/tables/lab-hub.ts:41 `cursor: text('cursor').notNull().default('0.0')` va :152-161 `lab_hub_applied_events` PK `(tenant_id, seq)` — Hub instansiyasi/hubClinicId ustuni yo'q
  - apps/lab-hub-api/src/modules/clinic/clinic.routes.ts:693 `(${caseEvents.txId}, ${caseEvents.seq}) > (${sinceTx}::bigint, ${sinceSeq}::bigint)` va :749 `nextCursor: last ? ... : since` — bo'sh sahifada kursor o'zgarmaydi
  - apps/api/src/lib/lab-hub/sync.ts:514-519 `.insert(labHubAppliedEvents).values({ tenantId, seq: ev.seq }).onConflictDoNothing()` -> `if (!fresh) continue;`
- **Tuzatish yo'nalishi:** Have the Hub return a stable instance or epoch id (e.g. a random value written once to a hub_meta table, or the cluster's system_identifier) in both /connect and /changes; the clinic stores it and, whenever it or hubClinicId changes, resets the cursor to '0.0' and deletes this tenant's lab_hub_applied_events (or adds a hub_epoch column to the primary key). Separately, add an alert for when the cursor's tx part is larger than the Hub's current xid.

### LB-07 [high] Kursor/dedup kaliti Postgres klaster xid'i va sequence qiymatiga bog'langan — Hub pg_dump'dan tiklansa barcha klinikalar sinxroni jimgina to'xtaydi yoki hodisalar tashlanadi

- **Oqim:** tenancy-gap2 · auditor `high` → refuter `high` · 📖 statik
- **Invariant:** I2, I3: commit bo'lgan hodisa yetkaziladi; seq qayta ishlatilmaydi
- **Scenariy:** (a) Yangi klasterga tiklash: Hub VPS almashtiriladi yoki postgres volume yo'qolib zaxiradan `pg_restore` qilinadi (yoki PG major versiyasi dump/restore bilan ko'tariladi). Tiklangan case_events.tx_id qiymatlari eski (masalan 2 000 000), yangi klaster xid'i esa ~1000 dan boshlanadi. Klinikalar kaliti va hubClinicId o'zgarmagan — qayta ulash ham shart emas. Har klinikaning cursor'i '2000000.x' — yangi hodisalar (tx_id ~1000..) `(tx_id,seq) > since` shartidan o'tmaydi; poll xatosiz bo'sh javob oladi, kursor joyida qoladi. Natija: barcha klinikalar xid 2 mln'dan oshguncha (kichik Hub'da oylar) lab statusi, narx taklifi, xabar/fayllarni olmaydi, ekranda xato yo'q. (b) Xuddi shu klasterga eskiroq zaxirani tiklash (`pg_restore --clean`): bigserial setval zaxira paytidagi S qiymatiga qaytadi, yo'qolgan oynada klinika A allaqachon S+1..S+k dagi o'z seq'larini qo'llagan; tiklashdan keyingi yangi hodisalar shu seq'larni qayta oladi va A uchun to'qnashganlari applied_events'da 'allaqachon qo'llangan' deb jimgina tashlanadi (masalan lab 'ready' statusi yoki price_proposed). Eslatma: bu lab-qamrovidagi «Hub DB tiklanganda kursor» bandiga yaqin — bu yerda aniq mexanizm (xid/sequence kalitlari) ko'rsatildi.
- **Dalil:**
  - apps/lab-hub-api/src/db/schema.ts:245-249 `seq: bigserial('seq'...)`, `txId ... .default(sql`(pg_current_xact_id()::text)::bigint`)` — tx_id klasterning xid hisoblagichi; ma'lumot sifatida dump'ga tushadi, hisoblagich esa tushmaydi
  - infra/lab-hub/README.md:67 `Tiklash: pg_restore --clean --if-exists -d lab_hub lab_hub.dump` (yangi VPS/volume'da = yangi initdb klaster)
  - apps/lab-hub-api/src/modules/clinic/clinic.routes.ts:692-696 `txId < pg_snapshot_xmin(...)` AND `(txId, seq) > (since)` ORDER BY txId, seq
  - apps/api/src/lib/lab-hub/sync.ts:514-519 applied_events (tenantId, seq) ON CONFLICT DO NOTHING -> `continue`
- **Tuzatish yo'nalishi:** Kursor va dedup kalitiga Hub epoch'ini kiritish: masalan Hub jadvalida yoki `pg_control_system().system_identifier` + restore'da yangilanadigan instance UUID. Epoch mos kelmasa Hub `cursor.reset` qaytaradi. Klinika esa kursorni `0.0` ga tushiradi va dedup'ni `(epoch, seq)` yoki hodisa UUID'i bo'yicha qiladi. README'ga restore qadami ham qo'shilsin: epoch'ni almashtirish va setval'ni oldinga surish.

### LB-08 [medium] Starter tarif desktop'da shifokor yarata olmaydi: 'staff' moduli yo'q -> /api/users/invite 403 -> yozilish (booking) oqimi ishlamaydi

- **Oqim:** booking-gap9 · auditor `high` → refuter `medium` · 📖 statik
- **Invariant:** Tarifdagi modullar o'z oqimini oxirigacha o'tkaza olishi kerak: starter = patients+appointments+queue, lekin appointments uchun majburiy shifokorni yaratish yo'li (users/invite) 'staff' modulida va starter'da yo'q
- **Scenariy:** Vendor Supervisor'da klinikani `plan: starter` bilan yaratadi. Klinika desktop'ni aktivatsiya qiladi: tenant+owner+filial+8 rol shabloni bor, lekin birorta xodim yo'q (owner shifokor hisoblanmaydi). Owner 'Xodimlar' -> 'Taklif qilish' bosadi -> POST /api/users/invite -> requireModuleInDesktop('staff') -> 403 MODULE_DISABLED (web bu kodni tanimaydi, umumiy xato toast). /api/appointments/doctors bo'sh qaytadi, yozilish yaratishda doctorId talab qilinadi -> starter klinikada bitta ham yozilish yaratib bo'lmaydi, registrator/shifokor ham qo'sha olinmaydi. Aylanib o'tish faqat vendor tomonidan plan'ni standard'ga ko'tarish (heartbeat kutish ≤4 soat). Tarif lug'ati CLI-433'da kelishilgan (knownDecision emas — oqibat ko'rib chiqilmagan).
- **Dalil:**
  - apps/supervisor-api/src/modules/clinics/clinics.routes.ts:72 — `starter: ['patients', 'appointments', 'queue'],` ('staff' faqat standard'dan boshlanadi, :73)
  - apps/api/src/modules/users/users.routes.ts:49 — `app.use('*', requireModuleInDesktop('staff'));` (invite, addAssignment, reset-password, grantable-roles — hammasi shu sub-app ichida)
  - apps/api/src/modules/users/users.service.ts:226 va :313 — `insert(userAssignments)` faqat shu serviceda (boshqa yo'l yo'q; db/seed-demo.ts dan tashqari)
  - apps/api/src/modules/appointments/appointments.service.ts:587-602 — listDoctors: `eq(roles.isPractitioner, true)` + `isNotNull(userAssignments.acceptedAt)`; owner (`@owner`, auth.service.ts:~218) assignment'siz, ya'ni shifokor emas
- **Tuzatish yo'nalishi:** Eng kichik yo'l: 'staff' (yoki kamida users invite/grantable-roles/assignments) ni starter MODULE_MAP'ga (ikkala nusxada va guard-testda) qo'shish, yoki starter'da owner'ni shifokor sifatida ro'yxatga qo'shish (provisioning'da owner'ga practitioner assignment berish / listDoctors'ga owner'ni qo'shish); qo'shimcha: web'da MODULE_DISABLED kodini tanib tushunarli xabar ko'rsatish.

### LB-09 [medium] Vaqtinchalik parol noto'g'ri kiritilsa, ChangePasswordPage xatoni ko'rsatmaydi: global 401 handler sessiyani o'chiradi va foydalanuvchini /login ga otadi

- **Oqim:** lab-gap3 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I6
- **Scenariy:** Yangi texnik birinchi marta kiradi va /change-password ga yo'naltiriladi. 16 belgili vaqtinchalik parolda bitta belgini adashtiradi. Server 401 qaytaradi, api.ts sideEffects logout() qiladi va token null bo'ladi. Sahifa qayta render bo'lib /login ga Navigate qiladi. «Joriy parol noto'g'ri» xabari ko'rinmaydi. Foydalanuvchi sababsiz chiqarib yuborilganini ko'radi, yangi parol maydonlari ham tozalanadi. U yana login qilishi kerak; har adashganda shu takrorlanadi. Mo'ljallangan currentWrong xabari amalda o'lik kod.
- **Dalil:**
  - apps/lab-hub-api/src/modules/lab/lab.routes.ts:195-197 `if (!u || !(await verifyPassword(b.currentPassword, ...))) throw new ApiError(401, 'auth.invalid_credentials')`
  - apps/lab-hub-web/src/lib/api.ts:18 `if (status === 401 && auth.token) auth.logout();` (har qanday 401 uchun)
  - apps/lab-hub-web/src/features/auth/ChangePasswordPage.tsx:22 `if (!token) return <Navigate to="/login" replace />;`
  - apps/lab-hub-web/src/features/auth/ChangePasswordPage.tsx:41-42 `const wrong = err instanceof HubApiError && err.status === 401; setErrors({ form: wrong ? t('labHub.auth.currentWrong') ...` (bu yo'lga hech qachon yetib bo'lmaydi)

### LB-10 [medium] SaaS 'Qayta tekshirish' tugmasi access token muddati o'tgach doim 'hali tugagan' deydi: vendor renew qilgan bo'lsa ham klinika ochilmaydi

- **Oqim:** license-gap5 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I2
- **Scenariy:** SaaS klinika owner'i 09:00 da 403 LICENSE_EXPIRED oladi va /license-expired ekraniga o'tadi. U vendorga to'laydi, vendor 09:40 da Supervisor'da 'Muddatni uzaytirish'ni bosadi. 09:41 da owner 'Qayta tekshirish'ni bosadi. localStorage'dagi access token 09:15 da tugagan, shuning uchun tenantIdFromBearer null qaytaradi, endpoint 404 beradi va ekranda 'Hali ham muddati tugagan' chiqadi (global toast 'Not found' ham). syncSub umuman chaqirilmaydi. Owner to'lov o'tmadi deb o'ylaydi. Faqat qo'lda '/' ga o'tsa (me -> 401 -> refresh) va yana blokka qaytib bossa ishlaydi, aks holda keyingi sinxrongacha (20 soatgacha) bloklangan qoladi.
- **Dalil:**
  - apps/api/src/routes/license-status.ts:133-134 — `const tenantId = isSaasSupervisorEnabled() ? await tenantIdFromBearer(c) : null; if (!tenantId) return c.json(fail('NOT_FOUND', 'Not found'), 404);`
  - apps/api/src/lib/subscription.ts:64-72 — tenantIdFromBearer: `verifyAccess(...)` throw qilsa (muddati o'tgan JWT) `return null`; 401 emas
  - apps/api/src/lib/jwt.ts:40 — `ACCESS_TTL_SECONDS = parseDuration(env.JWT_ACCESS_EXPIRES); // '15m' default`
  - apps/web/src/features/license/components/LicenseBlockedScreen.tsx:16-27 — recheck onError -> `setStillExpired(true)`; ekranda faqat status (auth'siz, 200) va recheck (404) chaqiriladi, hech biri 401 bermaydi, shuning uchun api-client refresh qilmaydi
- **Tuzatish yo'nalishi:** `LicenseBlockedScreen` recheck'dan oldin refresh token bilan access'ni yangilasin (yoki 404 olinsa bir marta refresh qilib qayta urinsin). Muqobil: recheck endpoint'i muddati o'tgan lekin imzosi yaroqli JWT'dan tenantni olsin (faqat `atid`, `ignoreExpiration`), yoki muddati o'tgan tokenda 404 o'rniga 401 `auth.invalid_token` qaytarsin. Shunda api-client refresh qilib retry qiladi.

### LB-11 [medium] Vendor SaaS klinikani to'xtata olmaydi: deactivate faqat litsenziya qatorini qidiradi, renew o'tgan sanani rad etadi, admin UI'da SaaS uchun tugma yo'q

- **Oqim:** license-gap5 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I3
- **Scenariy:** SaaS klinika shartnomani bekor qiladi, pulni qaytarib oladi yoki suiiste'mol aniqlanadi. Vendor Supervisor admin'da klinikani ochadi: SaaS kartasida faqat 'Uzaytirish' bor. API orqali PATCH /deactivate 404 qaytaradi. Eng yaqin chora — renew'ni ertangi sanaga qo'yish, shunda ham tenant +7 kunlik imtiyoz va 20 soatgacha sinxron kechikishi davomida (taxminan 8-9 kun) to'liq ishlaydi. Desktop klinika esa keyingi heartbeat'da to'xtaydi: ikki rejimda bir xil vendor amali har xil ishlaydi.
- **Dalil:**
  - apps/supervisor-api/src/modules/clinics/clinics.routes.ts:270-271 — deactivate: `const license = await db.query.licenses.findFirst(...); if (!license) return c.json({ error: { code: 'NOT_FOUND' } }, 404);` (SaaS klinikada litsenziya yo'q)
  - apps/supervisor-api/src/modules/saas/saas.routes.ts:116-118 — `if (expiresAt.getTime() <= Date.now()) throw ... 'EXPIRES_IN_PAST'`
  - apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx:221-257 — `isSaas` kartasida faqat 'Muddatni uzaytirish'; deactivate tugmasi `{!isSaas && (` blokida (:257, :304)
  - apps/api/src/lib/subscription.ts:22-24 — tenant faqat `expiresAt + MAX_GRACE_DAYS` dan keyin bloklanadi
- **Tuzatish yo'nalishi:** SaaS klinika uchun klinika darajasidagi suspend/deactivate qo'shing (masalan `clinics.suspended_at`, uni `toStatus` va apps/api sinxronida o'qib `computeSubscriptionState` ichida imtiyozsiz `expired` qilish), yoki SaaS renew'da o'tgan sanaga ruxsat berib grace'ni chetlab o'tadigan «darhol bloklash» bayrog'ini kiriting. Admin UI'da SaaS kartasiga mos tugma qo'shing.

### LB-12 [medium] Blok ekranida chiqish va workspace almashtirish yo'q: ko'p klinikali xodim faol bo'lmagan klinikada qamalib qoladi

- **Oqim:** license-gap5 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I5
- **Scenariy:** Shifokor A klinikada (SaaS, obunasi tugagan) va B klinikada (faol) ishlaydi. U oxirgi marta A workspace'ida ishlagan. Keyingi kirishda har so'rov 403 LICENSE_EXPIRED qaytaradi va /license-expired'ga otadi. Ekranda faqat 'To'lov qilishingiz kerak' va 'Qayta tekshirish' bor, B klinikaga o'tish ham, chiqish ham yo'q. Qabulxonadagi umumiy kompyuterda registrator boshqa xodim sifatida kira olmaydi. Yagona chora — manzil satriga /select-workspace'ni qo'lda yozish yoki localStorage'ni tozalash.
- **Dalil:**
  - apps/web/src/features/license/components/LicenseBlockedScreen.tsx:43-53 — action'da faqat 'Qayta tekshirish' tugmasi; logout ham, workspace tanlash ham yo'q
  - apps/web/src/features/license/license.routes.tsx:4-7 — 'Public route — shell tashqarisida' (sidebar/topbar logout yo'q)
  - apps/web/src/lib/query-client.ts:23-25 — keyingi har 403 LICENSE_EXPIRED yana `window.location.assign('/license-expired')`
  - apps/api/src/lib/license-middleware.ts:149-160 — `/api/auth` (switch-workspace, logout) ochiq, ya'ni backend ruxsat beradi, faqat UI yo'l bermaydi
- **Tuzatish yo'nalishi:** LicenseBlockedScreen action'iga ikkita tugma qo'shish: "Chiqish" (`useAuthStore.clear()` + `/login`) va "Boshqa klinikaga o'tish" (`/select-workspace`). Ikkalasi ham `/api/auth` orqali ochiq, qo'shimcha backend o'zgarishi kerak emas.

### LB-13 [medium] Server discovery javobida birinchi tashqi IPv4 interfeysini yuboradi, so'rov kelgan interfeysni emas: virtual/VPN adapterli serverda klient noto'g'ri manzilni saqlaydi

- **Oqim:** license-gap5 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I7
- **Scenariy:** Server PC'da Hyper-V/WSL (vEthernet 172.x), VirtualBox (192.168.56.1) yoki Radmin/ZeroTier VPN adapteri bor va u networkInterfaces() ro'yxatida Ethernet'dan oldin turadi. Klient UDP so'rov yuboradi, javob haqiqiy LAN IP'dan keladi, lekin ichida `http://172.x.x.x:8080` yozilgan. TOFU dialogi shu manzilni ko'rsatadi, registrator 'Ulanish'ni bosadi va manzil config'ga saqlanadi. Natijada bo'sh oyna chiqadi va oldingi topilmadagi tufayli qayta ulanish yo'li yo'q. Ishonch past: Windows'da interfeys tartibi kafolatlanmagan, jismoniy PC'da sinalmagan.
- **Dalil:**
  - apps/desktop/src/discovery.ts:28-36 — `for (const iface of Object.values(nets)) { for (const net of iface ?? []) { if (net.family === 'IPv4' && !net.internal) return net.address; } }`
  - apps/desktop/src/discovery.ts:59 — `const response = `${RESPONSE_PREFIX}${JSON.stringify({ ip: getLocalIp(), port: serverPort })}`;`
  - apps/desktop/src/discovery.ts:94-100 — klient `rinfo.address`'ni e'tiborsiz qoldirib, JSON'dagi `ip`'dan URL quradi
- **Tuzatish yo'nalishi:** Klientda JSON ichidagi `ip` o'rniga `rinfo.address` dan foydalaning (yoki server tomonda `rinfo.address` bilan bir subnetdagi lokal interfeysni tanlang). Qo'shimcha: virtual va link-local (169.254/16) adapterlarni filtrlang, hamda saqlangan `serverUrl` ga ulanish bo'lmasa qayta discovery yo'lini qo'shing.

### LB-14 [medium] Obunasi/litsenziyasi tugagan tenant uchun worker (eslatma, recall) va Telegram bot to'liq ishlashda davom etadi — blok faqat HTTP'da

- **Oqim:** messaging-gap4 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** Obuna muddati + imtiyoz tugagach (P18/L8 'to'liq blok') klinika nomidan hech qanday avtomatik chiquvchi xabar/bot oqimi ishlamasligi kerak
- **Scenariy:** SaaS klinika obunasi tugab 7 kun imtiyoz ham o'tadi: xodimlar ilovada 403 LICENSE_EXPIRED oladi (to'lov ekrani). Lekin worker.ts har kuni 11:00 da shu tenant uchun recall SMS/Telegram yuborishda davom etadi, mavjud 24-soatlik eslatma joblar ham fire bo'ladi (klinikaning o'z Eskiz/bot kredensialida) va bot bemorlarga bron/anketa qabul qilib, `booking_requests`ga yozadi hamda 'Kelaman/Bekor' tugmalari orqali yozilish statusini o'zgartiradi — xodimlar esa buni ko'ra olmaydi (UI bloklangan), so'rovlar 24 soatdan keyin expired bo'ladi. Klinika to'lamasdan mahsulot ish ko'rsatib turadi; bemorga klinika nomidan xizmat 'ishlayotgandek' ko'rinadi. Desktop'da ham: license `expired` bo'lganda in-process worker/bot (index.ts:51-70) to'xtamaydi, faqat `/api/*` bloklanadi.
- **Dalil:**
  - apps/api/src/app.ts:151-152 — `app.use('/api/*', requireValidSubscription()); app.use('/uploads/*', ...)` yagona gate; apps/api/src/lib/license-middleware.ts:196-215 `requireValidSubscriptionInCloud` faqat Bearer JWT'li HTTP so'rovda
  - apps/api/src/lib/reminder-worker.ts:48-157 va apps/api/src/lib/recall-worker.ts:86-262 — `getTenantSubscriptionState`/`computeSubscriptionState`/license tekshiruvi yo'q (grep subscription|license lib/recall-worker.ts lib/reminder-worker.ts lib/telegram lib/telegram-bot-manager.ts -> 0)
  - apps/api/src/lib/telegram-bot-manager.ts:170-196 va 242-252 bootAll — barcha `tenant_settings` qatorlari uchun bot ishga tushadi; holatga qaramaydi; flows (booking_requests insert, anketa, 'Kelaman/Bekor' yozilish update) `withTenant` orqali bevosita DB'ga yozadi
  - apps/api/src/lib/subscription.ts:21-27 — `none` (NULL) hech qachon bloklamaydi, `expired` esa HTTP'da 403 beradi — lekin worker bu ma'lumotdan foydalanmaydi
- **Tuzatish yo'nalishi:** Worker/bot kirish nuqtalarida `getTenantSubscriptionState` (SaaS) / `getLicenseState` (desktop) tekshiruvini qo'shing: `processReminderJob`, recall worker va bot flows (`run`/`withTenant` o'rami) `expired` holatda ishni o'tkazib yuborsin. Bot uchun `bootAll`/`launch` ham `expired` tenantlarni ishga tushirmasin va jonli botlarga javob bermaslik gate'i bo'lsin.

### LB-15 [medium] Xarajatlar modulida filial doirasi umuman yo'q: filial mudiri boshqa filial va klinika miqyosidagi xarajatlarni ko'radi, yaratadi, tahrirlaydi va o'chiradi

- **Oqim:** money-gap6 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I1: filialga tayinlangan xodim faqat o'z filiali moliyasini ko'radi/o'zgartiradi (IR-06)
- **Scenariy:** Filial mudiri faqat A filialiga tayinlangan (Branch Manager: expense.view/manage). 1) Moliya sahifasini ochadi: filial tanlanmagan, GET /api/expenses va /api/expenses/summary butun klinika xarajatlarini (B filial, ijara kabi tenant-darajali) qaytaradi. 2) B filialining 'Ijara 12 000 000' xarajatini PATCH bilan 1 000 000 qiladi yoki DELETE qiladi — 200, audit yoziladi, lekin hech qanday filial tekshiruvi yo'q. 3) Natija: B filial va egasining P&L'i, kunlik xulosadagi netCashFlow (cashier.service.ts dailySummary branch xarajati) buziladi. LA-25 (/pnl) va LA-27/30 (kassa) bilan bir xil naqsh, lekin FX-31/FX-32 faqat pnl va kassani qamraydi — expenses ro'yxatda yo'q.
- **Dalil:**
  - apps/api/src/modules/expenses/expenses.routes.ts:181,198,252,274 — `middleware: [requirePermission('expense.view')]` / `requirePermission('expense.manage')`: reportBranchScope yoki filial tekshiruvi yo'q
  - apps/api/src/modules/expenses/expenses.service.ts:118 — `if (query.branchId) filters.push(eq(expenses.branchId, query.branchId));` (branchId berilmasa butun tenant)
  - apps/api/src/modules/expenses/expenses.service.ts:180 — `branchId: input.branchId ?? null,` (istalgan filial yoki tenant-darajali)
  - apps/api/src/modules/expenses/expenses.service.ts:201-247 — update/remove faqat `eq(expenses.id, id)`, filial tekshiruvisiz
- **Tuzatish yo'nalishi:** Expenses routes'ga reportBranchScope-ga o'xshash filial-doirasi middleware qo'shing (expense.view/manage beruvchi tayinlovlardan), list/summary'da scope filialiga cheklang, create/update/remove'da before.branchId va input.branchId ni scope bilan solishtiring (tenant-darajali branchId=null yozuvga filialga tayinlangan xodim 403 oladi).

### LB-16 [medium] Xizmat foydasi (procedureMix) va revenue.byService faqat erkin POS item'laridan: davolash rejasi orqali to'langan barcha xizmatlar «Qaysi xizmat ko'p foyda beradi?» javobidan tushib qoladi

- **Oqim:** money-gap6 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I2: xizmat bo'yicha tushum/foyda klinikaning xizmat tushumini to'liq qamraydi yoki cheklovni ochiq aytadi
- **Scenariy:** Klinika oyida 40 ta implantni davolash rejasi orqali (PlanBillingPanel, allocations) har biri 5 000 000 dan oladi = 200 mln, va 300 ta konsultatsiyani POS orqali 100 000 dan = 30 mln. Egasi Hisobotlar -> «Qaysi xizmat ko'p foyda beradi?» ni ochadi: jadvalda faqat 'Konsultatsiya' (30 mln) va boshqa POS xizmatlari bor, 'Implant' umuman yo'q; javob jumlasi 'Eng ko'p foyda beradigan xizmat — Konsultatsiya'. Daromad hisobotida esa total 230 mln, lekin byService jadvali 30 mln — farq izohsiz. IR-05 (refund davri farqi) dan alohida: bu yerda butun reja kanali yo'q.
- **Dalil:**
  - apps/api/src/modules/reports/reports.service.ts:139-155 — `FROM cashier_transaction_items i JOIN tx_net ...` — faqat item'li tranzaksiyalar
  - apps/api/src/modules/cashier/cashier.schema.ts — `.refine((v) => !(v.items.length > 0 && (v.allocations?.length ?? 0) > 0)` : reja to'lovi doim items=[] bilan yoziladi (cashier.mappers.ts:171 `items: []`)
  - packages/db-schema/src/tables/treatment-plans.ts:110 — `serviceId: uuid('service_id')` bosqichda bor, lekin treatment_stage_payments -> stage.serviceId hech qayerda xizmat agregatsiyasiga qo'shilmaydi
  - apps/api/src/modules/reports/reports.service.ts:532 — `const mixRows = await netServiceAggregates(db, start, end, ids);`
- **Tuzatish yo'nalishi:** Reja to'lovlarini (treatment_stage_payments -> treatment_stages.service_id) netServiceAggregates ga UNION qilib, tx net-faktori bilan proporsional taqsimlash. Imkon bo'lmasa, hech bo'lmasa howText.services va byService izohida «faqat erkin POS xizmatlari, reja to'lovlari kirmaydi» cheklovini aytish va reja bo'yicha alohida «reja tushumi» qatorini ko'rsatish.

### LB-17 [medium] Refund dialogi va tranzaksiya jadvali hisob-faktura summasini (totalAmount) ko'rsatadi, server esa faqat qolgan paidAmount'ni qaytaradi: qisman to'langan sotuvda kassir ko'rsatilgandan kam yozilgan pulni qaytarib beradi

- **Oqim:** money-gap6 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I4: refund dialogidagi summa serverda yoziladigan refund summasiga teng
- **Scenariy:** Kassir erkin POS sotuvini 500 000 ga yozadi, bemor 200 000 to'laydi (300 000 qarzga). Ertasi bemor davolanishdan voz kechadi. Kassir jadvalda 'Summa 500 000' ni ko'radi, refund dialogida ham 'Summa 500 000' yozilgan, 'Qaytarish'ni bosadi. Server 200 000 lik refund yozadi (remaining paid). Dialog natijani ko'rsatmay yopiladi; kassir ko'rsatilgan 500 000 ni naqd qaytaradi — kassa 300 000 kam chiqadi, tizimda izi yo'q. Reja to'lovida ham ikkinchi qisman refundda max=paidAmount bo'lgani uchun foydalanuvchi qolgandan katta summa kiritadi va faqat umumiy 'Xatolik' toast'ini oladi (refund.over_refund matni ko'rsatilmaydi).
- **Dalil:**
  - apps/web/src/features/cashier/components/TransactionsTable.tsx:149 — `<Text fw={600}>{formatCurrency(selected.totalAmount, t)}</Text>` (yorliq 'Summa')
  - apps/web/src/features/cashier/components/TransactionsTable.tsx:84 — jadval ustuni `formatCurrency(tx.totalAmount, t)`
  - apps/web/src/features/cashier/components/TransactionsTable.tsx:167 — qisman refund `max={selected.paidAmount}` (avvalgi refundlar ayirilmagan)
  - apps/api/src/modules/cashier/cashier.service.ts:781-783 — `const remaining = paid - alreadyRefunded; const refundAmount = amount ?? remaining;`
- **Tuzatish yo'nalishi:** Refund dialogida va jadvalda `paidAmount - alreadyRefunded`ni (server `remaining` ni DTO'da qaytarsin) ko'rsat; `max`ni shu qoldiqqa tenglashtir; refund natijasidagi haqiqiy summani toast/dialogda ko'rsat va `refund.over_refund` xatosi uchun alohida matn qo'sh.

### LB-18 [medium] Lab navbati/diqqat widget'lari faqat eng yangi 20 ta buyurtma ustida hisoblanadi: eski faol va muddati o'tgan buyurtmalar Texnik, Shifokor va Registrator dashboard'idan yo'qoladi

- **Oqim:** rbac-gap0 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I4: navbat va overdue hisobi to'liq to'plam ustida bo'lishi kerak
- **Scenariy:** Klinikada 25 ta lab buyurtma bor. Eng eskisi, 3 hafta oldin yuborilgan toj, holati 'in_progress' va muddati o'tgan. Keyingi 22 tasi yangiroq va ko'pi 'delivered'. Texnik tizimga kiradi va TechnicianDashboard faqat eng yangi 20 tani oladi: 3 hafta oldingi toj 'Lab navbati'da ko'rinmaydi. Shifokorning 'Mening kunim' lab panelida ham, registratorning 'Diqqat' hisobida ham (F2 tuzatilsa) yo'q. Eng kechikkan ish, ya'ni eng muhimi, aynan yashirinadi.
- **Dalil:**
  - apps/web/src/features/dashboard/dashboard.api.ts:93-100 — `queryFn: () => listLabOrders().then((r) => r.data.data), select: filterActiveLabOrders` (parametrsiz chaqiruv)
  - apps/api/src/modules/lab-orders/lab-orders.schema.ts:90 — `pageSize: z.coerce.number().int().positive().max(100).default(20)`
  - apps/api/src/modules/lab-orders/lab-orders.service.ts:57-58 — `.orderBy(desc(labOrders.createdAt)) .limit(query.pageSize)`
  - apps/web/src/features/dashboard/components/TechnicianDashboard.tsx:43 — `const labOrders = useActiveLabOrders();` (Texnik navbati)
- **Tuzatish yo'nalishi:** Dashboard so'rovlarini serverda filtrlangan qilish: status bo'yicha faol buyurtmalar uchun maxsus endpoint (masalan `status != delivered/cancelled`, doktor uchun `doctorId`) yoki mavjud `/lab-orders/overdue`ni overdue hisobi uchun ishlatish; muqobil: to'liq sahifalash yoki `pageSize=100` va faol statuslarni serverda filtrlash.

### LB-19 [medium] 'Yozish' tugmalari (Bemorlar ro'yxati, Recall paneli) patientId'ni URL'da uzatadi, lekin yozilish ekrani uni o'qimaydi: bemor oldindan tanlanmaydi

- **Oqim:** rbac-gap0 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I7: ekranlar orasida uzatilgan kontekst qabul qiluvchi ekranda o'qilishi kerak
- **Scenariy:** Registrator /recalls'da 'Qayta chaqirish' ro'yxatini ko'radi va bemor bilan gaplashib 'Rejalashtirish'ni bosadi. /appointments?patientId=... kalendar ochiladi, patientId hech qayerda ishlatilmaydi. Registrator 'Yangi yozilish'ni ochib bemorni qaytadan qidirishi kerak. Xuddi shunday, /patients ro'yxatidagi 'Yozish' tugmasi wizard'ni bo'sh bemor maydoni bilan ochadi. Bir xil familiyali ikki bemor bo'lsa, noto'g'ri bemorni tanlash xavfi bor. Noto'g'ri bemor tanlansa, recall `closeOpenOnRebook` boshqa bemorga yopiladi va asl recall 'pending'da qoladi.
- **Dalil:**
  - apps/web/src/features/patients/components/PatientsListScreen.tsx:279 — `navigate(`/appointments/new?patientId=${p.id}`);`
  - apps/web/src/features/recalls/components/RecallDashboard.tsx:197 — `to={`/appointments?patientId=${r.patientId}`}` (kalendarga, wizard'ga ham emas)
  - apps/web/src/features/appointments/components/NewAppointmentScreen.tsx:5-8 — `return <NewAppointmentWizard onClose={() => navigate('/appointments')} />;` (searchParams o'qilmaydi)
  - apps/web/src/features/appointments/components/NewAppointmentWizard.tsx:103-106 — `initialValues: { branchId: activeBranchId ?? '', patientId: '', ...}`
- **Tuzatish yo'nalishi:** NewAppointmentScreen'da `useSearchParams().get('patientId')` o'qib wizardga `initialPatientId` prop sifatida ber (useForm initialValues va bemor Select'ning option'lari shu bemorni o'z ichiga olsin). RecallDashboard 'Rejalashtirish' havolasini `/appointments/new?patientId=...` ga o'zgartir.

### LB-20 [medium] patient_image.upload (Nurse'da ham bor) rasmni butunlay o'chirishga ruxsat beradi, imzolangan vizit yozuviga biriktirilgan rentgenni ham

- **Oqim:** rbac-gap0 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I5: imzolangan vizit yozuvi va uning klinik dalillari faqat klinik boshqaruv huquqi bilan o'zgaradi
- **Scenariy:** Shifokor vizit yozuviga periapikal rentgenni biriktirib (visitNoteId) imzolaydi. Nurse shablonidagi hamshira bemor kartasi -> Hujjatlar -> Rasmlar'da noto'g'ri rasm deb o'ylab o'sha rentgenni o'chiradi (shablon izohiga ko'ra unda 'manage YO'Q'). DB qatori va diskdagi fayl darhol yo'qoladi. Imzolangan vizit kartasida rasm endi ko'rinmaydi. Tiklash yo'li yo'q, faqat audit_log'da 'before' qoladi. Shablon izohi bilan permission tavsifi ('yuklash va boshqarish') bir-biriga zid; qasddan qilingan qaror hujjatlashtirilmagan.
- **Dalil:**
  - apps/api/src/modules/patient-images/patient-images.routes.ts:209-216 — DELETE `/patient-images/{id}` `requirePermission('patient_image.upload')`
  - apps/api/src/modules/patient-images/patient-images.service.ts:193-201 — `await db.delete(patientImages)...; await deleteObject(before.objectKey)` (qattiq o'chirish, `visitNoteId`/`signedAt` tekshiruvi yo'q)
  - packages/core/src/role-templates.ts:248-253 — Nurse: `// M5 ... *.view + patient_image.upload (manage YO'Q)` ... `'patient_image.upload'`
  - apps/web/src/features/clinical/components/images/PatientImagesTab.tsx:33,52,76 — `canUpload` o'chirish tugmasini ham ochadi (ImageCard.tsx:123)
- **Tuzatish yo'nalishi:** patient-images.service.ts remove() va updateMetadata() ichida before.visitNoteId bog'langan imzolangan (signedAt != null) vizit yozuvi bo'lsa 409 bilan rad etish. Qo'shimcha: DELETE uchun alohida permission (masalan patient_image.manage, Nurse'ga berilmaydi) kiritish yoki soft-delete qilish. Permission tavsifi va Nurse izohini moslashtirish.

### LB-21 [medium] Lab buyurtma 'shifokori' doim ekranni ochgan foydalanuvchi: Technician (lab_order.manage) yaratgan buyurtma Hub'ga texnik nomi bilan ketadi va haqiqiy shifokorga ko'rinmaydi

- **Oqim:** rbac-gap0 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I6: doctorId amaliyotchini ko'rsatishi kerak
- **Scenariy:** Shifokor texnikka og'zaki tarzda 46-tishga toj tayyorlashni aytadi. Technician bemor kartasi -> Davolash -> Lab -> 'Yaratish' orqali buyurtma ochib Hub'ga yuboradi. doctorId=texnik bo'lib qoladi: Lab Hub portalida 'Shifokor: <texnik ismi>' chiqadi va lab savollarini noto'g'ri odamga yo'naltiradi. Shifokorning 'Mening kunim' lab panelida bu buyurtma yo'q (filtr doctorId===user.id). Lab hisobotlari va 'kim buyurtma berdi' tarixi ham noto'g'ri.
- **Dalil:**
  - apps/web/src/features/clinical/components/lab-orders/LabOrderNewPage.tsx:96 — `const orderDoctor = user ? { id: user.id, name: user.fullName } : null;` (:183 `doctorId: orderDoctor.id`), shifokor tanlash maydoni yo'q
  - apps/web/src/features/clinical/components/lab-orders/LabOrdersTab.tsx:32,43-51 — 'Yaratish' tugmasi faqat `lab_order.manage` bilan, Technician'da bor
  - packages/core/src/role-templates.ts:306-317 — Technician: `'lab_order.view', 'lab_order.manage'`
  - apps/api/src/modules/lab-orders/lab-orders.service.ts:122 — `ownership.assertUserExists(c, input.doctorId)` (faqat mavjudlik, is_practitioner tekshirilmaydi)
- **Tuzatish yo'nalishi:** Add a practitioner selector (users with `roles.is_practitioner`, defaulting to the current user only if they are a practitioner) to LabOrderNewPage. Make the API reject a `doctorId` that is not a practitioner. Alternatively, add a separate `orderedBy` field and keep `doctorId` for the treating doctor.

### LB-22 [medium] A Branch Manager assigned to one branch can edit another branch's settings and its doctors' schedules and time off, which breaks booking in that branch

- **Oqim:** tenancy-gap1 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I1: a branch-assigned Branch Manager runs only their own branch
- **Scenariy:** A clinic has branches A and B. X is assigned as Branch Manager to branch A only (branchId=A). 1) X sends PATCH /api/branches/<B> {workHours: {mon: null, ..., sat: null}} and gets 200. B's work hours are gone. Because of the P10 fallback, scheduleless doctors in B now get no slots, and the bot and the booking wizard find no free time in B. 2) X sends POST /api/schedule/time-off {doctorId: <B doctor>, branchId: null, startAt: today, endAt: +30 days} and gets 200. Bookings for the B doctor fail in every branch with 'schedule.doctor_on_time_off'. 3) X sends PUT /doctors/<B doctor>/working-hours {branchId: B, segments: []}, which deletes the doctor's B schedule. B's receptionist and owner do not know why this happened. The audit log shows it, but nothing blocks it. FX-32/X-2 cover only kassa and reports; branches and schedule are not on any FX list.
- **Dalil:**
  - packages/core/src/role-templates.ts:102-114: Branch Manager description 'Filial mudiri — filial ichida hamma narsani boshqaradi', permissions include `'branch.edit'`
  - packages/core/src/role-templates.ts:146-147: Branch Manager has `'schedule.view', 'schedule.manage'`
  - apps/api/src/modules/branches/branches.routes.ts:116: `middleware: [requirePermission('branch.edit')]`, no branch-scope check
  - apps/api/src/modules/branches/branches.service.ts:61-64: `db.update(branches).set({ ...input, updatedAt: new Date() }).where(eq(branches.id, id))` (workHours, name and phone for any branch in the tenant)
- **Tuzatish yo'nalishi:** Extend the report-scope.ts pattern to branches.update and schedule.replaceWorkingHours/createTimeOff/deleteTimeOff. The target branchId must be in the caller's user_assignments branch set. A time-off with branchId null is allowed only for owner or tenant-wide assignment. The doctor must be assigned to that branch. This fits the X-2 helper, and branches/schedule should be added to FX-32 or X-2.

### LB-23 [medium] Expenses: decision D-8 restricts expenses to the caller's branches, but there is no FX item. The screen loads the whole clinic's expenses by default, and a branch user can edit or delete another branch's expenses

- **Oqim:** tenancy-gap1 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I1 + D-8: 'Kassa/xarajat operatsiyalari chaqiruvchining tayinlangan filiallari bilan cheklanadi'
- **Scenariy:** Y is a Branch Manager assigned only to branch A. Y opens Moliya -> Xarajatlar. The default 'Barcha filiallar' view returns 200 with every expense in the clinic: branch B's rent, salary-like payments and the 'Laboratoriya' expenses, plus the grandTotal. Y sends PATCH /api/expenses/<B expense> {amount: 1} or DELETE and gets 200, so B's expense disappears and the clinic's P&L changes. When the pnl fix (FX-31) is done, the same figures stay open through /expenses/summary, so the IR-06 protection becomes theatre a second time.
- **Dalil:**
  - docs/FIX-BACKLOG-2026-11-19.md:230: D-8 `Kassa/xarajat operatsiyalari chaqiruvchining tayinlangan filiallari bilan cheklanadi`. Wave 4 (lines 84-90) has only FX-31 pnl and FX-32 kassa, no expenses ticket
  - apps/web/src/features/expenses/components/ExpensesScreen.tsx:58: `useState<string | null>(null)`; :75-84 useExpenses/useExpenseSummary/usePnl called with `branchId ?? undefined` (all branches)
  - apps/api/src/modules/expenses/expenses.service.ts:118: `if (query.branchId) filters.push(...)`: with no branchId the whole tenant's expenses are returned
  - apps/api/src/modules/expenses/expenses.service.ts:257: summary works the same way (all branches plus tenant-level expenses)
- **Tuzatish yo'nalishi:** Xarajat modulida pnl/kassa bilan bir xil filial-doirasi helper'ini (`reportBranchScope` / `decideBranchScope`) qo'llash: ro'yxat va summary'da ruxsat etilgan filiallar bilan majburiy filtr, `getById`/`update`/`remove` da `before.branchId` ni tekshirish, `create`/`update` da kiruvchi `input.branchId` ni tekshirish, shuningdek D-8 ostida yangi FX tiketi ochish.

### LB-24 [medium] Stock: a doctor or Branch Manager assigned to one branch can adjust, set to zero or move another branch's stock items

- **Oqim:** tenancy-gap1 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I1: a branch item is managed only by staff of that branch
- **Scenariy:** Dr. D is assigned only to branch A (Doctor role, stock.manage). In Ombor the default list shows every branch's items, including B's 'Lidokain (B)'. D does a stocktake/adjustment on that item (set-to-value 0) or an 'out' movement. B's stock drops to zero, B's managers get a false low-stock alert, B's 'necha kunga yetadi' becomes wrong, and B's BOM auto-deduction can fail with 409 stock.insufficient. D can also send PATCH /stock/items/<B item> {branchId: A}, and the item drops out of B's list and moves to A. D-8 decided only kassa and expenses; stock is undecided (👤).
- **Dalil:**
  - packages/core/src/role-templates.ts:180-181: the Doctor template has `'stock.view','stock.manage'`; Branch Manager has the same (:142-143)
  - apps/api/src/modules/stock/stock.service.ts:290-300: createMovement `select ... branchId ... from(stockItems).where(eq(stockItems.id, input.itemId)).for('update')`. branchId is read only for the alert and is not compared with the caller's branches
  - apps/api/src/modules/stock/stock.service.ts:215: updateItem `if (input.branchId !== undefined) patch.branchId = input.branchId;` (any branch or null, also not checked for being in the tenant)
  - apps/web/src/features/stock/components/StockScreen.tsx:40,53: `useState<string | null>(null)` -> `useStockItems(branchId ?? undefined)` shows items from all branches
- **Tuzatish yo'nalishi:** D-8 ni omborga kengaytirib, createMovement/updateItem/createBatch/createBom/getItem'da item.branchId chaqiruvchining tayinlangan filiallari (yoki owner/tenant-wide tayinlov) bilan solishtirilsin (reports/report-scope.ts'dagi IR-06 yordamchisini qayta ishlatib), updateItem'da branchId o'zgartirish owner/tenant-wide bilan cheklansin va createOwnershipValidator bilan tekshirilsin; listItems default'i chaqiruvchi filiallariga toraytirilsin.

### LB-25 [medium] Payroll is clinic-wide, but the Branch Manager template has payroll.manage: a branch-assigned manager sees every branch's salaries and can create, finalize and delete the clinic-wide run

- **Oqim:** tenancy-gap1 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I1: a branch-assigned role sees no tenant-wide financial or HR data (the IR-06 spirit)
- **Scenariy:** Z is a Branch Manager assigned only to branch A. Z opens GET /api/payroll/runs/<id> or the Payroll screen and sees baseSalary, commission and the total payout for every doctor and nurse in branch B and the whole clinic. Z sends POST /payroll/runs {periodFrom, periodTo} and then /finalize. The clinic-wide run is frozen, and the owner or accountant can no longer create a run for that period (overlap guard), only redo it through DELETE. Z can also delete a draft run (DELETE /runs/{id}). Either drop payroll.* from the Branch Manager template or give payroll explicit tenant-wide scope (👤).
- **Dalil:**
  - packages/core/src/role-templates.ts:144-145: Branch Manager `'payroll.view','payroll.manage'`
  - apps/api/src/modules/payroll/payroll.routes.ts:42,76,130,172,208: only requirePermission('payroll.*'), no branch scope
  - apps/api/src/modules/payroll/payroll.service.ts:124-131: `from(staffProfiles).where(eq(staffProfiles.employmentStatus, 'active'))`: every active employee in the tenant (all branches)
  - apps/api/src/modules/payroll/payroll.service.ts:66-71: the period-overlap guard is tenant-wide, so there is one run per period
- **Tuzatish yo'nalishi:** Remove payroll.view and payroll.manage from the Branch Manager template (as with the other tenant-wide permissions), or add a tenant-wide-assignment check to the payroll routes. This needs a product decision.

### LB-26 [medium] Vizitning yozilishga avto-bog'lanishi faqat «bugungi birinchi bekor qilinmagan yozilish» bo'yicha, tanlash UI'si yo'q: o'tgan kun bandi hech qachon yopilmaydi, boshqa shifokor yozilishi bog'lanadi

- **Oqim:** treatment-gap7 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I1: vizit yozuvi o'z yozilishiga bog'lanadi va «Mendan kutilmoqda» bandi shu bilan yopiladi
- **Scenariy:** (a) Shifokor A kecha 17:00 dagi in_progress yozilish uchun yozuv yozmagan; ertasi kuni «Mendan kutilmoqda»dagi bandni bosadi -> bemor kartasi -> «Yangi vizit» -> saqlaydi. Bemorning bugun yozilishi yo'q, appointmentId=null bo'ladi; band 14 kun davomida yo'qolmaydi, UI orqali uni yopishning yo'li yo'q. (b) Bemor bugun 09:00 da gigienist B ga (completed) va 15:00 da shifokor A ga yozilgan. A vizit yozuvini saqlaydi: find() birinchi (B ning 09:00) yozilishini tanlaydi. Natija: B ning bandi yozuvsiz yopiladi, A ning 15:00 dagi yozilishi «yozuvsiz» bo'lib qoladi; agar B yozilishi boshqa filialda bo'lsa, kassa «Kutilayotgan vizitlar» A filialida bu vizitni ko'rsatmaydi.
- **Dalil:**
  - apps/web/src/features/clinical/components/visit-notes/VisitNotePage.tsx:272-283 — `const todayAppt = (apptQuery.data ?? []).find((a) => new Date(a.startTime).toDateString() === todayStr && a.status !== 'cancelled' && a.status !== 'no_show'); ... appointmentId: values.appointmentId ?? todayAppt?.id ?? null` (doktor, sta
  - apps/web/src/features/dashboard/components/widgets/DoctorPendingPanel.tsx:26-27 — band faqat `/patients/${patientId}`ga olib boradi, appointmentId uzatilmaydi
  - apps/api/src/modules/dashboard/dashboard.service.ts:41-46 — `eq(appointments.doctorId, userId) ... NOT EXISTS (SELECT 1 FROM visit_notes WHERE visit_notes.appointment_id = appointments.id)` (14 kunlik oyna)
  - apps/api/src/modules/cashier/cashier.service.ts:664-667 — `or(isNull(appointments.id), eq(appointments.branchId, branchId))` kassa filiali vizit bog'langan yozilish orqali aniqlanadi
- **Tuzatish yo'nalishi:** Avto-bog'lashni `a.doctorId === user.id` bilan cheklab, vizitga yaqin/mos yozilishni tanlash (yoki «Mendan kutilmoqda» bandidan `?appointmentId=` uzatib, formada yozilish tanlash maydonini qo'shish); backend'da create/update'da appointment doktori == yozuvchi shifokorni tekshirish.

### LB-27 [medium] «Imzolanmagan vizit yozuvi» hisoblagichi qoralamani bajarilgan deb hisoblaydi (signedAt tekshirilmaydi)

- **Oqim:** treatment-gap7 · auditor `medium` → refuter `medium` · 📖 statik
- **Invariant:** I2: qoralama yozuv shifokorning «kutilmoqda» ro'yxatidan chiqib ketmasligi kerak
- **Scenariy:** Shifokor vizit sahifasida «Saqlash» (qoralama) bosadi, «Imzolash»ni unutadi. Yozuv appointment'ga bog'langan, shuning uchun DoctorDashboard'dagi «Imzolanmagan vizit yozuvlari» bandi darhol 0 ga tushadi. Kassa esa imzolanmagan vizitni «Kutilayotgan vizitlar»da ko'rsatmaydi, ombor esa allaqachon yechilgan. Natijada vizit hech qayerda eslatilmaydi: na shifokorga, na kassirga, xizmat to'lovsiz qoladi.
- **Dalil:**
  - apps/api/src/modules/dashboard/dashboard.service.ts:25-29 — izoh: «hozirgi sxemada imzolash holati YO'Q — D4 imzo keyin keladi»; imzo esa 0052 migratsiyasi bilan qo'shilgan
  - apps/api/src/modules/dashboard/dashboard.service.ts:45 — `NOT EXISTS (SELECT 1 FROM visit_notes WHERE visit_notes.appointment_id = appointments.id)` — `signed_at IS NOT NULL` sharti yo'q
  - apps/api/src/modules/cashier/cashier.service.ts:664-665 — kassa faqat `isNotNull(visitNotes.signedAt)` vizitlarni ko'radi
- **Tuzatish yo'nalishi:** Dashboard `noteWhere`ni qayta yozing: yozilishga bog'langan visit_note yo'q YOKI mavjud bo'lsa ham `signed_at IS NULL` (masalan `NOT EXISTS (... WHERE appointment_id = appointments.id AND signed_at IS NOT NULL)`). Eskirgan izohni yangilang.

### LB-28 [low] lab_users.phone butun Hub bo'yicha unique, hisobni o'chirib ham, telefonini o'zgartirib ham bo'lmaydi: labdan ketgan texnik boshqa labga qo'shila olmaydi va o'z labining lead'i bo'la olmaydi

- **Oqim:** lab-gap3 · auditor `medium` → refuter `low` · 📖 statik
- **Invariant:** I3
- **Scenariy:** Texnik T Lab A'da ishlagan, Lab A lead'i uni nofaol qiladi. T Lab B'ga o'tadi. Lab B lead'i uni +998901234567 bilan qo'shmoqchi bo'ladi va 409 lab_user.phone_taken oladi. T o'z labini ochsa, vendor Supervisor'da yaratishga uringanda ham 409 chiqadi. Yagona yechim boshqa SIM. Bundan tashqari 409 javobi telefon boshqa labda ro'yxatdan o'tganini oshkor qiladi. Login global telefon bo'yicha bo'lgani uchun bu qisman dizayn oqibati, lekin o'tish yo'li umuman yo'q.
- **Dalil:**
  - apps/lab-hub-api/src/db/schema.ts:57 `uniqueIndex('lab_users_phone_uq').on(t.phone)` (lab_id'siz, global)
  - apps/lab-hub-api/src/modules/lab/lab.routes.ts:817-818 `if (isUniqueViolation(err)) throw new ApiError(409, 'lab_user.phone_taken')`
  - apps/lab-hub-api/src/modules/lab/lab.routes.ts:832-839 PATCH users'da phone yo'q; DELETE users endpointi yo'q
  - apps/lab-hub-api/src/modules/internal/internal.routes.ts:128-129 lab yaratishda ham xuddi shu 409
- **Tuzatish yo'nalishi:** Telefon bandligini faqat faol qatorlar uchun majbur qiling (partial unique `WHERE is_active`) va nofaol qatorning telefonini ozod qiling yoki qayta aktivatsiyada tekshiring; muqobil sifatida lead/vendor uchun «xodimni boshqa labga ko'chirish» yoki telefonni o'zgartirish endpointini qo'shing. Login global bo'lgani uchun avval bitta telefon = bitta faol hisob qoidasini hal qiling.

### LB-29 [low] Recall worker: `contacted`ga UPDATE shartsiz va qator qulflanmagan — tashqi send davomida (timeout'siz) parallel o'zgarish ustidan yoziladi

- **Oqim:** messaging-gap4 · auditor `medium` → refuter `low` · 📖 statik
- **Invariant:** Recall holat o'tishi pending->contacted faqat qator hali pending bo'lganida (SELECT ... FOR UPDATE yoki UPDATE ... WHERE status='pending'); yopilgan/rejalashtirilgan recall qayta ochilmasligi kerak
- **Scenariy:** Bemorning recall'i bugun due. 11:00 scan worker `live.status='pending'` o'qiydi va Eskiz/Telegram'ga send qiladi (bir necha soniya, tarmoq sekin bo'lsa uzoqroq). Shu paytda registrator bemorni yozadi: appointments.create -> closeOpenOnRebook recall'ni 'scheduled' + scheduledAppointmentId qiladi va commit qiladi (yoki menejer recall'ni 'cancelled' qiladi). Worker send tugagach `UPDATE recalls SET status='contacted' WHERE id=...` — shartsiz bo'lgani uchun 'scheduled'/'cancelled' holatini 'contacted'ga qaytaradi. Natija: yozilgan bemor recall ro'yxatida yana 'bog'lanish kerak' bo'lib qoladi, efficacyPct (scheduled+completed) kamayadi, menejerning cancel'i yo'qoladi. Bir xil mexanizm ikkita bir vaqtdagi scan (BullMQ stalled-job qayta yetkazish yoki ikkita consumer) bo'lsa dublikat xabarga ham olib keladi, chunki ikkalasi 'pending' ko'radi. Eslatma: oddiy BullMQ'da recall-scan kuniga bitta job va concurrency=1, shuning uchun dublikat faqat stalled/ikkinchi consumer bilan; asosiy real xavf parallel foydalanuvchi o'zgarishi.
- **Dalil:**
  - apps/api/src/lib/recall-worker.ts:139-148 — `const [live] = await tx.select({status,attempts}).from(recalls).where(eq(recalls.id,...)).limit(1); if (live.status !== 'pending') {skipped}` — `.for('update')` yo'q
  - apps/api/src/lib/recall-worker.ts:221 — `const sendRes = await channel.send(to, { text });` tx ichida, tashqi HTTP (Eskiz/Telegram fetch'larda timeout yo'q: packages/notifications/src/telegram.ts, eskiz.ts)
  - apps/api/src/lib/recall-worker.ts:241-250 — `.update(recalls).set({status:'contacted', lastContactedAt, contactAttempts: live.attempts+1}).where(eq(recalls.id, row.recallId))` — `status='pending'` sharti yo'q; READ COMMITTED'da parallel commit'dan keyin ham ustidan yoziladi
  - apps/api/src/modules/recalls/recalls.service.ts:268-273 closeOpenOnRebook (status:'scheduled') va :151 update() (cancelled/completed) boshqa tx'da shu qatorni o'zgartiradi
- **Tuzatish yo'nalishi:** Yakuniy UPDATE'ga status='pending' shartini qo'shing (va/yoki o'qishda .for('update')); send'ni tx tashqarisiga chiqarish ma'qul.

### LB-30 [low] Registrator 'Bugun' ekranidagi 'Lab muddati o'tgan' diqqat bandi Receptionist roli uchun hech qachon chiqmaydi va havolasi taqiqlangan sahifaga olib boradi

- **Oqim:** rbac-gap0 · auditor `medium` → refuter `low` · 📖 statik
- **Invariant:** I1: dashboard widget'i shu dashboard'ni ko'radigan yagona rolning ruxsatlari bilan ishlashi kerak
- **Scenariy:** Receptionist shablonidagi xodim bemorni toj kiydirishga chaqiradi. Lab ishi 2 kun kechikkan. Spec bo'yicha 'Bugun' ekranining Diqqat panelida 'Lab muddati o'tgan' bandi chiqishi kerak. Lekin Registratorda lab_order.view yo'q: so'rov yuborilmaydi, overdueLabs=0, band chiqmaydi va hech qanday 'ruxsat yo'q' belgisi ham yo'q. Owner rolga lab_order.view qo'shsa ham, band 20 ta eng yangi buyurtma ustida hisoblanadi (F1). Spec'dagi feature amalda faqat Receptionist bo'lmagan, lekin bu dashboard'ni ko'rmaydigan rollarda ishlaydi.
- **Dalil:**
  - apps/web/src/features/dashboard/role-dashboard-map.ts:16 — `receptionist: ReceptionistDashboard` (bu dashboard'ni faqat Receptionist templateKey ko'radi)
  - packages/core/src/role-templates.ts:257-279 — Receptionist ruxsatlarida `lab_order.view` YO'Q
  - apps/web/src/features/dashboard/dashboard.api.ts:99 — `enabled: hasPermission('lab_order.view')` -> Registratorda so'rov ketmaydi, overdueLabs doim 0
  - apps/web/src/features/dashboard/components/ReceptionistDashboard.tsx:383-392 — `...(attention.overdueLabs > 0 ? [{ key: 'lab', ..., to: '/lab' }] : [])`
- **Tuzatish yo'nalishi:** Registrator uchun lab muddati diqqatini `lab_order.view` talab qilmaydigan tor endpoint (masalan `appointment.view`/`recall.view` bilan `GET /dashboard/reception-attention` ichida overdueLabs soni) orqali oling yoki Receptionist shabloniga `lab_order.view` qo'shing (yangi tenantlar uchun, backfill bilan), band esa mavjud bo'lmasa `/lab` havolasisiz ko'rsating.

