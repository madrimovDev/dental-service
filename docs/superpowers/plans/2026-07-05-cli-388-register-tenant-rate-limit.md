# CLI-388 — Register-tenant rate limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /api/auth/register-tenant` (`apps/api/src/modules/auth/auth.routes.ts:86-125`) is the only public auth route with no rate-limit middleware — `loginRoute`/`refreshRoute`/`passwordResetRequestRoute`/`passwordResetRoute` all carry `middleware: [xRateLimit] as const`, but `registerTenantRoute` has none. Each call runs a full transaction (user + tenant + branch + 8 role templates insert), making it an expensive, unauthenticated, IP-reachable endpoint with zero abuse protection. Add a dedicated `rateLimit()` middleware instance, IP-only, capped at a few attempts per hour (not per-minute like login).

**Architecture:** Reuse the existing `rateLimit()` factory (`apps/api/src/lib/rate-limit.ts`, unchanged) exactly as `activate.ts` (CLI-370) does — IP-only key, no `keyFromBody`, because `registerTenantSchema.ownerPhone` is attacker-controlled per attempt (a phone-keyed limit would let an attacker open a fresh Redis bucket on every request by varying the phone, same reasoning `activate.ts` already documents for `licenseKey`). Two new env vars (`AUTH_REGISTER_RATE_LIMIT_WINDOW_SEC`, `AUTH_REGISTER_RATE_LIMIT`) follow the existing `env-schema.ts` pattern.

**Tech Stack:** Bun, Hono/`@hono/zod-openapi`, `apps/api/src/lib/rate-limit.ts`, `bun:test` (integration, real Redis).

## Global Constraints

- Do not modify `apps/api/src/lib/rate-limit.ts` — the existing `rateLimit(opts: RateLimitOptions)` factory (name/limit/windowSeconds/optional keyFromBody) is sufficient as-is.
- No `keyFromBody` on the new limiter — IP-only, matching `activate.ts`'s `activateRateLimit` (`apps/api/src/routes/activate.ts:25-29`), not `login`'s phone-keyed pattern. This is deliberate, not an oversight: the endpoint's own body (`ownerPhone`) is the attacker's free variable.
- New env vars get their own name pair (`AUTH_REGISTER_RATE_LIMIT*`), not a reuse of `AUTH_RATE_LIMIT_WINDOW_SEC` (900s/15min) — that window is shared by login/refresh/reset because all three are the same "account-level brute force" class; register-tenant is a different class (rare, IP-level, expensive), same reasoning that gave `activate.ts` its own `ACTIVATE_RATE_LIMIT_WINDOW_SEC`.
- The 429 path must short-circuit before `service.registerTenant(body)` runs (middleware-level rejection) — verified by the test asserting no new `tenants`/`users` rows accumulate beyond the allowed attempts.

---

### Task 1: Add rate-limit to registerTenantRoute

**Files:**
- Modify: `apps/api/src/lib/env-schema.ts:90` (insert two new vars after `AUTH_RESET_RATE_LIMIT`)
- Modify: `apps/api/src/modules/auth/auth.routes.ts:82` (add `registerRateLimit` const after `resetRateLimit`)
- Modify: `apps/api/src/modules/auth/auth.routes.ts:90` (add `middleware: [registerRateLimit] as const,` to `registerTenantRoute`)
- Modify: `apps/api/src/modules/auth/auth.routes.ts:101-103` (add `429: errResp('Too many requests'),` to `responses`)
- Test: `apps/api/tests/integration/cli-388-register-tenant-rate-limit.test.ts` (new)

**Interfaces:**
- Consumes: `rateLimit(opts: RateLimitOptions): MiddlewareHandler` from `apps/api/src/lib/rate-limit.ts`, where
  ```ts
  type RateLimitOptions = {
    name: string;
    limit: number;
    windowSeconds: number;
    keyFromBody?: (body: unknown) => string | undefined;
  };
  ```
