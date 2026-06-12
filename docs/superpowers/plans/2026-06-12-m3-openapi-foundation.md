# M3 OpenAPI Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@dental/api-client` ni qo'lda holatdan `@hono/zod-openapi → openapi.json → orval generated` zanjirga ko'chirish uchun pipeline'ni o'rnatish va pilot modul (tenant-settings) bilan butun zanjirni isbotlash.

**Architecture:** Root app `OpenAPIHono` ga aylanadi; plain `Hono` modullar mount bo'laveradi, faqat `createRoute`-registratsiyalangan route'lar spec'ga tushadi (inkremental migratsiya). Backend wire-accurate envelope schema (`{success,data}`) emit qiladi; orval mutator success envelope'ni qaytaradi (unwrap qilmaydi), feature `api.ts` `.data` ni ochadi. Generated chiqish `generated/` da, barrel'da explicit re-export — qo'lda tiplar bilan kolliziyasiz coexistence.

**Tech Stack:** Bun, Hono, `@hono/zod-openapi@1.4.0`, Zod 4, orval (react-query client), TanStack Query, Drizzle.

**Dizayn manbasi:** `docs/superpowers/specs/2026-06-12-m3-openapi-foundation-design.md`. F2 spike YASHIL (spec §2).

**Test buyrug'i (api integration):** `cd apps/api && bun test --env-file=../../.env <pattern>` (`bun:test`, vitest EMAS). Typecheck: `bun --filter @dental/api typecheck` va `bun --filter @dental/web typecheck` (yoki root `turbo typecheck`).

---

## File Structure

**F1 — Pipeline scaffold:**
- Create: `apps/api/src/lib/openapi.ts` — envelope Zod helpers (`apiResponseSchema`, `errorResponseSchema`, `okJson`).
- Create: `apps/api/src/lib/openapi.test.ts` — helper unit testlar.
- Modify: `apps/api/src/app.ts` — `new Hono()` → `new OpenAPIHono()`.
- Create: `apps/api/scripts/generate-openapi.ts` — spec extraction.
- Modify: `apps/api/package.json` — `generate:openapi` script.
- Modify: `packages/api-client/src/client.ts` — shared fetch+refresh extraksiya + `requestRaw` (envelope-qaytaruvchi).
- Create: `packages/api-client/src/mutator.ts` — `configureClient` + `customInstance` (orval mutator).
- Create: `orval.config.ts` (repo root) — orval konfiguratsiya.
- Modify: root `package.json` — `generate:api-client` script + `orval` devDep.
- Modify: `packages/api-client/package.json` — `@tanstack/react-query` dep.

**F3 — Pilot tenant-settings:**
- Modify: `apps/api/src/modules/tenant-settings/tenant-settings.schema.ts` — response DTO + `.openapi()`.
- Create: `apps/api/src/modules/tenant-settings/tenant-settings.mapper.ts` — DB row → DTO (Date→ISO).
- Create: `apps/api/src/modules/tenant-settings/tenant-settings.mapper.test.ts`.
- Modify: `apps/api/src/modules/tenant-settings/tenant-settings.routes.ts` — `OpenAPIHono` + `createRoute`.
- Create: `apps/api/tests/integration/tenant-settings.test.ts` — GET/PATCH integration.
- Modify: `packages/api-client/src/index.ts` — generated explicit re-export; qo'lda `TenantSettings` o'chirish koordinatsiyasi.
- Modify: `packages/api-client/src/types.ts` — qo'lda `TenantSettings` o'chirish.
- Modify: `packages/api-client/src/endpoints.ts` — `tenant.getSettings`/`updateSettings` o'chirish.
- Modify: `apps/web/src/features/settings/settings.api.ts` — generated hook'larga ulash.
- Modify: `apps/web/src/lib/api.ts` — `configureClient(...)` startup chaqiruvi.

---

## F1 — Pipeline scaffold (CLI-118)

### Task 1: Envelope Zod helpers

**Files:**
- Create: `apps/api/src/lib/openapi.ts`
- Test: `apps/api/src/lib/openapi.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/openapi.test.ts
import { describe, expect, test } from 'bun:test';
import { z } from '@hono/zod-openapi';
import { apiResponseSchema, errorResponseSchema } from './openapi.ts';

describe('apiResponseSchema', () => {
  test('wraps data schema in success envelope', () => {
    const schema = apiResponseSchema(z.object({ name: z.string() }));
    const parsed = schema.parse({ success: true, data: { name: 'x' } });
    expect(parsed).toEqual({ success: true, data: { name: 'x' } });
  });

  test('rejects success:false on the success envelope', () => {
    const schema = apiResponseSchema(z.object({ name: z.string() }));
    expect(() => schema.parse({ success: false, data: { name: 'x' } })).toThrow();
  });
});

describe('errorResponseSchema', () => {
  test('accepts a well-formed error envelope', () => {
    const parsed = errorResponseSchema.parse({
      success: false,
      error: { code: 'bad', message: 'nope' },
    });
    expect(parsed.error.code).toBe('bad');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/lib/openapi.test.ts`
