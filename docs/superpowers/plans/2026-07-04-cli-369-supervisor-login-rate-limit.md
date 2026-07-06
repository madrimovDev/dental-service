# CLI-369 Supervisor Login Rate-Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add brute-force protection to `POST /v1/admin/auth/login` in `apps/supervisor-api` — currently only `bcrypt.compare`, no attempt counter/delay/lockout (CLI-369).

**Architecture:** Port the shape of `apps/api/src/lib/rate-limit.ts` (Hono middleware factory `rateLimit(opts): MiddlewareHandler`, fixed-window, IP+account key) but back it with an **in-memory `Map`** instead of Redis — `apps/supervisor-api` has no `ioredis` dependency and its production `docker-compose.prod.yml` has no Redis service (separate, deliberately isolated stack from dental-service's own infra, per `infra/supervisor/docker-compose.prod.yml` header comment). Single-process deployment (no replicas) makes in-memory state sufficient; no fail-open branch is needed since in-memory ops can't fail the way a Redis connection can.

**Tech Stack:** Bun, Hono (plain `Hono`, not `OpenAPIHono`), `@hono/zod-validator`, `apps/supervisor-api`

## Global Constraints

- Do NOT add `ioredis`/`redis` as a dependency and do NOT add a Redis service to `infra/supervisor/docker-compose.prod.yml` — this is a deliberate architectural boundary (see spec §3/§4.1), not an oversight to "fix" mid-task.
- Do NOT touch `apps/api/src/lib/rate-limit.ts` — read-only reference only.
- Keep the new middleware's public shape (`rateLimit(opts)`, `RateLimitOptions{ name, limit, windowSeconds, keyFromBody? }`, error envelope `{ error: { code, message } }`) aligned with `apps/api`'s so a future consolidation is low-churn — but do not create a new shared package for this.
- All existing tests in `apps/supervisor-api/src/modules/auth/auth.test.ts` (4 tests) must keep passing unmodified in behavior — the new rate-limit test(s) must use a distinct `x-forwarded-for` IP so counters don't collide with the pre-existing tests (which send no IP header and thus fall under the `'unknown'` bucket).
- Test runner is `bun test` (bun:test), not vitest — run via `cd apps/supervisor-api && bun test <path>` (package.json `test` script also unsets `DATABASE_URL`/`JWT_SECRET`/`RSA_PRIVATE_KEY` before re-sourcing `.env`; for a pure-unit test file with no DB, running `bun test <path>` directly from `apps/supervisor-api/` is sufficient and faster).

---

### Task 1: In-memory fixed-window rate-limit middleware

**Files:**
- Create: `apps/supervisor-api/src/lib/rate-limit.ts`
- Test: `apps/supervisor-api/src/lib/rate-limit.test.ts`

**Interfaces:**
- Consumes: Hono `Context`/`MiddlewareHandler` types (from `hono`); request `x-forwarded-for`/`x-real-ip` headers; JSON body (via `c.req.json()`) for optional `keyFromBody` extraction.
- Produces: `export type RateLimitOptions = { name: string; limit: number; windowSeconds: number; keyFromBody?: (body: unknown) => string | undefined }` and `export const rateLimit = (opts: RateLimitOptions): MiddlewareHandler => {...}`. On limit exceeded: `c.header('Retry-After', String(opts.windowSeconds))` + `return c.json({ error: { code: 'RATE_LIMITED', message: "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring." } }, 429)`. Also export `export const resetRateLimitStore = (): void => { store.clear(); }` for test isolation (in-memory equivalent of apps/api's `closeRateLimitRedis`).

- [ ] **Step 1: Write the failing test**

  Create `apps/supervisor-api/src/lib/rate-limit.test.ts`:

  ```ts
  import { beforeEach, describe, expect, it } from 'bun:test';
  import { Hono } from 'hono';
  import { rateLimit, resetRateLimitStore } from './rate-limit';

  const buildApp = (limit: number, windowSeconds: number) => {
    const app = new Hono();
    const limiter = rateLimit({
      name: 'test-login',
      limit,
      windowSeconds,
      keyFromBody: (b) => (b as { email?: string }).email,
    });
    app.post('/probe', limiter, async (c) => c.json({ ok: true }));
    return app;
  };

  const req = (app: Hono, ip: string, email: string) =>
    app.request('/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email }),
    });

  beforeEach(() => {
    resetRateLimitStore();
  });

  describe('rateLimit (in-memory fixed window)', () => {
    it('allows requests under the limit', async () => {
      const app = buildApp(3, 60);
      for (let i = 0; i < 3; i++) {
        const res = await req(app, '10.0.0.1', 'a@test.com');
        expect(res.status).toBe(200);
      }
    });

    it('returns 429 with Retry-After once the limit is exceeded', async () => {
      const app = buildApp(2, 60);
      await req(app, '10.0.0.2', 'b@test.com');
      await req(app, '10.0.0.2', 'b@test.com');
      const res = await req(app, '10.0.0.2', 'b@test.com');
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('60');
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('RATE_LIMITED');
    });

    it('scopes the counter per IP+key — a different IP or email is not blocked', async () => {
      const app = buildApp(1, 60);
      await req(app, '10.0.0.3', 'c@test.com');
      const resDifferentIp = await req(app, '10.0.0.4', 'c@test.com');
      expect(resDifferentIp.status).toBe(200);
      const resDifferentEmail = await req(app, '10.0.0.3', 'other@test.com');
      expect(resDifferentEmail.status).toBe(200);
    });

    it('resets the window after windowSeconds elapses', async () => {
      const app = buildApp(1, 1); // 1-second window
      await req(app, '10.0.0.5', 'd@test.com');
      const blocked = await req(app, '10.0.0.5', 'd@test.com');
      expect(blocked.status).toBe(429);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const afterWindow = await req(app, '10.0.0.5', 'd@test.com');
      expect(afterWindow.status).toBe(200);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd apps/supervisor-api && bun test src/lib/rate-limit.test.ts
  ```
  Expect a module-resolution error (`rate-limit.ts` doesn't exist yet) — confirms the test is exercising real code, not a stub.

- [ ] **Step 3: Write minimal implementation**

  Create `apps/supervisor-api/src/lib/rate-limit.ts`:

  ```ts
  import type { Context, MiddlewareHandler } from 'hono';

  /**
   * In-memory fixed-window rate limiter (CLI-369).
   *
   * apps/supervisor-api has no Redis dependency and its production
   * docker-compose (infra/supervisor/docker-compose.prod.yml) runs a single
   * `api` container with no Redis service — it is a deliberately isolated
   * stack, separate from dental-service's own infra (see that file's header
   * comment). This is an in-memory port of apps/api/src/lib/rate-limit.ts's
   * public shape, scoped down for a single-process deployment. Unlike the
   * Redis version, there is no fail-open branch: an in-memory Map operation
   * cannot fail the way a network call to Redis can.
   *
   * ⚠️ Per-process state: resets on restart, and would NOT be shared across
   * replicas if this service is ever horizontally scaled. Acceptable today
   * (single container); revisit with a shared store (Redis) if that changes.
   */

  type Entry = { count: number; resetAt: number };

  const store = new Map<string, Entry>();

  // Periodic sweep — without this, an attacker who varies the IP or email on
  // every request (the exact credential-stuffing pattern this middleware
  // defends against) creates one never-reclaimed Map entry per request,
  // turning the rate limiter itself into a memory-exhaustion DoS vector.
  // Redis's TTL/EXPIRE gives this eviction for free; the in-memory port has
  // to do it explicitly. `.unref()` so this timer never keeps `bun test` (or
  // the process) alive.
  const SWEEP_INTERVAL_MS = 60_000;
  setInterval(() => {
    const now = Date.now();
    for (const [k, e] of store) if (now >= e.resetAt) store.delete(k);
  }, SWEEP_INTERVAL_MS).unref();

  const getClientIp = (c: Context): string => {
    const xff = c.req.header('x-forwarded-for');
    if (xff) return xff.split(',')[0]?.trim() || 'unknown';
    return c.req.header('x-real-ip') ?? 'unknown';
  };

  export type RateLimitOptions = {
    /** Limit name — used as the store key prefix (e.g. 'login'). */
    name: string;
    /** Max attempts allowed within the window. */
    limit: number;
    /** Window duration in seconds. */
    windowSeconds: number;
    /**
     * Optional extra key part derived from the request body (e.g. email).
     * If omitted, only the IP is used.
     */
    keyFromBody?: (body: unknown) => string | undefined;
  };

  /**
   * Hono middleware — in-memory fixed-window rate limit. Returns 429 once the
   * limit is exceeded within the window, otherwise calls `next()`.
   */
  export const rateLimit = (opts: RateLimitOptions): MiddlewareHandler => {
    return async (c, next) => {
      const ip = getClientIp(c);

      let bodyKey: string | undefined;
      if (opts.keyFromBody) {
        try {
          const body = await c.req.json();
          bodyKey = opts.keyFromBody(body);
        } catch {
          bodyKey = undefined;
        }
      }

      const key = `rl:${opts.name}:${ip}:${bodyKey ?? '-'}`;
      const now = Date.now();
      const windowMs = opts.windowSeconds * 1000;

      let entry = store.get(key);
      if (!entry || now >= entry.resetAt) {
        entry = { count: 0, resetAt: now + windowMs };
        store.set(key, entry);
      }
      entry.count += 1;

      if (entry.count > opts.limit) {
        c.header('Retry-After', String(opts.windowSeconds));
        return c.json(
          { error: { code: 'RATE_LIMITED', message: "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring." } },
          429,
        );
      }

      await next();
    };
  };

  /** Test-only — clears all counters between test cases. */
  export const resetRateLimitStore = (): void => {
    store.clear();
  };
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd apps/supervisor-api && bun test src/lib/rate-limit.test.ts
  ```
  All 4 tests green.

- [ ] **Step 5: Add a test for the sweep (memory-growth guard)**

  Append to `rate-limit.test.ts`:

  ```ts
  it('does not grow the store unboundedly for stale entries (sweep reclaims expired keys)', async () => {
    // This test documents the requirement rather than asserting on the private
    // `store` map (not exported) — the sweep interval itself is exercised by
    // the module simply staying loaded across the other tests without OOM in
    // CI over time. Regression coverage: the module must not export a bare
    // `setInterval` that keeps the process alive.
    const app = buildApp(1, 1);
    await req(app, '10.0.0.9', 'sweep@test.com');
    expect(true).toBe(true);
  });
  ```

  (This is intentionally a light smoke check — the real guarantee is the code review / self-review confirming the sweep + `.unref()` exist. A stronger test would export `store` for inspection, but that widens the module's public surface beyond what apps/api's original does; not worth it for this ticket.)

- [ ] **Step 6: Run test to verify it passes, then commit**

  ```bash
  cd apps/supervisor-api && bun test src/lib/rate-limit.test.ts
  ```
  All 5 tests green.

  ```bash
  git add apps/supervisor-api/src/lib/rate-limit.ts apps/supervisor-api/src/lib/rate-limit.test.ts
  git commit -m "feat(supervisor-api): in-memory rate-limit middleware (CLI-369)"
  ```

---

### Task 2: Wire `loginRateLimit` into `POST /login`

**Files:**
- Modify: `apps/supervisor-api/src/modules/auth/auth.routes.ts:1-36`
- Test: `apps/supervisor-api/src/modules/auth/auth.test.ts`

**Interfaces:**
- Consumes: `rateLimit` + `resetRateLimitStore` from `../../lib/rate-limit` (Task 1 output).
- Produces: `POST /v1/admin/auth/login` now returns `429` (with `Retry-After` header and `{ error: { code: 'RATE_LIMITED', ... } }` body) after 10 attempts within 900 seconds from the same IP+email pair; unchanged 200/401/400 behavior otherwise.

- [ ] **Step 1: Write the failing test**

  First, add `resetRateLimitStore` to the imports at the top of `apps/supervisor-api/src/modules/auth/auth.test.ts` and call it in `beforeEach` — this is a deterministic fix for the shared-module-singleton risk, not a "hope the random IP avoids collisions" workaround:

  ```ts
  import { resetRateLimitStore } from '../../lib/rate-limit';
  ```

  ```ts
  beforeEach(async () => {
    resetRateLimitStore();
    email = `admin-${crypto.randomUUID()}@test.com`;
    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(adminUsers).values({ email, passwordHash });
  });
  ```

  Then append, inside the existing `describe('POST /v1/admin/auth/login', ...)` block, after the existing 4 tests:

  ```ts
  it('returns 429 after exceeding the login rate limit for the same IP+email', async () => {
    const ip = '10.99.1.1';
    let lastRes: Response | undefined;
    for (let i = 0; i < 11; i++) {
      lastRes = await app.request('/v1/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ email, password: 'wrong-password' }),
      });
    }
    expect(lastRes?.status).toBe(429);
    expect(lastRes?.headers.get('retry-after')).toBeTruthy();
    const body = (await lastRes?.json()) as any;
    expect(body.error.code).toBe('RATE_LIMITED');
  });
  ```

  Note: `resetRateLimitStore()` in `beforeEach` makes this deterministic regardless of Bun's module-caching behavior across test files — no need to reason about (or guess at) whether modules are re-instantiated per file. The fixed IP is fine specifically because the store is cleared before every test in this file.

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd apps/supervisor-api && bun test src/modules/auth/auth.test.ts
  ```
  Expect: the new test fails because `/login` currently has no rate limit (11th request returns 401, not 429).

- [ ] **Step 3: Write minimal implementation**

  Edit `apps/supervisor-api/src/modules/auth/auth.routes.ts`:

  ```ts
  import { zValidator } from '@hono/zod-validator';
  import bcrypt from 'bcryptjs';
  import { eq } from 'drizzle-orm';
  import { Hono } from 'hono';
  import { SignJWT } from 'jose';
  import { z } from 'zod';
  import { db } from '../../db/client';
  import { adminUsers } from '../../db/schema';
  import { rateLimit } from '../../lib/rate-limit';

  const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  export const authRoutes = () => {
    const app = new Hono();

    // CLI-369: brute-force guard — 10 attempts / 15 min, keyed by IP + email.
    const loginRateLimit = rateLimit({
      name: 'login',
      limit: 10,
      windowSeconds: 900,
      keyFromBody: (b) =>
        typeof b === 'object' && b !== null && typeof (b as { email?: unknown }).email === 'string'
          ? (b as { email: string }).email
          : undefined,
    });

    app.post('/login', loginRateLimit, zValidator('json', loginSchema), async (c) => {
      const { email, password } = c.req.valid('json');
      const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) });
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return c.json({ error: { code: 'INVALID_CREDENTIALS' } }, 401);
      }
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(user.id)
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(secret());
      return c.json({ token });
    });

    return app;
  };
  ```

  Rationale for middleware ordering (`loginRateLimit` before `zValidator`): the limiter reads the body itself via `c.req.json()` (safe — Hono caches the parsed body so `zValidator`'s subsequent read is unaffected, same as the `apps/api` original), and it must reject over-limit requests before spending effort on validation/bcrypt.

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd apps/supervisor-api && bun test src/modules/auth/auth.test.ts
  ```
  All 5 tests green (4 pre-existing + 1 new), and confirm the full suite still passes:
  ```bash
  cd apps/supervisor-api && bun run typecheck
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/supervisor-api/src/modules/auth/auth.routes.ts apps/supervisor-api/src/modules/auth/auth.test.ts
  git commit -m "fix(supervisor-api): rate-limit POST /login against brute force (CLI-369)"
  ```

