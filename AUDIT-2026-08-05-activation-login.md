# Aktivatsiya + Login oqimi auditi — 2026-08-05

**Sabab:** Windows'da qo'lda test boshlangach muammolar chiqa boshladi. E2E'dan oldin
aktivatsiya/login zanjirini statik tekshirish.

> ## ✅ YAKUN (2026-08-06) — barcha topilmalar YOPILDI
>
> | # | Holat | Commit |
> |---|---|---|
> | **C1** Baza yo'qolsa tiklanish yo'li yo'q | ✅ Yopildi — Supervisor «Qayta o'rnatishga tayyorlash» (A-variant) + ikki tomonlama `bootstrap-status` gate (B-variant) | `dc5783c`, `35cf441`, `5b71be0` |
> | **H1** `normalizePhone` divergent nusxasi | ✅ Yopildi — `@dental/core` yagona manba; bemor telefonlari ham kanonik (migratsiya 0044) | `78e0621`, `427aec6`, `486739f` |
> | **M1** Skip'da login telefoni | ✅ Yopildi — mavjud owner telefoni qaytariladi | `2824ece` |
> | **L1** `reactivate` provisioning bermaydi | ✅ Yopildi — bitta koordinatsiyalangan amal (fingerprint tozalash + yangi parol) | `a19606e` |
>
> **Ijro:** spec → 10-taskli reja → `Workflow` orkestratsiyasi (11 agent, 5 lane,
> parallel implement + serial verify) → whole-branch review.
> Spec: `docs/superpowers/specs/2026-08-05-activation-recovery-design.md` ·
> Reja: `docs/superpowers/plans/2026-08-05-activation-recovery.md`
>
> **Review va keyingi round topgan qo'shimcha nuqsonlar (ular ham yopildi):**
> - **L2×L3 kesishmasi** (`0a55cac`) — M1 dan keyin aktivatsiya sahifasi skip
>   holatida ham «parolni ta'minotchidan oling» deb yozardi, holbuki o'sha parol
>   qo'llanmaydi. Javobga `provisioned` bayrog'i qo'shildi.
> - **Tayyorlangan kredensial yonib ketishi** (`a5ac5c5`) — `confirmProvisioned`
>   `applied`ga qaramasdan chaqirilardi; endi skip'da Supervisor parolni saqlaydi
>   va `provisioning_skipped` hodisasini yozadi.
> - **heartbeat sweep bog'liqligi** (`f5a04c1`) — regressiya testi bilan qulflandi
>   (mutatsiya bilan tasdiqlangan).
>
> **Qasddan O'ZGARTIRILMAGAN:** heartbeat scheduler faqat `INVALID_KEY` da `.lic`ni
> bekor qiladi. Ya'ni eski o'rnatma «qayta o'rnatishga tayyorlash»dan keyin ham
> muddat tugagunicha ishlaydi — o'tish davri uchun to'g'ri xulq. Darhol to'xtatish
> kerak bo'lsa litsenziya deaktivatsiya qilinadi (`docs/DESKTOP-WINDOWS-BUILD-TEST.md`
> §4.3).
>
> **Ochiq follow-up (ticket kerak):** vendor tomonida «tayyorlangan kredensialni
> bekor qilish» tugmasi yo'q — parol ishlatilmaguncha, qayta tayyorlanmaguncha yoki
> litsenziya deaktivatsiya qilinmaguncha Supervisor bazasida turadi (klinikada
> ko'pi bilan bitta).

**Usul:** solo statik trace (subagent/Workflow ISHLATILMADI). Modul bo'yicha emas —
**sovuq mashina bosib o'tadigan ketma-ketlik** bo'yicha, har qadamda bitta savol bilan:
_"bu qadam qanday holat ALLAQACHON mavjud deb hisoblaydi?"_

```
installer → migratsiya → Electron first-run → .lic yo'q → /activate
  → Supervisor /v1/activate → imzo+bog'lash → provisionTenantInTx
  → /v1/provisioned → .lic yozish → login (telefon+vaqtinchalik parol)
```

**Qamrov:** `routes/activate.ts`, `licenses.service.ts`, `clinics.routes.ts`,
`auth.service.ts`, `auth.routes.ts`, `license-middleware.ts`,
`license-heartbeat-scheduler.ts`, `reset-owner-password.ts`, `license-status.ts`,
`main.ts`, `phone.ts` (3 nusxa), migratsiya 0043.

**Umumiy baho:** zanjir yaxshi mudofaalangan — imzo + bog'lash tekshiruvi, idempotentlik,
fail-closed xato yo'llari, audit yozuvlari, rate-limit kalitlari kanonik telefon bo'yicha.
Xato yo'llarining aksariyati **to'g'ri tartibda** (provisioning muvaffaqiyatsiz → `.lic`
ATAYIN yozilmaydi → qayta urinish ishlaydi). Quyidagi C1 — bu mudofaalarning teshigi emas,
balki **qamrab olinmagan holat**: birinchi aktivatsiya muvaffaqiyatli bo'lgandan KEYIN
lokal baza yo'qolsa nima bo'ladi.

