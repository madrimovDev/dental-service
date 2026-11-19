/**
 * FX-113 (LB-22, X-2) — bitta filialga tayinlangan Branch Manager boshqa filial sozlamalarini,
 * uning shifokorlari ish jadvali va time-off'ini o'zgartira olmaydi. REAL DB + REAL HTTP
 * (createApp) + real `user_assignments` + cheklangan rol (`@owner` EMAS). Owner va tenant-wide
 * tayinlov istisno; `branchId: null` time-off faqat shularga ruxsat.
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-113-branch-schedule-scope.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  doctorTimeOff,
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

const MGR_PERMS = ['branch.view', 'branch.edit', 'schedule.view', 'schedule.manage'];
const app = createApp();

let tenantId: string;
let brA: string;
let brB: string;
let docA: string;
let docB: string;
const tok: Record<string, string> = {};

const call = async (who: string, method: string, path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.113.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
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

const mkTimeOff = (doctorId: string, branchId: string | null) =>
  inTenant(async (tx) => {
    const [r] = await tx
      .insert(doctorTimeOff)
      .values({
        tenantId,
        doctorId,
        branchId,
        type: 'other',
        startAt: new Date(Date.now() + 86_400_000),
        endAt: new Date(Date.now() + 2 * 86_400_000),
      })
      .returning({ id: doctorTimeOff.id });
    return r!.id;
  });

const timeOffExists = (id: string) =>
  inTenant(async (tx) => {
    const rows = await tx.select().from(doctorTimeOff).where(eq(doctorTimeOff.id, id));
    return rows.length > 0;
  });

const WH = { mon: { open: '09:00', close: '18:00' } };
const toBody = (doctorId: string, branchId: string | null) => ({
  doctorId,
  branchId,
  type: 'other',
  startAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  endAt: new Date(Date.now() + 6 * 86_400_000).toISOString(),
});
const seg = [{ weekday: 1, start: '09:00', end: '12:00' }];

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  const owner = await mk('+998900011301');
  const mgrA = await mk('+998900011302'); // Branch Manager, faqat A
  const mgrAll = await mk('+998900011303'); // tenant-wide
  docA = await mk('+998900011304');
  docB = await mk('+998900011305');

  for (const code of MGR_PERMS) {
    await db
      .insert(permissions)
      .values({ code, category: code.split('.')[0]! })
      .onConflictDoNothing();
  }
  const permRows = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.code, MGR_PERMS));

  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FX113', slug: 'fx-113-scope', ownerUserId: owner })
      .returning({ id: tenants.id })
  )[0]!.id;

  await inTenant(async (tx) => {
    const [a, b] = await tx
      .insert(branches)
      .values([
        { tenantId, name: 'A', workHours: WH },
        { tenantId, name: 'B', workHours: WH },
      ])
      .returning({ id: branches.id });
    brA = a!.id;
    brB = b!.id;
    const [mgrRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Filial mudiri' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(permRows.map((p) => ({ roleId: mgrRole!.id, permissionId: p.id })));
    const [docRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Doctor', isPractitioner: true })
      .returning({ id: roles.id });
    const now = new Date();
    const asg = (userId: string, branchId: string | null, roleId: string) => ({
      tenantId,
      userId,
      branchId,
      roleId,
      isActive: true,
      acceptedAt: now,
    });
    await tx
      .insert(userAssignments)
      .values([
        asg(mgrA, brA, mgrRole!.id),
        asg(mgrAll, null, mgrRole!.id),
        asg(docA, brA, docRole!.id),
        asg(docB, brB, docRole!.id),
      ]);
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
  tok.mgrA = await sign(mgrA, MGR_PERMS);
  tok.mgrAll = await sign(mgrAll, MGR_PERMS);
});

describe('FX-113: PATCH /branches/{id}', () => {
  test('begona filial → 403 branch.forbidden, ish soati saqlanadi', async () => {
    const r = await call('mgrA', 'PATCH', `/api/branches/${brB}`, { workHours: { mon: null } });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('branch.forbidden');
    const [row] = await inTenant((tx) => tx.select().from(branches).where(eq(branches.id, brB)));
    expect(row!.workHours).toEqual(WH);
  });

  test('o`z filiali 200; tenant-wide va owner — har qanday filial', async () => {
    expect(
      (await call('mgrA', 'PATCH', `/api/branches/${brA}`, { phone: '+998901112233' })).status,
    ).toBe(200);
    expect(
      (await call('mgrAll', 'PATCH', `/api/branches/${brB}`, { phone: '+998901112244' })).status,
    ).toBe(200);
    expect(
      (await call('owner', 'PATCH', `/api/branches/${brB}`, { phone: '+998901112255' })).status,
    ).toBe(200);
  });
});

describe('FX-113: PUT /schedule/doctors/{id}/working-hours', () => {
  test('begona filial (B shifokori, B) → 403 branch.forbidden', async () => {
    const r = await call('mgrA', 'PUT', `/api/schedule/doctors/${docB}/working-hours`, {
      branchId: brB,
      segments: [],
    });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('branch.forbidden');
  });

  test('o`z filialida, shu filial shifokori → 200', async () => {
    const r = await call('mgrA', 'PUT', `/api/schedule/doctors/${docA}/working-hours`, {
      branchId: brA,
      segments: seg,
    });
    expect(r.status).toBe(200);
  });

  test('o`z filialida, lekin shifokor shu filialga biriktirilmagan → 400', async () => {
    const r = await call('mgrA', 'PUT', `/api/schedule/doctors/${docB}/working-hours`, {
      branchId: brA,
      segments: seg,
    });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('schedule.doctor_not_in_branch');
  });

  test('tenant-wide: har qanday filial 200', async () => {
    const r = await call('mgrAll', 'PUT', `/api/schedule/doctors/${docB}/working-hours`, {
      branchId: brB,
      segments: seg,
    });
    expect(r.status).toBe(200);
  });
});

describe('FX-113: time-off', () => {
  test('POST branchId=null → faqat owner/tenant-wide (filial mudiri 403, yozuv yo`q)', async () => {
    const r = await call('mgrA', 'POST', '/api/schedule/time-off', toBody(docB, null));
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('branch.forbidden');
    expect(
      (await call('mgrAll', 'POST', '/api/schedule/time-off', toBody(docB, null))).status,
    ).toBe(201);
    expect((await call('owner', 'POST', '/api/schedule/time-off', toBody(docA, null))).status).toBe(
      201,
    );
  });

  test('POST begona filial → 403; o`z filiali (o`z shifokori) → 201', async () => {
    expect((await call('mgrA', 'POST', '/api/schedule/time-off', toBody(docB, brB))).status).toBe(
      403,
    );
    expect((await call('mgrA', 'POST', '/api/schedule/time-off', toBody(docA, brA))).status).toBe(
      201,
    );
  });

  test('DELETE: begona filial va tenant-wide (null) time-off 403 va saqlanadi; o`zinikini o`chiradi', async () => {
    const tB = await mkTimeOff(docB, brB);
    const tNull = await mkTimeOff(docA, null);
    const tA = await mkTimeOff(docA, brA);
    expect((await call('mgrA', 'DELETE', `/api/schedule/time-off/${tB}`)).status).toBe(403);
    expect((await call('mgrA', 'DELETE', `/api/schedule/time-off/${tNull}`)).status).toBe(403);
    expect(await timeOffExists(tB)).toBe(true);
    expect(await timeOffExists(tNull)).toBe(true);
    expect((await call('mgrA', 'DELETE', `/api/schedule/time-off/${tA}`)).status).toBe(200);
    expect(await timeOffExists(tA)).toBe(false);
    expect((await call('mgrAll', 'DELETE', `/api/schedule/time-off/${tNull}`)).status).toBe(200);
  });
});
