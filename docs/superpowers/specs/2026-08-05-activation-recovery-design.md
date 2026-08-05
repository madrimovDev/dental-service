# Aktivatsiya tiklanishi + telefon kanonikligi — dizayn

**Sana:** 2026-08-05
**Manba:** `AUDIT-2026-08-05-activation-login.md` (C1, H1, M1, L1)
**Maqsad:** Windows E2E'dan OLDIN aktivatsiya/login zanjiridagi barcha topilmalarni yopish.

---

## 1. Muammo

Klinika bir marta aktivatsiya qilingandan keyin lokal baza yo'qolsa, mahsulot ichida
tiklanish yo'li qolmaydi. Zanjir (audit C1):

1. `.lic` `postgres\data` dan tashqarida yashaydi → bazani tozalash `.lic`ni o'chirmaydi
2. Desktop gate faqat fayl mavjudligini ko'radi (`hasLicense()`) → asosiy UI ochiladi
3. Login 401 — `users` bo'sh
4. Qayta aktivatsiya provisioning **qaytarmaydi** — `ownerTempPassword` birinchi
   aktivatsiyada o'chirilgan (`buildProvisioning` `licenses.service.ts:80`)
5. `/register-tenant` desktop'da 403
6. Vendor parol-tiklash → `reset.no_tenant` (tiklaydigan owner yo'q)
7. Supervisor'da parolni qayta generatsiya qiluvchi endpoint yo'q

**Eng ehtimolli kirish yo'li — mijoz kompyuterini almashtirishi** (test artefakti emas):
yangi PC → `FINGERPRINT_MISMATCH` → vendor `reactivate` → `/activate` muvaffaqiyatli →
provisioning yo'q → bo'sh bazada tenant yaratilmaydi.

---

## 2. Qabul qilingan qarorlar

| # | Qaror | Sabab |
|---|---|---|
| D1 | Reprovision **faqat bo'sh bazada** ishlaydi — mavjud tenant bo'lsa jim skip | Hozirgi idempotent guard saqlanadi; litsenziya kaliti bilan owner hisobini egallash yo'li ochilmaydi. Parol unutilgan holat CLI-476 reset-token bilan allaqachon qoplangan |
| D2 | Fingerprint qayta bog'lash + yangi parol = **BITTA amal** | Ikki alohida tugmada noto'g'ri tartib (`reactivate` avval) aktivatsiyani "muvaffaqiyatli" ko'rsatib jim qulflanishni qaytaradi |
| D3 | Bemor telefoni: **yozish + migratsiya + qidiruv** to'liq qamrov | Yarim yechim aralash baza qoldiradi va Telegram linking eski bemorlar uchun baribir ishlamaydi |
| D4 | Gate **ikkala tomonda** — desktop startup + web | Ikki qatlamli; web qismi Linux'da to'liq sinaladi |
| D5 | `provisionedAt` **TEGILMAYDI** | Quyida §3.1 ga qarang — bu eng nozik qaror |
| D6 | Gate ikki xil natija beradi (kalit kiriting / vendorga murojaat) | Aks holda cheksiz redirect: aktivatsiya o'tadi, tenant baribir yo'q, gate yana `/activate`ga qaytaradi |
| D7 | `ownerPhone` bo'sh klinikada reprovision **rad etiladi** (400) | Migratsiya eski qatorlarni bo'sh satr bilan to'ldirgan; `buildProvisioning` ularda `null` qaytaradi — parol hech kimga yetib bormasdi |

---

## 3. Komponentlar

### 3.1 Supervisor — `POST /v1/admin/clinics/:id/prepare-reinstall`

**Amal (adminJWT, bitta tranzaksiya):**
- `ownerPhone` bo'sh yoki klinika topilmasa → 400 / 404 (D7)
- `clinics.ownerTempPassword` = yangi `generateTempPassword()`
- `licenses.fingerprint = NULL`
- `license_events` ← `prepare_reinstall`, `createdBy` = admin
- Javob: `{ clinic, credentials: { loginPhone, tempPassword } }` — klinika yaratish
  javobi bilan bir xil shakl

**🔴 `provisionedAt` ATAYIN o'zgartirilmaydi (D5).**
`buildProvisioning` (`licenses.service.ts:80`) faqat `ownerTempPassword && ownerPhone`
ga qaraydi — `provisionedAt`ga EMAS. Shuning uchun parolni yozishning o'zi blokni
qaytaradi. Agar `provisionedAt = NULL` qilinsa, `heartbeat`dagi
`if (!lic.provisionedAt) clearTempPassword()` (`:178`) birinchi heartbeat'da (boot'da +
har 4 soat) parolni mijoz aktivatsiya qilishga ulgurmasdan o'chirib yuboradi.
**Buni "soddalashtirib" `provisionedAt = NULL` qilmang.**

