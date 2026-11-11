/**
 * UI-R4 Navbat — `POST /api/queue/{id}/call-own` (REAL HTTP + REAL DB + REAL rol permset, @owner EMAS).
 *
 *  - Doctor (faqat `queue.view`, `queue.manage` YO'Q): o'z bemori (ticket.appointment.doctorId === user.id) → 200;
 *    begona shifokor bemori → 403; yozilishsiz (walk-in) tiket → 403.
 *  - Receptionist (`queue.manage`): istalgan tiketni chaqiradi → 200.
 *  - Mavjud PATCH /status endpointi Doctor uchun HALI HAM 403 (yangi permission kodi yo'q).
 *  - SC-09: queue→appointment sync `{ok:false}` natijasi javobda `appointmentSyncError` bilan qaytadi.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env ui-r4-queue-call`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import { appointments, branches, patients, queueTickets, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const permsFor = (k: string): string[] => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === k);
  if (!t) throw new Error(`template ${k}`);
  return [...t.permissions];
};

let tenantId: string;
let branchId: string;
let doctorId: string;
let otherDoctorId: string;
let receptionistId: string;
let ownTicket: string;
let foreignTicket: string;
let walkInTicket: string;
let doctorToken: string;
let receptionistToken: string;

const tokenFor = async (sub: string, perms: string[], roleKey: string) =>
  (await signAccess({ sub, atid: tenantId, abid: null, perms, roleKey, lang: 'uz' })).token;

const call = (path: string, token: string, init: RequestInit = {}) =>
  createApp().request(path, {
    method: 'POST',
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const ins = await db
    .insert(users)
    .values([
      { phone: '+998900004401', passwordHash: 'x', fullName: 'Owner' },
      { phone: '+998900004402', passwordHash: 'x', fullName: 'Doctor Own' },
      { phone: '+998900004403', passwordHash: 'x', fullName: 'Doctor Other' },
      { phone: '+998900004404', passwordHash: 'x', fullName: 'Reception' },
    ])
    .returning({ id: users.id });
  const [owner, d1, d2, r] = ins;
  if (!owner || !d1 || !d2 || !r) throw new Error('users');
  doctorId = d1.id;
  otherDoctorId = d2.id;
  receptionistId = r.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'R4', slug: 'ui-r4', ownerUserId: owner.id })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [b] = await tx.insert(branches).values({ tenantId, name: 'B' }).returning();
    branchId = b!.id;
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor R4' })
      .returning({ id: patients.id });
    const mkAppt = async (docId: string, hour: number) => {
      const [a] = await tx
        .insert(appointments)
        .values({
          tenantId,
          branchId,
          patientId: p!.id,
          doctorId: docId,
          startTime: new Date(Date.UTC(2030, 0, 1, hour)),
          endTime: new Date(Date.UTC(2030, 0, 1, hour, 30)),
          status: 'cancelled',
        })
        .returning({ id: appointments.id });
      return a!.id;
    };
    const ownAppt = await mkAppt(doctorId, 4);
    const foreignAppt = await mkAppt(otherDoctorId, 6);
    const mkTicket = async (n: number, appointmentId: string | null) => {
      const [t] = await tx
        .insert(queueTickets)
        .values({ tenantId, branchId, patientId: p!.id, queueNumber: n, appointmentId })
        .returning({ id: queueTickets.id });
      return t!.id;
    };
    ownTicket = await mkTicket(1, ownAppt);
    foreignTicket = await mkTicket(2, foreignAppt);
    walkInTicket = await mkTicket(3, null);
  });

  doctorToken = await tokenFor(doctorId, permsFor('doctor'), 'doctor');
  receptionistToken = await tokenFor(receptionistId, permsFor('receptionist'), 'receptionist');
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('UI-R4 call-own (real permset)', () => {
  test('sanity: Doctor queue.manage ga ega EMAS, Receptionist ega', () => {
    expect(permsFor('doctor')).not.toContain('queue.manage');
    expect(permsFor('receptionist')).toContain('queue.manage');
  });

  test('Doctor: begona shifokor bemori → 403', async () => {
    const res = await call(`/api/queue/${foreignTicket}/call-own`, doctorToken);
    expect(res.status).toBe(403);
  });

  test('Doctor: yozilishsiz (walk-in) tiket → 403', async () => {
    const res = await call(`/api/queue/${walkInTicket}/call-own`, doctorToken);
    expect(res.status).toBe(403);
  });

  test("Doctor: PATCH /status hali ham 403 (yangi permission kodi yo'q)", async () => {
    const res = await createApp().request(`/api/queue/${ownTicket}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${doctorToken}` },
      body: JSON.stringify({ status: 'in_progress' }),
    });
    expect(res.status).toBe(403);
  });

  test("Doctor: o'z bemori → 200, in_progress, doctorId=user; SC-09 sync xatosi qaytadi", async () => {
    const res = await call(`/api/queue/${ownTicket}/call-own`, doctorToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data.status).toBe('in_progress');
    expect(body.data.doctorId).toBe(doctorId);
    // bog'langan yozilish `cancelled` → in_progress sync rad etiladi, UI'ga ko'rinadi
    expect(typeof body.data.appointmentSyncError).toBe('string');
  });

  test('Receptionist: istalgan tiketni chaqiradi → 200', async () => {
    const res = await call(`/api/queue/${foreignTicket}/call-own`, receptionistToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data.status).toBe('in_progress');
  });

  test("mavjud bo'lmagan tiket → 404", async () => {
    const res = await call(
      '/api/queue/00000000-0000-4000-8000-000000000000/call-own',
      receptionistToken,
    );
    expect(res.status).toBe(404);
  });
});
