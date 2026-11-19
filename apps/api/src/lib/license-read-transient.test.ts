import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { chmod, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';

// FX-161 (LC-40) — `.lic`ni vaqtincha o'qib bo'lmasligi (fayl band/ruxsat,
// yarim yozilgan fayl) «litsenziya yo'q» (403 LICENSE_NOT_FOUND → web
// `/activate`ga qattiq redirect) bilan bir xil ko'rinmasligi kerak.
// Real fayl tizimi bilan (fs mock'siz): faqat apparat (`systeminformation`)
// va Supervisor ochiq kaliti almashtiriladi — license.test.ts bilan bir xil.

const tmpDir = await mkdtemp(join(tmpdir(), 'license-transient-test-'));
process.env.LICENSE_PATH = join(tmpDir, 'license.lic');
process.env.LICENSE_ANCHOR_PATH = join(tmpDir, 'license-anchor.dat');

afterAll(async () => {
  await chmod(process.env.LICENSE_PATH as string, 0o600).catch(() => {});
  await rm(tmpDir, { recursive: true, force: true });
});

mock.module('systeminformation', () => {
  const cpu = async () => ({ physicalCores: 4, manufacturer: 'Intel', brand: 'i5' });
  const system = async () => ({ uuid: 'test-uuid-1234', serial: 'SN123456' });
  const networkInterfaces = async () => [];
  return { default: { cpu, system, networkInterfaces }, cpu, system, networkInterfaces };
});

const keypair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
mock.module('@dental/core/supervisor-public-key', () => ({
  SUPERVISOR_PUBLIC_KEY_PEM: keypair.publicKey,
}));

const license = await import('./license');
const { requireModule, requireValidLicenseInDesktop } = await import('./license-middleware');

const sign = (data: object): string => {
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  const s = createSign('SHA256');
  s.update(canonical);
  return s.sign(keypair.privateKey, 'hex');
};

const validLicense = async () => {
  license.resetFingerprintCache();
  const unsigned = {
    licenseKey: 'KEY-161',
    clinicId: 'clinic-161',
    modules: ['*'],
    expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
    gracePeriodDays: 7,
    issuedAt: new Date().toISOString(),
    fingerprint: await license.getFingerprint(),
  };
  return { ...unsigned, signature: sign(unsigned) };
};

const buildApp = () => {
  const app = new Hono();
  app.use('/api/*', requireValidLicenseInDesktop());
  app.use('/api/patients/*', requireModule('patients'));
  app.all('*', (c) => c.json({ ok: true }));
  return app;
};

const licPath = () => process.env.LICENSE_PATH as string;

describe("FX-161 — vaqtinchalik .lic o'qish xatosi", () => {
  const prevDesktop = process.env.DENTAL_LOCAL_DESKTOP;

  beforeEach(async () => {
    process.env.DENTAL_LOCAL_DESKTOP = 'true';
    license.resetAnchorGateRef();
    await chmod(licPath(), 0o600).catch(() => {});
    await rm(licPath(), { force: true });
  });

  afterEach(async () => {
    await chmod(licPath(), 0o600).catch(() => {});
    if (prevDesktop === undefined) delete process.env.DENTAL_LOCAL_DESKTOP;
    else process.env.DENTAL_LOCAL_DESKTOP = prevDesktop;
  });

  test("yaroqli .lic — gate o'tkazadi", async () => {
    await license.writeLicense(await validLicense());
    const res = await buildApp().request('/api/patients/x');
    expect(res.status).toBe(200);
  });

  test("fayl haqiqatan yo'q (ENOENT) — 403 LICENSE_NOT_FOUND saqlanadi", async () => {
    const res = await buildApp().request('/api/stock');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });

  test("fayl bor, lekin o'qib bo'lmaydi (EACCES) — 503 LICENSE_UNAVAILABLE, /activate emas", async () => {
    if (process.getuid?.() === 0) return; // root chmod'ni chetlab o'tadi
    await license.writeLicense(await validLicense());
    await chmod(licPath(), 0o000);

    const app = buildApp();
    for (const path of ['/api/stock', '/api/patients/x']) {
      const res = await app.request(path);
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('LICENSE_UNAVAILABLE');
    }
  });

  test("modul gate'i ham o'qish xatosini LICENSE_NOT_FOUND deb ko'rsatmaydi", async () => {
    if (process.getuid?.() === 0) return;
    await license.writeLicense(await validLicense());
    await chmod(licPath(), 0o000);

    const app = new Hono();
    app.use('/api/patients/*', requireModule('patients'));
    app.all('*', (c) => c.json({ ok: true }));
    const res = await app.request('/api/patients/x');
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('LICENSE_UNAVAILABLE');
  });

  test("buzilgan (decrypt bo'lmaydigan) .lic — LICENSE_NOT_FOUND (qayta aktivatsiya yo'li)", async () => {
    await writeFile(licPath(), Buffer.from('not-a-valid-encrypted-license').toString('base64'));
    const res = await buildApp().request('/api/stock');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });

  // Review (FX-161): `writeFile` joyida truncate+write qilardi — heartbeat yoki
  // recheck `.lic`ni qayta yozayotganda parallel so'rov bo'sh/yarim faylni
  // o'qib `invalid` → 403 LICENSE_NOT_FOUND → `/activate` redirect olardi.
  // Endi tmp fayl + rename: o'quvchi har doim eski YOKI yangi to'liq faylni ko'radi.
  test('writeLicense faylni joyida qayta yozmaydi — tmp + rename (yangi inode), tmp qolmaydi', async () => {
    const lic = await validLicense();
    await license.writeLicense(lic);
    const before = await stat(licPath());
    await license.writeLicense(lic);
    const after = await stat(licPath());
    expect(after.ino).not.toBe(before.ino);
    const leftovers = (await readdir(tmpDir)).filter((f) => f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
    const r = await license.readLicenseResult();
    expect(r.kind).toBe('ok');
  });

  test('writeAnchor ham atomik — tmp + rename (yangi inode)', async () => {
    await license.writeAnchor(1_000);
    const anchorPath = process.env.LICENSE_ANCHOR_PATH as string;
    const before = await stat(anchorPath);
    await license.writeAnchor(2_000);
    const after = await stat(anchorPath);
    expect(after.ino).not.toBe(before.ino);
    expect(await license.readAnchor()).toBe(2_000);
    const leftovers = (await readdir(tmpDir)).filter((f) => f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  test("parallel qayta yozish paytida o'quvchi hech qachon invalid/missing ko'rmaydi", async () => {
    const lic = await validLicense();
    await license.writeLicense(lic);
    let stop = false;
    const writer = (async () => {
      while (!stop) await license.writeLicense(lic);
    })();
    const kinds = new Map<string, number>();
    for (let i = 0; i < 3000; i++) {
      const r = await license.readLicenseResult();
      kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
    }
    stop = true;
    await writer;
    expect([...kinds.keys()]).toEqual(['ok']);
  });
});
