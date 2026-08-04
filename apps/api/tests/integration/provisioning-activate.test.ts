/**
 * Task 8 — `POST /api/activate` provisioning (REAL DB).
 *
 * Uchta kritik invariant qulflanadi:
 *
 *  1. **Bog'lash (binding).** Imzo tekshiruvi O'ZI YETARLI EMAS: boshqa
 *     klinikaning HAQIQIY vendor-imzolangan bloki ham imzo tekshiruvidan
 *     o'tadi (Supervisor VM hozircha IP/HTTP orqali ishlaydi — MITM real
 *     tahdid). Blok aynan shu aktivatsiyaga tegishli ekani majburlanadi:
 *     `licenseKey` (foydalanuvchi KIRITGAN kalit bilan ham), `clinicId`,
 *     `issuedAt`. Mos kelmasa 403 va `.lic` YOZILMAYDI.
 *  2. **`.lic`ka aynan `LicenseData` maydonlari.** `isLicenseValid`
 *     `{ signature, ...payload }` qiladi — faylga tushgan har qanday
 *     qo'shimcha maydon imzo tekshiruvini buzadi. Shuning uchun Supervisor
 *     javobi ATAYIN "junk" maydon bilan qaytariladi: agar biror kun
 *     `writeLicense(data)` deb butun javob uzatilsa, bu test qizil bo'ladi.
 *  3. **Idempotentlik.** Lokal bazada tenant bo'lsa provisioning sokin
 *     o'tkaziladi va owner paroli HECH QACHON qayta yozilmaydi — aks holda
 *     litsenziya kalitiga ega har kim owner hisobini egallardi.
 *
 * Supervisor klienti va `.lic` yozuvchisi `activateRoutes`ga PARAMETR sifatida
 * beriladi (global mock EMAS — pastdagi izohga qarang).
 *
 * Talab: Postgres (5433) + Redis (rate-limit; fail-open, lekin ulanish
 * yopiladi). Ishga tushirish:
 *   cd apps/api && bun test --env-file=../../.env tests/integration/provisioning-activate.test.ts
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { verifyLicenseSignature } from '@dental/core/license-signature';
import { auditLog, branches, roles, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../../src/db/client.ts';
import { verifyPassword } from '../../src/lib/password.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { activateRoutes } from '../../src/routes/activate.ts';

// ⚠️ Bu fayl ATAYIN NA `mock.module`, NA `globalThis.fetch` almashtirishini
// ishlatadi — hech qanday global holat. Sabab: `bun test` butun katalogni
// BITTA jarayonda ishga tushiradi va `mock.module` RESOLVED PATH bo'yicha
// GLOBAL. Isbotlangan ikki tomonlama zarar (to'liq `tests/integration/`
// yugurishi):
//   · `cli-370-...test.ts` `license-client.ts`ni butun jarayon uchun
//     almashtiradi → bu faylning Supervisor mock'i jim chetlab o'tilardi va
//     12 test ham yiqilardi;
//   · bu faylning `license.ts` importi/mock'i esa `cli-387-...test.ts`ni
//     buzardi (o'sha CLI-437 "anchor fayl izolyatsiyasi" sinfi).
// Yechim — `activateRoutes`ga DI: Supervisor klienti va `.lic` yozuvchisi
// parametr sifatida beriladi (`reset-owner-password.ts` pretsedenti).
// `.lic` fayli DISKKA umuman yozilmaydi: `writeLicense`ga uzatilgan obyekt
// ushlanadi — invariant #2 uchun aynan shu muhim.
const testKeypair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

/** Supervisor `signLicense` bilan bir xil kanonik shakl (tekis payload). */
const signForTest = (data: object): string => {
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  const sign = createSign('SHA256');
  sign.update(canonical);
  return sign.sign(testKeypair.privateKey, 'hex');
};

/** Supervisor imzolagan payload'dagi fingerprint (haqiqiy `getFingerprint` shart emas). */
const FINGERPRINT = 'a'.repeat(64);

const LICENSE_KEY = 'PROV1-PROV2-PROV3-PROV4';
const CLINIC_ID = 'clinic-task8';
const OWNER_PASSWORD = 'VendorParol12345';

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
    fingerprint: FINGERPRINT,
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

// ─── Soxta Supervisor klienti (global mock EMAS — DI) ─────────────────────
let supervisorResponse: Record<string, unknown> = buildSupervisorResponse();
let provisionedCalls: string[] = [];
/** `.lic`ka yozilishi kerak bo'lgan obyektlar — invariant #2 shu yerda qulflanadi. */
let writtenLicenses: Array<Record<string, unknown>> = [];

const app = new Hono();
app.route(
  '/api/activate',
  activateRoutes({
    db,
    supervisorPublicKeyPem: testKeypair.publicKey,
    activate: async () => supervisorResponse as never,
    markProvisioned: async (licenseKey: string) => {
      provisionedCalls.push(licenseKey);
    },
    writeLicense: async (data) => {
      writtenLicenses.push(data as unknown as Record<string, unknown>);
    },
  }),
);

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

/**
 * Bazani tozalash — `TRUNCATE ... CASCADE` EMAS, ataylab `DELETE`.
 *
 * Bu fayl har testda toza baza talab qiladi (`tenants` soni 0/1 bo'yicha
 * assert'lar), ya'ni reset `beforeEach`da 12 marta ishlaydi. `TRUNCATE users,
 * tenants RESTART IDENTITY CASCADE` ~50 ta jadvalga cascade bo'ladi va har
 * chaqiruvda yangi relfilenode yaratadi — o'lchangan natija: dastlab ~660ms,
 * bir necha yugurishdan keyin katalog shishishi tufayli 3–5s ga chiqadi va
 * `bun test`ning 5s hook timeout'iga urилиб fayl TASODIFAN qizil bo'ladi
 * (3/6 yugurishda kuzatilgan). `DELETE` esa FK ON DELETE CASCADE orqali xuddi
 * shu qatorlarni tozalaydi (branches/roles/role_permissions/audit_log — 0 ga
 * tushishi tekshirilgan), lekin ~10ms turadi va sekinlashmaydi.
 *
 * Tartib muhim: `tenants.owner_user_id` → `users` FK'si RESTRICT, shuning
 * uchun avval `tenants`, keyin `users`.
 */
