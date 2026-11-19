/**
 * FX-42 — oilaviy telefon: bir Telegram chat'ga bir nechta bemor (real DB + RLS).
 *   cd apps/api && bun test tests/integration/fx-42-family-telegram.test.ts --env-file=../../.env
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { medicalRecords, patients, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createTelegramFlows } from '../../src/lib/telegram/flows.ts';
import { linkPatientByContact } from '../../src/lib/telegram-bot-manager.ts';
import { createAppointmentsService } from '../../src/modules/appointments/index.ts';
import { createScheduleService } from '../../src/modules/schedule/index.ts';

let tenantId: string;
const run = <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant(tenantId, fn);

const audit = createAuditLogger({ db });
const schedule = createScheduleService({ audit });
const flows = createTelegramFlows({
  appointments: createAppointmentsService({ audit, schedule }),
  schedule,
});

const seed = (fullName: string, phone: string, chat: string | null, createdAt: Date) =>
  run(async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName, phone, telegramChatId: chat, createdAt })
      .returning({ id: patients.id });
    return p!.id;
  });

const chatOf = (id: string) =>
  run(async (tx) => {
    const [p] = await tx
      .select({ c: patients.telegramChatId })
      .from(patients)
      .where(eq(patients.id, id));
    return p!.c;
  });

const link = (phone: string, chatId: string) =>
  run((tx) =>
    linkPatientByContact(tx, { contactUserId: 1, fromId: 1, phone, chatId, chatType: 'private' }),
  );

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900004200', passwordHash: 'x', fullName: 'Owner FX42' })
    .returning({ id: users.id });
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX42', slug: 'fx42', ownerUserId: u!.id, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  tenantId = t!.id;
});

describe('FX-42 linkPatientByContact — oila', () => {
  test("bir telefondagi barcha bemorlar (bola onadan eski bo'lsa ham) shu chat'ga bog'lanadi", async () => {
    const phone = '+998901420001';
    const kid1 = await seed('Bola Bir', phone, null, new Date('2020-01-01'));
    const mom = await seed('Ona', phone, null, new Date('2021-01-01'));
    const kid2 = await seed('Bola Ikki', phone, null, new Date('2022-01-01'));
    expect(await link(phone, '9001')).toBe('linked');
    expect(await chatOf(kid1)).toBe('9001');
    expect(await chatOf(mom)).toBe('9001');
    expect(await chatOf(kid2)).toBe('9001');
  });

  test("bittasi boshqa chat'da bo'lsa — qolganlari bog'lanadi, boshqasining chat'i saqlanadi", async () => {
    const phone = '+998901420002';
    const a = await seed('A', phone, '7777', new Date('2020-01-01'));
    const b = await seed('B', phone, null, new Date('2021-01-01'));
    expect(await link(phone, '9002')).toBe('linked');
    expect(await chatOf(a)).toBe('7777');
    expect(await chatOf(b)).toBe('9002');
  });

  test("hammasi boshqa chat'da → already_linked", async () => {
    const phone = '+998901420003';
    const a = await seed('A', phone, '7778', new Date('2020-01-01'));
    expect(await link(phone, '9003')).toBe('already_linked');
    expect(await chatOf(a)).toBe('7778');
  });
});

describe('FX-42 bot oqimlari — bemor tanlash', () => {
  const phone = '+998901420010';
  const chat = '9010';
  let mom: string;
  let kid: string;

  beforeAll(async () => {
    kid = await seed('Bola Aliyev', phone, chat, new Date('2020-01-01')); // onadan ESKI
    mom = await seed('Ona Aliyeva', phone, chat, new Date('2021-01-01'));
  });

  const text = (t: string) => run((tx) => flows.onText(tx, { tenantId, chatId: chat, text: t }));
  const cb = (data: string, chatId = chat) =>
    run((tx) => flows.onCallback(tx, { tenantId, chatId, data }));
  const draftOf = (id: string) =>
    run(async (tx) => {
      const [r] = await tx
        .select({ a: medicalRecords.questionnaireAnswers })
        .from(medicalRecords)
        .where(eq(medicalRecords.patientId, id));
      return r?.a ?? null;
    });

  test("tanlanmagan chat: anketa so'ralsa avval bemor tanlash (jim eng eskisini olmaydi)", async () => {
    const r = await run((tx) => flows.onCommand(tx, { tenantId, chatId: chat, command: 'anketa' }));
    const data = (r.buttons ?? []).flat().map((b) => b.data);
    expect(data).toContain(`pt:${kid}`);
    expect(data).toContain(`pt:${mom}`);
    expect(await draftOf(kid)).toBeNull();
  });

  test('ona tanlanadi → anketa onaning kartasiga yoziladi, bolaga emas', async () => {
    const sel = await cb(`pt:${mom}`);
    expect(sel.reply?.text).toContain('Ona Aliyeva');
    const start = await run((tx) =>
      flows.onCommand(tx, { tenantId, chatId: chat, command: 'anketa' }),
    );
    expect(start.text).toBeTruthy();
    for (const a of ['yo‘q', 'yo‘q', 'yo‘q', 'yo‘q', 'yo‘q']) await text(a);
    expect(await draftOf(mom)).not.toBeNull();
    expect(await draftOf(kid)).toBeNull();
  });

  test('bemorni almashtirish tugmasi menyuda; almashtirgach anketa bolaga', async () => {
    const menu = await run((tx) => flows.menuFor(tx, tenantId, chat));
    const flat = (menu.keyboard ?? []).flat();
    const switchBtn = flat.find((b) => b.includes('👤'));
    expect(switchBtn).toBeTruthy();
    const picker = await text(switchBtn as string);
    expect((picker.buttons ?? []).flat().map((b) => b.data)).toContain(`pt:${kid}`);
    await cb(`pt:${kid}`);
    await run((tx) => flows.onCommand(tx, { tenantId, chatId: chat, command: 'anketa' }));
    for (const a of ['bor', 'yo‘q', 'yo‘q', 'yo‘q', 'yo‘q']) await text(a);
    expect((await draftOf(kid)) as Record<string, string>).toMatchObject({ allergies: 'bor' });
  });

  test('begona chat `pt:` bilan boshqa oilaning bemorini tanlay olmaydi', async () => {
    const stranger = await seed('Begona', '+998901420099', '9099', new Date('2022-01-01'));
    const r = await cb(`pt:${stranger}`);
    expect(r.reply).toBeNull();
    // tanlov o'zgarmagan: hali ham kid bo'yicha ishlaydi (stranger emas)
    expect(r.toast).toBeTruthy();
    const r2 = await cb(`pt:${kid}`, '9555');
    expect(r2.reply).toBeNull();
  });

  test('eslatma tugmasi bemor tanlanmasa ham ishlaydi (egasi yozilish bemori)', async () => {
    const fam = '+998901420030';
    await seed('Ota', fam, '9030', new Date('2020-01-01'));
    await seed('Qiz', fam, '9030', new Date('2021-01-01'));
    const r = await cb('rm:ok:00000000-0000-0000-0000-000000000000', '9030');
    expect(r.reply).toBeNull();
    expect(r.toast).toBeTruthy(); // notFound toast — tanlash menyusi emas
    const other = await cb('bk:x', '9030');
    expect(other.reply?.buttons?.flat().some((b) => b.data.startsWith('pt:'))).toBe(true);
  });

  test("bitta bemorli chat'da tanlov so'ralmaydi (oldingi xulq)", async () => {
    await seed('Yolg‘iz', '+998901420020', '9020', new Date('2020-01-01'));
    const r = await run((tx) => flows.onCommand(tx, { tenantId, chatId: '9020', command: 'menu' }));
    expect(r.keyboard).toBeTruthy();
    expect((r.keyboard ?? []).flat().some((b) => b.includes('👤'))).toBe(false);
  });
});
