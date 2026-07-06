# CLI-358 — `requireModule` litsenziya-gating middleware'ni route guruhlariga ulash (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-358 (High)
> **Scope:** `apps/api/src/lib/license-middleware.ts` (yangi kichik wrapper qo'shiladi, mavjud `requireModule`/`MODULE_MAP` o'zgarmaydi) + 11 ta modul-gated route guruhi (`<feature>.routes.ts`) + 1 ta yangi integratsion test fayli + `license-middleware.test.ts`ga qo'shimcha (mavjud 6 test o'zgarmaydi).

---

## 1. Maqsad

`requireModule(module)` (`apps/api/src/lib/license-middleware.ts`) yozilgan va unit test qilingan, lekin hech bir `app.route(...)` chaqiruvida ishlatilmagan — hozir litsenziyasiz (yoki noto'g'ri tarif) o'rnatishda ham barcha endpoint ochiq, Local Desktop "modul-gating" litsenziya modeli amalda ishlamayapti.

---

## 2. ⚠️ Kritik topilma — nega `requireModule`ni to'g'ridan-to'g'ri ulash YETARLI EMAS

`requireModule` litsenziya tushunchasi (`.lic` fayl, machine-fingerprint) **faqat Local Desktop** (bitta-EXE, Windows installer, CLI-338/348) mahsulotiga tegishli — asosiy cloud/multi-tenant SaaS (bu loyihaning tub arxitekturasi) hech qanday mashina-litsenziyasiga ega emas va bo'lmaydi ham (CLAUDE.md: litsenziya — "DS-LD: Local Desktop" epikiga tegishli alohida qatlam).

`getActiveModules()` (`./license.ts`) `.lic` fayl topilmasa `readLicense()` `null` qaytaradi → `[]` → `requireModule` **har doim** `403 LICENSE_NOT_FOUND` beradi — modul nomidan yoki muhitdan qat'i nazar. Agar `requireModule` shartsiz ulansa:
- **Cloud/dev/CI muhitida** (hech qachon `.lic` yozilmaydi) — 11 ta route guruhining barchasi doim 403 beradi. Bu nafaqat yangi kod — mavjud integratsion testlar (`cli-79-vertical-gating.test.ts`, `clinical.test.ts`, `cashier-*.test.ts`, `cli-186-187-appointments.test.ts` va h.k. — bularning barchasi `createApp()` orqali gated route guruhlariga so'rov yuboradi, hech qanday litsenziya provision qilmasdan) **buziladi**.
- **Production cloud deploy** — butun mahsulot litsenziyasiz "ishlamay qoladi" (mashina-litsenziyasi tushunchasi u yerda umuman qo'llanilmaydi).

Demak, `requireModule`ning o'zi to'g'ri, lekin **faqat Local Desktop rejimida** faollashtirilishi kerak. Mavjud kod bazasida "Local Desktop rejimi"ning yagona signali — `apps/api/src/app.ts`da CSP branch uchun ishlatiladigan `env.WEB_DIST_DIR` (bitta-EXE, `apps/desktop/src/process-manager.ts` `spawnApi()` shu env'ni beradi; cloud/dev'da hech qachon o'rnatilmaydi).

**Yechim — yangi eksport, mavjud `requireModule` o'zgarmaydi:**
```ts
// apps/api/src/lib/license-middleware.ts (qo'shiladi, mavjud requireModule/MODULE_MAP ustiga)
export const requireModuleInDesktop = (module: string): MiddlewareHandler => {
  const gate = requireModule(module);
  return async (c, next) => {
    // process.env (Bun.env orqali frozen `env.ts` singleton EMAS) — har
    // so'rovda qayta o'qiladi, xuddi getLicensePath()dagi kabi (license.ts
    // izohi: top-level const bo'lsa import-vaqtida "muzlab qolar edi").
    // Cloud/dev/CI'da WEB_DIST_DIR yo'q → gating butunlay chetlab o'tiladi.
    if (!process.env.WEB_DIST_DIR) {
      await next();
      return;
    }
    return gate(c, next);
  };
};
```
11 ta route guruhi `requireModule` emas, **`requireModuleInDesktop`** ni import qiladi/ulaydi. `requireModule`/`MODULE_MAP` o'zi va ularning 6 ta mavjud unit testi **o'zgarmaydi** — `requireModuleInDesktop` alohida, ustiga qurilgan qatlam, o'z yangi unit testlari bilan (`license-middleware.test.ts`ga qo'shiladi, mavjud `describe('requireModule', ...)` blokiga tegilmaydi).

---

## 3. Topilgan aniq shartnoma (o'zgartirilmaydi, faqat iste'mol qilinadi)

