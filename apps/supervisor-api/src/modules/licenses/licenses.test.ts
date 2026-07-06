import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../app'; // Hono instansiyasini quradigan factory (index.ts Bun.serve'siz)
import { db } from '../../db/client';
import { branches, clinics, licenses } from '../../db/schema';
import { signAdminTestToken } from '../../lib/test-helpers';

const app = createApp();

let licenseKey: string;

beforeEach(async () => {
  const [clinic] = await db.insert(clinics).values({ name: 'Test Clinic' }).returning();
  if (!clinic) throw new Error('clinic insert returned no row');
  const [branch] = await db
    .insert(branches)
    .values({ clinicId: clinic.id, name: 'Main' })
    .returning();
  if (!branch) throw new Error('branch insert returned no row');
  licenseKey = `TEST-${crypto.randomUUID()}`;
  await db.insert(licenses).values({
    clinicId: clinic.id,
    branchId: branch.id,
    licenseKey,
    plan: 'standard',
    modules: ['patients', 'appointments', 'cashier'],
    gracePeriodDays: 30,
    expiresAt: new Date(Date.now() + 86400000 * 365),
    isActive: true,
  });
});

describe('POST /v1/activate', () => {
  it("activates a valid license key va fingerprint bog'laydi", async () => {
    const res = await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-abc' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.modules).toContain('patients');
    expect(body.signature).toBeTruthy();

    const lic = await db.query.licenses.findFirst({ where: eq(licenses.licenseKey, licenseKey) });
    expect(lic?.fingerprint).toBe('fp-abc');
  });

  it('returns 403 for unknown key', async () => {
    const res = await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: 'WRONG-KEY', fingerprint: 'fp' }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 for fingerprint mismatch (allaqachon boshqa qurilmaga bog'langan)", async () => {
    await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-first' }),
    });
    const res = await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-different' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /v1/heartbeat', () => {
  it('lastHeartbeatAt yangilaydi va joriy modullarni qaytaradi', async () => {
    await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-abc' }),
    });
    const res = await app.request('/v1/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-abc' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.gracePeriodDays).toBe(30);
  });
});

describe('POST /v1/reactivate', () => {
  it("admin JWT bo'lmasa 401", async () => {
    const res = await app.request('/v1/reactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-new' }),
    });
    expect(res.status).toBe(401);
  });

  it("valid admin JWT bilan fingerprint qayta bog'lanadi", async () => {
    const token = await signAdminTestToken(); // test helper — Task 4'dagi jwt.ts bilan bir xil secret
    const res = await app.request('/v1/reactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-new' }),
    });
    expect(res.status).toBe(200);
    const lic = await db.query.licenses.findFirst({ where: eq(licenses.licenseKey, licenseKey) });
    expect(lic?.fingerprint).toBe('fp-new');
  });

  it('re-enables isActive on a deactivated license', async () => {
    await db.update(licenses).set({ isActive: false }).where(eq(licenses.licenseKey, licenseKey));

    const token = await signAdminTestToken();
    const res = await app.request('/v1/reactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-new' }),
    });
    expect(res.status).toBe(200);

    const lic = await db.query.licenses.findFirst({ where: eq(licenses.licenseKey, licenseKey) });
    expect(lic?.isActive).toBe(true);
  });
});
