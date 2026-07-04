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
