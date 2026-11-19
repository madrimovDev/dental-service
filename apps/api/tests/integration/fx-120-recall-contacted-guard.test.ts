/**
 * FX-120 (LB-29) — recall worker: tashqi send davomida parallel o'zgargan recall
 * (registrator yozdi -> 'scheduled', menejer bekor qildi -> 'dismissed') yakuniy
 * `contacted` UPDATE bilan ustidan yozilmasligi shart. REAL DB, real worker funksiyasi,
 * parallel o'zgarish alohida (admin) ulanishdan send ichida commit qilinadi.
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-120-recall-contacted-guard.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { patients, recallLogs, recalls, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createAdminDb, db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { processRecallScan } from '../../src/lib/recall-worker.ts';

const admin = createAdminDb();
let tenantId: string;
let patientId: string;
const NOW = new Date('2026-06-21T07:00:00Z');

const mkRecall = async () => {
  const [r] = await admin.db
    .insert(recalls)
    .values({
      tenantId,
      patientId,
      reason: 'manual',
      status: 'pending',
      source: 'manual',
      dueDate: '2020-01-01',
    })
    .returning({ id: recalls.id });
  return r!.id;
};
const rowOf = async (id: string) => {
  const [r] = await admin.db.select().from(recalls).where(eq(recalls.id, id));
  return r!;
};
const scan = (concurrent?: () => Promise<void>) =>
  processRecallScan({
    adminDb: admin.db,
    withTenant,
    sms: {
      send: async () => {
        await concurrent?.();
        return { ok: true as const, providerId: 'm1' };
      },
    },
    now: NOW,
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900001200', passwordHash: 'x', fullName: 'Owner 120' })
    .returning({ id: users.id });
  const [t] = await db
    .insert(tenants)
    .values({ name: 'T120', slug: 'fx120', ownerUserId: u!.id })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await withTenant(tenantId, async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'P120', phone: '+998901200001' })
      .returning({ id: patients.id });
    patientId = p!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await admin.client.end({ timeout: 5 });
});

describe('FX-120 — contacted UPDATE faqat pending qatorga', () => {
  test("send davomida 'scheduled' bo'ldi → 'contacted'ga qaytarilmaydi", async () => {
    await admin.db.delete(recalls);
    const id = await mkRecall();
    await scan(async () => {
      await admin.db.update(recalls).set({ status: 'scheduled' }).where(eq(recalls.id, id));
    });
    const r = await rowOf(id);
    expect(r.status).toBe('scheduled');
    expect(r.contactAttempts).toBe(0);
  });

  test("send davomida 'dismissed' bo'ldi → bekor holati saqlanadi", async () => {
    await admin.db.delete(recalls);
    const id = await mkRecall();
    await scan(async () => {
      await admin.db.update(recalls).set({ status: 'dismissed' }).where(eq(recalls.id, id));
    });
    expect((await rowOf(id)).status).toBe('dismissed');
  });

  test('regressiya: parallel o`zgarish yo`q → contacted, urinish 1, log sent', async () => {
    await admin.db.delete(recalls);
    const id = await mkRecall();
    const res = await scan();
    const r = await rowOf(id);
    expect(res.sent).toBe(1);
    expect(r.status).toBe('contacted');
    expect(r.contactAttempts).toBe(1);
    const logs = await admin.db.select().from(recallLogs).where(eq(recallLogs.recallId, id));
    expect(logs.map((l) => l.outcome)).toEqual(['sent']);
  });
});
