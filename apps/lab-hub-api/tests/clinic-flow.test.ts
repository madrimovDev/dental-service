import { describe, expect, it } from 'bun:test';
import {
  adminSql,
  caseBody,
  clinicReq,
  connectClinic,
  createLab,
  labReq,
  linkActive,
  sendCase,
} from './helpers';

type Ev = {
  seq: number;
  caseRef: string;
  type: string;
  actor: string;
  payload: Record<string, unknown>;
  message?: { body: string | null } | null;
};

type Page = { events: Ev[]; nextCursor: string };
const changesOnce = async (clinic: Awaited<ReturnType<typeof connectClinic>>, since: string) =>
  (await (await clinicReq(clinic, `/v1/clinic/changes?since=${since}`)).json()) as Page;

/**
 * Kursor faqat yakunlangan tranzaksiyalar hodisalarini beradi (`tx_id < xmin`) —
 * shu klasterdagi boshqa (parallel lane) yozuvchi tranzaksiya chegarani bir lahza
 * ushlab turishi mumkin, shuning uchun kutilgan sonni qisqa kutamiz.
 */
const changes = async (
  clinic: Awaited<ReturnType<typeof connectClinic>>,
  since: string,
  expected = 0,
): Promise<Page> => {
  let page = await changesOnce(clinic, since);
  for (let i = 0; i < 50 && page.events.length < expected; i++) {
    await Bun.sleep(100);
    page = await changesOnce(clinic, since);
  }
  return page;
};

