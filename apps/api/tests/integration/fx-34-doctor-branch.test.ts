/**
 * FX-34 (LA-08, D-8) — doktor↔filial moslik.
 *
 * REAL DB + real route (JWT, RLS middleware) + cheklangan rol (Receptionist, `@owner` EMAS):
 *  - GET /doctors?branchId — faqat shu filialga biriktirilgan (yoki tenant-wide) shifokorlar;
 *  - create/update — boshqa filial shifokori → 422 `schedule.doctor_not_in_branch`;
 *  - availability fallback («jadvali yo'q = filial ish soati») faqat biriktirilgan shifokorga;
 *  - is_practitioner bo'lmagan xodim, qabul qilinmagan (acceptedAt NULL) va nofaol tayinlov hisoblanmaydi.
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-34-doctor-branch.test.ts
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
import { sql } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { appointmentRoutes } from '../../src/modules/appointments/appointments.routes.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';
import { createScheduleService } from '../../src/modules/schedule/schedule.service.ts';
import { seedRoleForUser } from './fx-m2-helpers.ts';

const receptionist = ROLE_TEMPLATES.find((t) => t.templateKey === 'receptionist');
if (!receptionist) throw new Error('receptionist template not found');
const receptionistPerms = [...receptionist.permissions] as string[];

const withTenant = <T>(tenantId: string, fn: (tx: typeof db) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx as unknown as typeof db);
  });

const WORK_HOURS = Object.fromEntries(
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [
    d,
    { open: '09:00', close: '18:00' },
  ]),
);

let tenantId: string;
let branchX: string;
let branchY: string;
let patientId: string;
let patient2Id: string;
let token: string;
let docX: string; // faqat X filialga
let docY: string; // faqat Y filialga
let docAll: string; // tenant-wide (branchId NULL)
let nurseX: string; // is_practitioner=false
let docPending: string; // acceptedAt NULL
let docInactive: string; // isActive=false

const appointmentsService = createAppointmentsService({ audit: { record: async () => {} } });
const scheduleService = createScheduleService({ audit: { record: async () => {} } });
const app = appointmentRoutes({
  db,
  audit: { record: async () => {} },
  service: appointmentsService,
});

const call = (method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const slot = (h: string, e: string, day = '2026-12-10') => ({
  startTime: new Date(`${day}T${h}:00+05:00`).toISOString(),
  endTime: new Date(`${day}T${e}:00+05:00`).toISOString(),
});
const errCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const us = await db
    .insert(users)
    .values(
      ['Owner', 'Recep', 'DocX', 'DocY', 'DocAll', 'NurseX', 'DocPending', 'DocInactive'].map(
        (n, i) => ({ phone: `+99890000340${i}`, passwordHash: 'x', fullName: n }),
      ),
    )
    .returning({ id: users.id });
  const ids = us.map((u) => u.id);
  const [owner, recep] = [ids[0]!, ids[1]!];
  [docX, docY, docAll, nurseX, docPending, docInactive] = ids.slice(2) as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  const [t] = await db
    .insert(tenants)
    .values({ name: 'T', slug: 'fx34', ownerUserId: owner })
    .returning({ id: tenants.id });
  tenantId = t!.id;

  await withTenant(tenantId, async (tx) => {
    const brs = await tx
      .insert(branches)
      .values([
        { tenantId, name: 'X', workHours: WORK_HOURS },
        { tenantId, name: 'Y', workHours: WORK_HOURS },
      ])
      .returning();
    branchX = brs[0]!.id;
    branchY = brs[1]!.id;
    const ps = await tx
      .insert(patients)
      .values([
        { tenantId, fullName: 'P1', phone: '+998903340001' },
        { tenantId, fullName: 'P2', phone: '+998903340002' },
      ])
      .returning();
    patientId = ps[0]!.id;
    patient2Id = ps[1]!.id;
    const [doctorRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Doctor', isPractitioner: true })
      .returning();
    const [nurseRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Nurse', isPractitioner: false })
      .returning();
    const now = new Date();
    const a = (userId: string, roleId: string, branchId: string | null, extra = {}) => ({
      userId,
      tenantId,
      roleId,
      branchId,
      isActive: true,
      acceptedAt: now,
      ...extra,
    });
    await tx
      .insert(userAssignments)
      .values([
        a(recep, nurseRole!.id, null),
        a(docX, doctorRole!.id, branchX),
        a(docY, doctorRole!.id, branchY),
        a(docAll, doctorRole!.id, null),
        a(nurseX, nurseRole!.id, branchX),
        a(docPending, doctorRole!.id, branchX, { acceptedAt: null }),
        a(docInactive, doctorRole!.id, branchX, { isActive: false }),
      ]);
  });

  // FX-133: yozilish filial doirasi tayinlovlardan o'qiladi — real (tenant-wide) tayinlov.
  await seedRoleForUser(tenantId, recep, null, receptionistPerms, 'Registrator');

  token = (
    await signAccess({
      sub: recep,
      atid: tenantId,
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

const doctorIds = async (qs = '') => {
  const res = await call('GET', `/doctors${qs}`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { id: string }[] }).data.map((d) => d.id).sort();
};

describe('FX-34 — GET /doctors?branchId (Receptionist, real RLS)', () => {
  test('sanity: Receptionist @owner emas', () => {
    expect(receptionistPerms).not.toContain('@owner');
  });

  test('filialsiz — avvalgidek barcha faol shifokorlar (orqaga moslik)', async () => {
    expect(await doctorIds()).toEqual([docX, docY, docAll].sort());
  });

  test('X filial — docX + tenant-wide docAll; docY, hamshira, kutilayotgan, nofaol YO`Q', async () => {
    expect(await doctorIds(`?branchId=${branchX}`)).toEqual([docX, docAll].sort());
  });

  test('Y filial — docY + docAll', async () => {
    expect(await doctorIds(`?branchId=${branchY}`)).toEqual([docY, docAll].sort());
  });
});

describe('FX-34 — create/update doktor↔filial', () => {
  test('docX Y filialga → 422 schedule.doctor_not_in_branch, yozuv yaratilmaydi', async () => {
    const res = await call('POST', '/', {
      branchId: branchY,
      patientId,
      doctorId: docX,
      serviceIds: [],
      ...slot('10:00', '11:00'),
    });
    expect(res.status).toBe(422);
    expect(await errCode(res)).toBe('schedule.doctor_not_in_branch');
    const n = await withTenant(tenantId, async (tx) => tx.select().from(appointments));
    expect(n.length).toBe(0);
  });

  test('is_practitioner bo`lmagan xodim (hamshira) → 422', async () => {
    const res = await call('POST', '/', {
      branchId: branchX,
      patientId,
      doctorId: nurseX,
      serviceIds: [],
      ...slot('10:00', '11:00'),
    });
    expect(res.status).toBe(422);
  });

  test('kutilayotgan (acceptedAt NULL) va nofaol tayinlov → rad (404 doctor.not_found, FX-02)', async () => {
    for (const d of [docPending, docInactive]) {
      const res = await call('POST', '/', {
        branchId: branchX,
        patientId,
        doctorId: d,
        serviceIds: [],
        ...slot('10:00', '11:00'),
      });
      expect(res.status).toBe(404);
    }
  });

  test('docX X filialga → 201; tenant-wide docAll Y filialga → 201', async () => {
    const r1 = await call('POST', '/', {
      branchId: branchX,
      patientId,
      doctorId: docX,
      serviceIds: [],
      ...slot('10:00', '11:00'),
    });
    expect(r1.status).toBe(201);
    const r2 = await call('POST', '/', {
      branchId: branchY,
      patientId: patient2Id,
      doctorId: docAll,
      serviceIds: [],
      ...slot('10:00', '11:00'),
    });
    expect(r2.status).toBe(201);
  });

  test('PATCH doktorni boshqa filial shifokoriga almashtirish → 422; shu filial shifokoriga → 200', async () => {
    const created = await call('POST', '/', {
      branchId: branchX,
      patientId,
      doctorId: docX,
      serviceIds: [],
      ...slot('14:00', '15:00'),
    });
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { data: { id: string } }).data.id;

    const bad = await call('PATCH', `/${id}`, { doctorId: docY });
    expect(bad.status).toBe(422);
    expect(await errCode(bad)).toBe('schedule.doctor_not_in_branch');

    const ok = await call('PATCH', `/${id}`, { doctorId: docAll });
    expect(ok.status).toBe(200);
  });
});

describe('FX-34 — availability fallback faqat biriktirilgan shifokorga', () => {
  const ctx = (tx: typeof db) =>
    ({
      get: (k: string) => (k === 'activeTenantId' ? tenantId : k === 'db' ? tx : undefined),
    }) as never;

  test('jadvalsiz docX: X filialda slotlar bor, Y filialda YO`Q (avval Y da ham butun kun edi)', async () => {
    const q = (branchId: string, doctorId: string) => ({
      doctorId,
      branchId,
      date: '2030-01-14',
      slotMinutes: 30,
    });
    const inX = await withTenant(tenantId, (tx) =>
      scheduleService.getAvailability(ctx(tx), q(branchX, docX)),
    );
    expect(inX.slots.length).toBeGreaterThan(0);
    const inY = await withTenant(tenantId, (tx) =>
      scheduleService.getAvailability(ctx(tx), q(branchY, docX)),
    );
    expect(inY.slots.length).toBe(0);
    // tenant-wide shifokor ikkala filialda ham ishlaydi
    const allY = await withTenant(tenantId, (tx) =>
      scheduleService.getAvailability(ctx(tx), q(branchY, docAll)),
    );
    expect(allY.slots.length).toBeGreaterThan(0);
  });
});
