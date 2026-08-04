/**
 * Task 8 — `POST /api/activate` provisioning (REAL DB + REAL `.lic` fayl).
 *
 * Uchta kritik invariant qulflanadi:
 *
 *  1. **Bog'lash (binding).** Imzo tekshiruvi O'ZI YETARLI EMAS: boshqa
 *     klinikaning HAQIQIY vendor-imzolangan bloki ham imzo tekshiruvidan
 *     o'tadi (Supervisor VM hozircha IP/HTTP orqali ishlaydi — MITM real
 *     tahdid). Blok aynan shu aktivatsiyaga tegishli ekani majburlanadi:
 *     `licenseKey` (foydalanuvchi KIRITGAN kalit bilan ham), `clinicId`,
 *     `issuedAt`. Mos kelmasa 403 va `.lic` YOZILMAYDI.
 *  2. **`.lic` faylga aynan `LicenseData` maydonlari.** `isLicenseValid`
 *     `{ signature, ...payload }` qiladi — faylga tushgan har qanday
 *     qo'shimcha maydon imzo tekshiruvini buzadi. Shuning uchun Supervisor
 *     javobi ATAYIN "junk" maydon bilan qaytariladi: agar biror kun
 *     `writeLicense(data)` deb butun javob uzatilsa, bu test qizil bo'ladi.
 *  3. **Idempotentlik.** Lokal bazada tenant bo'lsa provisioning sokin
 *     o'tkaziladi va owner paroli HECH QACHON qayta yozilmaydi — aks holda
 *     litsenziya kalitiga ega har kim owner hisobini egallardi.
 *
 * Supervisor `globalThis.fetch` darajasida mock qilinadi (license-client emas)
 * — shunda haqiqiy `activateLicense` + `markProvisioned` kodi ishlaydi.
 *
 * Talab: Postgres (5433) + Redis (rate-limit; fail-open, lekin ulanish
 * yopiladi). Ishga tushirish:
 *   cd apps/api && bun test --env-file=../../.env tests/integration/provisioning-activate.test.ts
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditLog, branches, roles, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Database } from '../../src/db/client.ts';

const tmpDir = await mkdtemp(join(tmpdir(), 'provisioning-activate-'));
process.env.LICENSE_PATH = join(tmpDir, 'license.lic');
process.env.LICENSE_ANCHOR_PATH = join(tmpDir, 'license-anchor.dat');

// systeminformation — `../../src/lib/license.ts` dinamik import'idan OLDIN
// mock qilinadi (bun `mock.module` oldindan ro'yxatdan o'tishi shart;
// cli-387-license-heartbeat.test.ts naqshi).
mock.module('systeminformation', () => {
  const cpu = async () => ({ manufacturer: 'Intel', brand: 'i7' });
  const system = async () => ({ uuid: 'task8-uuid', serial: 'task8-serial' });
  const networkInterfaces = async () => [
    { iface: 'eth0', mac: 'aa:bb:cc:dd:ee:01', default: true },
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

/** Supervisor `signLicense` bilan bir xil kanonik shakl (tekis payload). */
const signForTest = (data: object): string => {
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  const sign = createSign('SHA256');
  sign.update(canonical);
  return sign.sign(testKeypair.privateKey, 'hex');
};

const { db } = await import('../../src/db/client.ts');
const { getFingerprint, isLicenseValid, readLicense } = await import('../../src/lib/license.ts');
const { verifyPassword } = await import('../../src/lib/password.ts');
const { activateRoutes } = await import('../../src/routes/activate.ts');
const { closeRateLimitRedis } = await import('../../src/lib/rate-limit.ts');

const localFingerprint = await getFingerprint();

const LICENSE_KEY = 'PROV1-PROV2-PROV3-PROV4';
const CLINIC_ID = 'clinic-task8';
const OWNER_PASSWORD = 'VendorParol12345';
const licensePath = join(tmpDir, 'license.lic');

type ProvisioningBlock = {
  licenseKey: string;
  clinicId: string;
  issuedAt: string;
  tenantName: string;
  defaultLanguage: string;
  ownerFullName: string;
  ownerPhone: string;
  ownerPassword: string;
  branchName: string;
  branchAddress: string;
  branchPhone: string;
};