---

## 🔴 C1 [Critical] — Baza yo'qolib `.lic` qolsa, mahsulot ichida tiklanish yo'li YO'Q

**Ta'sir:** klinika butunlay ishlamay qoladi. Login imkonsiz, aktivatsiya yordam bermaydi,
vendor tomonida ham tugma yo'q. Yagona chiqish — vendor Supervisor bazasiga **qo'lda SQL**
yozishi.

### Zanjir (har bo'g'in alohida to'g'ri, birgalikda qopqon)

1. **`.lic` Postgres data katalogidan TASHQARIDA.**
   `.lic` → `C:\ProgramData\DentalService\license.lic` (`license.ts:31`,
   `license-status.ts`), Postgres data → `C:\ProgramData\DentalService\postgres\data`
   (`first-run.ts:27`). Bitta ildiz, lekin bazani tozalash uchun `postgres\data`
   o'chiriladi — `.lic` omon qoladi.

   **Tekshirildi:** `runFirstSetup()` (`first-run.ts:128`) faqat papkalar + parollar +
   `initdb` qiladi, `runMigrations` esa sxemani qo'yadi. **Hech qanday tenant/owner
   seed qadami YO'Q** — natija toza, migratsiya qilingan, BO'SH baza.

2. **Desktop gate faqat fayl mavjudligini tekshiradi.**
   `hasLicense() = existsSync(...)` (`license-status.ts`) — baza holati umuman
   ko'rilmaydi. `.lic` bor → asosiy UI ochiladi, `/activate`ga yo'naltirilmaydi.

3. **Login 401 beradi** — `users` jadvali bo'sh.

4. **Qayta aktivatsiya provisioningni QAYTARMAYDI.**
   `buildProvisioning` (`licenses.service.ts:80`):
   `if (!clinic?.ownerTempPassword || !clinic.ownerPhone) return null`.
   Vaqtinchalik parol birinchi muvaffaqiyatli aktivatsiyada `/v1/provisioned` (yoki
   birinchi heartbeat, `licenses.service.ts:178`) tomonidan **butunlay o'chirilgan**.
   Ya'ni `/activate` yana muvaffaqiyatli o'tadi, `.lic` qayta yoziladi — lekin
   **tenant yaratilmaydi**.

5. **`/register-tenant` desktop'da 403** — `auth.routes.ts:113`
   (`DENTAL_LOCAL_DESKTOP === 'true'` → `auth.self_registration_disabled`).

6. **Vendor parol-tiklash ham ishlamaydi.** `reset-owner-password.ts`:
   `tenants.findFirst` → null → `reset.no_tenant` 400. Reset **mavjud** owner
   foydalanuvchining `password_hash`ini yangilaydi; owner umuman yo'q bo'lsa qiladigan
   ishi yo'q.

7. **Supervisor'da vaqtinchalik parolni qayta generatsiya qiluvchi endpoint YO'Q.**
   `clinics.routes.ts` — faqat `GET /`, `POST /`, `GET /:id`, `PATCH /:id/deactivate`.
   `ownerTempPassword` faqat `POST /` (klinika yaratish) paytida yoziladi.

### Bu qanday kirish yo'llari bilan yuz beradi

