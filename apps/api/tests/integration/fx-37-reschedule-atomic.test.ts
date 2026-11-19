/**
 * FX-37 (LA-10) — Telegram «Boshqa vaqt»: eski yozilish yangisidan OLDIN bekor qilinadi,
 * recall yangi yozilishga qayta bog'lanadi, xato bo'lsa hammasi qaytadi (atomik).
 *
 * REAL DB + real route (JWT, RLS middleware) + cheklangan rol (Receptionist, `@owner` EMAS).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-37-reschedule-atomic.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  appointments,
  bookingRequests,
  branches,
  patients,
  recalls,
  roles,
  services,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';
import { bookingRequestRoutes } from '../../src/modules/booking-requests/index.ts';
import { createRecallsService } from '../../src/modules/recalls/index.ts';
import { grantTenantWide } from './_grant-scope.ts';

const receptionist = ROLE_TEMPLATES.find((t) => t.templateKey === 'receptionist');
if (!receptionist) throw new Error('receptionist template not found');
const receptionistPerms = [...receptionist.permissions] as string[];

const withTenant = <T>(tenantId: string, fn: (tx: typeof db) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx as unknown as typeof db);
  });

let tenantA: string;
let tenantB: string;
let branchA: string;
let branchB: string;
let patientA: string;
let patientB: string;
let serviceA: string;
let serviceB: string;
let recepA: string;
let doctorA: string;
let doctorB: string;
let tokenA: string;

const audit = { record: async () => {} };
const bookingApp = bookingRequestRoutes({
  db,
  audit,
  appointments: createAppointmentsService({ audit, recall: createRecallsService({ audit }) }),
});

const post = (app: { request: typeof bookingApp.request }, path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const errCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

const futureStart = () => {
  const d = new Date(Date.now() + 3 * 24 * 3600_000);
  d.setUTCHours(6, 0, 0, 0); // 11:00 Tashkent
  return d;
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const us = await db
    .insert(users)
    .values([
      { phone: '+998900003001', passwordHash: 'x', fullName: 'Owner A' },
      { phone: '+998900003002', passwordHash: 'x', fullName: 'Owner B' },
      { phone: '+998900003003', passwordHash: 'x', fullName: 'Recep A' },
      { phone: '+998900003004', passwordHash: 'x', fullName: 'Doctor A' },
      { phone: '+998900003005', passwordHash: 'x', fullName: 'Doctor B' },
    ])
    .returning({ id: users.id });
  const [ownerA, ownerB] = [us[0]!.id, us[1]!.id];
  recepA = us[2]!.id;
  doctorA = us[3]!.id;
  doctorB = us[4]!.id;

  const ts = await db
    .insert(tenants)
    .values([
      { name: 'A', slug: 'fx03b-a', ownerUserId: ownerA },
      { name: 'B', slug: 'fx03b-b', ownerUserId: ownerB },
    ])
    .returning({ id: tenants.id });
  tenantA = ts[0]!.id;
  tenantB = ts[1]!.id;

  const seed = async (tid: string, phone: string, memberIds: string[]) =>
    withTenant(tid, async (tx) => {
      const [br] = await tx.insert(branches).values({ tenantId: tid, name: 'Br' }).returning();
      const [p] = await tx
        .insert(patients)
        .values({ tenantId: tid, fullName: 'Bemor', phone })
        .returning();
      const [svc] = await tx
        .insert(services)
        .values({ tenantId: tid, code: 'S-1', nameUz: 'Xizmat' })
        .returning();
      const [role] = await tx
        .insert(roles)
        .values({ tenantId: tid, name: 'Doctor', isPractitioner: true })
        .returning();
      await tx.insert(userAssignments).values(
        memberIds.map((userId) => ({
          userId,
          tenantId: tid,
          roleId: role!.id,
          branchId: null,
          isActive: true,
          acceptedAt: new Date(),
        })),
      );
      if (memberIds.includes(recepA))
        await grantTenantWide(tx, tid, recepA, ['appointment.view', 'appointment.create']);
      return { branch: br!.id, patient: p!.id, service: svc!.id };
    });

  const a = await seed(tenantA, '+998903331001', [recepA, doctorA]);
  const b = await seed(tenantB, '+998903332001', [doctorB]);
  branchA = a.branch;
  patientA = a.patient;
  serviceA = a.service;
  branchB = b.branch;
  patientB = b.patient;
  serviceB = b.service;

  tokenA = (
    await signAccess({
      sub: recepA,
      atid: tenantA,
      abid: null,
      perms: receptionistPerms,
      roleKey: 'receptionist',
      lang: 'uz' as const,
    })
  ).token;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const SLOT = 30 * 60_000;
const startOf = (offsetMin = 0) => new Date(futureStart().getTime() + offsetMin * 60_000);

const mkAppt = (over: { patientId: string; doctorId: string; offsetMin: number }) =>
  withTenant(tenantA, async (tx) => {
    const [a] = await tx
      .insert(appointments)
      .values({
        tenantId: tenantA,
        branchId: branchA,
        patientId: over.patientId,
        doctorId: over.doctorId,
        startTime: startOf(over.offsetMin),
        endTime: new Date(startOf(over.offsetMin).getTime() + SLOT),
        serviceIds: [],
      })
      .returning();
    return a!.id;
  });

const mkRecall = (scheduledAppointmentId: string) =>
  withTenant(tenantA, async (tx) => {
    const [r] = await tx
      .insert(recalls)
      .values({
        tenantId: tenantA,
        patientId: patientA,
        reason: 'preventive',
        source: 'appointment',
        status: 'scheduled',
        dueDate: new Date().toISOString().slice(0, 10),
        scheduledAppointmentId,
      })
      .returning();
    return r!.id;
  });

const mkRequest = (rescheduleOf: string, offsetMin: number) =>
  withTenant(tenantA, async (tx) => {
    const [r] = await tx
      .insert(bookingRequests)
      .values({
        tenantId: tenantA,
        branchId: branchA,
        patientId: patientA,
        doctorId: doctorA,
        requestedStart: startOf(offsetMin),
        rescheduleOfAppointmentId: rescheduleOf,
      })
      .returning();
    return r!.id;
  });

const apptStatus = (id: string) =>
  withTenant(tenantA, async (tx) =>
    (await tx.select().from(appointments)).find((a) => a.id === id),
  );
const recallOf = (id: string) =>
  withTenant(tenantA, async (tx) => (await tx.select().from(recalls)).find((r) => r.id === id));
const reqOf = (id: string) =>
  withTenant(tenantA, async (tx) =>
    (await tx.select().from(bookingRequests)).find((r) => r.id === id),
  );

describe('FX-37 — «Boshqa vaqt» ko`chirish', () => {
  test('eski bilan kesishuvchi yangi slot (10:15, bir doktor) → 200; eski cancelled, yangi scheduled', async () => {
    const oldId = await mkAppt({ patientId: patientA, doctorId: doctorA, offsetMin: 0 });
    const reqId = await mkRequest(oldId, 15);
    const res = await post(bookingApp, `/${reqId}/confirm`, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { appointmentId: string } };
    expect((await apptStatus(oldId))?.status).toBe('cancelled');
    expect((await apptStatus(body.data.appointmentId))?.status).toBe('scheduled');
    expect((await reqOf(reqId))?.status).toBe('confirmed');
  });

  test('eski yozilish yopgan recall yangi yozilishga qayta bog`lanadi (pending ga qaytmaydi)', async () => {
    const oldId = await mkAppt({ patientId: patientA, doctorId: doctorA, offsetMin: 120 });
    const recallId = await mkRecall(oldId);
    const reqId = await mkRequest(oldId, 180);
    const res = await post(bookingApp, `/${reqId}/confirm`, {});
    expect(res.status).toBe(200);
    const newId = ((await res.json()) as { data: { appointmentId: string } }).data.appointmentId;
    const r = await recallOf(recallId);
    expect(r?.status).toBe('scheduled');
    expect(r?.scheduledAppointmentId).toBe(newId);
  });

  test('yangi slot band (boshqa bemor) → 409; eski yozilish va recall O`ZGARMAYDI, so`rov pending', async () => {
    const oldId = await mkAppt({ patientId: patientA, doctorId: doctorA, offsetMin: 300 });
    const recallId = await mkRecall(oldId);
    // Boshqa bemor shu doktorni 06:00 + 420 daqiqaga band qilgan
    const [other] = await withTenant(tenantA, async (tx) =>
      tx
        .insert(patients)
        .values({ tenantId: tenantA, fullName: 'Boshqa', phone: '+998903331777' })
        .returning(),
    );
    await mkAppt({ patientId: other!.id, doctorId: doctorA, offsetMin: 420 });
    const reqId = await mkRequest(oldId, 420);
    const res = await post(bookingApp, `/${reqId}/confirm`, {});
    expect(res.status).toBe(409);
    expect((await apptStatus(oldId))?.status).toBe('scheduled');
    const r = await recallOf(recallId);
    expect(r?.status).toBe('scheduled');
    expect(r?.scheduledAppointmentId).toBe(oldId);
    expect((await reqOf(reqId))?.status).toBe('pending');
  });

  test('eski yozilish allaqachon bekor — baribir tasdiqlanadi', async () => {
    const oldId = await mkAppt({ patientId: patientA, doctorId: doctorA, offsetMin: 600 });
    await withTenant(tenantA, async (tx) =>
      tx.update(appointments).set({ status: 'cancelled' }).where(sql`id = ${oldId}`),
    );
    const reqId = await mkRequest(oldId, 660);
    const res = await post(bookingApp, `/${reqId}/confirm`, {});
    expect(res.status).toBe(200);
  });
});
