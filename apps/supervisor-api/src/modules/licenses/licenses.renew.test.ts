import { beforeEach, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { branches, clinics, licenseEvents, licenses } from '../../db/schema';
import { signAdminTestToken } from '../../lib/test-helpers';
import { createLicenseService } from './licenses.service';

const service = createLicenseService();
const app = createApp();

let clinicId: string;
let licenseId: string;
let licenseKey: string;
const FP = 'renew-fp';
const OLD_EXPIRES = new Date(Date.now() + 5 * 86400000);

// Jadvallarni TRUNCATE QILMAYDI — har test o'z unikal fixture'ini yaratadi.
beforeEach(async () => {
  const [clinic] = await db
    .insert(clinics)
    .values({
      name: 'Renew Klinika',
      ownerFullName: 'Aliyev Vali',
      ownerPhone: '+998901234567',
      ownerTempPassword: null,
      defaultLanguage: 'uz',
    })
    .returning();
  clinicId = clinic!.id;
  const [branch] = await db.insert(branches).values({ clinicId, name: 'Bosh' }).returning();
  licenseKey = `RENEW-${crypto.randomUUID()}`;
  // gracePeriodDays ATAYLAB berilmaydi — default tekshiriladi.
  const [lic] = await db
    .insert(licenses)
    .values({
      clinicId,
      branchId: branch!.id,
      licenseKey,
      plan: 'standard',
      modules: ['patients'],
      expiresAt: OLD_EXPIRES,
      isActive: true,
      fingerprint: FP,
      provisionedAt: new Date('2026-08-01'),
    })
    .returning();
  licenseId = lic!.id;
});

const post = async (id: string, body: unknown) =>
  app.request(`/v1/admin/clinics/${id}/renew`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await signAdminTestToken()}`,
    },
    body: JSON.stringify(body),
  });

describe('renew', () => {
  test('default gracePeriodDays is 7 for new license', async () => {
    const lic = await db.query.licenses.findFirst({ where: eq(licenses.id, licenseId) });
    expect(lic!.gracePeriodDays).toBe(7);
  });

  test('renew updates expiresAt and writes renewed event', async () => {
    const to = new Date(Date.now() + 400 * 86400000);
    const res = await post(clinicId, { expiresAt: to.toISOString() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(new Date(body.license.expiresAt).toISOString()).toBe(to.toISOString());

    const lic = await db.query.licenses.findFirst({ where: eq(licenses.id, licenseId) });
    expect(lic!.expiresAt.toISOString()).toBe(to.toISOString());
    const [ev] = await db
      .select()
      .from(licenseEvents)
      .where(and(eq(licenseEvents.licenseId, licenseId), eq(licenseEvents.event, 'renewed')));
    expect(ev).toBeDefined();
    const meta = ev!.metadata as any;
    expect(meta.from).toBe(OLD_EXPIRES.toISOString());
    expect(meta.to).toBe(to.toISOString());
  });

  test('accepts date-only value as end of day UTC', async () => {
    const d = new Date(Date.now() + 100 * 86400000).toISOString().slice(0, 10);
    const res = await post(clinicId, { expiresAt: d });
    expect(res.status).toBe(200);
    const lic = await db.query.licenses.findFirst({ where: eq(licenses.id, licenseId) });
    expect(lic!.expiresAt.toISOString()).toBe(`${d}T23:59:59.000Z`);
  });

  test('rejects past date', async () => {
    const res = await post(clinicId, { expiresAt: new Date(Date.now() - 86400000).toISOString() });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe('EXPIRES_IN_PAST');
    const lic = await db.query.licenses.findFirst({ where: eq(licenses.id, licenseId) });
    expect(lic!.expiresAt.toISOString()).toBe(OLD_EXPIRES.toISOString());
  });

  test('404 unknown clinic', async () => {
    const res = await post(crypto.randomUUID(), {
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
    });
    expect(res.status).toBe(404);
  });

  test('next heartbeat returns renewed expiresAt', async () => {
    const to = new Date(Date.now() + 300 * 86400000);
    await service.renew(clinicId, to, 'admin-1');
    const hb = (await service.heartbeat(licenseKey, FP)) as any;
    const data = hb.data ?? hb.license ?? hb;
    expect(JSON.stringify(hb)).toContain(to.toISOString());
    expect(data).toBeDefined();
  });
});
