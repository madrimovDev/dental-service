import { describe, expect, it } from 'bun:test';
import { createApp } from '../../app';
import { signAdminTestToken } from '../../lib/test-helpers';

const app = createApp();

const authHeaders = async () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${await signAdminTestToken()}`,
});

const createClinic = async (overrides: Partial<Record<string, unknown>> = {}) => {
  const res = await app.request('/v1/admin/clinics', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      name: `Test Clinic ${crypto.randomUUID()}`,
      contactEmail: 'clinic@test.com',
      plan: 'standard',
      expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
      gracePeriodDays: 30,
      ...overrides,
    }),
  });
  return res;
};

describe('POST /v1/admin/clinics', () => {
  it('requires admin JWT', async () => {
    const res = await app.request('/v1/admin/clinics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'No Auth Clinic',
        plan: 'standard',
        expiresAt: new Date().toISOString(),
      }),
    });
    expect(res.status).toBe(401);
  });

  it('creates a clinic + license with the correct MODULE_MAP for the plan tier', async () => {
    const res = await createClinic({ plan: 'premium' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    expect(body.clinic.id).toBeTruthy();
    expect(body.clinic.name).toContain('Test Clinic');

    expect(body.license.clinicId).toBe(body.clinic.id);
    expect(body.license.plan).toBe('premium');
    expect(body.license.licenseKey).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}-[0-9A-F]{5}-[0-9A-F]{5}$/);
    expect(body.license.modules.sort()).toEqual(
      [
        'patients',
        'appointments',
        'queue',
        'cashier',
        'reports',
        'staff',
        'clinical',
        'lab-orders',
        'patient-images',
        'prescriptions',
        'consent',
      ].sort(),
    );
    expect(body.license.isActive).toBe(true);
  });

  it('rejects an invalid plan', async () => {
    const res = await createClinic({ plan: 'not-a-real-plan' });
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/admin/clinics', () => {
  it('requires admin JWT', async () => {
    const res = await app.request('/v1/admin/clinics');
    expect(res.status).toBe(401);
  });

  it('lists clinics including a freshly created one', async () => {
    const createRes = await createClinic();
    const created = (await createRes.json()) as any;

    const res = await app.request('/v1/admin/clinics', {
      headers: await authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((c) => c.id === created.clinic.id)).toBe(true);
  });
});

describe('GET /v1/admin/clinics/:id', () => {
  it('requires admin JWT', async () => {
    const res = await app.request('/v1/admin/clinics/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(401);
  });

  it('returns clinic + license for a known id', async () => {
    const createRes = await createClinic({ plan: 'starter' });
    const created = (await createRes.json()) as any;

    const res = await app.request(`/v1/admin/clinics/${created.clinic.id}`, {
      headers: await authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.clinic.id).toBe(created.clinic.id);
    expect(body.license.licenseKey).toBe(created.license.licenseKey);
  });

  it('returns 404 for unknown clinic id', async () => {
    const res = await app.request('/v1/admin/clinics/00000000-0000-0000-0000-000000000000', {
      headers: await authHeaders(),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