**`apps/api/src/lib/license-middleware.ts`:**
```ts
export const requireModule = (module: string): MiddlewareHandler => {
  return async (c, next) => {
    if (WHITELIST.some((path) => c.req.path.startsWith(path))) { await next(); return; }
    const modules = await getActiveModules();
    if (!modules.length) {
      return c.json(fail('LICENSE_NOT_FOUND', 'License not activated'), 403);
    }
    if (!modules.includes('*') && !modules.includes(module)) {
      return c.json(fail('MODULE_DISABLED', `Module '${module}' is not enabled in your plan`), 403);
    }
    await next();
  };
};

export const MODULE_MAP: Record<string, string[]> = {
  starter: ['patients', 'appointments', 'queue'],
  standard: ['patients', 'appointments', 'queue', 'cashier', 'reports', 'staff'],
  premium: [
    'patients', 'appointments', 'queue', 'cashier', 'reports', 'staff',
    'clinical', 'lab-orders', 'patient-images', 'prescriptions', 'consent',
  ],
  enterprise: ['*'],
};
```
`getLicensePath()` `process.env.LICENSE_PATH`ni **har chaqiruvda** o'qiydi (top-level const emas — shu sabab test/env'da erkin almashtiriladi, "muzlab qolish" bugi yo'q, `license.ts` fayldagi izoh — `requireModuleInDesktop`ning `process.env.WEB_DIST_DIR` o'qishi ham xuddi shu sababga asoslanadi).

**11 real modul kaliti** (`MODULE_MAP`dan): `patients`, `appointments`, `queue`, `cashier`, `reports`, `staff`, `clinical`, `lab-orders`, `patient-images`, `prescriptions`, `consent`. Boshqa hech qanday kalit yo'q (`branches`/`roles`/`tenant`/`audit`/`schedule`/`recalls`/`expenses`/`stock`/`payroll`/`notifications`/`service-categories`/`services` — bular MODULE_MAP'da mavjud emas, demak scope tashqarisida, gate qilinmaydi).

---

## 4. `app.ts`dagi route guruhi → modul kaliti xaritasi (o'qib aniqlangan, taxmin qilinmagan)

| Modul kaliti | `app.route(...)` mount | Fayl (`export const <X>Routes`) |
|---|---|---|
| `patients` | `/api/patients` | `apps/api/src/modules/patients/patients.routes.ts` (`patientRoutes`) |
| `appointments` | `/api/appointments` | `apps/api/src/modules/appointments/appointments.routes.ts` (`appointmentRoutes`) |
| `queue` | `/api/queue` | `apps/api/src/modules/queue/queue.routes.ts` (`queueRoutes`) |
| `cashier` | `/api/cashier` | `apps/api/src/modules/cashier/cashier.routes.ts` (`cashierRoutes`) |
| `reports` | `/api/reports` | `apps/api/src/modules/reports/reports.routes.ts` (`reportsRoutes`) |
| `staff` | `/api/users` | `apps/api/src/modules/users/users.routes.ts` (`userRoutes`) |
| `clinical` | `/api` (diagnoses, treatment-plans, visit-notes, tooth-charts aggregator) | `apps/api/src/modules/clinical/clinical.routes.ts` (`clinicalRoutes`) |
| `lab-orders` | `/api/lab-orders` | `apps/api/src/modules/lab-orders/lab-orders.routes.ts` (`labOrdersRoutes`) |
| `patient-images` | `/api` (`/patients/{id}/images`, `/patient-images/{id}`) | `apps/api/src/modules/patient-images/patient-images.routes.ts` (`patientImagesRoutes`) |
| `prescriptions` | `/api/prescriptions` | `apps/api/src/modules/prescriptions/prescriptions.routes.ts` (`prescriptionsRoutes`) |
| `consent` | `/api/consent` | `apps/api/src/modules/consent/consent.routes.ts` (`consentRoutes`) |

**Diqqatga loyiq qaror — `staff` → `/api/users`:** `MODULE_MAP`da `staff` kaliti bor, lekin `users.routes.ts` ichida ishlatiladigan permission kodlari `user.*` (`user.view`/`user.invite`/`user.manage`), `staff.*` EMAS (`packages/core/src/permissions.ts`da `staff.*` kodlar mavjud, lekin hech bir route'da ishlatilmaydi — eskirgan/ishlatilmagan katalog yozuvi ko'rinadi). Semantik jihatdan "xodimlar" = `/api/users` (invite/assignment/profil) — shu sabab `staff` moduli shu route guruhiga bog'lanadi. Bu — mapping bo'yicha yagona noaniq joy, ammo boshqa hech qanday route guruhi "staff" konseptiga `/api/users`dan yaqinroq emas.

