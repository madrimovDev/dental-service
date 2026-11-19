import { describe, expect, it } from 'bun:test';
import { adminSql, clinicReq, connectClinic, createLab, linkActive, sendCase } from './helpers';

/**
 * FX-98 / LB-07: kursor `<tx_id>.<seq>` klaster xid hisoblagichiga bog'liq. Hub bazasi
 * `pg_dump`dan YANGI klasterga tiklansa xid kichik sondan boshlanadi — eski kursor
 * yangi hodisalardan katta bo'lib, poll abadiy bo'sh qaytardi. Hub endi davr (epoch)
 * identifikatorini kursorga qo'shadi va mos kelmasa (yoki kursor tx'i shu klasterda
 * bo'lishi mumkin bo'lmagan darajada katta bo'lsa) kursorni boshidan boshlaydi.
 */
type Page = {
  events: { seq: number; txId: number; caseRef: string; type: string }[];
  nextCursor: string;
  cursorReset?: boolean;
};
type Clinic = Awaited<ReturnType<typeof connectClinic>>;

const changesOnce = async (clinic: Clinic, since: string) => {
  const res = await clinicReq(clinic, `/v1/clinic/changes?since=${encodeURIComponent(since)}`);
  expect(res.status).toBe(200);
  return (await res.json()) as Page;
};
/** Yakunlangan tranzaksiyalar chegarasi (xmin) — parallel yozuvchi uchun qisqa kutish. */
const changesUntil = async (clinic: Clinic, since: string, pred: (p: Page) => boolean) => {
  let page = await changesOnce(clinic, since);
  for (let i = 0; i < 50 && !pred(page); i++) {
    await Bun.sleep(100);
    page = await changesOnce(clinic, since);
  }
  return page;
};
const hasRef = (ref: string) => (p: Page) => p.events.some((e) => e.caseRef === ref);

const eventOf = async (ref: string) => {
  const [row] = (await adminSql`
    SELECT e.seq::bigint AS seq, e.tx_id::bigint AS tx FROM case_events e
    JOIN cases c ON c.id = e.case_id WHERE c.clinic_case_ref = ${ref}
    ORDER BY e.tx_id DESC, e.seq DESC LIMIT 1`) as unknown as { seq: string; tx: string }[];
  return row!;
};

const EPOCH_CURSOR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:\d+\.\d+$/;

