/**
 * CLI-359 — `GET /uploads/:key` mount + tenant-scoping (REAL DB emas —
 * bu route filesystem-based, DB'ga bormaydi; ikkita tenantId — random UUID,
 * seed shart emas).
 *
 * `UPLOADS_DIR` — `app.ts` va `lib/s3.ts` modul-darajasida `createLocalStorageAdapter()`
 * yaratadi, `process.env.UPLOADS_DIR`ni MODUL YUKLANGANDA o'qiydi — shuning uchun
 * bu env `../../src/app.ts` dynamic import'idan OLDIN o'rnatiladi (activate.test.ts
 * bilan bir xil idiom: mock/env import'dan oldin).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-359-uploads-mount`
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testUploadsDir = await mkdtemp(join(tmpdir(), 'cli-359-uploads-'));
process.env.UPLOADS_DIR = testUploadsDir;

const { createApp } = await import('../../src/app.ts');
const { createLocalStorageAdapter } = await import('../../src/lib/storage.ts');
const { signAccess } = await import('../../src/lib/jwt.ts');

afterAll(async () => {
  await rm(testUploadsDir, { recursive: true, force: true });
});

describe('CLI-359 — /uploads mount', () => {
  test('GET /uploads/:key without Authorization -> 401 (proves route is mounted)', async () => {
    const app = createApp();
    // Mount qilinmagan bo'lsa Hono default 404 "Not Found" qaytaradi (route
    // yo'q); mount qilingandan keyin authMiddleware 401 bilan bloklaydi —
    // shu farq mount qilinganini isbotlaydi.
    const res = await app.request('/uploads/tenants/x/patients/y/z.jpg');
    expect(res.status).toBe(401);
  });

  test('own-tenant JWT -> 200, file bytes match', async () => {
    const storage = createLocalStorageAdapter(testUploadsDir);
    const tenantAId = randomUUID();
    const patientId = randomUUID();
    const imageId = randomUUID();
    const key = `tenants/${tenantAId}/patients/${patientId}/${imageId}.jpg`;
    const fileBytes = Buffer.from('fake-jpeg-bytes');
    await storage.save(key, fileBytes);

    const { token } = await signAccess({
      sub: randomUUID(),
      atid: tenantAId,
      abid: null,
      perms: [],
      roleKey: null,
      lang: 'uz',
    });

    const app = createApp();
    const res = await app.request(`/uploads/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(fileBytes)).toBe(true);
  });

  test('cross-tenant JWT -> 404 (file exists but belongs to another tenant)', async () => {
    const storage = createLocalStorageAdapter(testUploadsDir);
    const tenantAId = randomUUID();
    const tenantBId = randomUUID();
    const patientId = randomUUID();
    const imageId = randomUUID();
    const key = `tenants/${tenantAId}/patients/${patientId}/${imageId}.jpg`;
    await storage.save(key, Buffer.from('fake-jpeg-bytes'));

    const { token } = await signAccess({
      sub: randomUUID(),
      atid: tenantBId, // boshqa tenant — key tenantAId'ga tegishli
      abid: null,
      perms: [],
      roleKey: null,
      lang: 'uz',
    });

    const app = createApp();
    const res = await app.request(`/uploads/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('correct tenant but non-existent file -> 404 (unchanged from before CLI-359)', async () => {
    const tenantAId = randomUUID();
    const patientId = randomUUID();
    const key = `tenants/${tenantAId}/patients/${patientId}/${randomUUID()}.jpg`; // hech qachon save qilinmagan

    const { token } = await signAccess({
      sub: randomUUID(),
      atid: tenantAId,
      abid: null,
      perms: [],
      roleKey: null,
      lang: 'uz',
    });

    const app = createApp();
    const res = await app.request(`/uploads/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });

  test('malformed key (no "tenants/" prefix) -> 404, never leaks arbitrary path', async () => {
    const { token } = await signAccess({
      sub: randomUUID(),
      atid: randomUUID(),
      abid: null,
      perms: [],
      roleKey: null,
      lang: 'uz',
    });

    const app = createApp();
    const res = await app.request(`/uploads/${encodeURIComponent('not-a-tenant-path/x.jpg')}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });
});
