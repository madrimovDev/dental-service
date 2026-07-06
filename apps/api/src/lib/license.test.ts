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
// CLI-437 — monotonic anchor file, same isolation reasoning as LICENSE_PATH above.
process.env.LICENSE_ANCHOR_PATH = join(tmpDir, 'license-anchor.dat');

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

  // CLI-432 — the network-interface MAC must NOT influence the fingerprint, so
  // moving Wi-Fi <-> Ethernet (default interface / MAC changes) never changes
  // the hash and never breaks the AES-derived `.lic` decrypt key.
  test('is stable when the default network interface / MAC changes (CLI-432)', async () => {
    const si = (await import('systeminformation')).default as {
      networkInterfaces: () => Promise<unknown>;
    };
    const original = si.networkInterfaces;

    const { getFingerprint } = await import('./license');
    // MAC A (default eth0)
    si.networkInterfaces = async () => [{ iface: 'eth0', mac: 'AA:AA:AA:AA:AA:AA', default: true }];
    const fpA = await getFingerprint();
    // MAC B (default wlan0) — same machine, different active NIC
    si.networkInterfaces = async () => [
      { iface: 'wlan0', mac: 'BB:BB:BB:BB:BB:BB', default: true },
    ];
    const fpB = await getFingerprint();
    // No default interface at all
    si.networkInterfaces = async () => [];
    const fpNone = await getFingerprint();

    si.networkInterfaces = original;

    expect(fpA).toBe(fpB);
    expect(fpA).toBe(fpNone);
  });

  test('throws FINGERPRINT_UNAVAILABLE when both uuid and serial are empty (CLI-432)', async () => {
    const si = (await import('systeminformation')).default as {
      system: () => Promise<unknown>;
    };
    const original = si.system;
    si.system = async () => ({ uuid: '', serial: '' });

    const { getFingerprint } = await import('./license');
    await expect(getFingerprint()).rejects.toThrow('FINGERPRINT_UNAVAILABLE');

    si.system = original;
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
      fingerprint: 'test-fp',
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

describe('invalidateLicense', () => {
  test('deletes the cached .lic file so readLicense() returns null afterward', async () => {
    const { writeLicense, readLicense, invalidateLicense } = await import('./license');
    const data = {
      licenseKey: 'CLI-387-KEY',
      clinicId: 'clinic-387',
      modules: ['patients'],
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      gracePeriodDays: 30,
      issuedAt: new Date().toISOString(),
      fingerprint: 'test-fp',
      signature: 'mock-signature',
    };
    await writeLicense(data);
    expect(await readLicense()).not.toBeNull();

    await invalidateLicense();

    expect(await readLicense()).toBeNull();
  });

  test('no-ops (does not throw) if the .lic file does not exist', async () => {
    const { invalidateLicense } = await import('./license');
    await invalidateLicense(); // already deleted by the previous test, or never existed
    await invalidateLicense(); // calling twice must still not throw
  });
});

describe('isLicenseValid', () => {
  test('returns false if expiresAt + gracePeriodDays passed', async () => {
    const { isLicenseValid, getFingerprint } = await import('./license');
    const localFp = await getFingerprint();
    const payload = {
      licenseKey: 'K',
      clinicId: 'c',
      modules: [] as string[],
      expiresAt: new Date(Date.now() - 86400000 * 60).toISOString(), // 60 kun oldin
      gracePeriodDays: 30,
      issuedAt: new Date().toISOString(),
      fingerprint: localFp,
    };
    // Properly signed + matching fingerprint — only the expiry gate fails.
    const signature = signForTest(payload);
    expect(isLicenseValid({ ...payload, signature }, localFp)).toBe(false);
  });
});

describe('isLicenseValid — signature verification (CLI-362)', () => {
  test('accepts a non-expired license whose signature + fingerprint match', async () => {
    const { isLicenseValid, getFingerprint } = await import('./license');
    const localFp = await getFingerprint();
    const payload = {
      licenseKey: 'K',
      clinicId: 'c',
      modules: ['patients'],
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(), // 30 kun keyin
      gracePeriodDays: 0,
      issuedAt: new Date().toISOString(),
      fingerprint: localFp,
    };
    const signature = signForTest(payload);

    expect(isLicenseValid({ ...payload, signature }, localFp)).toBe(true);
  });

  test('rejects the same license after modules/expiresAt are tampered with (fingerprint-forge scenario)', async () => {
    const { isLicenseValid, getFingerprint } = await import('./license');
    const localFp = await getFingerprint();
    const payload = {
      licenseKey: 'K',
      clinicId: 'c',
      modules: ['patients'],
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      gracePeriodDays: 0,
      issuedAt: new Date().toISOString(),
      fingerprint: localFp,
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

    expect(isLicenseValid(forged, localFp)).toBe(false);
  });
});

describe('isLicenseValid — machine binding (CLI-410)', () => {
  const basePayload = () => ({
    licenseKey: 'K',
    clinicId: 'c',
    modules: ['patients'],
    expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
    gracePeriodDays: 0,
    issuedAt: new Date().toISOString(),
  });

  test('rejects a payload validly signed for machine A when checked on machine B', async () => {
    const { isLicenseValid, getFingerprint } = await import('./license');
    const localFp = await getFingerprint(); // machine B
    const machineAFp = 'a'.repeat(64); // some other machine's fingerprint
    const payload = { ...basePayload(), fingerprint: machineAFp };
    const signature = signForTest(payload); // legitimately signed for machine A

    // Signature verifies, but the bound fingerprint is not this machine's.
    expect(isLicenseValid({ ...payload, signature }, localFp)).toBe(false);
  });

  test('rejects a legacy payload that has no fingerprint field', async () => {
    const { isLicenseValid, getFingerprint } = await import('./license');
    const localFp = await getFingerprint();
    const legacyPayload = basePayload(); // no `fingerprint`
    const signature = signForTest(legacyPayload); // validly signed (old scheme)

    expect(
      isLicenseValid(
        { ...legacyPayload, signature } as unknown as import('./license').LicenseData,
        localFp,
      ),
    ).toBe(false);
  });

  test('getActiveModules returns [] when the bound fingerprint does not match this machine', async () => {
    const { writeLicense, getActiveModules, getFingerprint } = await import('./license');
    const machineAFp = 'b'.repeat(64);
    const payload = { ...basePayload(), fingerprint: machineAFp };
    const signature = signForTest(payload);
    // .lic is AES-encrypted with THIS machine's key, so readLicense decrypts it,
    // but the signed fingerprint belongs to machine A -> rejected.
    await writeLicense({ ...payload, signature });
    expect(await getFingerprint()).not.toBe(machineAFp);
    expect(await getActiveModules()).toEqual([]);
  });

  test('getActiveModules returns modules for a matching-fingerprint valid license', async () => {
    const { writeLicense, getActiveModules, getFingerprint } = await import('./license');
    const localFp = await getFingerprint();
    const payload = { ...basePayload(), modules: ['patients', 'queue'], fingerprint: localFp };
    const signature = signForTest(payload);
    await writeLicense({ ...payload, signature });
    expect(await getActiveModules()).toEqual(['patients', 'queue']);
  });
});

describe('isLicenseValid — monotonic clock anchor (CLI-437)', () => {
  test('a clock rollback before expiry is blocked when the anchor is already past expiry+grace', async () => {
    const { isLicenseValid, getFingerprint } = await import('./license');
    const localFp = await getFingerprint();
    const expiresAt = new Date(Date.now() + 86400000).toISOString(); // expires in 1 day
    const payload = {
      licenseKey: 'K',
      clinicId: 'c',
      modules: ['patients'],
      expiresAt,
      gracePeriodDays: 0,
      issuedAt: new Date().toISOString(),
      fingerprint: localFp,
    };
    const signature = signForTest(payload);
    // Anchor already 2 days past expiry (e.g. real time moved on before the
    // clock was rolled back) — even though Date.now() (mocked implicitly via
    // real clock here, well within the license's validity window) says valid.
    const anchorMs = new Date(expiresAt).getTime() + 86400000 * 2;

    expect(isLicenseValid({ ...payload, signature }, localFp, anchorMs)).toBe(false);
  });

  test('a valid license with no anchor (anchorMs=0) is accepted', async () => {
    const { isLicenseValid, getFingerprint } = await import('./license');
    const localFp = await getFingerprint();
    const payload = {
      licenseKey: 'K',
      clinicId: 'c',
      modules: ['patients'],
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      gracePeriodDays: 0,
      issuedAt: new Date().toISOString(),
      fingerprint: localFp,
    };
    const signature = signForTest(payload);

    expect(isLicenseValid({ ...payload, signature }, localFp, 0)).toBe(true);
  });

  test('issuedAt acts as a floor when the anchor file is missing/zero — an already-expired-at-issue license stays invalid', async () => {
    const { isLicenseValid, getFingerprint } = await import('./license');
    const localFp = await getFingerprint();
    // issuedAt itself is already past expiry+grace (pathological, but exercises
    // the issuedAt floor independent of any anchor file).
    const payload = {
      licenseKey: 'K',
      clinicId: 'c',
      modules: ['patients'],
      expiresAt: new Date(Date.now() - 86400000 * 10).toISOString(),
      gracePeriodDays: 0,
      issuedAt: new Date().toISOString(), // issued "now", long after expiresAt
      fingerprint: localFp,
    };
    const signature = signForTest(payload);

    expect(isLicenseValid({ ...payload, signature }, localFp, 0)).toBe(false);
  });
});

describe('readAnchor + writeAnchor (CLI-437)', () => {
  test('round-trips the same millisecond value through AES encryption', async () => {
    const { writeAnchor, readAnchor } = await import('./license');
    const ms = Date.now();
    await writeAnchor(ms);
    expect(await readAnchor()).toBe(ms);
  });

  test('missing anchor file -> readAnchor returns 0', async () => {
    const { readAnchor } = await import('./license');
    process.env.LICENSE_ANCHOR_PATH = join(tmpDir, 'nonexistent-anchor.dat');
    expect(await readAnchor()).toBe(0);
  });
});

describe('getActiveModules — anchor advance (CLI-437)', () => {
  test('a valid license check advances the anchor forward (never backward)', async () => {
    process.env.LICENSE_ANCHOR_PATH = join(tmpDir, 'advance-anchor.dat');
    const { writeLicense, getActiveModules, getFingerprint, readAnchor } = await import(
      './license'
    );
    const localFp = await getFingerprint();
    const beforeMs = Date.now();
    const payload = {
      licenseKey: 'K',
      clinicId: 'c',
      modules: ['patients'],
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      gracePeriodDays: 0,
      issuedAt: new Date().toISOString(),
      fingerprint: localFp,
    };
    const signature = signForTest(payload);
    await writeLicense({ ...payload, signature });

    expect(await getActiveModules()).toEqual(['patients']);
    expect(await readAnchor()).toBeGreaterThanOrEqual(beforeMs);
  });
});
