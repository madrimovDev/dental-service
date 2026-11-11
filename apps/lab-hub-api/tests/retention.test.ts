import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runRetention } from '../src/workers/retention';
import {
  adminSql,
  app,
  clinicReq,
  config,
  connectClinic,
  createLab,
  deps,
  labReq,
  linkActive,
  sendCase,
} from './helpers';

const deliver = async (
  lab: Awaited<ReturnType<typeof createLab>>,
  clinic: Awaited<ReturnType<typeof connectClinic>>,
) => {
  const c = await sendCase(clinic, lab.labId);
  for (const to of ['accepted', 'in_progress', 'ready']) {
    await labReq(lab, `/v1/lab/cases/${c.caseId}/status`, { method: 'POST', body: { to } });
  }
  await labReq(lab, `/v1/lab/cases/${c.caseId}/price`, { method: 'POST', body: { price: 200000 } });
  await clinicReq(clinic, `/v1/clinic/cases/${c.ref}/approve-price`, {
    method: 'POST',
    body: { price: 200000 },
  });
  await clinicReq(clinic, `/v1/clinic/cases/${c.ref}/messages`, {
    method: 'POST',
    body: { body: 'rahmat' },
  });
  const form = new FormData();
  form.append('file', new File([Buffer.from('jpeg')], 'foto.jpg', { type: 'image/jpeg' }));
  await app.request(`/v1/clinic/cases/${c.ref}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${clinic.hubKey}` },
    body: form,
  });
  await clinicReq(clinic, `/v1/clinic/cases/${c.ref}/delivered`, { method: 'POST' });
  return c;
};

describe('saqlash worker (L9): delivered + 12 oy', () => {
  it('eski ishda ism/izoh/xabar NULL, fayl diskdan o‘chadi, narx qoladi, purged hodisasi; yangisi tegilmaydi', async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    const old = await deliver(lab, clinic);
    const fresh = await deliver(lab, clinic);
    await adminSql`UPDATE cases SET delivered_at = now() - interval '13 months' WHERE id = ${old.caseId}`;
    const [f] =
      (await adminSql`SELECT storage_key FROM case_files WHERE case_id = ${old.caseId}`) as unknown as [
        { storage_key: string },
      ];
    expect(existsSync(join(config.uploadsDir, f.storage_key))).toBe(true);

    const r1 = await runRetention(deps);
    expect(r1.purged).toBeGreaterThanOrEqual(1);
    const r2 = await runRetention(deps);
    expect(r2.purged).toBe(0); // idempotent

    const [row] = (await adminSql`
      SELECT patient_name_enc, note_enc, shade_enc, approved_price, purged_at FROM cases WHERE id = ${old.caseId}`) as unknown as [
      Record<string, unknown>,
    ];
    expect(row.patient_name_enc).toBeNull();
    expect(row.note_enc).toBeNull();
    expect(row.shade_enc).toBeNull();
    expect(row.approved_price).toBe('200000.00');
    expect(row.purged_at).not.toBeNull();
    const msgs =
      (await adminSql`SELECT body_enc FROM case_messages WHERE case_id = ${old.caseId}`) as unknown as {
        body_enc: string | null;
      }[];
    expect(msgs.every((m) => m.body_enc === null)).toBe(true);
    expect(existsSync(join(config.uploadsDir, f.storage_key))).toBe(false);
    const ev =
      (await adminSql`SELECT count(*)::int AS n FROM case_events WHERE case_id = ${old.caseId} AND type = 'purged'`) as unknown as [
        { n: number },
      ];
    expect(ev[0].n).toBe(1);

    const [freshRow] =
      (await adminSql`SELECT patient_name_enc, purged_at FROM cases WHERE id = ${fresh.caseId}`) as unknown as [
        Record<string, unknown>,
      ];
    expect(freshRow.patient_name_enc).not.toBeNull();
    expect(freshRow.purged_at).toBeNull();

    // Portal tozalangan ishni ochadi (ism yo'q), yiqilmaydi.
    const d = (await (await labReq(lab, `/v1/lab/cases/${old.caseId}`)).json()) as {
      case: { patientName: string | null };
    };
    expect(d.case.patientName).toBeNull();
    // Akt-sverka narxni saqlaydi.
    const period = new Date().toISOString().slice(0, 7);
    const s = (await (await labReq(lab, `/v1/lab/settlements?period=${period}`)).json()) as {
      rows: { totalApproved: string }[];
    };
    expect(s.rows[0]!.totalApproved).toBe('400000.00');
  });
});
