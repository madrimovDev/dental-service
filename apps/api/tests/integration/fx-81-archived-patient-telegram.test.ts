/**
 * FX-81 — arxivlangan bemor Telegram/recall oqimlarida faol hisoblanmaydi (REAL DB, RLS app-rol).
 *
 *   cd apps/api && bun test tests/integration/fx-81-archived-patient-telegram.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { patients, recallLogs, recalls, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createAdminDb, db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { processRecallScan } from '../../src/lib/recall-worker.ts';
import { createTelegramFlows } from '../../src/lib/telegram/flows.ts';
import { linkPatientByContact } from '../../src/lib/telegram-bot-manager.ts';

const admin = createAdminDb();
const flows = createTelegramFlows({} as never);

let tenantId: string;
const now = new Date('2026-06-21T07:00:00Z');

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [o] = await db
    .insert(users)
    .values({ phone: '+998900000081', passwordHash: 'x', fullName: 'Owner81' })
    .returning({ id: users.id });
  const [t] = await db
    .insert(tenants)
    .values({ name: 'fx81', slug: 'fx81', ownerUserId: o!.id })
    .returning({ id: tenants.id });
  tenantId = t!.id;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await admin.client.end({ timeout: 5 });
});

const mk = (v: { phone: string; chat?: string | null; archived?: boolean }) =>
  withTenant(tenantId, async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({
        tenantId,
        fullName: 'Bemor',
        phone: v.phone,
        telegramChatId: v.chat ?? null,
        archivedAt: v.archived ? new Date() : null,
      })
      .returning({ id: patients.id });
    return p!.id;
  });

describe('FX-81 — arxivlangan bemor', () => {
  test('kontakt ulashish: arxivlangan bemor bog‘lanmaydi (not_found), faol yoki keyingisi bog‘lanadi', async () => {
    const archivedId = await mk({ phone: '+998901008101', archived: true });
    const out = await withTenant(tenantId, (tx) =>
      linkPatientByContact(tx, {
        contactUserId: 7,
        fromId: 7,
        phone: '+998901008101',
        chatId: '8101',
        chatType: 'private', // FX-84: faqat shaxsiy chat bog'lanadi
      }),
    );
    expect(out).toBe('not_found');
    const [row] = await withTenant(tenantId, (tx) =>
      tx.select({ c: patients.telegramChatId }).from(patients).where(eq(patients.id, archivedId)),
    );
    expect(row!.c).toBeNull();

    // Bir xil raqamda faol bemor ham bor — u (arxivlangandan eski bo'lmasa ham) tanlanadi.
    await mk({ phone: '+998901008102', archived: true });
    const activeId = await mk({ phone: '+998901008102' });
    const out2 = await withTenant(tenantId, (tx) =>
      linkPatientByContact(tx, {
        contactUserId: 8,
        fromId: 8,
        phone: '+998901008102',
        chatId: '8102',
        chatType: 'private', // FX-84: faqat shaxsiy chat bog'lanadi
      }),
    );
    expect(out2).toBe('linked');
    const [r2] = await withTenant(tenantId, (tx) =>
      tx.select({ c: patients.telegramChatId }).from(patients).where(eq(patients.id, activeId)),
    );
    expect(r2!.c).toBe('8102');
  });

  test('bot menyusi: chat arxivlangan bemorga bog‘langan bo‘lsa — «ulanmagan»', async () => {
    await mk({ phone: '+998901008103', chat: '8103', archived: true });
    const r = await withTenant(tenantId, (tx) => flows.menuFor(tx, tenantId, '8103'));
    expect(r.keyboard).toBeUndefined();
  });

  test('recall scan: arxivlangan bemor recall’i yuborilmaydi/skanerlanmaydi', async () => {
    await admin.db.delete(recallLogs);
    await admin.db.delete(recalls);
    const pid = await mk({ phone: '+998901008104', archived: true });
    await withTenant(tenantId, (tx) =>
      tx.insert(recalls).values({
        tenantId,
        patientId: pid,
        reason: 'preventive',
        status: 'pending',
        source: 'scheduler',
        dueDate: '2020-01-01',
      }),
    );
    const res = await processRecallScan({ adminDb: admin.db, withTenant, now });
    expect(res.scanned).toBe(0);
    const logs = await admin.db.select().from(recallLogs);
    expect(logs).toHaveLength(0);
  });
});
