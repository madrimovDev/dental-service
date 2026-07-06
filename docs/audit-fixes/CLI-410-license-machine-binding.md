# CLI-410 — Litsenziya imzosi mashinaga bog'lanmagan (bitta litsenziya cheksiz o'rnatish)

> Audit: AUDIT-2026-07-06.md · H6. Desktop-only (Local Desktop, CLI-338). Cloud/dev'da `.lic` yozilmaydi — ta'sir yo'q.

## 0. Umumiy old-shart (uch ticket uchun umumiy)

Local Desktop mahsuloti **hali mijozga yetkazilmagan** (lokal `main`, push'siz — MEMORY.md). Ya'ni **dala'da (production) faol `.lic` fayllar YO'Q**. Shu sabab CLI-410/411/432'ning "eski payloadlarni migratsiya qilish" bo'limlari amalda **N/A** — majburiy qayta-aktivatsiya (`re-activate`) tekin. Agar bu taxmin noto'g'ri bo'lsa (allaqachon tarqatilgan litsenziya bor), quyidagi `reactivate` yo'li majburiy bo'ladi.

---

## 1. Muammo va ildiz sabab

RSA-imzolangan payload'da mashina **fingerprint'i YO'Q**.

- Supervisor `buildResponse` imzolaydigan payload — `apps/supervisor-api/src/modules/licenses/licenses.service.ts:8-21` — faqat `{ licenseKey, clinicId, modules, expiresAt, gracePeriodDays, issuedAt }` dan iborat. `fingerprint` DB'da saqlanadi (`licenses.fingerprint`, schema.ts:31) lekin **imzoga kirmaydi**.
- Klient `isLicenseValid` — `apps/api/src/lib/license.ts:80-88` — faqat imzo + `expiresAt + grace` tekshiradi. Payload'da fingerprint bo'lmagani uchun **qaysi mashinaga tegishli ekanini tekshira olmaydi**.
- At-rest AES qatlami (`getKey()` fingerprint'dan kalit chiqaradi — license.ts:45-51) himoya emas: mashina egasi o'z `.lic`'ini decrypt qila oladi yoki `/v1/activate` javobini (tarmoqda, ochiq JSON) ushlaydi. Machine B'da `writeLicense(stolenPayload)` (license.ts:53-63) payload'ni B'ning fingerprint'i bilan **qayta shifrlaydi** — imzo hali ham amal qiladi, chunki imzo fingerprint'ni qamramaydi.

**Natija:** bitta imzolangan payload cheksiz mashinada ishlaydi. CLI-401 (public key almashtirilgandan) keyin ham qoladi — bu boshqa nuqson.

## 2. Dizayn qarori

**DECISION (brief):** aktivatsiya paytida fingerprint'ni imzolangan payload'ning **ichiga** kiritish.

- Supervisor `activate` fingerprint'ni saqlaydi (allaqachon qiladi, licenses.service.ts:32-36) VA `fingerprint`'ni o'z ichiga olgan imzolangan `LicenseData` chiqaradi.
- `heartbeat` ham fingerprint'ni o'z ichiga olgan payload'ni **qayta imzolaydi** (heartbeat javobi `writeLicense` bilan cache'ni yangilaydi — license-heartbeat-scheduler.ts:44).
- Klient `isLicenseValid` imzoni tekshiradi VA `payload.fingerprint === localFingerprint` ni tekshiradi.

**Rad etilgan alternativalar:**
- *Faqat at-rest AES'ga tayanish* — hozirgi holat, buzuq (payload ochiq oqadi).
- *Supervisor'da har heartbeat'da online tekshirish* — offline-resilience'ni buzadi (global constraint, heartbeat-scheduler §6); klient offline'da ishlashi kerak.

## 3. Spec — xulq + qirra holatlar + test holatlari

### Payload sxemasi o'zgarishi
`LicenseData` (license.ts:8-16) ga **`fingerprint: string`** qo'shiladi:
```
{ licenseKey, clinicId, modules, expiresAt, gracePeriodDays, issuedAt, fingerprint, signature }
```
Supervisor `buildResponse` payload'ining imzolangan qismiga `fingerprint` kiradi. `isLicenseValid`'dagi `const { signature, ...payload } = data` avtomatik `fingerprint`'ni imzolangan to'plamga qo'shadi (chunki u payload maydoni).

> ⚠️ **CLI-437 bilan kelishuv:** CLI-437 monotonik anchor qo'shadi, lekin anchor **imzolangan payload'ga KIRMAYDI** (Supervisor uni imzolamaydi). CLI-437 anchor'ni alohida faylda/maydonda saqlaydi va `isLicenseValid`'da destructure bilan chiqarib tashlaydi. `fingerprint` esa imzoning **ichida**. Ikki ticket bitta `isLicenseValid` funksiyasiga tegadi — birgalikda: `const { signature, ...payload } = data` (fingerprint payload'da qoladi); anchor esa `data`da emas, alohida o'qiladi.

### `isLicenseValid` yangi xulq (license.ts:80-88)
1. `verifyLicenseSignature(payload, signature, pubKey)` — false bo'lsa `false`.
2. **YANGI:** `payload.fingerprint` yo'q (undefined — eski payload) → `false` (rad et, majburiy qayta-aktivatsiya).
3. **YANGI:** `payload.fingerprint !== await getFingerprint()` → `false`.
4. `Date.now() < expiry + grace` (mavjud).

> `isLicenseValid` hozir **sync**. Fingerprint hisoblash `async` (`getFingerprint`). Ikki variant: (a) `isLicenseValid`'ni `async` qilish (chaqiruvchilar: `getActiveModules` license.ts:92 — allaqachon async; heartbeat-scheduler test'lari) yoki (b) `getFingerprint()`'ni chaqiruvchida bir marta hisoblab, `isLicenseValid(data, localFp)` parametr sifatida berish. **Tavsiya: (b)** — sof funksiya bo'lib qoladi, testda fingerprint mock qilish oson, `getActiveModules` bitta `await getFingerprint()` qiladi.

### Qirra holatlar
- **Eski (fingerprint'siz) payload** — rad etiladi (undefined !== localFp), foydalanuvchi `/activate`'ga yo'naltiriladi. Old-shart §0 tufayli dala'da bunday fayl yo'q.
- **O'g'irlangan payload machine B'da** — B'da `writeLicense` B fingerprint bilan qayta shifrlaydi va o'qiy oladi, lekin `payload.fingerprint` (A'niki) `!== getFingerprint()` (B'niki) → `false`. **Blok qilinadi.**
- **Heartbeat qayta imzolash** — yangi javob ham fingerprint'ni imzolaydi; agar Supervisor'dagi `fingerprint` NULL bo'lsa (aktivlanmagan) heartbeat rad etiladi (CLI-411).
- **VM/konteyner** — `getFingerprint` `FINGERPRINT_UNAVAILABLE` throw qiladi (license.ts:37); `isLicenseValid`'ni chaqiruvchi buni ushlab `[]` qaytarishi kerak (getActiveModules mavjud `try` yo'q — qo'shish kerak).

### Test holatlari (`apps/api/src/lib/license.test.ts`)
1. `isLicenseValid(validPayloadWithMatchingFp, localFp)` → `true`.
2. `isLicenseValid(payloadWithFpForMachineA, machineB_fp)` → `false` (imzo to'g'ri, fingerprint mos emas).
3. `isLicenseValid(legacyPayloadNoFingerprint, localFp)` → `false`.
4. Imzo buzilgan (fingerprint bor lekin signature noto'g'ri) → `false`.
5. `getActiveModules` — fingerprint mos kelmasa `[]` qaytaradi.
6. (Supervisor, `licenses.test.ts`) `activate` javobidagi payload `fingerprint` maydonini o'z ichiga oladi va `verifyLicenseSignature` fingerprint bilan birga o'tadi.

## 4. Implementatsiya rejasi (TDD)

1. **Failing test** — license.test.ts'ga #2 (machine B mismatch) va #3 (legacy) qo'shish; hozirgi `isLicenseValid` fingerprint bilmaydi → o'tib ketadi (noto'g'ri) → test qizil bo'lishi uchun signature imzolangan to'plamga fingerprint kiritilgan sxema kutiladi.
2. **Supervisor impl** — `buildResponse` (licenses.service.ts:8-21) payload'iga `fingerprint: lic.fingerprint` qo'shish. `activate`/`heartbeat` allaqachon `fingerprint`'ni biladi (`{ ...lic, fingerprint }`). ⚠️ `heartbeat` (`buildResponse(lic, ...)`) — `lic.fingerprint` NULL bo'lishi mumkin (CLI-411 buni hal qiladi: NULL heartbeat rad etiladi, shuning uchun bu yerga yetganda fingerprint doim mavjud).
3. **Core sxema** — `LicenseData` (license.ts:8-16) ga `fingerprint: string`.
4. **Klient impl** — `isLicenseValid(data, localFp)` (2-3 qadam yuqorida); `getActiveModules` `getFingerprint()`'ni bir marta hisoblab beradi + `FINGERPRINT_UNAVAILABLE` `try/catch` → `[]`.
5. **Verify** — `bun test apps/api/src/lib/license.test.ts` + supervisor `licenses.test.ts` yashil; `turbo typecheck`.

> Runtime-verifiable (Bun/API + Supervisor) — Linux'da to'liq test qilinadi. Fingerprint'ning real qiymati `systeminformation`'ga bog'liq, lekin test'da `getFingerprint` mock qilinadi.

## 5. Migratsiya / rollout / xavflar

- **Migratsiya:** old-shart §0 — dala'da `.lic` yo'q → hech narsa. Agar bor bo'lsa: eski payload rad etiladi → foydalanuvchi `/activate` qiladi → Supervisor'da fingerprint allaqachon bog'langan bo'lsa `FINGERPRINT_MISMATCH` bo'lmaydi (o'sha mashina), yangi imzolangan payload keladi. **Boshqa mashinaga ko'chgan bo'lsa** — admin `POST /v1/reactivate` (licenses.routes.ts, adminJwt) qiladi.
- **Xavf:** `getFingerprint` VM/CI'da throw qiladi — `getActiveModules` catch qilmasa desktop start'da xato. Catch qo'shiladi.
- **Xavf:** supervisor va klient sxema **lockstep** — supervisor fingerprint qo'shmasa, klient hamma litsenziyani rad etadi. Ikkalasi bitta PR'da.
- **Rollback:** klient tekshiruvini `payload.fingerprint` mavjud bo'lsagina qo'llash mumkin edi, lekin bu nuqsonni qaytaradi — qilinmaydi.

## 6. Qabul mezonlari

- [ ] Supervisor `activate`/`heartbeat` javobi `fingerprint` maydonini o'z ichiga oladi va imzo shu maydonni qamraydi.
- [ ] Machine A uchun imzolangan payload machine B'da `isLicenseValid` → `false`.
- [ ] Fingerprint'siz (legacy) payload → `false`.
- [ ] Mos fingerprint + to'g'ri imzo + muddat ichida → `true`.
- [ ] `turbo typecheck` toza; license.test.ts + licenses.test.ts yashil.

## 7. Ta'sirlangan fayllar

- `apps/api/src/lib/license.ts` — `LicenseData` + `isLicenseValid` (fingerprint tekshiruvi) + `getActiveModules` (fp hisoblash + catch).
- `apps/supervisor-api/src/modules/licenses/licenses.service.ts` — `buildResponse` payload + fingerprint.
- `apps/api/src/lib/license.test.ts` — yangi test holatlari.
- `apps/supervisor-api/src/modules/licenses/licenses.test.ts` — imzo fingerprint'ni qamrashini tasdiqlash.
- (bog'liq) `apps/api/src/lib/license-heartbeat-scheduler.ts` — qayta imzolangan payload'ni cache qiladi (kod o'zgarmasligi mumkin, sxema orqali).
