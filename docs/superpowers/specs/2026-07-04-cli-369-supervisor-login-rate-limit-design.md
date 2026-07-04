# CLI-369 — Supervisor Admin login endpoint'ida rate-limit/lockout (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-369 (Medium)
> **Scope:** `apps/supervisor-api/src/modules/auth/auth.routes.ts` (19-31 qator) + yangi `apps/supervisor-api/src/lib/rate-limit.ts`

---

## 1. Topilgan holat (kod o'qish natijasi)

**`apps/supervisor-api/src/modules/auth/auth.routes.ts`** — `POST /login` (20-32 qator) faqat `bcrypt.compare(password, user.passwordHash)` chaqiradi. Urinishlar soni hisoblanmaydi, kechikish yo'q, IP yoki hisob bo'yicha lockout yo'q. Ticket to'g'ri.

**`apps/api/src/lib/rate-limit.ts`** (mavjud yechim, CLI-227) — Redis fixed-window rate limiter:
- `rateLimit({ name, limit, windowSeconds, keyFromBody? })` → Hono `MiddlewareHandler` qaytaradi.
- Kalit: `rl:${name}:${ip}:${bodyKey ?? '-'}` — IP + (ixtiyoriy) request body maydoni (login uchun `phone`) bo'yicha.
- Mexanizm: `ioredis` `INCR` + birinchi urinishda `EXPIRE`. Limit oshsa `429` + `Retry-After` header.
- **Fail-open**: Redis ishlamasa/xato bersa — request **o'tkaziladi** (rate-limit emas, login mavjudligi ustuvor), `logger.warn` bilan.
- `apps/api/src/modules/auth/auth.routes.ts:59-82` da qo'llanilishi: har route (`login`, `refresh`, `reset-request`, `reset`) uchun alohida `rateLimit(...)` instance yaratiladi (nom+limit+window+kalit-ekstraktor bilan) va `createRoute({..., middleware: [loginRateLimit] as const, ...})` orqali **per-route** ulanadi (global emas). Limit/window qiymatlari `env.AUTH_LOGIN_RATE_LIMIT` (default 10) / `env.AUTH_RATE_LIMIT_WINDOW_SEC` (default 900s = 15 daqiqa) — `apps/api/src/lib/env-schema.ts:87-90`.

## 2. Supervisor-api'da Redis mavjudmi? — **YO'Q, aniqlangan**

Uch mustaqil tekshiruv bir xil natija berdi:

