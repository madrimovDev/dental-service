# Klinikadan tashqaridagi texnik — lab-buyurtmalarga kirish (2026-11-11)

> **Savol:** Tish texnigi klinika xodimi emas, tashqarida (o'z laboratoriyasida) ishlaydi va bir nechta klinika bilan hamkorlik qiladi. U buyurtmalarni ko'ra oladimi? Ko'ra olmasa, qanday yechimlar bor?
>
> **Usul:** kod o'qildi (role-templates, `lab_orders` sxemasi, lab-orders modul, auth/workspace). Kod o'zgartirilmadi. Bog'liq: [`FEATURE-RESEARCH-2026-11-11.md`](./FEATURE-RESEARCH-2026-11-11.md) (4.4 Klinik, P8).

---

## 1. Hozirgi holat — koddan

### 1.1 Model qanday qurilgan
- **`lab_orders`** (`packages/db-schema/src/tables/lab-orders.ts`): `tenantId`, `patientId`, `doctorId`, **`labName: text`** (erkin matn), `orderType`, `status` (`draft→sent→in_progress→ready→delivered`, `cancelled`), `items` (tish, material, rang), sanalar, `cost`, `notes`.
  - Laboratoriya **alohida obyekt emas**: `labs` jadvali yo'q, buyurtma texnik foydalanuvchiga bog'lanmaydi, `branchId` ham yo'q.
  - Buyurtmaga fayl (skan, rasm, STL) biriktirib bo'lmaydi.
- **Technician rol shabloni** (`packages/core/src/role-templates.ts:281-291`): `tenant.view`, `branch.view`, **`patient.view`**, `lab_order.view`, `lab_order.manage`.
- **API** (`lab-orders.routes.ts`):
  - `GET /lab-orders` faqat `patientId`/`status` bo'yicha filtrlaydi — **tenantdagi barcha laboratoriyalarning barcha buyurtmalari** ko'rinadi;
  - `lab_order.manage` bilan texnik buyurtma **yarata** oladi, `cost`, `items`, `labName`ni o'zgartira oladi va istalgan ruxsat etilgan status o'tishini bajaradi.
- **Foydalanuvchi platform darajasida** (CLAUDE.md §3.1): bitta texnik bir nechta klinikada `user_assignments` orqali a'zo bo'lishi mumkin. Lekin JWT bitta faol tenant uchun beriladi, shuning uchun klinikalar o'rtasida **workspace almashtirish** kerak.

### 1.2 Javob: ko'ra oladimi?

| Rejim | Ko'ra oladimi | Shart / cheklov |
|---|---|---|
| **Online (SaaS)** | **Ha, kod o'zgarmasdan** | Har klinika texnikni telefoni bo'yicha *Technician* roli bilan taklif qiladi → texnik login qiladi → klinikani tanlaydi → `/lab` ekrani |
| **Offline (Desktop)** | **Yo'q** | Klinika serveri faqat LAN'da (`192.168.x`, port 80). Tashqaridan kirish yo'li yo'q, internetga hech narsa chiqarilmaydi |

### 1.3 SaaS'dagi «ishlaydi»ning muammolari

| # | Muammo | Joy | Ta'siri |
|---|---|---|---|
| T1 | Texnik **boshqa laboratoriyalarning** buyurtmalarini ham ko'radi | `lab-orders.service.ts:27-30` (lab filtri yo'q) | raqobatchi lab narx va hajmlarni ko'radi |
| T2 | Texnik klinikaning **butun bemor ro'yxatini** ko'radi (`patient.view`: ism, tug'ilgan sana, balans, no-show; telefon/pasport maskalangan) | role-template:287 | tibbiy maxfiylik — tashqi shaxsga ortiqcha PHI |
| T3 | Texnik buyurtma **yarata** va **narxini o'zgartira** oladi | `lab_order.manage` = create + update | biznes nazorati yo'q |
| T4 | Status o'tishlari rolga bog'lanmagan: texnik `delivered` qilishi mumkin, klinika `in_progress` qilishi mumkin | `lab-orders.transitions.ts:16` | stage↔lab gate (CLI-487) texnik qo'lida ochiladi |
| T5 | **Ko'p klinika = ko'p workspace.** «Barcha buyurtmalarim» yagona ro'yxati yo'q, har klinikaga alohida kirish kerak | JWT `active_tenant_id` | kuniga 5–10 klinika bilan ishlaydigan texnik uchun noqulay |
| T6 | **Fayllar yo'q.** Texnikka zarur skan, rasm va tish rangi fotosi `patient_images`da, texnikda `patient_image.view` yo'q; buyurtmaga fayl biriktirish ham yo'q | — | texnik ishlay olmaydi yoki fayllar WhatsApp/Telegram orqali yuboriladi |
| T7 | **Xabarnoma yo'q.** Yangi buyurtma, muddat o'zgarishi yoki bekor qilish texnikka bildirilmaydi | — | texnik ekranni qo'lda kuzatadi |
| T8 | Technician tenant ichidagi oddiy xodim sifatida ko'riladi (Sozlamalar ekrani `tenant.view` bilan ochiladi va hokazo) | FEATURE-RESEARCH §2.3 | ortiqcha yuza |
| T9 | Texnik o'z laboratoriyasining ichki ishini (texniklar o'rtasida taqsimlash, lab hisob-kitobi) yurita olmaydi | — | lab uchun mahsulot qiymati past |

