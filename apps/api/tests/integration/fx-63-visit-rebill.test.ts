/**
 * FX-63 — vizit to'lovi: (a) to'liq refund qilingach vizit qayta undiriladi,
 * (b) qisman undirish vizitni 'to'langan' qilmaydi: qolgan xizmatlar qarz bo'lib turadi.
 * REAL DB + REAL HTTP (createApp) + real cheklangan kassir roli (@owner EMAS).
 *
 * Ishga tushirish: cd apps/api && bun test tests/integration/fx-63-visit-rebill.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
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

const { createApp } = await import('../../src/app.ts');
const { signAccess } = await import('../../src/lib/jwt.ts');
const { db } = await import('../../src/db/client.ts');

const CASHIER_PERMS = [
  'cashier.view',
  'cashier.create_transaction',
  'cashier.refund',
  'cashier.void',
];

const withTenant = <T>(tid: string, fn: (tx: typeof db) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tid}'`));
    return fn(tx as unknown as typeof db);
  });

let tenantId: string;
let userId: string;
let branchId: string;
let patientId: string;
let svc1: string; // 100k
let svc2: string; // 50k
let visitRefund: string;
let visitPartial: string;
let visitRace: string;
let visitCredit: string;

const app = createApp();
let tok: string;

const call = async (
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: { data?: any; error?: { code: string } } }> => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.63.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const pay = (
  visitNoteId: string,
  items: Array<{ serviceId: string; quantity: number }>,
  paidAmount: number,
) =>
  call('POST', '/api/cashier/transactions', {
    branchId,
    visitNoteId,
    items: items.map((i) => ({ ...i, unitPrice: 1, serviceName: 'x' })),
    discount: 0,
    paidAmount,
    paymentMethod: 'cash',
  });

const pending = async () => {
  const r = await call('GET', `/api/cashier/pending-visits?branchId=${branchId}`);
  expect(r.status).toBe(200);
  return r.json.data.data as Array<{
    visitNoteId: string;
    total: string;
    services: Array<{ serviceId: string; quantity: number }>;
  }>;
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900063001', passwordHash: 'x', fullName: 'Doktor 63' })
    .returning({ id: users.id });
  userId = u!.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX63', slug: 'fx-63', ownerUserId: userId })
    .returning({ id: tenants.id });
  tenantId = t!.id;

  for (const code of CASHIER_PERMS) {
    await db.insert(permissions).values({ code, category: 'cashier' }).onConflictDoNothing();
  }
  const permRows = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.code, CASHIER_PERMS));

  await withTenant(tenantId, async (tx) => {
    const [b] = await tx.insert(branches).values({ tenantId, name: 'B1' }).returning();
    branchId = b!.id;
    const [p] = await tx.insert(patients).values({ tenantId, fullName: 'Bemor 63' }).returning();
    patientId = p!.id;
    const [s1] = await tx
      .insert(services)
      .values({ tenantId, code: 'S1', nameUz: 'Konsultatsiya' })
      .returning();
    const [s2] = await tx
      .insert(services)
      .values({ tenantId, code: 'S2', nameUz: 'Plomba' })
      .returning();
    svc1 = s1!.id;
    svc2 = s2!.id;
    await tx.insert(servicePrices).values([
      { serviceId: svc1, branchId, price: '100000' },
      { serviceId: svc2, branchId, price: '50000' },
    ]);
    const mkVisit = async (performed: string[]) => {
      const [v] = await tx
        .insert(visitNotes)
        .values({
          tenantId,
          patientId,
          doctorId: userId,
          performedServices: performed,
          signedAt: new Date(),
          signedBy: userId,
        })
        .returning();
      return v!.id;
    };
    visitRefund = await mkVisit([svc1]);
    visitPartial = await mkVisit([svc1, svc1, svc2]); // 250k
    visitRace = await mkVisit([svc1, svc1]); // 200k
    visitCredit = await mkVisit([svc1]); // 100k, to'liq nasiya
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
      perms: CASHIER_PERMS,
      roleKey: null,
      lang: 'uz',
    })
  ).token;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-63: refunddan keyin vizitni qayta undirish', () => {
  test('to`liq refund -> vizit ro`yxatga qaytadi va qayta to`lanadi; ikkinchi faol to`lov 409', async () => {
    const first = await pay(visitRefund, [{ serviceId: svc1, quantity: 1 }], 100000);
    expect(first.status).toBe(201);
    expect((await pending()).map((v) => v.visitNoteId)).not.toContain(visitRefund);

    const ref = await call('POST', `/api/cashier/transactions/${first.json.data.id}/refund`, {});
    expect(ref.status).toBe(200);

    expect((await pending()).map((v) => v.visitNoteId)).toContain(visitRefund);
    const again = await pay(visitRefund, [{ serviceId: svc1, quantity: 1 }], 100000);
    expect(again.status).toBe(201);

    const third = await pay(visitRefund, [{ serviceId: svc1, quantity: 1 }], 100000);
    expect(third.status).toBe(409);
    expect(third.json.error?.code).toBe('cashier.visit_already_billed');
  });
});

describe('FX-63: qisman undirish', () => {
  test('qisman to`lov -> qolgan xizmatlar qarz sifatida ro`yxatda; ortiqcha miqdor rad; qolganini to`lasa yo`qoladi', async () => {
    const part = await pay(visitPartial, [{ serviceId: svc1, quantity: 1 }], 100000);
    expect(part.status).toBe(201);

    const row = (await pending()).find((v) => v.visitNoteId === visitPartial);
    expect(row).toBeDefined();
    expect(row!.total).toBe('150000');
    expect(row!.services.find((s) => s.serviceId === svc1)?.quantity).toBe(1);
    expect(row!.services.find((s) => s.serviceId === svc2)?.quantity).toBe(1);

    // qolgan svc1 miqdoridan ortiq -> mismatch
    const over = await pay(visitPartial, [{ serviceId: svc1, quantity: 2 }], 200000);
    expect(over.status).toBe(400);
    expect(over.json.error?.code).toBe('cashier.visit_items_mismatch');

    const rest = await pay(
      visitPartial,
      [
        { serviceId: svc1, quantity: 1 },
        { serviceId: svc2, quantity: 1 },
      ],
      150000,
    );
    expect(rest.status).toBe(201);
    expect((await pending()).map((v) => v.visitNoteId)).not.toContain(visitPartial);

    const none = await pay(visitPartial, [{ serviceId: svc1, quantity: 1 }], 100000);
    expect(none.status).toBe(409);
    expect(none.json.error?.code).toBe('cashier.visit_already_billed');
  });

  test('parallel ikki to`liq to`lov (poyga): aniq 1 x 201 + 1 x 409, ortiqcha undirish yo`q', async () => {
    const [r1, r2] = await Promise.all([
      pay(visitRace, [{ serviceId: svc1, quantity: 2 }], 200000),
      pay(visitRace, [{ serviceId: svc1, quantity: 2 }], 200000),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const rows = await withTenant(tenantId, (tx) =>
      tx
        .select({ id: cashierTransactions.id })
        .from(cashierTransactions)
        .where(sql`visit_note_id = ${visitRace}`),
    );
    expect(rows.length).toBe(1);
  });
});

describe('FX-63 review: to`liq nasiya (paidAmount=0) vizit to`lovi', () => {
  test('paid=0 to`lov vizitni yopadi: ro`yxatda yo`q, ikkinchi to`lov 409, bitta tranzaksiya', async () => {
    const first = await pay(visitCredit, [{ serviceId: svc1, quantity: 1 }], 0);
    expect(first.status).toBe(201);
    expect((await pending()).map((v) => v.visitNoteId)).not.toContain(visitCredit);

    const second = await pay(visitCredit, [{ serviceId: svc1, quantity: 1 }], 0);
    expect(second.status).toBe(409);
    expect(second.json.error?.code).toBe('cashier.visit_already_billed');

    const rows = await withTenant(tenantId, (tx) =>
      tx
        .select({ id: cashierTransactions.id })
        .from(cashierTransactions)
        .where(sql`visit_note_id = ${visitCredit}`),
    );
    expect(rows.length).toBe(1);
  });
});
