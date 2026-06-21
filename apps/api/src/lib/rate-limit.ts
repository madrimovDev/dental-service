import { fail } from '@dental/core';
import type { Context, MiddlewareHandler } from 'hono';
import { Redis } from 'ioredis';
import { env } from './env.ts';
import { logger } from './logger.ts';

/**
 * Redis-backed fixed-window rate limiter (CLI-227).
 *
 * Auth endpoint'lari (login / refresh / password-reset*) brute-force va credential
 * stuffing'dan himoyalanadi. Kalit IP + (ixtiyoriy) telefon bo'yicha — bitta IP yoki
 * bitta hisob ustidan urinishlar alohida cheklanadi.
 *
 * Dizayn qarorlari:
 *  - **Fail-open:** Redis ishlamasa (down / xato) — request O'TADI (login mavjudligi
 *    rate-limit kafolatidan ustun). `logger.warn` bilan belgilanadi. Bu ataylab tanlov.
 *  - **Fixed window:** `INCR` + birinchi urinishda `EXPIRE`. Oddiy, atomik yetarli.
 *  - 429 → loyiha xato konverti `{ error: { code, message } }`.
 *
 * ⚠️ Bu helper auth.routes.ts'da ishlatiladi (app.ts EMAS — global middleware
 * boshqa agent ixtiyorida).
 */

// Lazy singleton — modul import paytida ulanmaslik (test/migrate env yengilroq).
let redisClient: Redis | null = null;
const getRedis = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      // Redis yo'q bo'lsa buyruq tez xato bersin (fail-open). `enableOfflineQueue`
      // DEFAULT (true) — dastlabki ulanish o'rnatilguncha buyruq navbatda kutadi,
      // shunda "Stream isn't writeable" yolg'on fail-open bo'lmaydi. Redis haqiqatan
      // o'lik bo'lsa `maxRetriesPerRequest` cheklovi tez reject qiladi.
      maxRetriesPerRequest: 2,
    });
    redisClient.on('error', (err) => {
      logger.warn({ err: err.message }, 'Rate-limit Redis xatosi (fail-open)');
    });
  }
  return redisClient;
};

const getClientIp = (c: Context): string => {
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  return c.req.header('x-real-ip') ?? 'unknown';
};

export type RateLimitOptions = {
  /** Cheklov nomi — Redis kalit prefiksi (masalan 'login'). */
  name: string;
  /** Oyna ichida ruxsat etilgan maksimal urinishlar soni. */
  limit: number;
  /** Oyna davomiyligi (soniya). */
  windowSeconds: number;
  /**
   * Request body'dan qo'shimcha kalit qismi (masalan telefon). Aniqlanmasa
   * faqat IP bo'yicha cheklanadi (refresh — body'da telefon yo'q).
   */
  keyFromBody?: (body: unknown) => string | undefined;
};

/**
 * Hono middleware — fixed-window rate limit. Limit oshganda 429 qaytaradi,
 * aks holda `next()`. Redis xato bersa fail-open (o'tkazib yuboradi).
 */
export const rateLimit = (opts: RateLimitOptions): MiddlewareHandler => {
  return async (c, next) => {
    const ip = getClientIp(c);

    let bodyKey: string | undefined;
    if (opts.keyFromBody) {
      try {
        // Hono parsed body'ni cache qiladi — keyingi zod-openapi validator ham o'qiy oladi.
        const body = await c.req.json();
        bodyKey = opts.keyFromBody(body);
      } catch {
        bodyKey = undefined; // JSON yo'q/buzuq — IP bo'yicha cheklaymiz
      }
    }

    const key = `rl:${opts.name}:${ip}:${bodyKey ?? '-'}`;

    let count: number;
    try {
      const redis = getRedis();
      count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, opts.windowSeconds);
      }
    } catch (err) {
      // Fail-open: Redis ishlamasa request o'tadi.
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), name: opts.name },
        'Rate-limit tekshiruvi o‘tkazib yuborildi (Redis fail-open)',
      );
      await next();
      return;
    }

    if (count > opts.limit) {
      const retryAfter = String(opts.windowSeconds);
      c.header('Retry-After', retryAfter);
      return c.json(
        fail('rate_limited', 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.'),
        429,
      );
    }

    await next();
  };
};

/** Test/shutdown uchun — ulanishni yopadi. */
export const closeRateLimitRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit().catch(() => {});
    redisClient = null;
  }
};
