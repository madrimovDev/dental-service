# Klinika sinovi fikr-mulohazalari — tahlil (2026-11-19)

Manba: real klinika sinovidan 21 ta band. Usul: 4 ta parallel read-only scout (Telegram, kassa/moliya, klinik, kalendar/platforma), faqat statik kod o'qish — brauzer/DB'da qayta ishlab chiqarilmagan. Kod TEGILMAGAN.

Belgilar: 🐞 bug · 🧩 qisman bor · 🆕 yo'q · 👤 foydalanuvchi qarori kerak. Hajm: S (≤1 kun) · M (2–4 kun) · L (1–2 hafta) · XL.

## Xulosa jadvali

| # | Band | Holat | Hajm | Ustuvorlik |
|---|---|---|---|---|
| 1 | Telegram navbati platformaga kelmayapti | 🐞 | S→M | **P0** |
| 5 | Rozilik ikki marta chiqadi | 🐞 | S | **P0** |
| 20 | Erkin to'lovda bemor majburiy | 🧩 | S | **P0** |
| 11 | Odontogrammadan reja (+ CLI-488 uxlab yotgan) | 🐞/🧩 | M | **P0** |
| 13 | Bemor moliyasi tushunarsiz | 🧩 | S–M | P1 |
| 7 | Chegirma huquqi (rol toggle) | 🆕 | M | P1 👤 |
| 6/8 | Bemor chegirmasi / doimiy chegirma, chekda | 🧩 | M–L | P1 👤 |
| 9 | Davolash rejasi tushunarsiz | 🧩 | L | P1 |
| 12 | Reja 2 rejimi (oldin reja / keyin yozish) | 🧩 | M | P1 |
| 14 | Konsentni soddalashtirish | 🧩 | M | P1 |
| 2a | Kalendar noqulay | 🧩 | M–L | P1 |
| 10 | Tishga rasm + tish tarixi | 🧩 | M | P1 |
| 21 | Lab buyurtmaga fayl | 🧩 (asosan bor) | S–M | P2 |
| 2b | Bemor profil rasmi (kamera/fayl) | 🧩 | M | P2 |
| 3a | Bemor Telegramda o'z ma'lumotlari | 🆕 | M | P2 |
| 3b | Shartnoma + pechat + imzo | 🆕 | L | P2 |
| 4 | Kassada kamera bilan avtomatik rasm | 🆕 | M | P3 👤 |
| 17 | Planshet/telefon PWA | 🆕 | L | P2 |
| 19 | Internetsiz ishlash | desktop ✅ / bulut 🆕 | XL | P3 👤 |
| 18 | Desktop ko'rib chiqish | 🟡 Windows | — | infra |
| 15 | Rentgen apparatini ulash | 🆕 | M–XL | P3 |
| 16 | Gemini Flash | 🆕 | M | P3 👤 |

---

## 1. 🐞 Telegram navbati platformaga kelmayapti

**Tasdiqlangan:** yozuv DB'ga tushadi. `booking.ts:254-261` insert `withTenant` tx ichida, RLS 0020 o'tadi, bemorga «so'rov yuborildi» faqat commit'dan keyin yuboriladi (`telegram-bot-manager.ts:196-201`). Bemor shu xabarni olgan bo'lsa — qator bazada bor. `branch_id` NOT NULL, ro'yxat filial bo'yicha filtrlanmaydi.

**Ehtimoliy sabablar (kuchlidan):**
1. **Faqat Registrator dashboardida ko'rinadi.** `TelegramRequests` faqat `ReceptionistDashboard.tsx:291-293,520`da. Owner (`roleKey: null`, `DashboardRouter.tsx:12`) → ManagerDashboard; branch_manager/doctor/… boshqa dashboardlarga; custom rol → Generic. Sinovchi owner bo'lsa — hech qachon ko'rmaydi.
2. **Jonli yangilanish yo'q.** `useBookingRequests` (`reception.api.ts:85-92`) `refetchInterval`siz, global `refetchOnWindowFocus: false`, `staleTime 30s`. «Bugun» ochiq tursa yangi so'rov chiqmaydi. Badge/bildirishnoma yo'q.
3. **24 soatda jimgina `expired`** (`booking-requests.repository.ts:7-28`) — UI faqat `pending` ko'rsatadi, bemorga xabar ham ketmaydi.
4. `appointment.view` yo'q custom rolda — xato emas, «bo'sh» ko'rinadi.
5. Ko'p tayinlovli foydalanuvchida `roleKey` deterministik emas (`auth.service.ts:242-260` ORDER BY yo'q).
6. Bir token ikki tenantda (unikallik tekshirilmaydi, `tenant-settings.service.ts:99`).

