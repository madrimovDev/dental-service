# Klinika feature'lari — dizayn (2026-11-19)

Manba: klinika sinovi fikrlari ([`CLINIC-FEEDBACK-2026-11-19.md`](../../CLINIC-FEEDBACK-2026-11-19.md)), [`FIX-BACKLOG`](../../FIX-BACKLOG-2026-11-19.md) §3 (FT-01…12) va §4.1 🛠 qarorlar. Foydalanuvchi «savol so'ramay to'xtamasdan ishla» degani uchun brainstorm savollarisiz — har tanlov 🛠 bilan belgilangan. Batch 1/2 tuzatishlari (X-1…X-3, FX-xx) **oldin** merge qilinadi; feature'lar shu ustiga quriladi.

Feature to'lqinlari (fayl kesishmasiga qarab):
- **FW-1 (parallel):** FT-01 davolash rejasi · FT-04 chegirma · FT-05 kalendar · FT-06 kamera · FT-07 bot o'z ma'lumotlari
- **FW-2 (parallel):** FT-02 rozilik · FT-03 shartnoma/pechat (FT-02 ustiga) · FT-08 PWA (FT-05 ustiga) · FT-09 rentgen watch-folder · FT-10 AI yordamchi · FT-11 oflayn banner
- FT-12 (desktop Windows) — foydalanuvchi/jismoniy PC, kodda faqat runbook yangilanadi.

---

## FT-01 Davolash rejasi epiki (CF-9, 10, 11, 12) — L

**Maqsad:** reja tuzish va bajarilgan ishni yozish 2–3 bosishda, odontogrammadan.