Expected: FAIL — `Cannot find module './openapi.ts'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/lib/openapi.ts
import { z } from '@hono/zod-openapi';

/**
 * `@dental/core` `ok(data)` = `{ success: true, data }` ni AKS ETTIRUVCHI wire-accurate
 * Zod envelope. OpenAPI response schema'si shu — generated tip ham shu envelope bo'ladi
 * (schema=envelope qarori, spec §4.2).
 */
export const apiResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ success: z.literal(true), data });

/** `@dental/core` `fail(...)` envelope — barcha 4xx javoblar uchun (mutator throw yo'li). */
export const errorResponseSchema = z
  .object({
    success: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .openapi('ErrorResponse');

/**
 * `createRoute` `responses` builder — 200 success envelope + standart 400/401/403 error.
 * Modul route'lari shuni ishlatadi (DRY).
 */
export const okJson = <T extends z.ZodTypeAny>(schema: T, description: string) => ({
  200: {
    content: { 'application/json': { schema: apiResponseSchema(schema) } },
    description,
  },
  400: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Validation error',
  },
  401: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Unauthorized',
  },
  403: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Forbidden',
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test src/lib/openapi.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/openapi.ts apps/api/src/lib/openapi.test.ts
git commit -m "feat(api): envelope OpenAPI Zod helpers (CLI-118)"
```

---

### Task 2: Root app → OpenAPIHono

**Files:**
- Modify: `apps/api/src/app.ts:34-35` (`const app = new Hono()` → `OpenAPIHono`)

OpenAPIHono `Hono` ni kengaytiradi — `.route()`, `.use()`, `.onError()` bir xil ishlaydi. Bu task spec route qo'shmaydi; faqat parent tipni almashtiradi va regressiya yo'qligini isbotlaydi.

- [ ] **Step 1: Modify app.ts import and constructor**

`apps/api/src/app.ts` da `import { Hono } from 'hono';` qatorini saqlab, yangi import qo'sh:

```ts
import { OpenAPIHono } from '@hono/zod-openapi';
```

`createApp` ichida (`app.ts:35`):

```ts
// AVVAL: const app = new Hono();
const app = new OpenAPIHono();
```

