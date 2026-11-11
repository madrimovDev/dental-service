import { afterAll, describe, expect, test } from 'bun:test';
import { closeRateLimitRedis } from '../lib/rate-limit.ts';
import { licenseStatusRoutes } from './license-status.ts';

const graceState = {
  state: 'grace' as const,
  expiresAt: '2026-01-01T00:00:00.000Z',
  graceEndsAt: '2026-01-08T00:00:00.000Z',
  daysLeft: 5,
};

afterAll(async () => {
  await closeRateLimitRedis();
});

describe('GET /api/license/status', () => {
  test('desktop: state DTO + mode desktop', async () => {
    const app = licenseStatusRoutes({
      isDesktop: () => true,
      getLicenseState: async () => graceState,
    });
    const res = await app.request('/status');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { ...graceState, mode: 'desktop' } });
  });

  test('cloud: none + mode cloud, state not read', async () => {
    const app = licenseStatusRoutes({
      isDesktop: () => false,
      getLicenseState: async () => {
        throw new Error('must not be called');
      },
    });
    const res = await app.request('/status');
    expect(await res.json()).toEqual({
      success: true,
      data: { state: 'none', expiresAt: null, graceEndsAt: null, daysLeft: null, mode: 'cloud' },
    });
  });
});

describe('POST /api/license/recheck', () => {
  test('runs heartbeat then returns refreshed state', async () => {
    let healed = false;
    const app = licenseStatusRoutes({
      isDesktop: () => true,
      runHeartbeat: async () => {
        healed = true;
      },
      getLicenseState: async () =>
        healed ? { ...graceState, state: 'active', daysLeft: 300 } : graceState,
    });
    const res = await app.request('/recheck', {
      method: 'POST',
      headers: { 'x-forwarded-for': `10.77.${Math.floor(Math.random() * 250)}.1` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { state: string; daysLeft: number } };
    expect(healed).toBe(true);
    expect(body.data.state).toBe('active');
    expect(body.data.daysLeft).toBe(300);
  });

  test('cloud mode: 404 and heartbeat not run', async () => {
    let ran = false;
    const app = licenseStatusRoutes({
      isDesktop: () => false,
      runHeartbeat: async () => {
        ran = true;
      },
    });
    const res = await app.request('/recheck', {
      method: 'POST',
      headers: { 'x-forwarded-for': `10.78.${Math.floor(Math.random() * 250)}.1` },
    });
    expect(res.status).toBe(404);
    expect(ran).toBe(false);
  });

  test('7th request from one IP is 429 (real Redis)', async () => {
    const app = licenseStatusRoutes({
      isDesktop: () => true,
      runHeartbeat: async () => {},
      getLicenseState: async () => graceState,
    });
    const ip = `10.79.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    const hit = () =>
      app.request('/recheck', { method: 'POST', headers: { 'x-forwarded-for': ip } });
    for (let i = 0; i < 6; i++) expect((await hit()).status).toBe(200);
    expect((await hit()).status).toBe(429);
  });
});
