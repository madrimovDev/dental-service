# CLI-370 — Activate rate-limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect `POST /api/activate` from license-key guessing/enumeration and cheap DoS-via-Supervisor-calls by reusing the existing Redis fixed-window rate limiter (`apps/api/src/lib/rate-limit.ts`, CLI-227) — the exact same pattern already applied to `login`/`refresh`/`reset` in `apps/api/src/modules/auth/auth.routes.ts:59-82`.

**Architecture:** `apps/api/src/routes/activate.ts` is a plain `Hono` router (not `OpenAPIHono`), so the middleware is wired via the ordinary `app.post(path, middleware, handler)` chain — not the `createRoute({ middleware: [...] })` pattern used in the (OpenAPI) auth module. No new infrastructure: `rate-limit.ts` already depends on the `ioredis` singleton that this same app (`apps/api`) already runs in production. Config is env-driven (`apps/api/src/lib/env-schema.ts`), matching the `AUTH_*` precedent, with new `ACTIVATE_RATE_LIMIT` / `ACTIVATE_RATE_LIMIT_WINDOW_SEC` vars. Key is **IP-only** (no `keyFromBody`) — unlike login's IP+phone key, the thing being guessed here (`licenseKey`) is the secret itself, so keying on it would let an attacker cycle through unlimited distinct keys without ever tripping the limit.

**Tech Stack:** Bun, Hono, apps/api/src/lib/rate-limit.ts

## Global Constraints

- Do not modify `apps/api/src/lib/rate-limit.ts` — its `RateLimitOptions`/`rateLimit()` signature is reused as-is.
- Do not add `keyFromBody` to the new rate limiter — IP-only is the deliberate choice for this threat model (see spec `2026-07-04-cli-370-activate-rate-limit-design.md` §3).
- Do not touch `apps/api/src/routes/activate.test.ts`'s existing 4 tests — they call the route with no `x-forwarded-for` header (falls to `'unknown'` IP) and make ≤4 sequential calls per test run, which stays under the new default limit of 5; no changes needed there.
- New test must use a real Redis connection (same requirement as `apps/api/tests/integration/cli-227-rate-limit-audit.test.ts`: "Talab: Postgres + Redis running") and must call `closeRateLimitRedis()` in `afterAll` so the test process exits cleanly.

---

### Task 1: Add rate-limit to POST /api/activate

**Files:**
- Modify: `apps/api/src/lib/env-schema.ts:90` (add two new fields right after the existing `AUTH_RESET_RATE_LIMIT` line, inside the same `z.object({...})` block)
- Modify: `apps/api/src/routes/activate.ts` (add imports at the top; add a `rateLimit(...)` instance + wire it into `app.post('/', ...)`)
- Test: `apps/api/tests/integration/cli-370-activate-rate-limit.test.ts` (new file)

**Interfaces:**
- Consumes: `rateLimit(opts: RateLimitOptions): MiddlewareHandler` from `apps/api/src/lib/rate-limit.ts`, where `RateLimitOptions = { name: string; limit: number; windowSeconds: number; keyFromBody?: (body: unknown) => string | undefined }`. Call: `rateLimit({ name: 'activate', limit: env.ACTIVATE_RATE_LIMIT, windowSeconds: env.ACTIVATE_RATE_LIMIT_WINDOW_SEC })` (no `keyFromBody`).
- Produces: on limit exceeded, `429` with body `{ error: { code: 'rate_limited', message: string } }` and a `Retry-After` header (unchanged behavior of `rate-limit.ts`, already covers this — no new response-shape code needed).