- Consumes: `env.AUTH_REGISTER_RATE_LIMIT` / `env.AUTH_REGISTER_RATE_LIMIT_WINDOW_SEC` from `apps/api/src/lib/env.ts` (re-exports `env-schema.ts`'s `parseEnv` result).
- Produces: `registerRateLimit: MiddlewareHandler` wired into `registerTenantRoute`'s `createRoute({ middleware: [registerRateLimit] as const, ... })`.

- [ ] **Step 1: Write the failing test**

  Create `apps/api/tests/integration/cli-388-register-tenant-rate-limit.test.ts`:

  ```ts
  /**
   * CLI-388 — POST /api/auth/register-tenant rate limiting (REAL Redis + DB).
   *
   * Isbotlaydi: bitta IP'dan `env.AUTH_REGISTER_RATE_LIMIT` marta muvaffaqiyatli
   * ro'yxatdan o'tishdan keyin (N+1)-chi so'rov 429 qaytaradi (loyiha xato
   * konverti `{ error: { code: 'rate_limited', message } }` + `Retry-After`
   * header) — va middleware handler'gacha yetib bormaydi (blocked so'rov
   * yangi tenant/user yaratmaydi).
   *
   * Talab: Postgres + Redis running, migration apply qilingan.
   * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-388`
   */

  import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
  import { OpenAPIHono } from '@hono/zod-openapi';
  import { sql } from 'drizzle-orm';
  import { db } from '../../src/db/client.ts';
  import { env } from '../../src/lib/env.ts';
  import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
  import { authRoutes } from '../../src/modules/auth/auth.routes.ts';

  const app = new OpenAPIHono();
  app.route('/api/auth', authRoutes({ db }));

  const registerReq = (phone: string, ip: string) =>
    app.request('/api/auth/register-tenant', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({
        tenantName: 'CLI-388 Test Clinic',
        ownerPhone: phone,
        ownerFullName: 'Rate Limit Test',
        ownerPassword: 'CorrectHorseBattery1',
        defaultLanguage: 'uz',
      }),
    });

  const uniquePhone = (tag: string, i: number) =>
    `+99891${tag}${String(i).padStart(3, '0')}`;

  beforeAll(async () => {
    await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
    await closeRateLimitRedis();
  });

  describe('CLI-388 — register-tenant rate limiting', () => {
    test(`limit (${env.AUTH_REGISTER_RATE_LIMIT}) oshganda 429 + xato konverti`, async () => {
      const limit = env.AUTH_REGISTER_RATE_LIMIT;
      const ip = `10.88.0.${Math.floor(Math.random() * 250 + 1)}`;
      const tag = String(Math.floor(Math.random() * 900 + 100));

      // Limitgacha — har biri 201 (haqiqiy tenant yaratiladi, unique phone).
      for (let i = 0; i < limit; i++) {
        const res = await registerReq(uniquePhone(tag, i), ip);
        expect(res.status).toBe(201);
      }

      // Limitdan oshgani — 429 (yangi, hali ishlatilmagan telefon bilan ham).
      const blocked = await registerReq(uniquePhone(tag, limit), ip);
      expect(blocked.status).toBe(429);
      const body = (await blocked.json()) as { error?: { code: string; message: string } };
      expect(body.error?.code).toBe('rate_limited');
      expect(typeof body.error?.message).toBe('string');
      expect(blocked.headers.get('retry-after')).toBeTruthy();

      // Blocked so'rov handler'gacha yetib bormagan — DB'da bu telefon uchun user yo'q.
      // (users — platform-level, tenant_id yo'q; cli-227 ham shu jadvalni to'g'ridan
      // `db` orqali RLS'siz o'qiydi/yozadi, shuning uchun bu tekshiruv haqiqiy.)
      const found = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.phone, uniquePhone(tag, limit)),
      });
      expect(found).toBeUndefined();
    });

    test('different IP is not affected by another IP exhausting its limit', async () => {
      const otherIp = `10.88.1.${Math.floor(Math.random() * 250 + 1)}`;
      const tag = String(Math.floor(Math.random() * 900 + 100));
      const res = await registerReq(uniquePhone(`${tag}9`, 0), otherIp);
      expect(res.status).toBe(201);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd apps/api && bun test --env-file=../../.env cli-388
  ```
  Expected failure mode: the first loop's `limit`-th request already succeeds (201) but the `limit + 1`-th request also returns **201, not 429** — `registerTenantRoute` has no rate-limit middleware yet, so nothing ever blocks. Confirms the test actually exercises the missing behavior (not a setup/typo failure).

- [ ] **Step 3: Write minimal implementation**

  In `apps/api/src/lib/env-schema.ts`, insert after line 90 (`AUTH_RESET_RATE_LIMIT`):
  ```ts
    // Register-tenant rate limiting (CLI-388) — IP-only (ownerPhone attacker
    // tanlaydi, keyFromBody bo'lsa chetlab o'tiladi — activate.ts precedenti).
    // Login/refresh/reset'dan qattiqroq oyna: bu operatsiya bir nechta INSERT
    // ishga tushiradi va legitim foydalanuvchi bir soatda 5 martadan ko'p yangi
    // klinika ro'yxatdan o'tkazmaydi.
    AUTH_REGISTER_RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().default(3600), // 1 soat
    AUTH_REGISTER_RATE_LIMIT: z.coerce.number().int().positive().default(5),
  ```

  In `apps/api/src/modules/auth/auth.routes.ts`, add after the `resetRateLimit` const (line 82):
  ```ts
    const registerRateLimit = rateLimit({
      name: 'register-tenant',
      limit: env.AUTH_REGISTER_RATE_LIMIT,
      windowSeconds: env.AUTH_REGISTER_RATE_LIMIT_WINDOW_SEC,
      // ⚠️ keyFromBody YO'Q — ownerPhone tajovuzkor tomonidan erkin tanlanadi;
      // telefon bo'yicha kalitласак har urinishda yangi raqam bilan limit
      // butunlay chetlab o'tiladi (activate.ts ACTIVATE_RATE_LIMIT precedenti —
      // licenseKey ham shu sabab kalitga kiritilmagan). Faqat IP.
    });
  ```

  Then update `registerTenantRoute`'s `createRoute({...})` (lines 86-104):
  ```ts
    const registerTenantRoute = createRoute({
      method: 'post',
      path: '/register-tenant',
      tags: ['auth'],
      operationId: 'registerTenant',
      middleware: [registerRateLimit] as const,
      request: {
        body: { content: { 'application/json': { schema: registerTenantSchema } } },
      },
      responses: {
        201: {
          content: {
            'application/json': { schema: apiResponseSchema(registerTenantResponseSchema) },
          },
          description: 'Tenant registered',
        },
        400: errResp('Validation error'),
        409: errResp('Phone already registered'),
        429: errResp('Too many requests'),
      },
    });
  ```

  (Optional, cheap consistency win — not required by DoD: add commented `AUTH_REGISTER_RATE_LIMIT_WINDOW_SEC=3600` / `AUTH_REGISTER_RATE_LIMIT=5` lines to `.env.production.example` under the existing `# ===== Auth rate limiting (CLI-227) =====` block. `ACTIVATE_RATE_LIMIT*` isn't there either, so this is polish, not a gap this ticket introduces.)

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd apps/api && bun test --env-file=../../.env cli-388
  ```
  Expected: both tests green — `limit`-th request 201, `limit+1`-th request 429 with `rate_limited` code + `Retry-After` header + no DB row for the blocked phone; second test (different IP) unaffected.

  Also run the full auth suite + typecheck to confirm no regression on sibling routes:
  ```bash
  cd apps/api && bun test --env-file=../../.env cli-227
  cd /home/madrimov/Projects/dental-service && turbo typecheck --filter=@dental/api
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/lib/env-schema.ts apps/api/src/modules/auth/auth.routes.ts \
    apps/api/tests/integration/cli-388-register-tenant-rate-limit.test.ts
  git commit -m "$(cat <<'EOF'
  fix(api): rate-limit POST /auth/register-tenant (CLI-388)

  registerTenantRoute was the only public auth route with no rate-limit
  middleware, unlike login/refresh/password-reset*. Each call runs a full
  transaction (user+tenant+branch+role-templates insert), making it an
  expensive, unauthenticated, IP-reachable endpoint with no abuse protection.
  Added a dedicated IP-only limiter (5/hour) via the existing rateLimit()
  factory, same pattern as activate.ts's CLI-370 fix — IP-only rather than
  phone-keyed, since ownerPhone is attacker-controlled per attempt.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Self-review

- **Placeholders:** none — `env-schema.ts` insertion point (line 90, after `AUTH_RESET_RATE_LIMIT`), `auth.routes.ts` insertion points (line 82 for the const, lines 86-104 for the route), and the full test file are derived from the actual files read in this session, not invented paths.
- **Why IP-only, not phone-keyed like login:** called out explicitly in Global Constraints and in the code comment — `ownerPhone` is the attacker's free variable on this specific endpoint (unlike login, where the phone identifies a *victim* account the attacker doesn't control), so keying on it would let an attacker bypass the limit by varying the phone each request. This mirrors `activate.ts`'s documented reasoning for excluding `licenseKey` from its key.
- **Test proves the middleware boundary, not just the status code:** the test also asserts no `users` row exists for the blocked request's phone (via `db.query.users.findFirst`, the precedented Drizzle query API — not a raw `db.execute(sql\`SELECT...\`)` whose return shape isn't established anywhere else in this codebase) — this distinguishes "429 returned by rate-limit middleware before the handler runs" from a hypothetical alternate implementation that might call the handler and fail differently at 429. Matches the ticket's intent (prevent the expensive transaction from running at all). `users` is platform-level with no `tenant_id`/RLS, so this read is genuine (confirmed by `cli-227-rate-limit-audit.test.ts`, which reads/writes the same table directly via `db`).
- **Existing test patterns reused, not reinvented:** the test structure (unique-IP-per-test, `x-forwarded-for` header, `{ error: { code, message } }` shape assertion, `Retry-After` header check, "other IP unaffected" second test) is copied from `cli-370-activate-rate-limit.test.ts` and `cli-227-rate-limit-audit.test.ts`, both of which exercise the same `rateLimit()` factory this ticket reuses.
- **Scope check:** no changes to `rate-limit.ts` itself, no changes to `registerTenantSchema`/`registerTenantResponseSchema`, no changes to other routes — single middleware wire-up + two env vars + one test file, matching the ticket's narrow DoD.