Har bir target `<feature>.routes.ts` allaqachon o'zining sub-`OpenAPIHono` ichida `app.use('*', authMiddleware()); app.use('*', rlsMiddleware(deps.db));` bilan boshlanadi (RFC-0009 pattern — cross-cutting middleware modul o'zida, `app.ts`da global emas). `requireModuleInDesktop(...)` shu ikkitadan **OLDIN**, birinchi middleware sifatida qo'shiladi — chunki litsenziya/modul tekshiruvi auth/tenant-context'dan mustaqil (foydalanuvchi kimligidan qat'i nazar, o'rnatishda modul umuman yoqilmagan bo'lishi mumkin), arzon (DB so'rovsiz, faqat fayl o'qish+AES), va CLI-348 "litsenziyasiz → /activate" falsafasiga mos (iloji boricha erta blok).

---

## 5. Global constraint

**Litsenziyada faol bo'lmagan modulga qilingan har qanday so'rov, FAQAT Local Desktop rejimida (`process.env.WEB_DIST_DIR` bor), HTTP 403 va aniq xato kodi bilan qaytishi kerak:**
- `WEB_DIST_DIR` yo'q (cloud/dev/CI) → gating butunlay chetlab o'tiladi, xulq CLI-358'dan OLDINGIDEK qoladi (mavjud barcha integratsion testlar, cloud deploy — o'zgarishsiz).
- `WEB_DIST_DIR` bor + `.lic` fayl yo'q/muddati o'tgan → `403 { success:false, error:{ code:'LICENSE_NOT_FOUND' } }`
- `WEB_DIST_DIR` bor + `.lic` bor, lekin modul ro'yxatda yo'q → `403 { success:false, error:{ code:'MODULE_DISABLED' } }`
- `WEB_DIST_DIR` bor + `modules` ichida `'*'` (enterprise) — barcha modul o'tadi (o'zgartirilmaydi, mavjud xulq)
- `requireModule`/`MODULE_MAP`ning o'zi o'zgarmaydi (yozilgan va test qilingan) — faqat yangi `requireModuleInDesktop` wrapper qo'shiladi va **ulash** ishi qilinadi.
- Gate qilinmaydigan route guruhlari (`branches`/`roles`/`tenant-settings`/`audit`/`schedule`/`recalls`/`expenses`/`stock`/`payroll`/`notifications`/`service-categories`/`services`/`auth`/`health`/`activate`/`permissions`/`tenant`) **o'zgarishsiz qoladi** — MODULE_MAP'da yo'q, ular litsenziya tarifidan mustaqil "core" funksiyalar.

---

## 6. DoD (ticket'dan, aniqlashtirilgan)

- [ ] `apps/api/src/lib/license-middleware.ts`ga yangi `requireModuleInDesktop(module)` eksporti qo'shiladi (`requireModule`ni `process.env.WEB_DIST_DIR` bilan shartlab o'raydi); mavjud `requireModule`/`MODULE_MAP` o'zgarmaydi.
- [ ] Yuqoridagi 11 ta route guruhiga (`patientRoutes`, `appointmentRoutes`, `queueRoutes`, `cashierRoutes`, `reportsRoutes`, `userRoutes`, `clinicalRoutes`, `labOrdersRoutes`, `patientImagesRoutes`, `prescriptionsRoutes`, `consentRoutes`) mos `requireModuleInDesktop('<modul-kaliti>')` middleware sifatida, `authMiddleware()`/`rlsMiddleware(...)`dan OLDIN ulanadi.
- [ ] Mavjud `apps/api/src/lib/license-middleware.test.ts` (6/6 unit test, `requireModule` uchun) o'zgarishsiz yashil qoladi; yangi `describe('requireModuleInDesktop', ...)` bloki qo'shiladi (WEB_DIST_DIR yo'q → no-op, bor → `requireModule` bilan bir xil xulq).
- [ ] Yangi integratsion test (`apps/api/tests/integration/cli-358-module-gating.test.ts`, real `createApp()` ustida, `LICENSE_PATH` VA `WEB_DIST_DIR` ikkalasi ham test-vaqtida o'rnatiladi) — litsenziya faollashtirilmagan (`.lic` yo'q) holatda har 11 ta gated route guruhidan bittadan real yo'l (masalan `GET /api/patients`, `GET /api/lab-orders`, ...) **Authorization header'siz ham** `403 LICENSE_NOT_FOUND` qaytarishini tasdiqlaydi.
- [ ] **Kritik regressiya:** `WEB_DIST_DIR` o'rnatilmagan holatda (cloud/dev/CI — mavjud barcha boshqa integratsion testlar shu holatda ishlaydi) gated route (masalan `/api/patients`) `403 LICENSE_NOT_FOUND` **bermasligi** kerak — shu tekshiruv yo'q bo'lsa CLI-358 butun mavjud test suite'ni (`cli-79-vertical-gating.test.ts`, `clinical.test.ts`, `cashier-*.test.ts` va h.k.) buzadi.
- [ ] Qo'shimcha regressiya: MODULE_MAP'da yo'q route guruhi (masalan `/api/branches`), `WEB_DIST_DIR` bor bo'lsa ham, `LICENSE_NOT_FOUND` bermasligi (gate qilinmagan, oddiy `401 auth.missing_token`ga tushadi) — noto'g'ri keng qamrovli mount qilinmaganini isbotlaydi.
- [ ] `bun run typecheck` (yoki `apps/api` filter) toza.
