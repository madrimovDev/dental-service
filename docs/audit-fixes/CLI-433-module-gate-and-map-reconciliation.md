# CLI-433 — Module gate WEB_DIST_DIR'siz o'chadi; daromad modullari gate'siz; MODULE_MAP divergensiyasi

> Audit: AUDIT-2026-07-06.md · M20. Desktop-only litsenziya-gating; cloud/dev'da gate no-op bo'lishi **kerak** (tanlangan xulq).

## 1. Muammo va ildiz sabab

Uch alohida nuqson:

### (a) Gate faqat `WEB_DIST_DIR` env mavjudligiga tayanadi
`requireModuleInDesktop` — `apps/api/src/lib/license-middleware.ts:79-88`:
```ts
return async (c, next) => {
  if (!process.env.WEB_DIST_DIR) { await next(); return; }   // 82-85
  return gate(c, next);
};
```
`WEB_DIST_DIR` — Local Desktop signali sifatida ishlatilgan (`process-manager.ts:150` `spawnApi` uni beradi). Lekin bu env **litsenziyaga aloqasi bo'lmagan static-serve sozlamasi** (app.ts:185 `serveStatic` uchun). Agar u o'rnatilmasa (masalan boshqa deploy topologiyasi, static'ni tashqi serverga bergan bitta-EXE build, yoki env sozlash xatosi) — **gating butunlay o'chadi, litsenziyasiz to'liq ilova ochiladi**. Signal maqsadga mos emas.

### (b) Daromad modullari umuman gate qilinmagan
`app.ts:150-153`:
```ts
app.route('/api', expensesRoutes({ db, audit }));          // gate YO'Q
app.route('/api/stock', stockRoutes({ db, audit, notifications }));  // gate YO'Q
app.route('/api/payroll', payrollRoutes({ db, audit }));   // gate YO'Q
app.route('/api/notifications', notificationsRoutes({ db, sms }));   // gate YO'Q
```
`grep requireModuleInDesktop` — bu 4 modul route-fayllarida `requireModuleInDesktop` **yo'q** (patients/appointments/queue/cashier/reports/staff/clinical/lab-orders/patient-images/prescriptions/consent — bor). Ya'ni `starter` tarif litsenziyasi bilan ham xarajat/ombor/payroll/bildirishnoma **to'liq ochiq**.

### (c) MODULE_MAP uch joyda divergent + api MODULE_MAP o'lik
- **api** `MODULE_MAP` (license-middleware.ts:43-60) — enterprise=`['*']`, va expenses/stock/payroll/notifications **umuman yo'q**. **Muhim: bu konstanta runtime gate yo'lida ISHLATILMAYDI** (grep tasdiqladi — faqat license-middleware.ts'da e'lon + izohlarda eslatiladi). Gate yo'li: `getActiveModules()` → `lic.modules` (Supervisor-bergan `.lic`dan) → `modules.includes(module)`. Modul nomi esa `requireModuleInDesktop('...')` string-literalidan keladi. Demak api MODULE_MAP — **reference-only, o'lik kod**.
- **supervisor** `MODULE_MAP` (clinics.routes.ts:28-61) — `lic.modules` shu yerdan yoziladi (POST /clinics). enterprise `['erp','payroll','inventory','branches']` **nomlarini** ishlatadi — lekin api route nomlari `expenses`/`stock`/`payroll`/`notifications`. **Nom mismatch:** `erp` ≠ `expenses`, `inventory` ≠ `stock`. Supervisor `enterprise` uchun `'*'` **emas**, aniq ro'yxat beradi → agar api'da bu modullar gate qilinsa, enterprise ham ularni ololmasdi (nom mos kelmaydi).

**Umumiy ildiz sabab:** modul-nom lug'ati uch joyda (supervisor map, `.lic`, api gate string-literallari) kelishilmagan; gate signali noto'g'ri; daromad modullari umuman ulanmagan.

## 2. Dizayn qarori

### (a) Desktop rejimini ishonchli aniqlash — atayin env
`WEB_DIST_DIR`'ni signal sifatida ishlatishni to'xtatib, **atayin `DENTAL_LOCAL_DESKTOP=true`** env kiritiladi (yoki mavjud `DENTAL_DATA_DIR` desktop-yagona signalidan foydalanish). `process-manager.ts` `spawnApi` (process-manager.ts:123-153) uni beradi. Gate faqat shu flag `=== 'true'` bo'lganda faollashadi.

- **Rad etilgan:** `WEB_DIST_DIR`'ga tayanish (a-muammoning o'zi — maqsadga mos emas, litsenziyadan mustaqil).
- **Rad etilgan:** `app.isPackaged` — bu Electron main-process qiymati, api child-process'da yo'q.
- **Reja shuni talab qiladi:** desktop-tomon o'zgarish (`process-manager.ts` env qatoriga `DENTAL_LOCAL_DESKTOP: 'true'` qo'shish). Bu Electron/Windows qismi — jismoniy PC'da qo'lda tasdiqlash kerak.

