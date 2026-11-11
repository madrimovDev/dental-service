import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createSupervisorClient } from '../../../../lab-hub-api/src/lib/supervisor-client';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { branches, clinics, licenses } from '../../db/schema';

// Real Supervisor DB: Hub → Supervisor `GET /internal/clinics/:id/verify`.
const TOKEN = 'test_supervisor_hub_token_min_32_bytes_xxxxxxx';
const prev = process.env.SUPERVISOR_HUB_TOKEN;
beforeAll(() => {
  process.env.SUPERVISOR_HUB_TOKEN = TOKEN;
});
afterAll(() => {
  if (prev === undefined) delete process.env.SUPERVISOR_HUB_TOKEN;
  else process.env.SUPERVISOR_HUB_TOKEN = prev;
});

const app = createApp();

const seedClinic = async (lic: { isActive: boolean; expiresAt: Date }) => {
  const [clinic] = await db
    .insert(clinics)
    .values({
      name: `Hub Clinic ${crypto.randomUUID().slice(0, 6)}`,
      ownerFullName: 'O',
      ownerPhone: '+998900000000',
    })
    .returning();
  const [branch] = await db
    .insert(branches)
    .values({ clinicId: clinic!.id, name: 'B' })
    .returning();
  const key = `${crypto.randomUUID().slice(0, 5)}-HUB`.toUpperCase();
  await db.insert(licenses).values({
    clinicId: clinic!.id,
    branchId: branch!.id,
    licenseKey: key,
    plan: 'premium',
    modules: [],
    expiresAt: lic.expiresAt,
    isActive: lic.isActive,
  });
  return { clinicId: clinic!.id, key, name: clinic!.name };
};

const seedSaasClinic = async (subscriptionExpiresAt: Date | null) => {
  const [clinic] = await db
    .insert(clinics)
    .values({
      name: `Hub SaaS ${crypto.randomUUID().slice(0, 6)}`,
      ownerFullName: 'O',
      ownerPhone: '+998900000001',
      mode: 'saas',
      saasTenantId: crypto.randomUUID(),
      subscriptionExpiresAt,
    })
    .returning();
  return { clinicId: clinic!.id, name: clinic!.name };
};

const verify = (id: string, query = '', token = TOKEN) =>
  app.request(`/internal/clinics/${id}/verify${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

describe('GET /internal/clinics/:id/verify', () => {
  it('tokensiz / noto‘g‘ri token 401', async () => {
    const { clinicId } = await seedClinic({
      isActive: true,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect((await app.request(`/internal/clinics/${clinicId}/verify`)).status).toBe(401);
    expect((await verify(clinicId, '', 'x'.repeat(48))).status).toBe(401);
  });

  it('desktop klinika: litsenziya kaliti mosligi, faollik, muddat', async () => {
    const exp = new Date(Date.now() + 30 * 86_400_000);
    const c = await seedClinic({ isActive: true, expiresAt: exp });
    const ok = (await (await verify(c.clinicId, `?licenseKey=${c.key}`)).json()) as Record<
      string,
      unknown
    >;
    expect(ok).toMatchObject({
      clinicId: c.clinicId,
      name: c.name,
      mode: 'desktop',
      active: true,
      licenseMatches: true,
    });
    expect(ok.expiresAt).toBe(exp.toISOString());
    const wrong = (await (await verify(c.clinicId, '?licenseKey=NOPE')).json()) as Record<
      string,
      unknown
    >;
    expect(wrong.licenseMatches).toBe(false);
    const none = (await (await verify(c.clinicId)).json()) as Record<string, unknown>;
    expect(none.licenseMatches).toBe(false);
    expect(none.active).toBe(true);
  });

  it('bekor qilingan litsenziya: active=false, kalit mos emas', async () => {
    const c = await seedClinic({ isActive: false, expiresAt: new Date(Date.now() + 86_400_000) });
    const body = (await (await verify(c.clinicId, `?licenseKey=${c.key}`)).json()) as Record<
      string,
      unknown
    >;
    expect(body.active).toBe(false);
    expect(body.licenseMatches).toBe(false);
  });

  it('SaaS klinika: mode=saas, muddat = subscription_expires_at, litsenziya kaliti hech qachon mos emas', async () => {
    const exp = new Date(Date.now() + 14 * 86_400_000);
    const c = await seedSaasClinic(exp);
    const body = (await (await verify(c.clinicId, '?licenseKey=ANY')).json()) as Record<
      string,
      unknown
    >;
    expect(body).toEqual({
      clinicId: c.clinicId,
      name: c.name,
      mode: 'saas',
      active: true,
      expiresAt: exp.toISOString(),
      licenseMatches: false,
    });
    const noSub = await seedSaasClinic(null);
    const inactive = (await (await verify(noSub.clinicId)).json()) as Record<string, unknown>;
    expect(inactive.mode).toBe('saas');
    expect(inactive.active).toBe(false);
    expect(inactive.expiresAt).toBeNull();
  });

  it('seam: Hub’ning haqiqiy Supervisor klienti bu endpoint bilan ikkala rejimda ishlaydi', async () => {
    // Hub (apps/lab-hub-api) klienti — fetch shu Supervisor ilovasiga yo'naltiriladi.
    const client = createSupervisorClient({
      baseUrl: 'http://supervisor.internal',
      token: TOKEN,
      fetch: ((url: URL | string, init?: RequestInit) =>
        app.request(url.toString(), init)) as typeof fetch,
    });
    const exp = new Date(Date.now() + 30 * 86_400_000);
    const saas = await seedSaasClinic(exp);
    const sv = await client.verifyClinic(saas.clinicId, {});
    expect(sv).toMatchObject({ mode: 'saas', active: true, expiresAt: exp.toISOString() });

    const desk = await seedClinic({ isActive: true, expiresAt: exp });
    const dv = await client.verifyClinic(desk.clinicId, { licenseKey: desk.key });
    expect(dv).toMatchObject({ mode: 'desktop', active: true, licenseMatches: true });
    expect(await client.verifyClinic(crypto.randomUUID(), {})).toBeNull();
  });

  it('noma‘lum / yaroqsiz id 404', async () => {
    expect((await verify(crypto.randomUUID())).status).toBe(404);
    expect((await verify('not-a-uuid')).status).toBe(404);
  });
});
