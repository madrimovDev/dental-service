# CLI-387 — Litsenziya bekor qilish real ta'sirga ega emas (Dizayn / Spec)

> **Sana:** 2026-07-05
> **Linear:** CLI-387 (High)
> **Scope:** `apps/api/src/lib/license.ts` (yangi `invalidateLicense`), yangi `apps/api/src/lib/license-heartbeat-scheduler.ts`, `apps/api/src/index.ts` (wiring), `apps/api/src/lib/env-schema.ts` (yangi ixtiyoriy interval env). `apps/desktop` — **o'zgarmaydi** (pastga qarang, §2 — nega).

---

## 1. Topilgan holat (kod o'qish natijasi)

- **`apps/api/src/lib/license-client.ts`** (29 qator, to'liq o'qildi): `sendHeartbeat(licenseKey: string): Promise<LicenseData>` — `getFingerprint()` chaqirib `POST {SUPERVISOR_URL}/v1/heartbeat` yuboradi (`{licenseKey, fingerprint}`). Ichki `post()` helper: `res.ok` bo'lmasa `throw new Error(json?.error?.code ?? 'SUPERVISOR_ERROR')` — ya'ni **xato HTTP status + `error.code` orqali signal beriladi, response body'da `isActive` maydoni YO'Q**. `sendHeartbeat` eksport qilingan, lekin **hech qanday production kodda chaqirilmaydi** — faqat `license-client.test.ts`da.
- **`apps/supervisor-api/src/modules/licenses/licenses.service.ts:49-66`** (`heartbeat()`, to'liq o'qildi) — haqiqiy kontrakt: `lic.isActive === false` bo'lsa `throw Object.assign(new Error('INVALID_KEY'), { status: 403 })`. Fingerprint mos kelmasa — alohida `FINGERPRINT_MISMATCH` (403). Muvaffaqiyatli bo'lsa — `activate()` bilan **bir xil shakl**dagi yangi imzolangan `LicenseData` qaytaradi (`buildResponse()`: `licenseKey, clinicId, modules, expiresAt, gracePeriodDays, issuedAt, signature`), `lastHeartbeatAt` yangilanadi + `licenseEvents` ga `'heartbeat'` yoziladi.
  ⚠️ **Ticket tavsifi noaniq**: "heartbeat response says isActive:false" — bunday maydon yo'q. Haqiqiy signal: **HTTP 403 + `error.code === 'INVALID_KEY'`** (`sendHeartbeat()` reject qiladi, `Error('INVALID_KEY')` bilan). Bu spec shu haqiqiy kontraktga mos yoziladi.