### (b) Daremad modullarini gate qilish
`app.ts`'da expenses/stock/payroll/notifications route'lariga tегишли `requireModuleInDesktop(...)` qo'shiladi (route-fayl ichida `app.use('*', ...)` yoki app.ts mount'ida). Nomlash — pastdagi yagona lug'atga muvofiq.

### (c) Yagona MODULE_MAP lug'ati — supervisor manba, api mirror (lockstep)
api va supervisor **alohida deploy birligi, workspace-edge yo'q** (license-signature.ts:3-9 pretsedenti) — **literal shared import mumkin emas**. Yechim: `license-signature.ts` kabi **qo'lda lockstep-dublikat** + kod izohida "ikkalasini birga yangilash" ogohlantirishi. Modul-nom lug'ati bir xil string'lar bilan yoziladi (`erp`/`inventory` nomlaridan voz kechib, api route nomlariga tekislanadi):

**Kelishilgan lug'at (tarif → modullar):**

| Tarif | Modullar |
|---|---|
| starter | `patients`, `appointments`, `queue` |
| standard | + `cashier`, `reports`, `staff` |
| premium | + `clinical`, `lab-orders`, `patient-images`, `prescriptions`, `consent` |
| enterprise | + `expenses`, `stock`, `payroll`, `notifications`, `schedule`, `recalls` |

> ⚠️ `schedule`/`recalls`/`services` — hozir gate qilinmagan yordamchi domenlar. **Qaror:** `schedule`+`recalls` enterprise-ga; `services` **gate qilinmaydi** (narx-ro'yxati barcha tarifda kerak, cashier/appointments unga bog'liq). Bu — atayin og'ish, izohda hujjatlashtiriladi.

