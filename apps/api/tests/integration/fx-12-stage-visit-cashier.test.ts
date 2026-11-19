/**
 * FX-12 (LA-03/LA-39, D-10) — rejadagi bosqichga bog'langan (stageId) imzolangan vizit
 * kassada «kutilayotgan vizit» sifatida chiqmaydi va vizit yo'li bilan to'lanmaydi
 * (409 `visit.linked_to_plan_stage`) — aks holda bemor ikki marta to'laydi.
 * REAL DB + REAL HTTP + real cheklangan rol (Receptionist shabloni + haqiqiy tayinlov), @owner EMAS.
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-12-stage-visit-cashier.test.ts
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

const receptionistPerms = [
  ...(ROLE_TEMPLATES.find((r) => r.templateKey === 'receptionist')!.permissions as string[]),
];

const withTenant = <T>(tid: string, fn: (tx: typeof db) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tid}'`));
    return fn(tx as unknown as typeof db);
  });

const app = createApp();
let tenantId: string;
let userId: string;
let branchId: string;
let svc: string;
let visitStaged: string;
let visitPlain: string;
let stageId: string;
let tok: string;

const call = async (method: 'GET' | 'POST', path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.12.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const payBody = (visitNoteId: string) => ({
  branchId,
  visitNoteId,
  items: [{ serviceId: svc, quantity: 1, unitPrice: 1, serviceName: 'x' }],
  discount: 0,
  paidAmount: 500000,
  paymentMethod: 'cash',
});

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900012001', passwordHash: 'x', fullName: 'Doktor FX12' })
    .returning({ id: users.id });
  userId = u!.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX12', slug: 'fx-12-stage-visit', ownerUserId: userId })
    .returning({ id: tenants.id });
  tenantId = t!.id;

  const codes = ['cashier.view', 'cashier.create_transaction'];
  for (const code of codes) {
    await db.insert(permissions).values({ code, category: 'cashier' }).onConflictDoNothing();
  }
  const permRows = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.code, codes));

  await withTenant(tenantId, async (tx) => {
    const [b] = await tx.insert(branches).values({ tenantId, name: 'A1' }).returning();
    branchId = b!.id;
    const [p] = await tx.insert(patients).values({ tenantId, fullName: 'Bemor FX12' }).returning();
    const [s] = await tx
      .insert(services)
      .values({ tenantId, code: 'PL', nameUz: 'Plomba' })
      .returning();
    svc = s!.id;
    await tx.insert(servicePrices).values({ serviceId: svc, branchId, price: '500000' });

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({
        tenantId,
        patientId: p!.id,
        doctorId: userId,
        title: 'Reja',
        totalCost: '500000',
        status: 'accepted',
      })
      .returning();
    const [st] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: plan!.id,
        sequence: 1,
        serviceId: svc,
        serviceName: 'Plomba 36',
        cost: '500000',
        status: 'completed',
        acceptance: 'accepted',
      })
      .returning();
    stageId = st!.id;

    const mkAppt = async (minAgo: number) => {
      const start = new Date(Date.now() - minAgo * 60000);
      const [a] = await tx
        .insert(appointments)
        .values({
          tenantId,
          branchId,
          patientId: p!.id,
          doctorId: userId,
          startTime: start,
          endTime: new Date(start.getTime() + 1800000),
        })
        .returning();
      return a!.id;
    };
    const mkVisit = async (withStage: boolean, minAgo: number) => {
      const [v] = await tx
        .insert(visitNotes)
        .values({
          tenantId,
          patientId: p!.id,
          doctorId: userId,
          appointmentId: await mkAppt(minAgo),
          stageId: withStage ? stageId : null,
          performedServices: [svc],
          signedAt: new Date(),
          signedBy: userId,
        })
        .returning();
      return v!.id;
    };
    visitStaged = await mkVisit(true, 120);
    visitPlain = await mkVisit(false, 60);
  });

  // Haqiqiy kassir tayinlovi (X-2/FX-32 doirasi).
  await withTenant(tenantId, async (tx) => {
    const [role] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Kassir (test)' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(permRows.map((p) => ({ roleId: role!.id, permissionId: p.id })));
    await tx.insert(userAssignments).values({ tenantId, userId, branchId, roleId: role!.id });
  });

  tok = (
    await signAccess({
      sub: userId,
      atid: tenantId,
      abid: null,
      perms: receptionistPerms,
      roleKey: null,
      lang: 'uz',
    })
  ).token;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-12: bosqichli vizit kassada', () => {
  test("pending-visits: stageId'li vizit chiqmaydi, oddiy vizit chiqadi", async () => {
    const r = await call('GET', `/api/cashier/pending-visits?branchId=${branchId}`);
    expect(r.status).toBe(200);
    const ids = (r.json.data.data as Array<{ visitNoteId: string }>).map((v) => v.visitNoteId);
    expect(ids).toContain(visitPlain);
    expect(ids).not.toContain(visitStaged);
  });

  test("create(visitNoteId) stageId'li vizit -> 409 visit.linked_to_plan_stage, tx yozilmaydi", async () => {
    const r = await call('POST', '/api/cashier/transactions', payBody(visitStaged));
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('visit.linked_to_plan_stage');
    const rows = await withTenant(tenantId, (tx) =>
      tx
        .select({ id: cashierTransactions.id })
        .from(cashierTransactions)
        .where(sql`${cashierTransactions.visitNoteId} = ${visitStaged}`),
    );
    expect(rows.length).toBe(0);
  });

  test("regressiya: oddiy vizit to'lanadi (201)", async () => {
    const r = await call('POST', '/api/cashier/transactions', payBody(visitPlain));
    expect(r.status).toBe(201);
  });
});
