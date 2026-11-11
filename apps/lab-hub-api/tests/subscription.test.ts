import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { clinics, labs } from '../src/db/schema';
import { subscriptionState } from '../src/lib/subscription';
import {
  app,
  caseBody,
  clinicReq,
  config,
  connectClinic,
  createLab,
  db,
  deps,
  inDays,
  labReq,
  linkActive,
  sendCase,
  supervisorRegistry,
} from './helpers';

const code = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

describe('obuna (L10): expiresAt + 7 kun, keyin 403', () => {
  it('subscriptionState chegaralari', () => {
    const now = new Date('2026-11-12T00:00:00Z');
    expect(subscriptionState(new Date('2026-11-12T00:00:00Z'), now)).toBe('active');
    expect(subscriptionState(new Date('2026-11-06T00:00:00Z'), now)).toBe('grace');
    expect(subscriptionState(new Date('2026-11-04T23:59:59Z'), now)).toBe('expired');
  });

  it('imtiyozda lab ishlaydi, imtiyozdan keyin portal va klinika so‘rovlari 403', async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    const c = await sendCase(clinic, lab.labId);

    await db
      .update(labs)
      .set({ expiresAt: inDays(-3) })
      .where(eq(labs.id, lab.labId));
    expect((await labReq(lab, '/v1/lab/cases')).status).toBe(200);
    const me = (await (await labReq(lab, '/v1/lab/me')).json()) as {
      lab: { subscription: string };
    };
    expect(me.lab.subscription).toBe('grace');

    await db
      .update(labs)
      .set({ expiresAt: inDays(-8) })
      .where(eq(labs.id, lab.labId));
    const blocked = await labReq(lab, '/v1/lab/cases');
    expect(blocked.status).toBe(403);
    expect(await code(blocked)).toBe('lab.subscription_expired');
    // me ochiq qoladi — portal to'lov ekranini ko'rsatadi
    expect((await labReq(lab, '/v1/lab/me')).status).toBe(200);

    const put = await clinicReq(clinic, `/v1/clinic/cases/${crypto.randomUUID()}`, {
      method: 'PUT',
      body: caseBody(lab.labId),
    });
    expect(put.status).toBe(403);
    expect(await code(put)).toBe('lab.subscription_expired');
    const msg = await clinicReq(clinic, `/v1/clinic/cases/${c.ref}/messages`, {
      method: 'POST',
      body: { body: 'salom' },
    });
    expect(msg.status).toBe(403);

    // katalogda ko'rinmaydi
    const cat = (await (await clinicReq(clinic, '/v1/clinic/labs')).json()) as {
      labs: { id: string }[];
    };
    expect(cat.labs.some((l) => l.id === lab.labId)).toBe(false);

    // Supervisor uzaytiradi → yana ishlaydi
    const renew = await app.request(`/internal/labs/${lab.labId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.supervisorHubToken}`,
      },
      body: JSON.stringify({ expiresAt: inDays(30).toISOString() }),
    });
    expect(renew.status).toBe(200);
    expect((await labReq(lab, '/v1/lab/cases')).status).toBe(200);
  });

  it('klinika obunasi tugasa Hub klinikani rad etadi; connect ham', async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    const upsert = await app.request('/internal/clinics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.supervisorHubToken}`,
      },
      body: JSON.stringify({
        supervisorClinicId: clinic.supervisorClinicId,
        mode: 'desktop',
        name: 'Eski klinika',
        expiresAt: inDays(-10).toISOString(),
      }),
    });
    expect(upsert.status).toBe(200);
    expect(((await upsert.json()) as { clinicId: string }).clinicId).toBe(clinic.clinicId);
    const res = await clinicReq(clinic, '/v1/clinic/links');
    expect(res.status).toBe(403);
    expect(await code(res)).toBe('clinic.subscription_expired');

    const reg = supervisorRegistry.get(clinic.supervisorClinicId)!;
    supervisorRegistry.set(clinic.supervisorClinicId, {
      ...reg,
      expiresAt: inDays(-10).toISOString(),
    });
    const conn = await app.request('/v1/clinic/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': crypto.randomUUID() },
      body: JSON.stringify({
        supervisorClinicId: clinic.supervisorClinicId,
        licenseKey: reg.licenseKey,
      }),
    });
    expect(conn.status).toBe(403);
  });

  it('connect: noto‘g‘ri litsenziya kaliti 401, noma‘lum klinika 404, SaaS xizmat kalitisiz 401', async () => {
    const clinic = await connectClinic();
    const post = (body: unknown) =>
      app.request('/v1/clinic/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-real-ip': crypto.randomUUID() },
        body: JSON.stringify(body),
      });
    expect(
      (await post({ supervisorClinicId: clinic.supervisorClinicId, licenseKey: 'WRONG' })).status,
    ).toBe(401);
    expect((await post({ supervisorClinicId: crypto.randomUUID(), licenseKey: 'X' })).status).toBe(
      404,
    );
    expect(
      (await post({ supervisorClinicId: clinic.supervisorClinicId, serviceProof: 'nope' })).status,
    ).toBe(401);

    // SaaS: to'g'ri xizmat kaliti + Supervisor'da mode=saas
    const sid = crypto.randomUUID();
    supervisorRegistry.set(sid, {
      clinicId: sid,
      name: 'SaaS klinika',
      mode: 'saas',
      active: true,
      expiresAt: inDays(14).toISOString(),
      licenseMatches: false,
    });
    const ok = await post({ supervisorClinicId: sid, serviceProof: config.saasHubToken });
    expect(ok.status).toBe(200);
    // desktop klinika SaaS xizmat kaliti bilan ulana olmaydi
    expect(
      (
        await post({
          supervisorClinicId: clinic.supervisorClinicId,
          serviceProof: config.saasHubToken,
        })
      ).status,
    ).toBe(401);
  });

  it('Supervisor bilan qayta tekshiruv: uzaytirilgan klinika ochiladi, bekor qilingani yopiladi', async () => {
    const clinic = await connectClinic();
    const reg = supervisorRegistry.get(clinic.supervisorClinicId)!;
    const old = new Date(Date.now() - 2 * 86_400_000);

    // Hub'dagi muddat o'tgan, lekin Supervisor'da uzaytirilgan → qayta tekshiruvdan keyin 200.
    await db
      .update(clinics)
      .set({ expiresAt: inDays(-10), lastVerifiedAt: old })
      .where(eq(clinics.id, clinic.clinicId));
    expect((await clinicReq(clinic, '/v1/clinic/links')).status).toBe(200);
    const row = await db.query.clinics.findFirst({ where: eq(clinics.id, clinic.clinicId) });
    expect(row!.expiresAt!.toISOString()).toBe(reg.expiresAt!);

    // Supervisor litsenziyani bekor qildi; Hub muddati hali kelajakda, oxirgi tekshiruv >24 soat.
    supervisorRegistry.set(clinic.supervisorClinicId, { ...reg, active: false });
    await db.update(clinics).set({ lastVerifiedAt: old }).where(eq(clinics.id, clinic.clinicId));
    const res = await clinicReq(clinic, '/v1/clinic/links');
    expect(res.status).toBe(403);
    expect(await code(res)).toBe('clinic.subscription_expired');
  });

  it('Supervisor javob bermasa — faol klinika kesh bilan ishlashda davom etadi', async () => {
    const clinic = await connectClinic();
    await db
      .update(clinics)
      .set({ lastVerifiedAt: new Date(Date.now() - 2 * 86_400_000) })
      .where(eq(clinics.id, clinic.clinicId));
    const orig = deps.supervisor.verifyClinic;
    deps.supervisor.verifyClinic = async () => {
      throw new Error('down');
    };
    try {
      expect((await clinicReq(clinic, '/v1/clinic/links')).status).toBe(200);
    } finally {
      deps.supervisor.verifyClinic = orig;
    }
  });
});
