# Tuzatishlar reyestri — 2026-11-19

Yagona ro'yxat: **nima tuzatiladi, qayerda, qanday qabul qilinadi**. Ikki manbani birlashtiradi:

- `CF-#` — klinika sinovi fikrlari, tahlil: [`CLINIC-FEEDBACK-2026-11-19.md`](./CLINIC-FEEDBACK-2026-11-19.md)
- `LA-##` — mantiqiy audit topilmalari, dalil va scenariy: [`LOGIC-AUDIT-2026-11-19.md`](./LOGIC-AUDIT-2026-11-19.md)

Bu hujjat dalillarni takrorlamaydi — har band manbaga havola qiladi. Kod hali TEGILMAGAN.

**Belgilar:** 👤 foydalanuvchi qarori kerak · 💰 pul (real-DB failing test majburiy) · 🔒 xavfsizlik/izolyatsiya · 🪟 Windows'da tekshirish · Hajm: S ≤1 kun · M 2–4 kun · L 1–2 hafta · XL.
**Holat ustuni:** `ochiq` → `rejada` → `qilindi` → `tasdiqlandi`.

## 0. Umumiy qoidalar (har tuzatish uchun)

1. **Failing-first.** Avval xatoni ko'rsatadigan test yoziladi va yiqilishi ko'riladi; keyin tuzatish. 💰/🔒 bandlarda kamida bitta **real-DB** test (spy-dep emas).
2. **Rol bo'yicha sinov.** Ruxsat/filial bandlari real cheklangan rol bilan (`@owner` emas).
3. **4xx'da yozuv** — `fail()` qaytar, throw qilma (rlsMiddleware 4xx'da COMMIT qiladi — LA-06 ning «arvoh qator» qismi shundan).
4. **Tashqi side-effect** (Redis publish, SMS, Telegram, fiskal) — faqat `onAfterCommit` orqali, timeout bilan.
5. Yangi permission — katalog + rol shabloni + **mavjud tenantlar uchun backfill migratsiya**.
6. Statik tasdiqlangan topilma tuzatishdan oldin test bilan qayta isbotlanadi; isbotlanmasa — reyestrga «qayta ishlab chiqarilmadi» deb yoziladi, tuzatilmaydi.

## 1. Kesishuvchi naqshlar (bir marta qurib, ko'p joyda ishlatish)

| ID | Naqsh | Qamraydi | Hajm |
|---|---|---|---|
| **X-1** 🔒 | **Begona ID tekshiruvi.** Body'dagi har FK (`patientId`, `doctorId`, `branchId`, `treatmentPlanId`, `serviceId`, `itemId`) RLS ostida mavjudligi `createOwnershipValidator` bilan tekshiriladi, aks holda 404. Postgres FK tekshiruvi RLS'ni chetlab o'tadi (🧪 2026-11-19 probe bilan tasdiqlangan). Admin-ulanishli worker join'lariga `tenant_id = tenant_id` sharti. | LA-06, LA-46, audit low'lari (queue walk-in, cashier, stock BOM/batch, booking confirm) | M |
| **X-2** 🔒👤 | **Filial doirasi helper'i.** `report-scope.ts` naqshini operatsion endpoint'larga umumlashtirish: so'ralgan/yozilayotgan `branchId` chaqiruvchining tayinlangan filiallari ichida bo'lsin; owner va tenant-wide tayinlov istisno. | LA-25, LA-27/30, LA-31, LA-08, LA-11, LA-04 | M |
| **X-3** | **Bosqich yakunlash yagona yo'li.** Bosqich `completed` bo'lishi faqat bitta servis funksiyasi orqali: acceptance tekshiruvi, imzolangan vizit, ombor chiqimi, odontogramma sinxroni, recall. | LA-33, LA-35, LA-36, audit low «plan ekranidan completed ombor chiqimisiz» | M |
| **X-4** | **Litsenziya javobini tekshirish.** Supervisor'dan kelgan har payload `.lic`ga yozilishidan oldin imzo + fingerprint + muddat regressiyasi tekshiruvidan o'tadi. | LA-15, LA-16 | S |

---

## 2. To'lqinlar (bajarish tartibi)

### To'lqin 1 — Xavfsizlik va izolyatsiya 🔒

