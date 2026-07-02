import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { licenses } from '../../db/schema';
import { signAdminTestToken } from '../../lib/test-helpers';

const app = createApp();

const authHeaders = async () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${await signAdminTestToken()}`,
});

const createClinicWithLicense = async (plan = 'standard') => {
  const res = await app.request('/v1/admin/clinics', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      name: `Modules Test Clinic ${crypto.randomUUID()}`,
      plan,
      expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
      gracePeriodDays: 30,
    }),
  });
  return (await res.json()) as any;
};

describe('PATCH /v1/admin/licenses/:key/modules', () => {
  it('requires admin JWT', async () => {
    const { license } = await createClinicWithLicense();
    const res = await app.request(`/v1/admin/licenses/${license.licenseKey}/modules`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modules: ['patients'] }),
    });
    expect(res.status).toBe(401);
  });

  it('updates the module list for a license', async () => {
    const { license } = await createClinicWithLicense('starter');
    const res = await app.request(`/v1/admin/licenses/${license.licenseKey}/modules`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ modules: ['patients', 'appointments', 'cashier'] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);

    const updated = await db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, license.licenseKey),
    });
    expect(updated?.modules).toEqual(['patients', 'appointments', 'cashier']);
  });

  it('updates gracePeriodDays when provided', async () => {
    const { license } = await createClinicWithLicense('starter');
    const res = await app.request(`/v1/admin/licenses/${license.licenseKey}/modules`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ modules: ['patients'], gracePeriodDays: 15 }),
    });
    expect(res.status).toBe(200);

    const updated = await db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, license.licenseKey),
    });
    expect(updated?.gracePeriodDays).toBe(15);
  });
});
