/**
 * P8 — Telegram kontakt egaligi. Real DB (RLS) orqali `linkPatientByContact`.
 *   cd apps/api && bun test tests/integration/p8-telegram-contact.test.ts --env-file=../../.env
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { patients, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { linkPatientByContact } from '../../src/lib/telegram-bot-manager.ts';

let tenantId: string;

const seedPatient = (phone: string, telegramChatId: string | null) =>
  withTenant(tenantId, async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor', phone, telegramChatId })
      .returning({ id: patients.id });
    return p!.id;
  });

const chatOf = (id: string) =>
  withTenant(tenantId, async (tx) => {
    const [p] = await tx
      .select({ c: patients.telegramChatId })
      .from(patients)
      .where(eq(patients.id, id));
    return p!.c;
  });

const link = (o: { contactUserId?: number; fromId: number; phone: string; chatId: string }) =>
  withTenant(tenantId, (tx) => linkPatientByContact(tx, o));

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900000801', passwordHash: 'x', fullName: 'Owner P8' })
    .returning({ id: users.id });
  const [t] = await db
    .insert(tenants)
    .values({ name: 'P8 Clinic', slug: 'p8-tg', ownerUserId: u!.id, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  tenantId = t!.id;
});

describe('P8 linkPatientByContact', () => {
  test("begona kontakt → not_own_contact, bemor o'zgarmaydi", async () => {
    const id = await seedPatient('+998901110001', null);
    const r = await link({
      contactUserId: 999,
      fromId: 111,
      phone: '+998901110001',
      chatId: '111',
    });
    expect(r).toBe('not_own_contact');
    expect(await chatOf(id)).toBeNull();
  });

  test('contact.user_id yo‘q → not_own_contact', async () => {
    const id = await seedPatient('+998901110002', null);
    const r = await link({ fromId: 111, phone: '+998901110002', chatId: '111' });
    expect(r).toBe('not_own_contact');
    expect(await chatOf(id)).toBeNull();
  });

  test("o'z kontakti, chat yo'q → linked", async () => {
    const id = await seedPatient('+998901110003', null);
    const r = await link({
      contactUserId: 222,
      fromId: 222,
      phone: '+998901110003',
      chatId: '222',
    });
    expect(r).toBe('linked');
    expect(await chatOf(id)).toBe('222');
  });

  test('boshqa chat bilan bog‘langan → already_linked, eski chat saqlanadi', async () => {
    const id = await seedPatient('+998901110004', '555');
    const r = await link({
      contactUserId: 333,
      fromId: 333,
      phone: '+998901110004',
      chatId: '333',
    });
    expect(r).toBe('already_linked');
    expect(await chatOf(id)).toBe('555');
  });

  test('xuddi shu chat → linked', async () => {
    const id = await seedPatient('+998901110005', '444');
    const r = await link({
      contactUserId: 444,
      fromId: 444,
      phone: '+998901110005',
      chatId: '444',
    });
    expect(r).toBe('linked');
    expect(await chatOf(id)).toBe('444');
  });

  test('telefon topilmadi → not_found', async () => {
    const r = await link({
      contactUserId: 777,
      fromId: 777,
      phone: '+998909999999',
      chatId: '777',
    });
    expect(r).toBe('not_found');
  });
});
