/**
 * FX-02 (LA-46, D-12) — yozilish create/update egalik tekshiruvi + tenant-scoped EXCLUDE.
 *
 * REAL DB + real route (JWT, RLS middleware) + cheklangan rol (Receptionist, `@owner` EMAS):
 *  - begona tenant bemori / doktori / yordamchisi → 404 (FK RLS'ni chetlab o'tardi);
 *  - ikki klinikada ishlaydigan doktorning A'dagi broni B'dagi bronni BLOKLAMAYDI (D-12);
 *  - bir tenant ichida doktor/bemor kesishuvi baribir DB darajasida rad etiladi
 *    (constraint nomi saqlangan — doctor_busy / patient_busy).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-02-appointment-ownership.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  appointments,
  branches,
  patients,
  roles,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { appointmentRoutes } from '../../src/modules/appointments/appointments.routes.ts';
import {
  createAppointmentsService,
  exclusionConflictCode,
} from '../../src/modules/appointments/appointments.service.ts';

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
let patientA2: string;
let recepA: string;
let ownerA: string;
let ownerB: string;
let sharedDoctor: string; // A va B da tayinlovga ega
let onlyBDoctor: string; // faqat B da
let onlyBAssistant: string; // faqat B da
let tokenA: string;
let tokenB: string;
let recepB: string;

const app = appointmentRoutes({
  db,
  audit: { record: async () => {} },
  service: createAppointmentsService({ audit: { record: async () => {} } }),
});

const call = (token: string, method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const slot = (h: string, e: string, day = '2026-12-10') => ({
  startTime: new Date(`${day}T${h}:00+05:00`).toISOString(),
  endTime: new Date(`${day}T${e}:00+05:00`).toISOString(),
});

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const us = await db
    .insert(users)
    .values([
      { phone: '+998900002001', passwordHash: 'x', fullName: 'Owner A' },
      { phone: '+998900002002', passwordHash: 'x', fullName: 'Owner B' },
      { phone: '+998900002003', passwordHash: 'x', fullName: 'Recep A' },
      { phone: '+998900002004', passwordHash: 'x', fullName: 'Shared Doctor' },
      { phone: '+998900002005', passwordHash: 'x', fullName: 'Only B Doctor' },
      { phone: '+998900002006', passwordHash: 'x', fullName: 'Only B Assistant' },
      { phone: '+998900002007', passwordHash: 'x', fullName: 'Recep B' },
    ])
    .returning({ id: users.id });
  [ownerA, ownerB, recepA, sharedDoctor, onlyBDoctor, onlyBAssistant, recepB] = us.map(
    (u) => u.id,
  ) as [string, string, string, string, string, string, string];

  const ts = await db
    .insert(tenants)
    .values([
      { name: 'A', slug: 'fx02-a', ownerUserId: ownerA },
      { name: 'B', slug: 'fx02-b', ownerUserId: ownerB },
    ])
    .returning({ id: tenants.id });
  tenantA = ts[0]!.id;
  tenantB = ts[1]!.id;

  const seed = async (tid: string, phoneBase: string, memberIds: string[]) =>
    withTenant(tid, async (tx) => {
      const [br] = await tx.insert(branches).values({ tenantId: tid, name: 'Br' }).returning();
      const [p1] = await tx
        .insert(patients)
        .values({ tenantId: tid, fullName: 'Bemor 1', phone: `${phoneBase}1` })
        .returning();
      const [p2] = await tx
        .insert(patients)
        .values({ tenantId: tid, fullName: 'Bemor 2', phone: `${phoneBase}2` })
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
      return { branch: br!.id, p1: p1!.id, p2: p2!.id };
    });

  const a = await seed(tenantA, '+99890333100', [recepA, sharedDoctor]);
  const b = await seed(tenantB, '+99890333200', [
    sharedDoctor,
    onlyBDoctor,
    onlyBAssistant,
    recepB,
  ]);
  branchA = a.branch;
  patientA = a.p1;
  patientA2 = a.p2;
  branchB = b.branch;
  patientB = b.p1;

  const claims = (sub: string, atid: string) => ({
    sub,
    atid,
    abid: null,
    perms: receptionistPerms,
    roleKey: 'receptionist',
    lang: 'uz' as const,
  });
  tokenA = (await signAccess(claims(recepA, tenantA))).token;
  tokenB = (await signAccess(claims(recepB, tenantB))).token;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-02 — create egalik (Receptionist, real route + RLS)', () => {
  test('sanity: Receptionist @owner emas', () => {
    expect(receptionistPerms).not.toContain('@owner');
  });

  test('begona tenant bemori → 404 patient.not_found, yozuv yaratilmaydi', async () => {
    const res = await call(tokenA, 'POST', '/', {
      branchId: branchA,
      patientId: patientB,
      doctorId: sharedDoctor,
      serviceIds: [],
      ...slot('09:00', '10:00'),
    });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'patient.not_found',
    );
    const n = await withTenant(tenantB, async (tx) => tx.select().from(appointments));
    expect(n.length).toBe(0);
  });

  test('A tenantida tayinlovi yo`q doktor → 404 doctor.not_found', async () => {
    const res = await call(tokenA, 'POST', '/', {
      branchId: branchA,
      patientId: patientA,
      doctorId: onlyBDoctor,
      serviceIds: [],
      ...slot('09:00', '10:00'),
    });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('doctor.not_found');
  });

  test('begona yordamchi → 404 assistant.not_found', async () => {
    const res = await call(tokenA, 'POST', '/', {
      branchId: branchA,
      patientId: patientA,
      doctorId: sharedDoctor,
      assistantId: onlyBAssistant,
      serviceIds: [],
      ...slot('09:00', '10:00'),
    });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'assistant.not_found',
    );
  });

  // Review (X-1): body `branchId` RLS ostida tekshirilmasdi — isDoctorInBranch owner va
  // tenant-wide (branch_id NULL) doktor uchun HAR QANDAY filialga true qaytaradi, natijada
  // A tenantida B filialiga bog'langan yozilish yaratilardi (B filialni o'chirsa — CASCADE).
  test.each([
    ['owner-doktor', () => ownerA, '07:00', '08:00'],
    ['tenant-wide doktor', () => sharedDoctor, '08:00', '09:00'],
  ] as const)('begona tenant filiali (%s) → 404 branch.not_found, yozuv yaratilmaydi', async (_l, doc, from, to) => {
    const res = await call(tokenA, 'POST', '/', {
      branchId: branchB,
      patientId: patientA,
      doctorId: doc(),
      serviceIds: [],
      ...slot(from, to, '2026-12-12'),
    });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('branch.not_found');
    const rows = await withTenant(tenantA, async (tx) =>
      tx.select().from(appointments).where(eq(appointments.branchId, branchB)),
    );
    expect(rows.length).toBe(0);
  });

  test('o`z tenant doktor+bemor → 201', async () => {
    const res = await call(tokenA, 'POST', '/', {
      branchId: branchA,
      patientId: patientA,
      doctorId: sharedDoctor,
      serviceIds: [],
      ...slot('11:00', '12:00'),
    });
    expect(res.status).toBe(201);
  });
});

describe('FX-02 — update egalik', () => {
  let apptId: string;
  test('setup: A da yozilish', async () => {
    const res = await call(tokenA, 'POST', '/', {
      branchId: branchA,
      patientId: patientA2,
      doctorId: sharedDoctor,
      serviceIds: [],
      ...slot('14:00', '15:00'),
    });
    expect(res.status).toBe(201);
    apptId = ((await res.json()) as { data: { id: string } }).data.id;
  });

  test('PATCH begona doktor → 404 doctor.not_found', async () => {
    const res = await call(tokenA, 'PATCH', `/${apptId}`, { doctorId: onlyBDoctor });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('doctor.not_found');
  });

  test('PATCH begona yordamchi → 404 assistant.not_found', async () => {
    const res = await call(tokenA, 'PATCH', `/${apptId}`, { assistantId: onlyBAssistant });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'assistant.not_found',
    );
  });

  test('PATCH assistantId=null va o`z doktor → 200', async () => {
    const res = await call(tokenA, 'PATCH', `/${apptId}`, { assistantId: null });
    expect(res.status).toBe(200);
  });
});

describe('FX-02 / D-12 — EXCLUDE tenant-scoped', () => {
  test('ikki klinikadagi doktor: A broni B ni bloklamaydi', async () => {
    const a = await call(tokenA, 'POST', '/', {
      branchId: branchA,
      patientId: patientA,
      doctorId: sharedDoctor,
      serviceIds: [],
      ...slot('16:00', '17:00', '2026-12-11'),
    });
    expect(a.status).toBe(201);
    // Bir xil doktor, bir xil vaqt — B klinikasi (B bemori). Pre-check RLS ostida,
    // global EXCLUDE esa 23P01 → 409 qilardi.
    const b = await call(tokenB, 'POST', '/', {
      branchId: branchB,
      patientId: patientB,
      doctorId: sharedDoctor,
      serviceIds: [],
      ...slot('16:00', '17:00', '2026-12-11'),
    });
    expect(b.status).toBe(201);
  });

  test('bir tenant ichida doktor kesishuvi DB darajasida rad etiladi (doctor_busy)', async () => {
    // Pre-check'ni chetlab o'tib to'g'ridan insert: constraint hali himoya qiladi.
    const insertOverlap = (patientId: string) =>
      withTenant(tenantA, async (tx) =>
        tx
          .insert(appointments)
          .values({
            tenantId: tenantA,
            branchId: branchA,
            patientId,
            doctorId: sharedDoctor,
            startTime: new Date('2026-12-11T16:30:00+05:00'),
            endTime: new Date('2026-12-11T17:30:00+05:00'),
          })
          .returning(),
      );
    let err: unknown;
    try {
      await insertOverlap(patientA2);
    } catch (e) {
      err = e;
    }
    expect(exclusionConflictCode(err)).toBe('conflict.doctor_busy');
  });

  test('bir tenant ichida bemor kesishuvi → patient_busy (constraint nomi saqlangan)', async () => {
    let err: unknown;
    try {
      await withTenant(tenantA, async (tx) =>
        tx.insert(appointments).values({
          tenantId: tenantA,
          branchId: branchA,
          patientId: patientA,
          doctorId: ownerA,
          startTime: new Date('2026-12-11T16:30:00+05:00'),
          endTime: new Date('2026-12-11T17:30:00+05:00'),
        }),
      );
    } catch (e) {
      err = e;
    }
    expect(exclusionConflictCode(err)).toBe('conflict.patient_busy');
  });

  test('constraint ta`riflari tenant_id ni o`z ichiga oladi', async () => {
    const rows = (await db.execute(
      sql`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conname IN ('appointments_no_doctor_overlap','appointments_no_patient_overlap')`,
    )) as unknown as { conname: string; def: string }[];
    expect(rows.length).toBe(2);
    for (const r of rows) expect(r.def).toContain('tenant_id WITH =');
  });
});
