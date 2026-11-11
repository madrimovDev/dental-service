import { describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { cases } from '../src/db/schema';
import { withClinic, withLab } from '../src/db/scoped';
import {
  app,
  caseBody,
  clinicReq,
  connectClinic,
  createLab,
  db,
  labReq,
  linkActive,
  sendCase,
} from './helpers';

// Review Focus 1: lab A lab B ishlarini/fayllarini ko'rmaydi; ulanmagan klinika
// labga ish yubora olmaydi. Real Postgres, non-superuser rol (RLS ishlaydi).
describe('RLS izolyatsiya (real DB)', () => {
  it('kontekstsiz tranzaksiya 0 qator, lab konteksti faqat o‘z labini ko‘radi', async () => {
    const labA = await createLab();
    const labB = await createLab();
    const clinic = await connectClinic();
    await linkActive(labA, clinic);
    await linkActive(labB, clinic);
    const a = await sendCase(clinic, labA.labId);
    await sendCase(clinic, labB.labId);

    const none = await db.transaction(async (tx) => tx.select().from(cases));
    expect(none.length).toBe(0);

    const seenByB = await withLab(db, labB.labId, (tx) => tx.select().from(cases));
    expect(seenByB.length).toBe(1);
    expect(seenByB.every((c) => c.labId === labB.labId)).toBe(true);
    expect(seenByB.some((c) => c.id === a.caseId)).toBe(false);

    // Lab B konteksti lab A qatorini o'zgartira olmaydi (UPDATE 0 qator).
    const upd = await withLab(db, labB.labId, (tx) =>
      tx.execute(sql`UPDATE cases SET status = 'ready' WHERE id = ${a.caseId} RETURNING id`),
    );
    expect(upd.length).toBe(0);

    // Lab B konteksti lab A nomidan qator qo'sha olmaydi (WITH CHECK).
    await expect(
      withLab(db, labB.labId, (tx) =>
        tx.execute(
          sql`INSERT INTO cases (lab_id, clinic_id, clinic_case_ref, work_type, status)
              VALUES (${labA.labId}, ${clinic.clinicId}, ${crypto.randomUUID()}, 'x', 'sent')`,
        ),
      ),
    ).rejects.toThrow();
  });

  it('API: lab B lab A ishini, faylini, xabarini ochib bo‘lmaydi (404)', async () => {
    const labA = await createLab();
    const labB = await createLab();
    const clinic = await connectClinic();
    await linkActive(labA, clinic);
    const a = await sendCase(clinic, labA.labId);

    const form = new FormData();
    form.append('file', new File([Buffer.from('STL-DATA')], 'scan.stl', { type: 'model/stl' }));
    const up = await app.request(`/v1/clinic/cases/${a.ref}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clinic.hubKey}` },
      body: form,
    });
    expect(up.status).toBe(201);
    const { file } = (await up.json()) as { file: { id: string } };

    expect((await labReq(labB, `/v1/lab/cases/${a.caseId}`)).status).toBe(404);
    expect((await labReq(labB, `/v1/lab/cases/${a.caseId}/files/${file.id}`)).status).toBe(404);
    const st = await labReq(labB, `/v1/lab/cases/${a.caseId}/status`, {
      method: 'POST',
      body: { to: 'accepted' },
    });
    expect(st.status).toBe(404);
    const list = (await (await labReq(labB, '/v1/lab/cases')).json()) as { cases: unknown[] };
    expect(list.cases.length).toBe(0);

    // Lab A esa ko'radi va faylni deshifrlab yuklaydi.
    const own = await labReq(labA, `/v1/lab/cases/${a.caseId}/files/${file.id}`);
    expect(own.status).toBe(200);
    expect(Buffer.from(await own.arrayBuffer()).toString()).toBe('STL-DATA');
  });

  it('klinika B klinika A ishini ko‘rmaydi; klinika konteksti boshqa klinika qatorini ko‘rmaydi', async () => {
    const lab = await createLab();
    const clinicA = await connectClinic();
    const clinicB = await connectClinic();
    await linkActive(lab, clinicA);
    await linkActive(lab, clinicB);
    const a = await sendCase(clinicA, lab.labId);
    expect((await clinicReq(clinicB, `/v1/clinic/cases/${a.ref}`)).status).toBe(404);
    const rows = await withClinic(db, clinicB.clinicId, (tx) => tx.select().from(cases));
    expect(rows.length).toBe(0);
    const changes = (await (await clinicReq(clinicB, '/v1/clinic/changes')).json()) as {
      events: unknown[];
    };
    expect(changes.events.length).toBe(0);
  });

  it('ulanmagan (yoki pending/rejected) klinika ish yubora olmaydi — 403', async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    const put = () =>
      clinicReq(clinic, `/v1/clinic/cases/${crypto.randomUUID()}`, {
        method: 'PUT',
        body: caseBody(lab.labId),
      });
    const res = await put();
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('link.not_active');

    const r = await clinicReq(clinic, '/v1/clinic/links', {
      method: 'POST',
      body: { labId: lab.labId },
    });
    const { link } = (await r.json()) as { link: { id: string; status: string } };
    expect(link.status).toBe('pending');
    expect((await put()).status).toBe(403);

    await labReq(lab, `/v1/lab/links/${link.id}/decision`, {
      method: 'POST',
      body: { decision: 'reject' },
    });
    expect((await put()).status).toBe(403);
  });

  it('hub kalitsiz yoki soxta kalit bilan 401', async () => {
    expect((await app.request('/v1/clinic/links')).status).toBe(401);
    const res = await app.request('/v1/clinic/links', {
      headers: { Authorization: 'Bearer lhk_fake' },
    });
    expect(res.status).toBe(401);
  });
});
