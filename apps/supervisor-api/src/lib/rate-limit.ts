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
        {
          error: {
            code: 'RATE_LIMITED',
            message: "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring.",
          },
        },
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
