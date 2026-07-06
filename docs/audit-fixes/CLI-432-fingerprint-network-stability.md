# CLI-432 — Fingerprint default-interface MAC'ga tayanadi → tarmoq o'zgarishida lockout

> Audit: AUDIT-2026-07-06.md · M19. Desktop-only.

## 1. Muammo va ildiz sabab

`getFingerprint` — `apps/api/src/lib/license.ts:32-43`:

```ts
const primaryMac = (Array.isArray(nets) ? nets : [nets]).find((n) => n.default)?.mac ?? '';
...
const raw = `${cpu.manufacturer}:${cpu.brand}:${system.uuid}:${system.serial}:${primaryMac}`;
return createHash('sha256').update(raw).digest('hex');
```

Fingerprint tarkibiga **default (asosiy) tarmoq interfeysi MAC** kiradi. Bu qiymat beqaror:

- Foydalanuvchi Wi-Fi'dan Ethernet'ga (yoki aksincha) o'tsa — default interfeys va uning MAC'i o'zgaradi.
- USB tarmoq adapteri ulanadi/uziladi, VPN/virtual adapter default bo'lib qoladi.

MAC o'zgarsa → fingerprint o'zgaradi. **Ikki og'riqli oqibat (ildiz sababning ikki qatlami):**

1. **At-rest kalit buziladi (asosiy blast-radius).** `getKey()` (license.ts:45-51) AES kalitini **fingerprint'dan** chiqaradi. Fingerprint o'zgarsa `readLicense` (license.ts:65-78) `.lic`'ni **decrypt qila olmaydi** → `catch` → `null` → `getActiveModules` → `[]` → `LICENSE_NOT_FOUND`. Bu CLI-410 imzo tekshiruvidan **mustaqil** yuz beradi.
2. Supervisor'da eski fingerprint saqlangan — mashina qayta `activate` qilsa `FINGERPRINT_MISMATCH` (licenses.service.ts:37-38). Self-heal imkonsiz; faqat admin `reactivate` (licenses.service.ts:68) tiklaydi.

## 2. Dizayn qarori

**Fix (brief, tavsiya): fingerprint tarkibidan `primaryMac`'ni olib tashlash** — barqaror komponentlarga tayanish:

```ts
const raw = `${cpu.manufacturer}:${cpu.brand}:${system.uuid}:${system.serial}`;
```

`system.uuid` (SMBIOS/DMI UUID) va `system.serial` — apparat-darajа, tarmoqdan mustaqil, ko'chib yurishda o'zgarmaydi.

**Barqarorlik ↔ nusxa-himoya trade-off:**
- MAC olib tashlansa spoofing biroz osonlashadi (MAC allaqachon dasturiy o'zgartiriladigan, kuchsiz komponent edi — real himoya emas).
- Asosiy nusxa-himoya baribir **imzolangan payload'dagi fingerprint** (CLI-410) — u qanday hisoblansa ham, Supervisor bitta fingerprint'ga bog'laydi va boshqa mashinada tekshiruv `payload.fingerprint !== localFingerprint` bilan yiqiladi. MAC olib tashlanishi bu himoyani zaiflashtirmaydi — u faqat *o'sha mashina*da fingerprint'ni barqaror qiladi (false-lockout'ни kamaytiradi).
- MAC — anti-copy signalining eng zaif bo'g'ini, lekin false-lockout'ning eng katta manbai. Trade-off aniq: olib tashlash foydali.

**Rad etilgan alternativa — "M-of-N komponent tolerantligi"** (masalan 5 tadan 4 tasi mos kelsa OK): AES-kalit chiqarish uchun yaroqsiz — kalit determinlashtirilgan bo'lishi shart, "yaqin" mos kelish decrypt'ni ta'minlamaydi. Bu yondashuv fingerprint'ni imzoga solib alohida "match" mantiqi (CLI-410) bilan ishlashi mumkin edi, lekin AES kalitini ham qandaydir barqaror kanonик qiymatdan chiqarishni talab qiladi — murakkablik ortiqcha, `uuid+serial` allaqachon yetarlicha barqaror.

## 3. Spec — xulq + qirra holatlar + test holatlari

