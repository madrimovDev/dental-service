/**
 * FX-126 (LC-04) — shifokor jadvali: «jadval umuman yo'q» (filial ish soati amal qiladi) va
 * «bu filialda ishlamaydi» (bo'sh saqlash → is_active=false sentinel qator) ajratiladi.
 * Ilgari bo'sh saqlash barcha qatorni o'chirib, shifokorni filial ish soatida BAND QILINADIGAN
 * qoldirardi. REAL DB + REAL HTTP (createApp) + cheklangan rol (schedule.view/manage, @owner EMAS).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-126-doctor-schedule-sentinel.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  doctorSchedules,
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

const MGR_PERMS = ['schedule.view', 'schedule.manage'];
const app = createApp();
const DAY = '2026-12-21'; // Dushanba (weekday 1)

let tenantId: string;
let branchId: string;
let doctorId: string;
let token: string;

const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.126.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const inTenant = <T>(fn: (tx: typeof db) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx as unknown as typeof db);
  });

const slots = async () =>
  (
    await call(
      'GET',
      `/api/schedule/availability?doctorId=${doctorId}&branchId=${branchId}&date=${DAY}`,
    )
  ).json.data.slots as unknown[];
const branchDoctors = async () =>
  (await call('GET', `/api/schedule/availability/branch?branchId=${branchId}&date=${DAY}`)).json
    .data.doctors as { doctorId: string }[];
const hours = async () =>
  (await call('GET', `/api/schedule/doctors/${doctorId}/working-hours?branchId=${branchId}`)).json
    .data as { isActive: boolean }[];
const put = (segments: unknown[]) =>
  call('PUT', `/api/schedule/doctors/${doctorId}/working-hours`, { branchId, segments });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  const owner = await mk('+998900012601');
  const mgr = await mk('+998900012602');
  doctorId = await mk('+998900012603');

  for (const code of MGR_PERMS) {
    await db.insert(permissions).values({ code, category: 'schedule' }).onConflictDoNothing();
  }
  const permRows = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.code, MGR_PERMS));

  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FX126', slug: 'fx-126', ownerUserId: owner })
      .returning({ id: tenants.id })
  )[0]!.id;

  await inTenant(async (tx) => {
    const [b] = await tx
      .insert(branches)
      .values({ tenantId, name: 'A', workHours: { mon: { open: '09:00', close: '18:00' } } })
      .returning({ id: branches.id });
    branchId = b!.id;
    const [mgrRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Jadval mudiri' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(permRows.map((p) => ({ roleId: mgrRole!.id, permissionId: p.id })));
    const [docRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Doctor', isPractitioner: true })
      .returning({ id: roles.id });
    const now = new Date();
    await tx.insert(userAssignments).values([
      {
        tenantId,
        userId: mgr,
        branchId: null,
        roleId: mgrRole!.id,
        isActive: true,
        acceptedAt: now,
      },
      {
        tenantId,
        userId: doctorId,
        branchId,
        roleId: docRole!.id,
        isActive: true,
        acceptedAt: now,
      },
    ]);
  });

  token = (
    await signAccess({
      sub: mgr,
      atid: tenantId,
      abid: null,
      perms: MGR_PERMS,
      roleKey: null,
      lang: 'uz',
    })
  ).token;
});

describe('FX-126 — shifokor jadvali: sozlanmagan vs «ishlamaydi»', () => {
  test('jadval umuman yo`q → filial ish soati amal qiladi (P10 fallback saqlanadi)', async () => {
    expect(await hours()).toEqual([]);
    expect((await slots()).length).toBeGreaterThan(0);
    expect((await branchDoctors()).map((d) => d.doctorId)).toContain(doctorId);
  });

  test("bo`sh saqlash → «ishlamaydi»: sentinel qator, slot yo`q, filial availability'da yo`q", async () => {
    const r = await put([]);
    expect(r.status).toBe(200);
    // GET editor uchun «sozlangan, lekin faol segment yo'q» holatini ko'radi.
    const h = await hours();
    expect(h.length).toBe(1);
    expect(h[0]!.isActive).toBe(false);
    expect(await slots()).toEqual([]);
    expect((await branchDoctors()).map((d) => d.doctorId)).not.toContain(doctorId);
  });

  test('bron ham rad etiladi (ish soati tashqarisida) — sentinel faol segment emas', async () => {
    const rows = await inTenant((tx) =>
      tx.select().from(doctorSchedules).where(eq(doctorSchedules.doctorId, doctorId)),
    );
    expect(rows.every((x) => x.isActive === false)).toBe(true);
  });

  test('haqiqiy segment saqlansa sentinel yo`qoladi va faqat shu segment amal qiladi', async () => {
    const r = await put([{ weekday: 1, start: '10:00', end: '12:00' }]);
    expect(r.status).toBe(200);
    const h = await hours();
    expect(h.length).toBe(1);
    expect(h[0]!.isActive).toBe(true);
    const s = (await slots()) as { startMinute: number; endMinute: number }[];
    expect(s.length).toBe(4); // 10:00–12:00, 30 daqiqalik
    expect(Math.min(...s.map((x) => x.startMinute))).toBe(600);
    expect(Math.max(...s.map((x) => x.endMinute))).toBe(720);
  });

  test('yana bo`sh saqlash → qaytadan «ishlamaydi» (eski segmentlar tozalanadi)', async () => {
    await put([]);
    expect(await slots()).toEqual([]);
    expect((await hours()).every((x) => x.isActive === false)).toBe(true);
  });
});
