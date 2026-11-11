import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../../app';
import { signAdminTestToken } from '../../lib/test-helpers';

// Supervisor admin «Laboratoriyalar» → Hub ichki API proksisi. Hub soxta fetch
// (uning o'zi apps/lab-hub-api testlarida real DB bilan sinalgan).
const TOKEN = 'test_supervisor_hub_token_min_32_bytes_xxxxxxx';
const calls: { url: string; method: string; auth: string | null; body: unknown }[] = [];
let next: { status: number; body: unknown } = { status: 200, body: {} };
const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  calls.push({
    url: String(input),
    method: init?.method ?? 'GET',
    auth: headers.get('Authorization'),
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  });
  return new Response(JSON.stringify(next.body), {
    status: next.status,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

const env = { ...process.env };
beforeAll(() => {
  process.env.SUPERVISOR_HUB_TOKEN = TOKEN;
  process.env.LAB_HUB_URL = 'http://hub.internal:8171';
});
afterAll(() => {
  process.env.SUPERVISOR_HUB_TOKEN = env.SUPERVISOR_HUB_TOKEN;
  process.env.LAB_HUB_URL = env.LAB_HUB_URL;
  if (env.SUPERVISOR_HUB_TOKEN === undefined) delete process.env.SUPERVISOR_HUB_TOKEN;
  if (env.LAB_HUB_URL === undefined) delete process.env.LAB_HUB_URL;
});

const app = createApp({ hubFetch: fakeFetch });
const admin = async () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${await signAdminTestToken()}`,
});

describe('/v1/admin/labs (Hub proksisi)', () => {
  it('admin JWT talab qilinadi', async () => {
    expect((await app.request('/v1/admin/labs')).status).toBe(401);
  });

  it('yaratish: Hub ichki API tokeni bilan chaqiriladi, vaqtinchalik parol javobda bir marta', async () => {
    calls.length = 0;
    next = {
      status: 201,
      body: {
        lab: { id: 'l1', name: 'Lab' },
        lead: { fullName: 'R', phone: '+998901234567', tempPassword: 'TEMP-PASS-1234567' },
      },
    };
    const res = await app.request('/v1/admin/labs', {
      method: 'POST',
      headers: await admin(),
      body: JSON.stringify({
        name: 'Lab',
        city: 'Toshkent',
        expiresAt: '2027-11-12',
        leadFullName: 'Rahbar',
        leadPhone: '901234567',
      }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { lead: { tempPassword: string } }).lead.tempPassword).toBe(
      'TEMP-PASS-1234567',
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: 'http://hub.internal:8171/internal/labs',
      method: 'POST',
      auth: `Bearer ${TOKEN}`,
    });
    expect((calls[0]!.body as { expiresAt: string }).expiresAt).toBe('2027-11-12T23:59:59.000Z');
  });

  it('uzaytirish va ro‘yxat; Hub xatosi kodi bilan qaytadi', async () => {
    calls.length = 0;
    next = { status: 200, body: { lab: { id: 'l1' } } };
    const res = await app.request('/v1/admin/labs/2f1c3a4e-0000-4000-8000-000000000001', {
      method: 'PATCH',
      headers: await admin(),
      body: JSON.stringify({ expiresAt: '2028-01-31' }),
    });
    expect(res.status).toBe(200);
    expect(calls[0]).toMatchObject({
      method: 'PATCH',
      url: 'http://hub.internal:8171/internal/labs/2f1c3a4e-0000-4000-8000-000000000001',
    });

    next = { status: 409, body: { error: { code: 'lab_user.phone_taken' } } };
    const dup = await app.request('/v1/admin/labs', {
      method: 'POST',
      headers: await admin(),
      body: JSON.stringify({
        name: 'Lab',
        expiresAt: '2027-11-12',
        leadFullName: 'R R',
        leadPhone: '901234567',
      }),
    });
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as { error: { code: string } }).error.code).toBe(
      'lab_user.phone_taken',
    );

    next = { status: 200, body: { labs: [{ id: 'l1' }] } };
    const list = await app.request('/v1/admin/labs', { headers: await admin() });
    expect(((await list.json()) as { labs: unknown[] }).labs).toHaveLength(1);
  });

  it('Hub sozlanmagan bo‘lsa 503', async () => {
    delete process.env.LAB_HUB_URL;
    const res = await app.request('/v1/admin/labs', { headers: await admin() });
    expect(res.status).toBe(503);
    process.env.LAB_HUB_URL = 'http://hub.internal:8171';
  });
});
