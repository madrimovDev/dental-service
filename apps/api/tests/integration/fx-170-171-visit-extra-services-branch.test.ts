/**
 * FX-170 (D-14) + FX-171 — bosqichli vizitda bosqich xizmatidan BOSHQA xizmatlar vizit yo'li
 * bilan to'lanadi (bosqich xizmati — faqat reja allocation'i bilan); vizit to'lovida
 * `branchId` vizit (appointment) filiali bilan mos bo'lishi shart (aks holda 403 branch.forbidden).
 * REAL DB + REAL HTTP + real cheklangan kassir rollari (@owner EMAS).
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-170-171-visit-extra-services-branch.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  cashierTransactions,
  patients,
  permissions,
  rolePermissions,
  roles,
  servicePrices,
  services,
  tenants,
  treatmentPlans,
  treatmentStages,
  userAssignments,
  users,
  visitNotes,
} from '@dental/db-schema';
import { inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const CASHIER_PERMS = ['cashier.view', 'cashier.create_transaction'];

const withTenant = <T>(tid: string, fn: (tx: typeof db) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tid}'`));
    return fn(tx as unknown as typeof db);
  });

const app = createApp();
let tenantId: string;
let doctorId: string;
let brA: string;
let brB: string;
let patientId: string;
let stageSvc: string;
let anestSvc: string;
let stagePlanId: string;
let visitExtra: string; // bosqichli, [stageSvc, anestSvc], appointment A
let visitStageOnly: string; // bosqichli, [stageSvc]
let visitBranchA: string; // oddiy, [anestSvc], appointment A
let visitNoAppt: string; // oddiy, [anestSvc], appointment yo'q
let visitNullStage: string; // bosqichli (bosqich serviceId NULL), [stageSvc, anestSvc]
const tok: Record<string, string> = {};

const call = async (who: string, method: 'GET' | 'POST', path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.170.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const payBody = (branchId: string, visitNoteId: string, serviceId: string) => ({
  branchId,
  visitNoteId,
  items: [{ serviceId, quantity: 1, unitPrice: 1, serviceName: 'x' }],
  discount: 0,
  paidAmount: 100000,
  paymentMethod: 'cash',
});

const txRows = (visitNoteId: string) =>
  withTenant(tenantId, (tx) =>
    tx
      .select({
        id: cashierTransactions.id,
        treatmentPlanId: cashierTransactions.treatmentPlanId,
        branchId: cashierTransactions.branchId,
      })
      .from(cashierTransactions)
      .where(sql`${cashierTransactions.visitNoteId} = ${visitNoteId}`),
  );

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  doctorId = await mk('+998900017001');
  const cashA = await mk('+998900017002'); // faqat A
  const cashB = await mk('+998900017003'); // faqat B
  const cashAll = await mk('+998900017004'); // tenant-wide

  for (const code of CASHIER_PERMS) {
    await db.insert(permissions).values({ code, category: 'cashier' }).onConflictDoNothing();
  }
  const permRows = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.code, CASHIER_PERMS));

  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FX170', slug: 'fx-170-171', ownerUserId: doctorId })
      .returning({ id: tenants.id })
  )[0]!.id;

  await withTenant(tenantId, async (tx) => {
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
      .values({ tenantId, name: 'Kassir (test)' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(permRows.map((p) => ({ roleId: role!.id, permissionId: p.id })));
    await tx.insert(userAssignments).values([
      { tenantId, userId: cashA, branchId: brA, roleId: role!.id },
      { tenantId, userId: cashB, branchId: brB, roleId: role!.id },
      { tenantId, userId: cashAll, branchId: null, roleId: role!.id },
    ]);

    const [p] = await tx.insert(patients).values({ tenantId, fullName: 'Bemor FX170' }).returning();
    patientId = p!.id;
    const [s1, s2] = await tx
      .insert(services)
      .values([
        { tenantId, code: 'PL', nameUz: 'Plomba' },
        { tenantId, code: 'AN', nameUz: "Og'riqsizlantirish" },
      ])
      .returning();
    stageSvc = s1!.id;
    anestSvc = s2!.id;
    for (const branchId of [brA, brB]) {
      await tx.insert(servicePrices).values([
        { serviceId: stageSvc, branchId, price: '500000' },
        { serviceId: anestSvc, branchId, price: '100000' },
      ]);
    }
    const [plan] = await tx
      .insert(treatmentPlans)
      .values({
        tenantId,
        patientId,
        doctorId,
        title: 'Reja',
        totalCost: '500000',
        status: 'accepted',
      })
      .returning();
    stagePlanId = plan!.id;
    const [st] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: plan!.id,
        sequence: 1,
        serviceId: stageSvc,
        serviceName: 'Plomba 36',
        cost: '500000',
        status: 'completed',
        acceptance: 'accepted',
      })
      .returning();
    // Erkin matnli (yoki xizmati o'chirilgan) bosqich — serviceId NULL.
    const [stNull] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: plan!.id,
        sequence: 2,
        serviceId: null,
        serviceName: 'Erkin bosqich',
        cost: '500000',
        status: 'completed',
        acceptance: 'accepted',
      })
      .returning();

    let apptSeq = 0;
    const mkAppt = async (branchId: string) => {
      apptSeq += 1;
      const start = new Date(Date.now() - apptSeq * 60 * 60000);
      const [a] = await tx
        .insert(appointments)
        .values({
          tenantId,
          branchId,
          patientId,
          doctorId,
          startTime: start,
          endTime: new Date(start.getTime() + 1800000),
        })
        .returning();
      return a!.id;
    };
    const mkVisit = async (opts: {
      performed: string[];
      staged: boolean;
      branchId: string | null;
      stageId?: string;
    }) => {
      const [v] = await tx
        .insert(visitNotes)
        .values({
          tenantId,
          patientId,
          doctorId,
          appointmentId: opts.branchId ? await mkAppt(opts.branchId) : null,
          stageId: opts.stageId ?? (opts.staged ? st!.id : null),
          performedServices: opts.performed,
          signedAt: new Date(),
          signedBy: doctorId,
        })
        .returning();
      return v!.id;
    };
    visitExtra = await mkVisit({ performed: [stageSvc, anestSvc], staged: true, branchId: brA });
    visitStageOnly = await mkVisit({ performed: [stageSvc], staged: true, branchId: brA });
    visitBranchA = await mkVisit({ performed: [anestSvc], staged: false, branchId: brA });
    visitNoAppt = await mkVisit({ performed: [anestSvc], staged: false, branchId: null });
    visitNullStage = await mkVisit({
      performed: [stageSvc, anestSvc],
      staged: true,
      branchId: brA,
      stageId: stNull!.id,
    });
  });

  const sign = async (sub: string) =>
    (
      await signAccess({
        sub,
        atid: tenantId,
        abid: null,
        perms: CASHIER_PERMS,
        roleKey: null,
        lang: 'uz',
      })
    ).token;
  tok.A = await sign(cashA);
  tok.B = await sign(cashB);
  tok.all = await sign(cashAll);
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-170: bosqichli vizitdagi qo‘shimcha xizmatlar', () => {
  test('pending-visits: bosqichli vizit faqat qo‘shimcha xizmat bilan chiqadi (bosqich xizmati yo‘q)', async () => {
    const r = await call('A', 'GET', `/api/cashier/pending-visits?branchId=${brA}`);
    expect(r.status).toBe(200);
    const rows = r.json.data.data as Array<{
      visitNoteId: string;
      total: string;
      services: Array<{ serviceId: string; quantity: number }>;
    }>;
    const extra = rows.find((v) => v.visitNoteId === visitExtra);
    expect(extra).toBeDefined();
    expect(extra!.services.map((s) => s.serviceId)).toEqual([anestSvc]);
    expect(Number(extra!.total)).toBe(100000);
    // faqat bosqich xizmati bor vizit chiqmaydi
    expect(rows.map((v) => v.visitNoteId)).not.toContain(visitStageOnly);
  });

  test('bosqich xizmatini vizit yo‘li bilan to‘lash -> 400 cashier.visit_items_mismatch', async () => {
    const r = await call(
      'A',
      'POST',
      '/api/cashier/transactions',
      payBody(brA, visitExtra, stageSvc),
    );
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('cashier.visit_items_mismatch');
    expect((await txRows(visitExtra)).length).toBe(0);
  });

  test('qo‘shimcha xizmat vizit yo‘li bilan to‘lanadi (201, rejaga bog‘lanmaydi), keyin ro‘yxatdan ketadi', async () => {
    const r = await call(
      'A',
      'POST',
      '/api/cashier/transactions',
      payBody(brA, visitExtra, anestSvc),
    );
    expect(r.status).toBe(201);
    const rows = await txRows(visitExtra);
    expect(rows.length).toBe(1);
    expect(rows[0]!.treatmentPlanId).toBeNull();

    const list = await call('A', 'GET', `/api/cashier/pending-visits?branchId=${brA}`);
    const ids = (list.json.data.data as Array<{ visitNoteId: string }>).map((v) => v.visitNoteId);
    expect(ids).not.toContain(visitExtra);

    // qayta to'lov — bosqich xizmatidan boshqa qoldiq yo'q
    const again = await call(
      'A',
      'POST',
      '/api/cashier/transactions',
      payBody(brA, visitExtra, anestSvc),
    );
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe('cashier.visit_already_billed');
  });

  test('faqat bosqich xizmati bor vizit -> 409 visit.linked_to_plan_stage', async () => {
    const r = await call(
      'A',
      'POST',
      '/api/cashier/transactions',
      payBody(brA, visitStageOnly, stageSvc),
    );
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('visit.linked_to_plan_stage');
    expect((await txRows(visitStageOnly)).length).toBe(0);
    expect(stagePlanId).toBeTruthy();
  });
});

describe('FX-170 review: bosqich xizmati NULL bo‘lsa eski xulq (ikki marta to‘lov yo‘q)', () => {
  test('pending-visits: serviceId NULL bosqichli vizit ro‘yxatda chiqmaydi', async () => {
    const r = await call('A', 'GET', `/api/cashier/pending-visits?branchId=${brA}`);
    expect(r.status).toBe(200);
    const ids = (r.json.data.data as Array<{ visitNoteId: string }>).map((v) => v.visitNoteId);
    expect(ids).not.toContain(visitNullStage);
  });

  test('vizit yo‘li bilan to‘lov -> 409 visit.linked_to_plan_stage (har qanday xizmat)', async () => {
    for (const sid of [stageSvc, anestSvc]) {
      const r = await call(
        'A',
        'POST',
        '/api/cashier/transactions',
        payBody(brA, visitNullStage, sid),
      );
      expect(r.status).toBe(409);
      expect(r.json.error.code).toBe('visit.linked_to_plan_stage');
    }
    expect((await txRows(visitNullStage)).length).toBe(0);
  });
});

describe('FX-171: vizit to‘lovi filiali vizit filiali bilan mos', () => {
  test('B filial kassiri A vizitini o‘z filialiga yoza olmaydi -> 403 branch.forbidden', async () => {
    const r = await call(
      'B',
      'POST',
      '/api/cashier/transactions',
      payBody(brB, visitBranchA, anestSvc),
    );
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('branch.forbidden');
    expect((await txRows(visitBranchA)).length).toBe(0);
  });

  test('tenant-wide kassir ham vizit filialiga mos kelmaydigan branchId bilan yoza olmaydi', async () => {
    const r = await call(
      'all',
      'POST',
      '/api/cashier/transactions',
      payBody(brB, visitBranchA, anestSvc),
    );
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('branch.forbidden');
    expect((await txRows(visitBranchA)).length).toBe(0);
  });

  test('A filial kassiri A vizitini to‘laydi (201), tranzaksiya filiali = A', async () => {
    const r = await call(
      'A',
      'POST',
      '/api/cashier/transactions',
      payBody(brA, visitBranchA, anestSvc),
    );
    expect(r.status).toBe(201);
    expect((await txRows(visitBranchA))[0]!.branchId).toBe(brA);
  });

  test('yozilishsiz (filiali noma‘lum) vizit — kassir o‘z filialiga yozadi (201)', async () => {
    const r = await call(
      'B',
      'POST',
      '/api/cashier/transactions',
      payBody(brB, visitNoAppt, anestSvc),
    );
    expect(r.status).toBe(201);
  });
});
