/**
 * FX-136 (LC-14) — recall PATCH: scheduledAppointmentId begona tenant / boshqa bemor
 * yozilishiga ulanmasligi shart (FK RLS'ni chetlab o'tadi). REAL DB, real createApp(),
 * CHEKLANGAN rol (`recall.manage` xolos).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-136-recall-patch-appointment.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  patients,
  recalls,
  roles,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { createAdminDb, db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const admin = createAdminDb();
let tA: string;
let tB: string;
let staffA: string;
let patientA: string;
let patientA2: string;
let apptOwn: string; // A, patientA
let apptOtherPatient: string; // A, patientA2
let apptB: string; // B tenanti
let recallId: string;
let token: string;

const patch = (body: unknown) =>
  createApp().request(`/api/recalls/${recallId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
const scheduledOf = async () => {
  const [r] = await admin.db.select().from(recalls).where(eq(recalls.id, recallId));
  return r!.scheduledAppointmentId;
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string, name: string) => {
    const [u] = await db
      .insert(users)
      .values({ phone, passwordHash: 'x', fullName: name })
      .returning({ id: users.id });
    return u!.id;
  };
  const ownerA = await mk('+998900001361', 'Owner A');
  const ownerB = await mk('+998900001362', 'Owner B');
  staffA = await mk('+998900001363', 'Staff A');
  const mkTenant = async (slug: string, owner: string) => {
    const [t] = await db
      .insert(tenants)
      .values({ name: slug, slug, ownerUserId: owner })
      .returning({ id: tenants.id });
    return t!.id;
  };
  tA = await mkTenant('fx136-a', ownerA);
  tB = await mkTenant('fx136-b', ownerB);

  const seedAppt = async (
    tx: Parameters<Parameters<typeof withTenant>[1]>[0],
    tenantId: string,
    branchId: string,
    patientId: string,
    doctorId: string,
    hour: number,
  ) => {
    const start = new Date(`2036-05-01T${String(hour).padStart(2, '0')}:00:00+05:00`);
    const [a] = await tx
      .insert(appointments)
      .values({
        tenantId,
        branchId,
        doctorId,
        patientId,
        startTime: start,
        endTime: new Date(start.getTime() + 30 * 60_000),
        status: 'scheduled',
      })
      .returning({ id: appointments.id });
    return a!.id;
  };

  await withTenant(tA, async (tx) => {
    const [br] = await tx
      .insert(branches)
      .values({ tenantId: tA, name: 'A' })
      .returning({ id: branches.id });
    const [role] = await tx
      .insert(roles)
      .values({ tenantId: tA, name: 'Recall', isSystem: false })
      .returning({ id: roles.id });
    await tx
      .insert(userAssignments)
      .values({ userId: staffA, tenantId: tA, roleId: role!.id, isActive: true });
    const [p1] = await tx
      .insert(patients)
      .values({ tenantId: tA, fullName: 'A1', phone: '+998901360001' })
      .returning({ id: patients.id });
    const [p2] = await tx
      .insert(patients)
      .values({ tenantId: tA, fullName: 'A2', phone: '+998901360002' })
      .returning({ id: patients.id });
    patientA = p1!.id;
    patientA2 = p2!.id;
    apptOwn = await seedAppt(tx, tA, br!.id, patientA, ownerA, 9);
    apptOtherPatient = await seedAppt(tx, tA, br!.id, patientA2, ownerA, 11);
    const [r] = await tx
      .insert(recalls)
      .values({
        tenantId: tA,
        patientId: patientA,
        reason: 'manual',
        status: 'pending',
        source: 'manual',
        dueDate: '2036-06-01',
      })
      .returning({ id: recalls.id });
    recallId = r!.id;
  });
  await withTenant(tB, async (tx) => {
    const [br] = await tx
      .insert(branches)
      .values({ tenantId: tB, name: 'B' })
      .returning({ id: branches.id });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId: tB, fullName: 'B1', phone: '+998901360003' })
      .returning({ id: patients.id });
    apptB = await seedAppt(tx, tB, br!.id, p!.id, ownerB, 9);
  });

  ({ token } = await signAccess({
    sub: staffA,
    atid: tA,
    abid: null,
    perms: ['recall.manage'],
    roleKey: null,
    lang: 'uz',
  }));
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await admin.client.end({ timeout: 5 });
});

describe('FX-136 — recall PATCH scheduledAppointmentId egaligi', () => {
  test('begona tenant yozilishi → 404, o‘zgarmaydi', async () => {
    const res = await patch({ scheduledAppointmentId: apptB });
    expect(res.status).toBe(404);
    expect(await scheduledOf()).toBeNull();
  });

  test('shu tenantning BOSHQA bemori yozilishi → 404, o‘zgarmaydi', async () => {
    const res = await patch({ scheduledAppointmentId: apptOtherPatient });
    expect(res.status).toBe(404);
    expect(await scheduledOf()).toBeNull();
  });

  test('o‘z bemorining yozilishi → 200 va bog‘lanadi; null bilan uziladi', async () => {
    const ok = await patch({ scheduledAppointmentId: apptOwn });
    expect(ok.status).toBe(200);
    expect(await scheduledOf()).toBe(apptOwn);
    const clear = await patch({ scheduledAppointmentId: null });
    expect(clear.status).toBe(200);
    expect(await scheduledOf()).toBeNull();
  });
});