**Klinikada tekshirish:** `select tenant_id, status, created_at from booking_requests order by created_at desc limit 20;` + sinovchining roli.

**Tuzatish:** (P0) `refetchInterval ~20s`; `TelegramRequests`ni umumiy widget qilib Manager/Doctor dashboardlarida ham (`appointment.create` gate); sidebar badge `pendingCount`. (P1) insertda `findRecipientsWithPermission`+`notifyInTx` (stock precedenti); «Muddati o'tgan» tab + bemorga xabar. (P2) bot insert'iga audit; filial doirasi; `roleKey` ORDER BY; token unikalligi.

⚠️ Yon topilma: `apps/api/tests/integration/.ui-t2-telegram-secret-test.txt` git'da kuzatiladi va test uni o'zgartiradi — gitignore + kalit bor-yo'qligini tekshirish.

## 3a. 🆕 Bemor Telegramda o'z ma'lumotlarini ko'rishi

Hozir: menyu Yozilish / Anketa / Til; push: bron qarori, chek, retsept, eslatma, recall. Talab bo'yicha (on-demand) hech narsa yo'q.

**Taklif:** A) «Mening yozilishlarim» + «Balans» (`computePatientBalance`, faqat summa). B) reja bosqichlari xulosasi, oxirgi retsept. Tibbiy yozuv/rasm/odontogramma — bot orqali **yo'q**.
**Oldin shart:** oilaviy telefon — `linkPatientByContact` eng eski bemorni oladi (`telegram-bot-manager.ts:60-65`) → boshqa bemor ma'lumoti ko'rinib qolishi mumkin → bemor tanlagich kerak. «Telegramni uzish» (xodim, audit) yo'q. Bemor o'qishlari audit qilinmaydi. Throttling yo'q.

## 5. 🐞 Rozilik ikki marta chiqadi

**Sabab (kodda tasdiqlangan):** `PlanCard.tsx:170-179` (faqat `!hasConsent`) va `PlanCard.tsx:285-292` (o'ng panel, **gate'siz** — rozilik bog'langandan keyin ham turadi) — ikkala tugma bir xil modalni ochadi, modal sarlavhasi va submit ham shu nom → ekranda 3 marta. Bundan tashqari modal **imzolamaydi**, faqat Konsent tabida oldin imzolangan formani **bog'laydi** → klinika Konsentda imzolaydi, keyin rejada yana «Rozilikni imzolash»ni ko'radi. Bo'sh holat matni mavjud bo'lmagan «Rozilik» bo'limiga yo'llaydi. Terminlar: Rozilik / Konsent / Konsent formalar.

**Tuzatish (S):** bitta tugma, bitta termin; plan modalida inline imzolash (backend `signForm`+`setConsent` bor) — tanlash emas.

## 14. Konsentni soddalashtirish

Hozir imzolashda 7 maydon (`ConsentTab.tsx:198-266`): shablon, tur, sarlavha, matn, imzo sifatida bemor ismi, muddatsiz checkbox, muddat. Shablon tahrirlash/o'chirish UI yo'q, chop/PDF yo'q, imzo rasmi yo'q.
**Taklif:** shablon tanla → to'liq o'qi → ism yoz (yoki planshetda barmoq imzosi) → tayyor. Tur/sarlavha/muddat «Qo'shimcha» ostida. Chop etish.

## 3b. 🆕 Shartnoma + pechat + imzo

Yo'q: shartnoma shabloni, PDF/chop, imzo rasmi, klinika pechati/logosi (`tenant_settings`/`branches`da maydon yo'q). Qayta ishlatiladi: `consent_templates` + snapshot-on-sign, `ReceiptModal` `window.print()`, storage adapter.
**Hajm (L):** `contract` shablon turi + o'zgaruvchilar (bemor F.I.Sh., sana, reja summasi) + canvas imzo + sozlamalarda pechat rasmi + A4 print layout. Konsent (#14) bilan bitta «Hujjatlar» moduli sifatida qilish maqsadga muvofiq.

