/**
 * P6 (FU-08) — taklifga rozilik. REAL HTTP (`createApp()`) + real DB + real login tokenlari.
 * Mavjud foydalanuvchini taklif qilish uni darhol a'zo qilmaydi: `accepted_at IS NULL`
 * tayinlov hech narsa bermaydi (permission, workspace, switch, reset).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/p6b-invite-consent.test.ts`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PERMISSIONS } from '@dental/core';
import {
  branches,
  permissions as permissionsTable,
  refreshTokens,
  rolePermissions,
  roles,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess, verifyAccess } from '../../src/lib/jwt.ts';
import { hashPassword } from '../../src/lib/password.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';

const IP = `10.67.0.${Math.floor(Math.random() * 250 + 1)}`;
const PW = 'DoctorPassword123!';

const DOCTOR_PHONE = '+998900007002';
const OUTSIDER_PHONE = '+998900007003';
const DECLINER_PHONE = '+998900007004';
const NEWBIE_PHONE = '+998900007005';

let tenantA: string;
let tenantB: string;
let branchA: string;
let roleA: string; // A klinikadagi rol (user.invite emas — oddiy xodim roli)
let roleB: string;
let ownerA: string;
let ownerB: string;
let doctorId: string; // B klinika a'zosi, A taklif qiladi
let outsiderId: string;
let declinerId: string;
let ownerAToken: string;

const call = (token: string | null, method: string, path: string, body?: unknown) =>
  createApp().request(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': IP,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const withTx = <T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const login = async (phone: string, password: string) => {
  const res = await call(null, 'POST', '/auth/login', { phone, password });
  const json = (await res.json()) as {
    data?: { accessToken: string; refreshToken: string; mustChangePassword: boolean };
  };
  return { res, data: json.data };
};

const errCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

type Invitation = {
  id: string;
  tenantId: string;
  tenantName: string;
  branchId: string | null;
  branchName: string | null;
  roleName: string;
  invitedAt: string;
};
const listInvitations = async (token: string) => {
  const res = await call(token, 'GET', '/auth/invitations');
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: Invitation[] }).data;
};

const assignmentRow = async (userId: string, tenantId: string) => {
  const rows = await withTx(tenantId, (tx) =>
    tx.select().from(userAssignments).where(eq(userAssignments.userId, userId)),
  );
  return rows.filter((r) => r.tenantId === tenantId);
};

const mkUser = async (phone: string, fullName: string, password = PW) => {
  const [u] = await db
    .insert(users)
    // FU-15: bu to'plam rozilik (accepted_at) mantig'ini tekshiradi — telefon tasdig'i
    // talabi `fu15-phone-verification.test.ts`da. Shu yerda telefon tasdiqlangan deb olinadi.
    .values({
      phone,
      passwordHash: await hashPassword(password),
      fullName,
      phoneVerifiedAt: new Date(),
    })
    .returning({ id: users.id });
  if (!u) throw new Error('user insert failed');
  return u.id;
};

const seedRole = (tenantId: string, name: string, codes: string[]) =>
  withTx(tenantId, async (tx) => {
    const [r] = await tx.insert(roles).values({ tenantId, name }).returning({ id: roles.id });
    if (!r) throw new Error('role insert failed');
    const perms = await tx
      .select({ id: permissionsTable.id })
      .from(permissionsTable)
      .where(inArray(permissionsTable.code, codes));
    await tx
      .insert(rolePermissions)
      .values(perms.map((p) => ({ roleId: r.id, permissionId: p.id })));
    return r.id;
  });

const STAFF_CODES = ['patient.view', 'appointment.view'];

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  for (const p of PERMISSIONS) {
    await db
      .insert(permissionsTable)
      .values({
        code: p.code,
        category: p.category,
        descriptionUz: p.descriptionUz,
        descriptionRu: p.descriptionRu,
      })
      .onConflictDoNothing();
  }

  ownerA = await mkUser('+998900007001', 'OwnerA', 'OwnerPassword123!');
  ownerB = await mkUser('+998900007009', 'OwnerB', 'OwnerPassword123!');
  doctorId = await mkUser(DOCTOR_PHONE, 'DoctorB');
  outsiderId = await mkUser(OUTSIDER_PHONE, 'Outsider');
  declinerId = await mkUser(DECLINER_PHONE, 'Decliner');

  const [ta] = await db
    .insert(tenants)
    .values({ name: 'Clinic A', slug: 'p6b-a', ownerUserId: ownerA })
    .returning({ id: tenants.id });
  const [tb] = await db
    .insert(tenants)
    .values({ name: 'Clinic B', slug: 'p6b-b', ownerUserId: ownerB })
    .returning({ id: tenants.id });
  if (!ta || !tb) throw new Error('tenant insert failed');
  tenantA = ta.id;
  tenantB = tb.id;

  branchA = await withTx(tenantA, async (tx) => {
    const [b] = await tx
      .insert(branches)
      .values({ tenantId: tenantA, name: 'A Main' })
      .returning({ id: branches.id });
    if (!b) throw new Error('branch insert failed');
    return b.id;
  });
  roleA = await seedRole(tenantA, 'A Staff', STAFF_CODES);
  roleB = await seedRole(tenantB, 'B Doctor', STAFF_CODES);

  // Doctor B klinikaning QABUL QILINGAN a'zosi.
  await withTx(tenantB, (tx) =>
    tx
      .insert(userAssignments)
      .values({ userId: doctorId, tenantId: tenantB, roleId: roleB, acceptedAt: new Date() }),
  );

  ownerAToken = (
    await signAccess({
      sub: ownerA,
      atid: tenantA,
      abid: null,
      perms: ['@owner'],
      roleKey: null,
      lang: 'uz',
    })
  ).token;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await closeRateLimitRedis();
});

describe('P6b — hujum zanjiri (Review Focus 1, 2)', () => {
  let doctorAccess: string;
  let doctorRefresh: string;

  test("A owner B shifokorini invite qiladi -> pending:true, tayinlov accepted_at NULL, parol yo'q", async () => {
    const res = await call(ownerAToken, 'POST', '/users/invite', {
      phone: DOCTOR_PHONE,
      fullName: 'DoctorB',
      roleId: roleA,
      branchId: branchA,
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      data: { pending: boolean; tempPassword: string | null; alreadyExists: boolean };
    };
    expect(json.data.pending).toBe(true);
    expect(json.data.tempPassword).toBeNull();
    const rows = await assignmentRow(doctorId, tenantA);
    expect(rows.length).toBe(1);
    expect(rows[0]?.acceptedAt).toBeNull();
    expect(rows[0]?.isActive).toBe(true);
  });

  test('(1) owner A reset -> 403 user.not_in_tenant; shifokor login va B dagi holat o`zgarmagan', async () => {
    const res = await call(ownerAToken, 'POST', `/users/${doctorId}/reset-password`);
    expect(res.status).toBe(403);
    expect(await errCode(res)).toBe('user.not_in_tenant');

    const [u] = await db.select().from(users).where(eq(users.id, doctorId));
    expect(u?.mustChangePassword).toBe(false);
    const { res: lres, data } = await login(DOCTOR_PHONE, PW);
    expect(lres.status).toBe(200);
    expect(data?.mustChangePassword).toBe(false);
    doctorAccess = data?.accessToken ?? '';
    doctorRefresh = data?.refreshToken ?? '';
    // B dagi tayinlov tegilmagan
    const b = await assignmentRow(doctorId, tenantB);
    expect(b.length).toBe(1);
    expect(b[0]?.isActive).toBe(true);
    expect(b[0]?.acceptedAt).not.toBeNull();
  });

  test("(2) kutilayotgan taklif bilan switch-workspace -> 403; /me ro'yxatida A yo'q", async () => {
    const sw = await call(doctorAccess, 'POST', '/auth/switch-workspace', {
      tenantId: tenantA,
      refreshToken: doctorRefresh,
    });
    expect(sw.status).toBe(403);
    expect(await errCode(sw)).toBe('auth.no_workspace_access');

    const me = await call(doctorAccess, 'GET', '/auth/me');
    const meJson = (await me.json()) as { data: { assignments: { tenantId: string }[] } };
    const tenants_ = meJson.data.assignments.map((a) => a.tenantId);
    expect(tenants_).toContain(tenantB);
    expect(tenants_).not.toContain(tenantA);
  });

  test("(2) permission bo'sh: A kontekstli refresh -> workspace tushib ketadi (perms yo'q)", async () => {
    // Refresh qatorini A kontekstiga majburlaymiz (stale/soxta kontekst simulyatsiyasi)
    await db
      .update(refreshTokens)
      .set({ activeTenantId: tenantA })
      .where(and(eq(refreshTokens.userId, doctorId), sql`${refreshTokens.revokedAt} IS NULL`));
    const res = await call(null, 'POST', '/auth/refresh', { refreshToken: doctorRefresh });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { accessToken: string } };
    const claims = await verifyAccess(json.data.accessToken);
    expect(claims.perms).toEqual([]);
    expect(claims.atid).toBeNull();
  });

  test('(3) taklifni boshqa foydalanuvchi qabul/rad qila olmaydi (id bo`yicha) -> 404', async () => {
    const [inv] = await listInvitations(doctorAccess);
    expect(inv).toBeDefined();
    const outsider = (await login(OUTSIDER_PHONE, PW)).data?.accessToken ?? '';
    expect((await listInvitations(outsider)).length).toBe(0);

    const acc = await call(outsider, 'POST', `/auth/invitations/${inv?.id}/accept`);
    expect(acc.status).toBe(404);
    const dec = await call(outsider, 'POST', `/auth/invitations/${inv?.id}/decline`);
    expect(dec.status).toBe(404);
    const rows = await assignmentRow(doctorId, tenantA);
    expect(rows[0]?.acceptedAt).toBeNull();
    expect(rows[0]?.isActive).toBe(true);
  });

  test('taklif tafsilotlari: klinika, filial, rol; xodimlar ro`yxatida pending:true', async () => {
    const [inv] = await listInvitations(doctorAccess);
    expect(inv?.tenantId).toBe(tenantA);
    expect(inv?.tenantName).toBe('Clinic A');
    expect(inv?.branchId).toBe(branchA);
    expect(inv?.branchName).toBe('A Main');
    expect(inv?.roleName).toBe('A Staff');
    expect(typeof inv?.invitedAt).toBe('string');

    const list = await call(ownerAToken, 'GET', '/users/assignments');
    const rows = ((await list.json()) as { data: { userId: string; pending: boolean }[] }).data;
    expect(rows.find((r) => r.userId === doctorId)?.pending).toBe(true);
  });

  test("pwc token taklif endpoint'lariga kira olmaydi", async () => {
    const pwc = (
      await signAccess({
        sub: doctorId,
        atid: null,
        abid: null,
        perms: [],
        roleKey: null,
        lang: 'uz',
        pwc: true,
      })
    ).token;
    expect((await call(pwc, 'GET', '/auth/invitations')).status).toBe(403);
  });

  test("qabul qilish -> 200, audit invitation_accepted (A tenant), switch ishlaydi, perms bor, taklif yo'qoladi", async () => {
    const [inv] = await listInvitations(doctorAccess);
    const res = await call(doctorAccess, 'POST', `/auth/invitations/${inv?.id}/accept`);
    expect(res.status).toBe(200);

    const rows = await assignmentRow(doctorId, tenantA);
    expect(rows[0]?.acceptedAt).not.toBeNull();
    expect((await listInvitations(doctorAccess)).length).toBe(0);

    const audits = await withTx(tenantA, (tx) =>
      tx.execute(
        sql`SELECT tenant_id, user_id FROM audit_log WHERE action = 'invitation_accepted' AND resource_id = ${inv?.id}`,
      ),
    );
    expect(audits.length).toBe(1);
    expect((audits[0] as { tenant_id: string }).tenant_id).toBe(tenantA);
    expect((audits[0] as { user_id: string }).user_id).toBe(doctorId);

    // Qayta qabul qilib bo'lmaydi
    expect((await call(doctorAccess, 'POST', `/auth/invitations/${inv?.id}/accept`)).status).toBe(
      404,
    );

    const fresh = await login(DOCTOR_PHONE, PW);
    const sw = await call(fresh.data?.accessToken ?? '', 'POST', '/auth/switch-workspace', {
      tenantId: tenantA,
      branchId: branchA, // tayinlov shu filialga
      refreshToken: fresh.data?.refreshToken,
    });
    expect(sw.status).toBe(200);
    const sj = (await sw.json()) as { data: { accessToken: string } };
    const claims = await verifyAccess(sj.data.accessToken);
    expect(claims.atid).toBe(tenantA);
    expect(claims.perms).toEqual(expect.arrayContaining(STAFF_CODES));

    // Endi a'zo, lekin B klinikasida ham ishlaydi — FU-15 qoldig'i: A egasi parolni tiklasa
    // shu hisob bilan B'ga kirardi, shuning uchun ko'p klinikali xodimni tiklash rad etiladi.
    const rs = await call(ownerAToken, 'POST', `/users/${doctorId}/reset-password`);
    expect(rs.status).toBe(403);
    expect(((await rs.json()) as { error: { code: string } }).error.code).toBe(
      'user.reset_multi_tenant_member',
    );
  });
});

describe('P6b — rad etish va qayta taklif', () => {
  test("decline -> is_active=false, audit, taklif yo'qoladi, switch 403; qayta invite pending qoladi", async () => {
    const inv1 = await call(ownerAToken, 'POST', '/users/invite', {
      phone: DECLINER_PHONE,
      fullName: 'Decliner',
      roleId: roleA,
    });
    expect(inv1.status).toBe(201);
    expect(((await inv1.json()) as { data: { pending: boolean } }).data.pending).toBe(true);

    const { data } = await login(DECLINER_PHONE, PW);
    const access = data?.accessToken ?? '';
    const [inv] = await listInvitations(access);
    expect(inv).toBeDefined();

    const res = await call(access, 'POST', `/auth/invitations/${inv?.id}/decline`);
    expect(res.status).toBe(200);
    const rows = await assignmentRow(declinerId, tenantA);
    expect(rows[0]?.isActive).toBe(false);
    expect(rows[0]?.acceptedAt).toBeNull();
    expect((await listInvitations(access)).length).toBe(0);

    const audits = await withTx(tenantA, (tx) =>
      tx.execute(
        sql`SELECT 1 FROM audit_log WHERE action = 'invitation_declined' AND resource_id = ${inv?.id}`,
      ),
    );
    expect(audits.length).toBe(1);

    const sw = await call(access, 'POST', '/auth/switch-workspace', {
      tenantId: tenantA,
      refreshToken: data?.refreshToken,
    });
    expect(sw.status).toBe(403);

    // Qayta taklif (CLI-427 yo'li): faollashadi, lekin qabul qilinmagan bo'lgani uchun pending
    const inv2 = await call(ownerAToken, 'POST', '/users/invite', {
      phone: DECLINER_PHONE,
      fullName: 'Decliner',
      roleId: roleA,
    });
    const j2 = (await inv2.json()) as { data: { pending: boolean; reactivated: boolean } };
    expect(j2.data.reactivated).toBe(true);
    expect(j2.data.pending).toBe(true);
    const after = await assignmentRow(declinerId, tenantA);
    expect(after[0]?.isActive).toBe(true);
    expect(after[0]?.acceptedAt).toBeNull();
    expect((await listInvitations(access)).length).toBe(1);
  });

  test("muddati o'tgan taklif ro'yxatda ko'rinmaydi", async () => {
    await withTx(tenantA, (tx) =>
      tx
        .update(userAssignments)
        .set({ validTo: new Date(Date.now() - 60_000) })
        .where(eq(userAssignments.userId, declinerId)),
    );
    const access = (await login(DECLINER_PHONE, PW)).data?.accessToken ?? '';
    expect((await listInvitations(access)).length).toBe(0);
  });
});

describe('P6b — yangi foydalanuvchi va addAssignment', () => {
  test('(5) yangi foydalanuvchi invite — rozilik so`ralmaydi, birinchi kirishda parol almashtiriladi', async () => {
    const res = await call(ownerAToken, 'POST', '/users/invite', {
      phone: NEWBIE_PHONE,
      fullName: 'Newbie Staff',
      roleId: roleA,
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { pending: boolean; tempPassword: string } };
    expect(json.data.pending).toBe(false);
    expect(json.data.tempPassword.length).toBeGreaterThanOrEqual(12);

    // Vaqtinchalik parol bilan birinchi kirish — almashtirish majburiy (owner parolni biladi).
    const first = await login(NEWBIE_PHONE, json.data.tempPassword);
    expect((first.data as { mustChangePassword?: boolean } | undefined)?.mustChangePassword).toBe(
      true,
    );
    const changed = await call(first.data?.accessToken ?? '', 'POST', '/auth/change-password', {
      currentPassword: json.data.tempPassword,
      newPassword: 'NewbieOwnPass123!',
    });
    expect(changed.status).toBe(200);

    const { data } = await login(NEWBIE_PHONE, 'NewbieOwnPass123!');
    expect(data).toBeDefined();
    expect((await listInvitations(data?.accessToken ?? '')).length).toBe(0);
    const sw = await call(data?.accessToken ?? '', 'POST', '/auth/switch-workspace', {
      tenantId: tenantA,
      refreshToken: data?.refreshToken,
    });
    expect(sw.status).toBe(200);
  });

  test("addAssignment: tenantda qabul qilingan tayinlovi bor -> accepted_at to'ldiriladi; yo'q -> NULL", async () => {
    // doctor A da qabul qilingan a'zo (oldingi describe) -> 2-tayinlov darhol rozi
    const ok1 = await call(ownerAToken, 'POST', `/users/${doctorId}/assignments`, {
      roleId: roleA, // filialsiz (tenant-wide) — birinchi tayinlov filialli edi
    });
    expect(ok1.status).toBe(201);
    const rows = await assignmentRow(doctorId, tenantA);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.acceptedAt !== null)).toBe(true);

    // outsider A da hech qachon a'zo bo'lmagan -> NULL (kutilmoqda)
    const ok2 = await call(ownerAToken, 'POST', `/users/${outsiderId}/assignments`, {
      roleId: roleA,
    });
    expect(ok2.status).toBe(201);
    const o = await assignmentRow(outsiderId, tenantA);
    expect(o.length).toBe(1);
    expect(o[0]?.acceptedAt).toBeNull();
  });
});

describe('P6b — backfill (Review Focus 4)', () => {
  test('migratsiya backfill UPDATE: eski a`zolik qabul qilingan bo`lib ishlashda davom etadi', async () => {
    // Eski (migratsiyadan oldingi) holat: accepted_at yo'q
    const legacyId = await mkUser('+998900007006', 'Legacy', PW);
    await withTx(tenantA, (tx) =>
      tx.insert(userAssignments).values({ userId: legacyId, tenantId: tenantA, roleId: roleA }),
    );
    const sqlText = readFileSync(
      new URL('../../drizzle/0046_assignment_accepted_at.sql', import.meta.url),
      'utf8',
    );
    const backfill = sqlText
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .find((s) => s.toUpperCase().startsWith('UPDATE'));
    expect(backfill).toBeDefined();
    // Backfill — migratsiya (superuser) bajaradi; tenant RLS'ni shu yerda tx kontekstida qo'llaymiz
    await withTx(tenantA, (tx) => tx.execute(sql.raw(backfill as string)));

    const [row] = await assignmentRow(legacyId, tenantA);
    expect(row?.acceptedAt).not.toBeNull();
    expect(row?.acceptedAt?.getTime()).toBe(row?.createdAt.getTime());

    const { data } = await login('+998900007006', PW);
    const sw = await call(data?.accessToken ?? '', 'POST', '/auth/switch-workspace', {
      tenantId: tenantA,
      refreshToken: data?.refreshToken,
    });
    expect(sw.status).toBe(200);
  });
});