describe('Hub davri (epoch) — kursor zaxiradan tiklashdan omon qoladi (FX-98)', () => {
  it('eski klaster kursori (tx joriy xid’dan katta) — boshidan beriladi, hodisa yo‘qolmaydi', async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    const { ref } = await sendCase(clinic, lab.labId);
    // Eski klasterda xid 9e15 gacha borgan; yangi klasterda hali juda kichik.
    const page = await changesUntil(clinic, '9000000000000000.7', hasRef(ref));
    expect(page.events.some((e) => e.caseRef === ref)).toBe(true);
    expect(page.cursorReset).toBe(true);
  });

  it('kursor davrni o‘z ichiga oladi; boshqa klaster dump’i tiklansa davr almashadi va kursor boshidan', async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    const first = await changesOnce(clinic, '0.0');
    expect(first.nextCursor).toMatch(EPOCH_CURSOR);
    const epoch = first.nextCursor.split(':')[0]!;

    const { ref } = await sendCase(clinic, lab.labId);
    await changesUntil(clinic, first.nextCursor, hasRef(ref));
    const ev = await eventOf(ref);
    // Kursor shu hodisadan o'tgan (bir xil davr) — qayta berilmaydi, reset yo'q.
    const past = `${epoch}:${ev.tx}.${ev.seq}`;
    const same = await changesOnce(clinic, past);
    expect(same.events.some((e) => e.caseRef === ref)).toBe(false);
    expect(same.cursorReset ?? false).toBe(false);
    expect(same.nextCursor.startsWith(`${epoch}:`)).toBe(true);

    // `pg_restore` boshqa klasterdan: hub_meta qatori eski klaster identifikatori bilan keldi.
    await adminSql`UPDATE hub_meta SET system_identifier = '0'`;
    const after = await changesOnce(clinic, past);
    expect(after.cursorReset).toBe(true);
    expect(after.events.some((e) => e.caseRef === ref)).toBe(true);
    const newEpoch = after.nextCursor.split(':')[0]!;
    expect(newEpoch).not.toBe(epoch);
    // Davr barqaror: keyingi so'rov yana almashtirmaydi.
    const again = await changesOnce(clinic, after.nextCursor);
    expect(again.cursorReset ?? false).toBe(false);
    expect(again.nextCursor.startsWith(`${newEpoch}:`)).toBe(true);
  });

  it('tiklangan (eski klaster xid’li, hali so‘ralmagan) hodisalar yangi klasterda ko‘rinadi — bir martadan, yangilaridan oldin', async () => {
    const lab = await createLab();
    const clinic = await connectClinic();
    await linkActive(lab, clinic);
    const first = await changesOnce(clinic, '0.0');
    const epoch = first.nextCursor.split(':')[0]!;

    // Shanba: lab ishni yubordi/tayyorladi — klinika (desktop o'chiq) hali so'ramagan.
    const { ref } = await sendCase(clinic, lab.labId);
    const [snap] = (await adminSql`
      SELECT (pg_snapshot_xmax(pg_current_snapshot())::text)::bigint AS xmax`) as unknown as {
      xmax: string;
    }[];
    const xmax = snap!.xmax;
    // Yakshanba dump, dushanba boshqa klasterga tiklash: qatorlar eski klaster xid'ini saqlaydi
    // (yangi klaster hisoblagichidan ancha katta) va hub_meta eski klaster identifikatori bilan.
    const oldTx = BigInt(xmax) + 5_000_000n;
    await adminSql`
      UPDATE case_events SET tx_id = ${oldTx.toString()}::bigint
       WHERE case_id IN (SELECT id FROM cases WHERE clinic_case_ref = ${ref})`;
    await adminSql`UPDATE hub_meta SET system_identifier = '0'`;
    const restored = (await adminSql`
      SELECT e.seq::bigint AS seq FROM case_events e JOIN cases c ON c.id = e.case_id
       WHERE c.clinic_case_ref = ${ref} ORDER BY e.seq`) as unknown as { seq: string }[];
    expect(restored.length).toBeGreaterThanOrEqual(1);

    // Seshanba: klinika eski davr kursori bilan so'raydi.
    const page = await changesOnce(clinic, `${epoch}:${(oldTx - 1n).toString()}.0`);
    expect(page.cursorReset).toBe(true);
    const got = page.events.filter((e) => e.caseRef === ref).map((e) => String(e.seq));
    expect(got).toEqual(restored.map((r) => String(r.seq)));
    // Dedup kaliti — saqlangan (eski klaster) xid, tiklashda o'zgarmaydi.
    const restoredEvents = page.events.filter((e) => e.caseRef === ref);
    expect(restoredEvents.every((e) => String(e.txId) === oldTx.toString())).toBe(true);

    // Yangi klasterdagi keyingi hodisa — tiklanganlardan keyin; tiklanganlar qayta berilmaydi.
    const { ref: ref2 } = await sendCase(clinic, lab.labId);
    const next = await changesUntil(clinic, page.nextCursor, hasRef(ref2));
    expect(next.cursorReset ?? false).toBe(false);
    expect(next.events.some((e) => e.caseRef === ref2)).toBe(true);
    expect(next.events.some((e) => e.caseRef === ref)).toBe(false);
    const tail = await changesOnce(clinic, next.nextCursor);
    expect(tail.events.some((e) => e.caseRef === ref || e.caseRef === ref2)).toBe(false);
  });
});