1. **Odontogramma — asosiy kirish nuqtasi.** ToothPanel'da tish(lar) tanlanadi → «Rejaga qo'shish»: xizmat (narx filial narxidan), `resultingToothState`, «Joriy reja» (bemorning eng so'nggi `draft|presented|accepted|in_progress` rejasi) yoki «Yangi reja». Ko'p tish tanlash (Shift/uzun bosish).
   - API: `POST /treatment-plans/{id}/stages` (bosqich qo'shish; reja `completed|cancelled` bo'lsa 409), `PATCH /treatment-stages/{id}` kengayadi: `serviceId`, `cost`, `toothNumbers`, `resultingToothState`, `notes` faqat `status=pending` va to'lov allocation'i yo'q bo'lsa (aks holda 409 `stage.locked`). Reja `totalCost` bosqichlar yig'indisidan qayta hisoblanadi.
2. **2-rejim «Bajarilgan ishni yozish»** (CF-12): ToothPanel va vizit sahifasida tugma → tish + xizmat(lar) → bemorning joriy rejasiga (yoki avtomatik «Bajarilgan ishlar YYYY-MM» rejasiga, holati `in_progress`) **`acceptance=accepted`, `status=completed`** bosqich qo'shiladi va X-3 yakunlash funksiyasi orqali o'tadi (odontogramma snapshot, recall). Vizit yozuvi bilan bog'lanadi (`stageId`). 🛠 Bu yo'l bilan yaratilgan bosqich reja qarziga tushadi (to'lov kassada «reja bo'yicha»).
3. **Soddalashtirilgan holatlar (UI darajasida, DB enum o'zgarmaydi):** «Qoralama» (draft) → «Bemorga ko'rsatildi» (presented) → «Bemor rozi» (accepted; rozilik inline — FX-26/FT-02) → «Davolanmoqda» (in_progress, birinchi bosqich boshlanganda avtomatik) → «Tugadi». Plan kartasida bitta asosiy tugma (keyingi qadam) + «…» menyu; smeta/taqdimot modal emas, kartaning o'ng paneli.
4. **Tish tarixi paneli (CF-10):** ToothPanel «Tarix» tab: holat snapshotlari + `GET /patient-images?tooth=NN` (`toothNumbers @> ARRAY[NN]`) + shu tishli bosqichlar (reja nomi, holat, sana, narx) + shu tishli vizit yozuvlari (bosqich orqali yoki yangi `visit_notes.tooth_numbers int[]` — 🛠 qo'shiladi, migratsiya). Rasm yuklashda tish oldindan to'ldirilgan; FDI validatori (11–18, 21–28, 31–38, 41–48, sut tishlari 51–85) API'da.
5. **Qabul:** registrator/shifokor rollarida brauzer sinovi: tish → xizmat → joriy rejaga qo'shish ≤3 bosish; «bajarilgan ish» → odontogrammada holat o'zgaradi va kassada reja qarzi ko'rinadi; tish tarixi rasmlar va bosqichlarni ko'rsatadi.

## FT-02 Rozilik soddalashtirish (CF-14) — M

- Imzolash oqimi: shablon tanlash (yoki «bo'sh shablon») → matn to'liq ko'rinadi (bemor tilida: `patients.preferred_language`, qo'lda almashtirish mumkin) → bemor F.I.Sh. (avto-to'ldirilgan) + **imzo** (canvas, planshet barmoq bilan; PNG `consent_forms.signature_object_key`, uploads adapteri) → «Imzolash».
- Tur/sarlavha/muddat «Qo'shimcha» bo'limida yig'ilgan; standart: tur — shablondan, muddatsiz.
- Shablonlar: Sozlamalar → «Rozilik shablonlari» (yaratish, tahrirlash, o'chirish/faolsizlantirish), 4 ta standart shablon seed (davolash, og'riqsizlantirish, foto, ma'lumotlarni qayta ishlash) uz/ru.
- Chop etish: A4 print (klinika nomi, sana, matn, imzo rasmi).
- Migratsiya: `consent_forms.signature_object_key text null`.

## FT-03 Shartnoma + pechat + imzo (CF-3b) — L

- `document_templates` (tenant_id, kind `contract|consent|other`, title, body_uz, body_ru, is_active) — FT-02 shablonlari shu jadvalga ko'chiriladi 🛠 (yoki `consent_templates`ga `kind` qo'shiladi — implementer kichigini tanlaydi va hujjatlaydi).
- O'zgaruvchilar: `{{patient.fullName}}`, `{{patient.birthDate}}`, `{{patient.phone}}`, `{{clinic.name}}`, `{{branch.address}}`, `{{date}}`, `{{plan.title}}`, `{{plan.total}}`, `{{doctor.fullName}}`. Server tomonda render, snapshot saqlanadi (`patient_documents`: body_text, signature_object_key, stamp_applied, signed_by_user_id, created_at).
- Klinika pechati: Sozlamalar → «Hujjatlar» — pechat PNG va rahbar imzosi PNG yuklash (`tenant_settings.stamp_object_key`, `director_signature_object_key`), `tenant_settings.edit`.
- Bemor kartasi → «Hujjatlar» tab: shablondan yaratish, imzolash (canvas), chop etish (pechat o'ng pastda, shaffof PNG).
- Permission: `document.view`, `document.create` (katalog + shablonlar + backfill).

## FT-04 Chegirma (CF-6, 7, 8) — M–L 💰

- Permission `discount.give` (D-1) — katalog, shablonlar (Tenant Admin, Branch Manager, Receptionist), backfill migratsiya; rol muharririda «Chegirma bera oladi» toggle sifatida ko'rinadi.
- Kassa POS: `discount > 0` faqat `discount.give` bilan (403 `discount.forbidden`); `tenant_settings.max_discount_percent` saqlanadi. Tranzaksiyaga `discount_percent numeric(5,2)`, `discount_reason text`, `discount_granted_by uuid` (migratsiya). Audit'ga chegirma summasi/foizi/sababi.
- Bemor: `patients.default_discount_percent numeric(5,2) null` (tahrir: `patient.edit` + `discount.give`); bemor kartasida belgi. POS'da bemor tanlanganda avtomatik qo'llanadi (kassir `discount.give` bilan o'zgartira oladi). Yangi reja bosqichi yaratilganda `cost = round(price × (1 − pct/100))`, `list_price` va `discount_percent` bosqichda saqlanadi (D-2, snapshot).
- Chek: «Chegirma (N%) — summa» qatori, sababi; bosqich chegirmasi smetada ko'rinadi.
- Fiskal: items netto (chegirma taqsimlangan) — `amount = Σ items` (LA fiskal low topilmasi).
- Testlar: real-DB — POS chegirma ruxsatsiz 403; doimiy chegirma bilan reja bosqichi → qarz netto; refund proporsional; payroll baza `paidAmount`.

## FT-05 Kalendar (CF-2a) — M–L

- Bo'sh katakka bosish → yangi yozilish (doktor, sana, vaqt oldindan to'ldirilgan) — day va week view.
- «Bo'sh slotlar» kartasidagi slot bosiladi → yangi yozilish.
- Grid soatlari filial ish vaqtidan (`branches` ish soatlari; min boshlanish − 1 soat, max tugash + 1 soat), tashqaridagi yozilishlar uchun ko'rinadigan «soatdan tashqari» belgi.
- Pointer events bilan drag (touch ham), pastki chetidan cho'zib davomiylikni o'zgartirish (15 daqiqa qadam), UndoToast saqlanadi. Week view'da ham drag.
- Zoom: 3 daraja (slot balandligi), `localStorage`da.
- Planshet (<1024px): o'ng panel drawer'ga, doktor ustunlari gorizontal scroll.

## FT-06 Kamera komponenti (CF-2b, CF-4) — M

- `packages/ui` `CameraCapture` (getUserMedia, oldingi/orqa kamera tanlash, suratga olish, qayta olish, fayl yuklash fallback).
- Electron: `session.setPermissionRequestHandler` — faqat ilova origin'i uchun `media` (video) ruxsat, qolgani rad.
- Bemor avatari: Bemor kartasi sarlavhasida avatar; «Rasm qo'yish» → kamera yoki fayl → `patient_images` (`type=face_photo`) + `patients.photo_url` yozish yo'li (`PATCH /patients/{id}/photo`, `patient.edit`).
- Kassa rasmi (D-4): `tenant_settings.cashier_photo_enabled` (standart false), `cashier_transaction_photos` (tenant_id, transaction_id, object_key, captured_by, captured_at, skipped_reason) + RLS; to'lovdan keyin avtomatik suratga olish (kamera ruxsat bermasa `skipped_reason`), ko'rish `cashier.photo.view` (owner, Tenant Admin), 90 kun retention (kunlik worker).

## FT-07 Bot: bemor o'z ma'lumotlari (CF-3a) — M

- Menyu: «📅 Mening yozilishlarim» (kelajakdagi, sana/vaqt/doktor/filial, bekor qilish tugmasi), «💳 Balans» (faqat summa: qarz/avans), «🦷 Davolash rejam» (reja nomi, bosqichlar nomi/holati, umumiy summa), «💊 Oxirgi retsept».
- Bir nechta bemor bog'langan bo'lsa (FX-42) — avval bemor tanlash.
- Har so'rov `audit_log`ga (`user_id=null`, `actor=telegram`), throttling (chat bo'yicha 20 so'rov/daqiqa), tenant sozlamasi `bot_self_service_enabled` (standart true).

## FT-08 PWA (CF-17) — L

- `vite-plugin-pwa`: manifest (standalone, ikonlar 192/512, theme rang tokenlardan), SW faqat statik assetlar (precache), API `NetworkOnly`. Yangi versiya — mavjud `UpdateBanner`.
- Responsive: bemorlar ro'yxati (karta ko'rinishi <768px), bemor kartasi tab'lari (scroll), kassa POS (bir ustun), kalendar (FT-05 planshet layout).
- Qabul: Chromium mobil emulyatsiyasida (Pixel 7, iPad) asosiy sahifalar skrinshotlari, Lighthouse PWA installable.

## FT-09 Rentgen watch-folder (CF-15, D-6) — M

- Desktop sozlamalari: «Rentgen papkasi» (yo'l), «Bemorni aniqlash» rejimi: fayl nomidagi bemor ID/telefon/karta raqami (regex) yoki «so'nggi ochilgan bemor».
- Electron main: `fs.watch` + barqarorlik kutish (hajm 2 s o'zgarmasa) → `POST /patient-images` (`type=xray_periapical` standart, tanlanadigan), muvaffaqiyatli bo'lsa `processed/` ga ko'chirish, xato — `failed/` + tray bildirishnomasi.
- API: `.dcm`ni kengaytma bo'yicha qabul qilish (MIME bo'sh bo'lsa).

## FT-10 AI yordamchi — Gemini Flash (CF-16, D-7) — M

- Per-tenant `integration_settings.gemini` (AES-256-GCM shifrlangan kalit, Qaror #38 naqshi), Sozlamalar → Integratsiyalar; standart o'chiq; desktop'da internet bo'lsa ishlaydi.
- `POST /ai/visit-note-draft` (`visit_note.create`): shifokorning erkin matni (yoki dictation matni) → tuzilgan qoralama (shikoyat, ko'rik, tashxis taklifi, bajarilgan ish, tavsiya) — foydalanuvchi tasdiqlamaguncha saqlanmaydi. PHI minimallashtirish: bemor ismi/telefoni yuborilmaydi; yosh va jins ixtiyoriy.
- Audit: har chaqiruv (token soni, model, `resource_id` vizit). Timeout 20 s, xatoda jim emas — toast.
- Model: `gemini-flash` (konfiguratsiyada), provider interfeysi `AiProvider` (`packages/core` yoki `apps/api/src/lib/ai`) — keyin boshqa provayder qo'shish mumkin.

## FT-11 Ulanish banneri (CF-19, D-5) — S

- Bulut: `ConnectionStatus` kengaytmasi — oflayn bo'lsa yuqorida doimiy banner «Internet yo'q — o'zgarishlar saqlanmaydi», mutatsiya tugmalari `disabled` (global `MutationCache` guard), qayta ulanganda so'rovlar refetch.
- Landing/hujjat: «Internet ishonchsiz bo'lsa — desktop versiya».

## FT-12 Desktop (CF-18)

Kodda: `DESKTOP-WINDOWS-BUILD-TEST.md`ga batch 1 (FX-06/07/09/51/52) va FT-06/FT-09 tekshiruv bandlari qo'shiladi. Code signing, `UPDATE_URL`, jismoniy sinov — foydalanuvchida.