Bir martalik semantika saqlanadi: aktivatsiyadan keyin `/v1/provisioned` →
`clearTempPassword` parolni yana o'chiradi.

**Nima uchun `fingerprint = NULL`:** bu bitta amal ikkala senariyni qoplaydi —
o'sha mashinada baza yo'qolgan holat (fingerprint qayta bog'lanadi, natija bir xil) va
yangi kompyuterga ko'chish. Mavjud `reactivate` endpoint o'z joyida qoladi (fingerprint
almashtirish, provisioningsiz).

**Admin panel:** klinika detalida "Qayta o'rnatishga tayyorlash" tugmasi + tasdiq
modali (nima bo'lishini tushuntiradi) + natijada kredensiallar kartasi.

### 3.2 `GET /api/bootstrap-status` (apps/api)

Public, auth'siz, permission'siz. Javob: `{ hasLicense: boolean, hasTenant: boolean }`.

**`license-middleware.ts` WHITELIST'iga qo'shiladi** (`/activate`, `/api/activate`,
`/api/reset-owner-password` yonida). Aks holda `.lic` yo'q paytda `requireModule`
`LICENSE_NOT_FOUND` qaytarib, aynan aniqlamoqchi bo'lgan holatni yopib qo'yadi.

`hasTenant` — `select 1 from tenants limit 1` (RLS'siz; `tenants` jadvalida RLS yo'q).

### 3.3 Web gate

Login sahifasi (yoki router guard) `bootstrap-status`ni tekshiradi:

| Holat | Xatti-harakat |
|---|---|
| `hasLicense: false` | `/activate` — "litsenziya kalitini kiriting" (hozirgi oqim) |
| `hasLicense: true, hasTenant: false` | `/activate` sahifasi ochiladi, lekin **"vendorga murojaat" holatida** — forma o'rniga tushuntirish matni: "Klinika ma'lumotlari topilmadi — ta'minotchiga murojaat qiling, u 'qayta o'rnatishga tayyorlash'ni bajarishi kerak" (D6) |
| `hasTenant: true` | Oddiy login |

**Yangi route qo'shilmaydi** — `/activate` sahifasining o'zi ikki holatni ko'rsatadi
(kalit kiritish formasi / vendorga murojaat matni), holat `bootstrap-status`dan
aniqlanadi. Sabab: desktop allaqachon `/activate`ga yo'naltiradi, ikkinchi manzil
qo'shish ikkala tomonda ham koordinatsiya talab qilardi.

i18n uz/ru majburiy.

### 3.4 Desktop main process

Startup'da (API tayyor bo'lgach) `hasLicense()` yoniga `bootstrap-status` so'rovi.
`hasTenant: false` → `/activate` (§3.3 dagi bir xil sahifa — u holatni o'zi aniqlab
"vendorga murojaat" matnini ko'rsatadi).

So'rov muvaffaqiyatsiz bo'lsa (API hali ko'tarilmagan, tarmoq) — hozirgi xulq
saqlanadi (`hasLicense()` bo'yicha qaror), gate foydalanuvchini bloklamaydi.

Windows-only — jismoniy PC'da qo'lda tasdiqlanadi.

### 3.5 M1 — idempotent skip'da login telefoni

`activate.ts` `applyProvisioning` `false` qaytarsa, javobdagi `ownerPhone` mavjud tenant
owner'ining telefoni bo'ladi (yangi ma'lumot oshkor qilinmaydi — bu allaqachon shu
mashinaning egasi). Hozir bu maydon umuman bo'lmaydi va aktivatsiya ekrani login
telefonini ko'rsatmaydi.

### 3.6 H1 — `normalizePhone` divergent nusxasi

`apps/api/src/lib/telegram-bot-manager.ts:11` dagi lokal nusxa o'chiriladi,
`@dental/core`dan import qilinadi (`apps/api` allaqachon unga bog'liq — supervisor'dagi
deploy to'sig'i bu yerda yo'q). Nusxa 9-xonali holatni ishlamaydi
(`901234567` → `+901234567`, kanonik `+998901234567` o'rniga).

### 3.7 Bemor telefoni kanonikligi (D3)

- `patients` create/update — yozishda `normalizePhone`
- Migratsiya `0044` — mavjud qatorlar. **To'qnashuv guard'i KERAK EMAS:**
  `patients.phone` unique emas (oila a'zolari bitta raqamni ulashishi mumkin) — 0043
  dagi `users.phone` holatidan farqli
- Telefon bo'yicha qidiruv ham normallashtiriladi (aks holda foydalanuvchi
  `901234567` deb qidirsa kanonik yozuvni topmaydi)

---

## 4. Tiklanish oqimi (yakuniy holat)

```
Mijoz: "kirolmayapman"
  → Desktop/web: "Klinika ma'lumotlari topilmadi — ta'minotchiga murojaat qiling"
  → Vendor: admin panel → klinika → "Qayta o'rnatishga tayyorlash"
      → yangi vaqtinchalik parol + fingerprint tozalandi (audit yozildi)
  → Vendor mijozga telefon+parolni og'zaki yetkazadi
  → Mijoz: /activate → litsenziya kaliti
      → fingerprint NULL → bu mashinaga bog'lanadi
      → provisioning bloki keladi (imzo + bog'lash tekshiruvi)
      → tenant + owner + filial + 8 rol shabloni yaratiladi
      → .lic yoziladi → /v1/provisioned → parol Supervisor bazasidan o'chadi
  → Mijoz login qiladi
```

---

## 5. Xato holatlari

| Holat | Xatti-harakat |
|---|---|
| Reprovision, `ownerPhone` bo'sh | 400 — vendor avval owner ma'lumotlarini to'ldirishi kerak |
| Reprovision, klinika yo'q | 404 |
| `bootstrap-status` DB yetib bormaydi | 500 — gate "noma'lum" holatda foydalanuvchini bloklamaydi (login sahifasi ochiladi, hozirgi xulq) |
| Aktivatsiya: provisioning qo'llandi, `.lic` yozilmadi | Hozirgi xulq saqlanadi — 500, qayta urinish idempotent skip bilan o'tadi |
| Tenant bor, reprovision bosilgan | Jim skip (D1) — `.lic` yangilanadi, owner paroli tegilmaydi |

---

## 6. Test strategiyasi

**Aktivatsiya testlari mavjud parametr seam'laridan foydalanadi** — `deps.activate`,
`deps.markProvisioned`, `deps.writeLicense`, `deps.supervisorPublicKeyPem`.
`mock.module` ISHLATILMAYDI: u resolved-path bo'yicha global va boshqa test
fayllarining Supervisor mock'ini jim chetlab o'tadi (`activate.ts:79-101` izohi).

**Rate-limit:** `/api/activate` CLI-370 Redis fixed-window (5/soat) ostida. Takroriy
to'liq suite yugurishlarida 429 — bu kod xatosi EMAS. Rejaga Redis `rl:*` tozalash
qadami kiritiladi.

**Qamrov:**
- Supervisor: prepare-reinstall happy path, `ownerPhone` bo'sh → 400, audit event
  yozilishi, `provisionedAt` o'zgarmasligi (D5 regressiya qulfi)
- Supervisor: prepare-reinstall dan keyin `activate` provisioning blokini QAYTARADI
- apps/api: `bootstrap-status` uch holati; WHITELIST'da ekani (`.lic` yo'q → 403 EMAS)
- apps/api: skip holatida `ownerPhone` mavjud owner'niki (M1)
- web: gate uch holati (i18n kalitlari bilan)
- patients: yozish normalizatsiyasi + migratsiya + qidiruv

---

## 7. Tartib va mustaqillik (Workflow lane'lari uchun asos)

| Lane | Tarkib | Bog'liqlik |
|---|---|---|
| **L1** | Supervisor prepare-reinstall (route + service + test) + admin panel tugmasi | Mustaqil |
| **L2** | `bootstrap-status` endpoint + WHITELIST + web gate + i18n | Mustaqil |
| **L3** | M1 (skip ownerPhone) + H1 (normalizePhone import) | Mustaqil, mayda |
| **L4** | Bemor telefoni: yozish + migratsiya 0044 + qidiruv | Mustaqil |
| **L5** | Desktop main process gate | **L2 dan keyin** (bootstrap-status endpoint kerak) |

**Ketma-ketlik:** L1–L3 va L5 — E2E bloklovchi, avval. L4 aktivatsiya zanjiridan
mustaqil, keyin bajariladi (bu ataylab tanlangan tartib, tasodifiy emas).

⚠️ Integration testlar **yagona test DB** (localhost:5433, per-run izolyatsiyasiz)
ishlatadi — verify bosqichi **SERIAL** bo'lishi shart, implement bosqichi
typecheck+lint bilan cheklanadi (2026-07-11 roundining darsi).

---

## 8. Qamrovdan tashqarida

- Electron installer / portable binary yo'llari (Windows-only, jismoniy PC)
- Telegram bot linking jonli sinovi
- Migratsiya 0043 to'qnashuvi holati (alohida operatsion vaziyat, C1 zanjiriga kirmaydi)
