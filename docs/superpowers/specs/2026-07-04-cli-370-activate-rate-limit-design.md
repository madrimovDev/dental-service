# CLI-370 — POST /api/activate endpointida rate-limit yo'q (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-370 (Medium)
> **Scope:** `apps/api/src/routes/activate.ts` + `apps/api/src/lib/env-schema.ts` (yangi 2 env var)

---

## 1. Goal

`POST /api/activate` (Local Desktop litsenziya faollashtirish, CLI-348) hozir `licenseKey`ni to'g'ridan-to'g'ri `activateLicense()`ga uzatadi — hech qanday throttling yo'q. Natija: cheksiz license-key guessing/enumeration + har urinish Supervisor'ga real outbound HTTP so'rov (arzon DoS vektori — attacker o'z tarmog'idan minglab urinish yubora oladi, har biri Supervisor'ni yuklaydi). Maqsad: mavjud `lib/rate-limit.ts` (CLI-227, Redis fixed-window) pattern'ini `auth.routes.ts` bilan bir xil usulda `activate.ts`ga qo'llash.

## 2. Topilgan holat (kod o'qish natijasi)

- **`apps/api/src/lib/rate-limit.ts`** — `rateLimit(opts: RateLimitOptions): MiddlewareHandler`. `RateLimitOptions = { name, limit, windowSeconds, keyFromBody? }`. Redis kalit: `` rl:${name}:${ip}:${bodyKey ?? '-'} `` (`INCR` + birinchi urinishda `EXPIRE`). Limit oshsa `429` + `Retry-After` header + `fail('rate_limited', ...)`. Fail-open: Redis xato bersa request o'tadi. Bu app allaqachon Redis'ga bog'liq (`ioredis`, singleton) — `apps/api`da yangi infra/dependency KERAK EMAS (Supervisor-api'dagi CLI-369'dan farqli — u yerda Redis umuman yo'q edi).
- **`apps/api/src/modules/auth/auth.routes.ts:52-82`** — har himoyalangan route uchun alohida `rateLimit({...})` instance yaratiladi (module-level, `authRoutes()` factory tanasi ichida, route ro'yxatdan o'tishdan oldin) va `createRoute({ ..., middleware: [loginRateLimit] as const, ... })` orqali **per-route** OpenAPI middleware sifatida ulanadi. Limit/window qiymatlari `env.ts` orqali (`AUTH_LOGIN_RATE_LIMIT` default 10, `AUTH_RATE_LIMIT_WINDOW_SEC` default 900s) — hardcode emas.
- **`apps/api/src/routes/activate.ts`** — bu OpenAPIHono EMAS, oddiy `Hono`. Route: `app.post('/', async (c) => {...})` — `createRoute({middleware:[...]})` naqshi bu yerda mavjud emas (u faqat `@hono/zod-openapi`ga xos). Oddiy Hono uchun middleware zanjiri `app.post(path, middleware, handler)` shaklida — bu bilan mavjud `rateLimit()` factory'si o'zgarishsiz ishlaydi (`rateLimit()` oddiy Hono `MiddlewareHandler` qaytaradi, OpenAPIHono'ga bog'liq emas).

**Xulosa:** yangi infra kerak emas, faqat (a) 2 ta yangi env var (`ACTIVATE_RATE_LIMIT`, `ACTIVATE_RATE_LIMIT_WINDOW_SEC`), (b) `activate.ts`da bitta `rateLimit({...})` instance + `app.post('/', activateRateLimit, handler)`.

## 3. Approach — window/limit qiymatlari uchun mulohaza

**Login threat model ≠ activate threat model:**

