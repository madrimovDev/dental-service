# CLI-437 — Soat orqaga surilsa muddati o'tgan offline litsenziya cheksiz uzayadi

> Audit: AUDIT-2026-07-06.md · M24. Desktop-only.

## 1. Muammo va ildiz sabab

`isLicenseValid` — `apps/api/src/lib/license.ts:85-87`:
```ts
const expiry = new Date(data.expiresAt).getTime();
const grace = data.gracePeriodDays * 86400000;
return Date.now() < expiry + grace;
```

Amaldorlik faqat **`Date.now()`** (mahalliy soat) ni `expiry + grace` bilan solishtiradi. **Monotonik langar (anchor) yo'q.** Offline mashinada foydalanuvchi tizim soatini `expiry`dan oldingi sanaga qo'yib qo'ysa — `Date.now() < expiry + grace` doim `true` → **muddati o'tgan litsenziya cheksiz amal qiladi**. Heartbeat offline bo'lgani uchun Supervisor buni tuzata olmaydi (heartbeat-scheduler.ts:56-58 tarmoq xatosini toladi, cache'ни saqlaydi).

## 2. Dizayn qarori

**Fix (brief):** ko'rilgan **eng yuqori vaqtni** (monotonik langar) doimiy saqlash; mahalliy soat langardan orqaga o'tsa langarга tayanish (soat orqага surilishi qayta-validatsiyani bermaydi).

### Langar qiymati va manbai
- `highestSeenMs` = shu paytgача ko'rilgan eng katta ishonchli vaqt.
- **Kuchli signal (server vaqti):** har muvaffaqiyatli heartbeat Supervisor'ning `issuedAt`'ini (ISO, licenses.service.ts:45,65) qaytaradi — bu **ishonchli server vaqti**. `writeLicense` (heartbeat-scheduler.ts:44) paytida `highestSeenMs = max(highestSeenMs, Date.parse(issuedAt))`.
- **Zaif signal (mahalliy):** har `isLicenseValid`/`getActiveModules` chaqiruvida `highestSeenMs = max(highestSeenMs, Date.now())` (oldinga siljish kuzatiladi).

### Amaldorlik tekshiruvi (yangi `isLicenseValid`)
```
effectiveNow = max(Date.now(), highestSeenMs)   // orqага surish effectiveNow'ni pasaytira olmaydi
valid = effectiveNow < expiry + grace
```
Soat orqага surilsa `Date.now()` kichrayadi, lekin `effectiveNow` `highestSeenMs`da qoladi → muddati o'tgan litsenziya o'tgan holicha qoladi.

### Langar qayerda saqlanadi (tamper-resistant, imzoga KIRMAYDI)
> ⚠️ **CLI-410 bilan kelishuv:** CLI-410 `fingerprint`'ni imzolangan payload'ga qo'shadi. Langar **Supervisor tomonidan imzolanmaydi** — u imzolangan to'plamга KIRMASLIGI shart, aks holda `verifyLicenseSignature` (license.ts:82) yiqiladi. Shuning uchun langar **alohida faylда** (`.lic` yonida, masalan `license-anchor.dat`), `getKey()` (fingerprint-derived AES) bilan shifrlangan. `isLicenseValid`'da `const { signature, ...payload } = data` faqat imzolangan maydonlarni oladi; langar `data`da EMAS, alohida `readAnchor()` orqali o'qiladi. Ikki ticket bitta funksiyaga tegadi — birgalikda: imzo tekshiruvi + fingerprint (410) `payload`da; langar (437) `payload`dan tashqarida.

- AES (`getKey()`) bilan shifrlash — oddiy foydalanuvchi faylни ochib tahrirlab langarni pasaytira olmasin.
- **Cheklov (halol):** offline mashina egasida root/admin bor — faylni **o'chirib** langarni nolga qaytarishi mumkin. Buni to'liq oldini bo'lib bo'lmaydi (offline DRM chegarasi). Yumshatish: langar fayli yo'q bo'lsa `readAnchor` `lic.issuedAt`'dan qayta boshlaydi (kamida chiqarilgan sanadan oldinga o'ta olmaydi), va keyingi online heartbeat server-vaqti bilan qayta anchorlaydi. Bu — "jim, hech qanday harakatsiz" rollback'ni to'xtatadi (asosiy tahdid modeli), lekin "faylni qasddan o'chirish + offline qolish"ni emas.