| ID | Manba | Nima tuzatiladi | Qabul mezoni | Hajm | Holat |
|---|---|---|---|---|---|
| FX-01 | LA-06 | Recall create'da `patientId`/`treatmentPlanId`/`assignedDoctorId`/`branchId` egalik tekshiruvi (X-1); recall-worker admin join'iga `patients.tenant_id = recalls.tenant_id` | Real-DB test: A kontekstida B bemoriga recall → 404, qator yaratilmaydi; worker begona juftni o'tkazib yuboradi. Mavjud arvoh qatorlarni topuvchi SQL so'rovi hujjatlangan | S | ochiq |
| FX-02 | LA-46 + audit low | Appointment create/update'da patient/doctor/assistant egaligi (X-1); global EXCLUDE'ga `tenant_id WITH =` (yoki ikki-tenant doktor bloki qasddan ekanini Qaror sifatida yozish) 👤 | Real-DB test: begona `patientId` → 404; ikki tenant bir-birining bronini bloklay olmaydi (yoki qaror hujjatlangan) | M | ochiq |
| FX-03 | audit low (tenancy) | Qolgan create endpoint'lardagi begona FK'lar: queue walk-in, cashier, stock BOM/batch/movement, booking confirm (X-1) | Har endpoint uchun begona ID → 404 testi | M | ochiq |
| FX-04 | LA-05 | `rlsMiddleware` qayta kirish guard'i (kontekstda tx bor bo'lsa — `next()`), yoki auth/rls'ni bare-`/api` modullaridan ota darajaga ko'chirish | Test: `/api/patients/:id/images` so'rovida `db.transaction` 1 marta chaqiriladi; clinical/patient-images RLS izolyatsiyasi saqlanadi | S | ochiq |
| FX-05 | LA-19 | Vendor orqali owner parol tiklashda refresh token'larni bekor qilish + `mustChangePassword: false` | Test: tiklashdan keyin eski refresh token 401 | S | ochiq |
| FX-06 | LA-15 (X-4) | Heartbeat javobini `writeLicense`dan oldin imzo+fingerprint bilan tekshirish; yaroqsiz bo'lsa eski `.lic` saqlanadi | Test: imzosiz/boshqa fingerprint javobi `.lic`ni o'zgartirmaydi 🪟 | S | ochiq |
| FX-07 | LA-16 (X-4) | Supervisor «qator yo'q» va «deaktivatsiya» uchun alohida kod qaytaradi; `.lic` faqat **imzolangan** revoke'da o'chiriladi; `expiresAt` regressiyasi rad etiladi | Test: imzosiz `INVALID_KEY` `.lic`ni o'chirmaydi; imzolangan revoke o'chiradi | M | ochiq |
| FX-08 | LA-45 | `/api/activate` va `/api/reset-owner-password` faqat `DENTAL_LOCAL_DESKTOP` bo'lganda mount (bulutda 404) | Bulut rejimida ikkala route 404 | S | ochiq |
| FX-09 | LA-01 | `needsVendor` holatida «Ta'minotchi tayyorladi — kalitni kiriting» tugmasi mavjud aktivatsiya formasini ochadi | Vitest: needsVendor'da tugma → forma; Linux E2E: `.lic` bor, baza bo'sh → UI orqali qayta aktivatsiya → login 🪟 | S | ochiq |
| FX-10 | LA-24 | `telegram:reload` publish'ni `onAfterCommit` ichiga | Test: publish commit'dan keyin chaqiriladi | S | ochiq |
| FX-11 | gigiena | `apps/api/tests/integration/.ui-t2-telegram-secret-test.txt` — git'dan chiqarish, `.gitignore`, ichida haqiqiy kalit yo'qligini tekshirish | `git ls-files` da yo'q; test temp fayl ishlatadi | S | ochiq |

### To'lqin 2 — Pul va davolash yaxlitligi 💰

| ID | Manba | Nima tuzatiladi | Qabul mezoni | Hajm | Holat |
|---|---|---|---|---|---|
| FX-12 | LA-03, LA-39 | `stageId`li vizit kassa «kutilayotgan» ro'yxatiga tushmaydi; `create(visitNoteId)` stageId'li vizitni rad etadi yoki to'lovni shu bosqichga allocation qiladi 👤 (qaysi biri) | Real-DB: bosqichli vizit pending'da yo'q; vizit yo'li bilan to'lash → 409 (yoki allocation, reja qarzi kamayadi) | S | ochiq |
| FX-13 | LA-36 (X-3) | Bosqich `completed` faqat effektiv `acceptance='accepted'` bo'lsa; vizit formasida faqat qabul qilingan bosqichlar | Test: proposed bosqichni completed qilish → 400 (yoki avto-accept — 👤) | S | ochiq |
| FX-14 | LA-33 (X-3) 👤 | Bosqich yakunlash + recall + odontogramma `sign()` ga ko'chadi (qoralama saqlash bosqichni yopmaydi); ko'p vizitli bosqich uchun «yakunlovchi vizit» bayrog'i. Qaror #37 bilan solishtirish | Test: qoralama vizit → bosqich `in_progress`; imzo → `completed` | M | ochiq |
| FX-15 | LA-32 | Completed bosqichning acceptance'ini rad etish/proposed qilish taqiqlanadi; completed bosqichli rejani bekor qilish rad etiladi yoki sabab + ruxsat talab qiladi | Real-DB: bekor qilishdan keyin ham bajarilgan ish qarzi saqlanadi | S | ochiq |
| FX-16 | LA-37 | Rejani `completed` qilishda bajarilmagan accepted bosqich bo'lsa rad etish (yoki «skipped qilib yopish» dialogi) | Test + UI tasdiq dialogi | S | ochiq |
| FX-17 | LA-38 | `listPendingVisits` faqat bugun emas — N kunlik oyna (30) + «kechikkan» belgisi + paginatsiya | Test: kecha imzolangan to'lanmagan vizit ro'yxatda | S | ochiq |
| FX-18 | LA-28 | Payroll `finalizeRun` draft snapshot'idan keyingi to'lov/refund'ni aniqlaydi: rad etadi (`stale_snapshot`) yoki qayta hisoblaydi | Real-DB: draft → to'lov qo'shildi → finalize → yo'qolmaydi. CLI-479 invarianti testi yashil | M | ochiq |
| FX-19 | LA-29 👤 | Vizit orqali POS to'lovi doktorga bog'lanadi: `COALESCE(plan.doctor_id, visit_note.doctor_id)` payroll, hisobot va refund hook'ida. Qaror #16 kengaytmasi | Real-DB: vizit to'lovi komissiyada ko'rinadi; refund to'g'ri clawback | M | ochiq |
| FX-20 | LA-26 | Debt-aging langari — to'lanmagan qoldiq (FIFO bo'yicha birinchi to'liq yopilmagan bosqich / qoldiqli tranzaksiya) | Real-DB: eski to'langan + yangi qarz → yangi bucket | S | ochiq |
| FX-21 | CF-20 | Erkin (items) to'lovda `patientId` majburiy: schema `.refine` + web Charge gate | Test: items rejimida patientsiz → 400 | S | ochiq |
| FX-22 | LA-34 🔒 | Dori↔allergiya: noma'lum allergiyada (xato/403/loading) `CriticalActionDialog`; `PrescriptionsTab`da ham tekshiruv; server tomonda override sababisiz 409 | Test: konfliktli retsept serverda 409; override sababi audit'da | M | ochiq |

### To'lqin 3 — Klinikada ko'ringan buglar