## 9 / 11 / 12 / 10 — Davolash rejasi va odontogramma (bitta epik sifatida)

**#9 hozir:** yaratish → bosqich → taqdim etish → rozilik bog'lash (boshqa joyda imzolangan) → qabul → boshlash → har bosqichni belgilash: 5–7 qadam; terminlar (taqdim, qabul, proposed, smeta); amallar 3 joyga sochilgan; «qabul» rozilik yo'qligi sababli o'chiq ekanini ko'rsatmaydi; bosqichni yaratgandan keyin tahrirlab bo'lmaydi.

**#11 🐞 qisman:** `OdontogramTab.addToPlan` (`:135-160`) har bosishda **yangi reja** («Tish N», 1 bosqich) yaratadi; mavjud rejaga bosqich qo'shish API'si yo'q. **CLI-488 sinxroni uyquda:** backend `recordStageCompletion` bor, lekin create-stage schema `resultingToothState`ni qabul qilmaydi va web uni hech qayerda yubormaydi → bosqich tugatilganda odontogramma o'zgarmaydi.

**#12:** 1-rejim (oldin reja) bor. 2-rejim qisman: vizit yozuvi «rejasiz» + `performedServices` + kassa vizitdan to'lov oladi — lekin tishga bog'lanmaydi, odontogramma yangilanmaydi, reja tarixida ko'rinmaydi.

**#10:** `patient_images.toothNumbers` bor, lekin ro'yxat tish bo'yicha filtrlanmaydi; `ToothPanel` tarixi faqat holat snapshotlari (6 ta). Rasm/bosqich/vizit/tashxis tish bo'yicha yig'ilmaydi; vizit yozuvida tish maydoni yo'q.

**Taklif (L):**
1. Odontogramma = rejaning asosiy kirish nuqtasi: tish(lar) tanla → xizmat → «Joriy rejaga qo'sh / yangi reja»; `POST /treatment-plans/{id}/stages`; `resultingToothState` schema+UI; bosqich tahriri.
2. «Bajarilgan ishni yozish» (2-rejim) = tish+xizmat bilan darhol `completed` ad-hoc bosqich → mavjud `recordStageCompletion` orqali odontogramma yangilanadi.
3. Soddalashtirilgan holat oqimi: Qoralama → Bemor rozi (imzo shu yerda inline) → Davolanmoqda → Tugadi; ortiqcha qadamlar (presented/accepted/start) birlashtiriladi.
4. Tish tarixi paneli: holatlar + rasmlar (`?tooth=` filtri) + bosqichlar + vizitlar; yuklashda FDI tekshiruvi.

## 21. Lab buyurtmaga fayl

Asosan **bor**: yaratish formasida fayl (`LabOrderNewPage.tsx:482-493`), Hub'ga sinxron (`sync.ts:130-147`), lab qaytargan fayllar xabar sifatida keladi. Bo'shliqlar: qaytgan fayllar `lab_order_files` ro'yxatida emas (faqat xabar oqimida); yuklash xatosi yuborishni to'xtatmaydi (faqat sariq toast); klinikada preview yo'q; mobil kamera `capture` tekshirilmagan. Klinika foydalanuvchisi funksiya borligini ko'rmagan bo'lishi mumkin — UX ko'rinuvchanligi masalasi. **Hajm S–M.**

## Kassa va moliya

### 20. Erkin to'lovda bemor majburiy (S)
API `patientId` optional (`cashier.schema.ts:11`), web Charge tugmasi bemorni tekshirmaydi (`PosPanel.tsx:641`), chekda «Bemorsiz (walk-in)». Tuzatish: schema `.refine` (items rejimida majburiy) + web + test. #4 uchun ham shart.

