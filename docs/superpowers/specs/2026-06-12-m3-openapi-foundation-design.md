# M3 OpenAPI Contract — Foundation dizayni (CLI-118 / 119 / 120)

> **Epik:** CLI-92 (M3 — OpenAPI Contract migratsiyasi). **Sana:** 2026-06-12.
> **Qamrov:** Faqat Foundation + Pilot (F1/F2/F3). Wave A/B/C bu pattern takrori — alohida reja.
> **Holat:** F2 spike YASHIL (quyida isbot). Dizayn shu natija atrofida qurilgan.

## 1. Maqsad va kontekst

`@dental/api-client` hozir **qo'lda** boshqariladi: `endpoints.ts` (~24KB qo'lda `api.X.Y()`),
`types-*.ts` (qo'lda response tiplar), `client.ts` (transport). M3 buni
**`@hono/zod-openapi` → `openapi.json` → `orval` generated** zanjirga ko'chiradi.

**Yagona manba zanjiri:**
```
schema.openapi()  →  OpenAPIHono (createRoute)  →  generate:openapi (openapi.json)
                  →  orval  →  generated/ (react-query hooks)  →  feature api.ts  →  ekran
```

Foundation ketma-ket (F1→F2→F3 bog'liq, pattern o'rnatadi). Tasdiqlangach Wave A maksimal
parallel ko'chiriladi (M2 CLI-99 create-only parallel pattern bilan bir xil).

## 2. F2 — Zod-4 spec-emission spike (CLI-119) ✅ YASHIL

**Risk:** `@hono/zod-openapi` Zod 4 `.openapi()` dan valid spec emit qila olmasa — butun pattern o'zgaradi.
Shuning uchun advisor tavsiyasi bilan **throwaway spike AVVAL** ishga tushirildi (real pipeline'dan oldin).

**Isbotlangan faktlar (throwaway `zod-openapi-spike.ts`, o'chirildi):**

| Tekshiruv | Natija |
|---|---|
| O'rnatilgan versiya | `@hono/zod-openapi@1.4.0` (1.2.0 emas), `peerDependencies.zod = ^4.0.0` |
| Valid OpenAPI 3.1 emit | ✅ |
| **Dual-package hazard** — plain `from 'zod'` real `updateSettingsSchema` `createRoute` body'da | ✅ to'g'ri emit (constraint'lari bilan); paket `z` va repo `zod` — bitta Zod 4 instance |
| Envelope `apiResponseSchema(T)` → `data: $ref` | ✅ |
| `$ref` komponent registratsiya (`.openapi('Name')`) | ✅ |
| Spec extraction jonli DB'siz | ✅ |
| `c.json()` response schema'ga qarshi type-check | ✅ (handler `ok(data)` real shaklini qaytarishi SHART — cast arzon emas) |

**Pattern qarorlari (spike'dan):**
- Backend schema'lar `import { z } from 'zod'` da qolaversa bo'ladi; `.openapi()` metadata
  (`example`, ref nomi) kerak bo'lsa `import { z } from '@hono/zod-openapi'` — bir xil instance, kolliziyasiz.
- `z.string().uuid()` Zod 4 da deprecated → `z.uuid()`.

## 3. F1 — Pipeline scaffold (CLI-118)

### 3.1 Root app → `OpenAPIHono`
`apps/api/src/app.ts`: `new Hono()` → `new OpenAPIHono()`. Plain `Hono` modullar avvalgidek
`.route()` bilan mount bo'laveradi — **faqat `createRoute`-registratsiyalangan route'lar spec'ga tushadi**.
Bu inkremental migratsiyani beradi: ko'chmagan 26 modul spec'ni buzmaydi, yashil holatda qoladi.

### 3.2 Envelope helper'lar — `apps/api/src/lib/openapi.ts`
`@dental/core` `ok`/`ApiResponse` ni **aks ettiruvchi** wire-accurate Zod helper'lar:
```ts
export const apiResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ success: z.literal(true), data });

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
}).openapi('ErrorResponse');

// responses-builder: 200 success + standart 400/401/403 error envelope
export const okJson = <T extends z.ZodTypeAny>(schema: T, description: string) => ({ ... });
```
Handler real `ok(data)` qaytaradi va `apiResponseSchema(TSchema)` ga type-check'dan o'tadi (spike isbotladi).
Shared `errorResponseSchema` barcha 4xx uchun (mutator throw yo'lini hujjatlaydi).

### 3.3 `scripts/generate-openapi.ts`
`createApp()` import qiladi, `app.getOpenAPIDocument({ openapi: '3.1.0', info: {...} })` chaqiradi,
`openapi.json` yozadi (joy: `packages/api-client/openapi.json`).
- **Env kerak, jonli DB EMAS:** `db/client.ts` import'da `postgres()` pool yaratadi, lekin lazy
  (birinchi query'gacha ulanmaydi). Spec extraction query qilmaydi. CI'da env bo'lsa kifoya.
- Root `package.json`: `"generate:openapi": "bun --filter @dental/api generate:openapi"`.

### 3.4 `orval.config.ts` (repo root yoki `packages/api-client/`)
- `input: packages/api-client/openapi.json`
- `output.target: packages/api-client/src/generated/`
- `client: 'react-query'`
- `override.mutator`: **yangi envelope-qaytaruvchi entry** (3.5). Mavjud transport (auth header, 401
  refresh+retry, throw on error) qayta ishlatiladi, lekin `.data` unwrap QILMAYDI.
- **Orval zod EMIT QILMAYDI** — backend validatsiya qiladi, form schema'lar qo'lda (`settings.schema.ts`).

### 3.5 Mutator — legacy unwrap bilan yonma-yon (KRITIK coexistence)
Mavjud `client.ts` `request<T>` → `handleParsed` → `parsed.data` (**unwrap qiladi**). Coexistence
davrida qo'lda `endpoints.ts` hali shu unwrapping `get/post/...` ni ishlatadi — uni o'zgartirib
bo'lmaydi (26 ko'chmagan modul buziladi). Shuning uchun orval mutator **alohida** envelope-qaytaruvchi
funksiya bo'ladi (masalan `requestEnvelope<T>` / `mutator.ts`): bir xil transport (auth, 401
refresh+retry, throw on `success:false`/non-2xx) — lekin success'da **to'liq `{success,data}`
envelope** qaytaradi. Legacy unwrapping `request` o'zgarmaydi; barcha modul ko'chgach (Wave C oxiri)
o'chiriladi.
- Root `package.json`: `"generate:api-client": "orval --config orval.config.ts"`.

## 4. F3 — Pilot tenant-settings (CLI-120)

### 4.1 Backend migratsiya
`tenant-settings` modulini `OpenAPIHono` + `createRoute`'ga ko'chir (GET + PATCH):
- `tenant-settings.schema.ts`: response DTO'larga `.openapi('TenantSettings')` qo'sh.
- `tenant-settings.routes.ts`: `new Hono()` → `new OpenAPIHono()`; `app.openapi(route, handler)`.
  Middleware (auth, RLS, requirePermission) `createRoute` `middleware` yoki `.use()` orqali saqlanadi.
- Handler `c.json(ok(data))` qaytaradi — `apiResponseSchema` type-check'dan o'tadi.

### 4.2 Envelope strategiyasi — **schema=envelope (ochiq)** [Qaror]
Generated tip = to'liq `{success:true, data:T}` envelope (spec'dan, wire-accurate).
- **Mutator** (3.5, envelope-qaytaruvchi entry): success'da **parsed envelope'ni qaytaradi** (unwrap
  QILMAYDI); `success:false`/non-2xx da `ApiError` throw; 401 da refresh+retry. Legacy unwrapping
  `request` (qo'lda endpoints.ts uchun) o'zgarmaydi. Ya'ni runtime qiymat doim success envelope.
- **Feature `api.ts`:** `.data` ni o'zi ochadi (`const res = await getSettings(); return res.data`).
- **Sabab:** orval'ning "mutator return-type schema-derived tipni override qiladimi" degan empirik
  pivotga bog'liqlik YO'Q — schema-derived tip (envelope) AYNAN kerakli. Spec maksimal aniq.
  Tradeoff: har feature `.data` unwrap qiladi (27 modul bo'ylab ko'proq frontend o'zgarishi) — qabul qilindi.

### 4.3 Web feature ulash
`apps/web/src/features/settings/settings.api.ts` — qo'lda `api.getSettings()`/`api.updateSettings()`
o'rniga generated hook (yoki generated query-fn'ni feature hook ichida o'rab `.data` unwrap qil).

### 4.4 Coexistence (per-modul o'chirish)
- Generated chiqish `packages/api-client/src/generated/` — alohida dir.
- `index.ts` barrel: generated'ni **explicit** re-export qil (`export *` EMAS) — `TenantSettings`
  kolliziyasi lokal bo'lsin.
- tenant-settings ko'chganda **darhol** o'chir: `endpoints.ts` dagi `getSettings`/`updateSettings`,
  `types.ts` dagi qo'lda `TenantSettings`. Barrel double-export bo'lsa tsc=0 gate darhol ushlaydi.

## 5. Acceptance (Foundation done)
1. `bun run generate:openapi` → valid `openapi.json` (tenant-settings GET+PATCH ichida).
2. `bun run generate:api-client` → `generated/` da react-query hooks, mutator = client.ts.
3. Settings ekrani generated client orqali ishlaydi (qo'lshasi o'chirilgan).
4. **`turbo typecheck` = 0 xato** (coexistence buzilmaydi).
5. tenant-settings **integration test yashil** (`--env-file=../../.env` bilan, memory gotcha).
6. Pattern hujjatlangan — Wave A agentlari takror qila oladi.

## 6. Wave A ga tayyorgarlik (keyingi reja, bu spec'da emas)
Foundation yashil bo'lgach, CLI-121…129 modullar **create-only parallel agentlar** bilan
ko'chiriladi (M2 CLI-99 pattern): har modul disjoint fayllar, agentlar commit qilmaydi;
orchestrator har to'lqindan keyin tsc=0 + integration yashil tekshiradi va commit qiladi.

## 7. Risklar va yumshatish
| Risk | Holat / yumshatish |
|---|---|
| Zod 4 spec emission | ✅ Spike bilan hal qilindi |
| Dual-package hazard | ✅ Spike: bitta instance, kolliziyasiz |
| Spec gen jonli infra talab qiladi | ✅ `postgres()` lazy; env kerak, DB emas |
| Envelope/orval type pivot | ✅ schema=envelope qarori pivotni yo'q qildi |
| Coexistence type kolliziyasi | Explicit barrel + tsc=0 gate; per-modul o'chirish |
| Middleware createRoute'da saqlanishi | F3 da empirik tasdiqlanadi (auth/RLS/permission) |
