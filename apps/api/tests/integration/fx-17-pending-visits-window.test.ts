/**
 * FX-17 (LA-38) — kecha/oldin imzolangan, to'lanmagan rejasiz vizit kassa «kutilayotgan» ro'yxatidan
 * yo'qolmasin: 30 kunlik oyna + `overdue` belgisi (bugundan oldingi) + sahifalash.
 * REAL DB + REAL HTTP + real cheklangan rol (Receptionist shabloni + haqiqiy kassir tayinlovi), @owner EMAS.
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-17-pending-visits-window.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  branches,
  cashierTransactions,
  patients,
  permissions,
  rolePermissions,
  roles,
  servicePrices,
  services,
  tenants,
  userAssignments,
  users,
  visitNotes,
} from '@dental/db-schema';
import { inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const receptionistPerms = [
  ...(ROLE_TEMPLATES.find((r) => r.templateKey === 'receptionist')?.permissions as string[]),
];

const withTenant = <T>(tid: string, fn: (tx: typeof db) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tid}'`));
    return fn(tx as unknown as typeof db);
  });

const DAY = 86_400_000;
const app = createApp();
let tenantId: string;
let userId: string;
let branchId: string;
let svc: string;
let tok: string;
const v: Record<string, string> = {};

type Row = { visitNoteId: string; overdue: boolean };
type ListJson = {
  data: { data: Row[]; meta: { page: number; pageSize: number; total: number } };
};

const list = async (qs = ''): Promise<{ status: number; json: ListJson }> => {
  const res = await app.request(`/api/cashier/pending-visits?branchId=${branchId}${qs}`, {
    headers: {
      Authorization: `Bearer ${tok}`,
      'x-real-ip': `10.17.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
  });
  return { status: res.status, json: (await res.json()) as ListJson };
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900017001', passwordHash: 'x', fullName: 'Doktor FX17' })
    .returning({ id: users.id });
  userId = u?.id as string;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX17', slug: 'fx-17-pending-window', ownerUserId: userId })
    .returning({ id: tenants.id });
  tenantId = t?.id as string;

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
    branchId = b?.id as string;
    const [p] = await tx.insert(patients).values({ tenantId, fullName: 'Bemor FX17' }).returning();
    const [s] = await tx
      .insert(services)
      .values({ tenantId, code: 'PL', nameUz: 'Plomba' })
      .returning();
    svc = s?.id as string;
    await tx.insert(servicePrices).values({ serviceId: svc, branchId, price: '500000' });

    const mk = async (key: string, ageMs: number, signed = true) => {
      const [row] = await tx
        .insert(visitNotes)
        .values({
          tenantId,
          patientId: p?.id as string,
          doctorId: userId,
          performedServices: [svc],
          signedAt: signed ? new Date(Date.now() - ageMs) : null,
          signedBy: signed ? userId : null,
        })
        .returning();
      v[key] = row?.id as string;
    };
    await mk('today', 60_000);
    await mk('yesterday', 26 * 3_600_000);
    await mk('d10', 10 * DAY);
    await mk('d45', 45 * DAY);
    await mk('draft', 2 * DAY, false);
    await mk('paidOld', 3 * DAY);
    await tx.insert(cashierTransactions).values({
      tenantId,
      branchId,
      patientId: p?.id as string,
      visitNoteId: v.paidOld,
      totalAmount: '500000',
      paidAmount: '500000',
      paymentMethod: 'cash',
      type: 'payment',
      status: 'completed',
      createdBy: userId,
    });
  });

  await withTenant(tenantId, async (tx) => {
    const [role] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Kassir (test)' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(permRows.map((p) => ({ roleId: role?.id as string, permissionId: p.id })));
    await tx
      .insert(userAssignments)
      .values({ tenantId, userId, branchId, roleId: role?.id as string });
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

describe('FX-17: pending-visits oynasi', () => {
  test("kecha va 10 kun oldingi to'lanmagan vizit ro'yxatda, kechikkan deb belgilangan", async () => {
    const r = await list();
    expect(r.status).toBe(200);
    const rows = r.json.data.data;
    const byId = new Map(rows.map((x) => [x.visitNoteId, x]));
    expect(byId.get(v.today as string)?.overdue).toBe(false);
    expect(byId.get(v.yesterday as string)?.overdue).toBe(true);
    expect(byId.get(v.d10 as string)?.overdue).toBe(true);
    // 30 kundan eski, qoralama va to'langan vizit chiqmaydi
    expect(byId.has(v.d45 as string)).toBe(false);
    expect(byId.has(v.draft as string)).toBe(false);
    expect(byId.has(v.paidOld as string)).toBe(false);
    expect(r.json.data.meta.total).toBe(3);
  });

  test("yangi imzolanganlari oldin; sahifalash meta.total to'g'ri", async () => {
    const p1 = await list('&page=1&pageSize=2');
    expect(p1.json.data.data.map((x) => x.visitNoteId)).toEqual([v.today, v.yesterday]);
    expect(p1.json.data.meta).toEqual({ page: 1, pageSize: 2, total: 3 });
    const p2 = await list('&page=2&pageSize=2');
    expect(p2.json.data.data.map((x) => x.visitNoteId)).toEqual([v.d10]);
  });

  test('oyna 5 kunga qisqartirilsa 10 kunlik chiqmaydi', async () => {
    const r = await list('&days=5');
    const ids = r.json.data.data.map((x) => x.visitNoteId);
    expect(ids).toContain(v.yesterday as string);
    expect(ids).not.toContain(v.d10 as string);
  });
});