const truncate = async () => {
  await db.execute(sql`DELETE FROM tenants`);
  await db.execute(sql`DELETE FROM users`);
};

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
  provisionedCalls = [];
  writtenLicenses = [];
  supervisorResponse = buildSupervisorResponse();
});

afterAll(async () => {
  await truncate();
  await closeRateLimitRedis();
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
    expect(provisionedCalls[0]).toBe(LICENSE_KEY);
  });

  test('`.lic`ka AYNAN `LicenseData` maydonlari uzatiladi', async () => {
    await activate();

    expect(writtenLicenses).toHaveLength(1);
    const lic = writtenLicenses[0] as Record<string, unknown>;

    // 🔴 Invariant #2 o'zagi: `isLicenseValid` `{ signature, ...payload }`
    // qiladi — faylga tushgan HAR QANDAY ortiqcha maydon imzo tekshiruvini
    // buzadi. Kalitlar to'plamini AYNAN qulflash shu invariantni tekshiradi.
    expect(Object.keys(lic).sort()).toEqual(
      [
        'clinicId',
        'expiresAt',
        'fingerprint',
        'gracePeriodDays',
        'issuedAt',
        'licenseKey',
        'modules',
        'signature',
      ].sort(),
    );
    expect(lic.licenseKey).toBe(LICENSE_KEY);
    expect(lic.clinicId).toBe(CLINIC_ID);
    expect(lic.fingerprint).toBe(FINGERPRINT);
    expect(lic.signature).toBe(supervisorResponse.signature);

    // 🔴 Kalitlar to'plami YETARLI EMAS: buzilgan QIYMAT (masalan `modules`
    // qayta tartiblansa yoki `issuedAt` qayta stringify qilinsa) kalitlarni
    // o'zgartirmaydi, lekin `.lic` o'qilganda imzo tekshiruvi yiqiladi —
    // klinika "litsenziya yaroqsiz" holatida qulflanib qolardi. Shuning uchun
    // yozilgan obyekt `isLicenseValid` bilan AYNAN bir xil usulda
    // (`{ signature, ...payload }`) tekshiriladi.
    const { signature, ...payload } = lic as { signature: string } & Record<string, unknown>;
    expect(verifyLicenseSignature(payload, signature, testKeypair.publicKey)).toBe(true);

    const raw = JSON.stringify(lic);
    expect(raw).not.toContain('ownerPassword');
    expect(raw).not.toContain(OWNER_PASSWORD);
    // Supervisor javobidagi begona maydonlar uzatilmagan
    expect(raw).not.toContain('junk-field-must-not-reach-lic');
    expect(raw).not.toContain('provisioning');
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
    expect(writtenLicenses).toHaveLength(0);
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

  test('litsenziya payloadi boshqa kalitga tegishli bo‘lsa → 403 PROVISIONING_MISMATCH', async () => {
    // Blok foydalanuvchi kiritgan kalitga MOS (1-band o'tadi), lekin Supervisor
    // javobidagi litsenziya payloadi boshqa kalitniki — `.lic`ka begona
    // litsenziya yozilardi. Buni FAQAT
    // `provisioning.licenseKey !== licensePayload.licenseKey` bandi ushlaydi.
    supervisorResponse = buildSupervisorResponse({
      license: { licenseKey: 'BOSHQ-BOSHQ-BOSHQ-BOSHQ' },
    });
    await expectRejected(await activate(LICENSE_KEY), 'PROVISIONING_MISMATCH');
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

    // 🔴 Provisioning o'tkazib yuborilgan bo'lsa `ownerPhone` QAYTARILMAYDI:
    // aks holda mijoz o'zi `/register-tenant` orqali boshqa telefon bilan
    // ro'yxatdan o'tgan holatda aktivatsiya sahifasi (Task 10) lokal bazada
    // MAVJUD BO'LMAGAN vendor telefonini "login" deb ko'rsatardi.
    const skipBody = (await res.json()) as { data: { ownerPhone?: string } };
    expect(skipBody.data.ownerPhone).toBeUndefined();

    const [after] = await db.select().from(users).where(eq(users.phone, '+998901234567'));
    expect(after?.passwordHash).toBe(before?.passwordHash ?? '');
    expect(await verifyPassword(OWNER_PASSWORD, after?.passwordHash ?? '')).toBe(true);
    expect(await verifyPassword('BoshqaParol99999', after?.passwordHash ?? '')).toBe(false);

    // Ikkinchi tenant/foydalanuvchi yaratilmaydi
    expect((await db.select().from(tenants)).length).toBe(1);
    expect((await db.select().from(users)).length).toBe(1);

    // Provisioning o'tkazib yuborilgan bo'lsa ham `.lic` baribir yoziladi —
    // litsenziya yangilanishi bloklanmaydi (ikki aktivatsiya = ikki yozuv).
    expect(writtenLicenses).toHaveLength(2);
    expect(writtenLicenses[1]?.licenseKey).toBe(LICENSE_KEY);
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

    expect(writtenLicenses).toHaveLength(1);
    expect(writtenLicenses[0]?.licenseKey).toBe(LICENSE_KEY);
  });
});
