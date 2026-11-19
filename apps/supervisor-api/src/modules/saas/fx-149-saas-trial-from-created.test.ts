import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../../app';
import { SAAS_TRIAL_DAYS } from './saas.routes';

/**
 * FX-149 (LC-27): Supervisor SaaS klinikani bilmasa (404) apps/api qayta ro'yxatga
 * oladi — avval har safar YANGI 30 kunlik sinov berilardi (muddati o'tgan klinika
 * bepul qayta ochilardi). Endi so'rovda tenant `tenantCreatedAt` yuboriladi va sinov
 * muddati shundan hisoblanadi (kelajakdagi sana — hozirgi paytga qisiladi).
 * Maydon yo'q bo'lsa — eski xulq (hozirdan). Real Supervisor DB.
 */
const SAAS_TOKEN = 'fx149-saas-test-token-0123456789-abcdefghijk';
const DAY = 86_400_000;
const app = createApp();
const prev = process.env.SUPERVISOR_SAAS_TOKEN;
beforeAll(() => {
  process.env.SUPERVISOR_SAAS_TOKEN = SAAS_TOKEN;
});
afterAll(() => {
  if (prev === undefined) delete process.env.SUPERVISOR_SAAS_TOKEN;
  else process.env.SUPERVISOR_SAAS_TOKEN = prev;
});

const register = async (tenantId: string, tenantCreatedAt?: string) => {
  const res = await app.request('/internal/saas/clinics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SAAS_TOKEN}` },
    body: JSON.stringify({
      tenantId,
      name: 'FX149 SaaS',
      ownerFullName: 'Sardor Aliyev',
      ownerPhone: '901114999',
      ...(tenantCreatedAt ? { tenantCreatedAt } : {}),
    }),
  });
  return {
    status: res.status,
    body: (await res.json()) as { subscriptionExpiresAt: string | null },
  };
};

const expiryMs = (b: { subscriptionExpiresAt: string | null }) =>
  new Date(b.subscriptionExpiresAt as string).getTime();

describe('FX-149 — SaaS sinov muddati tenant yaratilgan sanadan', () => {
  it('40 kun oldin yaratilgan tenant qayta ro‘yxatda — sinov allaqachon tugagan (yangi 30 kun EMAS)', async () => {
    const createdAt = new Date(Date.now() - 40 * DAY);
    const r = await register(crypto.randomUUID(), createdAt.toISOString());
    expect(r.status).toBe(201);
    expect(expiryMs(r.body)).toBe(createdAt.getTime() + SAAS_TRIAL_DAYS * DAY);
    expect(expiryMs(r.body)).toBeLessThan(Date.now());
  });

  it('kelajakdagi tenantCreatedAt hozirgi paytga qisiladi (sinov uzaytirilmaydi)', async () => {
    const before = Date.now();
    const r = await register(crypto.randomUUID(), new Date(Date.now() + 100 * DAY).toISOString());
    expect(r.status).toBe(201);
    expect(expiryMs(r.body)).toBeGreaterThanOrEqual(before + SAAS_TRIAL_DAYS * DAY);
    expect(expiryMs(r.body)).toBeLessThanOrEqual(Date.now() + SAAS_TRIAL_DAYS * DAY);
  });

  it('maydon yo‘q — eski xulq (hozirdan 30 kun); yaroqsiz sana — 400', async () => {
    const before = Date.now();
    const r = await register(crypto.randomUUID());
    expect(r.status).toBe(201);
    expect(expiryMs(r.body)).toBeGreaterThanOrEqual(before + SAAS_TRIAL_DAYS * DAY);

    const bad = await register(crypto.randomUUID(), 'not-a-date');
    expect(bad.status).toBe(400);
  });

  it('mavjud klinika: qayta chaqiruv muddatni o‘zgartirmaydi (idempotent)', async () => {
    const tenantId = crypto.randomUUID();
    const first = await register(tenantId, new Date(Date.now() - 5 * DAY).toISOString());
    const again = await register(tenantId, new Date(Date.now() - 1 * DAY).toISOString());
    expect(again.status).toBe(200);
    expect(again.body.subscriptionExpiresAt).toBe(first.body.subscriptionExpiresAt);
  });
});