| | Login | Activate |
|---|---|---|
| Legitim chastota | Kundalik, ko'p marta (bir kunda bir necha marta login) | Amalda **bir marta** (mashina sozlanganda) — noyob edge case: qayta o'rnatish/typo tuzatish |
| Kalit maydoni | Telefon raqami (ma'lum, cheklangan formatlar) — asosiy xavf: bitta hisobga ko'p urinish (credential stuffing) | License-key qiymati o'zi taxmin qilinayotgan **sir** — asosiy xavf: ko'p TURLI key qiymatini sinash (enumeration) |
| Har urinish narxi | Faqat lokal bcrypt/DB tekshiruv | **Real outbound HTTP** — Supervisor'ga tarmoq so'rovi (qimmatroq, Supervisor'ni ham yuklaydi) |
| Kalit tarkibi (`keyFromBody`) | IP + telefon (bitta hisobni maqsadli himoya qilish, boshqa hisoblarga bloklamaslik) | **Faqat IP** (`keyFromBody` YO'Q) — agar `licenseKey` kalitga kiritilsa, attacker har urinishda boshqa key sinaganda YANGI Redis bucket ochiladi va limit hech qachon oshmaydi (enumeration'ning o'zini himoyalamay qo'yadi) |

**Qaror — qiymatlar:**
- `name: 'activate'`
- `limit: env.ACTIVATE_RATE_LIMIT` — default **5** urinish
- `windowSeconds: env.ACTIVATE_RATE_LIMIT_WINDOW_SEC` — default **3600** soniya (1 soat)
- `keyFromBody`: **berilmaydi** (faqat IP bo'yicha)

**Nega login'dan (10/900s) qattiqroq:** legitim foydalanuvchi bir soatda 5 martadan ko'p faollashtirish urinishi qilmaydi (typo bo'lsa ham 2-3 urinish yetarli); har urinish Supervisor'ga real tarmoq so'rovi (login'dagi lokal bcrypt tekshiruvidan farqli — yuqori narx), shuning uchun tor limit + uzunroq oyna DoS/enumeration xarajatini balandroq qiladi, legitim oqimga deyarli ta'sir qilmasdan. IP-only kalit — enumeration'ning aynan o'zini (turli key qiymatlarini sinash) himoyalaydi, login'dagi "IP+telefon" combo kalitidan farqli (u yerda kalit — hisob identifikatori, bu yerda kalit — taxmin qilinayotgan sir, shuning uchun kalitga kiritilmaydi).

**Env var qo'shish (hardcode emas):** `auth.routes.ts` pretsedentiga mos — `apps/api/src/lib/env-schema.ts:86-90` (`AUTH_*` guruhi)dan keyin xuddi shu shaklda (`z.coerce.number().int().positive().default(...)`) 2 ta yangi maydon qo'shiladi.

**Fail-open xulqi o'zgarmaydi:** `rate-limit.ts`ni o'zgartirmaymiz — Redis ishlamasa, `activate` ham fail-open (request o'tadi, `logger.warn`). Bu ataylab — litsenziya faollashtirish mavjudligi rate-limit kafolatidan ustun (auth bilan bir xil dizayn tanlovi, RateLimitOptions darajasida umumiy).

## 4. Global constraint

1. **`rate-limit.ts` o'zgarmaydi** — faqat yangi chaqiruv qo'shiladi (`activate.ts`da), mavjud `RateLimitOptions`/`rateLimit()` signature 100% qayta ishlatiladi.
2. **`activate.ts` oddiy `Hono`, `OpenAPIHono` emas** — middleware `app.post(path, rateLimitMw, handler)` zanjiri bilan qo'shiladi, `createRoute({middleware:[...]})` naqshi QO'LLANILMAYDI (bu yerga mos kelmaydi).
3. **`keyFromBody` qasddan qo'shilmaydi** — enumeration threat model uchun IP-only kalit to'g'ri (§3'dagi mulohaza).
4. **Mavjud 4 ta `activate.test.ts` testi buzilmasligi kerak** — ular `mock.module` bilan `activateLicense`/`writeLicense`ni almashtiradi va real Redis'ga tegmaydi; rate-limit qo'shilgach ham bir marta chaqirilganda 429ga tushmasligi kerak (limit ≥5, bitta test faylida ketma-ket ≤4 chaqiriq bor — hammasi bir xil default `'unknown'` IP'da ishlaydi, chunki hech qanday `x-forwarded-for` header bermaydi. **Diqqat:** 4 ta test bitta process'da ketma-ket ishlaydi va barchasi bir xil IP (`'unknown'`) + bir xil `name: 'activate'` kalitini ishlatadi → agar shu test process CI'da boshqa `cli-370-*` integration testlari bilan bir xil Redis'ga ulansa va limit past bo'lsa, ular bir-biriga aralashishi mumkin. Bu tafsilot Task 1'da hal qilinadi — yangi integration test alohida, unikal `x-forwarded-for` IP bilan yoziladi (cli-227 pretsedenti), `activate.test.ts`ning o'zi esa IP bermagani uchun 4 chaqiriq (limit 5 dan kam) — xavfsiz, lekin agar kelajakda shu faylga yana test qo'shilsa, bu chegara eslab qolinishi kerak).

## 5. DoD (ticketdan, aniqlashtirilgan)

- [ ] `apps/api/src/lib/env-schema.ts` — yangi `ACTIVATE_RATE_LIMIT` (default 5) va `ACTIVATE_RATE_LIMIT_WINDOW_SEC` (default 3600) maydonlari, `AUTH_*` guruhi shaklida.
- [ ] `apps/api/src/routes/activate.ts` — `rateLimit({ name: 'activate', limit: env.ACTIVATE_RATE_LIMIT, windowSeconds: env.ACTIVATE_RATE_LIMIT_WINDOW_SEC })` (keyFromBody YO'Q) `POST /` route'iga middleware sifatida ulangan.
- [ ] Limit oshganda `429` + `{ error: { code: 'rate_limited', message } }` + `Retry-After` header (mavjud `rate-limit.ts` xulqi, o'zgarishsiz).
- [ ] Yangi integration test (`apps/api/tests/integration/cli-370-activate-rate-limit.test.ts`) — real Redis bilan, N (=limit) urinish 429 EMAS, N+1-chi urinish 429 ekanini isbotlaydi; mavjud `activate.test.ts`ning 4 testi buzilmaydi.
- [ ] `bun run typecheck` (yoki loyihaning umumiy typecheck skripti) toza.
