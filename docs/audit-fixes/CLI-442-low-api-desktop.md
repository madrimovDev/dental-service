# CLI-442 — LOW-E: API cross-cutting + desktop/Postgres hardening

> Manba: `AUDIT-2026-07-06.md` §LOW. 10 sub-item. Har biri mustaqil, kichik.
> Tamoyil: RLS `getDb(c)` tx-bound, audit `deps.audit.record`, kun chegarasi Asia/Tashkent (UTC+5, DST yo'q).

---

## 1. Kun oralig'i `…23:59:59.999` sub-ms bo'shlig'i → `>=start AND <keyingiKun`

**Muammo**
- `reports.service.ts:43-46` (`tashkentRange`) va `payroll.service.ts:31-32`: oxir `new Date(\`${to}T23:59:59.999+05:00\`)` + `between(...)` (inklyuziv). Postgres `timestamptz` mikrosoniya aniqlikda — `23:59:59.9995` kabi qiymat `.999` va keyingi kun `00:00:00` orasida qolib, `between`dan tushib qoladi. Barcha pul hisobotlari + payroll tizimli sub-ms yo'qotishga ega (audit line 151).

**Fix yondashuvi**
- Yarim-ochiq interval: `>= start AND < nextDayStart`, bunda `nextDayStart = new Date(\`${to}T00:00:00+05:00\`)` + 1 kun (yoki `to+1` sanasi `00:00:00+05:00`). `between` o'rniga `and(gte(col, start), lt(col, nextStart))`.
- Bir xil naqsh `cashier.service.ts` (list 43-53, `dailySummary` 354-358)da ham bor — izchillik uchun yagona helperga chiqarib, uchala modulda ishlatish tavsiya (ixtiyoriy, alohida commit).

**Qabul**
- Kun oxiridagi sub-ms tranzaksiyalar hisobot/payroll oralig'iga kiradi.
- Kun chegarasi hech qanday tranzaksiyani ikki kunda ham hisoblamaydi (yarim-ochiq).

---

## 2. `transferOwnership`: member-guard yo'q + audit atomik emas

**Muammo**
- `tenants.service.ts:64-73` (`transferOwnership`): yangi owner faqat *mavjudligi* tekshiriladi (65-66), lekin joriy tenantga **a'zo** ekani emas. Har qanday platform useriga (klinikaga aloqasi yo'q) egalik o'tkazish mumkin.
- Atomiklik: `deps.db` (xom pool, request-tx `getDb(c)` emas) — `update` (69-73) va `audit.record` (76-83) alohida statementlar, bir tranzaksiyada emas. Audit yozuvi fail bo'lsa egalik allaqachon o'zgargan (izsiz). Xuddi shu naqsh `update()` (27-41)da ham.

**Fix yondashuvi**
- Member-guard: `input.newOwnerUserId` uchun `userAssignments`da (`tenantId`, `userId`, `isActive`) aktiv assignment borligini tekshirish; yo'q bo'lsa `user.not_member`. **Eslatma:** owner assignmentsiz bo'lishi mumkin (`auth.service.ts:352` — owner path), shuning uchun guard *target*ga qo'llansin, precondition faqat yangi ownerning a'zoligiga qaratilsin.
- Atomiklik: `update` + `audit.record`ni bitta `db.transaction`ga o'rash. `tenants`da RLS yo'q (izoh 15-qator), lekin atomiklik uchun tx kifoya. `update()` (27-41) uchun ham shu.

**Qabul**
- A'zo bo'lmagan userga egalik o'tkazish RAD qilinadi (owner-without-assignment displey buzilmaydi).
- Egalik o'zgarishi va audit yozuvi bir tranzaksiyada — biri fail bo'lsa ikkalasi ham qaytadi.

---

## 3. Chegaralanmagan stock movement tarixi

**Muammo**
- `stock.service.ts:161-168` (`listMovements`): `where(eq(itemId))` + `orderBy(desc(createdAt))` — `limit`/pagination **yo'q**. Uzoq ishlagan itemda minglab movement bir so'rovda qaytadi (payload + xotira).

**Fix yondashuvi**
- Query'ga `?page&pageSize` (yoki `?limit`) qo'shish (`ListMovementsQuery` schema), default `pageSize: 20-50`, `.limit().offset()`. Boshqa list endpointlardagi `{ data, meta }` naqshiga moslash.

**Qabul**
- `listMovements` sahifalab qaytaradi; katta tarixli item bir so'rovda hammasini yubormaydi.

---

## 4. `check-rls-coverage` lint FORCE emas, ENABLE'ni tekshiradi