---

## 2. Yechim variantlari

Har variant ikki narsaga qarab baholangan: ikki rejimda (SaaS/Desktop) ishlaydimi va loyiha qoidalariga mosmi. Asosiy qoida — **bemor tenantlar orasida ulanmaydi** (CLAUDE.md §3.2, §7).

### A. Mavjud imkoniyat — texnikni har klinikaga *Technician* sifatida taklif qilish
- **Nima:** kod o'zgarmaydi. Har klinika texnikni taklif qiladi.
- **Ishlaydi:** faqat SaaS.
- **Muammolar:** T1–T9 hammasi saqlanadi. Desktop'da umuman ishlamaydi.
- **Baho:** vaqtinchalik, kichik ishonchli hamkor uchun. Tavsiya qilinmaydi, chunki T1/T2 maxfiylikni buzadi.

### B. Klinika ichida «Laboratoriya» obyekti + texnikni shu labga bog'lash (tenant ichida)
- **Nima:**
  - tenant-scoped `labs` jadvali (nom, kontakt) va `lab_orders.lab_id` (`labName` o'rniga, eski qatorlar migratsiya qilinadi);
  - `lab_members(lab_id, user_id)` yoki `user_assignments`ga `lab_id`;
  - yangi permission `lab_order.view_assigned` — ro'yxat va detal faqat o'z labi buyurtmalarini ko'rsatadi.
- **Tor DTO** (FEATURE-RESEARCH'dagi «rolga mos tor endpoint» naqshi, CLI-153/154): texnikka bemorning faqat zarur maydonlari (masalan ism-familiya bosh harflari yoki karta raqami, yosh, jins) ko'rsatiladi. Technician shablonidan `patient.view` **olib tashlanadi**.
- **Rolga bog'langan o'tishlar:**
  - lab tomoni: `sent→in_progress→ready`;
  - klinika tomoni: `draft→sent`, `ready→delivered`, `cancelled`;
  - `cost`ni faqat klinika o'zgartiradi (yoki lab taklif qiladi, klinika tasdiqlaydi).
- **Fayllar:** buyurtmaga fayl biriktirish (`lab_order_files`, mavjud storage adapteri bilan), texnik faqat o'z buyurtmasi fayllarini ko'radi.
- **Xabarnoma:** in-app (mavjud `notifications`) va Telegram.
- **Ishlaydi:** SaaS'da to'liq. Desktop'da faqat texnik klinika LAN'ida bo'lsa.
- **Yopadi:** T1, T2, T3, T4, T6, T7, T8. **Yopmaydi:** T5 (ko'p workspace) va desktop'dagi tashqi kirish.
- **Baho:** har qanday variantning **poydevori** — C va D ham shu ma'lumot modeliga tayanadi. Hajmi o'rtacha (1 migratsiya, 2–3 endpoint, ekran).

### C. «Laboratoriya portali» — laboratoriya o'z tenanti, klinikalar unga buyurtma *yuboradi*
- **Nima:**
  - laboratoriya platformada o'zining **lab-tenanti** (`vertical: 'lab'`) sifatida ro'yxatdan o'tadi, texniklari shu tenantda;
  - klinika buyurtmani «yuborganda» lab-tenantda **ish (case)** yaratiladi;
  - ish **bemor yozuvi emas**: unda minimallashtirilgan ma'lumot (case kodi, bemor bosh harflari yoki klinika belgilagan identifikator, tishlar, material, rang, fayllar, muddat) bo'ladi.
- **Holat oqimi:** status ikki tomonlama sinxronlanadi. Lab `ready` deydi → klinika buyurtmasi `ready` bo'ladi → klinika `delivered` deydi.
- **Texnik ko'radi:** bitta lab-tenant ichida **barcha klinikalardan kelgan ishlar** bitta ro'yxatda. T5 tabiiy yopiladi va workspace almashtirish kerak bo'lmaydi.
- **Qoidalarga mosligi:**
  - Bemor tenantlar orasida ulanmaydi: lab hech qachon `patients` qatorini ko'rmaydi, faqat klinika ataylab yuborgan «ish» nusxasini oladi. §3.2 buzilmaydi.
  - Cross-tenant so'rov yo'q: har tenant faqat o'z qatorlarini RLS bilan ko'radi; yuborish servis darajasida «ikki tenantli yozuv» bo'ladi (alohida service account, §3.4 shuni nazarda tutadi).
- **Biznes qiymati:** lab ichki ishni yuritadi (texniklarga taqsimlash, lab hisobi, klinikalar bo'yicha hisob-kitob) — T9 yopiladi. Bu laboratoriyalarni ham mijoz qiladi (yangi tarif segmenti).
- **Ishlaydi:** SaaS klinikalari uchun to'g'ridan-to'g'ri. Desktop klinikalari uchun **D bilan birga**.
- **Baho:** strategik to'g'ri yo'l. Hajmi katta: yangi vertikal, ish-almashinuv servisi, ikki tomonlama status, lab UI.

### D. Desktop uchun: chiquvchi (outbound) relay orqali
Desktop serveri tashqaridan ochilmaydi va **ochilmasligi kerak**. Faqat chiquvchi ulanish ishlatiladigan yo'llar:

| Variant | Qanday | + | − |
|---|---|---|---|
| **D1. Markaziy relay** (Supervisor yonida yoki C portali) | Desktop API buyurtmani yuborilgan paytda relay'ga **push** qiladi; status yangilanishlarini heartbeat kabi **poll** qiladi (masalan har 1–5 daqiqada) | NAT/firewall muammosi yo'q, kirish porti ochilmaydi; C bilan bir xil lab UI; offline'da navbatga qo'yiladi, internet qaytganda ketadi | relay — PHI'ni vaqtincha ushlab turadigan yangi bulut komponenti (TLS shart — P16; shifrlash, saqlash muddati) |
| **D2. Telegram (mavjud per-tenant bot)** | Buyurtma `sent` bo'lganda bot texnik chatiga xulosa yuboradi va «Ishda / Tayyor» tugmalarini beradi; tugma statusni yangilaydi | deyarli tayyor infratuzilma (Qaror #38, in-process Telegraf, outbound long-polling); MVP uchun eng tez | ⚠️ **P8 avval tuzatilishi shart** (kontakt egaligi); ko'p klinika = ko'p bot chati; fayllar Telegram'da qoladi (maxfiylik); to'liq ish ekrani emas |
| **D3. Bir martalik imzolangan havola** (magic link) | Har buyurtmaga muddatli, faqat-o'qish (+ status tugmasi) havola | akkaunt kerak emas | desktop serveri baribir tashqaridan ochilishi kerak → **D1 relay'siz ishlamaydi** |
| **D4. VPN/tunnel** (Tailscale, Cloudflare Tunnel) | Klinika serverini tashqariga ochish | kod kerak emas | butun ilova (bemorlar, kassa) internetga chiqadi, xavfsizlik va qo'llab-quvvatlash og'ir. **Tavsiya qilinmaydi** |

---

## 3. Tavsiya — bosqichma-bosqich

| Bosqich | Nima | Kimga | Hajmi |
|---|---|---|---|
| **0. Hozir** | SaaS'da kerak bo'lsa A, lekin **avval** Technician shablonidan `patient.view` olib tashlansin va lab ekrani nomlarni tor endpoint'dan olsin (T2) | SaaS | kichik |
| **1. Poydevor** | **B**: `labs` + `lab_id` + texnik↔lab bog'lanishi, `view_assigned`, tor DTO, rolga bog'langan o'tishlar, fayl biriktirish, in-app xabarnoma | ikkala rejim | o'rta |
| **1b. Desktop MVP** | **D2** Telegram xabarnoma va status tugmalari (P8 tuzatilgandan keyin) | Desktop | kichik-o'rta |
| **2. Strategik** | **C** lab portali + **D1** relay; texnik barcha klinikalar ishlarini bitta joyda ko'radi | ikkala rejim | katta |

**Nega shu tartib:** B'siz C ham, D ham noto'g'ri modelga quriladi (`labName` erkin matn, texnik hamma narsani ko'radi). B o'z-o'zidan T1–T4 va T6–T8 ni yopadi. D2 desktop klinikalarga eng arzon yo'l. C/D1 esa «bitta texnik — ko'p klinika» talabini to'liq hal qiladi va biznesni laboratoriyalarga kengaytiradi.

---

## 4. Ochiq savollar (yo'nalishni belgilaydi)

> ✅ **QAROR (2026-11-11, foydalanuvchi):** laboratoriya — **ko'p texnikli biznes**. **C varianti (laboratoriya portali) tanlandi** va rejalashtiriladi; desktop klinikalar uchun D1 (outbound relay) shu doirada. Dizayn hujjati: `docs/superpowers/specs/2026-11-11-lab-portal-design.md` (brainstorm jarayonida yoziladi).

1. ~~**Texnik kim?**~~ → laboratoriya-biznes, ko'p texnik (yuqoridagi qaror).
2. **Klinikalar asosan qaysi rejimda?** Ko'pchilik desktop bo'lsa, D1/D2 birinchi navbatda kerak.
3. ✅ **QAROR (2026-11-12): to'liq ism** (+ case kodi, tishlar, rang, fayllar; bemor kartasi/telefon/manzil emas). ~~**Texnik bemorning nimasini ko'rishi kerak?** To'liq ism, faqat bosh harflar yoki faqat klinika bergan karta raqami? Yosh, jins, tish rangi fotosi, yuz rasmi (estetik ishlar uchun)?~~
4. ✅ **QAROR (2026-11-12): lab taklif qiladi, klinika tasdiqlaydi**; tasdiqlangan narx klinika `expenses`ga avtomatik tushadi. ~~**Narx kimda?** Lab narx taklif qiladi va klinika tasdiqlaydimi, yoki klinika belgilaydimi? Lab xarajati klinika `expenses`ga avtomatik tushsinmi?~~
5. ✅ **QAROR (2026-11-12):** ma'lumot VPS'ga chiqadi (relay/portal bulutda), **qattiq shifrlangan**: TLS + saqlashda shifrlash (fayllar ham), joylashuv muhim emas. E2E (server o'qiy olmaydigan) shifrlash tanlanmadi — C variantining server tomonidagi lab UI'si bilan mos emas. ~~**Relay/portal ma'lumot saqlashi** — PHI klinikadan tashqarida (bulutda) saqlanishiga klinikalar va qonun (O'zbekiston shaxsiy ma'lumotlar qonuni, mahalliylashtirish talabi) ruxsat beradimi?~~

## 5. Bu tadqiqotda qo'shimcha aniqlangan nuqsonlar
- Technician `lab_order.manage` bilan **buyurtma yaratadi** va istalgan `doctorId`ni tanlaydi (`lab-orders.service.ts:102` faqat user mavjudligini tekshiradi).
- `lab_orders`da `branchId` yo'q, shuning uchun lab buyurtmalarini filial bo'yicha ajratib bo'lmaydi (multi-branch klinikada).
- `GET /lab-orders/overdue` pagination'siz (FEATURE-RESEARCH 4.4).
