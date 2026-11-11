# Loyihani yakunlash — yo'l xaritasi (2026-11-11)

> **Manba:** foydalanuvchi bilan brainstorm (2026-11-11). Topilmalar: [`FINDINGS-REGISTER-2026-11-11.md`](../../FINDINGS-REGISTER-2026-11-11.md) · [`FEATURE-RESEARCH-2026-11-11.md`](../../FEATURE-RESEARCH-2026-11-11.md). UI: [`2026-11-11-ui-redesign-design.md`](./2026-11-11-ui-redesign-design.md). Ijro qoidalari: [`docs/ORCHESTRATION-GUIDE.md`](../../ORCHESTRATION-GUIDE.md).
>
> **Belgilar:** «👤» — foydalanuvchi qarori; «🛠» — builder (Claude) qarori, foydalanuvchi o'qib chiqib o'zgartirishi mumkin.

## 1. Maqsad va «tugadi» ta'rifi

Foydalanuvchi uchun **loyiha tugadi** degani (👤):

1. 18 ta ustuvor topilma (P1–P18) yopilgan — ular ilovaning ishlashiga bevosita xalaqit beradi;
2. 24 ekranli UI qayta dizayni (UI-0…UI-4) kodda qurilgan;
3. laboratoriya portali qurilgan (alohida loyiha, oxirida);
4. Supervisor va bulut (SaaS) yangi VPS + domen + TLS'ga ko'chirilgan.

**Nega:** loyiha juda cho'zildi. Ishni Claude bajaradi, foydalanuvchi qaror qabul qiladi va natijani ko'radi — shuning uchun hajm oylar emas, kunlar.

**Ikkala rejim ham mahsulot** (👤): Windows desktop **va** SaaS (bulut) mijozlarga beriladi.

**Joriy muhit** (👤, 2026-11-11): **hozir hech qanday real klinika yo'q** (desktop ham, bulut ham); Supervisor VM o'chirilgan. Bosqich 12 gacha **hamma ish lokal mashinada** bajariladi (lokal Postgres/Redis, lokal `supervisor-api`). Natijalari:
- mavjud ma'lumot uchun migratsiya/backfill **shart emas** (P17 MinIO→uploads ko'chirish yo'q, P10 eski filiallar, P6 eski rollar, P18 eski litsenziyalar 30→7) — kod va seed'ni to'g'rilash yetarli;
- §5 qoidasi baribir saqlanadi (kelajakdagi tenantlar uchun naqsh), lekin backfill migratsiyalar endi T3 xavf emas.

