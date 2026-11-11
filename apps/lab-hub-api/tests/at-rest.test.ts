import { describe, expect, it } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  adminSql,
  app,
  clinicReq,
  config,
  connectClinic,
  createLab,
  labReq,
  linkActive,
  sendCase,
} from './helpers';

// Review Focus 2: bazada va diskda bemor ismi/fayl ochiq holda yo'q.
describe('saqlashda shifrlash (xom SQL + disk)', () => {
  it("bemor ismi, izoh, rang, xabar, fayl nomi bazada ochiq ko'rinmaydi", async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    const c = await sendCase(clinic, lab.labId);
    await clinicReq(clinic, `/v1/clinic/cases/${c.ref}/messages`, {
      method: 'POST',
      body: { body: 'MAXFIY-XABAR-123' },
    });
    const form = new FormData();
    form.append(
      'file',
      new File([Buffer.from('solid KARIMOVA-STL-MARKER')], 'Karimova_skan.stl', {
        type: 'model/stl',
      }),
    );
    const up = await app.request(`/v1/clinic/cases/${c.ref}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clinic.hubKey}` },
      body: form,
    });
    expect(up.status).toBe(201);

    // Superuser — RLS'siz, butun qatorni matn sifatida qidiramiz.
    const dump = (await adminSql`
      SELECT row_to_json(x)::text AS j FROM (
        SELECT * FROM cases WHERE id = ${c.caseId}) x
      UNION ALL SELECT row_to_json(m)::text FROM case_messages m WHERE case_id = ${c.caseId}
      UNION ALL SELECT row_to_json(f)::text FROM case_files f WHERE case_id = ${c.caseId}
      UNION ALL SELECT row_to_json(e)::text FROM case_events e WHERE case_id = ${c.caseId}`) as unknown as {
      j: string;
    }[];
    const all = dump.map((r) => r.j).join('\n');
    expect(all.length).toBeGreaterThan(100);
    for (const secret of [
      'Karimova',
      'Dilnoza',
      'sezgir',
      'MAXFIY-XABAR',
      'A2"',
      'Karimova_skan',
    ]) {
      expect(all).not.toContain(secret);
    }
    expect(all).toContain('v1:'); // shifrlangan maydonlar bor
    const [labRow] =
      (await adminSql`SELECT dek_wrapped FROM labs WHERE id = ${lab.labId}`) as unknown as [
        { dek_wrapped: string },
      ];
    expect(labRow.dek_wrapped.startsWith('v1:')).toBe(true);

    // Diskda — faqat shifrlangan blob.
    const files = await readdir(join(config.uploadsDir, lab.labId));
    expect(files.length).toBe(1);
    const blob = await readFile(join(config.uploadsDir, lab.labId, files[0]!));
    expect(blob.includes(Buffer.from('KARIMOVA-STL-MARKER'))).toBe(false);

    // API orqali esa to'g'ri deshifrlanadi.
    const d = (await (await labReq(lab, `/v1/lab/cases/${c.caseId}`)).json()) as {
      case: { patientName: string; shade: string };
      files: { fileName: string }[];
      messages: { body: string }[];
    };
    expect(d.case.patientName).toBe('Karimova Dilnoza Rustamovna');
    expect(d.case.shade).toBe('A2');
    expect(d.files[0]!.fileName).toBe('Karimova_skan.stl');
    expect(d.messages[0]!.body).toBe('MAXFIY-XABAR-123');
  });
});