### 7, 6, 8. Chegirma
**Bor:** faqat POS'da bir martalik summa (`cashier_transactions.discount`), chiplar 0/5/10/15%, `tenant_settings.max_discount_percent` (default 100), chekda chegirma qatori bor (foiz qayta hisoblanadi). Reja to'lovida `discount: 0` qattiq.
**Yo'q:** `discount.give` permission (hozir `cashier.create_transaction` bor har kim 100% gacha chegirma beradi); bemordagi doimiy chegirma; sabab/kim berdi; **chegirma auditga yozilmaydi**; fiskal: items brutto, amount netto (real Soliq'da mos kelmaydi).
**Ma'lumot modeli taklifi:** `discount.give` (+ ixtiyoriy rol bo'yicha max %); `cashier_transactions.discount_percent/reason/granted_by`; `patients.default_discount_percent`; reja darajasida chegirma **`stage.cost`ga snapshot** qilinadi (Qaror #16 kabi), jonli hisoblanmaydi.
**Pul xavflari:** chegirma `stage.cost`ga kirmasa qarz abadiy shishgan ko'rinadi va overpay guard noto'g'ri; payroll komissiyasi `paidAmount`dan → chegirma shifokor komissiyasini avtomatik kamaytiradi (qaror kerak); to'lovdan keyin chegirmani tahrirlash CLI-479 invariantini buzadi — faqat yaratishda. Har yo'l uchun real-DB test (reja + refund + payroll).

### 13. Bemor moliyasi (S–M, pul mantig'i o'zgarmaydi)
API `planDebt` / `nonPlanBalance` / `balance` qaytaradi, UI faqat bitta `balance`ni ko'rsatadi. `+` qarz / `−` kredit sababi ko'rinmaydi (bekor qilingan reja to'lovi jimgina kredit bo'ladi). Refund qatorida tur va status aralash; reja/bosqich nomi yo'q; 50 qator, paginatsiyasiz → ro'yxat yig'indisi sarlavhaga mos kelmaydi; chegirma ko'rinmaydi; 3 xil nom («Balans», «Eski balans», «Qoldiq»).
**Taklif:** 3 karta — «Davolash rejasi bo'yicha qarz», «Boshqa xizmatlar», «Avans/ortiqcha to'lov» + reja bo'yicha guruhlangan to'lovlar + paginatsiya.

### 4. Kassada kamera bilan rasm (M, 👤)
Kodda `getUserMedia` umuman yo'q. CSP kamerani bloklamaydi; Electron'da `setPermissionRequestHandler` yo'q (faqat `media`ga ruxsat beradigan handler qo'shish kerak). Saqlash: yangi `cashier_transaction_photos` jadvali (patient_images `patient_id NOT NULL`, tranzaksiyaga FK yo'q). Kamera ishlamasa to'lov bloklanmaydi — `skipped_reason` auditga. Yuz rasmi = shaxsiy ma'lumot → saqlash muddati va huquqiy asos.

## Kalendar va bemor rasmi

### 2a. Kalendar (M–L)
Bo'sh katakka bosib yozilish yaratib bo'lmaydi (faqat «Yangi yozilish» tugmasi); hafta ko'rinishi faqat o'qish uchun; drag HTML5 DnD — **planshetda (touch) ishlamaydi**; davomiylikni cho'zib o'zgartirish yo'q; 30 daq = 44px, 15 daq ~22px, zoom yo'q; soatlar 08–20 qattiq (filial ish vaqtidan emas, tashqaridagi yozilishlar yashirinadi); o'ng panel 296px qattiq, media-query yo'q; «Bo'sh slotlar» kartasi bosilmaydi.
**Taklif (ustuvorlik tartibida):** bo'sh katak → oldindan to'ldirilgan yozilish; bo'sh slot bosiladigan; soatlar filial ish vaqtidan; pointer-events bilan touch drag + resize; zoom; planshet layout.

### 2b. Bemor profil rasmi (M)
`patients.photo_url` ustuni bor, lekin yozish yo'li yo'q (schema'da yo'q, web ishlatmaydi). `patient_images.type=face_photo` bor. Taklif: avatar = `face_photo` yuklash/kamera → `photo_url`; kamera modal (`getUserMedia`) — #4 bilan umumiy komponent.

## Platforma

### 17. PWA (L)
Manifest, service worker, `vite-plugin-pwa` yo'q; `apps/web/public/` yo'q (favicon tekshirilmagan). AppShell `sm`da yig'iladi, `--tap-min 44px` bor. Avval kalendar/bemorlar/kassa responsive bo'lishi kerak. SW faqat statik shell'ni keshlaydi — API javoblari (PHI, RBAC) **keshlanmaydi**.

### 19. Internetsiz ishlash (👤)
Desktop (LAN server) kundalik ish uchun allaqachon internetsiz ishlaydi; internet faqat aktivatsiya/heartbeat/Telegram/SMS uchun. Server PC — yagona nuqta, off-host zaxira yo'q. Bulut SaaS — umuman oflayn yo'q. Bulutda oflayn (IndexedDB navbat + sinxron) = XL va konflikt xavfi. **Tavsiya:** internet ishonchsiz klinikaga desktop versiyani taklif qilish; bulutda faqat oflayn banner + o'qish uchun kesh.

### 18. Desktop
Kod tayyor, Linux'da sinalgan; Windows'da `DESKTOP-WINDOWS-BUILD-TEST.md` §4b/§4c tekshiruvlari belgilanmagan. Qolgan: jismoniy Windows sinovi, code signing (SmartScreen, CLI-376), `UPDATE_URL` (CLI-377), kamera ruxsati tekshiruvi (#2b/#4 qilinsa).

### 15. Rentgen (M–XL)
DICOM/TWAIN/watch-folder kodi yo'q; rentgen turlari enum'da bor. Variantlar: (1) **watch-folder** — desktop main jarayoni rentgen dasturi eksport qiladigan papkani kuzatib JPEG/PNG'ni `/patient-images`ga yuklaydi (eng arzon, deyarli har apparat bilan ishlaydi); (2) DICOM C-STORE SCP (CBCT, og'ir); (3) TWAIN sensor (vendor-maxsus, Windows). Oldin: `.dcm`ni kengaytma bo'yicha qabul qilish (brauzer bo'sh MIME yuboradi → 415). Klinika apparat modeli kerak.

