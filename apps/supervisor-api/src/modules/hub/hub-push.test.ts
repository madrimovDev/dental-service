import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { branches, clinicEvents, clinics, licenses } from '../../db/schema';
import { signAdminTestToken } from '../../lib/test-helpers';

// Supervisor → Hub push (real Supervisor DB; Hub — soxta fetch). Vendor amali
// (renew / deactivate) Hub holatiga ta'sir qiladi, lekin Hub'ga BOG'LIQ EMAS.
const TOKEN = 'test_supervisor_hub_token_min_32_bytes_xxxxxxx';
const HUB = 'http://lab-hub.internal';
const ADMIN_ID = crypto.randomUUID();

const env = { url: process.env.LAB_HUB_URL, token: process.env.SUPERVISOR_HUB_TOKEN };
beforeAll(() => {
  process.env.LAB_HUB_URL = HUB;
  process.env.SUPERVISOR_HUB_TOKEN = TOKEN;
});
afterAll(() => {
  for (const [k, v] of [
    ['LAB_HUB_URL', env.url],
    ['SUPERVISOR_HUB_TOKEN', env.token],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

type Call = { url: string; auth: string | null; body: Record<string, unknown> };
let calls: Call[] = [];
let hubMode: 'ok' | 'error' | 'throw' = 'ok';
afterEach(() => {
  calls = [];
  hubMode = 'ok';
  process.env.LAB_HUB_URL = HUB;
});

const hubFetch = (async (url: URL | string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  calls.push({
    url: url.toString(),
    auth: headers.get('Authorization'),
    body: JSON.parse(String(init?.body)),
  });
  if (hubMode === 'throw') throw new Error('ECONNREFUSED');
  return new Response(JSON.stringify(hubMode === 'ok' ? { clinicId: 'x' } : { error: {} }), {
    status: hubMode === 'ok' ? 200 : 500,
  });
}) as typeof fetch;

const app = createApp({ hubFetch });

const admin = async () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${await signAdminTestToken(ADMIN_ID)}`,
});

const seedDesktop = async () => {
  const [clinic] = await db
    .insert(clinics)
    .values({
      name: `Push D ${crypto.randomUUID().slice(0, 6)}`,
      ownerFullName: 'O',
      ownerPhone: '+998900000002',
    })
    .returning();
  const [branch] = await db
    .insert(branches)
    .values({ clinicId: clinic!.id, name: 'B' })
    .returning();
  await db.insert(licenses).values({
    clinicId: clinic!.id,
    branchId: branch!.id,
    licenseKey: `${crypto.randomUUID().slice(0, 8)}-PUSH`.toUpperCase(),
    plan: 'premium',
    modules: [],
    expiresAt: new Date(Date.now() + 10 * 86_400_000),
    isActive: true,
  });
  return clinic!;
};

const seedSaas = async () => {
  const [clinic] = await db
    .insert(clinics)
    .values({
      name: `Push S ${crypto.randomUUID().slice(0, 6)}`,
      ownerFullName: 'O',
      ownerPhone: '+998900000003',
      mode: 'saas',
      saasTenantId: crypto.randomUUID(),
      subscriptionExpiresAt: new Date(Date.now() + 3 * 86_400_000),
    })
    .returning();
  return clinic!;
};

const renew = async (id: string, expiresAt: string) =>
  app.request(`/v1/admin/clinics/${id}/renew`, {
    method: 'POST',
    headers: await admin(),
    body: JSON.stringify({ expiresAt }),
  });

describe('Supervisor → Lab Hub push', () => {
  it('desktop renew: yangi muddat Hub upsert’iga yuboriladi', async () => {
    const c = await seedDesktop();
    expect((await renew(c.id, '2099-03-01')).status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${HUB}/internal/clinics`);
    expect(calls[0]!.auth).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]!.body).toEqual({
      supervisorClinicId: c.id,
      mode: 'desktop',
      name: c.name,
      expiresAt: '2099-03-01T23:59:59.000Z',
    });
  });

  it('desktop deactivate: Hub’ga expiresAt=null (darhol blok)', async () => {
    const c = await seedDesktop();
    const res = await app.request(`/v1/admin/clinics/${c.id}/deactivate`, {
      method: 'PATCH',
      headers: await admin(),
    });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({
      supervisorClinicId: c.id,
      mode: 'desktop',
      expiresAt: null,
    });
  });

  it('SaaS renew: mode=saas push + clinic_events audit (admin id, from/to)', async () => {
    const c = await seedSaas();
    const res = await renew(c.id, '2099-04-30');
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({
      supervisorClinicId: c.id,
      mode: 'saas',
      name: c.name,
      expiresAt: '2099-04-30T23:59:59.000Z',
    });
    const events = await db.select().from(clinicEvents).where(eq(clinicEvents.clinicId, c.id));
    expect(events).toHaveLength(1);
    expect(events[0]!.event).toBe('saas_renewed');
    expect(events[0]!.metadata).toEqual({
      from: c.subscriptionExpiresAt!.toISOString(),
      to: '2099-04-30T23:59:59.000Z',
      createdBy: ADMIN_ID,
    });
  });

  it('SaaS renew o‘tmishga: 400, audit ham push ham yo‘q', async () => {
    const c = await seedSaas();
    expect((await renew(c.id, '2001-01-01')).status).toBe(400);
    expect(calls).toHaveLength(0);
    expect(
      await db.select().from(clinicEvents).where(eq(clinicEvents.clinicId, c.id)),
    ).toHaveLength(0);
  });

  it('Hub xato bersa yoki yetib bo‘lmasa — vendor amali baribir muvaffaqiyatli', async () => {
    hubMode = 'error';
    const a = await seedDesktop();
    expect((await renew(a.id, '2099-05-01')).status).toBe(200);
    hubMode = 'throw';
    const b = await seedSaas();
    expect((await renew(b.id, '2099-05-02')).status).toBe(200);
    const row = await db.query.clinics.findFirst({ where: eq(clinics.id, b.id) });
    expect(row!.subscriptionExpiresAt!.toISOString()).toBe('2099-05-02T23:59:59.000Z');
    expect(calls).toHaveLength(2);
  });

  it('LAB_HUB_URL sozlanmagan — push jim o‘tkazib yuboriladi', async () => {
    delete process.env.LAB_HUB_URL;
    const c = await seedDesktop();
    expect((await renew(c.id, '2099-06-01')).status).toBe(200);
    expect(calls).toHaveLength(0);
  });
});
