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
| FX-01 | LA-06 | Recall create'da `patientId`/`treatmentPlanId`/`assignedDoctorId`/`branchId` egalik tekshiruvi (X-1); recall-worker admin join'iga `patients.tenant_id = recalls.tenant_id` | Real-DB test: A kontekstida B bemoriga recall → 404, qator yaratilmaydi; worker begona juftni o'tkazib yuboradi. Mavjud arvoh qatorlarni topuvchi SQL so'rovi hujjatlangan | S | qilindi (batch 1) |
| FX-02 | LA-46 + audit low | Appointment create/update'da patient/doctor/assistant egaligi (X-1); global EXCLUDE'ga `tenant_id WITH =` (yoki ikki-tenant doktor bloki qasddan ekanini Qaror sifatida yozish) 👤 | Real-DB test: begona `patientId` → 404; ikki tenant bir-birining bronini bloklay olmaydi (yoki qaror hujjatlangan) | M | qilindi (batch 1) |
| FX-03 | audit low (tenancy) | Qolgan create endpoint'lardagi begona FK'lar: queue walk-in, cashier, stock BOM/batch/movement, booking confirm (X-1) | Har endpoint uchun begona ID → 404 testi | M | qilindi (batch 1) |
| FX-04 | LA-05 | `rlsMiddleware` qayta kirish guard'i (kontekstda tx bor bo'lsa — `next()`), yoki auth/rls'ni bare-`/api` modullaridan ota darajaga ko'chirish | Test: `/api/patients/:id/images` so'rovida `db.transaction` 1 marta chaqiriladi; clinical/patient-images RLS izolyatsiyasi saqlanadi | S | qilindi (batch 1) |
| FX-05 | LA-19 | Vendor orqali owner parol tiklashda refresh token'larni bekor qilish + `mustChangePassword: false` | Test: tiklashdan keyin eski refresh token 401 | S | qilindi (batch 1) |
| FX-06 | LA-15 (X-4) | Heartbeat javobini `writeLicense`dan oldin imzo+fingerprint bilan tekshirish; yaroqsiz bo'lsa eski `.lic` saqlanadi | Test: imzosiz/boshqa fingerprint javobi `.lic`ni o'zgartirmaydi 🪟 | S | qilindi (batch 1) |
| FX-07 | LA-16 (X-4) | Supervisor «qator yo'q» va «deaktivatsiya» uchun alohida kod qaytaradi; `.lic` faqat **imzolangan** revoke'da o'chiriladi; `expiresAt` regressiyasi rad etiladi | Test: imzosiz `INVALID_KEY` `.lic`ni o'chirmaydi; imzolangan revoke o'chiradi | M | qilindi (batch 1) |
| FX-08 | LA-45 | `/api/activate` va `/api/reset-owner-password` faqat `DENTAL_LOCAL_DESKTOP` bo'lganda mount (bulutda 404) | Bulut rejimida ikkala route 404 | S | qilindi (batch 1) |
| FX-09 | LA-01 | `needsVendor` holatida «Ta'minotchi tayyorladi — kalitni kiriting» tugmasi mavjud aktivatsiya formasini ochadi | Vitest: needsVendor'da tugma → forma; Linux E2E: `.lic` bor, baza bo'sh → UI orqali qayta aktivatsiya → login 🪟 | S | qilindi (batch 1) |
| FX-10 | LA-24 | `telegram:reload` publish'ni `onAfterCommit` ichiga | Test: publish commit'dan keyin chaqiriladi | S | qilindi (batch 2) |
| FX-11 | gigiena | `apps/api/tests/integration/.ui-t2-telegram-secret-test.txt` — git'dan chiqarish, `.gitignore`, ichida haqiqiy kalit yo'qligini tekshirish | `git ls-files` da yo'q; test temp fayl ishlatadi | S | qilindi (batch 2) |

### To'lqin 2 — Pul va davolash yaxlitligi 💰

| ID | Manba | Nima tuzatiladi | Qabul mezoni | Hajm | Holat |
|---|---|---|---|---|---|
| FX-12 | LA-03, LA-39 | `stageId`li vizit kassa «kutilayotgan» ro'yxatiga tushmaydi; `create(visitNoteId)` stageId'li vizitni rad etadi yoki to'lovni shu bosqichga allocation qiladi 👤 (qaysi biri) | Real-DB: bosqichli vizit pending'da yo'q; vizit yo'li bilan to'lash → 409 (yoki allocation, reja qarzi kamayadi) | S | qilindi (batch 1) |
| FX-13 | LA-36 (X-3) | Bosqich `completed` faqat effektiv `acceptance='accepted'` bo'lsa; vizit formasida faqat qabul qilingan bosqichlar | Test: proposed bosqichni completed qilish → 400 (yoki avto-accept — 👤) | S | qilindi (batch 1) |
| FX-14 | LA-33 (X-3) 👤 | Bosqich yakunlash + recall + odontogramma `sign()` ga ko'chadi (qoralama saqlash bosqichni yopmaydi); ko'p vizitli bosqich uchun «yakunlovchi vizit» bayrog'i. Qaror #37 bilan solishtirish | Test: qoralama vizit → bosqich `in_progress`; imzo → `completed` | M | qilindi (batch 1) |
| FX-15 | LA-32 | Completed bosqichning acceptance'ini rad etish/proposed qilish taqiqlanadi; completed bosqichli rejani bekor qilish rad etiladi yoki sabab + ruxsat talab qiladi | Real-DB: bekor qilishdan keyin ham bajarilgan ish qarzi saqlanadi | S | qilindi (batch 1) |
| FX-16 | LA-37 | Rejani `completed` qilishda bajarilmagan accepted bosqich bo'lsa rad etish (yoki «skipped qilib yopish» dialogi) | Test + UI tasdiq dialogi | S | qilindi (batch 1) |
| FX-17 | LA-38 | `listPendingVisits` faqat bugun emas — N kunlik oyna (30) + «kechikkan» belgisi + paginatsiya | Test: kecha imzolangan to'lanmagan vizit ro'yxatda | S | qilindi (batch 1) |
| FX-18 | LA-28 | Payroll `finalizeRun` draft snapshot'idan keyingi to'lov/refund'ni aniqlaydi: rad etadi (`stale_snapshot`) yoki qayta hisoblaydi | Real-DB: draft → to'lov qo'shildi → finalize → yo'qolmaydi. CLI-479 invarianti testi yashil | M | qilindi (batch 1) |
| FX-19 | LA-29 👤 | Vizit orqali POS to'lovi doktorga bog'lanadi: `COALESCE(plan.doctor_id, visit_note.doctor_id)` payroll, hisobot va refund hook'ida. Qaror #16 kengaytmasi | Real-DB: vizit to'lovi komissiyada ko'rinadi; refund to'g'ri clawback | M | qilindi (batch 1) |
| FX-20 | LA-26 | Debt-aging langari — to'lanmagan qoldiq (FIFO bo'yicha birinchi to'liq yopilmagan bosqich / qoldiqli tranzaksiya) | Real-DB: eski to'langan + yangi qarz → yangi bucket | S | qilindi (batch 1) |
| FX-21 | CF-20 | Erkin (items) to'lovda `patientId` majburiy: schema `.refine` + web Charge gate | Test: items rejimida patientsiz → 400 | S | qilindi (batch 1) |
| FX-22 | LA-34 🔒 | Dori↔allergiya: noma'lum allergiyada (xato/403/loading) `CriticalActionDialog`; `PrescriptionsTab`da ham tekshiruv; server tomonda override sababisiz 409 | Test: konfliktli retsept serverda 409; override sababi audit'da | M | qilindi (batch 2) |

### To'lqin 3 — Klinikada ko'ringan buglar

| ID | Manba | Nima tuzatiladi | Qabul mezoni | Hajm | Holat |
|---|---|---|---|---|---|
| FX-23 | CF-1 | Telegram bron so'rovlari: `refetchInterval ~20s`; `TelegramRequests` umumiy widget — Manager/Doctor/Generic dashboard'larda ham (`appointment.create` gate); sidebar badge `pendingCount`; yangi so'rovda xodimga bildirishnoma (`findRecipientsWithPermission`); «Muddati o'tgan» tab | Brauzer: owner, branch manager va registrator yangi so'rovni 30 s ichida ko'radi | M | qilindi (batch 2) |
| FX-24 | CF-1 / LA-40 | Bron muddati tugaganda (24 soat yoki slot o'tganda) bemorga xabar; 409 band slotda tasdiqlashda doktor/vaqt almashtirish | Test: expire → bemorga xabar | S | qilindi (batch 1) |
| FX-25 | CF-1 (P2) | Bot insert'iga `audit.record`; `roleKey` tanlashda `ORDER BY`; bot token unikalligi (bot username bo'yicha) | Testlar | S | qilindi (batch 2) |
| FX-26 | CF-5 | Rozilik: bitta tugma (`hasConsent` gate), bitta termin («Rozilik»); plan modalida inline imzolash (`signForm` + `setConsent`) | Vitest: bog'langandan keyin tugma yo'q; modaldan imzolab bog'lash | S | qilindi (batch 2) |
| FX-27 | LA-35, CF-11 (X-3) | `resultingToothState` create-stage schema'siga; odontogramma va StageRow'da tanlash; bosqich tugaganda tish snapshot'i | E2E: bosqich completed → odontogrammada yangi holat | M | qilindi (batch 1) |
| FX-28 | LA-02 | Telegram anketasi: DTO'ga `questionnaireAnswers/At`; MedicalTab'da «Bemor anketasi» bloki + «tibbiy kartaga ko'chirish»; qayta topshirishda tarix | Brauzer: bot anketasi shifokorga ko'rinadi | M | qilindi (batch 2) |
| FX-29 | LA-04 (X-2) | Tenant-wide tayinlovli xodimga barcha filiallar; yozilish ustasida filial selektori | Rol testi: tenant-wide registrator filial almashtiradi | S | qilindi (batch 2) |
| FX-30 | CF-13 | Bemor moliyasi ekrani: `planDebt` / `nonPlanBalance` / avans alohida kartalar; refund turi va status ajratiladi; to'lovda reja/bosqich nomi; paginatsiya; yagona termin. Pul mantig'i o'zgarmaydi | Brauzer: ekran yig'indisi sarlavhaga mos | M | qisman (batch 2) |

