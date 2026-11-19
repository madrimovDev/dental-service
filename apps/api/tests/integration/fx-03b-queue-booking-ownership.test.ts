/**
 * FX-03b (X-1) — queue walk-in va booking-requests confirm: begona ID → 404.
 *
 * REAL DB + real route (JWT, RLS middleware) + cheklangan rol (Receptionist, `@owner` EMAS).
 * FK constraint RLS'ni chetlab o'tadi — begona tenant bemori/filiali/xizmati navbat
 * chiptasiga, begona doktor/filial bron tasdiqlashga yozilib ketardi.
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-03b-queue-booking-ownership.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  bookingRequests,
  branches,
  patients,
  queueTickets,
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
import { queueRoutes } from '../../src/modules/queue/index.ts';
import { seedRoleForUser } from './fx-m2-helpers.ts';

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
const queueApp = queueRoutes({ db, audit });
const bookingApp = bookingRequestRoutes({
  db,
  audit,
  appointments: createAppointmentsService({ audit }),
});

const post = (app: { request: typeof queueApp.request }, path: string, body: unknown) =>
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

  // FX-133: yozilish filial doirasi tayinlovlardan o'qiladi — real (tenant-wide) tayinlov.
  await seedRoleForUser(tenantA, recepA, null, receptionistPerms, 'Registrator');

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

const ticketCount = (tid: string) =>
  withTenant(tid, async (tx) => (await tx.select().from(queueTickets)).length);

describe('FX-03b — queue walk-in egalik (Receptionist, real RLS)', () => {
  test('sanity: Receptionist @owner emas, queue.create bor', () => {
    expect(receptionistPerms).not.toContain('@owner');
    expect(receptionistPerms).toContain('queue.create');
  });

  test('begona tenant bemori → 404 patient.not_found, chipta yaratilmaydi', async () => {
    const res = await post(queueApp, '/', { branchId: branchA, patientId: patientB });
    expect(res.status).toBe(404);
    expect(await errCode(res)).toBe('patient.not_found');
    expect(await ticketCount(tenantA)).toBe(0);
    expect(await ticketCount(tenantB)).toBe(0);
  });

  test('begona tenant filiali → 404 branch.not_found', async () => {
    const res = await post(queueApp, '/', { branchId: branchB, patientId: patientA });
    expect(res.status).toBe(404);
    expect(await errCode(res)).toBe('branch.not_found');
    expect(await ticketCount(tenantB)).toBe(0);
  });

  test('begona tenant xizmati → 404 service.not_found', async () => {
    const res = await post(queueApp, '/', { branchId: branchA, serviceId: serviceB });
    expect(res.status).toBe(404);
    expect(await errCode(res)).toBe('service.not_found');
    expect(await ticketCount(tenantA)).toBe(0);
  });

  test('o`z tenant bemor+filial+xizmat → 201', async () => {
    const res = await post(queueApp, '/', {
      branchId: branchA,
      patientId: patientA,
      serviceId: serviceA,
    });
    expect(res.status).toBe(201);
    expect(await ticketCount(tenantA)).toBe(1);
  });
});

describe('FX-03b — booking-requests confirm egalik', () => {
  const makeRequest = (over: { branchId?: string; doctorId?: string | null }) =>
    withTenant(tenantA, async (tx) => {
      const [r] = await tx
        .insert(bookingRequests)
        .values({
          tenantId: tenantA,
          branchId: over.branchId ?? branchA,
          patientId: patientA,
          doctorId: over.doctorId === undefined ? doctorA : over.doctorId,
          requestedStart: futureStart(),
        })
        .returning();
      return r!.id;
    });
  const statusOf = (id: string) =>
    withTenant(tenantA, async (tx) => {
      const rows = await tx.select().from(bookingRequests);
      return rows.find((r) => r.id === id)?.status;
    });

  test('confirm: begona doktor (body) → 404 doctor.not_found, so`rov pending qoladi', async () => {
    const id = await makeRequest({});
    const res = await post(bookingApp, `/${id}/confirm`, { doctorId: doctorB });
    expect(res.status).toBe(404);
    expect(await errCode(res)).toBe('doctor.not_found');
    expect(await statusOf(id)).toBe('pending');
  });

  test('confirm: so`rovdagi filial begona tenantniki → 404 branch.not_found, pending', async () => {
    const id = await makeRequest({ branchId: branchB });
    const res = await post(bookingApp, `/${id}/confirm`, {});
    expect(res.status).toBe(404);
    expect(await errCode(res)).toBe('branch.not_found');
    expect(await statusOf(id)).toBe('pending');
  });

  test('confirm: o`z tenant doktor+filial → 200, confirmed', async () => {
    const id = await makeRequest({});
    const res = await post(bookingApp, `/${id}/confirm`, {});
    expect(res.status).toBe(200);
    expect(await statusOf(id)).toBe('confirmed');
  });
});