| ID | Manba | Nima tuzatiladi | Qabul mezoni | Hajm | Holat |
|---|---|---|---|---|---|
| FX-23 | CF-1 | Telegram bron so'rovlari: `refetchInterval ~20s`; `TelegramRequests` umumiy widget — Manager/Doctor/Generic dashboard'larda ham (`appointment.create` gate); sidebar badge `pendingCount`; yangi so'rovda xodimga bildirishnoma (`findRecipientsWithPermission`); «Muddati o'tgan» tab | Brauzer: owner, branch manager va registrator yangi so'rovni 30 s ichida ko'radi | M | ochiq |
| FX-24 | CF-1 / LA-40 | Bron muddati tugaganda (24 soat yoki slot o'tganda) bemorga xabar; 409 band slotda tasdiqlashda doktor/vaqt almashtirish | Test: expire → bemorga xabar | S | ochiq |
| FX-25 | CF-1 (P2) | Bot insert'iga `audit.record`; `roleKey` tanlashda `ORDER BY`; bot token unikalligi (bot username bo'yicha) | Testlar | S | ochiq |
| FX-26 | CF-5 | Rozilik: bitta tugma (`hasConsent` gate), bitta termin («Rozilik»); plan modalida inline imzolash (`signForm` + `setConsent`) | Vitest: bog'langandan keyin tugma yo'q; modaldan imzolab bog'lash | S | ochiq |
| FX-27 | LA-35, CF-11 (X-3) | `resultingToothState` create-stage schema'siga; odontogramma va StageRow'da tanlash; bosqich tugaganda tish snapshot'i | E2E: bosqich completed → odontogrammada yangi holat | M | ochiq |
| FX-28 | LA-02 | Telegram anketasi: DTO'ga `questionnaireAnswers/At`; MedicalTab'da «Bemor anketasi» bloki + «tibbiy kartaga ko'chirish»; qayta topshirishda tarix | Brauzer: bot anketasi shifokorga ko'rinadi | M | ochiq |
| FX-29 | LA-04 (X-2) | Tenant-wide tayinlovli xodimga barcha filiallar; yozilish ustasida filial selektori | Rol testi: tenant-wide registrator filial almashtiradi | S | ochiq |
| FX-30 | CF-13 | Bemor moliyasi ekrani: `planDebt` / `nonPlanBalance` / avans alohida kartalar; refund turi va status ajratiladi; to'lovda reja/bosqich nomi; paginatsiya; yagona termin. Pul mantig'i o'zgarmaydi | Brauzer: ekran yig'indisi sarlavhaga mos | M | ochiq |

### To'lqin 4 — Filial doirasi 🔒👤 (Qaror #29 bilan kelishilgandan keyin)

> Oldin qaror: kassa/xarajat/ombor operatsiyalari filialga qat'iy bog'lanadimi? Qaror #29 bemor va rejalarni tenant-level qilgan — kassa va hisobotlar alohida masala.

| ID | Manba | Nima tuzatiladi | Hajm | Holat |
|---|---|---|---|---|
| FX-31 | LA-25 | `/api/reports/pnl` ga `reportBranchScope` | S | ochiq |
| FX-32 | LA-27, LA-30 | Kassa endpoint'lari (create, refund, daily-summary, transactions, pending-visits) X-2 bilan | M | ochiq |
| FX-33 | LA-31 | Invite/addAssignment/updateAssignment'da filial eskalatsiyasi taqiqi (`branch.escalation` 403) | S | ochiq |
| FX-34 | LA-08 | Doktor↔filial moslik helper'i: `listDoctors(branchId)`, slot fallback, appointment create/update (`schedule.doctor_not_in_branch`) | M | ochiq |
| FX-35 | LA-11 👤 | BOM avto-chiqimi vizit filialidagi itemdan (`service_materials.branch_id` yoki filialga mos item) | M | ochiq |

### To'lqin 5 — Bron va xabarlar

| ID | Manba | Nima tuzatiladi | Hajm | Holat |
|---|---|---|---|---|
| FX-36 | LA-09 | Faol→faol status o'tishida ish soati/time-off qayta tekshirilmaydi; `{ok:false}` natijalar bot va navbatda ochiq ko'rsatiladi | S | ochiq |
| FX-37 | LA-10 | Telegram «Boshqa vaqt»: eski yozilish yangisidan oldin bekor qilinadi (yoki `excludeId`); recall yangi yozilishga qayta bog'lanadi | S | ochiq |
| FX-38 | LA-07 | No-show sweep kunlik job sifatida ulanadi (Toshkent vaqti, `RUN_REMINDER_WORKER` gating) | S | ochiq |
| FX-39 | LA-23 | Eslatma vaqti `tenant_settings.reminder_lead_hours` dan | S | ochiq |
| FX-40 | LA-20 | Bot `stop()` try/catch; launch yiqilsa bot ro'yxatdan o'chiriladi (qayta yuklanadi) | S | ochiq |
| FX-41 | LA-22 | Telegram 403/blocked → SMS fallback, `telegramChatId` tozalanadi; telefon/token o'zgarsa bog'lanish bekor; xodim uchun «Telegramni uzish» (audit) | M | ochiq |
| FX-42 | LA-21 | Oilaviy telefon: bir chat'ga bir nechta bemor (bog'lanish jadvali) + botda bemor tanlash. **CF-3a (bemor o'z ma'lumotlarini ko'rishi) uchun shart** | M | ochiq |

### To'lqin 6 — Ombor

| ID | Manba | Nima tuzatiladi | Hajm | Holat |
|---|---|---|---|---|
| FX-43 | LA-12 | Inventarizatsiya formasi: «sanalgan miqdor» yorlig'i, joriy qoldiq ko'rinadi, 0 ruxsat | S | ochiq |
| FX-44 | LA-42 | Vizit tahririda qaytarish ledger bo'yicha (movement'lar yig'indisi), joriy BOM emas | S | ochiq |
| FX-45 | LA-41 | Bekor qilingan yozilish / bekor qilingan imzolangan vizit uchun chiqimni qaytarish (idempotent) | M | ochiq |

### To'lqin 7 — Lab va Lab Hub

| ID | Manba | Nima tuzatiladi | Hajm | Holat |
|---|---|---|---|---|
| FX-46 | LA-13 | Klinikada bekor qilish Hub'ga `cancel` op; bekor qilingan buyurtmaga narx tasdig'i/xarajat taqiq | M | ochiq |
| FX-47 | LA-14 | Rad etilgan ishni boshqa labga qayta yuborish (`reassign`); rad etilgan ishga narx tasdig'i 409 | M | ochiq |
| FX-48 | LA-43 | `failed` outbox op'larini qayta navbatga qo'yish (endpoint + tugma); approve_price doimiy xatoda kutish holati tozalanadi | S | ochiq |
| FX-49 | LA-44 | `upsert_case applied:false` → `synced` emas; `hubStatus` yangilanadi, tahrir bloklanadi | S | ochiq |
| FX-50 | CF-21 | Labdan qaytgan fayllar buyurtma «Fayllar» ro'yxatida; yuklash xatosi yuborishni to'xtatadi yoki tasdiq so'raydi; preview; mobil `capture` | M | ochiq |

### To'lqin 8 — Desktop zaxira 🪟

| ID | Manba | Nima tuzatiladi | Hajm | Holat |
|---|---|---|---|---|
| FX-51 | LA-17 | Retention shu chaqiruvda yaratilgan nusxani o'chirmaydi; soat orqaga ketsa ogohlantirish | S | ochiq |
| FX-52 | LA-18 | Tiklash uploads/migratsiya bosqichida yiqilsa pre-restore dump'ga qaytarish; natija aniq («baza qaytarildi / qaytarilmadi») | M | ochiq |

### To'lqin 9 — tasdiqlangan low topilmalar (refuter run `wf_46ae37fd-f08`, 43/44 tasdiqlandi)

Batch 2 lane'lariga taqsimlangan (`docs/superpowers/plans/2026-11-19-fix-batch2.md`). 1 ta hal bo'lmagan: «No-show strike faqat maslahat» — mahsulot qarori, 🛠 o'zgarishsiz qoladi (bayroq ko'rsatiladi, bloklanmaydi).

