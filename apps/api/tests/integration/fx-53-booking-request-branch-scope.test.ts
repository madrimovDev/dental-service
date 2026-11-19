/**
 * FX-53 (X-2, D-8) — booking-requests ro'yxati, soni va qarori chaqiruvchining tayinlangan
 * filiallari bilan cheklanadi. REAL DB + REAL HTTP (createApp) + real `user_assignments` +
 * real cheklangan rol (appointment.view/create), `@owner` EMAS. Tenant-wide tayinlov va owner istisno.
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-53-booking-request-branch-scope.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  bookingRequests,
  branches,
  patients,
  permissions,
  rolePermissions,
  roles,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const PERMS = ['appointment.view', 'appointment.create'];
const app = createApp();

let tenantId: string;
let brA: string;
let brB: string;
let reqA: string;
let reqB: string;
const tok: Record<string, string> = {};

const call = async (who: string, method: 'GET' | 'POST', path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.53.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const statusOf = async (id: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [r] = await tx
      .select({ status: bookingRequests.status })
      .from(bookingRequests)
      .where(eq(bookingRequests.id, id));
    return r?.status;
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  const owner = await mk('+998900005301');
  const recA = await mk('+998900005302'); // faqat A
  const recAll = await mk('+998900005303'); // tenant-wide
  const ghost = await mk('+998900005304'); // tayinlov yo'q
  const doctor = await mk('+998900005305');

  for (const code of PERMS) {
    await db.insert(permissions).values({ code, category: 'appointment' }).onConflictDoNothing();
  }
  const permRows = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.code, PERMS));

  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FX53', slug: 'fx-53-br', ownerUserId: owner })
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
    const [role] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Registrator' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(permRows.map((p) => ({ roleId: role!.id, permissionId: p.id })));
    await tx.insert(userAssignments).values([
      { tenantId, userId: recA, branchId: brA, roleId: role!.id },
      { tenantId, userId: recAll, branchId: null, roleId: role!.id },
    ]);
    const [pt] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'P' })
      .returning({ id: patients.id });
    const future = new Date(Date.now() + 3 * 86_400_000);
    const mkReq = async (branchId: string) =>
      (
        await tx
          .insert(bookingRequests)
          .values({
            tenantId,
            branchId,
            patientId: pt!.id,
            doctorId: doctor,
            requestedStart: future,
          })
          .returning({ id: bookingRequests.id })
      )[0]!.id;
    reqA = await mkReq(brA);
    reqB = await mkReq(brB);
  });

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

const ids = (r: { json: any }) => r.json.data.items.map((i: any) => i.id).sort();

describe('FX-53: booking-requests filial doirasi', () => {
  test('filial registratori: ro`yxat va pendingCount faqat o`z filiali', async () => {
    const r = await call('recA', 'GET', '/api/booking-requests?status=pending');
    expect(r.status).toBe(200);
    expect(ids(r)).toEqual([reqA]);
    expect(r.json.data.pendingCount).toBe(1);
  });

  test('begona filial ?branchId= → 403 branch.forbidden', async () => {
    const r = await call('recA', 'GET', `/api/booking-requests?branchId=${brB}`);
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('branch.forbidden');
  });

  test('tayinlovsiz xodim → 403', async () => {
    expect((await call('ghost', 'GET', '/api/booking-requests')).status).toBe(403);
  });

  test('tenant-wide va owner: hammasi; ?branchId= bilan toraytirish', async () => {
    for (const who of ['recAll', 'owner']) {
      const all = await call(who, 'GET', '/api/booking-requests');
      expect(ids(all)).toEqual([reqA, reqB].sort());
      expect(all.json.data.pendingCount).toBe(2);
      const onlyB = await call(who, 'GET', `/api/booking-requests?branchId=${brB}`);
      expect(ids(onlyB)).toEqual([reqB]);
      expect(onlyB.json.data.pendingCount).toBe(1);
    }
  });

  test('begona filial so`rovini rad etish/tasdiqlash → 403 va so`rov pending qoladi', async () => {
    const dec = await call('recA', 'POST', `/api/booking-requests/${reqB}/decline`, {
      reason: 'x',
    });
    expect(dec.status).toBe(403);
    expect(dec.json.error.code).toBe('branch.forbidden');
    const conf = await call('recA', 'POST', `/api/booking-requests/${reqB}/confirm`, {});
    expect(conf.status).toBe(403);
    expect(await statusOf(reqB)).toBe('pending');
  });

  test('o`z filiali so`rovini rad etish — 200', async () => {
    const dec = await call('recA', 'POST', `/api/booking-requests/${reqA}/decline`, {
      reason: 'band',
    });
    expect(dec.status).toBe(200);
    expect(await statusOf(reqA)).toBe('declined');
  });
});
