/**
 * FX-55 — Navbat: ticket yaratilganda yozilish shifokori `queue_tickets.doctor_id`ga yoziladi,
 * shunda UI (queue.manage'siz shifokor) o'ziga tegishli «keyingi» bemorni aniqlay oladi va
 * boshqa shifokor bemori uchun 403 beradigan «Chaqirish» tugmasini ko'rsatmaydi.
 * REAL HTTP + REAL DB + REAL rol permset (receptionist yaratadi, doctor chaqiradi; @owner EMAS).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env fx-55-queue-ticket-doctor`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import { appointments, branches, patients, tenants, users } from '@dental/db-schema';
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
let patientId: string;
let doctorId: string;
let otherDoctorId: string;
let doctorApptId: string;
let otherApptId: string;
let doctorToken: string;
let receptionToken: string;

const tokenFor = async (sub: string, perms: string[], roleKey: string) =>
  (await signAccess({ sub, atid: tenantId, abid: null, perms, roleKey, lang: 'uz' })).token;

const req = (method: string, path: string, token: string, body?: unknown) =>
  createApp().request(path, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const ins = await db
    .insert(users)
    .values([
      { phone: '+998900005501', passwordHash: 'x', fullName: 'Owner' },
      { phone: '+998900005502', passwordHash: 'x', fullName: 'Doctor A' },
      { phone: '+998900005503', passwordHash: 'x', fullName: 'Doctor B' },
      { phone: '+998900005504', passwordHash: 'x', fullName: 'Reception' },
    ])
    .returning({ id: users.id });
  const [owner, d1, d2, r] = ins;
  if (!owner || !d1 || !d2 || !r) throw new Error('users');
  doctorId = d1.id;
  otherDoctorId = d2.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FX55', slug: 'fx-55', ownerUserId: owner.id })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [b] = await tx.insert(branches).values({ tenantId, name: 'B' }).returning();
    branchId = b!.id;
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor 55' })
      .returning({ id: patients.id });
    patientId = p!.id;
    const mk = async (docId: string, hour: number) => {
      const [a] = await tx
        .insert(appointments)
        .values({
          tenantId,
          branchId,
          patientId,
          doctorId: docId,
          startTime: new Date(Date.UTC(2030, 0, 1, hour)),
          endTime: new Date(Date.UTC(2030, 0, 1, hour, 30)),
          status: 'scheduled',
        })
        .returning({ id: appointments.id });
      return a!.id;
    };
    doctorApptId = await mk(doctorId, 4);
    otherApptId = await mk(otherDoctorId, 6);
  });

  doctorToken = await tokenFor(doctorId, permsFor('doctor'), 'doctor');
  receptionToken = await tokenFor(r.id, permsFor('receptionist'), 'receptionist');
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-55 navbat ticket shifokori', () => {
  test('sanity: Doctor queue.manage ga ega emas, queue.view bor', () => {
    expect(permsFor('doctor')).not.toContain('queue.manage');
    expect(permsFor('doctor')).toContain('queue.view');
  });

  test('yozilishdan check-in: ticket.doctorId = yozilish shifokori', async () => {
    const own = await req('POST', '/api/queue', receptionToken, {
      branchId,
      patientId,
      appointmentId: doctorApptId,
    });
    expect(own.status).toBe(201);
    const ownBody = (await own.json()) as { data: { id: string; doctorId: string | null } };
    expect(ownBody.data.doctorId).toBe(doctorId);

    const other = await req('POST', '/api/queue', receptionToken, {
      branchId,
      patientId,
      appointmentId: otherApptId,
    });
    expect(other.status).toBe(201);
    const otherBody = (await other.json()) as { data: { id: string; doctorId: string | null } };
    expect(otherBody.data.doctorId).toBe(otherDoctorId);

    // Doctor bugungi navbatda doctorId bo'yicha o'zinikini ajrata oladi; call-own faqat o'zinikiga 200.
    const today = await req('GET', `/api/queue?branchId=${branchId}`, doctorToken);
    expect(today.status).toBe(200);
    const list = ((await today.json()) as { data: Array<{ id: string; doctorId: string | null }> })
      .data;
    expect(list.filter((t) => t.doctorId === doctorId).map((t) => t.id)).toEqual([ownBody.data.id]);

    expect(
      (await req('POST', `/api/queue/${otherBody.data.id}/call-own`, doctorToken)).status,
    ).toBe(403);
    expect((await req('POST', `/api/queue/${ownBody.data.id}/call-own`, doctorToken)).status).toBe(
      200,
    );
  });

  test("walk-in ticket: doctorId bo'sh (registrator chaqiradi)", async () => {
    const res = await req('POST', '/api/queue', receptionToken, { branchId, patientId });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { doctorId: string | null } };
    expect(body.data.doctorId).toBeNull();
  });
});
