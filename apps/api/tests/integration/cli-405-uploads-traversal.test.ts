/**
 * CLI-405 — `GET /uploads/:key` cross-tenant IDOR (`..` traversal).
 *
 * Tenant tekshiruvi xom key'ning `split('/')[1]`iga tayanardi, fayl esa
 * `resolveSafePath` orqali `..`ni collapse qilib o'qilardi — ikki nazorat
 * turli stringni ko'radi. `tenants/{T1}/../{T2}/...` keyi T1-gate'dan o'tib
 * T2 papkasiga yechilardi (cross-tenant PHI oqishi).
 *
 * Fix: tenant'ni KANONIK (resolved) yo'ldan qayta olib solishtirish.
 *
 * CLI-359 harness idiomasi: `UPLOADS_DIR` env `app.ts` dynamic import'idan OLDIN.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-405-uploads-traversal`
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testUploadsDir = await mkdtemp(join(tmpdir(), 'cli-405-uploads-'));
process.env.UPLOADS_DIR = testUploadsDir;

const { createApp } = await import('../../src/app.ts');
const { createLocalStorageAdapter } = await import('../../src/lib/storage.ts');
const { signAccess } = await import('../../src/lib/jwt.ts');

afterAll(async () => {
  await rm(testUploadsDir, { recursive: true, force: true });
});

async function tokenFor(tenantId: string): Promise<string> {
  const { token } = await signAccess({
    sub: randomUUID(),
    atid: tenantId,
    abid: null,
    perms: [],
    roleKey: null,
    lang: 'uz',
  });
  return token;
}

describe('CLI-405 — /uploads `..` traversal', () => {
  test('`..` traversal key -> 404, cross-tenant file does NOT leak', async () => {
    const storage = createLocalStorageAdapter(testUploadsDir);
    const tenantAId = randomUUID();
    const tenantBId = randomUUID();
    const patientId = randomUUID();
    const imageId = randomUUID();

    // Fayl T2 (victim) papkasida.
    const victimKey = `tenants/${tenantBId}/patients/${patientId}/${imageId}.jpg`;
    await storage.save(victimKey, Buffer.from('victim-phi-bytes'));

    // Hujumchi T1 JWT bilan `..` orqali T2'ga chiqmoqchi.
    const traversalKey = `tenants/${tenantAId}/../${tenantBId}/patients/${patientId}/${imageId}.jpg`;
    const token = await tokenFor(tenantAId);

    const app = createApp();
    const res = await app.request(`/uploads/${encodeURIComponent(traversalKey)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('encoded `%2e%2e` traversal -> 404', async () => {
    const storage = createLocalStorageAdapter(testUploadsDir);
    const tenantAId = randomUUID();
    const tenantBId = randomUUID();
    const patientId = randomUUID();
    const imageId = randomUUID();

    const victimKey = `tenants/${tenantBId}/patients/${patientId}/${imageId}.jpg`;
    await storage.save(victimKey, Buffer.from('victim-phi-bytes'));

    const token = await tokenFor(tenantAId);
    // `%2e%2e` va `%2f` bilan yasalgan — Hono bir marta decode qiladi.
    const rawPath = `tenants/${tenantAId}/%2e%2e/${tenantBId}/patients/${patientId}/${imageId}.jpg`;

    const app = createApp();
    const res = await app.request(`/uploads/${rawPath}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });

  test('absolute-path key -> 404 (not 500)', async () => {
    const token = await tokenFor(randomUUID());
    const app = createApp();
    const res = await app.request(`/uploads/${encodeURIComponent('/etc/passwd')}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });

  test('legit own-tenant key still -> 200 (no CLI-359 regression)', async () => {
    const storage = createLocalStorageAdapter(testUploadsDir);
    const tenantId = randomUUID();
    const key = `tenants/${tenantId}/patients/${randomUUID()}/${randomUUID()}.jpg`;
    const bytes = Buffer.from('own-bytes');
    await storage.save(key, bytes);

    const token = await tokenFor(tenantId);
    const app = createApp();
    const res = await app.request(`/uploads/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(bytes)).toBe(true);
  });
});
