/**
 * FX-06 (LA-15, X-4) — heartbeat javobi `.lic`ga yozilishidan OLDIN imzo +
 * mahalliy fingerprint bilan tekshiriladi. Yaroqsiz bo'lsa eski `.lic` (va
 * monotonik langar) tegilmaydi — aks holda MITM (HTTP/IP rejimidagi Supervisor)
 * yoki almashtirilgan RSA juftligi (FU-54) yaroqli litsenziyani darhol
 * `LICENSE_NOT_FOUND` blokiga aylantirardi.
 *
 * Hermetic (cli-387 naqshi): haqiqiy imzolangan `.lic` + haqiqiy
 * `readLicense`/`writeLicense`/`sendHeartbeat`/`requireModule` zanjiri,
 * faqat `fetch` (Supervisor) va apparat/ochiq kalit mock qilinadi.
 * Tekshiruv `runLicenseHeartbeatCheck`ning STANDART yo'lida bo'lishi kerak —
 * shuning uchun test verifikatsiya dep'ini uzatmaydi.
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-06-heartbeat-verify.test.ts
 */
import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';

const tmpDir = await mkdtemp(join(tmpdir(), 'fx-06-heartbeat-'));
process.env.LICENSE_PATH = join(tmpDir, 'license.lic');
process.env.LICENSE_ANCHOR_PATH = join(tmpDir, 'license-anchor.dat');

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

mock.module('systeminformation', () => {
  const cpu = async () => ({ manufacturer: 'Intel', brand: 'i5' });
  const system = async () => ({ uuid: 'fx-06-uuid', serial: 'fx-06-serial' });
  const networkInterfaces = async () => [];
  return { default: { cpu, system, networkInterfaces }, cpu, system, networkInterfaces };
});

const genKeys = () =>
  generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

const trustedKeys = genKeys();
// FU-54 ssenariysi — vendor juftlikni almashtirdi, eski build eski ochiq kalitni saqlaydi.
const rotatedKeys = genKeys();

mock.module('@dental/core/supervisor-public-key', () => ({
  SUPERVISOR_PUBLIC_KEY_PEM: trustedKeys.publicKey,
}));

const signWith = (privateKey: string, data: object): string => {
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  const sign = createSign('SHA256');
  sign.update(canonical);
  return sign.sign(privateKey, 'hex');
};

const {
  writeLicense,
  readLicense,
  invalidateLicense,
  getFingerprint,
  resetFingerprintCache,
  readAnchor,
  writeAnchor,
} = await import('../../src/lib/license.ts');
const { requireModule } = await import('../../src/lib/license-middleware.ts');
const { runLicenseHeartbeatCheck } = await import('../../src/lib/license-heartbeat-scheduler.ts');
const { sendHeartbeat } = await import('../../src/lib/license-client.ts');
const { logger } = await import('../../src/lib/logger.ts');

resetFingerprintCache();
const localFingerprint = await getFingerprint();

const buildApp = () => {
  const app = new Hono();
  app.get('/x', requireModule('patients'), (c) => c.json({ ok: true }));
  return app;
};

const payloadFor = (overrides: Partial<Record<string, unknown>> = {}) => ({
  licenseKey: 'FX-06-KEY',
  clinicId: 'clinic-fx-06',
  modules: ['patients'],
  expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
  gracePeriodDays: 7,
  issuedAt: new Date().toISOString(),
  fingerprint: localFingerprint,
  ...overrides,
});

const seedValidLicense = async () => {
  const payload = payloadFor();
  const lic = { ...payload, signature: signWith(trustedKeys.privateKey, payload) };
  await writeLicense(lic);
  const anchor = Date.now();
  await writeAnchor(anchor);
  return { lic, anchor };
};

const supervisorReturns = (body: object) => {
  globalThis.fetch = mock(
    async () => new Response(JSON.stringify(body), { status: 200 }),
  ) as unknown as typeof fetch;
};

const runCheck = () =>
  runLicenseHeartbeatCheck({
    readLicense,
    writeLicense,
    invalidateLicense,
    sendHeartbeat,
    readAnchor,
    writeAnchor,
    log: logger,
  });

const FAR_FUTURE_ISSUED_AT = new Date(Date.now() + 86400000 * 365 * 5).toISOString();

describe('FX-06 — heartbeat response is verified before it replaces the cached .lic', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('unsigned/garbage-signed 200 (MITM) does not change .lic, anchor, or the module gate', async () => {
    const { lic, anchor } = await seedValidLicense();
    const app = buildApp();
    expect((await app.request('/x')).status).toBe(200);

    supervisorReturns({
      ...payloadFor({ modules: [], issuedAt: FAR_FUTURE_ISSUED_AT }),
      signature: 'deadbeef',
    });
    await runCheck();

    expect(await readLicense()).toEqual(lic);
    expect(await readAnchor()).toBeLessThan(Date.parse(FAR_FUTURE_ISSUED_AT));
    expect(await readAnchor()).toBeGreaterThanOrEqual(anchor);
    expect((await app.request('/x')).status).toBe(200);
  });

  test('payload signed with a different (rotated) Supervisor key does not replace .lic', async () => {
    const { lic } = await seedValidLicense();
    const fresh = payloadFor({ expiresAt: new Date(Date.now() + 86400000 * 365).toISOString() });
    supervisorReturns({ ...fresh, signature: signWith(rotatedKeys.privateKey, fresh) });

    await runCheck();

    expect(await readLicense()).toEqual(lic);
    expect((await buildApp().request('/x')).status).toBe(200);
  });

  test('correctly signed payload bound to ANOTHER machine fingerprint does not replace .lic', async () => {
    const { lic } = await seedValidLicense();
    const fresh = payloadFor({ fingerprint: 'f'.repeat(64) });
    supervisorReturns({ ...fresh, signature: signWith(trustedKeys.privateKey, fresh) });

    await runCheck();

    expect(await readLicense()).toEqual(lic);
    expect((await buildApp().request('/x')).status).toBe(200);
  });

  test('correctly signed payload for this machine IS written (renewal still works)', async () => {
    await seedValidLicense();
    const newExpiry = new Date(Date.now() + 86400000 * 365).toISOString();
    const fresh = payloadFor({ expiresAt: newExpiry });
    const signed = { ...fresh, signature: signWith(trustedKeys.privateKey, fresh) };
    supervisorReturns(signed);

    await runCheck();

    expect(await readLicense()).toEqual(signed);
    expect((await buildApp().request('/x')).status).toBe(200);
  });
});
