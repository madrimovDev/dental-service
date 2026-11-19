import { afterEach, describe, expect, test } from 'bun:test';
import type { Database } from '../../db/client.ts';
import { healthRoutes } from './health.routes.ts';

// DB'siz: health faqat `SELECT 1` bajaradi — soxta `execute` yetarli.
const fakeDb = { execute: async () => [] } as unknown as Database;

const saved = {
  desktop: process.env.DENTAL_LOCAL_DESKTOP,
  serverId: process.env.DENTAL_SERVER_ID,
};

afterEach(() => {
  if (saved.desktop === undefined) delete process.env.DENTAL_LOCAL_DESKTOP;
  else process.env.DENTAL_LOCAL_DESKTOP = saved.desktop;
  if (saved.serverId === undefined) delete process.env.DENTAL_SERVER_ID;
  else process.env.DENTAL_SERVER_ID = saved.serverId;
});

// FX-145 (LC-23) — desktop klient TOFU'da server identifikatorini pinlashi
// uchun `/api/health` desktop rejimida `serverId` qaytaradi.
describe('FX-145: GET /api/health serverId', () => {
  test('desktop rejimida DENTAL_SERVER_ID javobda serverId sifatida qaytadi', async () => {
    process.env.DENTAL_LOCAL_DESKTOP = 'true';
    process.env.DENTAL_SERVER_ID = '7f1c2a9e-0000-4000-8000-000000000001';
    const res = await healthRoutes({ db: fakeDb }).request('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { ok: boolean; serverId?: string } };
    expect(body.data.ok).toBe(true);
    expect(body.data.serverId).toBe('7f1c2a9e-0000-4000-8000-000000000001');
  });

  test('bulut (desktop emas) — serverId qaytarilmaydi', async () => {
    delete process.env.DENTAL_LOCAL_DESKTOP;
    process.env.DENTAL_SERVER_ID = 'leaked-from-shell';
    const res = await healthRoutes({ db: fakeDb }).request('/');
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect('serverId' in body.data).toBe(false);
  });
});
