/**
 * UI-M2 / IR-06 — hisobotlar filial doirasi SERVER tomonida (real DB, real HTTP, real rol permset'lari,
 * real user_assignments — @owner faqat owner sinovi uchun).
 * Run: cd apps/api && bun test --env-file=../../.env ui-m2-reports-scoping
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  appointments,
  branches,
  cashierTransactions,
  patients,
  permissions,
  rolePermissions,
  roles,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { decideBranchScope } from '../../src/middleware/report-scope.ts';

const permsFor = (key: string) => [
  ...(ROLE_TEMPLATES.find((t) => t.templateKey === key)?.permissions ?? []),
];
let tenantId: string;
let brA: string;
let brB: string;
let brC: string;
const tokens: Record<string, string> = {};
const FROM = '2026-01-01';
const TO = '2026-12-31';
const q = (path: string, who: string, extra = '') =>
  createApp().request(`/api/reports/${path}?from=${FROM}&to=${TO}${extra}`, {
    headers: { authorization: `Bearer ${tokens[who]}` },
  });
const data = async (res: Response) => ((await res.json()) as { data: any }).data;

const tokenFor = async (userId: string, perms: string[], key: string) =>
  (await signAccess({ sub: userId, atid: tenantId, abid: null, perms, roleKey: key, lang: 'uz' }))
    .token;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  const owner = await mk('+998900002201');
  const bmA = await mk('+998900002202'); // Branch Manager — faqat A
  const bmAB = await mk('+998900002203'); // Branch Manager — A va B
  const admin = await mk('+998900002204'); // Tenant Admin — tenant-wide
  const acc = await mk('+998900002205'); // Accountant — tenant-wide
  const ghost = await mk('+998900002206'); // Branch Manager — tayinlov yo'q
  const expired = await mk('+998900002207'); // Branch Manager — faolsiz tayinlov
  const doc = await mk('+998900002208');
  const mixed = await mk('+998900002209'); // A'da Branch Manager, B'da Doctor (report.view yo'q)
  const mixedWide = await mk('+998900002210'); // tenant-wide Doctor + A'da Branch Manager
  // report.view — platform katalogi (test bazasida bo'lmasa qo'shamiz)
  await db
    .insert(permissions)
    .values({ code: 'report.view', category: 'report' })
    .onConflictDoNothing();
  const [reportView] = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(eq(permissions.code, 'report.view'));
  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'M2 Clinic', slug: 'm2-clinic', ownerUserId: owner })
      .returning({ id: tenants.id })
  )[0]!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [a, b, c] = await tx
      .insert(branches)
      .values([
        { tenantId, name: 'A' },
        { tenantId, name: 'B' },
        { tenantId, name: 'C' },
      ])
      .returning({ id: branches.id });
    brA = a!.id;
    brB = b!.id;
    brC = c!.id;
    const [role] = await tx
      .insert(roles)
      .values({ tenantId, name: 'R' })
      .returning({ id: roles.id });
    // 'R' — report.view beradi; 'NR' — hech qanday hisobot huquqisiz (Doctor shabloniga o'xshash)
    await tx.insert(rolePermissions).values({ roleId: role!.id, permissionId: reportView!.id });
    const [noReportRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'NR' })
      .returning({ id: roles.id });
    const asg = (userId: string, branchId: string | null, extra: object = {}) => ({
      tenantId,
      userId,
      branchId,
      roleId: role!.id,
      ...extra,
    });
    await tx
      .insert(userAssignments)
      .values([
        asg(bmA, brA),
        asg(bmAB, brA),
        asg(bmAB, brB),
        asg(admin, null),
        asg(acc, null),
        asg(expired, brA, { isActive: false }),
        asg(mixed, brA),
        { ...asg(mixed, brB), roleId: noReportRole!.id },
        { ...asg(mixedWide, null), roleId: noReportRole!.id },
        asg(mixedWide, brA),
      ]);
    const [pt] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'P' })
      .returning({ id: patients.id });
    // tushum: A=100 000, B=20 000, C=3 000 (jami 123 000)
    for (const [branchId, amt] of [
      [brA, 100_000],
      [brB, 20_000],
      [brC, 3_000],
    ] as const) {
      await tx.insert(cashierTransactions).values({
        tenantId,
        branchId,
        patientId: pt!.id,
        totalAmount: String(amt),
        paidAmount: String(amt),
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdAt: new Date('2026-06-10T07:00:00Z'),
      } as never);
    }
    // qabullar: A=1, B=2, C=4 (turli soat — doktor to'qnashmasin)
    let hour = 5;
    for (const [branchId, n] of [
      [brA, 1],
      [brB, 2],
      [brC, 4],
    ] as const) {
      for (let i = 0; i < n; i++) {
        await tx.insert(appointments).values({
          tenantId,
          branchId,
          patientId: pt!.id,
          doctorId: doc,
          startTime: new Date(`2026-06-10T${String(hour).padStart(2, '0')}:00:00Z`),
          endTime: new Date(`2026-06-10T${String(hour).padStart(2, '0')}:30:00Z`),
          status: 'completed',
        } as never);
        hour += 1;
      }
    }
  });

  tokens.owner = await tokenFor(owner, ['@owner'], 'owner');
  tokens.bmA = await tokenFor(bmA, permsFor('branch_manager'), 'branch_manager');
  tokens.bmAB = await tokenFor(bmAB, permsFor('branch_manager'), 'branch_manager');
  tokens.admin = await tokenFor(admin, permsFor('tenant_admin'), 'tenant_admin');
  tokens.acc = await tokenFor(acc, permsFor('accountant'), 'accountant');
  tokens.ghost = await tokenFor(ghost, permsFor('branch_manager'), 'branch_manager');
  // JWT: A workspace'ga o'tilgan (Branch Manager permset — report.view bor)
  tokens.mixed = await tokenFor(mixed, permsFor('branch_manager'), 'branch_manager');
  tokens.mixedWide = await tokenFor(mixedWide, permsFor('branch_manager'), 'branch_manager');
  tokens.expired = await tokenFor(expired, permsFor('branch_manager'), 'branch_manager');
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('decideBranchScope (sof qaror)', () => {
  test('tayinlov yo‘q → none; null → all; filiallar → unikal ro‘yxat', () => {
    expect(decideBranchScope([]).kind).toBe('none');
    expect(decideBranchScope(['a', null]).kind).toBe('all');
    expect(decideBranchScope(['a', 'a', 'b'])).toEqual({ kind: 'branches', branchIds: ['a', 'b'] });
  });
});

describe('Branch Manager (bitta filial) faqat o‘z filialini oladi', () => {
  test('revenue: branchId berilmasa ham faqat A (byBranch ham)', async () => {
    const res = await q('revenue', 'bmA');
    expect(res.status).toBe(200);
    const d = await data(res);
    expect(d.total).toBe(100_000);
    expect(d.byBranch.map((b: any) => b.branchId)).toEqual([brA]);
  });

  test('revenue: begona filial (?branchId=B) → 403 report.branch_forbidden', async () => {
    const res = await q('revenue', 'bmA', `&branchId=${brB}`);
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).error.code).toBe('report.branch_forbidden');
  });

  test('appointments / doctors / 1c-export / owner-today ham A bilan cheklangan', async () => {
    expect((await data(await q('appointments', 'bmA'))).total).toBe(1);
    const docs = await data(await q('doctors', 'bmA'));
    expect(docs.reduce((s: number, r: any) => s + r.total, 0)).toBe(1);
    const oneC = await data(await q('1c-export', 'bmA'));
    expect(oneC.map((r: any) => r.amount)).toEqual([100_000]);
    const res = await createApp().request('/api/reports/owner-today', {
      headers: { authorization: `Bearer ${tokens.bmA}` },
    });
    expect(res.status).toBe(200);
    expect((await data(res)).branches.map((b: any) => b.branchId)).toEqual([brA]);
    const bad = await createApp().request(`/api/reports/owner-today?branchId=${brC}`, {
      headers: { authorization: `Bearer ${tokens.bmA}` },
    });
    expect(bad.status).toBe(403);
  });

  test('tenant-darajali hisobotlar (qarz, rejalar, dental analitika) → 403 report.tenant_scope_required', async () => {
    for (const path of ['debt-aging', 'treatment-plans', 'dental-analytics']) {
      const res = await q(path, 'bmA');
      expect(res.status).toBe(403);
      expect(((await res.json()) as any).error.code).toBe('report.tenant_scope_required');
    }
  });
});

describe('Ikki filialli Branch Manager', () => {
  test('branchId yo‘q → A+B yig‘indisi; ?branchId=B → faqat B; ?branchId=C → 403', async () => {
    expect((await data(await q('revenue', 'bmAB'))).total).toBe(120_000);
    expect((await data(await q('appointments', 'bmAB'))).total).toBe(3);
    expect((await data(await q('revenue', 'bmAB', `&branchId=${brB}`))).total).toBe(20_000);
    expect((await q('revenue', 'bmAB', `&branchId=${brC}`)).status).toBe(403);
  });
});

describe('IR-06: doira faqat report.view beradigan tayinlovlardan', () => {
  test("A'da Branch Manager, B'da Doctor: B tushumi ko'rinmaydi (403), yig'indi faqat A", async () => {
    const res = await q('revenue', 'mixed', `&branchId=${brB}`);
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).error.code).toBe('report.branch_forbidden');
    expect((await data(await q('revenue', 'mixed'))).total).toBe(100_000);
    expect((await data(await q('revenue', 'mixed', `&branchId=${brA}`))).total).toBe(100_000);
    expect((await q('1c-export', 'mixed', `&branchId=${brB}`)).status).toBe(403);
  });

  test("tenant-wide Doctor + A'da Branch Manager: cheklovsiz EMAS — faqat A; tenant-darajali 403", async () => {
    expect((await data(await q('revenue', 'mixedWide'))).total).toBe(100_000);
    expect((await q('revenue', 'mixedWide', `&branchId=${brC}`)).status).toBe(403);
    for (const path of ['debt-aging', 'treatment-plans', 'dental-analytics']) {
      const res = await q(path, 'mixedWide');
      expect(res.status).toBe(403);
      expect(((await res.json()) as any).error.code).toBe('report.tenant_scope_required');
    }
  });
});

describe('FU-31: /reports/branches faqat report.view filiallari', () => {
  const list = async (who: string) => {
    const res = await createApp().request('/api/reports/branches', {
      headers: { authorization: `Bearer ${tokens[who]}` },
    });
    return { status: res.status, d: res.status === 200 ? await data(res) : null };
  };
  test("A'da BM + B'da report.view'siz rol → faqat A, allowAll=false", async () => {
    const r = await list('mixed');
    expect(r.status).toBe(200);
    expect(r.d.branches.map((b: any) => b.id)).toEqual([brA]);
    expect(r.d.allowAllBranches).toBe(false);
  });
  test('ikki filialli BM → A va B; tenant-wide admin/owner → hammasi + allowAll', async () => {
    const ab = await list('bmAB');
    expect(ab.d.branches.map((b: any) => b.id).sort()).toEqual([brA, brB].sort());
    expect(ab.d.allowAllBranches).toBe(false);
    for (const who of ['admin', 'owner']) {
      const r = await list(who);
      expect(r.d.allowAllBranches).toBe(true);
      expect(r.d.branches.length).toBe(3);
    }
  });
  test('tayinlovsiz → 403 (fail-closed)', async () => {
    expect((await list('ghost')).status).toBe(403);
  });
});

describe('Cheklovsiz rollar', () => {
  test.each([
    'owner',
    'admin',
    'acc',
  ])('%s: butun klinika + istalgan filial filtri', async (who) => {
    expect((await data(await q('revenue', who))).total).toBe(123_000);
    expect((await data(await q('revenue', who, `&branchId=${brC}`))).total).toBe(3_000);
  });

  test('Accountant (tenant-wide) qarz hisobotini oladi', async () => {
    expect((await q('debt-aging', 'acc')).status).toBe(200);
    expect((await q('treatment-plans', 'admin')).status).toBe(200);
  });
});

describe('Fail-closed', () => {
  test('tayinlovi yo‘q yoki faolsiz xodim → 403 report.no_branch_access', async () => {
    for (const who of ['ghost', 'expired']) {
      const res = await q('revenue', who);
      expect(res.status).toBe(403);
      expect(((await res.json()) as any).error.code).toBe('report.no_branch_access');
    }
  });
});
