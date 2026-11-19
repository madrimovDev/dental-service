/**
 * FT-07.1 — bot: «Mening yozilishlarim» (+bekor) va «Balans» (real DB + RLS).
 *   cd apps/api && bun test --env-file=../../.env tests/integration/ft-07-bot-self-service.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  cashierTransactions,
  patients,
  tenants,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createTelegramFlows } from '../../src/lib/telegram/flows.ts';
import { createAppointmentsService } from '../../src/modules/appointments/index.ts';
import { createPatientsService } from '../../src/modules/patients/patients.service.ts';
import { createScheduleService } from '../../src/modules/schedule/index.ts';

let tenantId: string;
let branchId: string;
let doctorId: string;
const run = <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant(tenantId, fn);

const audit = createAuditLogger({ db });
const schedule = createScheduleService({ audit });
const flows = createTelegramFlows({
  appointments: createAppointmentsService({ audit, schedule }),
  schedule,
  patients: createPatientsService({ audit }),
});

const DAY = 24 * 3600_000;
const inDays = (d: number, h = 10) => {
  const t = new Date(Date.now() + d * DAY);
  t.setUTCHours(h, 0, 0, 0);
  return t;
};

const seedPatient = (name: string, phone: string, chat: string | null) =>
  run(async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: name, phone, telegramChatId: chat })
      .returning({ id: patients.id });
    return p!.id;
  });

const seedAppt = (patientId: string, start: Date, status: string) =>
  run(async (tx) => {
    const [a] = await tx
      .insert(appointments)
      .values({
        tenantId,
        branchId,
        patientId,
        doctorId,
        startTime: start,
        endTime: new Date(start.getTime() + 30 * 60_000),
        serviceIds: [],
        status: status as 'scheduled',
      })
      .returning({ id: appointments.id });
    return a!.id;
  });

const statusOf = (id: string) =>
  run(async (tx) => {
    const [a] = await tx
      .select({ s: appointments.status })
      .from(appointments)
      .where(eq(appointments.id, id));
    return a!.s;
  });

const text = (chatId: string, t: string) =>
  run((tx) => flows.onText(tx, { tenantId, chatId, text: t }));
const cb = (chatId: string, data: string) =>
  run((tx) => flows.onCallback(tx, { tenantId, chatId, data }));

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900007001', passwordHash: 'x', fullName: 'Owner FT07' })
    .returning({ id: users.id });
  const [d] = await db
    .insert(users)
    .values({ phone: '+998900007002', passwordHash: 'x', fullName: 'Dr Karimov' })
    .returning({ id: users.id });
  doctorId = d!.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FT07', slug: 'ft07', ownerUserId: u!.id, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await run(async (tx) => {
    const [b] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Markaz filiali' })
      .returning({ id: branches.id });
    branchId = b!.id;
  });
});

describe('FT-07.1 menyu', () => {
  test('menyuda «Mening yozilishlarim» va «Balans» tugmalari bor', async () => {
    await seedPatient('Menyu Bemor', '+998907000010', '7010');
    const r = await run((tx) => flows.menuFor(tx, tenantId, '7010'));
    const flat = (r.keyboard ?? []).flat();
    expect(flat).toContain('📅 Mening yozilishlarim');
    expect(flat).toContain('💳 Balans');
  });
});

describe('FT-07.1 Mening yozilishlarim', () => {
  const chat = '7020';
  let mine1: string;
  let mine2: string;
  let past: string;
  let cancelled: string;
  let other: string;

  beforeAll(async () => {
    const me = await seedPatient('Bemor Yozilgan', '+998907000020', chat);
    const stranger = await seedPatient('Begona Bemor', '+998907000021', '7021');
    mine2 = await seedAppt(me, inDays(5), 'confirmed');
    mine1 = await seedAppt(me, inDays(2), 'scheduled');
    past = await seedAppt(me, inDays(-3), 'scheduled');
    cancelled = await seedAppt(me, inDays(3), 'cancelled');
    other = await seedAppt(stranger, inDays(2, 12), 'scheduled');
  });

  test("faqat o'z kelajakdagi faol yozilishlari, sanasi bo'yicha, doktor/filial bilan; bekor tugmalari", async () => {
    const r = await text(chat, '📅 Mening yozilishlarim');
    const data = (r.buttons ?? []).flat().map((b) => b.data);
    expect(data).toEqual([`rm:no:${mine1}`, `rm:no:${mine2}`]);
    for (const id of [past, cancelled, other]) expect(data).not.toContain(`rm:no:${id}`);
    expect(r.text).toContain('Dr Karimov');
    expect(r.text).toContain('Markaz filiali');
  });

  test("ruscha menyu tugmasi ham ishlaydi; yozilish yo'q bo'lsa aniq xabar", async () => {
    await seedPatient('Bo‘sh Bemor', '+998907000030', '7030');
    const r = await text('7030', '📅 Mening yozilishlarim');
    expect(r.buttons).toBeUndefined();
    expect(r.text).toBeTruthy();
    const ru = await text(chat, '📅 Мои записи');
    expect((ru.buttons ?? []).flat().length).toBe(2);
  });

  test('tugma orqali bekor qilinadi; begona chat boshqaning yozilishini bekor qila olmaydi', async () => {
    const steal = await cb('7021', `rm:no:${mine1}`);
    expect(steal.reply).toBeNull();
    expect(await statusOf(mine1)).toBe('scheduled');
    const ok = await cb(chat, `rm:no:${mine1}`);
    expect(ok.reply?.text).toBeTruthy();
    expect(await statusOf(mine1)).toBe('cancelled');
    expect(await statusOf(other)).toBe('scheduled');
    const after = await text(chat, '📅 Mening yozilishlarim');
    expect((after.buttons ?? []).flat().map((b) => b.data)).toEqual([`rm:no:${mine2}`]);
  });

  test("oilada bemor tanlanmagan bo'lsa avval tanlash so'raladi (boshqa bemor ma'lumoti ko'rinmaydi)", async () => {
    const phone = '+998907000040';
    const fam = '7040';
    const a = await seedPatient('Ota Oila', phone, fam);
    await seedPatient('Qiz Oila', phone, fam);
    await seedAppt(a, inDays(4), 'scheduled');
    const r = await text(fam, '📅 Mening yozilishlarim');
    expect((r.buttons ?? []).flat().every((b) => b.data.startsWith('pt:'))).toBe(true);
    expect(r.text).not.toContain('Markaz filiali');
  });
});

describe('FT-07.1 Balans', () => {
  const tx = (patientId: string, total: string, paid: string) =>
    run((db) =>
      db.insert(cashierTransactions).values({
        tenantId,
        branchId,
        patientId,
        totalAmount: total,
        paidAmount: paid,
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
      }),
    );

  test('qarz: faqat summa', async () => {
    const p = await seedPatient('Qarzdor', '+998907000050', '7050');
    await tx(p, '250000', '100000');
    const r = await text('7050', '💳 Balans');
    expect(r.text.replace(/\s/g, ' ')).toContain('150 000');
    expect(r.text.toLowerCase()).toContain('qarz');
  });

  test('avans (kredit)', async () => {
    const p = await seedPatient('Avansli', '+998907000051', '7051');
    await tx(p, '100000', '130000');
    const r = await text('7051', '💳 Balans');
    expect(r.text.replace(/\s/g, ' ')).toContain('30 000');
    expect(r.text.toLowerCase()).toContain('avans');
  });

  test('0 balans', async () => {
    await seedPatient('Nol', '+998907000052', '7052');
    const r = await text('7052', '💳 Balans');
    expect(r.text.toLowerCase()).toContain('yo‘q');
  });

  test("ulanmagan chat balans ko'ra olmaydi", async () => {
    const r = await text('9999999', '💳 Balans');
    expect(r.text).not.toContain('000');
  });
});