### To'lqin 4 — Filial doirasi 🔒👤 (Qaror #29 bilan kelishilgandan keyin)

> Oldin qaror: kassa/xarajat/ombor operatsiyalari filialga qat'iy bog'lanadimi? Qaror #29 bemor va rejalarni tenant-level qilgan — kassa va hisobotlar alohida masala.

| ID | Manba | Nima tuzatiladi | Hajm | Holat |
|---|---|---|---|---|
| FX-31 | LA-25 | `/api/reports/pnl` ga `reportBranchScope` | S | qilindi (batch 1) |
| FX-32 | LA-27, LA-30 | Kassa endpoint'lari (create, refund, daily-summary, transactions, pending-visits) X-2 bilan | M | qilindi (batch 1) |
| FX-33 | LA-31 | Invite/addAssignment/updateAssignment'da filial eskalatsiyasi taqiqi (`branch.escalation` 403) | S | qilindi (batch 2) |
| FX-34 | LA-08 | Doktor↔filial moslik helper'i: `listDoctors(branchId)`, slot fallback, appointment create/update (`schedule.doctor_not_in_branch`) | M | qilindi (batch 1) |
| FX-35 | LA-11 👤 | BOM avto-chiqimi vizit filialidagi itemdan (`service_materials.branch_id` yoki filialga mos item) | M | qilindi (batch 2) |

### To'lqin 5 — Bron va xabarlar

| ID | Manba | Nima tuzatiladi | Hajm | Holat |
|---|---|---|---|---|
| FX-36 | LA-09 | Faol→faol status o'tishida ish soati/time-off qayta tekshirilmaydi; `{ok:false}` natijalar bot va navbatda ochiq ko'rsatiladi | S | qilindi (batch 1) |
| FX-37 | LA-10 | Telegram «Boshqa vaqt»: eski yozilish yangisidan oldin bekor qilinadi (yoki `excludeId`); recall yangi yozilishga qayta bog'lanadi | S | qilindi (batch 1) |
| FX-38 | LA-07 | No-show sweep kunlik job sifatida ulanadi (Toshkent vaqti, `RUN_REMINDER_WORKER` gating) | S | qilindi (batch 1) |
| FX-39 | LA-23 | Eslatma vaqti `tenant_settings.reminder_lead_hours` dan | S | qilindi (batch 2) |
| FX-40 | LA-20 | Bot `stop()` try/catch; launch yiqilsa bot ro'yxatdan o'chiriladi (qayta yuklanadi) | S | qilindi (batch 2) |
| FX-41 | LA-22 | Telegram 403/blocked → SMS fallback, `telegramChatId` tozalanadi; telefon/token o'zgarsa bog'lanish bekor; xodim uchun «Telegramni uzish» (audit) | M | qilindi (batch 2) |
| FX-42 | LA-21 | Oilaviy telefon: bir chat'ga bir nechta bemor (bog'lanish jadvali) + botda bemor tanlash. **CF-3a (bemor o'z ma'lumotlarini ko'rishi) uchun shart** | M | qilindi (batch 2) |

### To'lqin 6 — Ombor

| ID | Manba | Nima tuzatiladi | Hajm | Holat |
|---|---|---|---|---|
| FX-43 | LA-12 | Inventarizatsiya formasi: «sanalgan miqdor» yorlig'i, joriy qoldiq ko'rinadi, 0 ruxsat | S | qilindi (batch 2) |
| FX-44 | LA-42 | Vizit tahririda qaytarish ledger bo'yicha (movement'lar yig'indisi), joriy BOM emas | S | qilindi (batch 2) |
| FX-45 | LA-41 | Bekor qilingan yozilish / bekor qilingan imzolangan vizit uchun chiqimni qaytarish (idempotent) | M | qilindi (batch 2) |

### To'lqin 7 — Lab va Lab Hub

| ID | Manba | Nima tuzatiladi | Hajm | Holat |
|---|---|---|---|---|
| FX-46 | LA-13 | Klinikada bekor qilish Hub'ga `cancel` op; bekor qilingan buyurtmaga narx tasdig'i/xarajat taqiq | M | qisman (batch 2) |
| FX-47 | LA-14 | Rad etilgan ishni boshqa labga qayta yuborish (`reassign`); rad etilgan ishga narx tasdig'i 409 | M | qisman (batch 2) |
| FX-48 | LA-43 | `failed` outbox op'larini qayta navbatga qo'yish (endpoint + tugma); approve_price doimiy xatoda kutish holati tozalanadi | S | qilindi (batch 2) |
| FX-49 | LA-44 | `upsert_case applied:false` → `synced` emas; `hubStatus` yangilanadi, tahrir bloklanadi | S | qilindi (batch 2) |
| FX-50 | CF-21 | Labdan qaytgan fayllar buyurtma «Fayllar» ro'yxatida; yuklash xatosi yuborishni to'xtatadi yoki tasdiq so'raydi; preview; mobil `capture` | M | qisman (batch 2) |

### To'lqin 8 — Desktop zaxira 🪟

| ID | Manba | Nima tuzatiladi | Hajm | Holat |
|---|---|---|---|---|
| FX-51 | LA-17 | Retention shu chaqiruvda yaratilgan nusxani o'chirmaydi; soat orqaga ketsa ogohlantirish | S | qilindi (batch 1) |
| FX-52 | LA-18 | Tiklash uploads/migratsiya bosqichida yiqilsa pre-restore dump'ga qaytarish; natija aniq («baza qaytarildi / qaytarilmadi») | M | qilindi (batch 1) |

### To'lqin 9 — tasdiqlangan low topilmalar (refuter run `wf_46ae37fd-f08`, 43/44 tasdiqlandi)

Batch 2 lane'lariga taqsimlangan (`docs/superpowers/plans/2026-11-19-fix-batch2.md`). 1 ta hal bo'lmagan: «No-show strike faqat maslahat» — mahsulot qarori, 🛠 o'zgarishsiz qoladi (bayroq ko'rsatiladi, bloklanmaydi).