### Yangi xulq
- `getFingerprint` `primaryMac`'ni hisoblamaydi va `raw`'ga qo'shmaydi.
- **Mavjudlik guard'i o'zgaradi:** hozir `if (!system.uuid && !system.serial && !primaryMac) throw FINGERPRINT_UNAVAILABLE` (license.ts:37). MAC olib tashlangach: `if (!system.uuid && !system.serial) throw FINGERPRINT_UNAVAILABLE`. Ya'ni endi faqat MAC bilan aniqlanadigan muhit qo'llab-quvvatlanmaydi — bu to'g'ri, VM/konteynerda `uuid`/`serial` bo'lmasa baribir qo'llanmaydi (izoh: license.ts:36).
- `si.networkInterfaces()` chaqiruvi **olib tashlanadi** (`Promise.all`'dan) — foydalanilmaydi.

### Qirra holatlar
- **Wi-Fi ↔ Ethernet almashtirish** → fingerprint o'zgarmaydi → `.lic` decrypt bo'ladi → lockout yo'q.
- **Faqat serial (uuid yo'q)** yoki **faqat uuid** → fingerprint hisoblanadi (guard o'tadi).
- **Ikkalasi ham yo'q (VM)** → `FINGERPRINT_UNAVAILABLE` (o'zgarmaydi).
- **CLI-410 bilan o'zaro ta'sir:** fingerprint endi imzolangan payload'da. `getFingerprint` qiymati o'zgargani uchun barcha yangi aktivatsiyalar yangi (MAC'siz) fingerprint bilan imzolanadi — old-shart (CLI-410 §0) tufayli eski aktivatsiya yo'q, muammosiz.

### Test holatlari (`apps/api/src/lib/license.test.ts`)
1. `si` mock: bir xil `uuid`/`serial`, **turli MAC** (yoki default interfeys yo'q) → `getFingerprint` **bir xil** hash qaytaradi.
2. `uuid` & `serial` ikkalasi bo'sh → `FINGERPRINT_UNAVAILABLE` throw.
3. `raw` string'da MAC yo'qligi (regression) — hash `cpu:system.uuid:system.serial` kanonиdan hisoblangan.
4. **write→read round-trip** (mavjud test'ni kengaytirish): `writeLicense` keyin MAC "o'zgaradi" (mock) — `readLicense` hali ham to'g'ri decrypt qiladi (MAC kalitga kirmagani uchun).

## 4. Implementatsiya rejasi (TDD)

1. **Failing test** — #1 va #4: hozirgi kod MAC'ni qo'shadi → turli MAC'da hash farq qiladi / decrypt buziladi → test qizil.
2. **Impl** — license.ts:33 `Promise.all`'dan `si.networkInterfaces()` olib tashlash; `primaryMac` satrini (34) o'chirish; guard'ni (37) `!system.uuid && !system.serial`'ga; `raw`'ni (41) MAC'siz qilish.
3. **Verify** — `bun test apps/api/src/lib/license.test.ts` yashil; `turbo typecheck`.

> Runtime-verifiable (Bun/API) — `systeminformation` mock bilan Linux'da to'liq test qilinadi. Real apparat MAC-almashtirish xatti-harakati faqat jismoniy Windows PC'da qo'lda tasdiqlanadi (Wi-Fi↔Ethernet), lekin mantiq mock bilan qamraladi.

## 5. Migratsiya / rollout / xavflar

- **Migratsiya:** old-shart (CLI-410 §0) — dala'da `.lic` yo'q. Agar bo'lsa: fingerprint hisoblash o'zgargani uchun **mavjud `.lic` decrypt bo'lmaydi** (kalit boshqa) → foydalanuvchi qayta `activate` qiladi. Lekin Supervisor'da **eski (MAC'li) fingerprint** saqlangan → `FINGERPRINT_MISMATCH` → **admin `POST /v1/reactivate`** (licenses.routes.ts, adminJwt) yangi fingerprint'ni yozib qayta faollashtiradi. Bu allaqachon aktivlangan mashinalar uchun **yagona tiklash yo'li** — spec'da aniq ko'rsatildi.
- **Xavf:** CLI-410 va CLI-432 ikkalasi ham `getFingerprint`/`isLicenseValid`'ga tegadi — bitta koordinatsiyalangan o'zgarishda qilinsa toza. Agar alohida yetkazilsa, CLI-432 birinchi kelib fingerprint qiymatini o'zgartirsa, mavjud aktivatsiyalar reactivate talab qiladi (dala'da yo'q — muammosiz).
- **Xavf:** anti-copy biroz zaiflashadi — qabul qilingan trade-off (§2), asosiy himoya imzolangan fingerprint (CLI-410).

## 6. Qabul mezonlari

- [ ] `getFingerprint` MAC'dan mustaqil — turli MAC'da bir xil hash.
- [ ] `.lic` MAC o'zgargandan keyin ham decrypt bo'ladi (round-trip test).
- [ ] `uuid`&`serial` yo'q → `FINGERPRINT_UNAVAILABLE`.
- [ ] license.test.ts yashil; typecheck toza.

## 7. Ta'sirlangan fayllar

- `apps/api/src/lib/license.ts` — `getFingerprint` (MAC olib tashlash, guard, raw), `Promise.all` tozalash.
- `apps/api/src/lib/license.test.ts` — barqarorlik + round-trip testlari.
- (jarayon) mavjud aktivlangan mashinalar uchun `reactivate` — Supervisor kod o'zgarishi shart emas (mavjud endpoint).
