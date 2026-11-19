/**
 * FX-07 (LA-16, X-4) — heartbeat «qator yo'q» va «deaktivatsiya» holatlarini
 * ajratadi:
 * - qator yo'q (masalan Supervisor bazasi eski zaxiradan tiklangan) →
 *   `UNKNOWN_KEY` (imzosiz; klient faqat log qiladi, `.lic`ni saqlaydi);
 * - `isActive:false` (vendor deaktivatsiya qildi) → `LICENSE_REVOKED` va
 *   IMZOLANGAN tekis `revocation` payload — klient imzoni tekshirib, faqat
 *   shundan keyin `.lic`ni o'chiradi.
 *
 * Real DB (lane'ning supervisor test bazasi), haqiqiy RSA kaliti.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { createPublicKey } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { branches, clinics, licenses } from '../../db/schema';
import { assertFlatSignaturePayload, verifySignature } from '../../lib/rsa';

const app = createApp();

const publicKey = createPublicKey(process.env.RSA_PRIVATE_KEY as string)
  .export({ type: 'spki', format: 'pem' })
  .toString();

const FP = 'fx07-fp';
let clinicId: string;
let licenseKey: string;

beforeEach(async () => {
  const [clinic] = await db
    .insert(clinics)
    .values({
      name: 'FX-07 Klinika',
      ownerFullName: 'Test Owner',
      ownerPhone: '+998901234567',
      ownerTempPassword: null,
    })
    .returning();
  clinicId = clinic!.id;
  const [branch] = await db.insert(branches).values({ clinicId, name: 'Bosh' }).returning();
  licenseKey = `FX07-${crypto.randomUUID()}`;
  await db.insert(licenses).values({
    clinicId,
    branchId: branch!.id,
    licenseKey,
    plan: 'standard',
    modules: ['patients'],
    expiresAt: new Date(Date.now() + 86400000 * 30),
    isActive: true,
    fingerprint: FP,
    provisionedAt: new Date('2026-08-01'),
  });
});

const heartbeat = (key: string, fingerprint: string) =>
  app.request('/v1/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ licenseKey: key, fingerprint }),
  });

describe('FX-07 — heartbeat: UNKNOWN_KEY vs signed LICENSE_REVOKED', () => {
  test("qator yo'q → 403 UNKNOWN_KEY, revocation payload YO'Q", async () => {
    const res = await heartbeat(`MISSING-${crypto.randomUUID()}`, FP);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; revocation?: unknown } };
    expect(body.error.code).toBe('UNKNOWN_KEY');
    expect(body.error.revocation).toBeUndefined();
  });

  test('deaktivatsiya → 403 LICENSE_REVOKED + imzolangan tekis revocation', async () => {
    await db.update(licenses).set({ isActive: false }).where(eq(licenses.licenseKey, licenseKey));
    const before = Date.now();

    const res = await heartbeat(licenseKey, FP);
    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      error: { code: string; revocation?: Record<string, unknown> & { signature: string } };
    };
    expect(body.error.code).toBe('LICENSE_REVOKED');
    const rev = body.error.revocation;
    expect(rev).toBeDefined();
    const { signature, ...payload } = rev!;
    expect(payload).toEqual({
      status: 'revoked',
      licenseKey,
      clinicId,
      fingerprint: FP,
      issuedAt: expect.any(String),
    });
    expect(Date.parse(payload.issuedAt as string)).toBeGreaterThanOrEqual(before - 1000);
    // Qaror #40 — imzolanadigan payload tekis.
    expect(() => assertFlatSignaturePayload(payload)).not.toThrow();
    expect(verifySignature(payload, signature, publicKey)).toBe(true);
  });

  test("deaktivatsiya qilingan litsenziyaning heartbeat'i lastHeartbeatAt yangilamaydi", async () => {
    await db.update(licenses).set({ isActive: false }).where(eq(licenses.licenseKey, licenseKey));
    await heartbeat(licenseKey, FP);
    const lic = await db.query.licenses.findFirst({ where: eq(licenses.licenseKey, licenseKey) });
    expect(lic?.lastHeartbeatAt).toBeNull();
  });
});