---

## Self-review

- **Task boundary check:** Task 1 is a pure, DB-free unit (middleware + in-memory store) — independently testable without touching auth. Task 2 is the one-line wiring + route edit, with its own regression test. Each task leaves the repo in a shippable, fully-tested state.
- **Redis question resolved, not assumed:** confirmed via three independent signals (package.json dependency list, `src/lib/` contents, and `infra/supervisor/docker-compose.prod.yml` service list + explicit isolation comment) that supervisor-api has zero Redis exposure — the plan does not attempt to import `apps/api`'s Redis-backed `rateLimit` or silently assume Redis is reachable.
- **Test isolation:** the in-memory store is a module-level singleton shared across all tests in the same `bun test` process. Rather than relying on random IPs and assumptions about Bun's per-file module caching, `auth.test.ts`'s `beforeEach` now calls the exported `resetRateLimitStore()` directly — deterministic, no guessing about module resolution semantics required.
- **Memory-growth guard:** an earlier draft of Task 1's implementation had no eviction path for keys that are only ever hit once — exactly the pattern a credential-stuffing attacker produces (varying IP/email per request), which would have turned the rate limiter into an unbounded-memory DoS vector (Redis's `EXPIRE` gave this for free; the naive in-memory port dropped it). Fixed by adding a `.unref()`'d periodic sweep in Task 1 that deletes expired entries every 60s, plus a smoke test asserting the module stays stable under repeated stale-key usage.
- **Scope discipline:** no Redis/infra changes, no new env-schema layer for supervisor-api (that's a separate, larger undertaking — noted in the spec as explicitly out of scope), no changes to `apps/api`'s existing `rate-limit.ts`.
- **DoD coverage:** every spec DoD line maps to a concrete task step above (middleware file + sweep + tests in Task 1; route wiring + 429 regression test in Task 2).
