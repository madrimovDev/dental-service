# Aktivatsiya provisioning — dizayn

**Sana:** 2026-08-03
**Holat:** tasdiqlangan (foydalanuvchi ko'rigidan o'tdi)
**Kontekst:** Windows'dagi qo'lda test — aktivatsiyadan keyin klinikaning login/parol
ma'lumotlari yaratilmaydi.

## 1. Muammo

Hozirgi holat (kod bo'yicha tasdiqlangan):

- `apps/supervisor-api/src/db/schema.ts` — `clinics` jadvalida faqat
  `name`, `contact_email`, `contact_phone`. Owner (login/parol) maydonlari **yo'q**.
- `apps/supervisor-api/src/modules/clinics/clinics.routes.ts:140` — filial nomi
  `'Main'` deb hardcode qilingan.
- `apps/api/src/routes/activate.ts:31` — Supervisor javobini olib **faqat `.lic`
  faylga yozadi**. Lokal bazaga hech narsa yozilmaydi.
- `apps/web/.../activate.page.tsx:71` — muvaffaqiyatdan so'ng `/login`ga
  yo'naltiradi, lekin lokal bazada tenant ham, foydalanuvchi ham yo'q.

Natijada yagona ishlaydigan yo'l — mijozning o'zi public `/register-tenant`
sahifasidan tenant yaratishi. Bu vendor-boshqaruvidagi provisioning modeliga zid
va "qisman yaratilgan" holatning manbai.

**Kerakli oqim:** Supervisor mijoz uchun barcha birlamchi ma'lumotlarni yaratadi;
aktivatsiya paytida ular klinikaning lokal bazasiga ko'chiriladi; login/parol ham
Supervisor'dan keladi.

## 2. Qabul qilingan qarorlar

| # | Qaror | Tanlov |
|---|---|---|
| 1 | Parol manbai | Supervisor tasodifiy vaqtinchalik parol generatsiya qiladi |
| 2 | Ma'lumot hajmi | Minimal: tenant + owner + bitta filial + 8 rol shabloni |
| 3 | `/register-tenant` | Litsenziya rejimida butunlay yopiladi |
| 4 | Takroriy aktivatsiya | Provisioning sokin o'tkaziladi, `.lic` yangilanadi |
| 5 | Majburiy parol almashish | Yo'q — ixtiyoriy (mavjud profil `changePassword`) |
| 6 | Telefon normalizatsiyasi | Global (login + register + taklif + provisioning) |
| 7 | Vaqtinchalik parolni saqlash | Aktivatsiyagacha, keyin `NULL` |
| 8 | Transport | Alohida imzolangan `provisioning` bloki, `.lic`ga yozilmaydi |

## 3. Kritik texnik topilma — imzo canonicalization

`packages/core/src/license-signature.ts` va `apps/supervisor-api/src/lib/rsa.ts`:

```js
const canonicalize = (data) => JSON.stringify(data, Object.keys(data).sort());
```

Ikkinchi argument — **replacer massivi**, va u `JSON.stringify` tomonidan
**barcha ichma-ich (nested) darajalarga** qo'llanadi. Nested obyektning kalitlari
top-level ro'yxatda bo'lmagani uchun butunlay tushib qoladi. Empirik tekshiruv:

```
A: {"licenseKey":"K","modules":["patients","queue"],"provisioning":{}}
B: {"licenseKey":"K","modules":["patients","queue"],"provisioning":{}}
canonicalize(A) === canonicalize(B)  →  true
```

`A` va `B`ning `provisioning` tarkibi butunlay boshqacha bo'lsa ham imzo bir xil.
Ya'ni **nested obyekt imzo bilan himoyalanmaydi** — MITM uni erkin almashtira
oladi. VM hozir IP/HTTP orqali ishlaydi, shuning uchun bu nazariy risk emas.

**Qoida (hujjatlashtiriladi + kodda majburlanadi):** imzolanadigan har qanday
obyekt **tekis (flat)** bo'lishi shart — faqat string / number / boolean va
string massivlari (massiv elementlariga replacer qo'llanmaydi, shuning uchun
mavjud `modules: string[]` xavfsiz).

Majburlash ikki qatlamda:

1. **`canonicalize` o'zi qattiqlashtiriladi** (ikkala faylda ham): massiv
   bo'lmagan obyekt qiymati uchraganda `throw`. Tekis payload'lar uchun natija
   bayt-ma-bayt bir xil qoladi → mavjud `.lic` fayllari va imzolar buzilmaydi.
   Bu men o'ylab topmagan payload shakllarini ham himoya qiladi.
2. **Regressiya testi** (§9) — nested obyekt bilan imzolashga urinish xato
   berishini tasdiqlaydi.

## 4. Oqim

### 4.1 Vendor tomoni

1. Operator "Yangi klinika" formasini to'ldiradi: klinika nomi, aloqa, tarif,
   muddat + owner F.I.Sh., owner telefoni, til, filial nomi/manzili/telefoni.
2. Supervisor 12+ belgili tasodifiy parol generatsiya qiladi (`apps/api`ning
   `password` siyosatiga mos: `min(12).max(128)`).
3. Javobda litsenziya kaliti + owner login (telefon) + vaqtinchalik parol
   ko'rsatiladi; klinika aktivatsiya qilmaguncha panelda qayta ko'rish mumkin.

### 4.2 Mijoz tomoni

1. Desktop `.lic` topmasa brauzerni `/activate`ga ochadi (mavjud xulq).
2. Mijoz litsenziya kalitini kiritadi → `POST /api/activate`.
3. `apps/api` → Supervisor `POST /v1/activate` (licenseKey + fingerprint).
   Javob: litsenziya payload + imzo **+ `provisioning` bloki + `provisioningSignature`**.
4. `apps/api` litsenziya imzosini (mavjud) va provisioning imzosini tekshiradi.
5. Lokal `tenants` jadvalida qator bo'lmasa — bitta tranzaksiyada tenant + owner
   + filial + 8 rol shabloni yaratiladi. Qator bo'lsa — sokin o'tkazib yuboriladi.
6. `.lic` fayl yoziladi — **provisioning bloki fayldan chiqarib tashlanadi**.
7. `apps/api` → Supervisor `POST /v1/provisioned` (licenseKey + fingerprint):
   `owner_temp_password = NULL`, `licenses.provisioned_at` set, `license_events`ga
   `'provisioned'` yoziladi. So'rov yetib bormasa — aktivatsiya baribir
   muvaffaqiyatli hisoblanadi.
8. `/activate` sahifasi muvaffaqiyat xabarida login telefonini ko'rsatib
   `/login`ga yo'naltiradi.

**Tartib muhim:** `.lic` yozish provisioning'dan **keyin** — fayl yozishda uzilish
bo'lsa foydalanuvchi qayta urinishi mumkin. Provisioning imzosi noto'g'ri bo'lsa
`.lic` umuman yozilmaydi.

## 5. Ma'lumot modeli

### 5.1 Supervisor (`apps/supervisor-api/src/db/schema.ts`)

`clinics` — yangi ustunlar:

| Ustun | Tip | Izoh |
|---|---|---|
| `owner_full_name` | `text NOT NULL` | Owner F.I.Sh. |
| `owner_phone` | `text NOT NULL` | Login identifikatori, normallashtirilgan |
| `owner_temp_password` | `text NULL` | Aktivatsiyadan keyin `NULL` |
| `default_language` | `text NOT NULL DEFAULT 'uz'` | `'uz' \| 'ru'` |

`branches` — sxema o'zgarmaydi; `name/address/phone` endi formadan to'ldiriladi
(`'Main'` hardcode olib tashlanadi).

`licenses` — yangi `provisioned_at timestamp NULL`.

`license_events.event` — yangi qiymat `'provisioned'`.

> Mavjud qatorlar uchun migratsiya: `owner_full_name`/`owner_phone` `NOT NULL`
> bo'lgani uchun avval nullable qo'shiladi, mavjud qatorlarga placeholder
> (`contact_phone` yoki `''`) yoziladi, so'ng `NOT NULL` qo'yiladi. Vendor
> bazasida hozir bir nechta test klinikasi bor — ma'lumot yo'qolmaydi.

### 5.2 Provisioning bloki (tekis, faqat string)

```
{
  licenseKey, clinicId, issuedAt,
  tenantName, defaultLanguage,
  ownerFullName, ownerPhone, ownerPassword,
  branchName, branchAddress, branchPhone
}
```

- Ichma-ich obyekt **yo'q** (§3).
- Bo'sh maydonlar (`branchAddress`, `branchPhone`) doim `''` — hech qachon
  `undefined`, aks holda `JSON.stringify` kalitni tashlab imzo mos kelmaydi.
- `issuedAt` — ISO string, javob generatsiya vaqti; litsenziya payload'idagi
  `issuedAt` bilan **bir xil** bo'lishi shart (bog'lash uchun, §6.2).
