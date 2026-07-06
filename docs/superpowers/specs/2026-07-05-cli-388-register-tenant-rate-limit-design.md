# CLI-388 — `POST /api/auth/register-tenant`'da rate-limit yo'q (Dizayn / Spec)

> **Sana:** 2026-07-05
> **Linear:** CLI-388 (High)
> **Scope:** `apps/api/src/modules/auth/auth.routes.ts` (registerTenantRoute), `apps/api/src/lib/env-schema.ts` (2 yangi env var). `apps/api/src/lib/rate-limit.ts` **o'zgarmaydi** — mavjud `rateLimit()` factory qayta ishlatiladi.

---

## 1. Topilgan holat (kod o'qish natijasi)

`apps/api/src/modules/auth/auth.routes.ts`:

- **52-82-qator:** rate-limit qurish bloki — `loginRateLimit`, `refreshRateLimit`, `resetRequestRateLimit`, `resetRateLimit` — barchasi `rateLimit()` factory (`../../lib/rate-limit.ts`) chaqiradi, `env.AUTH_RATE_LIMIT_WINDOW_SEC` (900s = 15 daqiqa) oynasi bilan.
- **86-104-qator:** `registerTenantRoute` — `createRoute({...})` — **`middleware` maydoni umuman yo'q** (login/refresh/reset route'larida bor `middleware: [xRateLimit] as const,`). Responses'da ham **429 yo'q** (faqat 400/409).
- **106-125-qator:** handler — `service.registerTenant(body)` chaqiradi (yangi tenant + owner user + password hash yozadi — login'dagi oddiy bcrypt-compare'dan **ancha qimmatroq** operatsiya: bir nechta INSERT + unique-constraint tekshiruvi bitta tranzaksiyada).

`apps/api/src/lib/rate-limit.ts` (to'liq o'qildi, 120 qator) — `rateLimit(opts: RateLimitOptions): MiddlewareHandler`:
```ts
export type RateLimitOptions = {
  name: string;                                    // Redis kalit prefiksi
  limit: number;                                    // oyna ichida max urinish
  windowSeconds: number;                            // oyna davomiyligi
  keyFromBody?: (body: unknown) => string | undefined; // ixtiyoriy — bo'lmasa faqat IP
};
```
Kalit shakli: `rl:${name}:${ip}:${bodyKey ?? '-'}`. Fail-open (Redis xato bo'lsa — o'tkazadi, `logger.warn`). 429 javobi loyiha xato konvertida (`fail('rate_limited', ...)`) + `Retry-After` header — bu **avtomatik** keladi, qo'shimcha kod kerak emas.

**Precedent — `apps/api/src/routes/activate.ts` (CLI-370, 54 qator, to'liq o'qildi):** `POST /api/activate` xuddi shu muammoga (qimmat, tashqi-chaqiruvli, IP orqali ekspluatatsiya qilinadigan public endpoint) duch kelgan va **IP-only** kalit + **1 soatlik oyna** + **kichik limit (5)** bilan yechilgan:
```ts
const activateRateLimit = rateLimit({
  name: 'activate',
  limit: env.ACTIVATE_RATE_LIMIT,          // default 5
  windowSeconds: env.ACTIVATE_RATE_LIMIT_WINDOW_SEC, // default 3600 (1 soat)
});
```
Izohda aniq sabab yozilgan: *kalitga so'rov tanasidan qiymat (licenseKey) kiritilsa, tajovuzkor har urinishda boshqa qiymat berib yangi Redis bucket ochadi va limitni chetlab o'tadi — shuning uchun faqat IP.* Bu mulohaza **register-tenant uchun so'zma-so'z qo'llanadi**: `registerTenantSchema.ownerPhone` — har urinishda tajovuzkor boshqa telefon raqami bilan urinishi mumkin (ro'yxatdan o'tish — enumeration/spam maqsadi aynan shu), shuning uchun `keyFromBody: phoneKey` bilan cheklash **himoyani yo'qqa chiqaradi** (har telefon = yangi bucket). To'g'ri yechim — `login`dagidek phone-keyed EMAS, balki `activate`dagidek **faqat IP**.