### Maqsad emas (non-goals)
- Reestrdagi P bo'lmagan ~70 topilmaning hammasini yopish. Ular faqat **UI ekrani o'sha topilmaga bog'liq bo'lsa**, o'sha ekran ishida tuzatiladi (👤). Qolganlari reestrda qoladi.
- Uchinchi tomon to'lov tizimlari (Click/Payme API) bilan integratsiya (👤).
- Kreslo (operatoriya) modeli (👤 — shifokor ko'chib yurmaydi).
- Bemor kartasi uchun usability testi (👤 — 4 bo'limli variant to'g'ridan-to'g'ri quriladi).
- AI scribe, ovozli kiritish, bemor mobil ilovasi (UI spec §5).

### Anti-goals (texnik ishlasa ham muvaffaqiyatsizlik)
- Yangi ruxsat kodi faqat rol shabloniga qo'shilib, **mavjud** tenantlarda ishlamay qolishi (shablon faqat yangi tenantlarga seed qilinadi — §5).
- Windows-only ishni Linux'da «yashil» deb **Done** belgilash (§6).
- `@owner` bilan sinab, cheklangan rolda 403 qolib ketishi.
- Spy-dep testlar bilan real cheklovni yashirish (P3 darsi).

## 2. Umumiy tartib

| # | Bosqich | Mazmun | Holat |
|---|---|---|---|
| 1 | **P — Yaxlitlik** | P1, P4 (P3 yopilgan — §3.1) | — |
| 2 | **P — Desktop reliz + litsenziya** | P2, P14, P15, P18 (+ Supervisor renew) | Windows tekshiruvi kerak |
| 3 | **P — Bulut** | P17 (+ P16 backup skripti) | — |
| 4 | **P — Xavfsizlik** | P5, P6, P7, P8 | — |
| 5 | **P — Oqimlar** | P9, P10, P11, P12, P13 | P11 avval brauzerda |
| 6 | **UI-0 Asos** | tokenlar, holat lug'ati, komponentlar, rolga moslashuvchi menyu | — |
| 7 | **UI-1 Registrator** | R1–R6 | — |
| 8 | **UI-2 Shifokor** | D1–D5 | — |
| 9 | **UI-3 Rahbar** | M1–M6 + desktop zaxira/tiklash | Windows tekshiruvi kerak |
| 10 | **UI-4 Tashqi** | T2 (Telegram bot), T3 (Desktop holatlari) | T3 Windows |
| 11 | **Lab portali** | UI-T1 + C varianti + D1 relay — **alohida brainstorm** | — |
| 12 | **Infra** | yangi VPS, domen, TLS; Supervisor + bulut ko'chirish (P16 qolgani) | — |

P bosqichlari 1→5 tartibda; ichida bir-biriga tegmaydigan ishlar parallel (orkestratsiya qo'llanmasi). Har bosqich: alohida reja (`writing-plans`) → alohida branch → merge oldidan **bir marta** to'liq tekshiruv → Claude o'zi `main`ga merge qilib push qiladi (👤).

## 3. P topilmalar — qarorlar va yechim

### 3.1 Yaxlitlik
- **P1** (C): `rlsMiddleware` — `await next()` dan keyin `c.error` bo'lsa **yoki** javob statusi ≥ 500 bo'lsa throw (rollback). 🛠 4xx (`fail()`) javoblar **commit qilinadi** — ular qasddan (validatsiya, audit/strike yozuvi bilan rad etish); har 4xx'ni rollback qilish shunday yo'llarni buzadi. Route'da yozib throw qiladigan **HTTP darajasidagi** regressiya testi (yozilish bazada qolmasligi tekshiriladi).
- **P3**: ✅ **yopilgan** — `592ed7a` (separator `-`, real `Job.validateOptions` testi). Reestrdagi «commit qilinmagan» yozuvi eskirgan; reestr yangilanadi.
- **P4**: Redis/BullMQ side-effect'lar (enqueue/remove) tranzaksiya commit'idan **keyin**, best-effort (try/catch + log). Status-only qayta faollashganda re-enqueue. 🛠 Outbox jadvali qilinmaydi — best-effort yetarli, eslatma yo'qolsa keyingi reschedule'da tiklanadi. Bitta **real-adapter** testi (Redis bilan).

### 3.2 Desktop reliz
- **P2**: har startda API'dan oldin idempotent `api.exe migrate`. 🛠 Kutilayotgan migratsiya bo'lsa — **oldin `pg_dump`** (zaxira papkasiga, §4.1 yadrosi shu bosqichda quriladi). Migratsiya yiqilsa: dump'dan baza tiklanadi, API ishga tushmaydi, tushunarli dialog («ta'minotchiga murojaat qiling»), qayta urinish yo'q. **Binary downgrade qilinmaydi** (NSIS/electron-updater'da ishonchsiz) — UI spec T3 dagi «rollback» shu ma'noda (baza tiklanadi, ilova eski versiyaga qaytmaydi) tushuniladi.
- **P14**: NSIS `${isUpdated}` bo'lsa dialog va `config.json` yozish o'tkaziladi; mavjud config merge qilinadi.
- **P15**: child process (postgres/valkey/api) chiqsa — backoff bilan restart (🛠 5 urinish, 1→30 s), tray holati va xabar. Windows'da graceful stop (`pg_ctl stop`, API `/shutdown`); `before-quit` `preventDefault` + await.

### 3.3 Litsenziya — P18 (👤 qarorlar)
- **Yagona mezon — `expiresAt`.** Internet bo'lishi shart emas; muddat tugaguncha dastur to'liq ishlaydi. Spec (`08-Desktop-Offline-Supervisor-Design.md` §4) kodga moslab yangilanadi: «oxirgi heartbeat'dan 30 kun» qoidasi **bekor**.
- **Imtiyozli muddat: 7 kun** (hozir 30 → 7).
- **Muddat + 7 kun tugagach — to'liq blok.** Barcha modullar, shu jumladan hozir gate'siz qolgan ombor/xarajat/payroll/schedule. Ekranda: «To'lov qilishingiz kerak, ta'minotchiga murojaat qiling».
  - 🛠 Blok paytida ochiq qoladiganlar: login, `bootstrap-status`, litsenziya holati, aktivatsiya, heartbeat (uzaytirish yetib kelishi uchun), to'lov ekrani.
- **Ogohlantirish bannerlari** (🛠): muddat tugashiga 14 kun qolganda «Litsenziya N kundan keyin tugaydi»; imtiyozli 7 kun davomida «To'lov kechikdi, N kundan keyin dastur to'xtaydi» (qizil, yopilmaydi).
- **Uzaytirish (renew):** Supervisor'da `PATCH /v1/admin/licenses/:id` (`expiresAt`) + admin panelda tugma + audit. Klinika internetga ulanganda yangi muddat heartbeat orqali o'zi yetib keladi (imzolangan, monotonik soat langari saqlanadi).
- 👤 **Uzaytirish faqat internet orqali** (heartbeat). Offline kod yo'q. 🛠 Blok ekranida «Qayta tekshirish» tugmasi heartbeat'ni darhol chaqiradi — to'lovdan keyin kutish shart emas.

> **Qamrov:** P18 bloki — **desktop** litsenziya mexanizmi. SaaS tenantlariga tegishli emas (SaaS obuna/blok — bu loyiha doirasidan tashqarida).

### 3.4 Bulut — P17 (+ P16 qismi)
- **P17**: `docker-compose.prod.yml`ga `uploads` volume + `UPLOADS_DIR`; `backup.sh` → `pg_dump` + lokal uploads arxivi; MinIO compose'dan olib tashlanadi; `MINIO_*` env olib tashlanadi.
- **P16 — hozir:** Supervisor uchun `pg_dump` cron skripti + RSA private key saqlash tartibi hujjati (serverga bog'liq emas). **P16 — oxirida (bosqich 12):** yangi VPS, domen, TLS (prod Caddyfile), off-host backup (👤).

### 3.5 Xavfsizlik
- **P5**: invite/addAssignment/updateAssignment — berilayotgan rol permission'lari chaqiruvchinikining qism-to'plami bo'lishi shart (owner istisno). Rol-bo'yicha test (Branch Manager o'ziga Tenant Admin bera olmaydi).
- **P6** (👤): parolni **faqat owner** tiklaydi, faqat **o'z klinikasiga a'zo** xodimning parolini. Natija — **vaqtinchalik parol**; shu parol bilan kirilganda faqat «yangi parol qo'yish» ekrani ochiladi (boshqa endpoint'lar 403). Har tiklash `audit_log`ga.
  - Admin va Branch Manager bu huquqni yo'qotadi.
  - ⚠️ **Qabul qilingan qoldiq xavf** (🛠, foydalanuvchiga aytildi): ko'p klinikali xodimda owner vaqtinchalik parol bilan xodimdan oldin kirib, parolni o'zgartirishi mumkin. Ikkinchi omilsiz yopilmaydi; xodim kira olmay qolishi darhol bilinadi va audit izi qoladi.
  - 🛠 Users jadvalida `mustChangePassword` (yoki shunga teng) bayroq + JWT'da cheklangan scope.
- **P7**: POS `items` rejimida `treatmentPlanId` rad etiladi; `patientId` DB'dan tekshiriladi.
- **P8**: Telegram `contact.user_id === ctx.from.id` talab qilinadi; mavjud `telegramChatId` jim ustiga yozilmaydi.

### 3.6 Foydalanuvchi oqimlari
- **P9**: NoOp kanal `{ok:false, reason:'not_configured'}` qaytaradi; recall `pending` qoladi, outcome `skipped_no_channel`.
- **P10** (🛠): yangi filialga default ish soati **Du–Sha 09:00–18:00** (provisioning va register). Filial formasida ish soati tahrirlanadi. Shifokor jadvali bo'sh bo'lsa yozilish oynasida «Ish soati sozlanmagan» xabari.
- **P11**: **birinchi qadam — real brauzerda tasdiqlash** (rasm yuklash → kartada 401?). Tasdiqlansa: blob-fetch (`api-client` + `URL.createObjectURL`); `/uploads`ga `patient_image.view` + audit.
- **P12**: update schema'lar default'siz quriladi (barcha `.partial()` joylari grep qilinadi); HTTP test (PATCH default bilan ustiga yozmaydi).
- **P13**: Accountant dashboard'da `type==='refund'` ayiriladi — `DailySummaryCard` bilan umumiy helper.

## 4. UI qayta dizayni — qarorlar

UI spec ([`2026-11-11-ui-redesign-design.md`](./2026-11-11-ui-redesign-design.md)) asosiy manba bo'lib qoladi; §4 dagi ochiq savollarga javoblar:

| # | Savol | Qaror |
|---|---|---|
| 1 | Shifokor navbatdan chaqiradimi? | 👤 **Ikkalasi ham.** Registrator hammani chaqiradi; 🛠 shifokor **faqat o'ziga yozilgan** bemorni chaqiradi — tor endpoint (yangi permission emas, §5) |
| 2 | Kreslo modeli | 👤 **Yo'q.** Kalendar faqat shifokorlar bo'yicha; «Kreslolar» ko'rinishi kanvasdan olib tashlanadi |
| 3 | Lab ko'radigan bemor ma'lumoti | → lab portali brainstormiga |
| 4 | Zaxira nusxa | 👤 **Diskdagi papka** + 👤 **tiklash UI orqali** — pastda |
| 5 | QR to'lov | 👤 `card` usuli ichida **sub-tur**: Terminal / Click / Payme / Boshqa. Integratsiya yo'q. Hisobot karta jami + sub-tur bo'yicha |
| 6 | Bemor kartasi 4 bo'lim | 👤 **4 bo'lim quriladi**, usability testisiz |

**Ekranga bog'liq kichik topilmalar** (SC-, PT-, CL-, IR-, ID-, MO-) o'sha ekran rejasida tuzatiladi (👤). UI spec §2 va reestr §12 «Oldin bajarilishi shart» ustuni ro'yxatni beradi.

**UI-D5 (lab buyurtma)**: `lab_orders`ga muddat (due), rang (shade), fayllar, qayta ishlash (remake) — klinika ichida muddat nazorati hozirdan ishlaydi (🛠). **`labs` jadvali / `lab_id` hozir qurilmaydi** — lab modeli portal brainstormida hal qilinadi (B poydevorini oldindan qotirib qo'ymaslik uchun). Eski qatorlarda `due`/`shade` nullable; yangi buyurtmada majburiy (forma va create schema darajasida).

**UI-T2 / UI-R1 (Telegram) desktop'da** (🛠): bot outbound long-polling bilan ishlaydi, shuning uchun desktop'da ham ishlaydi. Anketa va bron so'rovi **bot ichidagi suhbat** sifatida quriladi — bemor uchun ochiq web sahifa (public URL) qurilmaydi; ikkala rejimda bir xil.

### 4.1 Desktop zaxira va tiklash (UI-3 bilan birga, yangi funksiya)
- 👤 Zaxira diskdagi papkaga. 🛠 Papka Sozlamalar'da tanlanadi (boshqa disk/USB/tarmoq papkasi ham), default `D:\DentalBackup` (D: yo'q bo'lsa `C:\DentalBackup`).
- 🛠 Har kuni 20:00 avtomatik + «Hozir zaxira olish» tugmasi. Tarkib: `pg_dump` + uploads. Oxirgi 14 nusxa saqlanadi.
- 🛠 Rahbar bosh sahifasida «Oxirgi zaxira» holati; 2 kundan ortiq zaxira bo'lmasa ogohlantirish (AlertTier).
- 👤 **Tiklash UI orqali.** 🛠 Faqat owner; `CriticalActionDialog`da klinika nomini qo'lda yozish; tiklashdan oldin joriy holat avtomatik zaxiraga olinadi; tiklash paytida klientlar «Texnik ish» ekranini ko'radi.
- **Qamrov: faqat desktop.** SaaS'da bitta umumiy baza — tenant uchun «tiklash» tugmasi bo'lmaydi; SaaS backup = P17 `backup.sh` (operator darajasida).

## 5. Ruxsatlar qoidasi (har bosqichga)

Rol shablonlari faqat **yangi** tenantlarga seed qilinadi. Shuning uchun har yangi ruxsat ehtiyoji uchun:
1. avval **tor endpoint** naqshi (CLI-153/154/155 precedenti — mavjud ruxsat bilan ishlaydigan, rolga mos endpoint), yoki
2. yangi permission kodi bo'lsa — **backfill migratsiya** mavjud tenantlarning tegishli rollariga.

Tekshiruv har doim **real cheklangan rol** bilan, `@owner` emas.

## 6. Windows-only ishlar — alohida holat

Quyidagilar Linux'da tekshirib bo'lmaydi: **P2, P14, P15, P18 desktop UI, zaxira/tiklash, UI-T3**. Ularning holati: **«kod tayyor, Windows'da tekshirilmagan»** — Done EMAS. Har biri uchun qo'lda tekshiruv ro'yxati `docs/DESKTOP-WINDOWS-BUILD-TEST.md`ga qo'shiladi; foydalanuvchi jismoniy PC'da o'tkazgach Done bo'ladi.

## 7. Qaror jurnali

Yangi qarorlar (P18 grace/blok, P6 owner+vaqtinchalik parol, karta sub-turi, kreslo yo'q, zaxira/tiklash, lab portali oxirida, orkestratsiya qoidalari) Obsidian `01-Qarorlar.md` va `CLAUDE.md`ga yoziladi (loyiha qoidasi §10). 🛠 Raqamlar #44 dan boshlanadi.

## 8. Ochiq savollar

1. ~~**P18 — internetsiz klinikaga uzaytirish**~~ → 👤 **(a) faqat heartbeat**: uzaytirish olish uchun internet shart; offline uzaytirish kodi qurilmaydi. Blok ekranida «Internetga ulaning va ta'minotchiga murojaat qiling» + «Qayta tekshirish» tugmasi (heartbeat'ni darhol chaqiradi).

Builder check (2026-11-11) savollari: #1 shu yerda; #2 (real klinikalar) — §1 «Joriy muhit»; #3 P2 rollback, #4 Telegram desktop'da, #5 lab modeli, #6 P1 4xx — 🛠 qarorlar §3.1, §3.2, §4.

## 9. Builder'ga qoldirilgan

- Har bosqich ichida vazifalarni bo'lish, lane'lar va model/effort darajalari — orkestratsiya qo'llanmasi bo'yicha.
- Kanvasdan kod tafsilotlari — UI spec bo'yicha.
- Test fayllari tanlovi — reja yozilganda har vazifaga aniq nomlanadi.