const buildProvisioning = (
  issuedAt: string,
  overrides: Partial<ProvisioningBlock> = {},
): ProvisioningBlock => ({
  licenseKey: LICENSE_KEY,
  clinicId: CLINIC_ID,
  issuedAt,
  tenantName: 'Vendor klinikasi',
  defaultLanguage: 'uz',
  ownerFullName: 'Ali Valiyev',
  ownerPhone: '+998901234567',
  ownerPassword: OWNER_PASSWORD,
  branchName: 'Chilonzor filiali',
  branchAddress: 'Toshkent, Chilonzor 12',
  branchPhone: '+998712001122',
  ...overrides,
});

type ResponseOptions = {
  /** Provisioning bloki umuman qaytarilmaydi (klinika allaqachon provision qilingan). */
  omitProvisioning?: boolean;
  /** Imzo buziladi (yoki umuman berilmaydi). */
  signature?: 'valid' | 'broken' | 'missing';
  /** Blok maydonlarini almashtirish (bog'lash testlari). */
  provisioning?: Partial<ProvisioningBlock>;
  /** Litsenziya payload'i maydonlarini almashtirish (MITM ssenariysi). */
  license?: Partial<{ licenseKey: string; clinicId: string }>;
};

const buildSupervisorResponse = (opts: ResponseOptions = {}): Record<string, unknown> => {
  const issuedAt = new Date().toISOString();
  const payload = {
    licenseKey: opts.license?.licenseKey ?? LICENSE_KEY,
    clinicId: opts.license?.clinicId ?? CLINIC_ID,
    modules: ['patients', 'appointments'],
    expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
    gracePeriodDays: 30,
    issuedAt,
    fingerprint: localFingerprint,
  };
  // ⚠️ ATAYIN qo'shimcha maydon: `.lic`ka butun javob yozilsa imzo tekshiruvi
  // buziladi va `.lic`-haqiqiylik testi qizil bo'ladi (regressiya qulfi).
  const base: Record<string, unknown> = {
    ...payload,
    signature: signForTest(payload),
    serverTime: 'junk-field-must-not-reach-lic',
  };
  if (opts.omitProvisioning) return base;

  const provisioning = buildProvisioning(issuedAt, opts.provisioning);
  base.provisioning = provisioning;
  if (opts.signature === 'missing') return base;
  base.provisioningSignature = opts.signature === 'broken' ? 'deadbeef' : signForTest(provisioning);
  return base;
};

// ─── Supervisor fetch mock ────────────────────────────────────────────────
const originalFetch = globalThis.fetch;
let supervisorResponse: Record<string, unknown> = buildSupervisorResponse();
let provisionedCalls: Array<{ licenseKey?: string }> = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const jsonRes = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  if (url.endsWith('/v1/activate')) return jsonRes(supervisorResponse);
  if (url.endsWith('/v1/provisioned')) {
    provisionedCalls.push(JSON.parse(String(init?.body ?? '{}')));
    return jsonRes({ ok: true });
  }
  return jsonRes({ error: { code: 'UNEXPECTED_SUPERVISOR_CALL' } }, 500);
}) as unknown as typeof fetch;

const app = new Hono();
app.route('/api/activate', activateRoutes({ db: db as Database }));

/** Har so'rov boshqa IP'dan — rate-limit oynasi testlarni bloklamasin. */
const activate = (licenseKey: string = LICENSE_KEY) =>
  app.request('/api/activate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.231.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250 + 1)}`,
    },
    body: JSON.stringify({ licenseKey }),
  });

const truncate = () => db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

const scoped = <T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
    return await fn(tx);
  });

beforeEach(async () => {
  await truncate();
  // `.lic` har testda toza — aks holda oldingi testning haqiqiy fayli
  // "yozilmadi" tasdiqlarini yolg'on yashil qiladi.
  await rm(licensePath, { force: true });
  provisionedCalls = [];
  supervisorResponse = buildSupervisorResponse();
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await truncate();
  await closeRateLimitRedis();
  await rm(tmpDir, { recursive: true, force: true });
});

