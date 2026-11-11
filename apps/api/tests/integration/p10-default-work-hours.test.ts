/**
 * P10 — yangi tenant (provisionTenantInTx: register + provisioning umumiy yo'li)
 * darhol bron qilishga yaroqli: default filial ish soati, slot bor, bron 201,
 * workHours=null filialda workHoursConfigured:false. Real DB.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  doctorSchedules,
  labOrders,
  patients,
  roles,
  treatmentPlans,
  treatmentStages,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';
import { provisionTenantInTx } from '../../src/modules/auth/auth.service.ts';
import { DEFAULT_WORK_HOURS } from '../../src/modules/branches/branches.defaults.ts';
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
const TUE = '2026-12-08';
let freshDoctorId: string;

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
    // Jadvali UMUMAN yo'q yangi doktor (haqiqiy yangi klinika holati — P10 brauzer sinovi).
    const [u] = await tx
      .insert(users)
      .values({ phone: '+998900001011', passwordHash: 'x', fullName: 'Yangi Doktor' })
      .returning({ id: users.id });
    freshDoctorId = u!.id;
    const [docRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.templateKey, 'doctor'));
    await tx
      .insert(userAssignments)
      .values({ tenantId, branchId, userId: freshDoctorId, roleId: docRole!.id });
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
    // Keyingi testlar uchun default'ni qaytaramiz.
    await run((c) =>
      (c.get('db') as DbOrTx)
        .update(branches)
        .set({ workHours: DEFAULT_WORK_HOURS })
        .where(eq(branches.id, branchId)),
    );
  });

  test("jadvali yo'q doktor filial ish soatida ishlaydi: slot bor va bron yaratiladi", async () => {
    const av = await run((c) =>
      schedule.getAvailability(c, {
        doctorId: freshDoctorId,
        branchId,
        date: MON,
        slotMinutes: 30,
      }),
    );
    expect(av.slots.length).toBeGreaterThan(0);
    const created = await run((c) =>
      appts.create(c, {
        branchId,
        patientId,
        doctorId: freshDoctorId,
        startTime: '2026-12-07T05:00:00.000Z', // 10:00 Toshkent
        endTime: '2026-12-07T05:30:00.000Z',
        serviceIds: [],
      }),
    );
    expect((created as { ok: boolean }).ok).toBe(true);
  });

  test("jadvali bor doktor jadvalsiz kunda (seshanba) band — fallback qo'llanmaydi", async () => {
    const av = await run((c) =>
      schedule.getAvailability(c, { doctorId: ownerId, branchId, date: TUE, slotMinutes: 30 }),
    );
    expect(av.slots.length).toBe(0);
    const created = await run((c) =>
      appts.create(c, {
        branchId,
        patientId,
        doctorId: ownerId,
        startTime: '2026-12-08T05:00:00.000Z',
        endTime: '2026-12-08T05:30:00.000Z',
        serviceIds: [],
      }),
    );
    expect((created as { ok: boolean; code?: string }).code).toBe('schedule.outside_working_hours');
  });
});

describe('FU-17 filial availability P10 fallback', () => {
  const key = (sl: { start: string }[]) => sl.map((x) => x.start).join(',');

  test("jadvalsiz doktor filial availability'da: slotlari yakka availability bilan bir xil", async () => {
    const one = await run((c) =>
      schedule.getAvailability(c, {
        doctorId: freshDoctorId,
        branchId,
        date: MON,
        slotMinutes: 30,
      }),
    );
    const br = await run((c) =>
      schedule.getBranchAvailability(c, { branchId, date: MON, slotMinutes: 30 }),
    );
    const fresh = br.doctors.find((d) => d.doctorId === freshDoctorId);
    expect(fresh).toBeDefined();
    expect(fresh?.slots.length).toBeGreaterThan(0);
    expect(key(fresh?.slots ?? [])).toBe(key(one.slots));
    // Jadvali bor doktor (owner, dushanba segmenti) ham avvalgidek bor.
    expect(br.doctors.some((d) => d.doctorId === ownerId)).toBe(true);
  });

  test("seshanba: jadvali bor, lekin shu kunda segmenti yo'q doktor yo'q; jadvalsiz doktor bor", async () => {
    const br = await run((c) =>
      schedule.getBranchAvailability(c, { branchId, date: TUE, slotMinutes: 30 }),
    );
    expect(br.doctors.some((d) => d.doctorId === ownerId)).toBe(false);
    expect(br.doctors.some((d) => d.doctorId === freshDoctorId)).toBe(true);
  });

  test("yakshanba (filial yopiq): jadvalsiz doktorda slot yo'q", async () => {
    const br = await run((c) =>
      schedule.getBranchAvailability(c, { branchId, date: SUN, slotMinutes: 30 }),
    );
    const fresh = br.doctors.find((d) => d.doctorId === freshDoctorId);
    expect(fresh?.slots ?? []).toHaveLength(0);
  });

  test("boshqa filialga biriktirilgan jadvalsiz doktor bu filialda ko'rinmaydi", async () => {
    let otherDoctorId = '';
    let otherBranchId = '';
    await run(async (c) => {
      const tx = c.get('db') as DbOrTx;
      const [b2] = await tx
        .insert(branches)
        .values({ tenantId, name: 'Boshqa filial', workHours: DEFAULT_WORK_HOURS })
        .returning({ id: branches.id });
      otherBranchId = b2!.id;
      const [u] = await tx
        .insert(users)
        .values({ phone: '+998900001012', passwordHash: 'x', fullName: 'Boshqa Doktor' })
        .returning({ id: users.id });
      otherDoctorId = u!.id;
      const [docRole] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.templateKey, 'doctor'));
      await tx.insert(userAssignments).values({
        tenantId,
        branchId: otherBranchId,
        userId: otherDoctorId,
        roleId: docRole!.id,
      });
    });
    const here = await run((c) =>
      schedule.getBranchAvailability(c, { branchId, date: MON, slotMinutes: 30 }),
    );
    expect(here.doctors.some((d) => d.doctorId === otherDoctorId)).toBe(false);
    const there = await run((c) =>
      schedule.getBranchAvailability(c, { branchId: otherBranchId, date: MON, slotMinutes: 30 }),
    );
    expect(there.doctors.some((d) => d.doctorId === otherDoctorId)).toBe(true);
  });
});

// ─── UI-R3 (SC-07): slot sabablari + `now` + booking-context ──────────────────
describe('UI-R3 availability sabablari', () => {
  const WED = '2026-12-09';
  const reasonAt = (
    av: { unavailable: { start: string; reason: string }[] },
    iso: string,
  ): string | undefined => av.unavailable.find((u) => u.start === iso)?.reason;

  beforeAll(async () => {
    await run(async (c) => {
      const tx = c.get('db') as DbOrTx;
      // Chorshanba: 09–13 va 14–18 (tushlik 13–14).
      await tx.insert(doctorSchedules).values([
        { tenantId, branchId, doctorId: ownerId, weekday: 3, startMinute: 540, endMinute: 780 },
        { tenantId, branchId, doctorId: ownerId, weekday: 3, startMinute: 840, endMinute: 1080 },
      ]);
    });
  });

  test("o'tgan slot `past`, band `busy`, tanaffus `lunch`, sig'maydi `too_short`", async () => {
    // Dushanba 10:15 Toshkent = 05:15Z. Ertalabki 09:00 va 10:00 slotlar o'tgan.
    const now = new Date('2026-12-07T05:15:00.000Z');
    // Dushanba 14:00–15:00 band (ownerId jadvali 09–18; avvalgi testda 09:00 yaratilgan).
    await run(async (c) => {
      const r = await appts.create(c, {
        branchId,
        patientId,
        doctorId: ownerId,
        startTime: '2026-12-07T09:00:00.000Z', // 14:00
        endTime: '2026-12-07T10:00:00.000Z',
        serviceIds: [],
      });
      expect((r as { ok: boolean }).ok).toBe(true);
    });
    const av = await run((c) =>
      schedule.getAvailability(c, { doctorId: ownerId, branchId, date: MON, slotMinutes: 60 }, now),
    );
    expect(av.slots.every((s) => new Date(s.start) >= now)).toBe(true);
    expect(av.slots.length).toBeGreaterThan(0);
    expect(reasonAt(av, '2026-12-07T04:00:00.000Z')).toBe('past'); // 09:00
    expect(reasonAt(av, '2026-12-07T09:00:00.000Z')).toBe('busy'); // 14:00

    const wed = await run((c) =>
      schedule.getAvailability(
        c,
        { doctorId: ownerId, branchId, date: WED, slotMinutes: 60 },
        new Date('2026-12-07T00:00:00.000Z'),
      ),
    );
    expect(reasonAt(wed, '2026-12-09T08:00:00.000Z')).toBe('lunch'); // 13:00
    // 90 daqiqalik slot: 09–13 oraliqda 12:00–13:00 qoldiq sig'maydi.
    const wed90 = await run((c) =>
      schedule.getAvailability(
        c,
        { doctorId: ownerId, branchId, date: WED, slotMinutes: 90 },
        new Date('2026-12-07T00:00:00.000Z'),
      ),
    );
    expect(reasonAt(wed90, '2026-12-09T07:00:00.000Z')).toBe('too_short'); // 12:00
    // Bo'sh slot unavailable'da takrorlanmaydi.
    const freeStarts = new Set(wed.slots.map((s) => s.start));
    expect(wed.unavailable.some((u) => freeStarts.has(u.start))).toBe(false);
  });
});

describe('UI-R3 booking-context', () => {
  test("lab muddati + reja bosqichi qaytadi; bajarilgan lab va qabul qilinmagan bosqich yo'q", async () => {
    await run(async (c) => {
      const tx = c.get('db') as DbOrTx;
      await tx.insert(labOrders).values([
        {
          tenantId,
          patientId,
          doctorId: ownerId,
          labName: 'Lab A',
          orderType: 'crown',
          status: 'sent',
          items: [],
          expectedDate: new Date('2026-12-11T00:00:00.000Z'),
        },
        {
          tenantId,
          patientId,
          doctorId: ownerId,
          labName: 'Lab B',
          orderType: 'crown',
          status: 'delivered',
          items: [],
          expectedDate: new Date('2026-12-01T00:00:00.000Z'),
        },
      ]);
      const [plan] = await tx
        .insert(treatmentPlans)
        .values({ tenantId, patientId, doctorId: ownerId, title: 'Protez', status: 'in_progress' })
        .returning({ id: treatmentPlans.id });
      await tx.insert(treatmentStages).values([
        {
          treatmentPlanId: plan!.id,
          sequence: 1,
          serviceName: 'Tayyor',
          cost: '100',
          status: 'completed',
          acceptance: 'accepted',
        },
        {
          treatmentPlanId: plan!.id,
          sequence: 2,
          serviceName: 'Taklif',
          cost: '100',
          status: 'pending',
          acceptance: 'proposed',
        },
        {
          treatmentPlanId: plan!.id,
          sequence: 3,
          serviceName: "Toj o'rnatish",
          cost: '500',
          status: 'pending',
          acceptance: 'accepted',
          estimatedDurationMinutes: 60,
        },
      ]);
    });
    const ctxOut = await run((c) => appts.bookingContext(c, patientId));
    expect(ctxOut.openLabOrders.map((l) => l.labName)).toEqual(['Lab A']);
    expect(ctxOut.nextPlanStage?.serviceName).toBe("Toj o'rnatish");
    expect(ctxOut.nextPlanStage?.estimatedDurationMinutes).toBe(60);
    expect(ctxOut.nextPlanStage?.planTitle).toBe('Protez');
  });
});