| Yo'l | Ehtimollik | Izoh |
|---|---|---|
| **Mijoz kompyuterini almashtirish** | 🔴 Yuqori | **Normal biznes hodisasi, test artefakti emas.** Zanjir: yangi PC → `/activate` → `FINGERPRINT_MISMATCH` (`licenses.service.ts:132`) → vendor `reactivate` chaqiradi (yangi fingerprint bog'lanadi, `buildProvisioning` UMUMAN chaqirilmaydi, `:221`) → mijoz `/activate` qayta qiladi → endi fingerprint mos → `buildProvisioning` → `ownerTempPassword` NULL → **provisioning yo'q** → yangi PC'dagi bo'sh bazada tenant yaratilmaydi |
| **Windows testini qayta boshlash** | 🔴 Yuqori | Runbook o'zi "sinash uchun lokal bazani tozalash kerak" deydi — aynan shu qulflanishga olib keladi |
| **Baza buzilishi / disk nosozligi** | 🟡 O'rta | `.lic` `postgres\data` dan tashqarida — omon qoladi |

### Tuzatish variantlari (qaror kerak)

- **A. Supervisor'da "provisioningni qayta ochish"** — `POST /:id/reprovision`: yangi
  vaqtinchalik parol generatsiya qiladi + `licenses.provisionedAt = NULL`. Mijoz
  `/activate` qiladi → blok qaytadi → tenant qayta yaratiladi. Vendor nazorati saqlanadi,
  audit'ga yoziladi. **Tavsiya etiladigan minimal yechim.**
- **B. Desktop gate'ini kuchaytirish** — `hasLicense()` yoniga "tenant bormi?" tekshiruvi
  (API'dan yangi tor endpoint). `.lic` bor + tenant yo'q → `/activate`ga yo'naltirish.
  A'siz o'zi yetarli emas (aktivatsiya baribir provisioning bermaydi), lekin foydalanuvchi
  qopqonda ekanini **ko'rsatadi**, jim 401 o'rniga.
- **C. Parolni Supervisor'da saqlab qolish** — rad etiladi, Qaror #41 ga zid
  (vaqtinchalik parol bir martalik bo'lishi kerak).

> ⚠️ **E2E'dan oldin bilish shart:** toza bazada test qilish uchun har safar vendor
> tomonida YANGI klinika yaratish kerak (eski litsenziya kaliti ikkinchi marta
> provisioning bermaydi). Bu hozirgi holat, kutilgan xatti-harakat emas.

---

## 🟠 H1 [High] — `normalizePhone` ning uchinchi, DIVERGENT nusxasi

`apps/api/src/lib/telegram-bot-manager.ts:11`:

```ts
export const normalizePhone = (raw: string): string => {
  const digits = raw.replace(/[^\d]/g, '');
  return `+${digits}`;          // ⚠️ 9-xonali holat YO'Q, bo'sh holat YO'Q
};
```

Kanonik qoida (`packages/core/src/phone.ts` = `apps/supervisor-api/src/lib/phone.ts`):

```ts
if (!digits) return '';
const withCountry = digits.length === 9 ? `998${digits}` : digits;
return `+${withCountry}`;
```

**Farq:** `901234567` → core `+998901234567`, telegram-bot-manager `+901234567`.
Bo'sh kiritma → core `''`, bu nusxa `'+'`.

**Oqibat — ikki qismli, faqat birinchisi tasdiqlangan:**

1. ✅ **Tasdiqlangan:** `patients.phone` yozishda umuman normallashtirilmaydi
   (`patients.service.ts:381` — `phone: input.phone ?? null`, xom saqlanadi). Ya'ni
   bemor `901234567` deb kiritsa bazada shu shaklda yotadi.
2. ⚠️ **Tasdiqlanmagan:** Telegram `contact.phone_number` odatda davlat kodi bilan
   keladi (`998901234567`) — bu holda ikkala implementatsiya ham `+998901234567` beradi
   va farq **latent** qoladi. Jonli bot bilan sinalmagani uchun buzilish **isbotlanmagan**.

Ya'ni haqiqiy Telegram-linking riski ko'proq **(1)** dan — baza tomonida normalizatsiya
yo'qligidan — kelib chiqadi; divergent nusxa esa uni kuchaytiradi.

**Nima uchun H, C emas:** owner login yo'lida emas va buzilish empirik isbotlanmagan.
Lekin bu **hujjatlashtirilmagan uchinchi nusxa** — supervisor nusxasida aniq lockstep
ogohlantirishi bor va Qaror #42 seam testi bilan qulflangan, bu nusxada ikkalasi ham
yo'q. Divergensiya allaqachon sodir bo'lgan.

**Tuzatish:** `@dental/core`dan import qilish (`apps/api` allaqachon `@dental/core`ga
bog'liq — supervisor'dagi kabi to'siq yo'q). Bu 1 qatorlik o'chirish.

---

## 🟡 M1 [Medium] — Idempotent skip'da login telefoni ko'rsatilmaydi

`activate.ts:191` — `applyProvisioning` `false` qaytarsa (lokal tenant allaqachon bor)
javobda `ownerPhone` bo'lmaydi. Izohda bu **ataylab** deb tushuntirilgan va sabab
to'g'ri (lokal owner boshqa telefon bilan bo'lishi mumkin).

Lekin bir holatda bu noqulaylik tug'diradi: **provisioning qo'llandi, keyin `.lic` yozish
xato berdi** (`LICENSE_WRITE_FAILED`, masalan `C:\ProgramData` ruxsati yo'q). Mijoz qayta
urinadi → bu safar tenant bor → skip → `.lic` yoziladi → aktivatsiya muvaffaqiyatli,
lekin ekranda login telefoni ko'rsatilmaydi. Ma'lumot vendor tomonidan og'zaki
berilgani uchun bloklovchi emas.

**Tavsiya:** skip holatida mavjud tenant owner'ining telefonini ko'rsatish (yangi
ma'lumot oshkor qilinmaydi — bu allaqachon shu mashinaning egasi).

---

## 🔵 L1 [Low] — `reactivate` provisioning blokini hech qachon qaytarmaydi

`licenses.service.ts:221` — `reactivate` faqat `buildResponse` chaqiradi. Mantiqan
to'g'ri (u admin endpoint, klinika tomoni `/activate`ni chaqiradi), lekin C1 ning
"mashina almashtirish" yo'lida aynan shu joyda tuzatish qilish mumkin edi. C1 A-varianti
qabul qilinsa bu band avtomatik yopiladi.

---

## ✅ Tekshirilgan va TOZA topilgan

- **Imzo + bog'lash tekshiruvi** (`activate.ts:144-178`) — imzo YOLG'IZ yetarli emas
  deb to'g'ri hisoblangan; `parsed.data.licenseKey` (foydalanuvchi kiritgan) yagona
  ishonchli langar sifatida ishlatiladi. Replay va cross-clinic blok almashtirish yopiq.
- **Xato yo'llari tartibi** — provisioning xatosi `.lic` yozilishidan OLDIN return
  qiladi, shuning uchun "`.lic` bor lekin tenant yo'q" holati **aktivatsiya orqali
  yuzaga kelmaydi** (C1 boshqa sabablar bilan yuzaga keladi).
- **Idempotentlik guard'i** (`activate.ts:48`) — `limit 1` "har qanday tenant" bo'yicha,
  `clinicId` bo'yicha emas; izohda nima uchun `clinicId`ga "tuzatish" xavfli ekani
  yozilgan (parolni qayta yozish yo'li ochilardi). To'g'ri.
- **`provisionTenantInTx` rol shablonlarini forklamaydi** — `registerTenant` bilan
  ayni bitta funksiya (`auth.service.ts:266`), `seedSystemRolesInTx` majburiy.
  CLI-412 sinfidagi regressiya YO'Q.
- **`normalizePhone` yozuv tomonida to'liq** — provisioning owner (`auth.service.ts:130`),
  invite (`users.service.ts:83`), login qidiruvi (`:294`), login rate-limit kaliti
  (`auth.routes.ts:57`), Supervisor klinika yaratish (`clinics.routes.ts:169`).
- **Migratsiya 0043** — to'qnashuv aniqlash predikati UPDATE predikati bilan bayt-ma-bayt
  bir xil, `deleted_at` bo'yicha filtrlamaydi (to'liq unique indeks bilan izchil).
  Jim birlashtirish yo'q — to'g'ri.
- **Heartbeat** — `.lic` yo'q bo'lsa no-op; `INVALID_KEY` → invalidatsiya; boshqa
  xatolar → offline-resilience uchun `.lic` tegilmaydi.
- **`markProvisioned` best-effort** — throw qilmaydi; yetib bormasa birinchi heartbeat
  parolni tozalaydi (parol Supervisor bazasida cheksiz qolmaydi).

---

## Keyingi qadam

1. **C1 uchun qaror** (A / A+B) — E2E'dan OLDIN, chunki E2E'ning o'zi bu holatga tushadi.
2. H1 — bir qatorlik tuzatish, mustaqil.
3. M1/L1 — C1 tuzatilganda birga.

**Operatsion eslatma (C1 ga kirmaydi):** migratsiya 0043 telefon to'qnashuvida qonuniy
to'xtaydi — bu holatda migratsiya **abort** bo'ladi, ya'ni oldingi o'rnatishning tenant
qatorlari joyida qoladi. Bu bo'sh-baza holati EMAS, shuning uchun C1 zanjiriga kirmaydi;
alohida qo'lda aralashuv talab qiladigan holat.

**Tekshirilmagan (bu auditning qamrovidan tashqarida):** Electron first-run'ning Windows
binary yo'llari (portable Postgres/Valkey), installer, discovery, tray, auto-updater —
ularning hammasi jismoniy PC'da sinaladi. Telegram bot linking jonli sinovi (H1 §2).