describe('klinika oqimi', () => {
  it('PUT idempotent: qayta yuborish dublikat yaratmaydi, sent holatda yangilaydi', async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    const ref = crypto.randomUUID();
    const first = await clinicReq(clinic, `/v1/clinic/cases/${ref}`, {
      method: 'PUT',
      body: caseBody(lab.labId),
    });
    expect(first.status).toBe(200);
    const a = (await first.json()) as { caseId: string; created: boolean; applied: boolean };
    expect(a.created).toBe(true);

    // Tarmoq uzilib, outbox xuddi shu so'rovni qayta yuboradi (va parallel ham).
    const [r1, r2] = await Promise.all([
      clinicReq(clinic, `/v1/clinic/cases/${ref}`, {
        method: 'PUT',
        body: caseBody(lab.labId, { note: 'yangi izoh' }),
      }),
      clinicReq(clinic, `/v1/clinic/cases/${ref}`, {
        method: 'PUT',
        body: caseBody(lab.labId, { note: 'yangi izoh' }),
      }),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const b = (await r1.json()) as { caseId: string; created: boolean };
    expect(b.caseId).toBe(a.caseId);
    expect(b.created).toBe(false);

    const [{ n }] = (await adminSql`
      SELECT count(*)::int AS n FROM cases WHERE clinic_id = ${clinic.clinicId} AND clinic_case_ref = ${ref}`) as unknown as [
      { n: number },
    ];
    expect(n).toBe(1);

    const detail = (await (await labReq(lab, `/v1/lab/cases/${a.caseId}`)).json()) as {
      case: { note: string; patientName: string };
    };
    expect(detail.case.note).toBe('yangi izoh');
    expect(detail.case.patientName).toBe('Karimova Dilnoza Rustamovna');

    // Lab qabul qilgach — yangilash qo'llanmaydi (applied:false), 200.
    await labReq(lab, `/v1/lab/cases/${a.caseId}/status`, {
      method: 'POST',
      body: { to: 'accepted' },
    });
    const late = await clinicReq(clinic, `/v1/clinic/cases/${ref}`, {
      method: 'PUT',
      body: caseBody(lab.labId, { note: 'kech' }),
    });
    expect(late.status).toBe(200);
    expect(((await late.json()) as { applied: boolean }).applied).toBe(false);
  });

  it("PHI chegarasi: telefon/manzil maydonlari bilan so'rov 400 (strict sxema)", async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    for (const extra of [
      { patient: { fullName: 'X', phone: '+998901112233' } },
      { address: 'Toshkent' },
      { patientPhone: '+998901112233' },
    ]) {
      const res = await clinicReq(clinic, `/v1/clinic/cases/${crypto.randomUUID()}`, {
        method: 'PUT',
        body: { ...caseBody(lab.labId), ...extra },
      });
      expect(res.status).toBe(400);
    }
  });

  it('changes kursori: faqat yangi hodisalar, tartib bilan, kursor oldinga suriladi', async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    const start = await changes(clinic, '0.0');
    const c = await sendCase(clinic, lab.labId);

    await labReq(lab, `/v1/lab/cases/${c.caseId}/status`, {
      method: 'POST',
      body: { to: 'accepted' },
    });
    await labReq(lab, `/v1/lab/cases/${c.caseId}/messages`, {
      method: 'POST',
      body: { body: 'Rang aniqmi?' },
    });
    await labReq(lab, `/v1/lab/cases/${c.caseId}/price`, {
      method: 'POST',
      body: { price: 450000 },
    });

    const page = await changes(clinic, start.nextCursor, 4);
    const types = page.events.map((e) => e.type);
    expect(types).toEqual(['created', 'status', 'message', 'price_proposed']);
    const seqs = page.events.map((e) => e.seq);
    expect([...seqs].sort((x, y) => x - y)).toEqual(seqs);
    expect(page.events.every((e) => e.caseRef === c.ref)).toBe(true);
    expect(page.events[1]!.payload.to).toBe('accepted');
    expect(page.events[2]!.message?.body).toBe('Rang aniqmi?');
    expect(page.events[3]!.payload.price).toBe('450000.00');
    expect(page.nextCursor.endsWith(`.${seqs.at(-1)!}`)).toBe(true);

    const again = await changes(clinic, page.nextCursor);
    expect(again.events.length).toBe(0);
    expect(again.nextCursor).toBe(page.nextCursor);
  });

  it('kursor commit-xavfsiz: kichik seq’li hodisa kechroq commit bo‘lsa ham o‘tkazib yuborilmaydi', async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    const c = await sendCase(clinic, lab.labId);
    const start = await changes(clinic, '0.0', 1);
    expect(start.events.map((e) => e.type)).toEqual(['created']);

    // T1: hodisa yozadi (kichikroq seq oladi), lekin hali commit qilmaydi.
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let inserted!: (seq: number) => void;
    const t1Seq = new Promise<number>((r) => {
      inserted = r;
    });
    const t1 = adminSql.begin(async (sql) => {
      const [row] = await sql`
        INSERT INTO case_events (lab_id, clinic_id, case_id, type, actor, payload)
        VALUES (${lab.labId}, ${clinic.clinicId}, ${c.caseId}, 'status', 'system', '{}'::jsonb)
        RETURNING seq`;
      inserted(Number(row!.seq));
      await gate;
    });
    const s1 = await t1Seq;

    // T2: kattaroq seq bilan darhol commit bo'ladi.
    let during: Page;
    try {
      const msg = await labReq(lab, `/v1/lab/cases/${c.caseId}/messages`, {
        method: 'POST',
        body: { body: 'Kechikkan hodisa testi' },
      });
      expect(msg.status).toBe(201);
      // T1 ochiq turganda: T2 hodisasi (s2 > s1) HALI berilmaydi — aks holda kursor
      // s1'dan oshib ketib, T1 commit bo'lgach s1 abadiy yo'qolardi.
      during = await changesOnce(clinic, start.nextCursor);
    } finally {
      release();
      await t1;
    }
    expect(during.events.length).toBe(0);
    expect(during.nextCursor).toBe(start.nextCursor);

    const after = await changes(clinic, during.nextCursor, 2);
    const seqs = after.events.map((e) => e.seq);
    expect(seqs).toContain(s1);
    expect(after.events.map((e) => e.type).sort()).toEqual(['message', 'status']);
    expect(Math.max(...seqs)).toBeGreaterThan(s1);
  });

  it('ulanish bekor qilinsa: yangi ish 403, mavjud ish ikkala tomonda davom etadi', async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    const sent = await sendCase(clinic, lab.labId);
    const progressing = await sendCase(clinic, lab.labId);
    await labReq(lab, `/v1/lab/cases/${progressing.caseId}/status`, {
      method: 'POST',
      body: { to: 'accepted' },
    });

    const { links } = (await (await clinicReq(clinic, '/v1/clinic/links')).json()) as {
      links: { id: string; labId: string }[];
    };
    const link = links.find((l) => l.labId === lab.labId)!;
    const rv = await labReq(lab, `/v1/lab/links/${link.id}/decision`, {
      method: 'POST',
      body: { decision: 'revoke' },
    });
    expect(rv.status).toBe(200);

    // Yangi ish — bloklanadi.
    const fresh = await clinicReq(clinic, `/v1/clinic/cases/${crypto.randomUUID()}`, {
      method: 'PUT',
      body: caseBody(lab.labId),
    });
    expect(fresh.status).toBe(403);
    expect(((await fresh.json()) as { error: { code: string } }).error.code).toBe(
      'link.not_active',
    );

    // Mavjud ishlar — davom etadi: klinika qayta yuboradi/xabar yozadi, lab holatni suradi.
    const resend = await clinicReq(clinic, `/v1/clinic/cases/${sent.ref}`, {
      method: 'PUT',
      body: caseBody(lab.labId, { shade: 'A3' }),
    });
    expect(resend.status).toBe(200);
    expect(((await resend.json()) as { applied: boolean }).applied).toBe(true);
    const msg = await clinicReq(clinic, `/v1/clinic/cases/${progressing.ref}/messages`, {
      method: 'POST',
      body: { body: 'Davom etamiz' },
    });
    expect(msg.status).toBe(201);
    const st = await labReq(lab, `/v1/lab/cases/${progressing.caseId}/status`, {
      method: 'POST',
      body: { to: 'in_progress' },
    });
    expect(st.status).toBe(200);
  });

  it('narx tasdig‘i: ikki marta (parallel ham) bosilsa bitta tasdiq, mos kelmagan narx 409', async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    const c = await sendCase(clinic, lab.labId);

    const early = await clinicReq(clinic, `/v1/clinic/cases/${c.ref}/approve-price`, {
      method: 'POST',
      body: { price: 100 },
    });
    expect(early.status).toBe(409);

    await labReq(lab, `/v1/lab/cases/${c.caseId}/price`, {
      method: 'POST',
      body: { price: 300000 },
    });
    const mismatch = await clinicReq(clinic, `/v1/clinic/cases/${c.ref}/approve-price`, {
      method: 'POST',
      body: { price: 299999 },
    });
    expect(mismatch.status).toBe(409);

    const [x, y] = await Promise.all([
      clinicReq(clinic, `/v1/clinic/cases/${c.ref}/approve-price`, {
        method: 'POST',
        body: { price: 300000 },
      }),
      clinicReq(clinic, `/v1/clinic/cases/${c.ref}/approve-price`, {
        method: 'POST',
        body: { price: 300000 },
      }),
    ]);
    expect(x.status).toBe(200);
    expect(y.status).toBe(200);
    const flags = [
      ((await x.json()) as { alreadyApproved: boolean }).alreadyApproved,
      ((await y.json()) as { alreadyApproved: boolean }).alreadyApproved,
    ].sort();
    expect(flags).toEqual([false, true]);

    const ev = (await adminSql`
      SELECT count(*)::int AS n FROM case_events WHERE case_id = ${c.caseId} AND type = 'price_approved'`) as unknown as [
      { n: number },
    ];
    expect(ev[0].n).toBe(1);

    // Tasdiqlangandan keyin lab narxni o'zgartira olmaydi.
    const re = await labReq(lab, `/v1/lab/cases/${c.caseId}/price`, {
      method: 'POST',
      body: { price: 1 },
    });
    expect(re.status).toBe(409);
  });

  it('holat oqimi: ready → delivered (idempotent) → remake → lab qayta qabul qiladi', async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    const c = await sendCase(clinic, lab.labId);
    const st = (to: string, extra = {}) =>
      labReq(lab, `/v1/lab/cases/${c.caseId}/status`, { method: 'POST', body: { to, ...extra } });

    expect((await st('ready')).status).toBe(409); // sent → ready taqiqlangan
    expect(
      (await clinicReq(clinic, `/v1/clinic/cases/${c.ref}/delivered`, { method: 'POST' })).status,
    ).toBe(409);
    expect((await st('accepted')).status).toBe(200);
    expect((await st('in_progress')).status).toBe(200);
    expect((await st('ready')).status).toBe(200);
    expect(
      (await clinicReq(clinic, `/v1/clinic/cases/${c.ref}/delivered`, { method: 'POST' })).status,
    ).toBe(200);
    expect(
      (await clinicReq(clinic, `/v1/clinic/cases/${c.ref}/delivered`, { method: 'POST' })).status,
    ).toBe(200);
    const remake = await clinicReq(clinic, `/v1/clinic/cases/${c.ref}/remake`, {
      method: 'POST',
      body: { reason: 'Rang mos emas' },
    });
    expect(remake.status).toBe(200);
    const d = (await (await clinicReq(clinic, `/v1/clinic/cases/${c.ref}`)).json()) as {
      case: { status: string; deliveredAt: string | null };
      messages: { body: string }[];
    };
    expect(d.case.status).toBe('remake');
    expect(d.case.deliveredAt).toBeNull();
    expect(d.messages.some((m) => m.body === 'Rang mos emas')).toBe(true);
    expect((await st('accepted')).status).toBe(200);
    expect((await st('rejected')).status).toBe(400); // sababsiz rad etib bo'lmaydi
  });
});