- **`apps/supervisor-api/src/modules/clinics/clinics.routes.ts:134-140`** (`PATCH /:id/deactivate`) — `isActive:false` qo'yadi, o'z izohida "keyingi activate/heartbeat licenses.service.ts'dagi guard orqali 403 bilan rad etadi" deb yozilgan — bu guard **allaqachon to'g'ri ishlaydi** (backend tomon tayyor). Yetishmayotgan yagona qism — **klient hech qachon heartbeat yubormaydi**, shuning uchun bu guard hech qachon ishga tushmaydi.
- **`apps/api/src/lib/license.ts`** (95 qator, to'liq o'qildi): `readLicense()`/`writeLicense()` — AES-256-CBC bilan shifrlangan `.lic` fayl (kalit = fingerprint SHA-256, o'zgarmas — shuning uchun boshqa mashinada ochib bo'lmaydi). `isLicenseValid()` — signature + `expiresAt + gracePeriodDays` tekshiradi, **Supervisor bilan hech qachon qayta bog'lanmaydi**. `getActiveModules()` — **har chaqiruvda faylni qayta o'qiydi** (in-memory cache YO'Q): `readLicense()` → `isLicenseValid()` → `lic.modules` yoki `[]`. Bu muhim: `.lic` faylni o'chirsak, **keyingi darhol so'rovda** `getActiveModules()` `[]` qaytaradi — hech qanday process-restart yoki cache-invalidation kerak emas.
- **`apps/api/src/lib/license-middleware.ts:19-36`** (`requireModule`) — `getActiveModules()` bo'sh bo'lsa 403 `LICENSE_NOT_FOUND`; modul ro'yxatda yo'q bo'lsa 403 `MODULE_DISABLED`. `requireModuleInDesktop` — faqat `process.env.WEB_DIST_DIR` bor bo'lganda faollashadi (Local Desktop signali).
- **`apps/api/src/routes/activate.ts`** (54 qator, to'liq o'qildi) — **`activateLicense()` allaqachon `apps/api` jarayoni ichidan Supervisor'ga chiqadigan `fetch` qiladi** (auth yo'q, `POST /api/activate` route orqali). Ya'ni "api process → Supervisor" outbound-HTTP yo'li **allaqachon mavjud va ishlaydi** — heartbeat shu YO'Q yo'lni qayta ochish emas, mavjudini kengaytirish.
- **`apps/desktop/src/process-manager.ts`** (191 qator, to'liq o'qildi) — Server rejimida `api.exe`ni child process sifatida spawn qiladi (`DATABASE_URL=dental_app`, `REDIS_URL`, `WEB_DIST_DIR`, `RUN_REMINDER_WORKER=true`). Bu — klinika serverida **doimiy ishlab turadigan** yagona process; Electron main process o'zi tray+process-supervisor, litsenziya/fingerprint mantig'iga umuman tegmaydi.
- **`apps/desktop/src/client-reconnect.ts`** (50 qator) — mavjud yagona interval-based fon job, lekin **butunlay boshqa domen**: klient rejimida (bu PC server EMAS) LAN orqali serverni qidiradi, `.lic` bilan aloqasi yo'q (faqat server-rol PC'da `.lic` bor — `license-middleware.ts` izohi: "/activate va /api/activate — license faol bo'lmasa ham ochiq"). DI naqsh: `scheduleInterval`/`clearScheduledInterval` inject qilinadi (`setInterval`/`clearInterval` to'g'ridan-to'g'ri chaqirilmaydi) — testlanuvchanlik uchun. Shu naqsh quyida qayta ishlatiladi.
- **`apps/api/src/index.ts`** (83 qator, to'liq o'qildi) — API process entrypoint (`bun build --compile` shu faylni ixchamlashtiradi `api.exe`ga). Mavjud "background job boot qilish" konvensiyasi: `env.NODE_ENV !== 'test' && env.RUN_REMINDER_WORKER ? startXWorker() : null`, natija o'zgaruvchida saqlanadi, `shutdown()` ichida yopiladi. **Heartbeat scheduler xuddi shu joyga, xuddi shu naqsh bilan qo'shiladi.**
- **`apps/api/src/lib/recall-scheduler.ts`** (28 qator) — loyihaning "davriy job" konvensiyasi **BullMQ repeatable job** (`recallQueue.add(..., { repeat: { pattern: cron } })`), alohida `worker.ts`/in-process worker iste'mol qiladi. Bu — Redis + queue infratuzilmasini talab qiladi.

## 2. Qaror — qayerda scheduling: `apps/api`, Electron EMAS

**`apps/api` process ichida** (`index.ts`ga wiring, `apps/desktop`ga tegilmaydi). Sabablar:

