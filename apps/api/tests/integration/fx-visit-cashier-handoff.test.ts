/**
 * FX-handoff — imzolangan vizit → kassa (pul). REAL DB + REAL HTTP (createApp) +
 * real cheklangan rol permset'lari (Receptionist / Doctor shablonlari, @owner EMAS).
 *
 *  - GET /api/cashier/pending-visits: bugungi imzolangan, to'lanmagan, xizmatli vizitlar
 *  - POST /api/cashier/transactions {visitNoteId}: narx serverda, bemor vizitdan,
 *    bitta vizit bir marta (409), parallel poyga (unique index → 409, 500 EMAS)
 *  - boshqa tenant vizitlari ko'rinmaydi / to'lanmaydi
 *
 * Ishga tushirish: cd apps/api && bun test tests/integration/fx-visit-cashier-handoff.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  appointments,
  branches,
  cashierTransactions,
  patients,
  servicePrices,
  services,
  tenants,
  users,
  visitNotes,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';

const { createApp } = await import('../../src/app.ts');
const { signAccess } = await import('../../src/lib/jwt.ts');
const { db } = await import('../../src/db/client.ts');

const permsOf = (key: string): string[] => {
  const t = ROLE_TEMPLATES.find((r) => r.templateKey === key);
  if (!t) throw new Error(`template ${key}`);
  return [...t.permissions] as string[];
};
const receptionistPerms = permsOf('receptionist');
const doctorPerms = permsOf('doctor');

const withTenant = <T>(tid: string, fn: (tx: typeof db) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tid}'`));
    return fn(tx as unknown as typeof db);
  });

let tenantA: string;
let tenantB: string;
let userA: string;
let userB: string;
let branchA: string;
let branchB: string;
let patientA: string;
let patientA2: string;
let svc1: string;
let svc2: string;
let svcNoPrice: string;
let visitOk: string; // svc1 x2 + svc2 -> 100k*2 + 50k = 250k
let visitUnsigned: string;
let visitYesterday: string;
let visitOtherBranch: string;
let visitNoServices: string;
let visitForeign: string; // tenant B
let visitMismatch: string;
let visitRace: string;

const app = createApp();

const token = async (tid: string, uid: string, perms: string[]) =>
  (await signAccess({ sub: uid, atid: tid, abid: null, perms, roleKey: null, lang: 'uz' })).token;

const call = async (
  tok: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: { data?: any; error?: { code: string } } }> => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const payBody = (visitNoteId: string, items?: Array<{ serviceId: string; quantity: number }>) => ({
  branchId: branchA,
  visitNoteId,
  items: (
    items ?? [
      { serviceId: svc1, quantity: 2 },
      { serviceId: svc2, quantity: 1 },
    ]
  ).map((i) => ({
    ...i,
    unitPrice: 1, // client narxi e'tiborsiz — server hisoblaydi
    serviceName: 'x',
  })),
  discount: 0,
  paidAmount: 250000,
  paymentMethod: 'cash',
});

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [ua] = await db
    .insert(users)
    .values({ phone: '+998900054001', passwordHash: 'x', fullName: 'Doktor A' })
    .returning({ id: users.id });
  const [ub] = await db
    .insert(users)
    .values({ phone: '+998900054002', passwordHash: 'x', fullName: 'Doktor B' })
    .returning({ id: users.id });
  userA = ua!.id;
  userB = ub!.id;
  const [ta] = await db
    .insert(tenants)
    .values({ name: 'FX A', slug: 'fx-handoff-a', ownerUserId: userA })
    .returning({ id: tenants.id });
  const [tb] = await db
    .insert(tenants)
    .values({ name: 'FX B', slug: 'fx-handoff-b', ownerUserId: userB })
    .returning({ id: tenants.id });
  tenantA = ta!.id;
  tenantB = tb!.id;

  await withTenant(tenantA, async (tx) => {
    const [ba] = await tx.insert(branches).values({ tenantId: tenantA, name: 'A1' }).returning();
    const [bb] = await tx.insert(branches).values({ tenantId: tenantA, name: 'A2' }).returning();
    branchA = ba!.id;
    branchB = bb!.id;
    const [p1] = await tx
      .insert(patients)
      .values({ tenantId: tenantA, fullName: 'Bemor Bir' })
      .returning();
    const [p2] = await tx
      .insert(patients)
      .values({ tenantId: tenantA, fullName: 'Bemor Ikki' })
      .returning();
    patientA = p1!.id;
    patientA2 = p2!.id;
    const [s1] = await tx
      .insert(services)
      .values({ tenantId: tenantA, code: 'S1', nameUz: 'Konsultatsiya' })
      .returning();
    const [s2] = await tx
      .insert(services)
      .values({ tenantId: tenantA, code: 'S2', nameUz: 'Plomba' })
      .returning();
    const [s3] = await tx
      .insert(services)
      .values({ tenantId: tenantA, code: 'S3', nameUz: 'Narxsiz' })
      .returning();
    svc1 = s1!.id;
    svc2 = s2!.id;
    svcNoPrice = s3!.id;
    await tx.insert(servicePrices).values([
      { serviceId: svc1, branchId: branchA, price: '100000' },
      { serviceId: svc2, branchId: branchA, price: '50000' },
    ]);

    const now = new Date();
    const yesterday = new Date(now.getTime() - 30 * 3600 * 1000);
    const mkAppt = async (branchId: string, patientId: string, startH: number) => {
      const start = new Date(now.getTime() - startH * 60000);
      const [a] = await tx
        .insert(appointments)
        .values({
          tenantId: tenantA,
          branchId,
          patientId,
          doctorId: userA,
          startTime: start,
          endTime: new Date(start.getTime() + 1800000),
        })
        .returning();
      return a!.id;
    };
    const mkVisit = async (v: {
      patientId: string;
      signed: Date | null;
      performed: string[] | null;
      appointmentId?: string | null;
    }) => {
      const [r] = await tx
        .insert(visitNotes)
        .values({
          tenantId: tenantA,
          patientId: v.patientId,
          doctorId: userA,
          appointmentId: v.appointmentId ?? null,
          performedServices: v.performed,
          signedAt: v.signed,
          signedBy: v.signed ? userA : null,
        })
        .returning();
      return r!.id;
    };
    visitOk = await mkVisit({
      patientId: patientA,
      signed: now,
      performed: [svc1, svc1, svc2],
      appointmentId: await mkAppt(branchA, patientA, 300),
    });
    visitUnsigned = await mkVisit({ patientId: patientA, signed: null, performed: [svc1] });
    visitYesterday = await mkVisit({ patientId: patientA, signed: yesterday, performed: [svc1] });
    visitOtherBranch = await mkVisit({
      patientId: patientA,
      signed: now,
      performed: [svc1],
      appointmentId: await mkAppt(branchB, patientA, 200),
    });
    visitNoServices = await mkVisit({ patientId: patientA, signed: now, performed: [] });
    visitMismatch = await mkVisit({
      patientId: patientA2,
      signed: now,
      performed: [svc1],
      appointmentId: await mkAppt(branchA, patientA2, 100),
    });
    visitRace = await mkVisit({
      patientId: patientA,
      signed: now,
      performed: [svc1],
      appointmentId: await mkAppt(branchA, patientA, 50),
    });
  });

  await withTenant(tenantB, async (tx) => {
    const [bb] = await tx.insert(branches).values({ tenantId: tenantB, name: 'B1' }).returning();
    const [p] = await tx
      .insert(patients)
      .values({ tenantId: tenantB, fullName: 'Begona Bemor' })
      .returning();
    const [s] = await tx
      .insert(services)
      .values({ tenantId: tenantB, code: 'SB', nameUz: 'Begona xizmat' })
      .returning();
    await tx.insert(servicePrices).values({ serviceId: s!.id, branchId: bb!.id, price: '1000' });
    const [v] = await tx
      .insert(visitNotes)
      .values({
        tenantId: tenantB,
        patientId: p!.id,
        doctorId: userB,
        performedServices: [s!.id],
        signedAt: new Date(),
        signedBy: userB,
      })
      .returning();
    visitForeign = v!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-handoff: GET /api/cashier/pending-visits', () => {
  test('real Receptionist: faqat bugungi imzolangan xizmatli vizit, narx + jami serverdan', async () => {
    const tok = await token(tenantA, userA, receptionistPerms);
    const r = await call(tok, 'GET', `/api/cashier/pending-visits?branchId=${branchA}`);
    expect(r.status).toBe(200);
    const ids = (r.json.data as Array<{ visitNoteId: string }>).map((v) => v.visitNoteId);
    expect(ids).toContain(visitOk);
    expect(ids).toContain(visitMismatch);
    expect(ids).not.toContain(visitUnsigned);
    expect(ids).not.toContain(visitYesterday);
    expect(ids).not.toContain(visitOtherBranch);
    expect(ids).not.toContain(visitNoServices);
    expect(ids).not.toContain(visitForeign);
    const ok = (
      r.json.data as Array<{
        visitNoteId: string;
        patientName: string;
        doctorName: string;
        total: string;
        hasUnpriced: boolean;
        services: Array<{ serviceId: string; quantity: number; unitPrice: string }>;
      }>
    ).find((v) => v.visitNoteId === visitOk)!;
    expect(ok.patientName).toBe('Bemor Bir');
    expect(ok.doctorName).toBe('Doktor A');
    expect(ok.total).toBe('250000');
    expect(ok.hasUnpriced).toBe(false);
    const line1 = ok.services.find((s: { serviceId: string }) => s.serviceId === svc1);
    expect(line1!.quantity).toBe(2);
    expect(line1!.unitPrice).toBe('100000.00');
  });

  test('Doctor (cashier.view yo`q) -> 403', async () => {
    expect(doctorPerms).not.toContain('cashier.view');
    const tok = await token(tenantA, userA, doctorPerms);
    const r = await call(tok, 'GET', `/api/cashier/pending-visits?branchId=${branchA}`);
    expect(r.status).toBe(403);
  });

  test('boshqa tenant Receptionist: A tenant vizitlarini ko`rmaydi', async () => {
    const tok = await token(tenantB, userB, receptionistPerms);
    const r = await call(tok, 'GET', `/api/cashier/pending-visits?branchId=${branchA}`);
    expect(r.status).toBe(200);
    const ids = (r.json.data as Array<{ visitNoteId: string }>).map((v) => v.visitNoteId);
    // faqat o'z tenantining (yozilishsiz → filialsiz) vizitlari; A tenantniki yo'q.
    expect(ids).toEqual([visitForeign]);
  });
});

describe('FX-handoff: POST /api/cashier/transactions {visitNoteId}', () => {
  test('imzolanmagan vizit -> 400 cashier.visit_not_signed', async () => {
    const tok = await token(tenantA, userA, receptionistPerms);
    const r = await call(
      tok,
      'POST',
      '/api/cashier/transactions',
      payBody(visitUnsigned, [{ serviceId: svc1, quantity: 1 }]),
    );
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('cashier.visit_not_signed');
  });

  test('boshqa tenant vizit id -> 400 visit_note.not_found (RLS)', async () => {
    const tok = await token(tenantA, userA, receptionistPerms);
    const r = await call(
      tok,
      'POST',
      '/api/cashier/transactions',
      payBody(visitForeign, [{ serviceId: svc1, quantity: 1 }]),
    );
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('visit_note.not_found');
  });

  test('vizitda yo`q xizmat / ortiqcha miqdor -> 400 cashier.visit_items_mismatch', async () => {
    const tok = await token(tenantA, userA, receptionistPerms);
    const extra = await call(
      tok,
      'POST',
      '/api/cashier/transactions',
      payBody(visitOk, [{ serviceId: svcNoPrice, quantity: 1 }]),
    );
    expect(extra.status).toBe(400);
    expect(extra.json.error.code).toBe('cashier.visit_items_mismatch');
    const qty = await call(
      tok,
      'POST',
      '/api/cashier/transactions',
      payBody(visitOk, [{ serviceId: svc2, quantity: 2 }]),
    );
    expect(qty.status).toBe(400);
    expect(qty.json.error.code).toBe('cashier.visit_items_mismatch');
  });

  test('boshqa bemor patientId -> 400 cashier.visit_patient_mismatch', async () => {
    const tok = await token(tenantA, userA, receptionistPerms);
    const r = await call(tok, 'POST', '/api/cashier/transactions', {
      ...payBody(visitMismatch, [{ serviceId: svc1, quantity: 1 }]),
      patientId: patientA,
      paidAmount: 100000,
    });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('cashier.visit_patient_mismatch');
  });

  test('to`lov: 201, bemor vizitdan, narx serverdan; keyin ro`yxatda yo`q; ikkinchi to`lov 409', async () => {
    const tok = await token(tenantA, userA, receptionistPerms);
    const r = await call(tok, 'POST', '/api/cashier/transactions', payBody(visitOk));
    expect(r.status).toBe(201);
    expect(r.json.data.patientId).toBe(patientA);
    expect(r.json.data.totalAmount).toBe('250000.00');
    expect(r.json.data.visitNoteId).toBe(visitOk);

    const list = await call(tok, 'GET', `/api/cashier/pending-visits?branchId=${branchA}`);
    expect(
      (list.json.data as Array<{ visitNoteId: string }>).map((v) => v.visitNoteId),
    ).not.toContain(visitOk);

    const again = await call(tok, 'POST', '/api/cashier/transactions', payBody(visitOk));
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe('cashier.visit_already_billed');

    const rows = await withTenant(tenantA, (tx) =>
      tx
        .select({ id: cashierTransactions.id })
        .from(cashierTransactions)
        .where(sql`visit_note_id = ${visitOk}`),
    );
    expect(rows.length).toBe(1);
  });

  test('parallel ikki to`lov (poyga): aniq 1 x 201 + 1 x 409, 500 yo`q, 1 qator', async () => {
    const tok = await token(tenantA, userA, receptionistPerms);
    const body = { ...payBody(visitRace, [{ serviceId: svc1, quantity: 1 }]), paidAmount: 100000 };
    const [r1, r2] = await Promise.all([
      call(tok, 'POST', '/api/cashier/transactions', body),
      call(tok, 'POST', '/api/cashier/transactions', body),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const rows = await withTenant(tenantA, (tx) =>
      tx
        .select({ id: cashierTransactions.id })
        .from(cashierTransactions)
        .where(sql`visit_note_id = ${visitRace}`),
    );
    expect(rows.length).toBe(1);
  });
});