**Rad etilgan alternativalar:**
- *Langarni imzolangan payload'ga solish* — Supervisor imzolamaydi → imzo yiqiladi (CLI-410 ziddiyati). Rad.
- *Langarni `.lic`ning imzolanmagan tashqi konvertига* — mumkin, lekin alohida fayl toza ajratadi; ikkalasi ham qabul, alohida fayl tavsiya.
- *TPM/monotonic counter* — Windows'да TPM har doim mavjud emas; ortiqcha murakkablik v1 uchun.

## 3. Spec — xulq + qirra holatlar + test holatlari

### Yangi funksiyalar
- `readAnchor(): Promise<number>` — `license-anchor.dat` decrypt → `highestSeenMs`; fayl yo'q/buzuq → `0` (chaqiruvchi `lic.issuedAt` bilan floor qiladi).
- `writeAnchor(ms: number): Promise<void>` — `max`'ni AES bilan shifrlab yozadi.
- `isLicenseValid(data, localFp, anchorMs)` — sof; `effectiveNow = max(Date.now(), anchorMs, Date.parse(data.issuedAt))`; `< expiry+grace`. (`issuedAt` floor — langar fayli o'chirilgan bo'lsa ham chiqarilgan sanadan oldinga o'tmaydi.)
- `getActiveModules` — `readAnchor` → `isLicenseValid` → agar valid, `writeAnchor(max(anchor, Date.now()))` (langarni oldinga suradi).
- heartbeat-scheduler `writeLicense` yonida `writeAnchor(max(anchor, Date.parse(fresh.issuedAt), Date.now()))`.

### Qirra holatlar
- **Soat orqага (expiry oldiga)** → `effectiveNow` = langar (kelajakdagi) → `expiry+grace`dan katta → **INVALID** (asosiy fix).
- **Halol soat oldinga tuzatish** → `Date.now()` langardan katta → `effectiveNow` unga ergashadi → normal; langar yangilanadi. Muammosiz.
- **Halol orqага tuzatish** (soat noto'g'ri oldinga edi, foydalanuvchi tузатди) → `effectiveNow` langarда "yopishadi" → litsenziya haqiqiy vaqtdan **erta** muddati o'tishi mumkin. Yumshatish: online heartbeat server-vaqti langarni **haqiqatga** qayta anchorlaydi (agar server vaqti mahalliydan kichik bo'lsa `max` uni pasaytirmaydi — lekin bu holatda langar allaqachon inflyatsiyalanган; heartbeat kelajakда normal davom etadi). Kichik tolerantlik oynasi (masalan langar `Date.now() + 24h`dan oshsa ogohlantirish) qo'shish mumkin — v1'да shart emas, izohda qayd.
- **Langar fayli o'chirilgan** → `readAnchor` `0` → `issuedAt` floor ishlaydi → chiqarilgan sanaдан oldinga o'tmaydi; online'да qayta anchorlanadi.
- **VM/fingerprint yo'q** → `getKey` throw → anchor o'qib/yozib bo'lmaydi → `getActiveModules` `[]` (CLI-410 catch bilan birga).

### Test holatlari (`apps/api/src/lib/license.test.ts`)
1. `isLicenseValid(expiredData, fp, anchorMs=expiry+1day)` → `false` (langar orqага surishни bloklaydi), garчи `Date.now()` mock expiry'dan oldin.
2. `isLicenseValid(validData, fp, anchorMs=0)` → `true`; `Date.now()` muddat ichida.
3. `writeAnchor`→`readAnchor` round-trip (AES) bir xil qiymat.
4. `getActiveModules` valid'dan keyin langar oldinga surilgan (`readAnchor` >= oldingi `Date.now()`).
5. Langar fayli yo'q + muddati o'tgan `issuedAt`gа nisbatan → `issuedAt` floor.
6. heartbeat muvaffaqiyati → langar `issuedAt` server-vaqtiга ko'tariladi.

