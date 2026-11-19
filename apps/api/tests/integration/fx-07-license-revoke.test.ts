/**
 * FX-07 (LA-16, X-4) — heartbeat `.lic`ni FAQAT Supervisor IMZOLAGAN
 * `LICENSE_REVOKED` javobida o'chiradi:
 * - imzosiz `INVALID_KEY` (eski Supervisor yoki MITM 403) → `.lic` saqlanadi;
 * - `UNKNOWN_KEY` (Supervisor bazasi zaxiradan tiklangan, qator yo'q) → saqlanadi;
 * - `LICENSE_REVOKED` imzosiz / boshqa kalit / boshqa mashina / boshqa kalit
 *   raqami / eski (replay) `issuedAt` → saqlanadi;
 * - to'g'ri imzolangan `LICENSE_REVOKED` → `.lic` o'chadi, keyingi so'rov 403;
 * - `expiresAt` regressiyasi (yangi < joriy, masalan zaxiradan tiklangan
 *   Supervisor eski muddatni qayta imzolaydi) → eski `.lic` saqlanadi.
 *
 * Hermetic (cli-387 / fx-06 naqshi): haqiqiy imzolangan `.lic` fayli + haqiqiy
 * `readLicense`/`writeLicense`/`invalidateLicense`/`sendHeartbeat`/
 * `requireModule` zanjiri; faqat `fetch` (Supervisor) va apparat/ochiq kalit
 * mock qilinadi. Tekshiruv STANDART yo'lda bo'lishi kerak — verifikatsiya
 * dep'lari uzatilmaydi.
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-07-license-revoke.test.ts
 */
import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';

const tmpDir = await mkdtemp(join(tmpdir(), 'fx-07-revoke-'));
process.env.LICENSE_PATH = join(tmpDir, 'license.lic');
process.env.LICENSE_ANCHOR_PATH = join(tmpDir, 'license-anchor.dat');

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

