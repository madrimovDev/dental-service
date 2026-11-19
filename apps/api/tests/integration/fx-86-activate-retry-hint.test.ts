/**
 * FX-86 — aktivatsiyada tenant yaratilib `.lic` yozilmay qolsa (REAL DB).
 *
 * Ssenariy: birinchi `POST /api/activate` provisioning'ni qo'llaydi (tenant +
 * owner vendor bergan vaqtinchalik parol bilan), lekin `.lic` yozish yiqiladi
 * → 500 `LICENSE_WRITE_FAILED`. Mijoz qayta urinadi: tenant allaqachon bor →
 * idempotent skip.
 *
 * Bug: skip javobida `provisioned: false` qaytardi → web «Avvalgi parolingiz
 * o'zgarmadi» deb ko'rsatardi, holbuki mijozning «avvalgi» paroli yo'q — amal
 * qiladigan yagona parol vendor bergan vaqtinchalik parol. Supervisor'ga ham
 * `applied:false` ketardi (qo'llangan parol Supervisor'da qolib ketardi).
 *
 * Tuzatish: skip holatida owner'ning joriy paroli vendor blokidagi parolga mos
 * kelsa (vendor kredensiallari amalda) — `provisioned: true` (login_hint) va
 * Supervisor'ga `applied:true`. Mos kelmasa (owner o'z parolini qo'ygan yoki
 * blokda boshqa parol) — avvalgidek `false`.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-86-activate-retry-hint.test.ts`
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../../src/db/client.ts';
import { hashPassword, verifyPassword } from '../../src/lib/password.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { activateRoutes } from '../../src/routes/activate.ts';

const testKeypair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const signForTest = (data: object): string => {
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  const sign = createSign('SHA256');
  sign.update(canonical);
  return sign.sign(testKeypair.privateKey, 'hex');
};

const LICENSE_KEY = 'FX86A-FX86B-FX86C-FX86D';
const CLINIC_ID = 'clinic-fx86';
const VENDOR_PASSWORD = 'VendorParolFx86!';
const OWNER_PHONE = '+998900086001';

const buildSupervisorResponse = (ownerPassword = VENDOR_PASSWORD): Record<string, unknown> => {
  const issuedAt = new Date().toISOString();
  const payload = {
    licenseKey: LICENSE_KEY,
    clinicId: CLINIC_ID,
    modules: ['patients'],
    expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
    gracePeriodDays: 7,
    issuedAt,
    fingerprint: 'b'.repeat(64),
  };
  const provisioning = {
    licenseKey: LICENSE_KEY,
    clinicId: CLINIC_ID,
    issuedAt,
    tenantName: 'FX-86 klinikasi',
    defaultLanguage: 'uz',
    ownerFullName: 'FX86 Egasi',
    ownerPhone: OWNER_PHONE,
    ownerPassword,
    branchName: 'Asosiy',
    branchAddress: '',
    branchPhone: '',
  };
  return {
    ...payload,
    signature: signForTest(payload),
    provisioning,
    provisioningSignature: signForTest(provisioning),
  };
};

let supervisorResponse = buildSupervisorResponse();
let provisionedCalls: Array<{ applied: boolean }> = [];
let failLicenseWrite = false;
let writtenLicenses = 0;

const app = new Hono();
app.route(
  '/api/activate',
  activateRoutes({
    db,
    supervisorPublicKeyPem: testKeypair.publicKey,
    activate: async () => supervisorResponse as never,
    markProvisioned: async (_licenseKey: string, applied: boolean) => {
      provisionedCalls.push({ applied });
    },
    writeLicense: async () => {
      if (failLicenseWrite) throw new Error('EACCES: disk');
      writtenLicenses++;
    },
  }),
);

const activate = () =>
  app.request('/api/activate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.186.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250 + 1)}`,
    },
    body: JSON.stringify({ licenseKey: LICENSE_KEY }),
  });

const truncate = async () => {
  await db.execute(sql`DELETE FROM tenants`);
  await db.execute(sql`DELETE FROM users`);
};

beforeEach(async () => {
  await truncate();
  supervisorResponse = buildSupervisorResponse();
  provisionedCalls = [];
  failLicenseWrite = false;
  writtenLicenses = 0;
});

afterAll(async () => {
  await truncate();
  await closeRateLimitRedis();
});

describe('FX-86 activation retry after .lic write failure', () => {
  test('qayta urinish vendor parolini maslahat qiladi (provisioned:true) va Supervisor’ga applied:true', async () => {
    failLicenseWrite = true;
    const first = await activate();
    expect(first.status).toBe(500);
    const firstBody = (await first.json()) as { error?: { code: string } };
    expect(firstBody.error?.code).toBe('LICENSE_WRITE_FAILED');
    // Tenant yaratildi, lekin Supervisor'ga hali hech narsa bildirilmadi.
    expect((await db.select().from(tenants)).length).toBe(1);
    expect(provisionedCalls.length).toBe(0);

    failLicenseWrite = false;
    const retry = await activate();
    expect(retry.status).toBe(200);
    const body = (await retry.json()) as {
      data: { provisioned?: boolean; ownerPhone?: string };
    };
    // Amal qiladigan yagona parol — vendor bergan vaqtinchalik parol.
    const [owner] = await db.select().from(users).where(eq(users.phone, OWNER_PHONE));
    expect(await verifyPassword(VENDOR_PASSWORD, owner?.passwordHash ?? '')).toBe(true);
    expect(body.data.ownerPhone).toBe(OWNER_PHONE);
    expect(body.data.provisioned).toBe(true);
    expect(writtenLicenses).toBe(1);
    expect(provisionedCalls).toEqual([{ applied: true }]);
    // Idempotent: ikkinchi tenant yaratilmadi.
    expect((await db.select().from(tenants)).length).toBe(1);
  });

  test('owner o‘z parolini qo‘ygan bo‘lsa skip → provisioned:false, applied:false', async () => {
    failLicenseWrite = true;
    await activate();
    failLicenseWrite = false;
    // Owner o'z parolini qo'ydi (vendor paroli endi ishlamaydi).
    await db
      .update(users)
      .set({ passwordHash: await hashPassword('OwnerOwnParol123!'), mustChangePassword: false })
      .where(eq(users.phone, OWNER_PHONE));

    const retry = await activate();
    expect(retry.status).toBe(200);
    const body = (await retry.json()) as { data: { provisioned?: boolean } };
    expect(body.data.provisioned).toBe(false);
    expect(provisionedCalls).toEqual([{ applied: false }]);
  });
});
