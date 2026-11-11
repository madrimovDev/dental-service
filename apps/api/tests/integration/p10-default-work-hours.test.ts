/**
 * P10 — yangi tenant (provisionTenantInTx: register + provisioning umumiy yo'li)
 * darhol bron qilishga yaroqli: default filial ish soati, slot bor, bron 201,
 * workHours=null filialda workHoursConfigured:false. Real DB.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, doctorSchedules, patients } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';
import { provisionTenantInTx } from '../../src/modules/auth/auth.service.ts';
import { createScheduleService } from '../../src/modules/schedule/schedule.service.ts';

let tenantId: string;
let ownerId: string;
let branchId: string;
let patientId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: ownerId }
            : k === 'accessClaims'
              ? { perms: ['@owner'] }
              : undefined,
  }) as unknown as Context;

const run = <T>(fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx));
  });

const noopAudit = { record: async () => {} };
const schedule = createScheduleService({ audit: noopAudit });
const appts = createAppointmentsService({ audit: noopAudit, schedule });

// 2026-12-07 — dushanba, 2026-12-13 — yakshanba.
const MON = '2026-12-07';
const SUN = '2026-12-13';

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const r = await db.transaction((tx) =>
    provisionTenantInTx(tx, {
      tenantName: 'P10 Klinika',
      ownerPhone: '+998900001010',
      ownerFullName: 'Owner P10',
      ownerPassword: 'Passw0rd!x',
      defaultLanguage: 'uz',
    }),
  );
  tenantId = r.tenantId;
  ownerId = r.userId;
  branchId = r.branchId;
  await run(async (c) => {
    const tx = c.get('db') as DbOrTx;
    await tx.insert(doctorSchedules).values({
      tenantId,
      branchId,
      doctorId: ownerId,
      weekday: 1,
      startMinute: 540,
      endMinute: 1080,
    });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Ali Valiyev', phone: '+998901112233' })
      .returning({ id: patients.id });
    patientId = p!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('P10 default work hours', () => {
  test('yangi filialda Du–Sha 09–18, yakshanba yopiq', async () => {
    const [b] = await run((c) =>
      (c.get('db') as DbOrTx).select().from(branches).where(eq(branches.id, branchId)),
    );
    const wh = b!.workHours as Record<string, { open: string; close: string } | null>;
    for (const k of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'])
      expect(wh[k]).toEqual({ open: '09:00', close: '18:00' });
    expect(wh.sun).toBeNull();
  });

  test('darhol slot bor va bron 201-ekvivalent (yaratiladi)', async () => {
    const av = await run((c) =>
      schedule.getAvailability(c, { doctorId: ownerId, branchId, date: MON, slotMinutes: 30 }),
    );
    expect(av.workHoursConfigured).toBe(true);
    expect(av.slots.length).toBeGreaterThan(0);
    const first = av.slots[0]!;
    const created = await run((c) =>
      appts.create(c, {
        branchId,
        patientId,
        doctorId: ownerId,
        startTime: first.start,
        endTime: first.end,
        serviceIds: [],
      }),
    );
    expect(created).toBeTruthy();
  });

  test("yakshanba: slot yo'q, lekin workHoursConfigured true", async () => {
    const av = await run((c) =>
      schedule.getAvailability(c, { doctorId: ownerId, branchId, date: SUN, slotMinutes: 30 }),
    );
    expect(av.slots).toHaveLength(0);
    expect(av.workHoursConfigured).toBe(true);
  });

  test('workHours=null filialda workHoursConfigured:false', async () => {
    await run((c) =>
      (c.get('db') as DbOrTx)
        .update(branches)
        .set({ workHours: null })
        .where(eq(branches.id, branchId)),
    );
    const av = await run((c) =>
      schedule.getAvailability(c, { doctorId: ownerId, branchId, date: MON, slotMinutes: 30 }),
    );
    expect(av.workHoursConfigured).toBe(false);
  });
});