**Muammo**
- `scripts/check-rls-coverage.ts:77-81`: regex faqat `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY`ni qidiradi. CLAUDE.md §3.4 esa `FORCE ROW LEVEL SECURITY`ni talab qiladi (jadval egasi ham RLS'ga bo'ysunsin). Migration'larda FORCE ishlatiladi (masalan `0002_patients_rls.sql`), lekin lint uni majburlamaydi — yangi jadval ENABLE bilan, FORCE'siz qo'shilsa lint o'tkazib yuboradi.
- **Bu #8 (superuser bypass)ni HAL QILMAYDI:** superuser `dental` RLS'ni shartsiz aylanib o'tadi (FORCE faqat jadval *egasi*ni bog'laydi, egasi superuser bo'lsa u ham bog'lanmaydi). Bu — §3.4 standartiga muvofiqlik / defense-in-depth, xolos.

**Fix yondashuvi**
- Ikkinchi regex qo'shish: `ALTER TABLE <name> FORCE ROW LEVEL SECURITY` — ENABLE bilan birga FORCE ham bo'lishini majburlash. Yo'q bo'lsa `missing`ga qo'shish (xato xabari FORCE'ni ham tilga olsin).

**Qabul**
- FORCE RLS'siz (faqat ENABLE) tenant-scoped jadval CI'da FAIL beradi.

---

## 5. `requestPasswordReset` soft-delete userlarni filtrlamaydi

**Muammo**
- `auth.service.ts:644-645` (`requestPasswordReset`): `where(eq(users.phone, input.phone))` — `isNull(users.deletedAt)` filtri yo'q. `login` (256) va workspace-branches (700) esa `isNull(users.deletedAt)` bilan izchil. Soft-deleted user parol tiklash tokeni ola oladi.

**Fix yondashuvi**
- 645-qator where'iga `and(eq(users.phone, input.phone), isNull(users.deletedAt))` (login:256 bilan bir xil). `isNull` allaqachon import qilingan.

