import { describe, expect, it } from 'bun:test';
import {
  adminSql,
  app,
  clinicReq,
  connectClinic,
  createLab,
  linkActive,
  sendCase,
} from './helpers';

/**
 * Klinika outbox'i javob yo'qolganda xuddi shu op'ni qayta yuboradi — `clientRef`
 * (ish ichida unikal) bilan Hub mavjud qatorni qaytaradi (200), dublikat yozmaydi.
 * Shuningdek: lab yuklagan fayl klinikaga deshifrlab beriladi, boshqa klinikaga — yo'q.
 */
const upload = (hubKey: string, ref: string, clientRef?: string, name = 'scan.stl') => {
  const form = new FormData();
  form.append('file', new File([Buffer.from('STL-DATA')], name, { type: 'model/stl' }));
  if (clientRef) form.append('clientRef', clientRef);
  return app.request(`/v1/clinic/cases/${ref}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${hubKey}` },
    body: form,
  });
};

const count = async (table: 'case_messages' | 'case_files', caseId: string) => {
  const rows =
    table === 'case_messages'
      ? await adminSql`SELECT count(*)::int AS n FROM case_messages WHERE case_id = ${caseId}`
      : await adminSql`SELECT count(*)::int AS n FROM case_files WHERE case_id = ${caseId}`;
  return (rows as unknown as [{ n: number }])[0].n;
};
const eventCount = async (caseId: string, type: string) => {
  const rows =
    await adminSql`SELECT count(*)::int AS n FROM case_events WHERE case_id = ${caseId} AND type = ${type}`;
  return (rows as unknown as [{ n: number }])[0].n;
};

describe('clientRef idempotentligi', () => {
  it('xabar: bir xil clientRef (ketma-ket + parallel) → bitta qator, bitta hodisa', async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    const c = await sendCase(clinic, lab.labId);
    const post = () =>
      clinicReq(clinic, `/v1/clinic/cases/${c.ref}/messages`, {
        method: 'POST',
        body: { body: 'Salom', clientRef: 'msg:1' },
      });
    const first = await post();
    expect(first.status).toBe(201);
    const id = ((await first.json()) as { message: { id: string } }).message.id;
    const [a, b] = await Promise.all([post(), post()]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(((await a.json()) as { message: { id: string } }).message.id).toBe(id);
    expect(await count('case_messages', c.caseId)).toBe(1);
    expect(await eventCount(c.caseId, 'message')).toBe(1);

    // clientRef'siz (eski klient) va boshqa clientRef — yangi qator.
    expect(
      (
        await clinicReq(clinic, `/v1/clinic/cases/${c.ref}/messages`, {
          method: 'POST',
          body: { body: 'Salom', clientRef: 'msg:2' },
        })
      ).status,
    ).toBe(201);
    expect(await count('case_messages', c.caseId)).toBe(2);
  });

  it('xabar: yaroqsiz clientRef 400', async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    const c = await sendCase(clinic, lab.labId);
    const r = await clinicReq(clinic, `/v1/clinic/cases/${c.ref}/messages`, {
      method: 'POST',
      body: { body: 'x', clientRef: 'bad ref with spaces' },
    });
    expect(r.status).toBe(400);
  });

  it('fayl: bir xil clientRef (ketma-ket + parallel) → bitta fayl', async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    const c = await sendCase(clinic, lab.labId);
    const first = await upload(clinic.hubKey, c.ref, 'file:1');
    expect(first.status).toBe(201);
    const id = ((await first.json()) as { file: { id: string } }).file.id;
    const [a, b] = await Promise.all([
      upload(clinic.hubKey, c.ref, 'file:1'),
      upload(clinic.hubKey, c.ref, 'file:1'),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const dup = (await a.json()) as { file: { id: string; fileName: string } };
    expect(dup.file.id).toBe(id);
    expect(dup.file.fileName).toBe('scan.stl');
    expect(await count('case_files', c.caseId)).toBe(1);
    expect(await eventCount(c.caseId, 'file')).toBe(1);
  });
});

describe('lab fayli klinikaga', () => {
  it('klinika lab faylini deshifrlab yuklaydi; boshqa klinika — 404', async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    const other = await connectClinic();
    await linkActive(lab, clinic);
    await linkActive(lab, other);
    const c = await sendCase(clinic, lab.labId);
    const form = new FormData();
    form.append(
      'file',
      new File([Buffer.from('PDF-RESULT')], 'natija.pdf', { type: 'application/pdf' }),
    );
    const up = await app.request(`/v1/lab/cases/${c.caseId}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${lab.token}` },
      body: form,
    });
    expect(up.status).toBe(201);
    const { file } = (await up.json()) as { file: { id: string } };

    const own = await clinicReq(clinic, `/v1/clinic/cases/${c.ref}/files/${file.id}`);
    expect(own.status).toBe(200);
    expect(own.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await own.arrayBuffer()).toString()).toBe('PDF-RESULT');

    // Boshqa klinika — shu ref'li ish uniki emas (RLS + clinic_id).
    expect((await clinicReq(other, `/v1/clinic/cases/${c.ref}/files/${file.id}`)).status).toBe(404);
    // Lab tomoni uchun boshqa ishning fayli ham ochilmaydi.
    const c2 = await sendCase(clinic, lab.labId);
    expect((await clinicReq(clinic, `/v1/clinic/cases/${c2.ref}/files/${file.id}`)).status).toBe(
      404,
    );
  });
});