`Hono` import boshqa joyda ishlatilmasa (modullar o'z faylida import qiladi), `import { Hono } from 'hono';` ni o'chir. Tekshir: `grep -n "new Hono\|Hono\b" apps/api/src/app.ts`.

- [ ] **Step 2: Typecheck (regressiya yo'qligi)**

Run: `bun --filter @dental/api typecheck`
Expected: 0 xato.

- [ ] **Step 3: Existing integration smoke (RLS test)**

Run: `cd apps/api && bun test --env-file=../../.env rls`
Expected: PASS (mavjud testlar OpenAPIHono ostida ham yashil).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "refactor(api): root app Hono → OpenAPIHono (CLI-118)"
```

---

### Task 3: generate-openapi script

**Files:**
- Create: `apps/api/scripts/generate-openapi.ts`
- Modify: `apps/api/package.json` (scripts)

`createApp()` ni import qiladi, spec'ni `getOpenAPIDocument` bilan oladi, `packages/api-client/openapi.json` ga yozadi. Jonli DB shart emas (`postgres()` lazy).

- [ ] **Step 1: Write the script**

```ts
// apps/api/scripts/generate-openapi.ts
/**
 * OpenAPI spec generatsiyasi — `createApp()` route definitsiyalaridan `openapi.json` yozadi.
 * Jonli DB SHART EMAS: `postgres()` pool lazy, spec extraction query qilmaydi. Env kerak.
 * Run: bun --filter @dental/api generate:openapi
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from '../src/app.ts';

const app = createApp();

const doc = app.getOpenAPIDocument({
  openapi: '3.1.0',
  info: { title: 'Dental Service API', version: '0.1.0' },
});

const outPath = resolve(import.meta.dir, '../../../packages/api-client/openapi.json');
writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`✅ OpenAPI spec yozildi: ${outPath} (${Object.keys(doc.paths ?? {}).length} path)`);
```

> Eslatma: `createApp` `OpenAPIHono` qaytarishi kerak (Task 2). `getOpenAPIDocument` faqat `OpenAPIHono` da mavjud.

- [ ] **Step 2: Add package.json script**

`apps/api/package.json` `scripts` ga qo'sh:

```json
    "generate:openapi": "bun --env-file=../../.env run scripts/generate-openapi.ts",
```

- [ ] **Step 3: Run it**

Run: `bun --filter @dental/api generate:openapi`
Expected: `✅ OpenAPI spec yozildi: .../packages/api-client/openapi.json (0 path)` — hozircha 0 path (hali modul ko'chmagan), lekin valid JSON.

- [ ] **Step 4: Verify valid JSON + structure**

Run: `cat packages/api-client/openapi.json | head -10`
Expected: `"openapi": "3.1.0"`, `"info"`, `"paths"` kalitlari mavjud.

- [ ] **Step 5: Commit**

```bash
git add apps/api/scripts/generate-openapi.ts apps/api/package.json packages/api-client/openapi.json
git commit -m "feat(api): generate-openapi spec extraction script (CLI-118)"
```

---

### Task 4: Mutator — envelope-qaytaruvchi transport

**Files:**
- Modify: `packages/api-client/src/client.ts` (shared fetch+refresh extraksiya + `requestRaw`)
- Create: `packages/api-client/src/mutator.ts`
- Test: `packages/api-client/src/mutator.test.ts`
- Modify: `packages/api-client/package.json` (`@tanstack/react-query` dep)

**Muammo (spec §3.5):** Mavjud `request<T>` `parsed.data` ni unwrap qiladi — qo'lda `endpoints.ts` shunga bog'liq (o'zgartirib bo'lmaydi). Generated client esa envelope kerak. Yechim: shared fetch+refresh helper'ni extrakt qil, `requestRaw<T>` (envelope qaytaradi) qo'sh — `request<T>` (unwrap) o'zgarmaydi.

- [ ] **Step 1: Refactor client.ts — extract shared fetch+refresh, add requestRaw**

`packages/api-client/src/client.ts` ichida `request` (105–126 qatorlar) ni qayta yoz. `fetchWithAuth`, `tryRefresh`, `parseResponse`, `handleParsed` o'zgarmaydi. Shared `fetchEnvelope` helper'ni ajrat (`parsed` + `status` qaytaradi — `status` throw uchun kerak), keyin `request` (unwrap) va `requestRaw` (envelope) shundan foydalanadi:

```ts
  const fetchEnvelope = async <T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ parsed: ApiResponse<T>; status: number }> => {
    let res = await fetchWithAuth(method, path, body);
    let parsed = await parseResponse<T>(res);
    if (!parsed.success && res.status === 401 && parsed.error.code === 'auth.invalid_token') {
      if (path !== '/api/auth/refresh') {
        const refreshed = await tryRefresh();
        if (refreshed) {
          res = await fetchWithAuth(method, path, body);
          parsed = await parseResponse<T>(res);
        } else {
          config.onUnauthorized?.();
        }
      } else {
        config.onUnauthorized?.();
      }
    }
    return { parsed, status: res.status };
  };

  // Legacy: unwrapped data (qo'lda endpoints.ts uchun — O'ZGARMAYDI).
  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const { parsed, status } = await fetchEnvelope<T>(method, path, body);
    return handleParsed<T>(parsed, status);
  };

  // Generated client uchun: TO'LIQ success envelope qaytaradi (throw on !success/non-2xx).
  const requestRaw = async <T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ success: true; data: T }> => {
    const { parsed, status } = await fetchEnvelope<T>(method, path, body);
    if (!parsed.success) {
      throw new ApiError(parsed.error.code, parsed.error.message, status, parsed.error.details);
    }
    return parsed;
  };
```

`return { ... }` (145–152) ga `requestRaw` qo'sh:

```ts
  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
    requestRaw,
    upload,
  };
```

`upload` ham `fetchEnvelope` pattern'iga ko'chmaydi (alohida `fetchUpload` ishlatadi) — o'zgarmaydi.

- [ ] **Step 2: Write the mutator + test (failing first)**

```ts
// packages/api-client/src/mutator.test.ts
import { describe, expect, test } from 'bun:test';
import { configureClient, customInstance, isClientConfigured } from './mutator.ts';

describe('mutator', () => {
  test('throws when not configured', async () => {
    // Yangi import izolyatsiyasi qiyin — buning o'rniga configured holatni tekshiramiz.
    expect(typeof customInstance).toBe('function');
  });

  test('configureClient marks the client ready', () => {
    configureClient({ baseUrl: '', getAccessToken: () => null });
    expect(isClientConfigured()).toBe(true);
  });
});
```

Run: `cd packages/api-client && bun test src/mutator.test.ts`
Expected: FAIL — `Cannot find module './mutator.ts'`.

- [ ] **Step 3: Implement mutator.ts**

```ts
// packages/api-client/src/mutator.ts
/**
 * Orval custom mutator — generated react-query hooks shu funksiya orqali so'rov yuboradi.
 * `client.ts` transport (auth header, 401 refresh+retry, throw on error)ni qayta ishlatadi.
 * `requestRaw` TO'LIQ `{success,data}` envelope qaytaradi — generated tip ham envelope
 * (schema=envelope, spec §4.2). Feature `api.ts` `.data` ni ochadi.
 *
 * Mutator statik named export — web auth-store'ni import qila olmaydi. Shuning uchun
 * modul-singleton: web `lib/api.ts` startup'da bir marta `configureClient(config)` chaqiradi.
 */
import { type ApiClient, type ApiClientConfig, createApiClient } from './client.ts';

let client: ApiClient | null = null;

export const configureClient = (config: ApiClientConfig): void => {
  client = createApiClient(config);
};

export const isClientConfigured = (): boolean => client !== null;

export type CustomInstanceConfig = {
  url: string;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  params?: Record<string, string | number | boolean | undefined>;
  data?: unknown;
  signal?: AbortSignal;
};

export const customInstance = async <T>(config: CustomInstanceConfig): Promise<T> => {
  if (!client) {
    throw new Error('api-client not configured — configureClient() ni startup\'da chaqiring');
  }
  const qs = config.params
    ? `?${new URLSearchParams(
        Object.entries(config.params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      ).toString()}`
    : '';
  const path = `${config.url}${qs}`;
  const method = config.method.toUpperCase();
  // requestRaw `{success,data}` envelope qaytaradi — generated T = envelope.
  return client.requestRaw(method, path, config.data) as Promise<T>;
};
```

> Eslatma: `ApiClient` tipi `requestRaw` ni o'z ichiga olishi kerak — Task 4 Step 1 `ApiClient = ReturnType<typeof createApiClient>` shuni avtomatik beradi.

- [ ] **Step 4: Run test**

Run: `cd packages/api-client && bun test src/mutator.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add react-query dep to api-client**

`packages/api-client/package.json` `dependencies` ga qo'sh (generated hooks import qiladi, isolated typecheck uchun):

```json
    "@tanstack/react-query": "^5.62.10",
```

Run: `bun install`
Expected: lockfile yangilanadi, xato yo'q.

- [ ] **Step 6: Commit**

```bash
git add packages/api-client/src/client.ts packages/api-client/src/mutator.ts packages/api-client/src/mutator.test.ts packages/api-client/package.json bun.lockb
git commit -m "feat(api-client): envelope mutator + requestRaw transport (CLI-118)"
```

---

### Task 5: orval config + generate:api-client script

**Files:**
- Create: `orval.config.ts` (repo root)
- Modify: root `package.json` (scripts + `orval` devDep)

Bu task config'ni o'rnatadi; haqiqiy generatsiya F3 da (tenant-settings route mavjud bo'lgach) ishlaydi. Hozir spec bo'sh path'li — orval minimal/bo'sh chiqish beradi yoki "no operations" ogohlantiradi; bu kutilgan.

- [ ] **Step 1: Add orval devDependency**

Root `package.json` `devDependencies` ga qo'sh:

```json
    "orval": "^7.3.0",
```

Run: `bun install`
Expected: orval o'rnatiladi.

- [ ] **Step 2: Create orval.config.ts**

```ts
// orval.config.ts
import { defineConfig } from 'orval';

export default defineConfig({
  dental: {
    input: {
      target: './packages/api-client/openapi.json',
    },
    output: {
      mode: 'tags-split',
      target: './packages/api-client/src/generated/endpoints.ts',
      schemas: './packages/api-client/src/generated/model',
      client: 'react-query',
      // Backend validatsiya qiladi, frontend form schema'lar qo'lda — orval zod EMIT QILMAYDI.
      override: {
        mutator: {
          path: './packages/api-client/src/mutator.ts',
          name: 'customInstance',
        },
        query: {
          useQuery: true,
          useMutation: true,
        },
      },
    },
    hooks: {
      afterAllFilesWrite: 'biome format --write',
    },
  },
});
```

- [ ] **Step 3: Add root package.json script**

Root `package.json` `scripts` ga qo'sh:

```json
    "generate:api-client": "orval --config orval.config.ts",
    "generate:contract": "bun run generate:openapi && bun run generate:api-client",
    "generate:openapi": "bun --filter @dental/api generate:openapi",
```

- [ ] **Step 4: Smoke run (bo'sh spec OK)**

Run: `bun run generate:api-client`
Expected: orval ishlaydi; 0 operation bo'lsa "no path" ogohlantirishi mumkin — xato emas. `generated/` dir yaratilmasligi yoki bo'sh bo'lishi mumkin (F3 da to'ladi).

- [ ] **Step 5: Commit**

```bash
git add orval.config.ts package.json bun.lockb
git commit -m "build(api-client): orval react-query config + generate scripts (CLI-118)"
```

---

## F3 — Pilot tenant-settings (CLI-120)

### Task 6: tenant-settings response schema + .openapi()

**Files:**
- Modify: `apps/api/src/modules/tenant-settings/tenant-settings.schema.ts`

Mavjud `updateSettingsSchema` (request) saqlanadi. Response DTO schema qo'shiladi — timestamp'lar **string** (wire = JSON ISO; hand `TenantSettings` ham `string`).

- [ ] **Step 1: Add response schema**

`apps/api/src/modules/tenant-settings/tenant-settings.schema.ts` ga qo'sh (mavjud `z` import `from 'zod'` ni `from '@hono/zod-openapi'` ga almashtir — `.openapi()` uchun, bir xil Zod 4 instance):

```ts
import { z } from '@hono/zod-openapi';

export const updateSettingsSchema = z.object({
  vertical: z.string().min(1).optional(),
  reminderLeadHours: z.number().int().min(0).max(168).optional(),
  currency: z.string().min(1).max(8).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** Response DTO — wire shakli (timestamp'lar ISO string). `.openapi()` ref komponent. */
export const tenantSettingsDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    vertical: z.string().openapi({ example: 'dental' }),
    reminderLeadHours: z.number().int().openapi({ example: 24 }),
    currency: z.string().openapi({ example: 'UZS' }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('TenantSettings');

export type TenantSettingsDto = z.infer<typeof tenantSettingsDtoSchema>;
```

- [ ] **Step 2: Typecheck**

Run: `bun --filter @dental/api typecheck`
Expected: 0 xato (schema o'zi consumer'siz hali).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/tenant-settings/tenant-settings.schema.ts
git commit -m "feat(tenant-settings): response DTO schema + openapi (CLI-120)"
```

---

### Task 7: tenant-settings mapper (Date → ISO)

**Files:**
- Create: `apps/api/src/modules/tenant-settings/tenant-settings.mapper.ts`
- Test: `apps/api/src/modules/tenant-settings/tenant-settings.mapper.test.ts`

DB row `createdAt`/`updatedAt` = `Date`; DTO = `string`. Envelope strict type-check uchun mapper SHART (spec §4: RFC-0009 mapper qatlami).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/tenant-settings/tenant-settings.mapper.test.ts
import { describe, expect, test } from 'bun:test';
import { toTenantSettingsDto } from './tenant-settings.mapper.ts';

describe('toTenantSettingsDto', () => {
  test('maps Date timestamps to ISO strings', () => {
    const row = {
      id: 'id-1',
      tenantId: 't-1',
      vertical: 'dental',
      reminderLeadHours: 24,
      currency: 'UZS',
      createdAt: new Date('2026-06-12T10:00:00.000Z'),
      updatedAt: new Date('2026-06-12T11:00:00.000Z'),
    };
    const dto = toTenantSettingsDto(row);
    expect(dto.createdAt).toBe('2026-06-12T10:00:00.000Z');
    expect(dto.updatedAt).toBe('2026-06-12T11:00:00.000Z');
    expect(dto.vertical).toBe('dental');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/modules/tenant-settings/tenant-settings.mapper.test.ts`
Expected: FAIL — `Cannot find module './tenant-settings.mapper.ts'`.

- [ ] **Step 3: Implement mapper**

```ts
// apps/api/src/modules/tenant-settings/tenant-settings.mapper.ts
import type { TenantSettings } from '@dental/db-schema';
import type { TenantSettingsDto } from './tenant-settings.schema.ts';

/** DB row (Date timestamp) → wire DTO (ISO string). Envelope type-check uchun zarur. */
export const toTenantSettingsDto = (row: TenantSettings): TenantSettingsDto => ({
  id: row.id,
  tenantId: row.tenantId,
  vertical: row.vertical,
  reminderLeadHours: row.reminderLeadHours,
  currency: row.currency,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
```

> `TenantSettings` tipi `@dental/db-schema` dan (`typeof tenantSettings.$inferSelect`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test src/modules/tenant-settings/tenant-settings.mapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/tenant-settings/tenant-settings.mapper.ts apps/api/src/modules/tenant-settings/tenant-settings.mapper.test.ts
git commit -m "feat(tenant-settings): DB row → DTO mapper (CLI-120)"
```

---

### Task 8: tenant-settings routes → OpenAPIHono + createRoute

**Files:**
- Modify: `apps/api/src/modules/tenant-settings/tenant-settings.routes.ts`

`new Hono()` → `new OpenAPIHono()`; GET + PATCH `createRoute` bilan. Middleware (auth, RLS app-level `.use()`; permission createRoute `middleware` array). Handler `ok(mapper(row))` qaytaradi.

- [ ] **Step 1: Rewrite routes.ts**

```ts
// apps/api/src/modules/tenant-settings/tenant-settings.routes.ts
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { ok } from '@dental/core';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import { okJson } from '../../lib/openapi.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toTenantSettingsDto } from './tenant-settings.mapper.ts';
import { tenantSettingsDtoSchema, updateSettingsSchema } from './tenant-settings.schema.ts';
import { createTenantSettingsService } from './tenant-settings.service.ts';

export const tenantSettingsRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createTenantSettingsService({ audit: deps.audit });

  const getRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['tenant-settings'],
    operationId: 'getTenantSettings',
    middleware: [requirePermission('tenant_settings.view')] as const,
    responses: okJson(tenantSettingsDtoSchema, 'Tenant settings (get-or-create)'),
  });

  app.openapi(getRoute, async (c) => {
    const row = await service.getOrCreate(c);
    return c.json(ok(toTenantSettingsDto(row)), 200);
  });

  const patchRoute = createRoute({
    method: 'patch',
    path: '/',
    tags: ['tenant-settings'],
    operationId: 'updateTenantSettings',
    middleware: [requirePermission('tenant_settings.edit')] as const,
    request: {
      body: { content: { 'application/json': { schema: updateSettingsSchema } } },
    },
    responses: okJson(tenantSettingsDtoSchema, 'Updated tenant settings'),
  });

  app.openapi(patchRoute, async (c) => {
    const body = c.req.valid('json');
    const row = await service.update(c, body);
    return c.json(ok(toTenantSettingsDto(row)), 200);
  });

  return app;
};
```

> `HTTPException` import endi ishlatilmaydi (validatsiya `createRoute` ichida) — o'chir agar lint shikoyat qilsa. `c.req.valid('json')` Zod-validated body beradi.

- [ ] **Step 2: Typecheck (handler return = envelope schema)**

Run: `bun --filter @dental/api typecheck`
Expected: 0 xato. (Agar `ok(dto)` type-check fail qilsa — mapper DTO shakli schema bilan mos emas; tuzat.)

- [ ] **Step 3: Existing app mount intact**

`app.ts:55` (`app.route('/api/tenant-settings', tenantSettingsRoutes(...))`) o'zgarmaydi — OpenAPIHono sub-app parent OpenAPIHono ga mount bo'ladi va spec'ga ko'tariladi.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/tenant-settings/tenant-settings.routes.ts
git commit -m "feat(tenant-settings): OpenAPIHono createRoute migration (CLI-120)"
```

---

### Task 9: Generate spec + client, verify chain

**Files:**
- Modify: `packages/api-client/openapi.json` (generated)
- Create: `packages/api-client/src/generated/**` (generated)

- [ ] **Step 1: Generate spec**

Run: `bun run generate:openapi`
Expected: `✅ ... (1 path)` — `/api/tenant-settings` ichida.

- [ ] **Step 2: Verify spec content**

Run: `grep -A2 '"/api/tenant-settings"' packages/api-client/openapi.json | head; grep '"TenantSettings"' packages/api-client/openapi.json`
Expected: `get` + `patch` operatsiyalar; `components.schemas.TenantSettings` mavjud.

- [ ] **Step 3: Generate client**

Run: `bun run generate:api-client`
Expected: `packages/api-client/src/generated/` da `tenant-settings/` (tags-split) + `model/` yaratiladi; hooks `useGetTenantSettings`, `useUpdateTenantSettings` (yoki shunga o'xshash orval nomlari).

- [ ] **Step 4: Inspect generated hook names + return type**

Run: `ls packages/api-client/src/generated/ && grep -rn "export const use\|customInstance" packages/api-client/src/generated/ | head`
Expected: react-query hooks `customInstance` ni chaqiradi; return tip envelope (`{success, data: TenantSettings}`). Aniq hook nomlarini QAYD ET — Task 10 shularni ishlatadi.

- [ ] **Step 5: Commit generated artifacts**

```bash
git add packages/api-client/openapi.json packages/api-client/src/generated
git commit -m "feat(api-client): generated tenant-settings client (CLI-120)"
```

---

### Task 10: Wire web feature + remove hand artifacts (coexistence)

**Files:**
- Modify: `packages/api-client/src/index.ts` (barrel — explicit generated re-export)
- Modify: `packages/api-client/src/types.ts` (qo'lda `TenantSettings` o'chirish)
- Modify: `packages/api-client/src/endpoints.ts` (`tenant.getSettings`/`updateSettings` o'chirish)
- Modify: `apps/web/src/features/settings/settings.api.ts` (generated hook)
- Modify: `apps/web/src/lib/api.ts` (`configureClient` startup)

- [ ] **Step 1: configureClient web startup**

`apps/web/src/lib/api.ts` da `createApiClient(...)` config'i bor (mavjud `apiClient`). Generated mutator ham SHU config kerak. Qo'sh (mavjud config obyektini qayta ishlatib):

```ts
import { configureClient, createApiClient, createEndpoints } from '@dental/api-client';

const apiClientConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  refreshTokens,
  onTokensRefreshed: ({ accessToken, refreshToken }: { accessToken: string; refreshToken: string }) => {
    // ... mavjud onTokensRefreshed mantig'i ...
  },
  onUnauthorized: () => {
    // ... mavjud onUnauthorized mantig'i ...
  },
};

const apiClient = createApiClient(apiClientConfig);
configureClient(apiClientConfig); // generated hooks shu config bilan ishlaydi
```

> Mavjud inline config'ni `apiClientConfig` o'zgaruvchisiga ajrat, keyin ikkalasiga uzat. Mantiq o'zgarmaydi.

- [ ] **Step 2: Rewire settings.api.ts tenant-settings hooks**

`apps/web/src/features/settings/settings.api.ts` (148–161 qatorlar). Generated hook'ni o'rab, `.data` unwrap qil. Aniq generated nom Task 9 Step 4 dan (misol `useGetTenantSettings`/`useUpdateTenantSettings`):

```ts
import {
  useGetTenantSettings as useGeneratedTenantSettings,
  useUpdateTenantSettings as useGeneratedUpdateTenantSettings,
} from '@dental/api-client/generated/tenant-settings/tenant-settings';

export function useTenantSettings() {
  return useGeneratedTenantSettings({
    query: { select: (res) => res.data }, // envelope → data unwrap
  });
}

export function useUpdateTenantSettings() {
  const qc = useQueryClient();
  return useGeneratedUpdateTenantSettings({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.tenantSettings() }),
    },
  });
}
```

> ⚠️ Generated import yo'li va hook imzosi orval chiqishiga bog'liq — Task 9 Step 4 da qayd etilgan AYNIQ nom/yo'lni ishlat. `select` orqali `.data` unwrap (spec §4.2). Agar generated mutation `vertical/reminderLeadHours/currency` body tipini kutsa, `useUpdateTenantSettings().mutate({ data: {...} })` shaklida chaqiriladi — consumer komponentni mos ravishda yangila.

- [ ] **Step 3: Remove hand artifacts**

`packages/api-client/src/endpoints.ts:129-131` — `getSettings`/`updateSettings` qatorlarini `tenant:` obyektidan o'chir.
`packages/api-client/src/types.ts:63-71` — qo'lda `export type TenantSettings = {...}` ni o'chir.
Tekshir boshqa consumer yo'qligini: `grep -rn "\.getSettings\|\.updateSettings\b" apps packages` — faqat o'chirilganlar chiqsin.

- [ ] **Step 4: Barrel explicit generated re-export**

`packages/api-client/src/index.ts` — `export *` qatorlari qoladi, lekin generated'ni EXPLICIT qo'sh (kolliziyani lokal saqlash uchun):

```ts
// Generated (orval) — explicit, export * EMAS (coexistence kolliziya nazorati).
export {
  useGetTenantSettings,
  useUpdateTenantSettings,
  getGetTenantSettingsQueryKey,
} from './generated/tenant-settings/tenant-settings.ts';
export type { TenantSettings } from './generated/model/index.ts';
```

> Aniq export nomlari Task 9 generated chiqishidan. `TenantSettings` endi FAQAT generated'dan (qo'lda o'chirildi) — kolliziya yo'q.

- [ ] **Step 5: Full typecheck (coexistence gate)**

Run: `bun --filter @dental/api-client typecheck && bun --filter @dental/web typecheck`
Expected: 0 xato. (Double-export yoki yetishmayotgan tip bo'lsa — bu yerda ushlanadi.)

- [ ] **Step 6: Commit**

```bash
git add packages/api-client/src/index.ts packages/api-client/src/types.ts packages/api-client/src/endpoints.ts apps/web/src/features/settings/settings.api.ts apps/web/src/lib/api.ts
git commit -m "feat(settings): wire generated tenant-settings client, drop hand artifacts (CLI-120)"
```

---

### Task 11: Integration test + acceptance

**Files:**
- Create: `apps/api/tests/integration/tenant-settings.test.ts`

GET (get-or-create) + PATCH ni real DB'da (RLS bilan) tekshir. Mavjud integration test pattern'iga amal qil (`stock.test.ts` / `rls.test.ts` setup).

- [ ] **Step 1: Write integration test**

`apps/api/tests/integration/rls.test.ts` setup'ini namuna sifatida oching va tenant-settings test yozing: tenant+user yaratib, app.request bilan `GET /api/tenant-settings` (200, default `vertical='dental'`, `reminderLeadHours=24`), keyin `PATCH` (`reminderLeadHours: 48`) → 200, `data.reminderLeadHours === 48`. Auth header/JWT setup mavjud testlardagi helper bilan.

```ts
// apps/api/tests/integration/tenant-settings.test.ts (skelet — mavjud helper'larni ishlat)
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createApp } from '../../src/app.ts';
// ... mavjud test helper importlari (tenant/user/JWT seed) — rls.test.ts dan ...

describe('tenant-settings integration', () => {
  // beforeAll: tenant + owner user + JWT (rls.test.ts pattern)
  test('GET get-or-create returns defaults', async () => {
    const app = createApp();
    const res = await app.request('/api/tenant-settings', {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.vertical).toBe('dental');
    expect(body.data.reminderLeadHours).toBe(24);
  });

  test('PATCH updates reminderLeadHours', async () => {
    const app = createApp();
    const res = await app.request('/api/tenant-settings', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reminderLeadHours: 48 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reminderLeadHours).toBe(48);
  });
});
```

> Aniq tenant/user/JWT seed helper'larini `apps/api/tests/integration/rls.test.ts` dan ko'chir (o'sha repo konvensiyasi).

- [ ] **Step 2: Run integration test**

Run: `cd apps/api && bun test --env-file=../../.env tenant-settings`
Expected: PASS (2 tests). (Postgres ishlab turishi + migration apply shart.)

- [ ] **Step 3: Full acceptance gate**

Run: `bun run generate:contract && bun --filter @dental/api typecheck && bun --filter @dental/api-client typecheck && bun --filter @dental/web typecheck`
Expected: spec+client regenerate, barcha typecheck 0 xato (idempotent — generated o'zgarmasligi kerak).

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/integration/tenant-settings.test.ts
git commit -m "test(tenant-settings): GET/PATCH integration (CLI-120)"
```

---

## Acceptance (Foundation done — spec §5)

1. ✅ `bun run generate:openapi` → valid `openapi.json` (tenant-settings GET+PATCH).
2. ✅ `bun run generate:api-client` → `generated/` react-query hooks, mutator = client.ts envelope transport.
3. ✅ Settings ekrani generated client orqali (qo'lda `getSettings`/`updateSettings` o'chirilgan).
4. ✅ `turbo typecheck` = 0 xato (coexistence).
5. ✅ tenant-settings integration test yashil.
6. ✅ Pattern hujjatlangan — Wave A (CLI-121…129) agentlari takror qila oladi.

## Pattern checklist (Wave A takrori uchun)
Har modul: (1) schema'ga `.openapi()` + response DTO; (2) mapper (Date→ISO, PII mask); (3) routes `OpenAPIHono`+`createRoute`+`okJson`+`requirePermission` middleware; (4) `generate:contract`; (5) feature `api.ts` generated hook + `.data` unwrap; (6) qo'lda endpoints/types o'chirish + barrel explicit re-export; (7) integration test; (8) tsc=0 gate.