describe('aktivatsiya provisioning — muvaffaqiyatli yo‘l', () => {
  test('tenant, owner, filial va rol shablonlarini yaratadi', async () => {
    const res = await activate();
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      success: boolean;
      data: { modules: string[]; expiresAt: string; ownerPhone?: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.modules).toEqual(['patients', 'appointments']);
    expect(body.data.ownerPhone).toBe('+998901234567');
    // Parol javobda HECH QACHON qaytarilmaydi
    expect(JSON.stringify(body)).not.toContain(OWNER_PASSWORD);
    expect(JSON.stringify(body)).not.toContain('ownerPassword');

    const [user] = await db.select().from(users).where(eq(users.phone, '+998901234567'));
    expect(user).toBeDefined();
    expect(user?.fullName).toBe('Ali Valiyev');
    expect(await verifyPassword(OWNER_PASSWORD, user?.passwordHash ?? '')).toBe(true);

    const tenantRows = await db.select().from(tenants);
    expect(tenantRows.length).toBe(1);
    expect(tenantRows[0]?.name).toBe('Vendor klinikasi');
    expect(tenantRows[0]?.ownerUserId).toBe(user?.id ?? '');

    const tenantId = tenantRows[0]?.id ?? '';
    const branchRows = await scoped(tenantId, (tx) =>
      tx.select().from(branches).where(eq(branches.tenantId, tenantId)),
    );
    expect(branchRows.length).toBe(1);
    expect(branchRows[0]?.name).toBe('Chilonzor filiali');
    expect(branchRows[0]?.address).toBe('Toshkent, Chilonzor 12');

    // 🔴 Rol shablonlari hech qachon chetlab o'tilmaydi (RBAC gap sinfi)
    const roleRows = await scoped(tenantId, (tx) =>
      tx.select().from(roles).where(eq(roles.tenantId, tenantId)),
    );
    expect(roleRows.length).toBe(8);

    const auditRows = await scoped(tenantId, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.tenantId, tenantId)),
    );
    expect(auditRows.some((r) => r.action === 'tenant.provisioned')).toBe(true);
    expect(JSON.stringify(auditRows)).not.toContain(OWNER_PASSWORD);
  });

  test('Supervisor’ga provisioning tasdig‘i yuboriladi (markProvisioned)', async () => {
    await activate();
    expect(provisionedCalls.length).toBe(1);
    expect(provisionedCalls[0]?.licenseKey).toBe(LICENSE_KEY);
  });

  test('yozilgan `.lic` haqiqiy qoladi va parolni saqlamaydi', async () => {
    await activate();

    const lic = await readLicense();
    expect(lic).not.toBeNull();
    expect(isLicenseValid(lic as NonNullable<typeof lic>, localFingerprint)).toBe(true);

    const raw = JSON.stringify(lic);
    expect(raw).not.toContain('ownerPassword');
    expect(raw).not.toContain(OWNER_PASSWORD);
    // Supervisor javobidagi begona maydon faylga tushmagan
    expect(raw).not.toContain('junk-field-must-not-reach-lic');
  });

  test('owner telefoni kanonik shaklga keltiriladi (javob = bazadagi login)', async () => {
    supervisorResponse = buildSupervisorResponse({ provisioning: { ownerPhone: '901234567' } });

    const res = await activate();
    const body = (await res.json()) as { data: { ownerPhone?: string } };
    expect(body.data.ownerPhone).toBe('+998901234567');

    const [user] = await db.select().from(users);
    expect(user?.phone).toBe('+998901234567');
  });
});

