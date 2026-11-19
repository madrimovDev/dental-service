/**
 * FX-89 (+ LB-05 ikkinchi yarmi) — eslatma navbati bazaga mos kelmasa (desktop zaxira
 * tiklandi yoki Valkey ma'lumoti yo'qoldi), API boot'dagi `reconcileReminders`:
 *   - kelajakdagi faol yozilishlarga yetishmayotgan job'ni qo'yadi;
 *   - vaqti noto'g'ri job'ning kechikishini bazadagi vaqtga to'g'rilaydi;
 *   - bazada yo'q / bekor qilingan / eslatma oynasidan o'tgan yozilishning job'ini o'chiradi.
 * REAL DB (dental_app, FORCE RLS) + REAL Redis + REAL BullMQ Queue.
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-89-reminder-reconcile.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { appointments, branches, patients, tenants, users } from '@dental/db-schema';
import { Queue } from 'bullmq';
import { sql } from 'drizzle-orm';
import { createAdminDb, db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import type { ReminderJob } from '../../src/lib/queue.ts';
import { reminderJobId } from '../../src/lib/reminder-job-id.ts';
import { reconcileReminders } from '../../src/lib/reminder-reconcile.ts';

type Seed = { tenantId: string; branchId: string; patientId: string; ownerId: string };
const admin = createAdminDb();
const queue = new Queue<ReminderJob>('reminders-fx89-test', {
  connection: { url: process.env.REDIS_URL },
});
let A: Seed;
let B: Seed;

const HOUR = 3600_000;
const DAY = 24 * HOUR;

const seedTenant = async (tag: string, phone: string): Promise<Seed> => {
  const [owner] = await db
    .insert(users)
    .values({ phone, passwordHash: 'x', fullName: `Doc ${tag}` })
    .returning({ id: users.id });
  const [t] = await db
    .insert(tenants)
    .values({ name: tag, slug: `fx89-${tag}`, ownerUserId: owner!.id, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  const tenantId = t!.id;
  return withTenant(tenantId, async (tx) => {
    const [b] = await tx
      .insert(branches)
      .values({ tenantId, name: 'B' })
      .returning({ id: branches.id });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: `P ${tag}` })
      .returning({ id: patients.id });
    return { tenantId, branchId: b!.id, patientId: p!.id, ownerId: owner!.id };
  });
};

const insertAppt = (
  s: Seed,
  start: Date,
  status: 'scheduled' | 'confirmed' | 'cancelled' = 'scheduled',
) =>
  withTenant(s.tenantId, async (tx) => {
    const [a] = await tx
      .insert(appointments)
      .values({
        tenantId: s.tenantId,
        branchId: s.branchId,
        patientId: s.patientId,
        doctorId: s.ownerId,
        startTime: start,
        endTime: new Date(start.getTime() + 30 * 60 * 1000),
        serviceIds: [],
        status,
      })
      .returning({ id: appointments.id });
    return a!.id;
  });

/** Eski (tiklashdan oldingi) navbat holatini taqlid qiladi. */
const addJob = (tenantId: string, appointmentId: string, delayMs: number) =>
  queue.add(
    'appointment-reminder',
    { tenantId, appointmentId },
    { delay: delayMs, jobId: reminderJobId(appointmentId), removeOnComplete: true },
  );

/** Delayed zset'dagi fire vaqti (ms) — BullMQ score = timestamp * 0x1000 + counter. */
const fireAt = async (appointmentId: string): Promise<number | null> => {
  const client = await queue.client;
  const score = await client.zscore(queue.toKey('delayed'), reminderJobId(appointmentId));
  return score == null ? null : Math.floor(Number(score) / 0x1000);
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await queue.obliterate({ force: true });
  A = await seedTenant('a', '+998900008901');
  B = await seedTenant('b', '+998900008902');
});

afterAll(async () => {
  await queue.obliterate({ force: true });
  await queue.close();
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await admin.client.end({ timeout: 5 });
});

describe('FX-89 — reconcileReminders (real DB + real Redis)', () => {
  test('tiklangan baza bilan navbat moslashtiriladi', async () => {
    const now = Date.now();
    // 1) Job'i yo'q kelajakdagi yozilish (Valkey bo'shagan / tiklangan) — A va B.
    const missingA = await insertAppt(A, new Date(now + 3 * DAY));
    const missingB = await insertAppt(B, new Date(now + 4 * DAY), 'confirmed');
    // 2) Bazada 5 kundan keyin, navbatda esa 1 kunlik (tiklashdan keyingi vaqt farqi).
    const wrongTime = await insertAppt(A, new Date(now + 5 * DAY));
    await addJob(A.tenantId, wrongTime, 1 * DAY);
    // 3) Tiklangan bazada bekor qilingan, navbatda job bor.
    const cancelled = await insertAppt(A, new Date(now + 3 * DAY), 'cancelled');
    await addJob(A.tenantId, cancelled, 2 * DAY);
    // 4) Tiklangan bazada umuman yo'q yozilish.
    const ghost = randomUUID();
    await addJob(A.tenantId, ghost, 2 * DAY);
    // 5) Tiklangan bazada 10 soatdan keyin (eslatma oynasi o'tgan), navbatda 2 kunlik job.
    const soon = await insertAppt(A, new Date(now + 10 * HOUR));
    await addJob(A.tenantId, soon, 2 * DAY);
    // 6) Allaqachon to'g'ri job (o'zgarmasligi kerak — dublikat yo'q).
    const okStart = now + 6 * DAY;
    const ok = await insertAppt(B, new Date(okStart));
    await addJob(B.tenantId, ok, okStart - DAY - now);

    const res = await reconcileReminders({ adminDb: admin.db, queue });

    const tol = 60_000;
    expect(Math.abs((await fireAt(missingA))! - (now + 2 * DAY))).toBeLessThan(tol);
    expect(Math.abs((await fireAt(missingB))! - (now + 3 * DAY))).toBeLessThan(tol);
    expect(Math.abs((await fireAt(wrongTime))! - (now + 4 * DAY))).toBeLessThan(tol);
    expect(Math.abs((await fireAt(ok))! - (now + 5 * DAY))).toBeLessThan(tol);
    expect(await queue.getJob(reminderJobId(cancelled))).toBeFalsy();
    expect(await queue.getJob(reminderJobId(ghost))).toBeFalsy();
    expect(await queue.getJob(reminderJobId(soon))).toBeFalsy();
    expect(await queue.getDelayedCount()).toBe(4);
    expect(res).toMatchObject({ tenants: 2, removed: 3, failed: 0 });

    // Idempotent: ikkinchi chaqiruv hech narsani o'zgartirmaydi.
    const again = await reconcileReminders({ adminDb: admin.db, queue });
    expect(again).toMatchObject({ removed: 0, failed: 0 });
    expect(await queue.getDelayedCount()).toBe(4);
  });
});
