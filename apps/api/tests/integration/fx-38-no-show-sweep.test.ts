/**
 * FX-38 (LA-07) — kunlik no-show sweep ulanadi. `sweepNoShows` ilgari hech
 * qayerda chaqirilmasdi (faqat qo'lda route): kelmagan bemor abadiy
 * scheduled/confirmed qolar, strike yozilmasdi. Endi `processNoShowSweep`
 * barcha tenantlar bo'yicha (admin conn tenant ro'yxati → har biri withTenant
 * ichida) sweepNoShows'ni chaqiradi; `registerNoShowScheduler` BullMQ
 * repeatable job'ini (Toshkent yarim tunidan keyin) ro'yxatdan o'tkazadi.
 * REAL DB + REAL Redis.
 *
 *   cd apps/api && bun test tests/integration/fx-38-no-show-sweep.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  patientNoShowStrikes,
  patients,
  queueTickets,
  tenants,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createAdminDb, db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import {
  NO_SHOW_SWEEP_CRON,
  processNoShowSweep,
  registerNoShowScheduler,
} from '../../src/lib/no-show-sweep.ts';
import { noShowQueue } from '../../src/lib/queue.ts';

type Seed = { tenantId: string; branchId: string; patientId: string; ownerId: string };
const admin = createAdminDb();
let A: Seed;
let B: Seed;

const seedTenant = async (tag: string, phone: string): Promise<Seed> => {
  const [owner] = await db
    .insert(users)
    .values({ phone, passwordHash: 'x', fullName: `Doc ${tag}` })
    .returning({ id: users.id });
  const [t] = await db
    .insert(tenants)
    .values({ name: tag, slug: `fx38-${tag}`, ownerUserId: owner!.id, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  const tenantId = t!.id;
  return withTenant(tenantId, async (tx) => {
    const [b] = await tx.insert(branches).values({ tenantId, name: 'B' }).returning({
      id: branches.id,
    });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: `P ${tag}` })
      .returning({ id: patients.id });
    return { tenantId, branchId: b!.id, patientId: p!.id, ownerId: owner!.id };
  });
};

const insertAppt = (s: Seed, start: Date, status = 'scheduled' as 'scheduled' | 'confirmed') =>
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

const statusOf = (s: Seed, id: string) =>
  withTenant(s.tenantId, async (tx) => {
    const [r] = await tx
      .select({ st: appointments.status })
      .from(appointments)
      .where(eq(appointments.id, id));
    return r?.st;
  });

const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  A = await seedTenant('a', '+998900003801');
  B = await seedTenant('b', '+998900003802');
});

afterAll(async () => {
  for (const r of await noShowQueue.getRepeatableJobs()) {
    await noShowQueue.removeRepeatableByKey(r.key);
  }
  await noShowQueue.close();
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await admin.client.end({ timeout: 5 });
});

describe('FX-38 — processNoShowSweep (real DB, cross-tenant)', () => {
  test('har tenant: kecha kelmagan yozilish no_show + strike, bugungi tegilmaydi; waiting ticket missed', async () => {
    const now = Date.now();
    const pastA = await insertAppt(A, new Date(now - 2 * DAY));
    const confirmedB = await insertAppt(B, new Date(now - 2 * DAY), 'confirmed');
    const futureA = await insertAppt(A, new Date(now + 2 * 60 * 60 * 1000));

    // Kechagi 'waiting' ticket (A) — missed + yozilish no_show.
    const ticketAppt = await insertAppt(A, new Date(now - 3 * DAY));
    await withTenant(A.tenantId, (tx) =>
      tx.insert(queueTickets).values({
        tenantId: A.tenantId,
        branchId: A.branchId,
        patientId: A.patientId,
        appointmentId: ticketAppt,
        queueNumber: 1,
        status: 'waiting',
        ticketDate: new Date(now - 3 * DAY),
      }),
    );

    const res = await processNoShowSweep({ adminDb: admin.db, withTenant });
    expect(res.failed).toBe(0);
    expect(res.swept).toBeGreaterThanOrEqual(3);

    expect(await statusOf(A, pastA)).toBe('no_show');
    expect(await statusOf(B, confirmedB)).toBe('no_show');
    expect(await statusOf(A, ticketAppt)).toBe('no_show');
    expect(await statusOf(A, futureA)).toBe('scheduled');

    const strikes = await withTenant(A.tenantId, (tx) =>
      tx.select().from(patientNoShowStrikes).where(eq(patientNoShowStrikes.patientId, A.patientId)),
    );
    expect(strikes.length).toBe(2);

    // Idempotent: ikkinchi yurish hech narsani o'zgartirmaydi.
    const again = await processNoShowSweep({ adminDb: admin.db, withTenant });
    expect(again.swept).toBe(0);
  });

  test('bitta tenant yiqilsa boshqalari davom etadi', async () => {
    const now = Date.now();
    const a = await insertAppt(A, new Date(now - 4 * DAY));
    const b = await insertAppt(B, new Date(now - 4 * DAY));
    const res = await processNoShowSweep({
      adminDb: admin.db,
      withTenant: (tid, fn) => {
        if (tid === A.tenantId) throw new Error('boom');
        return withTenant(tid, fn);
      },
    });
    expect(res.failed).toBe(1);
    expect(await statusOf(A, a)).toBe('scheduled');
    expect(await statusOf(B, b)).toBe('no_show');
  });
});

describe('FX-38 — registerNoShowScheduler (real Redis)', () => {
  test("repeatable job bir marta ro'yxatdan o'tadi (idempotent), Toshkent kechasi", async () => {
    await registerNoShowScheduler();
    await registerNoShowScheduler();
    const jobs = (await noShowQueue.getRepeatableJobs()).filter(
      (j) => j.pattern === NO_SHOW_SWEEP_CRON,
    );
    expect(jobs).toHaveLength(1);
    // 19:30 UTC = 00:30 Asia/Tashkent (UTC+5) — kun yangi boshlangach, kechagi hal bo'lmaganlar.
    expect(NO_SHOW_SWEEP_CRON).toBe('30 19 * * *');
  });
});