- Supervisor `enterprise` `['*']` **emas**, aniq to'liq ro'yxat qoladi (hozirgi shakl) — lekin **api route nomlari bilan** (`expenses` not `erp`, `stock` not `inventory`). `'*'` ni ishlatish soddaroq bo'lardi, lekin supervisor hozir aniq ro'yxat beradi va `getActiveModules` `'*'`'ni qo'llab-quvvatlaydi (license-middleware.ts:30) — ikkala variant ham ishlaydi; **tavsiya: enterprise = to'liq aniq ro'yxat** (yangi modul qo'shilganda ataylab ko'rib chiqilsin, jim `'*'` ostida yashirinmasin).
- api `MODULE_MAP` (o'lik reference konstanta) — **yo gate mantig'iga bog'lanadi, yo o'chiriladi**. Chunki u runtime'da ishlatilmaydi, eng toza yechim: uni supervisor bilan bir xil to'liq lug'atga yangilab, **izohda "faqat hujjat/test-referens, runtime gate `lic.modules`'ga tayanadi"** deb belgilash. Yoki butunlay o'chirish. **Tavsiya: yangilab, referens sifatida qoldirish** (test uni supervisor map bilan solishtirishi mumkin — divergensiyani CI'da ushlaydi).

## 3. Spec — xulq + qirra holatlar + test holatlari

### Gate faollashuvi
- `DENTAL_LOCAL_DESKTOP !== 'true'` (cloud/dev/CI/test) → `requireModuleInDesktop` **no-op** (mavjud xulq saqlanadi — butun mavjud test suite yashil qoladi).
- `DENTAL_LOCAL_DESKTOP === 'true'` → `requireModule` faol: `.lic` yo'q → 403 `LICENSE_NOT_FOUND`; modul `lic.modules`'da yo'q → 403 `MODULE_DISABLED`; `'*'` → hammasi.

### Daromad modullari
- `starter` litsenziya → `GET /api/expenses`, `/api/stock`, `/api/payroll`, `/api/notifications` → 403 `MODULE_DISABLED`.
- `enterprise` → 200.

### Qirra holatlar
- **`expenses` bare-`/api` mount** (app.ts:150 `app.route('/api', expensesRoutes...)`) — clinical/patient-images kabi (app.ts:154-169) nested-mount quirk'iga duch kelishi mumkin. **Gate route-fayl ichida per-route yoki `app.use('*', ...)` bilan** qo'shiladi, app.ts mount-tartibiga e'tibor (gated modul nested bare-`/api` mount'dan OLDIN — app.ts:154-169 izohidagi Hono quirk). expenses hozir clinical'dan oldin (150 vs 168) — xavfsiz.
- **`notifications`** — SMS worker/scaffold; gate faqat HTTP route'ga, ichki worker'ga emas.
- **`schedule`/`recalls`** enterprise-only bo'ldi — appointments (premium-quyi) ularга bog'liqmi? `appointments` `schedule` service'ni **in-process** (app.ts:136,141 DI) ishlatadi, HTTP `/api/schedule` alohida. Gate HTTP route'ga — appointments buzilmaydi. Tasdiqlash kerak: frontend `/api/schedule`'ni premium tarifда chaqirsa 403 bo'ladi — **agar shunday bo'lsa `schedule`'ни premium yoki gate'siz qilish** (implementatsiyada frontend chaqiruvini tekshirish).

