/**
 * FX-133 (LC-11, D-8) — navbat va yozilish operatsiyalari chaqiruvchining tayinlangan
 * filiallari bilan cheklanadi. REAL DB + REAL HTTP (createApp) + real `user_assignments`
 * + real cheklangan rol permset'lari. @owner / tenant-wide tayinlov istisno.
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-133-queue-appointments-branch-scope.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { appointments, branches, patients, queueTickets, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { seedRoleForUser } from './fx-m2-helpers.ts';

const PERMS = [
  'appointment.view',
  'appointment.create',
  'appointment.edit',
  'appointment.cancel',
  'queue.view',
  'queue.create',
  'queue.manage',
];
const app = createApp();

let tenantId: string;
let brA: string;
let brB: string;
let patientId: string;
let doctorId: string;
let apptA: string;
let apptB: string;
let ticketA: string;
let ticketB: string;
const tok: Record<string, string> = {};

const call = async (who: string, method: string, path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.133.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const dateStr = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tashkent',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const at = (hour: number) => new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00+05:00`);

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  const owner = await mk('+998900013301');
  const recA = await mk('+998900013302'); // faqat A
  const recAll = await mk('+998900013303'); // tenant-wide
  const ghost = await mk('+998900013304'); // tayinlov yo'q
  doctorId = await mk('+998900013305');

  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FX133', slug: 'fx-133', ownerUserId: owner })
      .returning({ id: tenants.id })
  )[0]!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [a, b] = await tx
      .insert(branches)
      .values([
        { tenantId, name: 'A' },
        { tenantId, name: 'B' },
      ])
      .returning({ id: branches.id });
    brA = a!.id;
    brB = b!.id;
    patientId = (
      await tx.insert(patients).values({ tenantId, fullName: 'P' }).returning({ id: patients.id })
    )[0]!.id;
    const mkAppt = async (branchId: string, hour: number) =>
      (
        await tx
          .insert(appointments)
          .values({
            tenantId,
            branchId,
            patientId,
            doctorId,
            startTime: at(hour),
            endTime: at(hour + 1),
            status: 'scheduled',
          })
          .returning({ id: appointments.id })
      )[0]!.id;
    apptA = await mkAppt(brA, 9);
    apptB = await mkAppt(brB, 10);
    const mkTicket = async (branchId: string, n: number) =>
      (
        await tx
          .insert(queueTickets)
          .values({ tenantId, branchId, patientId, queueNumber: n })
          .returning({ id: queueTickets.id })
      )[0]!.id;
    ticketA = await mkTicket(brA, 1);
    ticketB = await mkTicket(brB, 1);
  });

  await seedRoleForUser(tenantId, recA, brA, PERMS);
  await seedRoleForUser(tenantId, recAll, null, PERMS);

  const sign = async (userId: string, perms: string[]) =>
    (
      await signAccess({
        sub: userId,
        atid: tenantId,
        abid: null,
        perms,
        roleKey: null,
        lang: 'uz',
      })
    ).token;
  tok.owner = await sign(owner, ['@owner']);
  tok.recA = await sign(recA, PERMS);
  tok.recAll = await sign(recAll, PERMS);
  tok.ghost = await sign(ghost, PERMS);
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const forbidden = (r: { status: number; json: any }) => {
  expect(r.status).toBe(403);
  expect(r.json.error.code).toBe('branch.forbidden');
};

describe('FX-133 navbat: begona filial → 403 branch.forbidden', () => {
  test("ro'yxat va check-in nomzodlari", async () => {
    expect((await call('recA', 'GET', `/api/queue?branchId=${brA}`)).status).toBe(200);
    forbidden(await call('recA', 'GET', `/api/queue?branchId=${brB}`));
    expect(
      (await call('recA', 'GET', `/api/queue/check-in-candidates?branchId=${brA}`)).status,
    ).toBe(200);
    forbidden(await call('recA', 'GET', `/api/queue/check-in-candidates?branchId=${brB}`));
  });

  test('ticket yaratish', async () => {
    forbidden(await call('recA', 'POST', '/api/queue', { branchId: brB, patientId }));
    expect((await call('recA', 'POST', '/api/queue', { branchId: brA })).status).toBe(201);
  });

  test('status o‘zgartirish va call-own begona filial ticketida', async () => {
    forbidden(
      await call('recA', 'PATCH', `/api/queue/${ticketB}/status`, { status: 'in_progress' }),
    );
    forbidden(await call('recA', 'POST', `/api/queue/${ticketB}/call-own`));
    const own = await call('recA', 'PATCH', `/api/queue/${ticketA}/status`, {
      status: 'in_progress',
    });
    expect(own.status).toBe(200);
  });

  test('sweep-no-shows: begona filial 403', async () => {
    forbidden(await call('recA', 'POST', '/api/queue/sweep-no-shows', { branchId: brB }));
    expect(
      (await call('recA', 'POST', '/api/queue/sweep-no-shows', { branchId: brA })).status,
    ).toBe(200);
  });
});

describe('FX-133 yozilish: begona filial → 403 branch.forbidden', () => {
  test("ro'yxat: begona filial 403; filialsiz so'rov faqat o'z filiallarini qaytaradi", async () => {
    forbidden(await call('recA', 'GET', `/api/appointments?branchId=${brB}`));
    const own = await call('recA', 'GET', `/api/appointments?branchId=${brA}`);
    expect(own.status).toBe(200);
    expect(own.json.data.map((a: { id: string }) => a.id)).toEqual([apptA]);
    const all = await call('recA', 'GET', '/api/appointments');
    expect(all.status).toBe(200);
    expect(all.json.data.map((a: { id: string }) => a.id)).toEqual([apptA]);
  });

  test('yaratish begona filialga 403', async () => {
    forbidden(
      await call('recA', 'POST', '/api/appointments', {
        branchId: brB,
        patientId,
        doctorId,
        startTime: at(14).toISOString(),
        endTime: at(15).toISOString(),
      }),
    );
  });

  test('get / patch / cancel begona filial yozilishida 403', async () => {
    forbidden(await call('recA', 'GET', `/api/appointments/${apptB}`));
    forbidden(await call('recA', 'PATCH', `/api/appointments/${apptB}`, { notes: 'x' }));
    forbidden(await call('recA', 'POST', `/api/appointments/${apptB}/cancel`, {}));
    expect((await call('recA', 'GET', `/api/appointments/${apptA}`)).status).toBe(200);
  });
});

describe('FX-133 istisnolar va fail-closed', () => {
  test('owner va tenant-wide tayinlov har filialga kiradi', async () => {
    for (const who of ['owner', 'recAll']) {
      expect((await call(who, 'GET', `/api/queue?branchId=${brB}`)).status).toBe(200);
      expect((await call(who, 'GET', `/api/appointments/${apptB}`)).status).toBe(200);
      const all = await call(who, 'GET', '/api/appointments');
      expect(all.json.data.length).toBe(2);
    }
  });

  test('tayinlovsiz foydalanuvchi (permset bor) → 403', async () => {
    forbidden(await call('ghost', 'GET', `/api/queue?branchId=${brA}`));
    forbidden(await call('ghost', 'GET', '/api/appointments'));
  });
});