mock.module('systeminformation', () => {
  const cpu = async () => ({ manufacturer: 'Intel', brand: 'i5' });
  const system = async () => ({ uuid: 'fx-07-uuid', serial: 'fx-07-serial' });
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
const otherKeys = genKeys();

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

const LICENSE_KEY = 'FX-07-KEY';
const CURRENT_ISSUED_AT = new Date(Date.now() - 60_000).toISOString();
const CURRENT_EXPIRES_AT = new Date(Date.now() + 86400000 * 30).toISOString();

const licensePayload = (overrides: Record<string, unknown> = {}) => ({
  licenseKey: LICENSE_KEY,
  clinicId: 'clinic-fx-07',
  modules: ['patients'],
  expiresAt: CURRENT_EXPIRES_AT,
  gracePeriodDays: 7,
  issuedAt: CURRENT_ISSUED_AT,
  fingerprint: localFingerprint,
  ...overrides,
});

const seedLicense = async () => {
  const payload = licensePayload();
  await writeLicense({ ...payload, signature: signWith(trustedKeys.privateKey, payload) });
};

const revocationPayload = (overrides: Record<string, unknown> = {}) => ({
  status: 'revoked',
  licenseKey: LICENSE_KEY,
  clinicId: 'clinic-fx-07',
  fingerprint: localFingerprint,
  issuedAt: new Date().toISOString(),
  ...overrides,
});

const signedRevocation = (
  overrides: Record<string, unknown> = {},
  privateKey = trustedKeys.privateKey,
) => {
  const payload = revocationPayload(overrides);
  return { ...payload, signature: signWith(privateKey, payload) };
};

const supervisorRespondsError = (error: Record<string, unknown>) => {
  globalThis.fetch = mock(
    async () => new Response(JSON.stringify({ error }), { status: 403 }),
  ) as unknown as typeof fetch;
};

const supervisorRespondsOk = (body: object) => {
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

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('FX-07 — .lic is removed only on a signed LICENSE_REVOKED', () => {
  test('unsigned INVALID_KEY 403 (old Supervisor / MITM) keeps the .lic', async () => {
    await seedLicense();
    const app = buildApp();
    expect((await app.request('/x')).status).toBe(200);

    supervisorRespondsError({ code: 'INVALID_KEY' });
    await runCheck();

    expect(await readLicense()).not.toBeNull();
    expect((await app.request('/x')).status).toBe(200);
  });

  test('UNKNOWN_KEY (Supervisor DB restored from backup, row missing) keeps the .lic', async () => {
    await seedLicense();
    supervisorRespondsError({ code: 'UNKNOWN_KEY' });
    await runCheck();
    expect(await readLicense()).not.toBeNull();
    expect((await buildApp().request('/x')).status).toBe(200);
  });

  test('LICENSE_REVOKED without a revocation payload keeps the .lic', async () => {
    await seedLicense();
    supervisorRespondsError({ code: 'LICENSE_REVOKED' });
    await runCheck();
    expect(await readLicense()).not.toBeNull();
  });

  test('LICENSE_REVOKED with a garbage signature keeps the .lic', async () => {
    await seedLicense();
    supervisorRespondsError({
      code: 'LICENSE_REVOKED',
      revocation: { ...revocationPayload(), signature: 'deadbeef' },
    });
    await runCheck();
    expect(await readLicense()).not.toBeNull();
  });

  test('LICENSE_REVOKED signed with a different key keeps the .lic', async () => {
    await seedLicense();
    supervisorRespondsError({
      code: 'LICENSE_REVOKED',
      revocation: signedRevocation({}, otherKeys.privateKey),
    });
    await runCheck();
    expect(await readLicense()).not.toBeNull();
  });

  test('LICENSE_REVOKED signed for another machine keeps the .lic', async () => {
    await seedLicense();
    supervisorRespondsError({
      code: 'LICENSE_REVOKED',
      revocation: signedRevocation({ fingerprint: 'other-machine' }),
    });
    await runCheck();
    expect(await readLicense()).not.toBeNull();
  });

  test('LICENSE_REVOKED signed for another license key keeps the .lic', async () => {
    await seedLicense();
    supervisorRespondsError({
      code: 'LICENSE_REVOKED',
      revocation: signedRevocation({ licenseKey: 'SOME-OTHER-KEY' }),
    });
    await runCheck();
    expect(await readLicense()).not.toBeNull();
  });

  test('replayed LICENSE_REVOKED issued before the current .lic keeps the .lic', async () => {
    await seedLicense();
    supervisorRespondsError({
      code: 'LICENSE_REVOKED',
      revocation: signedRevocation({
        issuedAt: new Date(Date.parse(CURRENT_ISSUED_AT) - 86400000).toISOString(),
      }),
    });
    await runCheck();
    expect(await readLicense()).not.toBeNull();
  });

  test('LICENSE_REVOKED that is not a revocation (status other than revoked) keeps the .lic', async () => {
    await seedLicense();
    supervisorRespondsError({
      code: 'LICENSE_REVOKED',
      revocation: signedRevocation({ status: 'active' }),
    });
    await runCheck();
    expect(await readLicense()).not.toBeNull();
  });

  test('correctly signed LICENSE_REVOKED for this machine removes the .lic -> next request 403', async () => {
    await seedLicense();
    const app = buildApp();
    expect((await app.request('/x')).status).toBe(200);

    supervisorRespondsError({ code: 'LICENSE_REVOKED', revocation: signedRevocation() });
    await runCheck();

    expect(await readLicense()).toBeNull();
    const after = await app.request('/x');
    expect(after.status).toBe(403);
    const body = (await after.json()) as { error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });
});

describe('FX-07 — expiresAt regression keeps the current .lic', () => {
  test('signed heartbeat with an EARLIER expiresAt does not replace the .lic', async () => {
    await seedLicense();
    const regressed = licensePayload({
      expiresAt: new Date(Date.parse(CURRENT_EXPIRES_AT) - 86400000 * 10).toISOString(),
      issuedAt: new Date().toISOString(),
    });
    supervisorRespondsOk({ ...regressed, signature: signWith(trustedKeys.privateKey, regressed) });

    await runCheck();

    const lic = await readLicense();
    expect(lic?.expiresAt).toBe(CURRENT_EXPIRES_AT);
  });

  test('signed heartbeat with the same or a LATER expiresAt is still written', async () => {
    await seedLicense();
    const renewed = licensePayload({
      expiresAt: new Date(Date.parse(CURRENT_EXPIRES_AT) + 86400000 * 365).toISOString(),
      issuedAt: new Date().toISOString(),
      modules: ['patients', 'cashier'],
    });
    supervisorRespondsOk({ ...renewed, signature: signWith(trustedKeys.privateKey, renewed) });

    await runCheck();

    const lic = await readLicense();
    expect(lic?.expiresAt).toBe(renewed.expiresAt);
    expect(lic?.modules).toEqual(['patients', 'cashier']);
  });
});

/**
 * FX-07 (review) — imzolangan, lekin LITSENZIYA shaklida bo'lmagan 200 javobi
 * `.lic` ustiga yozilmasin. Bekor qilish bayonoti ham tekis, shu mashina
 * fingerprint'iga ega va shu kalit bilan imzolangan — faqat imzo+fingerprint
 * tekshiruvi uni "litsenziya" deb qabul qilardi, `expiresAt` yo'qligi (NaN)
 * regressiya tekshiruvini ham chetlab o'tardi. Natija: qayta yoqilgan,
 * to'lagan klinika eski (ushlab qolingan) bayonot bilan `expired` holatiga
 * tushardi (replay himoyasi aylanib o'tiladi).
 */
describe('FX-07 — a signed but wrong-shaped 200 heartbeat body keeps the .lic', () => {
  const expectUnchanged = async (before: unknown) => {
    expect(await readLicense()).toEqual(before as Awaited<ReturnType<typeof readLicense>>);
    expect((await buildApp().request('/x')).status).toBe(200);
  };

  test('old signed revocation (issuedAt before the current .lic) replayed as a 200 body', async () => {
    await seedLicense();
    const before = await readLicense();
    supervisorRespondsOk(
      signedRevocation({
        issuedAt: new Date(Date.parse(CURRENT_ISSUED_AT) - 86400000 * 10).toISOString(),
      }),
    );
    await runCheck();
    await expectUnchanged(before);
  });

  test('fresh signed revocation served as a 200 body (not via LICENSE_REVOKED)', async () => {
    await seedLicense();
    const before = await readLicense();
    supervisorRespondsOk(signedRevocation());
    await runCheck();
    await expectUnchanged(before);
  });

  test('signed license for another license key', async () => {
    await seedLicense();
    const before = await readLicense();
    const other = licensePayload({
      licenseKey: 'SOME-OTHER-KEY',
      expiresAt: new Date(Date.parse(CURRENT_EXPIRES_AT) + 86400000 * 365).toISOString(),
      issuedAt: new Date().toISOString(),
    });
    supervisorRespondsOk({ ...other, signature: signWith(trustedKeys.privateKey, other) });
    await runCheck();
    await expectUnchanged(before);
  });

  test('signed license whose expiresAt is not a date', async () => {
    await seedLicense();
    const before = await readLicense();
    const bad = licensePayload({ expiresAt: 'never', issuedAt: new Date().toISOString() });
    supervisorRespondsOk({ ...bad, signature: signWith(trustedKeys.privateKey, bad) });
    await runCheck();
    await expectUnchanged(before);
  });

  test('signed license whose modules is not an array', async () => {
    await seedLicense();
    const before = await readLicense();
    const bad = licensePayload({ modules: 'patients', issuedAt: new Date().toISOString() });
    supervisorRespondsOk({ ...bad, signature: signWith(trustedKeys.privateKey, bad) });
    await runCheck();
    await expectUnchanged(before);
  });
});
