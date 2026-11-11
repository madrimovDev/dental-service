import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
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

  it('noma‘lum / yaroqsiz id 404', async () => {
    expect((await verify(crypto.randomUUID())).status).toBe(404);
    expect((await verify('not-a-uuid')).status).toBe(404);
  });
});
