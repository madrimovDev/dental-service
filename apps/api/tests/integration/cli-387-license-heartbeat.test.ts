/**
 * CLI-387 — proves the DoD end-to-end: an active Local Desktop clinic passes
 * requireModule() gating; once a heartbeat confirms the Supervisor
 * deactivated it (INVALID_KEY), the cached .lic is invalidated and the very
 * next request is blocked — no process restart, no extra signal, because
 * getActiveModules() re-reads the file on every call (see license.ts).
 *
 * Hermetic — no Postgres (unlike cli-358-module-gating.test.ts): builds a
 * bare Hono app around requireModule() directly, and uses a REAL signed
 * .lic file (systeminformation + supervisor-public-key mocked, same pattern
 * as license.test.ts's signForTest helper) so the real readLicense ->
 * isLicenseValid -> getActiveModules -> requireModule chain runs unmodified.
 *
 * Run: cd apps/api && bun test --env-file=../../.env cli-387-license-heartbeat
 */
import { afterAll, describe, expect, mock, test } from 'bun:test';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';

const tmpDir = await mkdtemp(join(tmpdir(), 'cli-387-heartbeat-'));
process.env.LICENSE_PATH = join(tmpDir, 'license.lic');

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// systeminformation — mock BEFORE any dynamic import of '../../src/lib/license.ts'
// resolves it (bun mock.module must be registered up front, license.test.ts pattern).
mock.module('systeminformation', () => {
  const cpu = async () => ({ manufacturer: 'Intel', brand: 'i5' });
  const system = async () => ({ uuid: 'cli-387-uuid', serial: 'cli-387-serial' });
  const networkInterfaces = async () => [
    { iface: 'eth0', mac: 'aa:bb:cc:dd:ee:ff', default: true },
  ];
  return { default: { cpu, system, networkInterfaces }, cpu, system, networkInterfaces };
});

const testKeypair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

mock.module('@dental/core/supervisor-public-key', () => ({
  SUPERVISOR_PUBLIC_KEY_PEM: testKeypair.publicKey,
}));

const signForTest = (data: object): string => {
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  const sign = createSign('SHA256');
  sign.update(canonical);
  return sign.sign(testKeypair.privateKey, 'hex');
};

const { writeLicense, readLicense, invalidateLicense } = await import('../../src/lib/license.ts');
const { requireModule } = await import('../../src/lib/license-middleware.ts');
const { runLicenseHeartbeatCheck } = await import('../../src/lib/license-heartbeat-scheduler.ts');
const { sendHeartbeat } = await import('../../src/lib/license-client.ts');
const { logger } = await import('../../src/lib/logger.ts');

const buildApp = () => {
  const app = new Hono();
  app.get('/x', requireModule('patients'), (c) => c.json({ ok: true }));
  return app;
};

const activeLicensePayload = (licenseKey: string) => ({
  licenseKey,
  clinicId: 'clinic-387',
  modules: ['patients'],
  expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
  gracePeriodDays: 30,
  issuedAt: new Date().toISOString(),
});

describe('CLI-387 — deactivated clinic gets blocked on next heartbeat', () => {
  const originalFetch = globalThis.fetch;
  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test('active license passes (200) -> Supervisor heartbeat says INVALID_KEY -> next request 403 LICENSE_NOT_FOUND', async () => {
    const payload = activeLicensePayload('CLI-387-KEY-1');
    await writeLicense({ ...payload, signature: signForTest(payload) });

    const app = buildApp();

    // BEFORE: active license, module allowed.
    const before = await app.request('/x');
    expect(before.status).toBe(200);

    // Supervisor now reports the clinic deactivated (PATCH /:id/deactivate
    // set isActive:false; licenses.service.ts heartbeat() throws INVALID_KEY).
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ error: { code: 'INVALID_KEY' } }), { status: 403 }),
    ) as unknown as typeof fetch;

    await runLicenseHeartbeatCheck({
      readLicense,
      writeLicense,
      invalidateLicense,
      sendHeartbeat,
      log: logger,
    });

    // AFTER: .lic invalidated -> getActiveModules() re-reads and finds
    // nothing -> gate closes on the very next request, no restart needed.
    const after = await app.request('/x');
    expect(after.status).toBe(403);
    const body = (await after.json()) as { error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });

  test('transient network error during heartbeat does NOT invalidate the cached license (offline resilience)', async () => {
    const payload = activeLicensePayload('CLI-387-KEY-2');
    await writeLicense({ ...payload, signature: signForTest(payload) });

    const app = buildApp();
    expect((await app.request('/x')).status).toBe(200);

    globalThis.fetch = mock(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    await runLicenseHeartbeatCheck({
      readLicense,
      writeLicense,
      invalidateLicense,
      sendHeartbeat,
      log: logger,
    });

    // Still works — local signature+expiry+grace check is unaffected by
    // the Supervisor being unreachable (Global Constraint).
    expect((await app.request('/x')).status).toBe(200);
  });
});
