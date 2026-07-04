import { afterAll, describe, expect, mock, test } from 'bun:test';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// LICENSE_PATH — top-level const, evaluated at first import; env MUST be set
// before any `await import('./license')` happens (module cache — set once).
let tmpDir: string;
tmpDir = await mkdtemp(join(tmpdir(), 'license-test-'));
process.env.LICENSE_PATH = join(tmpDir, 'license.lic');

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// systeminformation default-export shape — mock BEFORE any dynamic import of
// './license' resolves it (bun mock.module must be registered up front).
mock.module('systeminformation', () => {
  const cpu = async () => ({ physicalCores: 4, manufacturer: 'Intel', brand: 'i5' });
  const system = async () => ({ uuid: 'test-uuid-1234', serial: 'SN123456' });
  const networkInterfaces = async () => [
    { iface: 'eth0', mac: '00:11:22:33:44:55', default: true },
  ];
  return { default: { cpu, system, networkInterfaces }, cpu, system, networkInterfaces };
});

// CLI-362 — signature verification. Registered at top level (module scope),
// before any describe block below does `await import('./license')`, mirroring
// the `systeminformation` mock above (see plan Task 3 Step 1 ordering note).
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

describe('getFingerprint', () => {
  test('returns consistent SHA-256 hash', async () => {
    const { getFingerprint } = await import('./license');
    const fp1 = await getFingerprint();
    const fp2 = await getFingerprint();
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('writeLicense + readLicense', () => {
  test('round-trips license data', async () => {
    const { writeLicense, readLicense } = await import('./license');
    const data = {
      licenseKey: 'TEST-KEY-1234',
      clinicId: 'clinic-abc',
      modules: ['patients', 'appointments'],
      expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
      gracePeriodDays: 30,
      issuedAt: new Date().toISOString(),
      signature: 'mock-signature',
    };
    await writeLicense(data);
    const read = await readLicense();
    expect(read).toMatchObject({
      licenseKey: 'TEST-KEY-1234',
      modules: ['patients', 'appointments'],
    });
  });
});

describe('isLicenseValid', () => {
  test('returns false if expiresAt + gracePeriodDays passed', async () => {
    const { isLicenseValid } = await import('./license');
    const expired = {
      licenseKey: 'K',
      clinicId: 'c',
      modules: [],
      expiresAt: new Date(Date.now() - 86400000 * 60).toISOString(), // 60 kun oldin
      gracePeriodDays: 30,
      issuedAt: new Date().toISOString(),
      signature: 'sig',
    };
    expect(isLicenseValid(expired)).toBe(false);
  });
});

describe('isLicenseValid — signature verification (CLI-362)', () => {
  test('accepts a non-expired license whose signature matches the (mocked) public key', async () => {
    const payload = {
      licenseKey: 'K',
      clinicId: 'c',
      modules: ['patients'],
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(), // 30 kun keyin
      gracePeriodDays: 0,
      issuedAt: new Date().toISOString(),
    };
    const signature = signForTest(payload);

    const { isLicenseValid } = await import('./license');
    expect(isLicenseValid({ ...payload, signature })).toBe(true);
  });

  test('rejects the same license after modules/expiresAt are tampered with (fingerprint-forge scenario)', async () => {
    const payload = {
      licenseKey: 'K',
      clinicId: 'c',
      modules: ['patients'],
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      gracePeriodDays: 0,
      issuedAt: new Date().toISOString(),
    };
    const signature = signForTest(payload);

    // A local admin who knows getFingerprint()'s output (non-secret) could
    // rewrite the .lic file with this exact mutation using the old code.
    const forged = {
      ...payload,
      modules: ['patients', 'lab-orders', 'clinical'], // enable modules not licensed
      expiresAt: new Date(Date.now() + 86400000 * 3650).toISOString(), // extend 10 years
      signature, // stale signature, no longer matches the mutated payload
    };

    const { isLicenseValid } = await import('./license');
    expect(isLicenseValid(forged)).toBe(false);
  });
});