- [ ] **Step 1: Write the failing test**

  Create `apps/api/tests/integration/cli-370-activate-rate-limit.test.ts`:

  ```ts
  /**
   * CLI-370 — POST /api/activate rate limiting (REAL Redis).
   *
   * Isbotlaydi: bitta IP'dan `env.ACTIVATE_RATE_LIMIT` marta urinishdan keyin
   * (N+1)-chi so'rov 429 qaytaradi (loyiha xato konverti
   * `{ error: { code: 'rate_limited', message } }` + `Retry-After` header).
   *
   * `activateLicense`/`writeLicense` `mock.module` bilan almashtiriladi (haqiqiy
   * Supervisor'ga so'rov yubormaslik uchun — activate.test.ts'dagi bilan bir xil
   * naqsh) — mock.module Bun'da RESOLVED PATH bo'yicha global, shuning uchun bu
   * fayl boshqa katalogda bo'lsa ham xuddi shu `../../src/lib/license-client.ts`
   * / `../../src/lib/license.ts` modullarini almashtiradi.
   *
   * Talab: Redis running (rate-limit.ts real ioredis'ga bog'liq).
   * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-370`
   */

  import { afterAll, describe, expect, mock, test } from 'bun:test';
  import { Hono } from 'hono';
  import * as realLicense from '../../src/lib/license.ts';
  import * as realLicenseClient from '../../src/lib/license-client.ts';

  mock.module('../../src/lib/license-client.ts', () => ({
    ...realLicenseClient,
    activateLicense: async () => ({
      licenseKey: 'AAAAA-BBBBB-CCCCC-DDDDD',
      clinicId: 'clinic-1',
      modules: ['patients'],
      expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
      gracePeriodDays: 30,
      issuedAt: new Date().toISOString(),
      signature: 'sig',
    }),
  }));
  mock.module('../../src/lib/license.ts', () => ({
    ...realLicense,
    writeLicense: async () => {},
  }));

  const { activateRoutes } = await import('../../src/routes/activate.ts');
  const { env } = await import('../../src/lib/env.ts');
  const { closeRateLimitRedis } = await import('../../src/lib/rate-limit.ts');

  const app = new Hono();
  app.route('/api/activate', activateRoutes());

  const activateReq = (ip: string) =>
    app.request('/api/activate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ licenseKey: 'GUESS-GUESS-GUESS-GUESS' }),
    });

  afterAll(async () => {
    await closeRateLimitRedis();
  });

  describe('CLI-370 — activate rate limiting', () => {
    test(`limit (${env.ACTIVATE_RATE_LIMIT}) oshganda 429 + xato konverti`, async () => {
      const limit = env.ACTIVATE_RATE_LIMIT;
      const ip = `10.230.0.${Math.floor(Math.random() * 250 + 1)}`;

      for (let i = 0; i < limit; i++) {
        const res = await activateReq(ip);
        expect(res.status).not.toBe(429);
      }

      const blocked = await activateReq(ip);
      expect(blocked.status).toBe(429);
      const body = (await blocked.json()) as { error?: { code: string; message: string } };
      expect(body.error?.code).toBe('rate_limited');
      expect(typeof body.error?.message).toBe('string');
      expect(blocked.headers.get('retry-after')).toBeTruthy();
    });

    test('different IP is not affected by another IP exhausting its limit', async () => {
      const otherIp = `10.230.1.${Math.floor(Math.random() * 250 + 1)}`;
      const res = await activateReq(otherIp);
      expect(res.status).not.toBe(429);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  `cd apps/api && bun test --env-file=../../.env cli-370` — expect the first test to fail: the (N+1)-th request currently returns `200` (mocked `activateLicense` always succeeds), not `429`, because no rate-limit middleware exists yet on this route.

- [ ] **Step 3: Write minimal implementation**

  In `apps/api/src/lib/env-schema.ts`, right after the existing block (currently ending at line 90 with `AUTH_RESET_RATE_LIMIT: z.coerce.number().int().positive().default(5),`), add:
  ```ts
    // Activate rate limiting (CLI-370) — license-key guessing/enumeration himoyasi.
    // IP-only kalit (keyFromBody yo'q) — licenseKey o'zi taxmin qilinayotgan sir;
    // kalitga kiritilsa har urinish yangi Redis bucket ochib limitni chetlab
    // o'tar edi. Login'dan qattiqroq: har urinish real Supervisor'ga tarmoq
    // so'rovi (login'dagi lokal bcrypt tekshiruvidan qimmatroq) + legitim
    // foydalanuvchi bir soatda 5 martadan ko'p faollashtirish urinmaydi.
    ACTIVATE_RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().default(3600), // 1 soat
    ACTIVATE_RATE_LIMIT: z.coerce.number().int().positive().default(5),
  ```

  In `apps/api/src/routes/activate.ts`, change the imports (add `env` and `rateLimit`):
  ```ts
  import { fail, ok } from '@dental/core';
  import { Hono } from 'hono';
  import { z } from 'zod';
  import { env } from '../lib/env.ts';
  import { writeLicense } from '../lib/license.ts';
  import { activateLicense } from '../lib/license-client.ts';
  import { rateLimit } from '../lib/rate-limit.ts';
  ```

  Then change the body of `activateRoutes` to create and wire the middleware:
  ```ts
  export const activateRoutes = () => {
    const app = new Hono();

    // ─── Rate limiting (CLI-370) — Redis fixed-window, IP-only ───────────────
    // licenseKey o'zi taxmin qilinayotgan sir (login'dagi telefon — hisob
    // identifikatori — dan farqli) — kalitga kiritilmaydi, aks holda har
    // urinishda boshqa key sinalsa yangi bucket ochilib limit chetlab o'tiladi.
    const activateRateLimit = rateLimit({
      name: 'activate',
      limit: env.ACTIVATE_RATE_LIMIT,
      windowSeconds: env.ACTIVATE_RATE_LIMIT_WINDOW_SEC,
    });

    app.post('/', activateRateLimit, async (c) => {
      const json = await c.req.json().catch(() => null);
      const parsed = activateSchema.safeParse(json);
      if (!parsed.success) {
        return c.json(fail('INVALID_REQUEST', 'licenseKey majburiy'), 400);
      }

      try {
        const data = await activateLicense(parsed.data.licenseKey);
        await writeLicense(data);
        return c.json(ok({ modules: data.modules, expiresAt: data.expiresAt }));
      } catch (err) {
        const code = err instanceof Error ? err.message : 'ACTIVATION_FAILED';
        // FINGERPRINT_UNAVAILABLE — mahalliy muhit muammosi (VM/konteyner);
        // qolgan barcha kodlar (INVALID_KEY, FINGERPRINT_MISMATCH,
        // SUPERVISOR_ERROR) — Supervisor rad etdi, mijoz xatosi.
        const status = code === 'FINGERPRINT_UNAVAILABLE' ? 500 : 403;
        return c.json(fail(code, "Litsenziyani faollashtirib bo'lmadi"), status);
      }
    });

    return app;
  };
  ```
  (Only the `app.post('/', ...)` signature and the new `activateRateLimit` const are new — the handler body itself is unchanged, just re-indented under the new middleware arg.)

- [ ] **Step 4: Run test to verify it passes**
  `cd apps/api && bun test --env-file=../../.env cli-370` — both new cases green. Then re-run `cd apps/api && bun test --env-file=../../.env src/routes/activate.test.ts` to confirm the 4 pre-existing tests are still green (they make ≤4 calls with no `x-forwarded-for`, under the default limit of 5). Also run `bun run typecheck` (repo root or `apps/api` workspace script) to confirm the new `env.ACTIVATE_RATE_LIMIT` / `env.ACTIVATE_RATE_LIMIT_WINDOW_SEC` fields type-check cleanly against the `Env` type inferred from `env-schema.ts`.

- [ ] **Step 5: Commit**
  `git add apps/api/src/lib/env-schema.ts apps/api/src/routes/activate.ts apps/api/tests/integration/cli-370-activate-rate-limit.test.ts` — message: `feat(api): rate-limit POST /activate against license-key guessing (CLI-370)`

---

## Self-review

- **Placeholders:** none — every code block above is the literal diff to apply (exact import lines, exact env-schema fields, exact route wiring, exact test file), derived from the files actually read (`apps/api/src/lib/rate-limit.ts`, `apps/api/src/modules/auth/auth.routes.ts:1-82`, `apps/api/src/routes/activate.ts`, `apps/api/src/routes/activate.test.ts`, `apps/api/src/lib/env-schema.ts:70-99`, `apps/api/tests/integration/cli-227-rate-limit-audit.test.ts`).
- **Why a new integration test file instead of extending `activate.test.ts`:** `activate.test.ts` is a pure in-memory unit test (mocks `activateLicense`/`writeLicense`, no Redis). Rate-limiting is inherently an integration concern (real `ioredis` singleton, `INCR`/`EXPIRE`, fail-open on Redis error) — the project's own precedent for this (`cli-227-rate-limit-audit.test.ts`) lives in `tests/integration/`, not co-located with the route's unit test. Following that precedent, keeps `activate.test.ts` fast/mock-only and isolates the Redis-dependent assertions in their own file, consistent with naming (`cli-NNN-*.test.ts` under `tests/integration/`).
- **Why IP-only key (no `keyFromBody`):** covered in depth in the companion spec (`docs/superpowers/specs/2026-07-04-cli-370-activate-rate-limit-design.md` §3) — keying on the guessed secret itself would let an attacker reset their own rate-limit bucket simply by trying a new key value each time, defeating the point of the limiter for an enumeration threat model.
- **Route wiring correctness double-checked:** `activate.ts` uses plain `Hono`, not `OpenAPIHono` — confirmed by reading the file (`import { Hono } from 'hono'`, `app.post('/', async (c) => {...})`, no `createRoute`/`app.openapi`). Hono's `app.post(path, ...middlewares, handler)` accepts any number of `MiddlewareHandler` before the final handler, and `rateLimit()` returns exactly that type — no adapter needed, unlike if this were an `OpenAPIHono` route (which would need the `middleware: [...] as const` array inside `createRoute`, per the `auth.routes.ts` precedent).
- **Existing 4 tests in `activate.test.ts` verified not to regress:** each `test(...)` block in that file calls `post(app, ...)` between 1 and 2 times, with a **fresh `new Hono()` app per test** but the **same underlying Redis rate-limit key** (`rl:activate:unknown:-`, since no `x-forwarded-for` header is ever sent and the route always mounts fresh) — total calls across all 4 tests in one `bun test` run is 4, strictly less than the default limit of 5, so none of them will ever observe a 429. This is called out explicitly as a Global Constraint above rather than silently assumed.
- **Env var typing:** both new fields use the identical `z.coerce.number().int().positive().default(...)` shape already used for the four `AUTH_*` rate-limit vars — no new Zod pattern introduced, `Env` type inference (wherever `Env = z.infer<typeof envSchema>` is derived) picks them up automatically with no additional wiring.