`env-schema.ts` (85-100-qator) — mavjud namuna: `AUTH_RATE_LIMIT_WINDOW_SEC` (900, "15 daqiqa"), `AUTH_LOGIN_RATE_LIMIT` (10), `AUTH_REFRESH_RATE_LIMIT` (60), `AUTH_RESET_RATE_LIMIT` (5); alohida `ACTIVATE_RATE_LIMIT_WINDOW_SEC` (3600) + `ACTIVATE_RATE_LIMIT` (5) — har servis/route klassi o'z env-juftligiga ega, umumiy `AUTH_RATE_LIMIT_WINDOW_SEC`'ni **majburiy baham ko'rish yo'q** (refresh — 60/15min, reset — 5/15min, ikkalasi ham bitta oynadan foydalanadi, lekin bu tasodifiy emas — ular bir xil "brute-force credential" tabiatiga ega; register esa boshqa tabiat — arzon emas, tez-tez kerak emas — shuning uchun alohida env-juftlik to'g'riroq, `activate` bilan bir xil mulohaza).

Test qidiruvi: `apps/api/tests/integration/cli-370-activate-rate-limit.test.ts` (IP-only, Hono `app.request` + `x-forwarded-for`, limit-marta urinish → keyingisi 429, boshqa IP ta'sirlanmasligini tekshiruvchi ikkinchi test) va `cli-227-rate-limit-audit.test.ts` (login, `OpenAPIHono` + `authRoutes({ db })` orqali — `registerTenantRoute` xuddi shu `authRoutes` ichida bo'lgani uchun **shu ikkinchi fayl naqshi to'g'ridan-to'g'ri qo'llanadi**, `activateRoutes()` emas). `register-tenant` uchun maxsus test fayli **mavjud emas** — yangi yozilishi kerak.

## 2. Yechim

### 2.1 Yangi rate-limiter — IP-only, soatlik oyna, kichik limit

`auth.routes.ts`ning 52-82-qator blokiga qo'shiladi:
```ts
const registerRateLimit = rateLimit({
  name: 'register-tenant',
  limit: env.AUTH_REGISTER_RATE_LIMIT,
  windowSeconds: env.AUTH_REGISTER_RATE_LIMIT_WINDOW_SEC,
  // ⚠️ keyFromBody YO'Q — ownerPhone tajovuzkor tomonidan erkin tanlanadi (har
  // urinishda boshqa raqam = yangi tenant/owner). Agar telefon bo'yicha kalitласак,
  // tajovuzkor har safar yangi raqam berib limitni butunlay chetlab o'tadi — xuddi
  // activate.ts'dagi ACTIVATE_RATE_LIMIT mulohazasi (licenseKey ham shu sabab
  // kalitga kiritilmagan). Faqat IP.
});
```

### 2.2 Konfiguratsiya qiymatlari (aniq, va sabab)

| Env var | Qiymat | Sabab |
|---|---|---|
| `AUTH_REGISTER_RATE_LIMIT_WINDOW_SEC` | `3600` (1 soat) | Login/refresh/reset 15-daqiqalik oyna — bular **hisob egasi** o'z hisobiga qayta-qayta urinishi (parolni unutish, tarmoq xatosi) normal holat, shuning uchun qisqa oyna + darhol tiklanish kerak. Ro'yxatdan o'tish esa — **legitim foydalanuvchi bir soatda 5 martadan ko'p yangi klinika ro'yxatdan o'tkazmaydi** (bitta klinika — bitta tenant, kamdan-kam operatsiya). `activate.ts` xuddi shu mulohaza bilan 3600s tanlagan — bir xil "kamdan-kam, lekin qimmat operatsiya" klassi. |
| `AUTH_REGISTER_RATE_LIMIT` | `5` | `ACTIVATE_RATE_LIMIT` bilan bir xil (5/soat) — ikkalasi ham bitta IP'dan legitim ravishda juda kam marta chaqiriladigan, lekin backend'da to'liq tranzaksiya (bir nechta INSERT + unique-constraint) ishga tushiradigan public endpoint. Login (10/15min = 40/soat) va refresh (60/15min = 240/soat)dan **ataylab qattiqroq** — ticketning "bir necha urinish soatiga, daqiqasiga emas" talabiga mos. |

Ikkalasi ham `env-schema.ts`ga `ACTIVATE_RATE_LIMIT*` juftligi yoniga (yoki `AUTH_RATE_LIMIT_WINDOW_SEC` blokining davomida) `z.coerce.number().int().positive().default(...)` bilan qo'shiladi — mavjud namuna bilan bir xil shakl.

### 2.3 `registerTenantRoute`ga ulash

`createRoute({...})`:
- `operationId: 'registerTenant',` qatoridan keyin `middleware: [registerRateLimit] as const,` qo'shiladi (login/refresh/reset'dagi bir xil joylashuv).
- `responses`ga `429: errResp('Too many requests'),` qo'shiladi (409'dan keyin) — login/refresh/reset'dagi bir xil qator.

