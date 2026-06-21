/**
 * CLI-201 (A6) — appointment ↔ schedule integratsiyasi. Real DB. Schedule
 * service predikatlari (isWithinWorkingHours / isOnTimeOff) appointments
 * service'ga inject qilinadi (app.ts dagi DI bilan bir xil).
 *
 * Bitta faylni alohida ishlating (TRUNCATE race — to'liq parallel suite emas):
 *   cd apps/api && bun test tests/integration/cli-201-schedule-guard.test.ts \
 *     --env-file=/home/madrimov/Projects/dental-service/.env
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  doctorSchedules,
  doctorTimeOff,
  patients,
  tenants,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';
import { createScheduleService } from '../../src/modules/schedule/schedule.service.ts';

let tenantId: string;
let ownerId: string;
let branchId: string;
let patientId: string;

const ctx = (tx: DbOrTx, tId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tId
          : k === 'user'
            ? { id: ownerId }
            : k === 'accessClaims'
              ? { perms: ['@owner'] }
              : undefined,
  }) as unknown as Context;

const run = <T>(tId: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tId}'`));
    return fn(ctx(tx, tId));
  });

const noopAudit = { record: async () => {} };
const schedule = createScheduleService({ audit: noopAudit });
const svc = createAppointmentsService({ audit: noopAudit, schedule });

// 2026-12-07 is a Monday (verified via getUTCDay).
const MON = '2026-12-07';

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000201', passwordHash: 'x', fullName: 'Dr Doc' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'A', slug: 'a-sched-guard', ownerUserId: ownerId, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [branch] = await tx
      .insert(branches)
      .values({
        tenantId,
        name: 'B',
        // Branch open Mon 09:00–18:00.
        workHours: { mon: { open: '09:00', close: '18:00' } },
      })
      .returning({ id: branches.id });
    branchId = branch!.id;
    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Ali Valiyev', phone: '+998901112233' })
      .returning({ id: patients.id });
    patientId = patient!.id;

    // Doctor works Mon 09:00–18:00 (540–1080).
    await tx.insert(doctorSchedules).values({
      tenantId,
      branchId,
      doctorId: ownerId,
      weekday: 1, // Monday
      startMinute: 540,
      endMinute: 1080,
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const book = (startH: string, endH: string) =>
  run(tenantId, (c) =>
    svc.create(c, {
      branchId,
      patientId,
      doctorId: ownerId,
      startTime: `${MON}T${startH}:00+05:00`,
      endTime: `${MON}T${endH}:00+05:00`,
      serviceIds: [],
    }),
  );

describe('CLI-201 working-hours guard', () => {
  test('within working hours (10:00–11:00) → OK', async () => {
    const r = await book('10:00', '11:00');
    expect(r.ok).toBe(true);
  });

  test('out of hours (03:00–04:00) → REJECTED schedule.outside_working_hours', async () => {
    const r = await book('03:00', '04:00');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('schedule.outside_working_hours');
  });
});

describe('CLI-201 time-off guard', () => {
  test('doctor on time-off → REJECTED schedule.doctor_on_time_off', async () => {
    // Full-day time-off for the doctor on MON.
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await tx.insert(doctorTimeOff).values({
        tenantId,
        doctorId: ownerId,
        branchId: null, // all branches
        type: 'vacation',
        startAt: new Date(`${MON}T00:00:00+05:00`),
        endAt: new Date('2026-12-08T00:00:00+05:00'),
      });
    });

    // 14:00–15:00 is within working hours but doctor is on time-off.
    const r = await book('14:00', '15:00');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('schedule.doctor_on_time_off');
  });
});
