# UI qayta dizayni (Dental OS) — amalga oshirish spetsifikatsiyasi

**Sana:** 2026-11-11
**Holat:** Dizayn chizildi va foydalanuvchi uni 5 bosqichda ko'rib chiqdi ("davom et"). **Kod hali yozilmagan.** Keyingi qadam — `superpowers:writing-plans` bilan bosqichma-bosqich implementatsiya rejasi.

**Manbalar (vizual haqiqat — shu kanvas):**
- Kanvas (claude.ai, faqat egasiga ko'rinadi): https://claude.ai/artifact/71dFMTtcyyMFE5yZhGSDZ3
- **Repo nusxasi — ishlash uchun asosiy manba:** [`docs/design/ui-redesign-2026-11/canvas/`](../../design/ui-redesign-2026-11/canvas/). U 25 ta fayldan iborat: `canvas.json` indeksi va 24 ta `*.dc.html` artboard.
- UX tadqiqoti: [`reports/Dental klinika UX UI tendensiyalari.md`](../../../reports/Dental%20klinika%20UX%20UI%20tendensiyalari.md). Tavsiyalar unda P0/P1/P2 darajalarida berilgan.
- Kod topilmalari: [`docs/FINDINGS-REGISTER-2026-11-11.md`](../../FINDINGS-REGISTER-2026-11-11.md) (P1–P18 va boshqa ID'lar).
- Lab portali yo'nalishi: [`docs/LAB-TECHNICIAN-ACCESS-2026-11-11.md`](../../LAB-TECHNICIAN-ACCESS-2026-11-11.md). C varianti tanlangan, lekin dizayn spetsifikatsiyasi hali yozilmagan.

---

## 0. Keyingi agent uchun: kanvasni qanday o'qish

1. **Har `*.dc.html` — mustaqil HTML sahifa.** Markup inline `style="…"` bilan yozilgan, ma'lumot esa pastdagi `class Component extends DCLogic { renderVals() {…} }` ichida. `{{hole}}` — `renderVals()` qaytargan qiymat, `<sc-for>` — sikl, `<sc-if>` — shart, `<dc-import name="Sidebar" …>` — `Sidebar.dc.html` komponenti.
   - Ko'rish usuli: kanvasni ochish yoki faylni o'qib tuzilish, matn, rang va o'lchamlarni olish.
   - Inline ranglar aynan shu dizayn tokenlari (1-bo'lim).
2. **Matnlar** — mo'ljallangan o'zbekcha UI matni. Ular `packages/i18n` ga **uz va ru** kalit sifatida ko'chiriladi (CLAUDE.md §3.9). Hech biri hardcode qilinmaydi.
3. **Namuna ma'lumotlar** (ism, summa, vaqt, telefon, ta'minotchi telefoni `+998 71 200 00 00`, `@[ta'minotchi]`) — **to'qib chiqarilgan**. Kodga ko'chirilmaydi, real API'dan olinadi.
4. **Texnologiya:** React + Mantine v7 + `@dental/ui` primitivlari + feature-folder (RFC-0010) + generated `api-client`. Kanvas HTML'i ko'chirib qo'yilmaydi — Mantine/`@dental/ui` bilan qayta quriladi. Pixel-parity maqsad emas: **tuzilish, ierarxiya, matn, holatlar va xulq** mos bo'lishi shart.
5. **RBAC:** har ekran **rol bo'yicha, real cheklangan permset bilan** sinaladi, hech qachon `@owner` bilan emas. Takrorlanuvchi bug sinfi uchun FINDINGS-REGISTER §2.3 ga qarang.

---

## 1. Asos (`Tokens.dc.html`, `Components.dc.html`, `Sidebar.dc.html`)

### 1.1 Token o'zgarishlari (`packages/ui/src/theme/tokens.css` + `mantine-theme.ts`)

| Token | Hozir | Yangi | Sabab |
|---|---|---|---|
| `--text-base` (asosiy matn) | 13.5px | **15px** | o'qilishi (tadqiqot: klinik UI, katta yoshli xodimlar) |
| eng kichik matn | 11–12.5px | **13px** (izoh/yorliq), 12px faqat badge | — |
| `--text-3` (#7a857e) | izohlarda ishlatiladi | izoh/yorliqda **`--text-2` (#4c5852)** yoki `#5f6b65`; `--text-3` faqat dekor/placeholder | kontrast ≥4.5:1 |
| Bosish zonasi | aralash | stolda **≥44px**, kreslo yoni rejimida **≥60px** | qo'lqop, tadqiqot ≥15 mm |
| Shrift | Hanken Grotesk + JetBrains Mono | o'zgarmaydi; **vaqt, pul, tish raqami va telefon doim Mono** | ustunlar tekis turishi uchun |

Dark mode tokenlari saqlanadi. Yangi tokenlarning har birida dark mode kontrasti tekshiriladi (CLAUDE.md DS0 darsi).

### 1.2 Yagona holat lug'ati — 6 ma'no

`Tokens.dc.html` → «Holat lug'ati». Barcha modullar shu jadvalni ishlatadi. Yangi `packages/ui` → `StatusPill` variantlari ma'no bo'yicha nomlanadi, modul bo'yicha emas.

| Ma'no | Fon / matn | Yozilish | Navbat | Reja bosqichi | Lab buyurtma | To'lov |
|---|---|---|---|---|---|---|
| `planned` | #e8eefb / #1f4f9e | Yozildi | — | Taklif | Yuborildi | — |
| `confirmed` | #e7f6f1 / #096154 | Tasdiqlandi | — | Rozi | Qabul qilindi | To'landi |
| `waiting` | #fbf1dd / #7a4f0a | Keldi | Kutmoqda | Lab kutilmoqda | Tayyorlanmoqda | Qisman |
| `active` | #0b7a6b / #fff | Kresloda | Kresloda | Jarayonda | Jo'natildi | — |
| `done` | #f1f3ef / #4c5852 (+chegara) | Yakunlandi | Ketdi | Bajarildi | Yetkazildi | Qaytarildi |
| `failed` | #fbe7e5 / #842523 | Kelmadi | Kelmadi | Rad etildi | Rad etildi | Qarz |

**Qoida:** rang doim **matn bilan birga** (doira + yorliq). Faqat rangdan iborat belgi bo'lmaydi.

### 1.3 Uch darajali ogohlantirish (`AlertTier`)

| Daraja | Ko'rinishi | Qachon | Misol |
|---|---|---|---|
| 1 · Kritik | modal (`alertdialog`) | **faqat xavfli harakat paytida**; sabab tanlanadi va saqlanadi, shu bemorda qayta so'ralmaydi | penitsillinga allergiyasi bor bemorga amoksitsillin yozilganda |
| 2 · Diqqat | doimiy banner yoki yorliq, to'xtatmaydi | bemor kartasi sarlavhasi, kun ro'yxatidagi belgi | «Allergiya: penitsillin» |
| 3 · Ma'lumot | «Diqqat» panelida ko'pi bilan 3–5 ta, qolgani «yana N ta» ostida | har band amalga olib boradi | «7 bemorni qayta chaqirish vaqti» |

Dalil: darajasiz tizimda jiddiy ogohlantirishlarning 34% i, darajali tizimda 100% i qabul qilingan (tadqiqot hisoboti).

### 1.4 Yangi yoki o'zgaradigan komponentlar (`packages/ui`)

| Komponent | Holat | Kanvasdagi joyi | Izoh |
|---|---|---|---|
| `StatusPill` | o'zgaradi | Tokens, hamma joyda | 6 ma'no varianti (1.2) |
| `PatientFlag` (yangi) | yangi | Components «Belgilar» | to'rtburchak yorliq: kritik / diqqat / neytral / ma'lumot |
| `AlertBanner` (yangi) | yangi | Components, Patient | 3 daraja (1.3) |
| `CriticalActionDialog` (yangi) | yangi | Components | sababni tanlash, xavfsiz variant — asosiy tugma |
| `UndoToast` (yangi) | yangi | Components, Calendar | «Kelmadi», «Bekor», «Arxivlash» — 10 s ichida qaytarish; **pul amallari doim tasdiq oynasi bilan** |
| `StateView` | kengayadi | Components «Ekran holatlari» | `empty` / `error` / **`forbidden`** (kimga murojaat qilishni yozadi) / `loading`. **403 bo'lganda hech qachon default qiymat ko'rsatilmaydi** (ID-11) |
| `ConnectionStatus` (yangi) | yangi | Sidebar pastida | `lan` / `offline` / `cloud` / `noserver` |
| `UpdateBanner` (yangi) | yangi | Components | yangilanish ish vaqtidan keyin; vaqtni o'zgartirish mumkin |
| `PhoneInput` | o'zgaradi | Components, Patients | `+998` prefiksi, istalgan shaklda yozish, Mono |
| Tugma matni | qoida | Tokens «Matn qoidalari» | doim fe'l: «Tashxis qo'shish», «OK/Update» emas |

### 1.5 Navigatsiya (`Sidebar.dc.html` → `apps/web/src/shell/Sidebar.tsx`, `nav-config.ts`)

- **Rolga qarab menyu.** Faqat ruxsatga qarab yashirish emas — ish bo'yicha guruhlanadi:
  - registrator: «Bugungi ish» — Bugun, Kalendar, Navbat; «Bemorlar va pul» — Bemorlar, Kassa, Qayta chaqiruv;
  - shifokor: «Bugungi ish» — Mening kunim, Navbat; «Davolash» — Bemorlar, Davolash rejalari, Laboratoriya;
  - rahbar: «Umumiy» — Bugun, Kalendar, Bemorlar, Kassa; «Boshqaruv» — Hisobotlar, Ombor, Xodimlar, Xarajat va ish haqi; Sozlamalar faqat rahbarda;
  - texnik: Buyurtmalar, Klinikalar, Hisob-kitob.
- Qolgan ruxsatli sahifalarga ⌘K orqali kirish saqlanadi. Ruxsatli sahifa topib bo'lmaydigan bo'lib qolmasligi kerak.
- Rol `roleKey`/permset'dan aniqlanadi. Custom rol uchun mavjud permission-filter fallback ishlatiladi.
- Menyu pastida: `ConnectionStatus`, foydalanuvchi va rol, chiqish.

---

## 2. Ekranlar → kod xaritasi

Ustunlar:
- **Artboard** — `docs/design/ui-redesign-2026-11/canvas/` dagi fayl.
- **Kod** — o'zgaradigan asosiy fayl yoki fayllar (`apps/web/src/features/...`).
- **Backend** — kerakli API yoki sxema ishi va bog'liq topilma ID'si.
- **Qabul** — tayyor deyish uchun majburiy shartlar.

### 2.1 Registrator

| ID | Artboard | Kod | Backend | Qabul |
|---|---|---|---|---|
| UI-R1 | `Main.dc.html` · Bugun | `dashboard/components/ReceptionistDashboard.tsx` (+ yangi widgetlar) | (a) Telegram so'rovlari: yangi `booking_requests` (bot → registrator tasdiqlaydi), T2 bilan birga; (b) qidiruv: telefon (istalgan shakl) + lotin↔kirill transliteratsiya, `patients.search`; (c) «Diqqat» manbalari: jadvalsiz shifokor (P10), lab muddati, recall | har qatorda **bitta** keyingi amal; filtrlar navigatsiyadan keyin saqlanadi (URL yoki store); kechikish matn bilan («+7 daq»); diqqat paneli darajali, ≤3 + «yana N ta» |
| UI-R2 | `Calendar.dc.html` · Kalendar | `appointments/components/CalendarScreen.tsx`, `CalendarGrid.tsx`, `WaitlistCard.tsx` | status o'tishlari mavjud `PATCH` (SC-03); kreslo ustunlari uchun `chair`/operatoriya modeli (hozir yo'q — P1-darajali yangi maydon); bo'shagan slot uchun waitlist nomzodlari; 100-chegarani olib tashlash (SC-01/02) | «Shifokorlar \| Kreslolar» almashtirish; tanlangan yozilish panelida status amallari va holat tarixi; «Kelmadi»/«Bekor» → `UndoToast`; «ushlab turish» joyi (drag); jadvalsiz ustun holati |
| UI-R3 | `Booking.dc.html` · Yangi yozilish | `NewAppointmentWizard.tsx` → **bitta ekran** (route yoki to'liq ekranli drawer) | availability `now` bilan, o'tgan slot sababi bilan (SC-07); lab ishi muddati ogohlantirishi; reja bosqichi taklifi | 4 qadam bir ekranda; yo'q slot yonida sabab («band», «tushlik», «60 daq sig'maydi»); Telegram eslatma matni oldindan ko'rinadi; pastda yopishqoq xulosa va «Yozish» |
| UI-R4 | `Queue.dc.html` · Navbat | `queue/components/QueueBoard.tsx`, `QueueDisplayBoard.tsx`, `CheckInDialog.tsx` | queue→appt `{ok:false}` natijasini ko'rsatish (SC-09); shifokor chaqira olishi — **qaror kerak** (SC-10) | 3 ustun; kutish vaqti matn bilan; kelmaganlar ro'yxatidan «Keldi»; **TV ekranida bemor ismi chiqmaydi** |
| UI-R5 | `Cashier.dc.html` · Kassa | `cashier/components/PosPanel.tsx`, `CartTable.tsx`, `DailySummaryCard.tsx`, `ReceiptModal.tsx` | `payment_method`ga **QR (Click/Payme)** qo'shish — hozir `cash/card/transfer/other`; P7 (items+treatmentPlanId); kunlik xulosa formulasi refund'ni ayiradi (P13 bilan bir xil helper); fiskal chek holati | narx qulflangan (MO-02); naqdda qaytim hisobi; usullar: naqd/karta/QR/o'tkazma; fiskal chek holati ko'rinadi; chek serverdan chiziladi; xulosa «qaytarildi»ni ayiradi |
| UI-R6 | `Patients.dc.html` · Bemorlar | `patients/components/PatientsListScreen.tsx`, `PatientNewScreen.tsx` | lotin↔kirill qidiruv; ro'yxat DTO'siga belgilar (allergiya, qarz, kelmaganlar, Telegram); **telefon dublikat tekshiruvi** endpoint'i; Excel import (P2 darajali, keyinroq) | kirill «турсун» → «Tursun» topiladi; dublikatda «Uni ochish / Baribir yangi (oila a'zosi)»; yangi bemor uchun ism + telefon yetarli; PII `view_pii`siz maskalanadi (PT-01…04) |

### 2.2 Shifokor

| ID | Artboard | Kod | Backend | Qabul |
|---|---|---|---|---|
| UI-D1 | `DoctorDay.dc.html` · Mening kunim | `dashboard/components/DoctorDashboard.tsx` | «mendan kutilmoqda»: imzolanmagan vizit yozuvlari, ko'rilmagan rasm, javob kutayotgan rejalar (yangi agregat endpoint, `appointment.view` + `medical_record.view` bilan) | keyingi bemor kartochkasi: holat, allergiya, lab, oxirgi vizit; bitta asosiy tugma |
| UI-D2 | `Patient.dc.html` · Bemor kartasi | `patients/components/PatientCard.tsx`, `PatientHeaderCard.tsx`, `tabs/*` | `medical_records.confirmedAt` (anamnez oxirgi tasdig'i — yangi maydon); presence («kim ishlayapti») — yengil polling yoki keyinga qoldirish (P1); P11 rasm ko'rsatish | **12 tab → 4 bo'lim**: Umumiy · Davolash · Moliya · Hujjatlar va rasmlar; sarlavhada doimiy allergiya banneri (daraja 2); «Umumiy» tartibi: ogohlantirish → faol reja va bugungi bosqich → so'nggi vizitlar · yonda balans, keyingi tashrif, ochiq tashxislar; bosqich tugaganda nima bo'lishi oldindan yozilgan. ⚠️ 4 bo'lim qarori usability testida tasdiqlanadi (tadqiqot: nazoratli dalil yo'q) |
| UI-D3 | `Odontogram.dc.html` · Tish xaritasi | `clinical/components/odontogram/*` | tashxis qidiruvi: nom + sinonim + ru + xato yozuvga chidamli (`diagnoses.repository` — hozir `like`); bitta tishga bir nechta tashxis; stage `toothNumbers` FDI tekshiruvi (CL-01) | 5 yuza; ro'yxatda nom birinchi, kod ikkinchi; «Tashxis qo'shish» / «Rejaga qo'shish» / «Faqat tashxisni saqlash»; «Hozirgi holat \| Reja \| Tarix»; kreslo yoni rejimi (≥60px); legenda matnli |
| UI-D4 | `VisitNote.dc.html` · Vizit yozuvi | `clinical/components/visit-notes/VisitNoteFormModal.tsx` → **sahifa** | P12 (Zod `.partial()` default) tuzatilishi **shart**; vizit shablonlari UI (CL-12, backend tayyor); dori va allergiya tekshiruvi → `CriticalActionDialog`; avto-qoralama (lokal + server) | tashxis tish xaritasidan; bajarilgan ishlarda narx qulflangan va ombordan yechilish ko'rsatiladi; reja bosqichi bilan bog'lash; keyingi tashrif taklifi registrator «Bugun»ga tushadi; «Imzolash va kassaga yuborish» |
| UI-D5 | `LabOrder.dc.html` · Lab buyurtma | `clinical/components/lab-orders/*` | `lab_orders`: **`shade` va `due_date` majburiy**, fayl biriktirish (`lab_order_files`), `remake_of_id` + `remake_reason` (enum), `lab_id` (LAB-TECHNICIAN B poydevori) | rang va muddat majburiy; muddat yozilish vaqti bilan solishtiriladi; «Laboratoriya nimani ko'radi» bloki; remake sabab kodlari; holat zanjiri |

### 2.3 Rahbar

| ID | Artboard | Kod | Backend | Qabul |
|---|---|---|---|---|
| UI-M1 | `OwnerDashboard.dc.html` | `dashboard/components/ManagerDashboard.tsx` | qarz muddati bo'yicha agregat; **zaxira nusxa holati** (yangi, P16/P17); litsenziya muddati (bootstrap/license ma'lumotidan); filial holati, jumladan oflayn; P13 formulasi | 4 KPI bosiladi; «Siz hal qiladigan masalalar» darajali; filial va shifokor bo'yicha bugun |
| UI-M2 | `Reports.dc.html` | `reports/components/ReportsScreen.tsx` | savolga mos endpointlar (mavjudlari + qarz muddati); branch scoping server tomonida (IR-06) | savollar ro'yxati; bir gaplik javob → grafik → har qatorda amal bilan jadval; «Qanday hisoblandi?»; Excel/1C; davr va filial saqlanadi |
| UI-M3 | `Settings.dc.html` | `settings/components/SettingsShell.tsx`, `BranchesSettingsScreen.tsx`, `TenantSettingsScreen.tsx`, `IntegrationsSettingsScreen.tsx` | **filial `workHours` UI** (P10); readiness checklist endpoint; zaxira nusxa (desktop: USB/bulut — yangi funksiya); litsenziya uzaytirish so'rovi (Supervisor renew P16) | bo'lim yonida holat badge'i; «Klinika ishga tayyorligi N/7»; haftalik ish soati; shifokor jadvali holati; kanal ulanmagan bo'lsa recall «yuborildi» bo'lmaydi (P9) |
| UI-M4 | `Staff.dc.html` | `settings/components/UsersSettingsScreen.tsx`, `RolesSettingsScreen.tsx` | **P5** (o'zidan yuqori rol bera olmaslik — server); `mustChangePassword` (ID-29); faolsizlantirish (ID-06); egasi ro'yxatda (ID-28); parol loglardan olib tashlanadi (ID-04/05) | rol kartalarida «qila oladi / qila olmaydi» oddiy tilda; ruxsat etilmagan rol `aria-disabled`; vaqtinchalik parol bir marta ko'rsatiladi |
| UI-M5 | `Stock.dc.html` | `stock/components/StockScreen.tsx`, `StockItemsTable.tsx`, `BatchFormModal.tsx` | «necha kunga yetadi» = qoldiq ÷ o'rtacha kunlik sarf (yangi hisob); `expiringBatches` faqat qoldig'i borlar (IR-02); boshlang'ich qoldiq ledgerga (IR-01); kirim → xarajat (ixtiyoriy) | tugayotganlar birinchi; muddati yaqin partiya «avval shuni ishlatish»; bugungi avto-yechish jurnali |
| UI-M6 | `Finance.dc.html` | `expenses/components/ExpensesScreen.tsx`, `payroll/components/PayrollScreen.tsx` | P&L agregati; payroll tuzatish sababi (refund clawback izohi) | sof foyda = tushum − xarajat − ish haqi; komissiya ochiq hisoblangan; yakunlashdan oldin ogohlantirish |

### 2.4 Tashqi

| ID | Artboard | Kod | Backend | Qabul |
|---|---|---|---|---|
| UI-T1 | `LabPortal.dc.html` | yangi — lab tenanti (`vertical: 'lab'`) UI | **LAB-TECHNICIAN C varianti** — avval o'z dizayn spetsifikatsiyasi va rejasi kerak (brainstorm boshlangan, tugallanmagan); D1 relay desktop klinikalar uchun | ko'p klinikali inbox, muddat bo'yicha; ish holati (Medit uslubi); chat; texnikka biriktirish; rad etishda sabab; **bemor PII ko'rinmaydi** |
| UI-T2 | `TelegramBot.dc.html` | `apps/api/src/lib/telegram-bot-manager.ts` (+ yangi flow modullari) | **P8 avval** (kontakt egaligi); bo'sh slot API; `booking_requests` (UI-R1 bilan); eslatma tugmalari → appointment status; anketa havolasi; chek va retsept xabari; bemor tili | 4 oqim: ulanish → yozilish → 24 soatlik eslatma (Kelaman/Boshqa vaqt/Bekor) → anketa, chek, retsept; uz/ru |
| UI-T3 | `Desktop.dc.html` | `apps/desktop/build/installer.nsh`, `first-run.ts`, `main.ts`, `process-manager.ts`, `server-url-prompt.ts`, `settings-ipc.ts`, `auto-updater.ts`, web `/activate` | **P2** (har startda migratsiya), **P14** (`${isUpdated}` — config saqlanadi), **P15** (auto-restart va xabar), DT-01 (tray ikonka), DT-02/03 (port, firewall), DT-18 (manzil faqat muvaffaqiyatda saqlanadi), zaxira nusxa | o'rnatishda Server/Klient izohi; aktivatsiya xatosi oddiy tilda va keyingi qadam bilan; server topilmadi → qayta qidirish va qo'lda manzil; yangilanish: zaxira → migratsiya → qayta ishga tushirish, muvaffaqiyatsizlikda orqaga qaytarish |

---

## 3. Bajarish tartibi (bosqichlar)

Har bosqich alohida `writing-plans` rejasi va alohida branch. Ekranlar navbatma-navbat, TDD bilan, rol bo'yicha sinov bilan.

| Bosqich | Mazmun | Oldin bajarilishi shart |
|---|---|---|
| **UI-0 Asos** | tokenlar (1.1), holat lug'ati (1.2), `AlertTier`, `UndoToast`, `StateView.forbidden`, `ConnectionStatus`, rolga moslashuvchi `Sidebar` (1.5), i18n kalitlari | **P1** (RLS rollback) — mustaqil, lekin birinchi navbatda |
| **UI-1 Registrator** | R1–R6 | P10 (workHours), P7, P13, SC-01/02/07/09; R1 Telegram so'rovlari T2 bilan birga |
| **UI-2 Shifokor** | D1–D5 | **P12** (D4), P11 (D2 rasmlar), CL-01, lab_orders sxema o'zgarishi (D5) |
| **UI-3 Rahbar** | M1–M6 | P5 (M4), P9 (M3), IR-01/02/06; zaxira nusxa funksiyasi (alohida epik) |
| **UI-4 Tashqi** | T2, T3, keyin T1 | P8 (T2); P2/P14/P15 (T3); lab portali spetsifikatsiyasi (T1) |

Har bosqich oxirida:
- typecheck, biome, `check:rls`, web vitest;
- tegilgan modullar uchun API integration testlari;
- **rol bo'yicha** sinov (`@owner` EMAS);
- kanvas bilan ekran-ekran solishtirish: tuzilish, matn, holatlar.

---

## 4. Qaror kutayotgan savollar (foydalanuvchi)

1. **Shifokor navbatdan bemorni o'zi chaqiradimi?** Dizayn «ha» deb chizilgan. Hozir shifokorda `queue.manage` yo'q (SC-10).
2. **Kreslo modeli.** Kalendarda «Kreslolar» ko'rinishi uchun filialda kreslo (operatoriya) obyekti kerak — hozir yo'q. Qo'shiladimi?
3. **Laboratoriya ko'radigan bemor ma'lumoti.** Bosh harflar, jins, yosh va klinika kodi yetarlimi?
4. **Zaxira nusxa.** Har kuni 20:00 da USB diskka va tarifda bo'lsa bulutga. Tasdiqlansinmi?
5. **QR to'lov.** Click/Payme alohida `payment_method` bo'ladimi yoki `card` ichida qoladimi?
6. **Bemor kartasi.** «12 tab → 4 bo'lim» qarori usability testi bilan tasdiqlansinmi? Tadqiqot: 3–5 ta haqiqiy xodim bilan, NIST uslubida.

## 5. Qilinmaydigan narsalar (anti-goals)

- AI scribe yoki ovozli kiritish bu bosqichda yo'q (tadqiqot P2: dalil zaif, uz/ru aniqligi noma'lum).
- Alohida bemor mobil ilovasi yo'q — bemor tomonida faqat Telegram bot.
- Faqat rangli holat, har karta ochilishida modal, ish vaqtida majburiy yangilanish, qaytarib bo'lmaydigan bir bosishli xavfli amal — taqiqlanadi.
- Kanvasdagi namuna ma'lumotlar kodga yoki seed'ga kiritilmaydi.