1. **Fingerprint/`.lic` mantig'i allaqachon `apps/api` kodi.** `getFingerprint()` (`systeminformation`), `readLicense`/`writeLicense` (AES, fingerprint-derived kalit), `isLicenseValid` (RSA signature) — hammasi `apps/api/src/lib/license.ts`da, Node/Bun runtime API'lariga bog'liq, Electron main process kodi bilan hech qanday bog'liqligi yo'q.
2. **Outbound-HTTP-to-Supervisor yo'li allaqachon `apps/api`da mavjud va ishlaydi** — `activate.ts` route `activateLicense()`ni xuddi shu processdan chaqiradi (auth'siz, public route). Heartbeat shu **mavjud** yo'lni kengaytiradi (bitta yangi `fetch` chaqiruvi, allaqachon eksport qilingan `sendHeartbeat()`), Electron'dan **yangi** yo'l ochish emas.
3. **`api.exe` — klinika serverida doimiy ishlab turadigan process** (`process-manager.ts` `spawnApi()`, `stdio:'pipe'`, faqat `stopServer()`da SIGTERM). Electron main process — server-rolda faqat process-supervisor+tray+mDNS discovery; klient-rolda (boshqa PC'lar) `.lic` fayl **umuman yo'q** (faqat server-rol PC litsenziyaga ega). Electron'da scheduling qo'ysak, klient-rol PC'larda ma'nosiz kod bo'lardi yoki IPC orqali server-rol tekshiruvi kerak bo'lardi — keraksiz murakkablik.
4. **Electron'ga IPC-bridge qilish — sof duplikatsiya.** Fingerprint/AES/RSA/HTTP mantig'ini Electron'ga ko'chirish (yoki `apps/api`dan import qilish — Electron `node_modules` grafigi boshqa) hech qanday foyda bermaydi, faqat ikkinchi joyda bir xil kodni ushlab turish xarajatini qo'shadi.
5. **Mavjud konvensiya shuni tasdiqlaydi:** `index.ts`dagi barcha "background periodic job" (`startReminderWorker`, `startRecallWorker`+`registerRecallScheduler`) — hammasi `apps/api` process ichida, Electron'da emas.
6. **`index.ts` (in-process) — `worker.ts`ga qarshi majburiy tanlov, uslub masalasi emas.** Ticket "apps/desktop process-manager yoki apps/api worker" deb ikkita variant taklif qiladi — lekin `apps/api/src/worker.ts` (alohida dedicated process, `bun run src/worker.ts`) Local Desktop'da **hech qachon spawn qilinmaydi**: `process-manager.ts` `spawnApi()` faqat bitta binary — `api.exe`ni ishga tushiradi, `RUN_REMINDER_WORKER: 'true'` env bilan (`process-manager.ts:151`) — bu reminder/recall workerlarni **`api.exe` ichida in-process** ishlatadi (`index.ts:45-53`ning `env.RUN_REMINDER_WORKER` shart-branchi), alohida `worker.ts` processi klinika PC'sida umuman yo'q. Demak heartbeat scheduler `worker.ts`ga qo'yilsa, u Local Desktop'da **hech qachon ishga tushmagan bo'lardi** — bu tanlov emas, `index.ts` (in-process) yagona ishlaydigan variant.

**Xulosa:** `apps/desktop/src/*` fayllarning hech biri bu ticket doirasida o'zgarmaydi.

## 3. Interval mexanizmi — `setInterval` (BullMQ EMAS)

`recall-scheduler.ts` — loyihaning "davriy job" konvensiyasi BullMQ repeatable job. **Bu ticket uchun ataylab BullMQ ISHLATILMAYDI**, sabab aniq belgilanishi kerak (reviewer recall-precedentga qarab bounce qilib yubormasligi uchun):

- Recall scan — **tenant-scoped** ish (har tenant uchun alohida due-check, cross-tenant scan). Litsenziya heartbeat — **bitta global** amal: bitta `.lic`, bitta `licenseKey`, bitta Supervisor so'rovi. Queue/job-per-tenant infratuzilmasi bu yerda ortiqcha.
- BullMQ ishlatish Redis'ga bog'liqlik qo'shadi — hozir ham Local Desktop'da Valkey bor (`process-manager.ts` `spawnValkey()`), lekin bu **faqat Local Desktop uchun** kerakli bo'lgan yagona global cron uchun to'liq queue-consumer/producer arxitekturasi qurish ortiqcha og'irlik.
- `client-reconnect.ts` allaqachon shu loyihada **aynan shu turdagi muammo** (bitta global, tenant'siz, davriy fon tekshiruv) uchun `setInterval` + injectable `scheduleInterval`/`clearScheduledInterval` naqshini o'rnatgan — testlanuvchi, Redis'siz. Heartbeat scheduler shu naqshni takrorlaydi (`apps/api` tomonida, Electron emas).

## 4. Interval davomiyligi — 4 soat

DoD "every few hours" deydi. Aniq tanlov: **4 soat** (`FOUR_HOURS_MS = 4 * 60 * 60 * 1000`), env orqali override qilinadigan (`LICENSE_HEARTBEAT_INTERVAL_MS`, loyihaning `*_MS` env-tunable konvensiyasiga mos — `env-schema.ts`dagi `AUTH_RATE_LIMIT_WINDOW_SEC` va h.k. bilan bir xil pattern).

Sabab:
- `gracePeriodDays` **kunlarda** o'lchanadi (test/production default — 30 kun) — 4 soatlik kadence grace period'ga nisbatan juda kichik xato marjasi qoldiradi (bir nechta ketma-ket muvaffaqiyatsiz heartbeat ham grace'ni tugatmaydi).
- Bekor qilingan klinika **bir ish kuni ichida** bloklanadi (4 soat — ish kuni davomida kamida 1-2 marta urinish).
- Supervisor'ga so'rov hajmi ahamiyatsiz (bitta klinika = bitta so'rov/4 soat; `activate` route'da IP rate-limit bor, lekin `heartbeat` route'da hech qanday rate-limit yo'q — kod o'qishda tasdiqlandi, `licenses.routes.ts`da faqat `zValidator`, rate-limit yo'q. 4 soatlik kadence bu yo'qlikni muammo qilmaydi).
- Boot'da **darhol bir marta** ham ishga tushiriladi (interval'ning birinchi tick'ini 4 soat kutmasdan) — server qayta ishga tushganda (masalan tarmoq tiklangandan keyin) bekor qilingan litsenziya darhol aniqlanadi, keyingi to'liq intervalgacha kutilmaydi.

## 5. `.lic` invalidatsiya mexanizmi

Yangi `invalidateLicense(): Promise<void>` (`apps/api/src/lib/license.ts`) — `.lic` faylni `unlink` qiladi (`ENOENT` e'tiborsiz qoldiriladi — allaqachon yo'q bo'lsa muammo emas).

**Nega bu yetarli ("darhol yopiladi"):** `getActiveModules()` **har chaqiruvda** `readLicense()`ni qayta chaqiradi — in-memory cache YO'Q (`license.ts` to'liq o'qildi, tasdiqlandi). Fayl o'chirilgach, keyingi **istalgan** so'rov (`requireModule` middleware orqali) darhol `readLicense() === null` → `getActiveModules() === []` → 403 `LICENSE_NOT_FOUND` oladi. Hech qanday process-restart, cache-bust yoki qo'shimcha signal kerak emas — bu ticketning "invalidate/update the .lic file so module-gating closes immediately" talabini so'zma-so'z qanoatlantiradi.

**Qachon invalidatsiya qilinadi — faqat `INVALID_KEY`:**

`sendHeartbeat()` rad etilganda uchta amaliy holat bor:
1. **`INVALID_KEY`** — Supervisor `lic.isActive === false` deb topdi (deaktivatsiya). **Bu ticketning aniq DoD holati** → invalidatsiya.
2. **`FINGERPRINT_MISMATCH`** — Supervisor saqlagan fingerprint bu so'rovnikidan farq qiladi. **Bu ticket doirasida amalda deyarli bo'lmaydigan holat**: `.lic` faylning AES kaliti fingerprint'dan olinadi (`getKey()`) — agar shu mashinaning fingerprint'i o'zgarsa, `readLicense()` faylni **umuman ocholmay** `null` qaytaradi (decrypt xato) → scheduler `sendHeartbeat()`ni hech chaqirmaydi (pastga, `runLicenseHeartbeatCheck` — "no cached license → no-op"). Demak amaliy `FINGERPRINT_MISMATCH` — faqat **admin `reactivate` orqali litsenziyani boshqa mashinaga qayta bog'lasa** yuzaga keladi (`licenses.routes.ts` `POST /reactivate`, admin JWT talab qiladi) — bu **alohida feature** (litsenziyani boshqa mashinaga ko'chirish), CLI-387'ning "deaktivatsiya" DoD'idan tashqarida. **Bu PR uni invalidatsiya qilmaydi** — log qiladi, xolos. Agar kelajakda kerak bo'lsa — alohida ticket + alohida test bilan, shu branch bilan aralashtirilmaydi.
3. **Tarmoq xatosi / `SUPERVISOR_ERROR` / `FINGERPRINT_UNAVAILABLE` / JSON parse xatosi** — vaqtinchalik yoki mahalliy-muhit muammosi, Supervisor'ning haqiqiy qarori emas. **Invalidatsiya qilinmaydi** — global constraint (§6).

Muvaffaqiyatli heartbeat (200) — Supervisor **yangi imzolangan** `LicenseData` qaytaradi (xuddi `activate` kabi shakl) → `writeLicense(fresh)` bilan cache yangilanadi. Bu ayni paytda `modules.routes.ts`dagi izohni ("Modul ro'yxatini yangilash — keyingi heartbeat'da klientga yetadi") ham to'g'ridan-to'g'ri amalga oshiradi — Supervisor tomonidan operator litsenziya modullarini o'zgartirsa, shu mexanizm orqali klinika serveriga tarqaladi (bu ticketning to'g'ridan-to'g'ri DoD'i emas, lekin bepul yon-natija, chunki bir xil `LicenseData` javobi ishlatiladi).

**Cross-process eslatma:** `apps/api` `.lic` faylni o'chiradi; Electron `hasLicense()` (`license-status.ts`, mavjudlik-only tekshiruvi) buni faqat **keyingi restart/reconnect'da** o'qiydi (`main.ts` boot vaqtida bir marta chaqiriladi) — ammo bu muammo emas: `requireModuleInDesktop` gate allaqachon **har so'rovda** `apps/api`ning o'zi ichida ishlaydi (Electron'ning UI-redirect logikasidan mustaqil), shuning uchun modul-gating darhol yopiladi hatto Electron hali eski oynani ko'rsatib tursa ham — foydalanuvchi keyingi amal (masalan sahifani yangilash) qilganda 403 oladi. Electron faqat **navbatdagi to'liq restart**da `/activate`ga qayta yo'naltiradi (kichik, qabul qilinadigan UX kechikish, bu ticket doirasidan tashqarida).

## 6. Global constraint — offline/grace-period ishlash buzilmasin

**Tarmoq xatosi heartbeat davomida bekor qiluvchi klinikani jazolamasligi shart** — internetsiz klinika grace period tugagunga qadar ishlashda davom etishi kerak, tarmoq xatosida qattiq to'xtab qolmasligi kerak.

Amaliyotda: `runLicenseHeartbeatCheck()` faqat aniq `INVALID_KEY` xato kodida invalidatsiya qiladi (§5, holat 1); qolgan barcha xato turlari (`fetch` reject — DNS/timeout/ECONNREFUSED, `FINGERPRINT_MISMATCH`, `SUPERVISOR_ERROR`, `FINGERPRINT_UNAVAILABLE`) faqat log qilinadi, `.lic` fayl tegilmaydi. Mahalliy `isLicenseValid()` (signature + `expiresAt + gracePeriodDays`) — mustaqil, Supervisor bilan aloqa yo'qligidan qat'i nazar ishlayveradi (`license.ts` allaqachon shunday yozilgan, o'zgarmaydi).

**Diqqat (fix qilinmaydi, faqat qayd etiladi):** `license-client.ts`dagi `post()` helperda `fetch`ga hech qanday timeout berilmagan — Supervisor "osilib qolsa" (javob bermasa, lekin connection ochiq qolsa), promise cheksiz kutishi mumkin. Bu ticket buni **tuzatmaydi** (scope creep) — amaliy ta'sir cheklangan: heartbeat "fire-and-forget" tarzda chaqiriladi (natijasini kutib boshqa hech narsa bloklanmaydi, server startup ham, keyingi interval tick ham), shuning uchun bitta "osilib qolgan" chaqiruv keyingi tick'larni to'xtatmaydi (`setInterval` mustaqil ishlaydi), faqat o'sha bitta tekshiruv cheksiz "pending" holatda qoladi. Kelajakda alohida ticket sifatida ko'rib chiqilishi mumkin (`AbortSignal.timeout(...)`).

## 7. DoD (ticket'dan, aniqlashtirilgan)

- [ ] Yangi `invalidateLicense()` (`apps/api/src/lib/license.ts`) — `.lic` faylni o'chiradi, `ENOENT` xavfsiz e'tiborsiz qoldiriladi.
- [ ] Yangi `apps/api/src/lib/license-heartbeat-scheduler.ts`: `runLicenseHeartbeatCheck(deps)` (bitta tekshiruv, to'liq injectable — unit-testable) + `startLicenseHeartbeatScheduler(deps)` (interval wrapper, `client-reconnect.ts` DI naqshi, `stop()` funksiyasini qaytaradi).
- [ ] `apps/api/src/index.ts` — scheduler boot'da ishga tushiriladi, **faqat** `env.NODE_ENV !== 'test' && env.WEB_DIST_DIR` bo'lganda (Local Desktop signali, `requireModuleInDesktop` bilan bir xil); `shutdown()` ichida `stop()` chaqiriladi.
- [ ] `apps/api/src/lib/env-schema.ts` — yangi ixtiyoriy `LICENSE_HEARTBEAT_INTERVAL_MS` (default 4 soat).
- [ ] Muvaffaqiyatli heartbeat — `writeLicense(fresh)` bilan cache yangilanadi (modules/expiresAt/signature yangilanadi).
- [ ] `INVALID_KEY` xatosida — `invalidateLicense()` chaqiriladi; boshqa barcha xato turlarida — chaqirilmaydi (log-only).
- [ ] Integratsion test: "faol litsenziya → so'rov o'tadi (200) → Supervisor heartbeat `INVALID_KEY` qaytaradi → keyingi so'rov 403 `LICENSE_NOT_FOUND`" — before/after o'tish sifatida, real `readLicense`/`getActiveModules`/`requireModule` zanjiri ustida (Postgres shart emas — pastga, plan Task 4).
- [ ] Regressiya-himoya testi: tarmoq xatosi (mock `fetch` reject) heartbeat davomida — litsenziya invalidatsiya QILINMAYDI, so'rov 200 bo'lib qolaveradi (offline resilience, §6).