## 4. Implementatsiya rejasi (TDD)

1. **Failing test** — #1: hozirgi `isLicenseValid` faqat `Date.now()` → mock'да `Date.now()` expiry'dan oldin → `true` qaytaradi → kutilган `false` emas → qizil.
2. **Impl** — `license.ts`: `getAnchorPath()` (`getLicensePath()` yonida); `readAnchor`/`writeAnchor` (AES `getKey()` bilan, `writeLicense`/`readLicense` andozasi); `isLicenseValid`'ga `anchorMs` param + `issuedAt` floor + `effectiveNow`; `getActiveModules`'да anchor o'qish/yozish.
3. **Impl** — `license-heartbeat-scheduler.ts`: `writeLicense` yonida langarni server `issuedAt` bilan yangilash (yangi dep `writeAnchor`/`readAnchor` inject qilinadi — sof/testable).
4. **Verify** — `bun test apps/api/src/lib/license.test.ts license-heartbeat-scheduler.test.ts` yashil; `turbo typecheck`.

> Runtime-verifiable (Bun/API) — `Date.now` va `si` mock bilan Linux'да to'liq testlanadi. Real soat-surish faqat jismoniy Windows PC'да qo'lда tasdiqlanadi (ixtiyoriy — mantiq mock bilan qamralган).

## 5. Migratsiya / rollout / xavflar

- **Migratsiya:** langar fayli yo'q → birinchi `getActiveModules` uni `Date.now()` (yoki `issuedAt`) bilan yaratadi. Mavjud litsenziyalarга ta'sir yo'q (langar sekin-asta o'sadi). old-shart (CLI-410 §0) — dala'да litsenziya yo'q.
- **Xavf (halol backward tuzatish):** noto'g'ri-oldinga soat tузатилса litsenziya erta muddati o'tishi mumkin — kam ehtimol; online heartbeat qayta anchorlaydi. Izohда qayd.
- **Xavf (fayl o'chirish):** offline root rollback'ни to'liq to'xtatmaydi (DRM chegarasi) — spec'да aniq (§2). Asosiy "jim rollback" tahdidini to'xtatadi.
- **Xavf (CLI-410 ziddiyat):** langar imzolangan payload'га KIRMASLIGI shart — §3 kelishuvи. Ikki ticket bitta PR'да koordinatsiyalanса toza.
- **Rollback:** anchor tekshiruvini olib tashlash nuqsonni qaytaradi.

## 6. Qabul mezonlari

- [ ] Soat `expiry`dan oldinга surilса muddati o'tgan litsenziya `false` qoladi (langar bloklaydi).
- [ ] Langar `.lic`ning imzolangan payload'iга KIRMAYDI (imzo o'zgarmaydi; CLI-410 bilan mos).
- [ ] Halol oldinга soat siljishida normal ishlaydi; heartbeat langarni server-vaqti bilan yangilaydi.
- [ ] Langar AES bilan shifrlangan alohida faylда; fayl yo'q → `issuedAt` floor.
- [ ] license.test.ts + heartbeat-scheduler test yashil; typecheck toza.

## 7. Ta'sirlangan fayllar

- `apps/api/src/lib/license.ts` — `getAnchorPath`/`readAnchor`/`writeAnchor`; `isLicenseValid` (anchorMs + effectiveNow + issuedAt floor); `getActiveModules` (anchor o'qish/yozish).
- `apps/api/src/lib/license-heartbeat-scheduler.ts` — muvaffaqiyatli heartbeat'да langarni server `issuedAt` bilan yangilash (DI).
- `apps/api/src/lib/license.test.ts`, `license-heartbeat-scheduler.test.ts` — rollback + round-trip + heartbeat-anchor testlari.