| ID | Lane | Og'irlik | Topilma | Tuzatish yo'nalishi |
|---|---|---|---|---|
| FX-53 | M | low | Booking-requests ro'yxati filial bo'yicha filtrlanmaydi: bir filial registratori boshqa filial so'rovlarini ko'radi va tasdiqlay oladi | Add an optional branchId query parameter to list and pendingCount, defaulting to activeBranchId, and send it from reception.api.ts. |
| FX-54 | M | low | Kelajakdagi yozilishni no_show qilish mumkin -> strike darhol yoziladi | no_show o'tishida (service yoki transitions'da) before.startTime kelajakda bo'lsa rad et (masalan 400 `status.no_show_before_start`) yoki strike'ni faqat startTime <= now bo'lganda yoz. |
| FX-55 | M | low | Shifokor navbatda 'Keyingisini chaqirish' tugmasi boshqa shifokor bemorini ko'rsatadi -> 403 | UI'da queue.manage'siz shifokor uchun nextWaiting'ni ticket.doctorId === user.id bilan filtrla va tugmani faqat shunda ko'rsat. Walk-in ticket uchun ham shifokorga chaqirish yo'lini aniqla (masalan server qoidasini yumshat). |
| FX-56 | M | low | Slot tugmasi indeksi eskirgan xabarlarda boshqa kunning slotiga mos keladi (bot) | Callback data'ga slot vaqtini yoki sessiya versiyasi/sana tokenini qo'shing (masalan `bk:s:<i>:<hhmm>`) va handler'da s.slots[i].start bilan solishtiring. Muqobil: `op==='t'` ichida s.slots=[] qiling va s.step!=='slot' bo'lsa `s` callback'ini rad eting. |
| FX-57 | M | low | Ko'chirilgan 'confirmed' yozilish confirmed'ligicha qoladi va bemorga xabar ketmaydi; <24 soat qolsa eslatma ham yo'q | startTime o'zgarganda status 'confirmed' bo'lsa 'scheduled'ga qaytar va/yoki bemorga ko'chirish xabarini yubor. Yangi vaqt 24 soatdan yaqin bo'lsa darhol xabar ket. |
| FX-58 | M | low | Bot 'Bekor' tugmasi erta check-in qilingan bemorning ochiq navbat ticket'ini yopmaydi | reminder-actions.ts da 'no' amalidan oldin yozilishga bog'langan ochiq queue_ticket bor-yo'qligini tekshirib, bo'lsa 'already' qaytarish, yoki createBotFlows ga queue reverse-sync hook'ini ulash. |
| — | FX-03b | low | Tasdiqlashda doctorId/branchId/patientId tenantga tegishliligi tekshirilmaydi, faqat FK (platform-global users) | qamrab olingan |
| FX-59 | M | low | Bron so'rovi kartasida vaqt brauzer mintaqasida (uz-UZ, TZ'siz) ko'rsatiladi | Add timeZone: 'Asia/Tashkent' to the options (or use a shared lib/format helper that already does this). |
| FX-60 | I | low | Bosqichni plan ekranidan (Select) completed qilish ombor BOM chiqimini bajarmaydi — bir xil ma'no uchun ikki yo'l | updateStage'dagi completed hook'lari qatoriga stage.serviceId BOM'i uchun idempotent deductStock chaqiruvini qo'shish (vizit yo'li bilan ikki marta yechilmasligi uchun sourceStageId/visitNote bo'yicha dedup). |
| FX-61 | F | low | Konsent: terminal planda qayta bog'lash, bemor imzosisiz forma va default 'muddatsiz' | setConsent'da before.status in_progress/completed/cancelled bo'lsa rad et (409), UI tugmasini shu statuslarda yashir; ixtiyoriy: patientSignatureName'ni gate'da talab qil. |
| FX-62 | F | low | Odontogramma snapshot'i last-write-wins: eski qoralamadan saqlash avto-snapshot'ni (bosqich tugashi) ustiga yozadi | useUpdateStage.onSuccess da tooth-chart (latest/history) so'rovlarini invalidate qiling, shunda draft qayta hydrate bo'ladi. |
| — | FT-01 | low | Plan bosqichlarini tahrirlab bo'lmaydi (bosqich qo'shish/narx o'zgartirish yo'q), reja totalCost qotib qoladi | qamrab olingan |
| FX-63 | N | low | Vizit to'lovi refund qilingach vizitni qayta undirib bo'lmaydi; qisman undirish ham vizitni 'to'langan' qiladi | Pre-check va pending NOT EXISTS'da faqat refund qilinmagan (yoki to'liq refund bilan qoplanmagan) tranzaksiyalarni hisoblash; qisman savatda qolgan xizmatlarni qarz sifatida saqlash. |
| FX-64 | N | low | Finalized run'da doktor qatori bo'lmasa refund keyingi davrda komissiya olinmagan daromaddan ayiriladi | recordRefundAdjustment da qator topilmasa ham 0 summali adjustment yozish (yoki netting'dan chiqarish), shunda refund keyingi davr daromadidan ayirilmaydi. |
| — | FT-04 | low | Fiskal payload izchil emas: amount=paidAmount, items chegirmasiz subtotal, discount maydoni yo'q; reja to'lovida items bo'sh | qamrab olingan |
| FX-65 | L | low | Bekor qilingan reja krediti umumiy balansda boshqa reja qarzini neytrallaydi, lekin kreditni qo'llash yo'li yo'q | Bekor qilingan rejada kredit qolsa, kassada uni boshqa reja bosqichiga o'tkazish yoki refund qilish haqida eslatma ko'rsating. Yoki per-plan qarzni umumiy balansdan alohida ko'rsating. |
| FX-66 | I | low | BOM/partiya/harakat endpointlari item/xizmat mavjudligi va tenant egaligini tekshirmaydi (500 yoki begona UUID'li yetim yozuv) | createBatch/createMovement/createBom boshida item va service'ni getDb(c) (RLS) orqali SELECT qilib topilmasa 404 qaytar, createBom'da 23505'ni 409 ga o'gir. |
| FX-67 | I | low | Parallel vizit PATCH'larida reconcile qulfsiz 'before' ustida ishlaydi (qo'sh/yo'qolgan chiqim) | `update` boshida `repo.find`ni `SELECT ... FOR UPDATE` bilan qiling (yoki `updatedAt` bo'yicha optimistik versiya qo'shing), POST'ga Idempotency-Key qo'shing. |
| FX-68 | I | low | 'Necha kunga yetadi': 30 kunga bo'lish yangi itemda sarfni kamaytirib ko'rsatadi; eski vizit qaytarishi oynani manfiy qiladi | avgDailyUsage'ga oyna sifatida min(30, itemning yoshi kunlarda, kamida 1) bering; visit_edit_return'ni faqat qaytarilayotgan asl chiqim ham oyna ichida bo'lsa ayiring. |
| FX-69 | I | low | deductForServices BOM qatorlarini tartibsiz yangilaydi (parallel vizitlarda deadlock -> vizit saqlanmaydi) | BOM'larni itemId bo'yicha saralab (orderBy itemId) yangilash yoki avval `SELECT ... FOR UPDATE ORDER BY id` bilan item qatorlarini qulflash; reconcileForServices'ga ham shuni qo'llash. |
| FX-70 | M | low | Yozilish uchun shifokorlar ro'yxati muddati o'tgan (validTo < now) tayinlovlarni ham qaytaradi | Ikkala so'rovga ham `or(isNull(userAssignments.validTo), gt(userAssignments.validTo, new Date()))` qo'shish (yaxshisi umumiy helper orqali). |
| FX-71 | K | low | Ko'p tayinlovli foydalanuvchida rol layout'i/dashboard va standart filial tartibsiz (ORDER BY yo'q) birinchi qatordan olinadi | Ikkala so'rovga deterministik orderBy qo'shing (masalan, tenant-wide avval, so'ng createdAt/id), yoki roleKey'ni ustuvorlik jadvali bo'yicha tanlang. |
| FX-72 | K | low | Ishlamaydigan 'o'lik' permission'lar: staff.view/invite/edit/delete va user.deactivate hech bir endpoint/ekranda tekshirilmaydi, lekin rol quruvchida tanlanadi | O'lik kodlarni (staff.*, user.deactivate) katalogdan va rol shablonlaridan olib tashlang yoki ularni user.manage/user.view o'rniga haqiqiy guard sifatida ulang. |
| FX-73 | L | low | ManagerDashboard filialga biriktirilgan Branch Manager uchun tenant-wide hisobotlarni so'raydi va jim 403 oladi (Qarz KPI '—', ogohlantirish yo'q) | Debt/treatment-plans so'rovlarini faqat tenant-wide yoki owner foydalanuvchida yoqish (filial doirasini hisobga olib), aks holda plitkani yashirish yoki 'ruxsat yo'q' holatini ko'rsatish. |
| FX-74 | L | low | Sidebar'dagi 'Barcha filiallar' bandi endi eng eski filialga o'tkazadi (owner uchun ham), yorliq natijaga mos emas | Sidebar'dan allowAllBranches bandini olib tashlang (yoki 'Standart filial' deb nomlang) va currentBranchName'dagi 'all_branches' shoxini olib tashlang. |
| — | FX-03/X-1 | low | Other create endpoints also accept cross-tenant FK IDs without an RLS check (queue walk-in patientId/branchId/serviceId, cashier branchId) | qamrab olingan |
| FX-75 | H | low | Bot (Telegram) path: onAfterCommit runs immediately in the fake Context, before the withTenant tx commits (the P4 invariant breaks in the bot path) | In `createBotContext`, add `afterCommit: []` to the store. Have the withTenant wrapper in the bot path call `runAfterCommit` on that list after commit, and drop it on rollback. |
| FX-76 | F | low | Deleting a patient image or lab-order file removes it from disk before commit; if the tx rolls back, the DB row points to a missing file | deleteObject chaqiruvini onAfterCommit(c, ...) ichiga ko'chirish, har ikkala servisda. |
| FX-77 | N | low | The Soliq fiscal provider sends fetch inside the cashier tx (no timeout, while the stage row is locked FOR UPDATE); if the tx rolls back, the receipt is already registered with the tax authority | Move fiscal.createReceipt out of the tx into onAfterCommit (or an outbox/BullMQ job) and add AbortSignal.timeout to the Soliq fetch. |
| FX-78 | J | low | Klinika Hub'dagi 'remake' oqimini umuman ishga tushira olmaydi (uxlab yotgan feature); tasdiqlangan narx qayta ishlash uchun o'zgartirilmaydi | Klinikaga 'remake' outbox op + client metodi (POST /cases/{ref}/remake) va mavjud buyurtma uchun remake endpointi/tugmasini qo'shing, yoki Hub remake endpointi va sync.ts tarmog'ini o'lik kod sifatida olib tashlang. |
| FX-79 | J | low | Outbox FIFO: diskda yo'q fayl (ENOENT) cheksiz qayta uriniladi va shu buyurtmaning approve_price/message/delivered op'larini bloklaydi | `file` op'da ENOENT (yo'q fayl) ni non-retryable LabHubError ('file.missing') qilib, op'ni 'failed' deb belgilash va FIFO to'sig'idan chiqarish (yoki yo'q faylni `return undefined` bilan o'tkazib yuborish); qo'shimcha: umumiy attempts cap qo'yish. |
| FX-80 | J | low | Hub tasdig'idan yozilgan 'Laboratoriya' xarajati erkin tahrir/o'chirishga ochiq — approved_price bilan uzilib qoladi va qayta yozilmaydi | expenses update/remove'da labOrderId != null bo'lsa 409 qaytar (yoki faqat note'ga ruxsat ber). |
| FX-81 | H | low | Arxivlangan bemor Telegram/recall oqimlarida faol hisoblanadi | linkPatientByContact, resolveLinked va recall-worker so'rovlariga `isNull(patients.archivedAt)` qo'shish (yoki bemorni arxivlashda pending recall'larni bekor qilish). |
| FX-82 | H | low | Reminder/recall tashqi HTTP chaqiruvi tx ichida, timeout'siz; Telegram 'Kelaman' tugmasi muvaffaqiyatsizlikni 'allaqachon' deb ko'rsatadi | Add AbortSignal.timeout to the notification channel fetches (or send after commit), and return a distinct 'failed' outcome in reminder-actions instead of 'already'. |
| FX-83 | M | low | Bemor Telegram orqali bekor qilganda xodimga bildirishnoma yo'q; muvaffaqiyatsiz bo'lgan eslatma job'i keyingi reschedule'da qayta qo'yilmaydi | Bekor qilishdan keyin onAfterCommit orqali findRecipientsWithPermission bilan xodimga bildirishnoma yubor; enqueueReminder da mavjud job failed holatda bo'lsa existing.remove() qilib qayta add() qil. |
| FX-84 | H | low | Bir xil bot tokeni ikki tenantda ishlatilishi tekshirilmaydi; kontakt guruh chat'ida ham bemorni bog'laydi | linkPatientByContact chaqirilishidan oldin `ctx.chat.type === 'private'` ni majburlang. Token takrorini esa Telegraf getMe().id ni tenant bo'yicha saqlab, ikkinchi tenantda rad etish orqali tekshiring. |
| FX-85 | C2 | low | Tiklash tokeni tenant borligi tekshirilishidan oldin sarflanadi: reset.no_tenant (va tx xatosi) tokenni behuda yoqib yuboradi | Tenant mavjudligini verifyReset() dan oldin tekshiring. Tenant topilmasa tokenni sarflamasdan reset.no_tenant qaytaring. Yaxshiroq variant: verify va consume'ni ikki bosqichga ajratish, consume'ni lokal tranzaksiya muvaffaqiyatidan keyin chaqirish. |
| FX-86 | C2 | low | Aktivatsiyada tenant yaratilib .lic yozilmay qolsa, qayta urinish 'avvalgi parolingiz o'zgarmadi' deb noto'g'ri maslahat beradi | Skip holatini "tenant yaratilgan, .lic yozilmagan" (haqiqiy mavjud klinika) dan ajrat. Buning uchun .lic hali yo'q bo'lsa login_hint (vendor parolini oling) ni ko'rsat, yoki matnni neytral qil ("parol o'zgarmagan bo'lsa vendor bergan vaqtinchalik parolni ishla |
| FX-87 | C2 | low | Heartbeat monotonik langarni Date.now() bilan ko'taradi va hech qachon pasaytirmaydi: soat xato oldinga surilib heartbeat o'tsa, litsenziya o'sha sanagacha bloklanadi (izoh aksini da'vo qiladi) | Heartbeat muvaffaqiyatli bo'lsa langarni Date.now() bilan emas, Supervisor'ning imzolangan issuedAt qiymati bilan o'rnating (max(anchor, issuedAt)) va issuedAt'dan sezilarli ilgari ketgan langarni pasaytirishga ruxsat bering. Bundan tashqari, izohni to'g'rilan |
| FX-88 | C2 | low | Supervisor so'rovlarida timeout yo'q: «Qayta tekshirish» va aktivatsiya osilib qolishi mumkin | post()dagi fetch'ga `signal: AbortSignal.timeout(10_000)` qo'shish va timeout xatosini oddiy xabarga aylantirish. |
| FX-89 | C2 | low | Tiklashdan keyin Valkey'dagi eslatma job'lari tiklangan bazaga mos kelmaydi | Tiklashdan keyin API ishga tushganda kelajakdagi faol yozilishlar uchun eslatma job'larini bazadan qayta quring (reconcile), yoki tiklashda eslatma navbatini tozalab shu reconcile'ni chaqiring. |
| FX-90 | C2 | low | Backup/restore so'rov fayli audit yozuvidan oldin diskka yoziladi: audit yiqilsa (500 -> rollback) tiklash baribir bajariladi, lekin izi qolmaydi | Audit yozuvini fayl yozishdan oldin bajaring (xato bo'lsa fayl yozilmaydi), yoki fayl yozishni tranzaksiya commit'idan keyin onAfterCommit(c, fn) ichiga o'tkazing. |
| FX-91 | C2 | low | pre-migrate dump'lari retention'siz to'planadi; migratsiya qayta-qayta yiqilsa har startda yangi dump qo'shiladi |  |

---

## 3. Feature'lar (bug emas — klinika so'ragan yangi imkoniyatlar)

Har biri alohida brainstorm → spec → reja. Tartib: qarorlardan keyin.

| ID | Manba | Feature | Oldin shart | Hajm |
|---|---|---|---|---|
| FT-01 | CF-9, 11, 12, 10 | **Davolash rejasi epiki:** odontogramma — asosiy kirish nuqtasi (tish → xizmat → joriy rejaga qo'shish, `POST /treatment-plans/{id}/stages`); bosqich tahriri; «bajarilgan ishni yozish» (2-rejim: darhol completed ad-hoc bosqich); soddalashtirilgan holatlar (Qoralama → Rozi → Davolanmoqda → Tugadi); tish tarixi paneli (holat + rasm `?tooth=` + bosqich + vizit); FDI tekshiruvi | FX-13…16, FX-27 | L |
| FT-02 | CF-14 | Rozilik soddalashtirish: shablon → o'qish → imzo; tur/sarlavha/muddat «Qo'shimcha» ostida; shablon tahriri; chop etish | FX-26 | M |
| FT-03 | CF-3b | Shartnoma + pechat + imzo: `contract` shablon turi, o'zgaruvchilar, canvas imzo, sozlamalarda pechat rasmi, A4 print. FT-02 bilan «Hujjatlar» moduli | FT-02 | L |
| FT-04 | CF-6, 7, 8 💰👤 | Chegirma: `discount.give` (+rol bo'yicha max %), tranzaksiyada `discount_percent/reason/granted_by`, `patients.default_discount_percent`, reja bosqichida `stage.cost`ga snapshot, chegirma auditda, chekda; fiskal items netto | Qarorlar D-1…D-3; FX-21 | M–L |
| FT-05 | CF-2a | Kalendar: bo'sh katak → oldindan to'ldirilgan yozilish; bosiladigan bo'sh slot; soatlar filial ish vaqtidan; touch drag + resize; zoom; planshet layout | — | M–L |
| FT-06 | CF-2b, CF-4 👤 | Kamera komponenti (`getUserMedia` + Electron `setPermissionRequestHandler` faqat `media`): bemor avatari (`face_photo` → `photo_url` yozish yo'li) va kassada to'lov rasmi (`cashier_transaction_photos`, `skipped_reason`) | FX-21; D-4 | M |
| FT-07 | CF-3a | Bot'da bemor o'z ma'lumotlari: «Mening yozilishlarim», «Balans»; keyin reja xulosasi va oxirgi retsept; o'qishlar auditda; throttling | FX-42, FX-41 | M |
| FT-08 | CF-17 | PWA: manifest, statik shell SW (API keshlanmaydi), responsive kalendar/bemorlar/kassa | FT-05 | L |
| FT-09 | CF-15 👤 | Rentgen: desktop watch-folder → `/patient-images`; `.dcm`ni kengaytma bo'yicha qabul qilish | D-6 | M |
| FT-10 | CF-16 👤 | Gemini Flash: faqat API'dan, tenant opt-in, PHI minimallashtirish; birinchi joy — D-7 | D-7 | M |
| FT-11 | CF-19 👤 | Internetsiz: bulutda oflayn banner + o'qish keshi; yoki «ishonchsiz internet = desktop» siyosati | D-5 | S…XL |
| FT-12 | CF-18 | Desktop: Windows jismoniy sinov (`DESKTOP-WINDOWS-BUILD-TEST.md` §4b/§4c), code signing (CLI-376), `UPDATE_URL` (CLI-377), off-host zaxira | — | infra |

## 4. Kerakli qarorlar (👤)

| ID | Savol | Ta'sir qiladi |
|---|---|---|
| D-1 | Shifokor chegirmasini kim qo'llaydi — shifokor rejada/vizitda yoki kassir `discount.give` bilan? | FT-04 |
| D-2 | Doimiy chegirma reja bosqichlariga ham tegadimi (qarz o'zgaradi) yoki faqat POS? | FT-04 |
| D-3 | Chegirma shifokor komissiyasini kamaytiradimi? | FT-04, FX-19 |
| D-4 | Kassa rasmi majburiymi yoki tenant sozlamasi; saqlash muddati? | FT-06 |
| D-5 | Bulutga oflayn rejim kerakmi? | FT-11 |
| D-6 | Klinikadagi rentgen apparati/dasturi? | FT-09 |
| D-7 | AI birinchi qayerda — diktovka / rentgen tavsifi / kunlik xulosa? | FT-10 |
| D-8 | Kassa/xarajat/ombor filialga qat'iy bog'lanadimi (Qaror #29 kengaytmasi)? | To'lqin 4 |
| D-9 | Bosqich qoralama vizitda yopilishi qasddanmi (Qaror #37)? Ko'p vizitli bosqich qanday yopiladi? | FX-14 |
| D-10 | Bosqichli vizitni kassada to'lash: rad etish yoki shu bosqichga allocation? | FX-12 |
| D-11 | Accepted reja ichidagi proposed bosqich bajarilsa — xato yoki avto-accept? | FX-13 |
| D-12 | Ikki klinikada ishlaydigan doktorning bir vaqtdagi bronlari tenantlararo bloklanadimi (global EXCLUDE)? | FX-02 |

### 4.1 Qabul qilingan standartlar (🛠 2026-11-19, foydalanuvchi «savol so'ramay to'xtamasdan ishla» dedi)

Konservativ variant tanlandi; foydalanuvchi keyin o'zgartirishi mumkin.

| ID | 🛠 Qaror | Sabab |
|---|---|---|
| D-1 | Yangi permission `discount.give`. Chegirma (POS'da yoki reja bosqichi narxida) faqat shu ruxsat bilan. Rolga (Doctor ham) rol muharririda yoqiladi; shablonlarda — Tenant Admin, Branch Manager, Receptionist | Bitta mexanizm, rol toggle'i = CF-7 |
| D-2 | Doimiy chegirma (`patients.default_discount_percent`) POS'da va **yangi yaratiladigan** reja bosqichlarida qo'llanadi (cost'ga snapshot). Mavjud bosqichlarga orqaga qarab tegmaydi | Qarz retroaktiv o'zgarmaydi (CLI-479 invarianti) |
| D-3 | Komissiya bazasi o'zgarmaydi = `paidAmount` (netto). Chegirma komissiyani kamaytiradi | Mavjud Qaror #16; jim o'zgartirish yo'q |
| D-4 | Kassa rasmi — tenant sozlamasi, **standart o'chiq**; saqlash 90 kun; kamera ishlamasa to'lov bloklanmaydi (`skipped_reason`) | Shaxsiy ma'lumot, ixtiyoriylik |
| D-5 | Bulutda oflayn rejim YO'Q: ulanish banneri + «ishonchsiz internet — desktop versiya» tavsiyasi | XL va konflikt xavfi |
| D-6 | Rentgen — umumiy watch-folder (JPEG/PNG/DCM eksport papkasi), vendor-maxsus drayver yo'q | Apparat noma'lum |
| D-7 | AI birinchi joyi — vizit yozuvi yordamchisi (erkin matn → tuzilgan qoralama), per-tenant shifrlangan kalit, standart o'chiq, faqat API'dan, audit | Eng kam PHI riski, matn |
| D-8 | Kassa/xarajat operatsiyalari chaqiruvchining tayinlangan filiallari bilan cheklanadi; owner va tenant-wide tayinlov istisno. Bemor/rejalar tenant-level qoladi (Qaror #29) | IR-06 izchilligi |
| D-9 | Bosqich yakunlanishi `sign()` ga ko'chadi; vizitda «Bosqich yakunlandi» belgisi (standart: rost); qoralama bosqichni yopmaydi | Qaror #37 (visit-note'siz completed) saqlanadi |
| D-10 | Bosqichli vizitni vizit yo'li bilan to'lash rad etiladi (409 `visit.linked_to_plan_stage`); kassa «reja bo'yicha to'lash»ga yo'naltiradi | Ikki marta to'lovni yopadi, pul mantig'i o'zgarmaydi |
| D-11 | Accepted bo'lmagan bosqichni completed qilish 400; UI faqat qabul qilingan bosqichlarni taklif qiladi | Jim qarz qo'shilmaydi |
| D-12 | EXCLUDE constraint'lar tenant'ga bog'lanadi (`tenant_id WITH =`) | Tenantlararo bloklash/ma'lumot sizishi yo'q |
| D-13 | Vizit orqali POS to'lovi (rejasiz davolash) vizit doktoriga komissiya manbai bo'ladi (`COALESCE(plan.doctor_id, visit_note.doctor_id)`), baza `paidAmount` | Rejasiz ish uchun doktor haqi yo'qolmasin (LA-29) |

## 5. Hali audit qilinmagan (keyingi round)

- ~~44 ta tekshirilmagan `low`~~ — 2026-11-19 tekshirildi: 43 tasdiqlandi → To'lqin 9 (FX-53…), 1 hal bo'lmadi.
- **Tanqidchi ko'rsatgan 11 bo'shliq** (A2/A3): rol bo'yicha ekran↔endpoint juftlari (bemor kartasi bo'limlari, ombor, moliya, lab, recalls, jadval); filial doirasi boshqa modullarda; Lab Hub serveri (kursor, seq, hub key, RLS); lab-hub-web autentifikatsiyasi va internal route'lar; reminder/recall dublikat skan, obunasi tugagan tenant uchun yuborish; bulut SaaS obuna sinxroni; expenses/1C/analitika pul hisoblari; vizit→ombor 4xx tx holati; navbat TV ekranida PII; desktop rejimidagi biznes oqimlar; ombor web oqimlari. → `/logic-audit` ni shu qamrov bilan qayta ishga tushirish.
- **1 hal bo'lmagan:** payroll maosh/komissiya kiritish faqat `user.manage` bilan ochiq (Accountant/Branch Manager `payroll.manage`ga ega, lekin hisob asosini o'zgartira olmaydi) — mahsulot qarori.

## 6. Ijro rejasi

1. **To'lqin 1** (FX-01…11) — bitta reja, Workflow: lane'lar `tenancy` (FX-01…04), `license` (FX-05…09), `misc` (FX-10, 11). Implementer T3/T4, har lane `verifier` (opus). ≈ 4–5 kun.
2. **To'lqin 2** (FX-12…22) — D-9, D-10, D-11 javobidan keyin. Har pul bandi real-DB failing test bilan. ≈ 1 hafta.
3. **To'lqin 3** (FX-23…30) — UI ko'p; rol bo'yicha brauzer tekshiruvi (`scripts/ui/app-shot.ts`). ≈ 1 hafta.
4. **To'lqin 4** — D-8 dan keyin. **To'lqin 5–8** — parallel lane'lar bilan.
5. Har to'lqin oxirida: merge gate (`ORCHESTRATION-GUIDE.md` §6), shu fayldagi holat ustuni, CLAUDE.md yuqori bloki.
6. Feature'lar (FT-xx) — qarorlardan keyin, har biri brainstorm → spec → reja.