Handler (`app.openapi(registerTenantRoute, ...)`) o'zgarmaydi — 429 middleware darajasida to'xtatiladi, handler'gacha yetib bormaydi (xuddi login/refresh'da bo'lgani kabi).

### 2.4 Nega alohida env-juftlik, `AUTH_RATE_LIMIT_WINDOW_SEC`ni qayta ishlatish emas

`AUTH_RATE_LIMIT_WINDOW_SEC` (900s) — login/refresh/reset uchun umumiy, chunki uchalasi ham "hisob-darajasidagi tez-tez urinish" tabiatiga ega. Register-tenant — butunlay boshqa tabiat (kamdan-kam, IP-darajasida, tenant yaratish). Umumiy o'zgaruvchini qayta ishlatish operatorga ikkita semantik jihatdan bog'liq bo'lmagan narsani birga sozlashga majbur qiladi (masalan, kimdir login oynasini 5 daqiqaga qisqartirsa, buni bilmasdan register oynasi ham qisqarib qoladi). `activate.ts` xuddi shunday mustaqil `ACTIVATE_RATE_LIMIT_WINDOW_SEC` yaratgan — bir xil qaror shu yerda takrorlanadi.

## 3. Global constraint

1. **`apps/api/src/lib/rate-limit.ts` o'zgarmaydi.** Mavjud `rateLimit()` factory to'liq yetarli — yangi parametr yoki xulq kerak emas.
2. **`keyFromBody` QO'SHILMAYDI** — §2.1'dagi mulohaza (telefon-key attacker tomonidan trivial chetlab o'tiladi). Bu ataylab qaror, kelajakda "nega login kabi telefon bo'yicha emas" degan savolga javob.
3. **`.env.production.example`ga yangi ikki var (izohli, ixtiyoriy)** — mavjud `AUTH_RATE_LIMIT_WINDOW_SEC` bloki qatoriga qo'shilishi tavsiya etiladi (izchillik uchun), lekin `ACTIVATE_RATE_LIMIT*` ham hozircha u yerda yo'q — shuning uchun bu **DoD'ning majburiy qismi emas**, faqat cheap-win sifatida qo'shilsa yaxshi.
4. **`registerTenantResponseSchema`/`registerTenantSchema` o'zgarmaydi** — faqat route-darajasidagi middleware + responses map.

## 4. DoD (ticket'dan, aniqlashtirilgan)

- [ ] `registerTenantRoute`da `middleware: [registerRateLimit] as const,` bor (login/refresh/reset bilan bir xil pattern).
- [ ] `responses`da `429: errResp('Too many requests'),` bor.
- [ ] Yangi `registerRateLimit = rateLimit({ name: 'register-tenant', limit: env.AUTH_REGISTER_RATE_LIMIT, windowSeconds: env.AUTH_REGISTER_RATE_LIMIT_WINDOW_SEC })` — IP-only (`keyFromBody` yo'q).
- [ ] `env-schema.ts`da `AUTH_REGISTER_RATE_LIMIT_WINDOW_SEC` (default 3600) + `AUTH_REGISTER_RATE_LIMIT` (default 5) mavjud.
- [ ] Real Redis bilan integration test: bitta IP'dan `limit` marta urinishdan keyin (N+1)-chi so'rov 429 (`{ error: { code: 'rate_limited', message } }` + `Retry-After` header) qaytaradi; boshqa IP ta'sirlanmaydi.
- [ ] Typecheck toza.