- Imzo: `signLicense(provisioning, PRIVATE_KEY)` → javobda `provisioningSignature`.
- `ownerPassword` **hech qachon loglanmaydi** — na `apps/api`, na Supervisor
  tomonda, na audit `after` maydonida. (Mavjud precedent: `users.service.ts:104`
  xodim taklifida vaqtinchalik parolni `logger.warn` bilan yozadi — bu alohida
  masala, shu spec scope'ida emas, lekin naqsh takrorlanmasligi kerak.)

## 6. `apps/api` o'zgarishlari

### 6.1 Provisioning funksiyasi

`auth.service.ts:148` `registerTenant` ichidagi mantiq umumiy
`provisionTenantInTx(tx, input)` funksiyasiga ajratiladi:
user → tenant → RLS `set_config('app.current_tenant_id')` → filial →
`seedSystemRolesInTx` → audit.

`registerTenant` ham, yangi `provisionFromLicense` ham shuni chaqiradi. Sabab:
rol shablonlari seed'ini chetlab o'tish loyihada uch marta takrorlangan xato
sinfi (`project_rbac_role_gaps`, oxirgisi — M5 clinical permissions).

Farqlar: filial nomi payload'dan (`'Bosh filial'` fallback), audit `action:
'tenant.provisioned'`, audit `after` ichida parol **yo'q**.

### 6.2 `routes/activate.ts`

```
Supervisor javobi
  → litsenziya imzosi tekshiruvi (mavjud)
  → provisioning bloki bormi?
      yo'q  → eski xulq (orqaga moslik)
      bor   → provisioningSignature tekshiruvi (xato → 403, .lic yozilmaydi)
            → BOG'LASH tekshiruvi (xato → 403, .lic yozilmaydi)
  → lokal tenant bormi?
      bor   → provisioning sokin o'tkaziladi
      yo'q  → provisionFromLicense (bitta tranzaksiya)
  → writeLicense (provisioning bloki chiqarib tashlanadi)
  → Supervisor POST /v1/provisioned (best-effort)
  → 200 { modules, expiresAt, ownerPhone }
```

`ownerPhone` javobga qo'shiladi — `/activate` sahifasi loginni ko'rsatishi uchun
(parol emas: mijoz uni vendordan alohida oladi).

**Bog'lash tekshiruvi (imzo yetarli EMAS).** Faqat imzoni tekshirish har qanday
haqiqiy vendor-imzolangan blokni qabul qiladi — boshqa klinikaning javobidan
olingan blok ham. IP/HTTP transportda bu real hujum: A klinikasi aktivatsiya
qilayotganda B klinikasining bloki almashtirilsa imzo baribir to'g'ri chiqadi.
Shuning uchun quyidagilar **majburiy** va biror biri mos kelmasa 403 + `.lic`
yozilmaydi:

- `provisioning.licenseKey` === foydalanuvchi kiritgan kalit **va** ===
  `licensePayload.licenseKey`
- `provisioning.clinicId` === `licensePayload.clinicId`
- `provisioning.issuedAt` === `licensePayload.issuedAt`

Bu — CLI-476'da topilgan "o'lik fingerprint bog'lash" xatosi bilan bir sinfdagi
muammo.

**`.lic`ga aynan nima yoziladi.** `isLicenseValid` (`lib/license.ts`)
`const { signature, ...payload }` qiladi — ya'ni faylga tushgan **har qanday
qo'shimcha maydon** imzo tekshiruviga kiradi va uni buzadi. Shuning uchun
`writeLicense()`ga Supervisor javobi butunligicha uzatilmaydi; faqat
`LicenseData` maydonlari aniq tanlab olinadi (`licenseKey`, `clinicId`,
`modules`, `expiresAt`, `gracePeriodDays`, `issuedAt`, `fingerprint`,
`signature`). Buni test qoplaydi: provisioning bilan aktivatsiyadan keyin
`readLicense()` + `isLicenseValid()` → `true`.

**`activateRoutes` signaturasi.** Hozir `activateRoutes()` dep qabul qilmaydi va
oddiy `Hono` qaytaradi (`routes/activate.ts:18`). Provisioning uchun `db` kerak →
`activateRoutes(deps)` bo'ladi va `app.ts` chaqiruvi yangilanadi.

### 6.3 `/register-tenant` yopilishi

⚠️ **Backend qismi allaqachon bajarilgan.** `auth.routes.ts:107` desktop rejimida
(`process.env.DENTAL_LOCAL_DESKTOP === 'true'`) `POST /auth/register-tenant`ni
`403 auth.self_registration_disabled` bilan rad etadi. Ya'ni backend teshigi yo'q
— muammo faqat UX: sahifa ochiladi, foydalanuvchi formani to'ldiradi va faqat
yuborgandan keyin 403 oladi.

Web tomonda: `/register-tenant` route'i desktop rejimida ro'yxatdan
chiqariladi. Frontend bu belgini bilishi uchun mavjud
`GET /tenant-settings/vertical` precedentiga o'xshash yengil public endpoint
(`GET /auth/registration-enabled`) qo'shiladi — SPA build vaqtida emas,
ish vaqtida aniqlanadi (bitta build ham cloud, ham desktop uchun ishlatiladi).

Cloud/SaaS rejimda xulq o'zgarmaydi.

### 6.4 Telefon normalizatsiyasi (global)

Yagona `normalizePhone(input: string): string` — `packages/core`:

1. Raqamdan boshqa barcha belgilar olib tashlanadi.
2. 9 xonali bo'lsa `998` prefiksi qo'shiladi.
3. Natija `+` + raqamlar (`+998XXXXXXXXX`).

⚠️ Supervisor `@dental/core`ga bog'liq EMAS (alohida deploy unit, hatto Zod 3
ishlatadi) — `normalizePhone` u yerda **qo'lda dublikat** qilinadi, xuddi
`license-signature.ts` kabi, lockstep izohi bilan.

Qo'llanadigan joylar — implementatsiyadan oldin `grep -rn "users\.phone"
apps/api/src` bilan to'liq ro'yxat qayta tekshiriladi. Hozir aniqlangan
solishtirish/yozish nuqtalari:

| Fayl | Nima qiladi |
|---|---|
| `auth.service.ts:235` | login — `eq(users.phone, input.phone)` |
| `auth.service.ts:156` | register-tenant — owner yozuvi |
| `users.service.ts:83` | xodim taklifi — mavjud user aniqlash (CLI-158 `alreadyExists`) |
| `users.service.ts:94` | xodim taklifi — yangi user yozuvi |
| `routes/reset-owner-password.ts` | owner topish |
| Supervisor `clinics` formasi | `owner_phone` yozuvi |

⚠️ Bitta nuqta o'tkazib yuborilsa login ishlaydi-yu, boshqa qidiruv jim ravishda
mos kelmay qoladi — bu o'zgarishning eng yomon nosozlik shakli. (`patients.phone`
bunga kirmaydi — bemor telefoni login identifikatori emas, tegilmaydi.)

**Migratsiya (`users.phone`).** `users.phone` platform bo'yicha unique, shuning
uchun oddiy `UPDATE` to'qnashuvda unique-indeks xatosi bilan yiqiladi (konfliktni
"ro'yxatlash" emas). Kerakli mexanizm — `DO` bloki:

1. Normalizatsiyadan keyin bir xil bo'lib qoladigan qatorlarni oldindan tanlash.
2. Topilsa — `RAISE EXCEPTION` konfliktli `id`/`phone` juftliklari bilan;
   migratsiya to'xtaydi, ma'lumot o'zgarmaydi.
3. Konflikt yo'q bo'lsagina `UPDATE`.

Konflikt chiqsa — qo'lda hal qilinadi (qaysi hisob haqiqiy ekanini faqat inson
biladi). Jim birlashtirish yoki o'chirish yo'q.

## 7. Supervisor admin paneli

`apps/supervisor-admin/src/features/clinics/`:

- Yaratish formasi: owner F.I.Sh., owner telefoni (normalizatsiya bilan), til,
  filial nomi/manzil/telefon.
- Yaratilgandan so'ng **hisob ma'lumotlari kartasi**: litsenziya kaliti, login
  telefoni, vaqtinchalik parol + nusxalash tugmasi + "klinika aktivatsiya qilgach
  bu ma'lumot yo'qoladi" ogohlantirishi.
- `ClinicDetailPage`: aktivatsiyagacha shu ma'lumot ko'rinadi; aktivatsiyadan
  keyin "Aktivatsiya qilingan — vaqtinchalik parol o'chirilgan" holati.

## 8. Xato holatlari

| Holat | Xulq |
|---|---|
| Provisioning imzosi noto'g'ri | Aktivatsiya rad, `.lic` yozilmaydi, `PROVISIONING_SIGNATURE_INVALID` (403) |
| Provisioning bloki yo'q (eski Supervisor) | Aktivatsiya avvalgidek o'tadi, provisioning'siz |
| Owner telefoni bazada allaqachon bor | Tranzaksiya bekor, `PROVISIONING_CONFLICT` (409), `.lic` yozilmaydi |
| Provisioning boshqa klinikaga tegishli (bog'lash mos emas) | 403 `PROVISIONING_MISMATCH`, `.lic` yozilmaydi |
| Lokal tenant allaqachon bor | Provisioning o'tkaziladi, `.lic` yoziladi, audit `tenant.provisioning_skipped` |
| `POST /v1/provisioned` yetib bormadi | Aktivatsiya muvaffaqiyatli; parol keyingi heartbeat'da tozalanadi |
| Fingerprint mos emas / kalit yaroqsiz | Mavjud xulq o'zgarmaydi |

**Yarim-provisioning qilingan o'rnatish.** Agar mashinada allaqachon mijozning
o'zi yaratgan tenant bo'lsa (hozirgi Windows test mashinasi shundoq), aktivatsiya
muvaffaqiyatli o'tadi, lekin vendor bergan login/parol **ishlamaydi** — bu
qasddan qilingan xavfsizlik xulqi (kalitga ega har kim owner parolini bosib
o'tolmasligi uchun). Tiklash yo'li: aktivatsiyadan oldin lokal bazani tozalash
(yangi o'rnatish). Holat jim qolmasligi uchun `tenant.provisioning_skipped`
audit yozuvi yoziladi — diagnostika shu orqali.

**Heartbeat tozalash yo'li.** `licenses.service.ts` `heartbeat()` ham
`owner_temp_password = NULL` qiladi va `provisioned_at` bo'sh bo'lsa to'ldiradi.
Sabab: `POST /v1/provisioned` yetib bormasa parol Supervisor bazasida qolib
ketmasin. Bu — §11 dagi `licenses.service.ts` o'zgarishlariga kiradi.

## 9. Testlar (TDD)

**`apps/api`:**
- Provisioning imzo tekshiruvi: to'g'ri imzo → tenant yaratiladi; buzilgan imzo → 403 va `.lic` yozilmaydi.
- **Bog'lash testi:** boshqa klinikaning haqiqiy imzolangan bloki (boshqa
  `licenseKey`/`clinicId`/`issuedAt`) → 403, `.lic` yozilmaydi.
- **Nested-obyekt regressiya testi**: `canonicalize` nested obyektda `throw`
  qiladi; tekis payload uchun chiqish mavjud imzolar bilan mos qoladi (§3).
- Ikki marta aktivatsiya → owner `password_hash` o'zgarmaydi, tenant dublikat bo'lmaydi.
- Provisioning'dan keyin 8 rol shabloni mavjud (rol-bo'yicha tekshiruv, `@owner` emas).
- `GET /auth/registration-enabled` ikkala rejimda to'g'ri qiymat qaytaradi
  (`register-tenant` 403 xulqi allaqachon mavjud va test bilan qoplangan).
- `normalizePhone` birlik testlari + migratsiya dublikat guard testi.
- Mavjud: `routes/activate.test.ts`, `tests/integration/cli-370-activate-rate-limit.test.ts` yangilanadi.

**Supervisor:**
- Klinika yaratish owner maydonlari bilan; parol generatsiya qilinadi va qaytariladi.
- `/v1/activate` provisioning blokini imzo bilan qaytaradi; aktivatsiyadan keyin
  `/v1/provisioned` parolni `NULL` qiladi va `'provisioned'` hodisasini yozadi.
- `heartbeat` ham `owner_temp_password`ni tozalaydi (tasdiq so'rovi yetib
  bormagan ssenariy).
- Mavjud: `licenses.test.ts`, `clinics` route testlari yangilanadi.

**Supervisor admin:**
- Yaratish formasi yangi maydonlar bilan; hisob kartasi ko'rsatiladi;
  aktivatsiyadan keyin parol ko'rinmaydi.
- Mavjud: `clinics.api.test.ts`, `ClinicsPage.test.tsx`, `ClinicDetailPage.test.tsx`.

## 10. Scope'dan tashqarida

- Birinchi loginda majburiy parol almashtirish (qaror #5 — ixtiyoriy; profil
  sahifasidagi mavjud `changePassword` yetarli).
- Supervisor'dan bir nechta filial yoki xodim hisoblarini oldindan yaratish
  (qaror #2 — minimal hajm).
- Klinika turi (vertical) ni Supervisor'dan belgilash — mijoz Sozlamalardan
  tanlaydi (mavjud xulq).

## 11. Ta'sir qiladigan fayllar

**Supervisor:** `db/schema.ts` + migratsiya · `modules/clinics/clinics.routes.ts` ·
`modules/licenses/licenses.service.ts` (`buildResponse`, `activate`, `heartbeat`
— parol tozalash, yangi `provisioned`) · `modules/licenses/licenses.routes.ts` ·
`lib/rsa.ts` (tekis-obyekt guard + izoh)

**Klinika (`apps/api`):** `lib/license.ts` (`LicenseData` tipi, `writeLicense`) ·
`lib/license-client.ts` (`activateLicense` javob tipi, `markProvisioned`) ·
`routes/activate.ts` (`activateRoutes(deps)` — yangi signatura) · `app.ts`
(chaqiruv yangilanadi) · `modules/auth/auth.service.ts` (`provisionTenantInTx`,
`provisionFromLicense`) · `modules/auth/auth.routes.ts` (`register-tenant` gate,
`registration-enabled`) · `modules/auth/auth.schema.ts` ·
`modules/users/users.service.ts` (telefon normalizatsiyasi) ·
`routes/reset-owner-password.ts` (telefon normalizatsiyasi) · migratsiya
(`users.phone` normalizatsiyasi, `DO` bloki bilan)

**Umumiy:** `packages/core/src/license-signature.ts` (tekis-obyekt guard + izoh) ·
`packages/core` `normalizePhone`

**Web:** `features/auth/pages/activate.page.tsx` · `features/auth/auth.routes.tsx` ·
i18n `uz.json` / `ru.json`

**Supervisor admin:** `features/clinics/` (forma, tiplar, api, sahifalar)