### Test holatlari
- `license-middleware.test.ts` — `DENTAL_LOCAL_DESKTOP` unset → gate no-op (mavjud `patients` testlarини shu env'ga moslash: hozir `WEB_DIST_DIR` mock qilinadi — env nomini almashtirish).
- `DENTAL_LOCAL_DESKTOP='true'` + `.lic` yo'q → 403.
- `starter` `.lic` + `expenses` → 403; `enterprise` + `expenses` → 200.
- **Yangi:** supervisor `MODULE_MAP` va api referens `MODULE_MAP` bir xil ekanini tasdiqlovchi test (divergensiya guard) — yoki har birining tarif kalitlari bir xil modullarга ega.

## 4. Implementatsiya rejasi (TDD)

1. **Failing test** — `license-middleware.test.ts`: (i) `DENTAL_LOCAL_DESKTOP='true'` bilan gate faollashuvi (hozir `WEB_DIST_DIR` kutadi → qizil); (ii) yangi integration/route test: `starter` litsenziyada `/api/expenses` → 403 (hozir gate yo'q → 200 → qizil).
2. **Impl (a)** — `requireModuleInDesktop` (license-middleware.ts:82) shartini `process.env.DENTAL_LOCAL_DESKTOP !== 'true'`'ga; izohni yangilash.
3. **Impl (b)** — expenses/stock/payroll/notifications route-fayllariga `app.use('*', requireModuleInDesktop('<nom>'))` (patients.routes.ts:73 andozasi); mount-tartib xavfsizligini tekshirish.
4. **Impl (c)** — supervisor `MODULE_MAP` (clinics.routes.ts:28) enterprise'ni api-route nomlariga tekislash (`expenses`/`stock`, + `payroll`/`notifications`/`schedule`/`recalls`); api referens `MODULE_MAP` (license-middleware.ts:43) bir xil lug'atга; ikkalasiga lockstep izohi.
5. **Impl (desktop, Electron)** — `process-manager.ts` `spawnApi` env'ga `DENTAL_LOCAL_DESKTOP: 'true'`. ⚠️ **Windows-only — jismoniy PC'da qo'lda tasdiqlanadi.**
6. **Verify** — `bun test apps/api/src/lib/license-middleware.test.ts` + supervisor + har modul route testi; `turbo typecheck`; **butun api test suite** yashil (regressiya: gate no-op cloud'da).

## 5. Migratsiya / rollout / xavflar

- **Migratsiya:** old-shart (CLI-410 §0) — dala'da litsenziya yo'q. Yangi POST /clinics kelishilgan map bilan yozadi. Mavjud test-litsenziyalar (agar bor) enterprise'da `erp`/`inventory` nomlarini saqlagan bo'lsa — yangi gate `expenses`/`stock` kutadi → mos kelmaydi → qayta yaratish/PATCH kerak (dala'da yo'q).
- **Xavf (regressiya):** `DENTAL_LOCAL_DESKTOP` cloud/CI'da hech qачон o'rnatilmaydi — gate no-op qoladi, mavjud minglab test buzilmaydi. **Bu eng muhim regressiya-cheki.**
- **Xavf (Hono nested-mount quirk):** expenses gate mount-tartibiga sezgir (app.ts:154-169 hujjatlangan quirk). Mount-tartib tekshiriladi, gate per-route/`app.use('*')` clinical'dan oldingi modullarга bemalol.
- **Xavf (`schedule`/`recalls` false-gate):** premium tarif frontend `/api/schedule`'ni chaqirsa 403. Implementatsiyada frontend chaqiruvi tekshiriladi; shubha bo'lsa `schedule`'ni gate'siz qoldirish.
- **Rollback:** gate no-op'ga qaytarish (env unset) — xavfsiz, faqat himoya yo'qoladi.

## 6. Qabul mezonlari

- [ ] `DENTAL_LOCAL_DESKTOP='true'`'siz gate hamma joyda no-op (cloud/dev/CI test suite yashil).
- [ ] `DENTAL_LOCAL_DESKTOP='true'` + starter `.lic` → `/api/expenses|stock|payroll|notifications` 403 `MODULE_DISABLED`.
- [ ] enterprise `.lic` → o'sha route'lar 200.
- [ ] supervisor va api MODULE_MAP bir xil modul-nom lug'atini ishlatadi (divergensiya-guard test yashil).
- [ ] `process-manager.ts` `DENTAL_LOCAL_DESKTOP` beradi (Windows'da qo'lda tasdiqlangan).
- [ ] typecheck toza.

## 7. Ta'sirlangan fayllar

- `apps/api/src/lib/license-middleware.ts` — `requireModuleInDesktop` signali (`DENTAL_LOCAL_DESKTOP`); `MODULE_MAP` yangilash + lockstep izohi.
- `apps/api/src/modules/expenses/expenses.routes.ts`, `stock/stock.routes.ts`, `payroll/payroll.routes.ts`, `notifications/notifications.routes.ts` — `requireModuleInDesktop` gate qo'shish.
- `apps/api/src/app.ts` — (agar mount-darajада gate tanlansa) 150-153; mount-tartib izohi.
- `apps/supervisor-api/src/modules/clinics/clinics.routes.ts` — `MODULE_MAP` enterprise nomlarini tekislash.
- `apps/desktop/src/process-manager.ts` — `spawnApi` env `DENTAL_LOCAL_DESKTOP: 'true'` (Windows-only, qo'lda verify).
- `apps/api/src/lib/license-middleware.test.ts` + modul route testlari — yangi env + gate holatlari + divergensiya guard.