### 16. Gemini Flash (M, 👤)
LLM kodi/dependency yo'q. Mos joylar: vizit yozuvi diktovkasi→qoralama, rentgen tavsifi qoralamasi, «Mening kunim» xulosasi. Shartlar: faqat API'dan (server kalit, audit), tenant bo'yicha opt-in (Qaror #38 naqshi), PHI uchinchi tomonga ketadi → rozilik + minimallashtirish; desktop'da faqat internet bo'lsa; o'zbek tilida sifat sinalmagan.

---

## Ochiq qarorlar (👤)

1. **#7** Shifokor chegirmasi: shifokor rejada/vizitda belgilaydi (kassir o'zgartira olmaydi) yoki kassir `discount.give` bilan qo'llaydi?
2. **#8** Doimiy chegirma reja bosqichlariga ham tegadimi (qarzni o'zgartiradi) yoki faqat POS?
3. **#6–8** Chegirma shifokor komissiyasini kamaytiradimi?
4. **#4** Kassa rasmi majburiymi yoki tenant sozlamasi; saqlash muddati?
5. **#19** Bulutda oflayn kerakmi yoki «ishonchsiz internet = desktop» siyosati?
6. **#15** Klinikadagi rentgen apparati/dasturi qaysi?
7. **#16** AI birinchi qaysi joyda (diktovka / rentgen / xulosa)?

## Tavsiya etilgan tartib

- **To'lqin 1 (bug, tez):** #1, #5, #20, #11 (CLI-488 ulash) — ~3–4 kun.
- **To'lqin 2 (tushunarlilik):** #13, #14, #2a (bo'sh katak, soatlar, bosiladigan slot), #21 bo'shliqlari.
- **To'lqin 3 (reja epiki):** #9 + #11 + #12 + #10 — bitta brainstorm → spec.
- **To'lqin 4 (chegirma):** #7 → #6/#8 — qarorlardan keyin, real-DB testlar bilan.
- **To'lqin 5:** #2b + #4 (umumiy kamera komponenti), #3a, #3b, #17.
- **Keyin:** #15, #16, #19, #18 (Windows).
