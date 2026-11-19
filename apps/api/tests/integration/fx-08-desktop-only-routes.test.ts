/**
 * FX-08 (LA-45) — `/api/activate` va `/api/reset-owner-password` faqat Local
 * Desktop rejimida (`DENTAL_LOCAL_DESKTOP === 'true'`) ulanadi. Bulutda 404:
 * himoya fayl ruxsatlariga emas, rejim tekshiruviga tayanadi.
 *
 * Haqiqiy `createApp()` (real middleware zanjiri, real Redis rate-limit).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-08-desktop-only-routes.test.ts`
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../src/app.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';

const prevFlag = process.env.DENTAL_LOCAL_DESKTOP;
let ipSeq = 0;
const post = (app: ReturnType<typeof createApp>, path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-real-ip': `10.208.${Math.floor(Math.random() * 200)}.${++ipSeq}`,
    },
    body: JSON.stringify(body),
  });

const restore = () => {
  if (prevFlag === undefined) delete process.env.DENTAL_LOCAL_DESKTOP;
  else process.env.DENTAL_LOCAL_DESKTOP = prevFlag;
};

describe('FX-08 — desktop-only route mount', () => {
  beforeEach(restore);
  afterEach(restore);
  afterAll(async () => {
    restore();
    await closeRateLimitRedis();
  });

  for (const flag of [undefined, 'false'] as const) {
    test(`bulut rejimi (DENTAL_LOCAL_DESKTOP=${flag ?? 'unset'}) — activate va reset-owner-password 404`, async () => {
      if (flag === undefined) delete process.env.DENTAL_LOCAL_DESKTOP;
      else process.env.DENTAL_LOCAL_DESKTOP = flag;
      const app = createApp();

      const a = await post(app, '/api/activate', { licenseKey: 'AAAAA-BBBBB-CCCCC-DDDDD' });
      expect(a.status).toBe(404);

      const r = await post(app, '/api/reset-owner-password', {
        token: 'AAAAA-BBBBB-CCCCC',
        newPassword: 'Str0ngPassw0rd!',
      });
      expect(r.status).toBe(404);
    });
  }

  test('desktop rejimi (DENTAL_LOCAL_DESKTOP=true) — route lar ulangan (404 emas)', async () => {
    process.env.DENTAL_LOCAL_DESKTOP = 'true';
    const app = createApp();

    // Yaroqsiz body — handler'ga yetib validatsiya (400/422) qaytaradi, 404 emas.
    const a = await post(app, '/api/activate', {});
    expect(a.status).not.toBe(404);

    const r = await post(app, '/api/reset-owner-password', {});
    expect(r.status).not.toBe(404);
  });
});