describe('aktivatsiya provisioning — imzo va bog‘lash tekshiruvi', () => {
  const expectRejected = async (res: Response, code: string) => {
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe(code);
    // Hech qanday yon ta'sir: tenant ham, `.lic` ham yo'q
    expect((await db.select().from(tenants)).length).toBe(0);
    expect(await readLicense()).toBeNull();
  };

  test('buzilgan imzo → 403 PROVISIONING_SIGNATURE_INVALID', async () => {
    supervisorResponse = buildSupervisorResponse({ signature: 'broken' });
    await expectRejected(await activate(), 'PROVISIONING_SIGNATURE_INVALID');
  });

  test('imzo umuman berilmasa → 403 PROVISIONING_SIGNATURE_INVALID', async () => {
    supervisorResponse = buildSupervisorResponse({ signature: 'missing' });
    await expectRejected(await activate(), 'PROVISIONING_SIGNATURE_INVALID');
  });

  test('boshqa klinikaning HAQIQIY imzolangan bloki → 403 PROVISIONING_MISMATCH', async () => {
    // MITM butun javobni almashtiradi: blok ham, litsenziya payload'i ham
    // "boshqa" kalitga tegishli va imzolar TO'G'RI. Yagona ishonchli langar —
    // foydalanuvchi KIRITGAN kalit.
    supervisorResponse = buildSupervisorResponse({
      license: { licenseKey: 'BOSHQ-BOSHQ-BOSHQ-BOSHQ' },
      provisioning: { licenseKey: 'BOSHQ-BOSHQ-BOSHQ-BOSHQ' },
    });
    await expectRejected(await activate(LICENSE_KEY), 'PROVISIONING_MISMATCH');
  });

  test('blok kaliti litsenziya kalitiga mos kelmasa → 403 PROVISIONING_MISMATCH', async () => {
    supervisorResponse = buildSupervisorResponse({
      provisioning: { licenseKey: 'BOSHQ-BOSHQ-BOSHQ-BOSHQ' },
    });
    await expectRejected(await activate(), 'PROVISIONING_MISMATCH');
  });

  test('clinicId mos kelmasa → 403 PROVISIONING_MISMATCH', async () => {
    supervisorResponse = buildSupervisorResponse({ provisioning: { clinicId: 'boshqa-klinika' } });
    await expectRejected(await activate(), 'PROVISIONING_MISMATCH');
  });

  test('eski issuedAt bilan qayta uzatilgan blok → 403 PROVISIONING_MISMATCH', async () => {
    supervisorResponse = buildSupervisorResponse({
      provisioning: { issuedAt: new Date(Date.now() - 86400000).toISOString() },
    });
    await expectRejected(await activate(), 'PROVISIONING_MISMATCH');
  });
});

describe('aktivatsiya provisioning — idempotentlik', () => {
  test('takroriy aktivatsiya owner parolini QAYTA YOZMAYDI', async () => {
    await activate();
    const [before] = await db.select().from(users).where(eq(users.phone, '+998901234567'));
    expect(before).toBeDefined();

    // Ikkinchi javobda vendor boshqa parol yuboradi — u qo'llanmasligi shart.
    supervisorResponse = buildSupervisorResponse({
      provisioning: { ownerPassword: 'BoshqaParol99999' },
    });
    const res = await activate();
    expect(res.status).toBe(200);

    const [after] = await db.select().from(users).where(eq(users.phone, '+998901234567'));
    expect(after?.passwordHash).toBe(before?.passwordHash ?? '');
    expect(await verifyPassword(OWNER_PASSWORD, after?.passwordHash ?? '')).toBe(true);
    expect(await verifyPassword('BoshqaParol99999', after?.passwordHash ?? '')).toBe(false);

    // Ikkinchi tenant/foydalanuvchi yaratilmaydi
    expect((await db.select().from(tenants)).length).toBe(1);
    expect((await db.select().from(users)).length).toBe(1);

    // `.lic` baribir yoziladi (litsenziya yangilanishi to'sib qo'yilmaydi)
    const lic = await readLicense();
    expect(lic).not.toBeNull();
    expect(isLicenseValid(lic as NonNullable<typeof lic>, localFingerprint)).toBe(true);
  });
});

describe('aktivatsiya provisioning — blok qaytarilmasa', () => {
  test('provisioning yo‘q → tenant yaratilmaydi, `.lic` yoziladi', async () => {
    supervisorResponse = buildSupervisorResponse({ omitProvisioning: true });

    const res = await activate();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { ownerPhone?: string } };
    expect(body.data.ownerPhone).toBeUndefined();

    expect((await db.select().from(tenants)).length).toBe(0);
    expect(provisionedCalls.length).toBe(0);

    const lic = await readLicense();
    expect(lic).not.toBeNull();
    expect(isLicenseValid(lic as NonNullable<typeof lic>, localFingerprint)).toBe(true);
  });
});