1. **`apps/supervisor-api/package.json`** — `dependencies`/`devDependencies` ro'yxatida `ioredis`/`redis` **umuman yo'q** (bor: `hono`, `drizzle-orm`, `postgres`, `zod`, `jose`, `bcryptjs`).
2. **`apps/supervisor-api/src/lib/`** — faqat `rsa.ts`, `rsa.test.ts`, `test-helpers.ts`. Redis client/wrapper yo'q. `env.ts` fayli ham yo'q (env o'qish `process.env.X!` inline, schema-validatsiyasiz).
3. **`infra/supervisor/docker-compose.prod.yml`** (Supervisor'ning haqiqiy PROD orkestratsiyasi) — servislar: `postgres`, `migrate`, `api`, `admin`, `caddy`. **Redis servisi yo'q.** Fayl boshidagi kommentariy buni ataylab tasdiqlaydi: *"SINGLE CENTRAL DEPLOYMENT ... separate stack, separate secrets, **no shared service names, no shared network**"* — ya'ni dental-service'ning o'z `infra/docker-compose.yml`dagi `redis` (Redis 7, parolli) servisiga ham tarmoq darajasida ulanish yo'q, chunki bu ataylab izolyatsiya qilingan alohida mahsulot (CLAUDE.md §4 shu qarorni takrorlaydi).

**Xulosa: `apps/api/src/lib/rate-limit.ts`ni to'g'ridan-to'g'ri import/reuse qilib bo'lmaydi** — u `ioredis`ga qattiq bog'liq, supervisor-api'da na dependency, na runtime Redis instance bor. Uni ishlatish uchun yoki (a) supervisor-api'ga yangi `ioredis` dependency + `infra/supervisor/docker-compose.prod.yml`ga yangi `redis` servisi qo'shish kerak bo'lardi, yoki (b) yengil, xotirada (in-memory) ekvivalent yozish kerak.

## 3. Yondashuv — **port qilingan in-memory ekvivalent** (Redis servisi qo'shilmaydi)

**Qaror: (b).** Sabab:
- `infra/supervisor/docker-compose.prod.yml`da `api` bitta container, replika/scale-out konfiguratsiyasi yo'q — single-process deployment. In-memory fixed-window state process ichida to'liq yetarli (Redis'ning asosiy afzalligi — bir nechta instance orasida umumiy state — bu yerda kerak emas).
- Supervisor Admin login — past-trafikli ichki panel (bir nechta admin foydalanuvchi), yuqori QPS yo'q — xotira sarfi ahamiyatsiz.
- Yangi infra komponenti (Redis) + yangi dependency qo'shish — Medium ticket uchun nomutanosib katta o'zgarish (yangi secret, yangi servis, yangi monitoring yuki, deploy runbook yangilash) — YAGNI.
- Ticket matni o'zi buni ruxsat beradi: *"add rate-limit middleware ... using the existing apps/api pattern **or an equivalent**"*.

**Amalga oshirish** — yangi `apps/supervisor-api/src/lib/rate-limit.ts`, `apps/api`dagi bilan **bir xil public shape** (`rateLimit(opts): MiddlewareHandler`, `RateLimitOptions{ name, limit, windowSeconds, keyFromBody? }`, xato konverti `{ error: { code, message } }`, 429 + `Retry-After`), lekin ichki storage `Map<string, { count: number; resetAt: number }>` (module-level singleton, lazy expiry — har chaqiruvda `Date.now() > entry.resetAt` bo'lsa reset). Redis yo'qligi sababli **fail-open branch kerak emas** (xotira operatsiyasi xato bermaydi) — bu jihatdan supervisor versiyasi apps/api versiyasidan **soddaroq**.

`/login` route'iga qo'llanish: `authRoutes()` factory ichida `loginRateLimit = rateLimit({ name: 'login', limit: 10, windowSeconds: 900, keyFromBody: (b) => (b as {email?:string}).email })` yaratiladi va `app.post('/login', loginRateLimit, zValidator('json', loginSchema), async (c) => {...})` — mavjud Hono (OpenAPI emas) route ro'yxatga olish uslubiga mos, middleware oddiy Hono `app.post(path, mw1, mw2, handler)` zanjiri sifatida qo'shiladi (supervisor-api `@hono/zod-validator` bilan oddiy `Hono`, `@hono/zod-openapi` emas — `createRoute({middleware:[...]})` naqshi bu yerda qo'llanilmaydi).

Kalit: IP (`x-forwarded-for` → `x-real-ip` → `'unknown'`, apps/api bilan bir xil ekstraktor) + `email` (body'dan) — hisob bo'yicha ham, IP bo'yicha ham cheklov birlashtiriladi (apps/api login pattern'iga mos).

Limit/window — **hardcoded konstanta** (`10` urinish / `900` soniya), env-configurable emas: supervisor-api'da `env.ts`/Zod env-schema validatsiya qatlami umuman yo'q (topilma §2.2) — buni shu ticket doirasida qo'shish scope-creep bo'lardi. Kelajakda kerak bo'lsa oson env-parametrlashtiriladi.

## 4. Global constraint

1. **Yangi Redis dependency/servis QO'SHILMAYDI** — bu ataylab tanlov (§3), supervisor-api izolyatsiyasini buzmaslik uchun (CLAUDE.md: "klinika deploy'iga HECH QACHON qo'shilmaydi" — teskarisi ham to'g'ri, bu mahsulotga dental-service infra qo'shilmaydi).
2. **Fail-open talab qilinmaydi** — in-memory storage'da "Redis down" holati yo'q; middleware har doim deterministik ishlaydi.
3. **Public shape apps/api bilan mos** (`rateLimit(opts)` → `MiddlewareHandler`, xato konverti bir xil) — kelajakda ikkala loyiha bitta shared `@dental/core` yordamchisiga konvergatsiya qilinsa, migratsiya kamroq churn bilan o'tadi. Lekin **hech qanday yangi shared package yaratilmaydi** — bu ticket scope'idan tashqari.
4. **Mavjud `auth.test.ts` testlari buzilmasligi kerak** — ular real DB bilan ishlaydi va IP header bermaydi (default `'unknown'` IP'ga tushadi); rate-limit testi alohida, unikal IP (`x-forwarded-for`) bilan yozilishi shart — aks holda parallel test run'da limit counter'lar bir-biriga aralashib false-positive 429 berishi mumkin.

## 5. DoD (ticket'dan, aniqlashtirilgan)

- [ ] Yangi `apps/supervisor-api/src/lib/rate-limit.ts` — in-memory fixed-window `rateLimit(opts)` middleware (apps/api shape'iga mos, Redis'siz).
- [ ] `POST /v1/admin/auth/login` — `loginRateLimit` middleware bilan himoyalangan (limit 10 urinish / 15 daqiqa oyna, IP+email kalit).
- [ ] Limit oshganda `429` + `{ error: { code: 'RATE_LIMITED', message } }` + `Retry-After` header.
- [ ] Test: `apps/supervisor-api/src/lib/rate-limit.test.ts` (unit — limit ostida o'tadi, limit oshsa 429, window tugagach reset) + `auth.test.ts`ga qo'shimcha test (login endpoint orqali, unikal IP bilan) — mavjud 4 ta test buzilmaydi.