| ID | Lane | Og'irlik | Topilma | Tuzatish yo'nalishi |
|---|---|---|---|---|
| FX-53 | M | low | Booking-requests ro'yxati filial bo'yicha filtrlanmaydi: bir filial registratori boshqa filial so'rovlarini ko'radi va tasdiqlay oladi | Add an optional branchId query parameter to list and pendingCount, defaulting to activeBranchId, and send it from reception.api.ts. — **qilindi (batch 2)** |
| FX-54 | M | low | Kelajakdagi yozilishni no_show qilish mumkin -> strike darhol yoziladi | no_show o'tishida (service yoki transitions'da) before.startTime kelajakda bo'lsa rad et (masalan 400 `status.no_show_before_start`) yoki strike'ni faqat startTime <= now bo'lganda yoz. — **qilindi (batch 2)** |
| FX-55 | M | low | Shifokor navbatda 'Keyingisini chaqirish' tugmasi boshqa shifokor bemorini ko'rsatadi -> 403 | UI'da queue.manage'siz shifokor uchun nextWaiting'ni ticket.doctorId === user.id bilan filtrla va tugmani faqat shunda ko'rsat. Walk-in ticket uchun ham shifokorga chaqirish yo'lini aniqla (masalan server qoidasini yumshat). — **qilindi (batch 2)** |
| FX-56 | M | low | Slot tugmasi indeksi eskirgan xabarlarda boshqa kunning slotiga mos keladi (bot) | Callback data'ga slot vaqtini yoki sessiya versiyasi/sana tokenini qo'shing (masalan `bk:s:<i>:<hhmm>`) va handler'da s.slots[i].start bilan solishtiring. Muqobil: `op==='t'` ichida s.slots=[] qiling va s.step!=='slot' bo'lsa `s` callback'ini rad eting. — **qilindi (batch 2)** |
| FX-57 | M | low | Ko'chirilgan 'confirmed' yozilish confirmed'ligicha qoladi va bemorga xabar ketmaydi; <24 soat qolsa eslatma ham yo'q | startTime o'zgarganda status 'confirmed' bo'lsa 'scheduled'ga qaytar va/yoki bemorga ko'chirish xabarini yubor. Yangi vaqt 24 soatdan yaqin bo'lsa darhol xabar ket. — **qilindi (batch 2)** |
| FX-58 | M | low | Bot 'Bekor' tugmasi erta check-in qilingan bemorning ochiq navbat ticket'ini yopmaydi | reminder-actions.ts da 'no' amalidan oldin yozilishga bog'langan ochiq queue_ticket bor-yo'qligini tekshirib, bo'lsa 'already' qaytarish, yoki createBotFlows ga queue reverse-sync hook'ini ulash. — **qilindi (batch 2)** |
| — | FX-03b | low | Tasdiqlashda doctorId/branchId/patientId tenantga tegishliligi tekshirilmaydi, faqat FK (platform-global users) | qamrab olingan |
| FX-59 | M | low | Bron so'rovi kartasida vaqt brauzer mintaqasida (uz-UZ, TZ'siz) ko'rsatiladi | Add timeZone: 'Asia/Tashkent' to the options (or use a shared lib/format helper that already does this). — **qilindi (batch 2)** |
| FX-60 | I | low | Bosqichni plan ekranidan (Select) completed qilish ombor BOM chiqimini bajarmaydi — bir xil ma'no uchun ikki yo'l | updateStage'dagi completed hook'lari qatoriga stage.serviceId BOM'i uchun idempotent deductStock chaqiruvini qo'shish (vizit yo'li bilan ikki marta yechilmasligi uchun sourceStageId/visitNote bo'yicha dedup). — **qilindi (batch 2)** |
| FX-61 | F | low | Konsent: terminal planda qayta bog'lash, bemor imzosisiz forma va default 'muddatsiz' | setConsent'da before.status in_progress/completed/cancelled bo'lsa rad et (409), UI tugmasini shu statuslarda yashir; ixtiyoriy: patientSignatureName'ni gate'da talab qil. — **qilindi (batch 2)** |
| FX-62 | F | low | Odontogramma snapshot'i last-write-wins: eski qoralamadan saqlash avto-snapshot'ni (bosqich tugashi) ustiga yozadi | useUpdateStage.onSuccess da tooth-chart (latest/history) so'rovlarini invalidate qiling, shunda draft qayta hydrate bo'ladi. — **qilindi (batch 2)** |
| — | FT-01 | low | Plan bosqichlarini tahrirlab bo'lmaydi (bosqich qo'shish/narx o'zgartirish yo'q), reja totalCost qotib qoladi | qamrab olingan |
| FX-63 | N | low | Vizit to'lovi refund qilingach vizitni qayta undirib bo'lmaydi; qisman undirish ham vizitni 'to'langan' qiladi | Pre-check va pending NOT EXISTS'da faqat refund qilinmagan (yoki to'liq refund bilan qoplanmagan) tranzaksiyalarni hisoblash; qisman savatda qolgan xizmatlarni qarz sifatida saqlash. — **qilindi (batch 2)** |
| FX-64 | N | low | Finalized run'da doktor qatori bo'lmasa refund keyingi davrda komissiya olinmagan daromaddan ayiriladi | recordRefundAdjustment da qator topilmasa ham 0 summali adjustment yozish (yoki netting'dan chiqarish), shunda refund keyingi davr daromadidan ayirilmaydi. — **qilindi (batch 2)** |
| — | FT-04 | low | Fiskal payload izchil emas: amount=paidAmount, items chegirmasiz subtotal, discount maydoni yo'q; reja to'lovida items bo'sh | qamrab olingan |
| FX-65 | L | low | Bekor qilingan reja krediti umumiy balansda boshqa reja qarzini neytrallaydi, lekin kreditni qo'llash yo'li yo'q | Bekor qilingan rejada kredit qolsa, kassada uni boshqa reja bosqichiga o'tkazish yoki refund qilish haqida eslatma ko'rsating. Yoki per-plan qarzni umumiy balansdan alohida ko'rsating. — **qilindi (batch 2)** |
| FX-66 | I | low | BOM/partiya/harakat endpointlari item/xizmat mavjudligi va tenant egaligini tekshirmaydi (500 yoki begona UUID'li yetim yozuv) | createBatch/createMovement/createBom boshida item va service'ni getDb(c) (RLS) orqali SELECT qilib topilmasa 404 qaytar, createBom'da 23505'ni 409 ga o'gir. — **qisman (batch 2)** |
| FX-67 | I | low | Parallel vizit PATCH'larida reconcile qulfsiz 'before' ustida ishlaydi (qo'sh/yo'qolgan chiqim) | `update` boshida `repo.find`ni `SELECT ... FOR UPDATE` bilan qiling (yoki `updatedAt` bo'yicha optimistik versiya qo'shing), POST'ga Idempotency-Key qo'shing. — **qisman (batch 2)** |
| FX-68 | I | low | 'Necha kunga yetadi': 30 kunga bo'lish yangi itemda sarfni kamaytirib ko'rsatadi; eski vizit qaytarishi oynani manfiy qiladi | avgDailyUsage'ga oyna sifatida min(30, itemning yoshi kunlarda, kamida 1) bering; visit_edit_return'ni faqat qaytarilayotgan asl chiqim ham oyna ichida bo'lsa ayiring. — **qilindi (batch 2)** |
| FX-69 | I | low | deductForServices BOM qatorlarini tartibsiz yangilaydi (parallel vizitlarda deadlock -> vizit saqlanmaydi) | BOM'larni itemId bo'yicha saralab (orderBy itemId) yangilash yoki avval `SELECT ... FOR UPDATE ORDER BY id` bilan item qatorlarini qulflash; reconcileForServices'ga ham shuni qo'llash. — **qilindi (batch 2)** |
| FX-70 | M | low | Yozilish uchun shifokorlar ro'yxati muddati o'tgan (validTo < now) tayinlovlarni ham qaytaradi | Ikkala so'rovga ham `or(isNull(userAssignments.validTo), gt(userAssignments.validTo, new Date()))` qo'shish (yaxshisi umumiy helper orqali). — **qilindi (batch 2)** |
| FX-71 | K | low | Ko'p tayinlovli foydalanuvchida rol layout'i/dashboard va standart filial tartibsiz (ORDER BY yo'q) birinchi qatordan olinadi | Ikkala so'rovga deterministik orderBy qo'shing (masalan, tenant-wide avval, so'ng createdAt/id), yoki roleKey'ni ustuvorlik jadvali bo'yicha tanlang. — **qilindi (batch 2)** |
| FX-72 | K | low | Ishlamaydigan 'o'lik' permission'lar: staff.view/invite/edit/delete va user.deactivate hech bir endpoint/ekranda tekshirilmaydi, lekin rol quruvchida tanlanadi | O'lik kodlarni (staff.*, user.deactivate) katalogdan va rol shablonlaridan olib tashlang yoki ularni user.manage/user.view o'rniga haqiqiy guard sifatida ulang. — **qilindi (batch 2)** |
| FX-73 | L | low | ManagerDashboard filialga biriktirilgan Branch Manager uchun tenant-wide hisobotlarni so'raydi va jim 403 oladi (Qarz KPI '—', ogohlantirish yo'q) | Debt/treatment-plans so'rovlarini faqat tenant-wide yoki owner foydalanuvchida yoqish (filial doirasini hisobga olib), aks holda plitkani yashirish yoki 'ruxsat yo'q' holatini ko'rsatish. — **qilindi (batch 2)** |
| FX-74 | L | low | Sidebar'dagi 'Barcha filiallar' bandi endi eng eski filialga o'tkazadi (owner uchun ham), yorliq natijaga mos emas | Sidebar'dan allowAllBranches bandini olib tashlang (yoki 'Standart filial' deb nomlang) va currentBranchName'dagi 'all_branches' shoxini olib tashlang. — **qilindi (batch 2)** |
| — | FX-03/X-1 | low | Other create endpoints also accept cross-tenant FK IDs without an RLS check (queue walk-in patientId/branchId/serviceId, cashier branchId) | qamrab olingan |
| FX-75 | H | low | Bot (Telegram) path: onAfterCommit runs immediately in the fake Context, before the withTenant tx commits (the P4 invariant breaks in the bot path) | In `createBotContext`, add `afterCommit: []` to the store. Have the withTenant wrapper in the bot path call `runAfterCommit` on that list after commit, and drop it on rollback. — **qilindi (batch 2)** |
| FX-76 | F | low | Deleting a patient image or lab-order file removes it from disk before commit; if the tx rolls back, the DB row points to a missing file | deleteObject chaqiruvini onAfterCommit(c, ...) ichiga ko'chirish, har ikkala servisda. — **qilindi (batch 2)** |
| FX-77 | N | low | The Soliq fiscal provider sends fetch inside the cashier tx (no timeout, while the stage row is locked FOR UPDATE); if the tx rolls back, the receipt is already registered with the tax authority | Move fiscal.createReceipt out of the tx into onAfterCommit (or an outbox/BullMQ job) and add AbortSignal.timeout to the Soliq fetch. — **qilindi (batch 2)** |
| FX-78 | J | low | Klinika Hub'dagi 'remake' oqimini umuman ishga tushira olmaydi (uxlab yotgan feature); tasdiqlangan narx qayta ishlash uchun o'zgartirilmaydi | Klinikaga 'remake' outbox op + client metodi (POST /cases/{ref}/remake) va mavjud buyurtma uchun remake endpointi/tugmasini qo'shing, yoki Hub remake endpointi va sync.ts tarmog'ini o'lik kod sifatida olib tashlang. — **qilindi (batch 2)** |
| FX-79 | J | low | Outbox FIFO: diskda yo'q fayl (ENOENT) cheksiz qayta uriniladi va shu buyurtmaning approve_price/message/delivered op'larini bloklaydi | `file` op'da ENOENT (yo'q fayl) ni non-retryable LabHubError ('file.missing') qilib, op'ni 'failed' deb belgilash va FIFO to'sig'idan chiqarish (yoki yo'q faylni `return undefined` bilan o'tkazib yuborish); qo'shimcha: umumiy attempts cap qo'yish. — **qilindi (batch 2)** |
| FX-80 | J | low | Hub tasdig'idan yozilgan 'Laboratoriya' xarajati erkin tahrir/o'chirishga ochiq — approved_price bilan uzilib qoladi va qayta yozilmaydi | expenses update/remove'da labOrderId != null bo'lsa 409 qaytar (yoki faqat note'ga ruxsat ber). — **qilindi (batch 2)** |
| FX-81 | H | low | Arxivlangan bemor Telegram/recall oqimlarida faol hisoblanadi | linkPatientByContact, resolveLinked va recall-worker so'rovlariga `isNull(patients.archivedAt)` qo'shish (yoki bemorni arxivlashda pending recall'larni bekor qilish). — **qilindi (batch 2)** |
| FX-82 | H | low | Reminder/recall tashqi HTTP chaqiruvi tx ichida, timeout'siz; Telegram 'Kelaman' tugmasi muvaffaqiyatsizlikni 'allaqachon' deb ko'rsatadi | Add AbortSignal.timeout to the notification channel fetches (or send after commit), and return a distinct 'failed' outcome in reminder-actions instead of 'already'. — **qilindi (batch 2)** |
| FX-83 | M | low | Bemor Telegram orqali bekor qilganda xodimga bildirishnoma yo'q; muvaffaqiyatsiz bo'lgan eslatma job'i keyingi reschedule'da qayta qo'yilmaydi | Bekor qilishdan keyin onAfterCommit orqali findRecipientsWithPermission bilan xodimga bildirishnoma yubor; enqueueReminder da mavjud job failed holatda bo'lsa existing.remove() qilib qayta add() qil. — **qilindi (batch 2)** |
| FX-84 | H | low | Bir xil bot tokeni ikki tenantda ishlatilishi tekshirilmaydi; kontakt guruh chat'ida ham bemorni bog'laydi | linkPatientByContact chaqirilishidan oldin `ctx.chat.type === 'private'` ni majburlang. Token takrorini esa Telegraf getMe().id ni tenant bo'yicha saqlab, ikkinchi tenantda rad etish orqali tekshiring. — **qilindi (batch 2)** |
| FX-85 | C2 | low | Tiklash tokeni tenant borligi tekshirilishidan oldin sarflanadi: reset.no_tenant (va tx xatosi) tokenni behuda yoqib yuboradi | Tenant mavjudligini verifyReset() dan oldin tekshiring. Tenant topilmasa tokenni sarflamasdan reset.no_tenant qaytaring. Yaxshiroq variant: verify va consume'ni ikki bosqichga ajratish, consume'ni lokal tranzaksiya muvaffaqiyatidan keyin chaqirish. — **qisman (batch 2)** |
| FX-86 | C2 | low | Aktivatsiyada tenant yaratilib .lic yozilmay qolsa, qayta urinish 'avvalgi parolingiz o'zgarmadi' deb noto'g'ri maslahat beradi | Skip holatini "tenant yaratilgan, .lic yozilmagan" (haqiqiy mavjud klinika) dan ajrat. Buning uchun .lic hali yo'q bo'lsa login_hint (vendor parolini oling) ni ko'rsat, yoki matnni neytral qil ("parol o'zgarmagan bo'lsa vendor bergan vaqtinchalik parolni ishla — **qilindi (batch 2)** |
| FX-87 | C2 | low | Heartbeat monotonik langarni Date.now() bilan ko'taradi va hech qachon pasaytirmaydi: soat xato oldinga surilib heartbeat o'tsa, litsenziya o'sha sanagacha bloklanadi (izoh aksini da'vo qiladi) | Heartbeat muvaffaqiyatli bo'lsa langarni Date.now() bilan emas, Supervisor'ning imzolangan issuedAt qiymati bilan o'rnating (max(anchor, issuedAt)) va issuedAt'dan sezilarli ilgari ketgan langarni pasaytirishga ruxsat bering. Bundan tashqari, izohni to'g'rilan — **qilindi (batch 2)** |
| FX-88 | C2 | low | Supervisor so'rovlarida timeout yo'q: «Qayta tekshirish» va aktivatsiya osilib qolishi mumkin | post()dagi fetch'ga `signal: AbortSignal.timeout(10_000)` qo'shish va timeout xatosini oddiy xabarga aylantirish. — **qilindi (batch 2)** |
| FX-89 | C2 | low | Tiklashdan keyin Valkey'dagi eslatma job'lari tiklangan bazaga mos kelmaydi | Tiklashdan keyin API ishga tushganda kelajakdagi faol yozilishlar uchun eslatma job'larini bazadan qayta quring (reconcile), yoki tiklashda eslatma navbatini tozalab shu reconcile'ni chaqiring. — **qilindi (batch 2)** |
| FX-90 | C2 | low | Backup/restore so'rov fayli audit yozuvidan oldin diskka yoziladi: audit yiqilsa (500 -> rollback) tiklash baribir bajariladi, lekin izi qolmaydi | Audit yozuvini fayl yozishdan oldin bajaring (xato bo'lsa fayl yozilmaydi), yoki fayl yozishni tranzaksiya commit'idan keyin onAfterCommit(c, fn) ichiga o'tkazing. — **qilindi (batch 2)** |
| FX-91 | C2 | low | pre-migrate dump'lari retention'siz to'planadi; migratsiya qayta-qayta yiqilsa har startda yangi dump qo'shiladi | — **qilindi (batch 2)** |

### To'lqin 10 — 2-round audit topilmalari (LB-01…30 `wf_52f45158-dac` + LC-00…49 refuter `wf_3a51a44d-183`, 49/50 tasdiqlandi)

LB — `LOGIC-AUDIT-2026-11-19.md` «2-round» bo'limi; LC — refuter hukmlari (`LC-NN` = 2-round tekshirilmagan ro'yxatidagi indeks). Batch 2 lane'lariga taqsimlangan.

| ID | Lane | Og'irlik | Topilma | Tuzatish yo'nalishi |
|---|---|---|---|---|
| FX-92 | M2 | high | LB-01 Navbat sahifalarida bemor ismi faqat eng yangi 100 bemordan hal qilinadi: check-in ro'yxati va navbat kartalarida '—' | Navbat ticketlari va check-in-candidates DTO'siga backend'da `patientName` qo'shish (patients bilan join), yoki web'da reception.api.ts dagi usePatientNames(ids) (per-id getPatient) ni QueueBoard va CheckInDialog'ga ko'chirish; usePatientsAll'ni nom lookup uch — **qilindi (batch 2)** |
| FX-93 | J1 | high | LB-02 Hub bazasi zaxiradan tiklangandan keyin klinika sinxroni jimgina buziladi: seq qayta ishlatiladi va dedupe uni tashlab yuboradi, yangi klasterda esa tx_id kursordan kichik bo'lib qoladi | Hub'ga instansiya yoki davr identifikatorini (masalan, `hub_epoch`ni Hub DB'da `system_identifier` yoki restore'dan keyin yangilanadigan UUID sifatida) qo'shish kerak. Uni `/changes` javobida qaytarish, klinika esa epoch o'zgarganini ko'rganda kursorni '0.0'ga — **qilindi (batch 2)** |
| FX-94 | J2 | high | LB-03 Lab foydalanuvchilari uchun parolni tiklash yo'li umuman yo'q: lead ham, texnik ham. Supervisor javobi yo'qolsa, lead vaqtinchalik parolini hech qachon olmaydi | Add `POST /internal/labs/{id}/users/{userId}/reset-password` with a Supervisor proxy and a button that resets the lead (new temporary password plus `mustChangePassword = true`), and in the Lab Hub add a lead-only `POST /users/{id}/reset-password` for technicia — **qilindi (batch 2)** |
| FX-95 | C2 | high | LB-04 Klient PC saqlangan (TOFU) server manziliga health-check'siz ulanadi: server IP o'zgarsa yoki server kechroq yonsa mahsulot ichida qayta ulanish yo'li yo'q | In the trustedUrl branch, run the same `/api/health` check from settings-ipc.ts `defaultCheckConnection` before opening the window. If it fails, switch to the 'Server topilmadi' state (the CLI-404 prompt plus the reconnect/discovery loop). Also add a `did-fail — **qilindi (batch 2)** |
| FX-96 | C2 | high | LB-05 Desktop: Valkey doimiylikka ega emas — har qayta ishga tushganda kutilayotgan barcha 24 soatlik eslatmalar yo'qoladi, DB'dan qayta tiklash yo'q | Desktop valkey konfida `appendonly yes` (yoki `save 60 1`, `dir` dataDir) yoqish va/yoki API boot'da kelajakdagi scheduled/confirmed yozilishlar uchun enqueueReminder'ni idempotent (jobId dedupe) qayta qurish. — **qilindi (batch 2)** |
| FX-97 | J1 | high | LB-06 Qayta ulanishda (hubClinicId o'zgarganda) kursor va lab_hub_applied_events qayta o'rnatilmaydi — yangi Hub hodisalari jimgina yo'qoladi | Have the Hub return a stable instance or epoch id (e.g. a random value written once to a hub_meta table, or the cluster's system_identifier) in both /connect and /changes; the clinic stores it and, whenever it or hubClinicId changes, resets the cursor to '0.0' — **qilindi (batch 2)** |
| FX-98 | J1 | high | LB-07 Kursor/dedup kaliti Postgres klaster xid'i va sequence qiymatiga bog'langan — Hub pg_dump'dan tiklansa barcha klinikalar sinxroni jimgina to'xtaydi yoki hodisalar tashlanadi | Kursor va dedup kalitiga Hub epoch'ini kiritish: masalan Hub jadvalida yoki `pg_control_system().system_identifier` + restore'da yangilanadigan instance UUID. Epoch mos kelmasa Hub `cursor.reset` qaytaradi. Klinika esa kursorni `0.0` ga tushiradi va dedup'ni ` — **qilindi (batch 2)** |
| FX-99 | P | medium | LB-08 Starter tarif desktop'da shifokor yarata olmaydi: 'staff' moduli yo'q -> /api/users/invite 403 -> yozilish (booking) oqimi ishlamaydi | Eng kichik yo'l: 'staff' (yoki kamida users invite/grantable-roles/assignments) ni starter MODULE_MAP'ga (ikkala nusxada va guard-testda) qo'shish, yoki starter'da owner'ni shifokor sifatida ro'yxatga qo'shish (provisioning'da owner'ga practitioner assignment — **qilindi (batch 2)** |
| FX-100 | J2 | medium | LB-09 Vaqtinchalik parol noto'g'ri kiritilsa, ChangePasswordPage xatoni ko'rsatmaydi: global 401 handler sessiyani o'chiradi va foydalanuvchini /login ga otadi | — **qilindi (batch 2)** |
| FX-101 | P | medium | LB-10 SaaS 'Qayta tekshirish' tugmasi access token muddati o'tgach doim 'hali tugagan' deydi: vendor renew qilgan bo'lsa ham klinika ochilmaydi | `LicenseBlockedScreen` recheck'dan oldin refresh token bilan access'ni yangilasin (yoki 404 olinsa bir marta refresh qilib qayta urinsin). Muqobil: recheck endpoint'i muddati o'tgan lekin imzosi yaroqli JWT'dan tenantni olsin (faqat `atid`, `ignoreExpiration`) — **qilindi (batch 2)** |
| FX-102 | P | medium | LB-11 Vendor SaaS klinikani to'xtata olmaydi: deactivate faqat litsenziya qatorini qidiradi, renew o'tgan sanani rad etadi, admin UI'da SaaS uchun tugma yo'q | SaaS klinika uchun klinika darajasidagi suspend/deactivate qo'shing (masalan `clinics.suspended_at`, uni `toStatus` va apps/api sinxronida o'qib `computeSubscriptionState` ichida imtiyozsiz `expired` qilish), yoki SaaS renew'da o'tgan sanaga ruxsat berib grace — **qilindi (batch 2)** |
| FX-103 | P | medium | LB-12 Blok ekranida chiqish va workspace almashtirish yo'q: ko'p klinikali xodim faol bo'lmagan klinikada qamalib qoladi | LicenseBlockedScreen action'iga ikkita tugma qo'shish: "Chiqish" (`useAuthStore.clear()` + `/login`) va "Boshqa klinikaga o'tish" (`/select-workspace`). Ikkalasi ham `/api/auth` orqali ochiq, qo'shimcha backend o'zgarishi kerak emas. — **qilindi (batch 2)** |
| FX-104 | C2 | medium | LB-13 Server discovery javobida birinchi tashqi IPv4 interfeysini yuboradi, so'rov kelgan interfeysni emas: virtual/VPN adapterli serverda klient noto'g'ri manzilni saqlaydi | Klientda JSON ichidagi `ip` o'rniga `rinfo.address` dan foydalaning (yoki server tomonda `rinfo.address` bilan bir subnetdagi lokal interfeysni tanlang). Qo'shimcha: virtual va link-local (169.254/16) adapterlarni filtrlang, hamda saqlangan `serverUrl` ga ulan — **qilindi (batch 2)** |
| FX-105 | P | medium | LB-14 Obunasi/litsenziyasi tugagan tenant uchun worker (eslatma, recall) va Telegram bot to'liq ishlashda davom etadi — blok faqat HTTP'da | Worker/bot kirish nuqtalarida `getTenantSubscriptionState` (SaaS) / `getLicenseState` (desktop) tekshiruvini qo'shing: `processReminderJob`, recall worker va bot flows (`run`/`withTenant` o'rami) `expired` holatda ishni o'tkazib yuborsin. Bot uchun `bootAll`/` — **qilindi (batch 2)** |
| FX-106 | N | medium | LB-15 Xarajatlar modulida filial doirasi umuman yo'q: filial mudiri boshqa filial va klinika miqyosidagi xarajatlarni ko'radi, yaratadi, tahrirlaydi va o'chiradi | Expenses routes'ga reportBranchScope-ga o'xshash filial-doirasi middleware qo'shing (expense.view/manage beruvchi tayinlovlardan), list/summary'da scope filialiga cheklang, create/update/remove'da before.branchId va input.branchId ni scope bilan solishtiring ( — **qilindi (batch 2)** |
| FX-107 | N | medium | LB-16 Xizmat foydasi (procedureMix) va revenue.byService faqat erkin POS item'laridan: davolash rejasi orqali to'langan barcha xizmatlar «Qaysi xizmat ko'p foyda beradi?» javobidan tushib qoladi | Reja to'lovlarini (treatment_stage_payments -> treatment_stages.service_id) netServiceAggregates ga UNION qilib, tx net-faktori bilan proporsional taqsimlash. Imkon bo'lmasa, hech bo'lmasa howText.services va byService izohida «faqat erkin POS xizmatlari, reja — **qilindi (batch 2)** |
| FX-108 | N | medium | LB-17 Refund dialogi va tranzaksiya jadvali hisob-faktura summasini (totalAmount) ko'rsatadi, server esa faqat qolgan paidAmount'ni qaytaradi: qisman to'langan sotuvda kassir ko'rsatilgandan kam yozilgan pulni qaytarib beradi | Refund dialogida va jadvalda `paidAmount - alreadyRefunded`ni (server `remaining` ni DTO'da qaytarsin) ko'rsat; `max`ni shu qoldiqqa tenglashtir; refund natijasidagi haqiqiy summani toast/dialogda ko'rsat va `refund.over_refund` xatosi uchun alohida matn qo'sh — **qilindi (batch 2)** |
| FX-109 | J1 | medium | LB-18 Lab navbati/diqqat widget'lari faqat eng yangi 20 ta buyurtma ustida hisoblanadi: eski faol va muddati o'tgan buyurtmalar Texnik, Shifokor va Registrator dashboard'idan yo'qoladi | Dashboard so'rovlarini serverda filtrlangan qilish: status bo'yicha faol buyurtmalar uchun maxsus endpoint (masalan `status != delivered/cancelled`, doktor uchun `doctorId`) yoki mavjud `/lab-orders/overdue`ni overdue hisobi uchun ishlatish; muqobil: to'liq sa — **qilindi (batch 2)** |
| FX-110 | L | medium | LB-19 'Yozish' tugmalari (Bemorlar ro'yxati, Recall paneli) patientId'ni URL'da uzatadi, lekin yozilish ekrani uni o'qimaydi: bemor oldindan tanlanmaydi | NewAppointmentScreen'da `useSearchParams().get('patientId')` o'qib wizardga `initialPatientId` prop sifatida ber (useForm initialValues va bemor Select'ning option'lari shu bemorni o'z ichiga olsin). RecallDashboard 'Rejalashtirish' havolasini `/appointments/n — **qilindi (batch 2)** |
| FX-111 | F2 | medium | LB-20 patient_image.upload (Nurse'da ham bor) rasmni butunlay o'chirishga ruxsat beradi, imzolangan vizit yozuviga biriktirilgan rentgenni ham | patient-images.service.ts remove() va updateMetadata() ichida before.visitNoteId bog'langan imzolangan (signedAt != null) vizit yozuvi bo'lsa 409 bilan rad etish. Qo'shimcha: DELETE uchun alohida permission (masalan patient_image.manage, Nurse'ga berilmaydi) k — **qilindi (batch 2)** |
| FX-112 | J1 | medium | LB-21 Lab buyurtma 'shifokori' doim ekranni ochgan foydalanuvchi: Technician (lab_order.manage) yaratgan buyurtma Hub'ga texnik nomi bilan ketadi va haqiqiy shifokorga ko'rinmaydi | Add a practitioner selector (users with `roles.is_practitioner`, defaulting to the current user only if they are a practitioner) to LabOrderNewPage. Make the API reject a `doctorId` that is not a practitioner. Alternatively, add a separate `orderedBy` field an — **qilindi (batch 2)** |
| FX-113 | M1 | medium | LB-22 A Branch Manager assigned to one branch can edit another branch's settings and its doctors' schedules and time off, which breaks booking in that branch | Extend the report-scope.ts pattern to branches.update and schedule.replaceWorkingHours/createTimeOff/deleteTimeOff. The target branchId must be in the caller's user_assignments branch set. A time-off with branchId null is allowed only for owner or tenant-wide — **qilindi (batch 2)** |
| FX-114 | N | medium | LB-23 Expenses: decision D-8 restricts expenses to the caller's branches, but there is no FX item. The screen loads the whole clinic's expenses by default, and a branch user can edit or delete another branch's expenses | Xarajat modulida pnl/kassa bilan bir xil filial-doirasi helper'ini (`reportBranchScope` / `decideBranchScope`) qo'llash: ro'yxat va summary'da ruxsat etilgan filiallar bilan majburiy filtr, `getById`/`update`/`remove` da `before.branchId` ni tekshirish, `creat — **qilindi (batch 2)** |
| FX-115 | I1 | medium | LB-24 Stock: a doctor or Branch Manager assigned to one branch can adjust, set to zero or move another branch's stock items | D-8 ni omborga kengaytirib, createMovement/updateItem/createBatch/createBom/getItem'da item.branchId chaqiruvchining tayinlangan filiallari (yoki owner/tenant-wide tayinlov) bilan solishtirilsin (reports/report-scope.ts'dagi IR-06 yordamchisini qayta ishlatib) — **qilindi (batch 2)** |
| FX-116 | N | medium | LB-25 Payroll is clinic-wide, but the Branch Manager template has payroll.manage: a branch-assigned manager sees every branch's salaries and can create, finalize and delete the clinic-wide run | Remove payroll.view and payroll.manage from the Branch Manager template (as with the other tenant-wide permissions), or add a tenant-wide-assignment check to the payroll routes. This needs a product decision. — **qilindi (batch 2)** |
| FX-117 | F1 | medium | LB-26 Vizitning yozilishga avto-bog'lanishi faqat «bugungi birinchi bekor qilinmagan yozilish» bo'yicha, tanlash UI'si yo'q: o'tgan kun bandi hech qachon yopilmaydi, boshqa shifokor yozilishi bog'lanadi | Avto-bog'lashni `a.doctorId === user.id` bilan cheklab, vizitga yaqin/mos yozilishni tanlash (yoki «Mendan kutilmoqda» bandidan `?appointmentId=` uzatib, formada yozilish tanlash maydonini qo'shish); backend'da create/update'da appointment doktori == yozuvchi — **qilindi (batch 2)** |
| FX-118 | F1 | medium | LB-27 «Imzolanmagan vizit yozuvi» hisoblagichi qoralamani bajarilgan deb hisoblaydi (signedAt tekshirilmaydi) | Dashboard `noteWhere`ni qayta yozing: yozilishga bog'langan visit_note yo'q YOKI mavjud bo'lsa ham `signed_at IS NULL` (masalan `NOT EXISTS (... WHERE appointment_id = appointments.id AND signed_at IS NOT NULL)`). Eskirgan izohni yangilang. — **qilindi (batch 2)** |
| FX-119 | J2 | low | LB-28 lab_users.phone butun Hub bo'yicha unique, hisobni o'chirib ham, telefonini o'zgartirib ham bo'lmaydi: labdan ketgan texnik boshqa labga qo'shila olmaydi va o'z labining lead'i bo'la olmaydi | Telefon bandligini faqat faol qatorlar uchun majbur qiling (partial unique `WHERE is_active`) va nofaol qatorning telefonini ozod qiling yoki qayta aktivatsiyada tekshiring; muqobil sifatida lead/vendor uchun «xodimni boshqa labga ko'chirish» yoki telefonni o' — **qilindi (batch 2)** |
| FX-120 | H2 | low | LB-29 Recall worker: `contacted`ga UPDATE shartsiz va qator qulflanmagan — tashqi send davomida (timeout'siz) parallel o'zgarish ustidan yoziladi | Yakuniy UPDATE'ga status='pending' shartini qo'shing (va/yoki o'qishda .for('update')); send'ni tx tashqarisiga chiqarish ma'qul. — **qilindi (batch 2)** |
| FX-121 | J1 | low | LB-30 Registrator 'Bugun' ekranidagi 'Lab muddati o'tgan' diqqat bandi Receptionist roli uchun hech qachon chiqmaydi va havolasi taqiqlangan sahifaga olib boradi | Registrator uchun lab muddati diqqatini `lab_order.view` talab qilmaydigan tor endpoint (masalan `appointment.view`/`recall.view` bilan `GET /dashboard/reception-attention` ichida overdueLabs soni) orqali oling yoki Receptionist shabloniga `lab_order.view` qo' — **qilindi (batch 2)** |
| FX-122 | F2 | medium | LC-00 Odontogramma «Sut tishlar» switch'i draft'ni tozalaydi, saqlash boshqa to'plam holatlarini joriy snapshot'dan o'chiradi | Switch'da draft'ni `[]` qilmang. Barcha tishlarni saqlab, faqat ko'rinish to'plamini almashtiring (yoki saqlashda draft'ni oxirgi snapshot holatlari bilan birlashtiring), isPrimaryDentition ni ko'rinish bayrog'i sifatida alohida ushlang. — **qilindi (batch 2)** |
| FX-123 | F1 | medium | LC-01 Retsept vizit qoralamasi saqlanganda darhol beriladi va Telegram ketadi; UI'da tuzatib/o'chirib bo'lmaydi | Retseptni `persist()` da emas, faqat `onSign` da (imzolangandan keyin) yarating va Telegram yuboring, yoki qoralama retseptlarni UI'da tahrir/o'chirish imkoniyati bilan saqlang va xabarni faqat vizit imzolanganda yuboring. — **qilindi (batch 2)** |
| FX-124 | M2 | low | LC-02 Check-in nomzodlari terminal (missed/done) ticket'i bor yozilishni chiqarib tashlaydi | checkInCandidates'da leftJoin shartiga `queueTickets.status in ('waiting','in_progress')` qo'shing (join ON ichida), shunda faqat ochiq ticket'li yozilishlar chiqariladi. — **qilindi (batch 2)** |
| FX-125 | M2 | medium | LC-03 TV'dagi 'Kabinet 1/2' in_progress ro'yxatdagi o'rin; raqamlar sakraydi, 3-bemor ko'rinmaydi | TV'da 'Kabinet N' yorlig'ini olib tashlab, barcha in_progress ticketlarni (doctor nomi/doctorId bo'yicha barqaror yorliq yoki shunchaki 'Chaqirilgan' ro'yxati) cheklovsiz ko'rsatish; yoki ticketga doctorId/xona belgilab, slotni shu bo'yicha barqaror bog'lash. — **qilindi (batch 2)** |
| FX-126 | M1 | low | LC-04 Doktor jadval muharriri: jadvali yo'q doktor 'dam olish kuni' ko'rinadi, lekin filial ish soatida band qilinadi | Muharrirda jadval umuman yo'q holatini alohida ko'rsatish («filial ish soati amal qiladi») va bo'sh saqlashni «doktor bu filialda ishlamaydi» belgisi bilan ifodalash (masalan, `doctor_schedules`da is_active=false sentinel qator yoki aniq `scheduleConfigured` b — **qilindi (batch 2)** |
| FX-127 | P | medium | LC-05 Web litsenziya modullaridan bexabar: MODULE_DISABLED 403 "rolingizga yopiq" bo'lib chiqadi, tarifda yo'q modul menyuda ko'rinadi | licenseStatusResponseSchema'ga `modules`ni qo'shib web store'ga saqlash va nav-config/Sidebar'ni modul bo'yicha filtrlash; handleLicenseBlock'ga MODULE_DISABLED'ni qo'shib "tarifingizda yo'q" ekranini ko'rsatish; isForbiddenError'da error.code === 'MODULE_DISA — **qilindi (batch 2)** |
| FX-128 | P | low | LC-06 P18 to'liq blok faqat HTTP'ni to'sadi; worker/bot/lab-hub sync litsenziya tugagach ham ishlaydi | Desktopda worker/bot/lab-hub tick va bot yozish yo'llarida (`reminder-actions.ts`, `booking.ts`) `getLicenseState()==='expired'` bo'lsa o'tkazib yuborish; yoki litsenziya tugaganda `process-manager`da `RUN_REMINDER_WORKER=false` qilish. — **qilindi (batch 2)** |
| FX-129 | I2 | low | LC-07 Web item formasi category/price/minThreshold'ni tahrirlay olmaydi (item tahrirlash UI yo'q) | Stock jadvaliga qator "Tahrirlash" amalini va `useUpdateItem` (updateStockItem) hook'ini qo'shib, ItemFormModal'ni edit rejimida category/price/minThreshold bilan qayta ishlatish. — **qilindi (batch 2)** |
| FX-130 | K | low | LC-08 O'lik permission'lar (cashier.void, salary.view, notification.view/manage); maosh user.view bilan ochiq | Guard the profile salary fields with salary.view (or mask them in the mapper without it). Remove the unused codes (cashier.void, notification.*) from the catalog and templates, or wire them to real guards. — **qilindi (batch 2)** |
| FX-131 | K | low | LC-09 Ekran route perm'i bilan endpoint perm'i mos emas (expenses/rx) | `/expenses` kategoriya ro'yxatini `expense.view` bilan o'qiladigan qilish (yoki tor endpoint qo'shish), `/rx` route perm'ini `prescription.view` ga tenglashtirish. — **qilindi (batch 2)** |
| FX-132 | K | low | LC-10 Nurse dashboard: bemor ustuni '—', Yangi yozilish tugmasi create'siz | Tugmani `hasPermission('appointment.create')` bilan cheklang. Bemor nomini `usePatientNames` orqali (patient.view bor) qatorga ulang. — **qilindi (batch 2)** |
| FX-133 | M2 | low | LC-11 Queue and appointment operations have no branch scope: receptionist of branch A can view and manage branch B's queue and calendar | Add a shared assertBranchAccess(c, branchId) helper that checks the active branch or the user's assignments for the tenant. Call it in the queue routes and services, and in the appointments list and mutation paths. Owner stays exempt. — **qilindi (batch 2)** |
| FX-134 | K | low | LC-12 Owner branch list in /auth/workspace-branches includes another tenant's branch via branches_self_view | Add eq(branches.tenantId, tenantId) to the owner query in workspaceBranches (auth.service.ts:464-468). — **qilindi (batch 2)** |
| FX-135 | K | low | LC-13 updateAssignment does not validate branchId; switchWorkspace writes the assignment's branchId to the JWT unchecked | In updateAssignment, validate input.branchId with an RLS-bound lookup plus isNull(deletedAt). In switchWorkspace, run the :767-773 branch check on resolvedBranchId, including when it comes from assignedBranchId. — **qilindi (batch 2)** |
| FX-136 | H2 | low | LC-14 Recall PATCH: scheduledAppointmentId/branchId/assignedDoctorId unchecked | In recalls.service.update, validate scheduledAppointmentId (same patient, same tenant, via RLS lookup) and check branchId/assignedDoctorId membership in the tenant, mirroring FX-01's create-path checks. — **qilindi (batch 2)** |
| FX-137 | N | low | LC-15 Cross-tenant/unchecked FK IDs outside FX-03 (expenses categoryId/branchId, stock, schedule, service_prices) | Expenses/stock/schedule/services service'larida categoryId/branchId/doctorId ni RLS-bound SELECT bilan tekshirish (FX-03 helper'i kabi), service_prices WITH CHECK'ga branches.tenant_id sharti qo'shish. — **qilindi (batch 2)** |
| FX-138 | J1 | low | LC-16 Desktop: eski PC litsenziya kaliti bilan Hub kalitini qayta olib, yangi o'rnatmani uzadi | Hub connect isbotiga o'rnatma fingerprint'ini qo'shing: Supervisor verify uni amaldagi bog'langan fingerprint bilan solishtirsin (prepare-reinstall'dan keyin yangisiga o'tsin), eski o'rnatmaning connect'i esa rad etilsin. — **qilindi (batch 2)** |
| FX-139 | J1 | low | LC-17 applyEvent buyurtmani FOR UPDATE'siz o'qiydi (cancelled → ready/in_progress poyga) | applyEvent SELECT'iga .for('update') qo'shish (yoki UPDATE'ga status shartini qo'shish). — **qilindi (batch 2)** |
| FX-140 | J2 | low | LC-18 Logout React Query keshini tozalamaydi (lab-hub-web) | Logout'da (auth store yoki alohida helper) `queryClient.clear()` chaqir; 401 yo'lida ham shu ishlasin. — **qilindi (batch 2)** |
| FX-141 | J2 | low | LC-19 Parol almashtirish JWT'larni bekor qilmaydi; change-password'da rate-limit yo'q | lab_users'ga password_changed_at (yoki token_version) qo'shib, middleware'da claims.iat bilan solishtiring; change-password'ga loginLimiter'ga o'xshash limiter qo'ying. — **qilindi (batch 2)** |
| FX-142 | H2 | low | LC-20 Eslatma worker'i o'tib ketgan/yakunlangan yozilish uchun ham yuboradi | processReminderJob'da `appt.startTime <= new Date()` bo'lsa yoki status 'completed'/'in_progress'/'arrived' bo'lsa qaytib ketish (shouldSkipReminder'ni shu bilan kengaytirish). — **qilindi (batch 2)** |
| FX-143 | H1 | low | LC-21 Bot-manager: parallel reload/bootAll ikkita Telegraf poller yaratadi | Per-tenant promise-zanjir (mutex) bilan reload/launch'ni ketma-ketlashtiring va `launch` boshida mavjud botni `stop` qiling (yoki `bots.has` tekshiring). — **qilindi (batch 2)** |
| FX-144 | P | low | LC-22 Obuna holati ikki manba: tenants.subscription_status hech qachon yangilanmaydi | Supervisor sinxronida (supervisor-saas.ts) tenants.subscription_status ni expiresAt/grace/expired bo'yicha yangilash yoki readiness va Sozlamalar holatini tenant_settings.subscriptionExpiresAt dan hisoblash. — **qilindi (batch 2)** |
| FX-145 | C2 | low | LC-23 Klient TOFU server identifikatorini emas, faqat IP manzilni pinlaydi | Birinchi tasdiqlashda serverning identifikatorini (masalan, Supervisor-imzolangan tenant/server ID yoki public-key fingerprint) saqlang va har ulanishda /api/health yoki bootstrap-status javobida shuni tekshiring. Mos kelmasa qayta tasdiqlash so'rang. — **qilindi (batch 2)** |
| FX-146 | P | low | LC-24 Muddati tugagan SaaS tenant uchun bot/worker'lar ishlashda davom etadi | Bot-manager (booking, reminder tugmalari) va recall/reminder worker'larida tenant getTenantSubscriptionState === 'expired' bo'lsa jo'natish/qabul qilishni to'xtatish yoki botda "klinika vaqtincha mavjud emas" deb javob berish. — **takrorlanmadi (batch 2)** |
| FX-147 | C2 | low | LC-25 restore-result.json'ni hech kim o'qimaydi | backup.service status()'ga restore-result.json'ni o'qib (status/file/finishedAt/error) qaytar va web'da alohida 'tiklandi/muvaffaqiyatsiz' banneri ko'rsat; tiklash xatosini lastError'dan ajratib saqla. — **qilindi (batch 2)** |
| FX-148 | C2 | low | LC-26 Server PC "Hozir o'rnatish" tugmasi tasdiqsiz va rol cheklovsiz | `installUpdateNow` oldiga server rolida tasdiq dialogi qo'shing ("klientlar uziladi, N ta ulanish faol") yoki tugmani owner/permission bilan cheklang. — **qilindi (batch 2)** |
| FX-149 | P | low | LC-27 Supervisor 404 -> qayta ro'yxat -> yangi 30 kunlik sinov | Register so'rovida tenant createdAt yuborib, Supervisor sinov muddatini shundan hisoblasin. API tomonda saveSupervisorState mavjud ancha kech expiry'ni qisqartirmasin (faqat Supervisor ro'yxatga olgandan keyin tiklash holatida). — **qilindi (batch 2)** |
| FX-150 | N | low | LC-28 Reja to'lovi paneli karta sub-turini yubormaydi; chek modal ochilmaydi | PlanBillingPanel'ga PosPanel'dagi kabi cardProvider tanlovini qo'shib buildAllocationPayload orqali yuboring va onSuccess'da ReceiptModal oching. — **qilindi (batch 2)** |
| FX-151 | N | low | LC-29 Kassa reja panelida qarzdan chiqarilgan bosqichlar «To'langan» deb ko'rsatiladi | excludedFromDebt'ni StageVM'ga o'tkazib, bunday bosqichni 'paid' emas, alohida «Qabul qilinmagan» holatida ko'rsatish (yoki selektorda faqat debt statusidagi rejalarni ko'rsatish). — **qilindi (batch 2)** |
| FX-152 | N | low | LC-30 P&L izohi «yakunlangan ish haqi» deydi, sof foyda draft payrollni ham ayiradi | Izohni «yakunlangan va qoralama ish haqi» deb o'zgartiring (uz/ru), yoki netProfitdan draftni chiqarib, Hisobotlar sahifasida «qoralama» belgisini ko'rsating. — **qilindi (batch 2)** |
| FX-153 | N | low | LC-31 Xarajat yaratish/tahrirlashda categoryId/branchId tenantga tegishliligi tekshirilmaydi | create/update'da categoryId va branchId ni getDb(c) (RLS-bound) orqali select qilib tekshir; topilmasa 400/422 qaytar. Shu tarzda 23503 500 ham yo'qoladi. — **qilindi (batch 2)** |
| FX-154 | F1 | low | LC-32 Imzolangan vizitga bog'langan retseptni PATCH/DELETE/create serverda to'silmaydi | prescriptions.service create/update/remove da (yangi va eski) visitNoteId ga bog'langan vizit signedAt != null bo'lsa VisitNoteSignedError (409) tashlang. — **qilindi (batch 2)** |
| FX-155 | F1 | low | LC-33 Vizit/retsept doctorId mijozdan olinadi, muallif tekshiruvi yo'q | assertUserExists o'rniga `assertPractitioner(doctorId)` qo'shing: u `roles.is_practitioner` ni tekshirsin va `doctorId === current user` bo'lmasa alohida permission (masalan `*.on_behalf`) talab qilsin. — **qilindi (batch 2)** |
| FX-156 | F1 | low | LC-34 PATCH vizit: imzo poygasida 409 qaytadi, lekin bosqich completed + yon ta'sirlar commit bo'ladi | `repo.find`ni `FOR UPDATE` bilan o'qing yoki `completeStageForVisit`ni `repo.update` muvaffaqiyatli bo'lgandan keyin chaqiring. — **qilindi (batch 2)** |
| FX-157 | F1 | low | LC-35 «Rejasiz» radio bog'langan vizitda yoqiq: UI uzildi deb ko'rsatadi, server e'tiborsiz qoldiradi | Bog'langan vizitda («note?.stageId» bor) «Rejasiz» radio'ni ham disabled qiling, boshqa bosqichlardagi shart bilan bir xil. — **takrorlanmadi (batch 2)** |
| FX-158 | M2 | low | LC-36 TV ekran xato/uzilishda eskirgan raqamlarni jonli ko'rsatadi va staff chromi ichida ishlaydi | QueueDisplayBoard'da queue.isError yoki dataUpdatedAt eskirganda (>30s) "Ulanish uzildi / ma'lumot eskirgan" bannerini ko'rsatib raqamlarni xiralashtirish; /queue/board uchun Sidebar/Topbar'ni yashirish (kiosk rejimi). — **qilindi (batch 2)** |
| FX-159 | M2 | low | LC-37 Walk-in ticket bemorning yozilishidan mustaqil: bir bemorga ikkita ochiq ticket | create() ichida patientId berilganda shu filialda status in ('waiting','in_progress') ochiq ticket bor-yo'qligini tekshirib queue.duplicate_ticket qaytar (advisory lock ostida), ixtiyoriy ravishda (branch_id, patient_id) bo'yicha partial unique index qo'sh. — **qilindi (batch 2)** |
| — | FT-05 | low | LC-38 Kalendar grid qat'iy 08:00–20:00; tashqaridagi yozilishlar ko'rinmaydi / sarlavha ustiga chiqadi | qamrab olingan |
| FX-160 | C2 | low | LC-39 Monotonik langar har modul-gate so'rovida Date.now() bilan siljiydi va pasaymaydi | Langarni Date.now() bilan emas, faqat server vaqtiga (heartbeat issuedAt) bog'lab yoki oldinga sakrashni cheklab (masalan bitta yozuvda +N soatdan oshmasin) yozish; vendor uchun langarni tiklash yo'li qo'shish. — **qilindi (batch 2)** |
| FX-161 | C2 | low | LC-40 Vaqtinchalik .lic o'qish xatosi LICENSE_NOT_FOUND -> web hard redirect /activate | writeLicense'ni tmp fayl + rename bilan atomik qiling va readLicense'da ENOENT (haqiqiy yo'q) ni o'qish/decrypt xatosidan ajrating (vaqtinchalik xatoda 503/qayta urinish, LICENSE_NOT_FOUND emas). — **qisman (batch 2)** |
| FX-162 | I2 | low | LC-41 409 stock.insufficient inglizcha matn, details tashlanadi | MovementFormModal'da onError qo'shib code==='stock.insufficient' ni t() kaliti bilan (available/requested interpolyatsiyasi) uz/ru'da ko'rsatish, yoki global handlerda code→i18n xaritasi. — **qilindi (batch 2)** |
| FX-163 | I2 | low | LC-42 BOM tab: filial filtri item ro'yxatini toraytiradi (UUID chiqadi, material tanlovida yo'qoladi) | BomPanel uchun filtrsiz alohida useStockItems() (branchId'siz) chaqirib, shuni BomPanel'ga bering. — **qilindi (batch 2)** |
| FX-164 | I2 | low | LC-43 Nurse (stock.manage bor, service.view yo'q): BOM tabi bo'sh, sababi ko'rsatilmaydi | BOM tabini `service.view` yo'q bo'lganda yashiring yoki StateView.forbidden ko'rsating. Boshqa yo'li: ombor ekrani uchun `service.view` bermasdan ishlaydigan tor xizmatlar ro'yxati endpoint'i qo'shing (CLI-154/155 naqshi). — **qilindi (batch 2)** |
| FX-165 | I2 | low | LC-44 ItemFormModal: tozalangan filial (null) zod validatsiyasidan o'tmaydi | stock.schema.ts:6 ni `z.string().nullish()` (yoki `.nullable().optional()`) qilish; ItemFormModal.tsx:44 dagi `// undefined` o'zgarishsiz qoladi. — **qilindi (batch 2)** |
| FX-166 | I2 | low | LC-46 Vizit avto-chiqim va 'xarajatga yoz' web keshlarini yangilamaydi | Vizit saqlash mutationlari onSuccess ida stockKeys.all ni, useCreateBatch da esa recordAsExpense true bo'lganda expensesKeys.all ni ham invalidate qilish. — **qilindi (batch 2)** |
| FX-167 | I1 | low | LC-47 stock.low_threshold bildirishnomasi qattiq o'zbekcha matn, havolasiz | Bildirishnomaga type + params (itemName, qty, min) saqlab, web'da t() bilan render qiling va type bo'yicha ombor sahifasiga navigatsiya qo'shing. — **qilindi (batch 2)** |
| FX-168 | I2 | low | LC-48 MovementHistory: xom sabab kodlari va 50 ta bilan cheklangan tarix | reason kodlarini i18n kalitlariga map qil (stock.reason_initial_balance, reason_batch_received), useStockMovements'ga page/pageSize + "ko'proq yuklash" qo'sh, sanani vaqt bilan Asia/Tashkent'da ko'rsat. — **qilindi (batch 2)** |
| FX-169 | I1 | low | LC-49 BOM qtyPerService numeric(14,2) ga yaxlitlanib 0.00 bo'lib qolishi mumkin | Schema'da qtyPerService ni kamida 0.01 qilib cheklang (`.min(0.01)` va 2 xonali aniqlik) yoki ustunni scale 3-4 ga kengaytirib DB'ga CHECK (qty_per_service > 0) qo'shing. — **qilindi (batch 2)** |

### To'lqin 11 — batch 1 whole-branch review (minor)

| ID | Lane | Og'irlik | Topilma | Tuzatish yo'nalishi |
|---|---|---|---|---|
| FX-170 | n | minor | Bosqichli vizitdagi bosqich xizmatidan tashqari qo'shimcha `performedServices` (og'riqsizlantirish, rentgen) kassada vizit orqali to'lanmaydi va komissiyaga tushmaydi (D-10 × D-13) | 🛠 D-14: bosqichli vizitda bosqichning o'z xizmatidan BOSHQA xizmatlar vizit yo'li bilan to'lanadi (pending ro'yxatda faqat shu qoldiq), bosqich xizmati — reja allocation'i bilan; komissiya vizit doktoriga — **qilindi (batch 2)** |
| FX-171 | n | minor | Vizit to'lovida `branchId` vizit (appointment) filiali bilan solishtirilmaydi — B filial kassiri A vizitini o'z filialiga yozadi | vizit yo'lida `branchId` = vizit filiali, aks holda 403 `branch.forbidden` — **qilindi (batch 2)** |
| FX-172 | m1 | minor | Telegram so'rovini tasdiqlashda doktor tanlovi filial bo'yicha filtrlanmagan; `schedule.doctor_not_in_branch` 409 «vaqt band» deb ko'rsatiladi | `useDoctors(r.branchId)` + alohida toast — **qilindi (batch 2)** |
| FX-173 | l | minor | Bulut login sahifasida `/reset-owner-password` havolasi ko'rinadi, lekin endpoint bulutda 404 (FX-08) | havolani faqat desktop'da (`window.dentalDesktop`) ko'rsatish — **qilindi (batch 2)** |
| FX-174 | l | minor | Pending vizitlar 30 kun, lekin `cashierHandoff.reception_text` «bugungi» deydi; `PendingVisitsCard` sanani `'uz-UZ'` bilan qattiq formatlaydi | matn yangilash (uz/ru), joriy til locale'i — **qilindi (batch 2)** |

Eslatma (tuzatilmaydi): batch 1 dan oldin finalize qilingan payroll davrlaridagi vizit to'lovlari refund bo'lsa, to'lanmagan komissiya clawback qilinishi mumkin — real klinika yo'q, faqat tarixiy ma'lumot; qayd etildi.

---

## 3. Feature'lar (bug emas — klinika so'ragan yangi imkoniyatlar)

Har biri alohida brainstorm → spec → reja. Tartib: qarorlardan keyin.

| ID | Manba | Feature | Oldin shart | Hajm |
|---|---|---|---|---|
| FT-01 | CF-9, 11, 12, 10 | **Davolash rejasi epiki:** odontogramma — asosiy kirish nuqtasi (tish → xizmat → joriy rejaga qo'shish, `POST /treatment-plans/{id}/stages`); bosqich tahriri; «bajarilgan ishni yozish» (2-rejim: darhol completed ad-hoc bosqich); soddalashtirilgan holatlar (Qoralama → Rozi → Davolanmoqda → Tugadi); tish tarixi paneli (holat + rasm `?tooth=` + bosqich + vizit); FDI tekshiruvi | FX-13…16, FX-27 | L — **qilindi (FW-1, `c54e142a`)** |
| FT-02 | CF-14 | Rozilik soddalashtirish: shablon → o'qish → imzo; tur/sarlavha/muddat «Qo'shimcha» ostida; shablon tahriri; chop etish | FX-26 | M |
| FT-03 | CF-3b | Shartnoma + pechat + imzo: `contract` shablon turi, o'zgaruvchilar, canvas imzo, sozlamalarda pechat rasmi, A4 print. FT-02 bilan «Hujjatlar» moduli | FT-02 | L |
| FT-04 | CF-6, 7, 8 💰👤 | Chegirma: `discount.give` (+rol bo'yicha max %), tranzaksiyada `discount_percent/reason/granted_by`, `patients.default_discount_percent`, reja bosqichida `stage.cost`ga snapshot, chegirma auditda, chekda; fiskal items netto | Qarorlar D-1…D-3; FX-21 | M–L — **qilindi (FW-1)**; rol bo'yicha max % yo'q (faqat tenant `max_discount_percent`, D-21…D-23) |
| FT-05 | CF-2a | Kalendar: bo'sh katak → oldindan to'ldirilgan yozilish; bosiladigan bo'sh slot; soatlar filial ish vaqtidan; touch drag + resize; zoom; planshet layout | — | M–L — **qilindi (FW-1)** |
| FT-06 | CF-2b, CF-4 👤 | Kamera komponenti (`getUserMedia` + Electron `setPermissionRequestHandler` faqat `media`): bemor avatari (`face_photo` → `photo_url` yozish yo'li) va kassada to'lov rasmi (`cashier_transaction_photos`, `skipped_reason`) | FX-21; D-4 | M — **qilindi (FW-1)**; 🪟 Windows'da kamera (runbook §4d) tekshirilmagan |
| FT-07 | CF-3a | Bot'da bemor o'z ma'lumotlari: «Mening yozilishlarim», «Balans»; keyin reja xulosasi va oxirgi retsept; o'qishlar auditda; throttling | FX-42, FX-41 | M — **qilindi (FW-1)** |
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
| D-14 | Bosqichli vizitda bosqich xizmatidan tashqari xizmatlar vizit yo'li bilan to'lanadi va vizit doktoriga komissiya beradi; bosqich xizmati faqat reja allocation'i bilan | Ikki marta to'lovsiz qo'shimcha ishni undirish (FX-170) |
| D-15 | `medical_record.on_behalf`/`prescription.on_behalf` faqat Tenant Admin shabloniga (backfill 0067); Branch Manager'ga berilmaydi | Eng kam imtiyoz (FX-155) |
| D-16 | Kechikkan (overdue) eslatma job'i: yozilish hali oldinda bo'lsa kech ham yuboriladi; o'tgan yozilishga yuborilmaydi | Restartdan keyin foydali eslatma saqlanadi, noto'g'risi yo'q (FX-96) |
| D-17 | Navbat chiptasini qo'lda `missed`/`cancelled` qilish omborni qaytarmaydi (faqat yozilish route'lari) | Avvalgi xulq saqlandi (FX-45) |
| D-18 | Odontogrammadan rejaga qo'shish va «Bajarilgan ishni yozish» — `medical_record.edit` (shifokor); Registrator shabloniga klinik tahrir qo'shilmadi | Klinik huquqni kengaytirmaslik (FT-01) |
| D-19 | Bajarilgan ish: «joriy reja» = shu shifokorning `accepted`/`in_progress` rejasi (boshqa shifokor rejasi 409 `plan.doctor_mismatch`); yo'q bo'lsa avto «Bajarilgan ishlar YYYY-MM» (`in_progress`, rozilik gate'siz); vizitga faqat 1 ta ish bog'lanadi; vizit bilan bosqich darhol `completed` | Ikki marta billingsiz, oddiy (FT-01.2) |
| D-20 | «Bemor rozi bo'ldi» reja `accepted` bo'lgandan keyin `proposed` bosqichlarni ham qabul qiladi, `rejected` tegilmaydi | FT-01.5 |
| D-21 | Bemor doimiy chegirmasi `max_discount_percent` dan oshmaydi (400); cap pasaytirilsa yuqori bemor foizlari cap'ga tushiriladi (0 → null); chegirma sababi ixtiyoriy | FT-04 |
| D-22 | `discount.give` POS'da maqsad filial bo'yicha (X-2, `loadBranchScope`); bemor doimiy foizi (tenant darajasi) — tenant bo'yicha | FT-04 |
| D-23 | Qisman to'lovda fiskal summa = to'langan summa, qatorlar netto (Soliq qisman chek protokoli jonli spec'ga bog'liq) | FT-04.4 |
| D-24 | Kassa yuz rasmi: standart o'chiq, 90 kun; uploads papkasi yo'q bo'lsa retention o'chirmaydi | FT-06 |
| D-25 | Bot o'z-o'ziga xizmat: bekor qilish bitta bosish (eslatma tugmasi bilan bir xil), throttling 20/daq jarayon xotirasida | FT-07 |
| D-26 | Kalendar hafta ko'rinishida grid soatlari butun hafta uchun umumiy; ish vaqtidan tashqaridagi yozilish ko'rinishi uchun oyna kengayadi | FT-05 |
| D-13 | Vizit orqali POS to'lovi (rejasiz davolash) vizit doktoriga komissiya manbai bo'ladi (`COALESCE(plan.doctor_id, visit_note.doctor_id)`), baza `paidAmount` | Rejasiz ish uchun doktor haqi yo'qolmasin (LA-29) |

## 5. Hali audit qilinmagan (keyingi round)

- ~~44 ta tekshirilmagan `low`~~ — 2026-11-19 tekshirildi: 43 tasdiqlandi → To'lqin 9 (FX-53…), 1 hal bo'lmadi.
- ~~**Tanqidchi ko'rsatgan 11 bo'shliq**~~ — 2026-11-19 audit qilindi → To'lqin 10. Asl tavsif: (A2/A3): rol bo'yicha ekran↔endpoint juftlari (bemor kartasi bo'limlari, ombor, moliya, lab, recalls, jadval); filial doirasi boshqa modullarda; Lab Hub serveri (kursor, seq, hub key, RLS); lab-hub-web autentifikatsiyasi va internal route'lar; reminder/recall dublikat skan, obunasi tugagan tenant uchun yuborish; bulut SaaS obuna sinxroni; expenses/1C/analitika pul hisoblari; vizit→ombor 4xx tx holati; navbat TV ekranida PII; desktop rejimidagi biznes oqimlar; ombor web oqimlari. → `/logic-audit` ni shu qamrov bilan qayta ishga tushirish.
- **1 hal bo'lmagan:** payroll maosh/komissiya kiritish faqat `user.manage` bilan ochiq (Accountant/Branch Manager `payroll.manage`ga ega, lekin hisob asosini o'zgartira olmaydi) — mahsulot qarori.

## 6. Ijro rejasi

1. **To'lqin 1** (FX-01…11) — bitta reja, Workflow: lane'lar `tenancy` (FX-01…04), `license` (FX-05…09), `misc` (FX-10, 11). Implementer T3/T4, har lane `verifier` (opus). ≈ 4–5 kun.
2. **To'lqin 2** (FX-12…22) — D-9, D-10, D-11 javobidan keyin. Har pul bandi real-DB failing test bilan. ≈ 1 hafta.
3. **To'lqin 3** (FX-23…30) — UI ko'p; rol bo'yicha brauzer tekshiruvi (`scripts/ui/app-shot.ts`). ≈ 1 hafta.
4. **To'lqin 4** — D-8 dan keyin. **To'lqin 5–8** — parallel lane'lar bilan.
5. Har to'lqin oxirida: merge gate (`ORCHESTRATION-GUIDE.md` §6), shu fayldagi holat ustuni, CLAUDE.md yuqori bloki.
6. Feature'lar (FT-xx) — qarorlardan keyin, har biri brainstorm → spec → reja.
