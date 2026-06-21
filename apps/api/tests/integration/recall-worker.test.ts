/**
 * B7 recall worker (cross-tenant scan) integratsiya testi — real DB + ADMIN conn
 * (Qaror #23). `processRecallScan` pure/injectable — admin db + tracking SMS +
 * withTenant bilan haydaladi (Redis'siz).
 *
 * Bitta faylni ALOHIDA ishlating (TRUNCATE race):
 *   cd apps/api && bun test tests/integration/recall-worker.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { branches, patients, recallLogs, recalls, tenants } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createAdminDb, db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { processRecallScan } from '../../src/lib/recall-worker.ts';

const admin = createAdminDb();

// Tracking SMS — yuborilganlarni kuzatadi, ok=true qaytaradi.
let smsSent: { to: string; text: string }[] = [];
const sms = {
  send: async (to: string, msg: { text: string }) => {
    smsSent.push({ to, text: msg.text });
    return { ok: true as const, providerId: 'mock-1' };
  },
};

let tA: string;
let tB: string;
let ownerId: string;

const seedTenant = async (slug: string, lang: 'uz' | 'ru', name: string) => {
  const [t] = await db
    .insert(tenants)
    .values({ name, slug, ownerUserId: ownerId, defaultLanguage: lang })
    .returning({ id: tenants.id });
  return t!.id;
};

const seedRecall = async (
  tenantId: string,
  opts: { dueDate: string; phone: string | null; patientName?: string },
) =>
  withTenant(tenantId, async (tx) => {
    await tx.insert(branches).values({ tenantId, name: 'B' });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: opts.patientName ?? 'Bemor', phone: opts.phone })
      .returning({ id: patients.id });
    const [r] = await tx
      .insert(recalls)
      .values({
        tenantId,
        patientId: p!.id,
        reason: 'preventive',
        status: 'pending',
        source: 'scheduler',
        dueDate: opts.dueDate,
      })
      .returning({ id: recalls.id });
    return r!.id;
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const { users } = await import('@dental/db-schema');
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000099', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  tA = await seedTenant('rw-a', 'uz', 'Klinika A');
  tB = await seedTenant('rw-b', 'ru', 'Klinika B');
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await admin.client.end({ timeout: 5 });
});

beforeEach(async () => {
  smsSent = [];
  // Recall'larni ikkala tenant'dan tozalaymiz (admin conn — RLS bypass).
  await admin.db.delete(recallLogs);
  await admin.db.delete(recalls);
});

const yesterday = '2020-01-01'; // o'tmish — har doim due.

describe('B7 processRecallScan cross-tenant', () => {
  test('scans across tenants (admin conn) → SMS sent + status=contacted + log', async () => {
    const rA = await seedRecall(tA, {
      dueDate: yesterday,
      phone: '+998901112233',
      patientName: 'Ali',
    });
    const rB = await seedRecall(tB, {
      dueDate: yesterday,
      phone: '+998905556677',
      patientName: 'Иван',
    });

    const res = await processRecallScan({ adminDb: admin.db, sms, withTenant });
    expect(res.scanned).toBe(2);
    expect(res.sent).toBe(2);

    // Ikkala tenant'ga ham SMS, tilga mos.
    const uzSms = smsSent.find((s) => s.to === '+998901112233');
    const ruSms = smsSent.find((s) => s.to === '+998905556677');
    expect(uzSms!.text).toContain('Ali');
    expect(uzSms!.text).toContain('Klinika A');
    expect(uzSms!.text).toContain('profilaktik');
    expect(ruSms!.text).toContain('Иван');
    expect(ruSms!.text).toContain('профилактический');

    // Status contacted + log row (per-tenant RLS).
    const sA = await withTenant(tA, (tx) =>
      tx.select({ status: recalls.status }).from(recalls).where(eq(recalls.id, rA)),
    );
    expect(sA[0]!.status).toBe('contacted');
    const logsB = await withTenant(tB, (tx) =>
      tx.select().from(recallLogs).where(eq(recallLogs.recallId, rB)),
    );
    expect(logsB.length).toBe(1);
    expect(logsB[0]!.outcome).toBe('sent');
  });

  test('already-contacted skipped (idempotent re-scan)', async () => {
    await seedRecall(tA, { dueDate: yesterday, phone: '+998901112233' });
    await processRecallScan({ adminDb: admin.db, sms, withTenant });
    smsSent = [];
    // Ikkinchi scan — endi pending yo'q → 0 SMS.
    const res2 = await processRecallScan({ adminDb: admin.db, sms, withTenant });
    expect(res2.scanned).toBe(0);
    expect(smsSent.length).toBe(0);
  });

  test('no phone → failed + no_phone log, status stays pending', async () => {
    const r = await seedRecall(tA, { dueDate: yesterday, phone: null });
    const res = await processRecallScan({ adminDb: admin.db, sms, withTenant });
    expect(res.failed).toBe(1);
    expect(smsSent.length).toBe(0);
    const s = await withTenant(tA, (tx) =>
      tx.select({ status: recalls.status }).from(recalls).where(eq(recalls.id, r)),
    );
    expect(s[0]!.status).toBe('pending');
    const logs = await withTenant(tA, (tx) =>
      tx.select().from(recallLogs).where(eq(recallLogs.recallId, r)),
    );
    expect(logs[0]!.outcome).toBe('no_phone');
  });

  test('future dueDate not scanned', async () => {
    await seedRecall(tA, { dueDate: '2099-01-01', phone: '+998901112233' });
    const res = await processRecallScan({ adminDb: admin.db, sms, withTenant });
    expect(res.scanned).toBe(0);
    expect(smsSent.length).toBe(0);
  });
});
