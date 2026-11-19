/**
 * FX-124 (LC-02) — check-in nomzodlari: terminal (missed/done) ticket'i bor, lekin hali
 * scheduled/confirmed qolgan yozilish nomzod ro'yxatidan tushib qolmasligi kerak;
 * faqat OCHIQ (waiting/in_progress) ticket'li yozilish chiqarib tashlanadi.
 * REAL DB + REAL HTTP + real rol permset (receptionist, @owner EMAS).
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-124-checkin-candidates-closed-ticket.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import { appointments, branches, patients, queueTickets, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { seedRoleForUser } from './fx-m2-helpers.ts';

let tenantId: string;
let branchId: string;
let token: string;
const apptIds: Record<'none' | 'waiting' | 'missed' | 'done', string> = {
  none: '',
  waiting: '',
  missed: '',
  done: '',
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const ins = await db
    .insert(users)
    .values([
      { phone: '+998900012401', passwordHash: 'x', fullName: 'Owner' },
      { phone: '+998900012402', passwordHash: 'x', fullName: 'Reception' },
      { phone: '+998900012403', passwordHash: 'x', fullName: 'Doctor' },
    ])
    .returning({ id: users.id });
  const [owner, rec, doc] = ins;
  if (!owner || !rec || !doc) throw new Error('users');
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FX124', slug: 'fx-124', ownerUserId: owner.id })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [b] = await tx.insert(branches).values({ tenantId, name: 'B' }).returning();
    branchId = b!.id;
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor 124' })
      .returning({ id: patients.id });
    const patientId = p!.id;
    let hour = 9;
    const mk = async (key: keyof typeof apptIds) => {
      const start = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00+05:00`);
      hour += 1;
      const [a] = await tx
        .insert(appointments)
        .values({
          tenantId,
          branchId,
          patientId,
          doctorId: doc.id,
          startTime: start,
          endTime: new Date(start.getTime() + 30 * 60 * 1000),
          status: 'scheduled',
        })
        .returning({ id: appointments.id });
      apptIds[key] = a!.id;
    };
    for (const k of ['none', 'waiting', 'missed', 'done'] as const) await mk(k);
    let n = 1;
    for (const [key, status] of [
      ['waiting', 'waiting'],
      ['missed', 'missed'],
      ['done', 'done'],
    ] as const) {
      await tx.insert(queueTickets).values({
        tenantId,
        branchId,
        patientId,
        appointmentId: apptIds[key],
        queueNumber: n++,
        status,
      });
    }
  });

  const perms = ROLE_TEMPLATES.find((x) => x.templateKey === 'receptionist')!.permissions;
  await seedRoleForUser(tenantId, rec.id, branchId, [...perms]);
  token = (
    await signAccess({
      sub: rec.id,
      atid: tenantId,
      abid: branchId,
      perms: [...perms],
      roleKey: 'receptionist',
      lang: 'uz',
    })
  ).token;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-124 check-in nomzodlari', () => {
  test("terminal (missed/done) ticket'li yozilish nomzod; ochiq ticket'lisi emas", async () => {
    const res = await createApp().request(`/api/queue/check-in-candidates?branchId=${branchId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const ids = ((await res.json()) as { data: Array<{ id: string }> }).data.map((a) => a.id);
    expect(ids.sort()).toEqual([apptIds.none, apptIds.missed, apptIds.done].sort());
    expect(ids).not.toContain(apptIds.waiting);
  });
});