**Qabul**
- Soft-deleted (deletedAt to'ldirilgan) user parol tiklashni boshlata olmaydi (enumeration-safe `{ sent: true }` javobi saqlanadi).

---

## 6. `users.deleted_at` latent — `listAssignments` isNull filtri yo'q

**Muammo**
- `users.service.ts:27-48` (`listAssignments`): `innerJoin(users, ...)` (45) `users.deletedAt`ni filtrlamaydi. Soft-deleted user hali ham xodim ro'yxatida (assignmentlar orqali) ko'rinishi mumkin. `deleted_at` ustuni mavjud, lekin ko'p joyda majburlanmagan (latent).

**Fix yondashuvi**
- Query'ga `.where(isNull(users.deletedAt))` qo'shish (assignment aktivligi + user tirikligini birlashtirish). `isNull` importi kerak bo'lsa qo'shiladi.

**Qabul**
- Soft-deleted user xodim ro'yxatida ko'rinmaydi.

---

## 7. `GET /tenant-settings/vertical` workspace'siz 500 beradi

**Muammo**
- `tenant-settings.service.ts:18-25` (`getOrCreate`): `getDb(c).select()` RLS `current_tenant_id` o'rnatilmagan bo'lsa 0 qator → keyin `c.get('activeTenantId')` undefined → `throw new Error('No tenant context')` → 500. Vertical route (`tenant-settings.routes.ts:48-50`) `requirePermission`SIZ (CLI-153), workspace tanlanmagan holatda ham chaqirilishi mumkin → 500.

**Fix yondashuvi**
- Vertical yo'lida workspace yo'q holatni yumshoq qaytarish: route'da (`tenant-settings.routes.ts:48`) `activeTenantId` yo'q bo'lsa default `{ vertical: 'dental' }` (schema default) 200 bilan qaytarish; yoki service'ga `getVerticalOrDefault(c)` qo'shib, tenant context yo'q bo'lsa throw qilmasdan default berish. `getOrCreate`ning yozuv (insert) yo'li tenant context talab qilaverishi mumkin — faqat vertical o'qish yumshatiladi.

**Qabul**
- Workspace tanlanmagan holatda `/tenant-settings/vertical` 500 emas, default vertical bilan 200 qaytaradi.

---

## 8. Postgres trust auth + superuser `dental` RLS'ni aylanib o'tadi (desktop)

**Muammo**
- `first-run.ts:116-121`: `initdb ... -U dental` — superuser `dental` yaratiladi, auth metodi ko'rsatilmaydi (lokal ulanishlar default `trust`). `process-manager.ts:138`: `DATABASE_ADMIN_URL = postgresql://dental:dental@localhost:5433/dental` — superuser. Trust auth tufayli mashinadagi **har qanday lokal jarayon** parolsiz `dental` superuser sifatida ulanib RLS'ni to'liq aylanib o'tishi mumkin (superuser RLS'ga bo'ysunmaydi).
- Runtime API `dental_app` (non-superuser, 132-qator) orqali ishlaydi — u RLS'ga bo'ysunadi (yaxshi). Muammo faqat superuser `dental` + trust auth.

**Fix yondashuvi**
- Bu — **auth muammosi, RLS emas** (#4 buni hal qilmaydi). `initdb`ga `-A scram-sha-256` (yoki `--auth-local=scram-sha-256 --auth-host=scram-sha-256`) + `--pwfile` bilan superuser parol o'rnatish; `pg_hba.conf`da lokal ulanishlar `trust` emas, `scram-sha-256`ga o'tkazish. `dental` superuser paroli `getOrCreateDbPassword()` kabi tasodifiy saqlansin (DATABASE_ADMIN_URL shuni ishlatsin).

**Qabul**
- Parolsiz lokal jarayon `dental` superuser sifatida ulana olmaydi (auth reject).
- Admin scan (recall worker, DATABASE_ADMIN_URL) hali ishlaydi — endi parol bilan.

---

## 9. `process-manager` crash-supervision yo'q; SIGTERM-only Postgres'ni orphan qiladi

**Muammo**
- `process-manager.ts:55-58`: `pgProcess`/`valkeyProcess`/`apiProcess` modul-darajali null'lar — spawndan keyin `exit`/`error` tinglanmaydi. Bola crash bo'lsa qayta ishga tushirilmaydi va status `running` qolib ketishi mumkin (soxta "ishlayapti").
- `stopServer` (`process-manager.ts:182-188`): faqat `SIGTERM` yuboradi + qat'iy `getStopWaitMs()` (default 1000ms) kutadi. Postgres SIGTERM'ga (Smart Shutdown) sekin javob berishi mumkin → 1s ichida tugamasa jarayon orphan bo'lib, keyingi startda port band / data-dir lock xatosi.

**Fix yondashuvi**
- Crash-supervision: har spawn qilingan bolaga `.on('exit', ...)` / `.on('error', ...)` qo'shib, kutilmagan chiqishda `status = 'stopped'` (yoki cheklangan restart) + log. Soxta `running` holatini oldini olish.
- Shutdown: SIGTERM → grace kutish → hali tirik bo'lsa `SIGKILL` (escalation). Postgres uchun `pg_ctl stop -m fast` afzalroq. `stopServer`ni `exit` eventiga bog'lab, qat'iy timeout o'rniga haqiqiy tugashni kutish.

**Qabul**
- Bola jarayon kutilmaganda chiqsa `getServerStatus()` `running` qaytармaydi.
- `stopServer`dan keyin Postgres jarayoni orphan qolmaydi (SIGKILL escalation yoki `pg_ctl stop`).

---

## 10. `BrowserWindow` webPreferences implicit + navigatsiya guard yo'q

**Muammo**
- `main.ts:127-137`: `new BrowserWindow({ ..., webPreferences: { preload: PRELOAD_PATH } })` — `contextIsolation` / `nodeIntegration` / `sandbox` **oshkora** o'rnatilmagan (Electron default xavfsiz, lekin oshkora emas). `setWindowOpenHandler` (133-136) yangi oynani `openExternal` + deny qiladi (yaxshi), lekin **`will-navigate` guard yo'q** — `loadURL(url)` remote sahifani yuklaydi va sahifa ichidagi navigatsiya ixtiyoriy URL'ga ketishi cheklanmaydi.
- CLI-434 bilan qisman ustma-ust (webPreferences hardening).

**Fix yondashuvi**
- `webPreferences`ni oshkora: `{ preload: PRELOAD_PATH, contextIsolation: true, nodeIntegration: false, sandbox: true }`.
- `webContents.on('will-navigate', (e, targetUrl) => { if (ruxsat-etilgan-origin emas) e.preventDefault(); })` — faqat kutilgan server origin'iga navigatsiyaga ruxsat. Origin ro'yxati desktop config (server URL)dan olinadi.
- CLI-434 bilan koordinatsiya — takror ish qilinmasin.

**Qabul**
- BrowserWindow oshkora `contextIsolation:true` + `nodeIntegration:false` + `sandbox:true` bilan yaratiladi.
- Kutilgan origin tashqarisiga in-page navigatsiya bloklanadi (`will-navigate` preventDefault).
