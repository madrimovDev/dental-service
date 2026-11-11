/**
 * UI-M5 Ombor — REAL HTTP + REAL DB + REAL rol permset (@owner EMAS).
 *
 *  - «necha kunga yetadi» = qoldiq ÷ oxirgi 30 kun o'rtacha kunlik sarf; sarf 0 → `null` (bo'linish xatosi yo'q).
 *  - IR-01: boshlang'ich qoldiq (qty > 0) ledgerga `in` / `initial_balance` bo'lib yoziladi.
 *  - IR-02: `batches/expiring` faqat qoldig'i bor partiyalar (FIFO taqsimot) + filial filtri.
 *  - kirim → xarajat (ixtiyoriy): `expense.manage` talab qilinadi (Doctor 403, partiya YOZILMAYDI).
 *  - bugungi avto-yechish jurnali.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env ui-m5-stock-days`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  branches,
  expenses,
  patients,
  stockBatches,
  stockItems,
  stockMovements,
  tenants,
  users,
  visitNotes,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const permsFor = (k: string): string[] => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === k);
  if (!t) throw new Error(`template ${k}`);
  return [...t.permissions];
};

const DAY = 24 * 60 * 60 * 1000;

let tenantId: string;
let branchA: string;
let branchB: string;
let doctorUserId: string;
let managerToken: string;
let doctorToken: string;
let receptionToken: string;

const tokenFor = async (sub: string, perms: string[], roleKey: string) =>
  (await signAccess({ sub, atid: tenantId, abid: null, perms, roleKey, lang: 'uz' })).token;

const req = (path: string, token: string, init: RequestInit = {}) =>
  createApp().request(path, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  });

const withTenant = <T>(
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const mkItem = (name: string, quantity: string, branchId: string | null) =>
  withTenant(async (tx) => {
    const [i] = await tx
      .insert(stockItems)
      .values({ tenantId, branchId, name, unit: 'dona', quantity, minThreshold: '1' })
      .returning({ id: stockItems.id });
    return i!.id;
  });

const mkMovement = (
  itemId: string,
  type: 'in' | 'out' | 'adjustment',
  quantity: string,
  daysAgo: number,
  reason: string | null = null,
  sourceVisitNoteId: string | null = null,
) =>
  withTenant((tx) =>
    tx.insert(stockMovements).values({
      tenantId,
      itemId,
      type,
      quantity,
      reason,
      sourceVisitNoteId,
      createdAt: new Date(Date.now() - daysAgo * DAY),
    }),
  );

const listItems = async (token: string, qs = '') => {
  const res = await req(`/api/stock/items${qs}`, token);
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    data: Array<{ id: string; name: string; daysLeft: number | null; avgDailyUsage: string }>;
  };
  return new Map(body.data.map((i) => [i.name, i]));
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const ins = await db
    .insert(users)
    .values([
      { phone: '+998900005501', passwordHash: 'x', fullName: 'Owner M5' },
      { phone: '+998900005502', passwordHash: 'x', fullName: 'Karimov Doctor' },
      { phone: '+998900005503', passwordHash: 'x', fullName: 'Manager M5' },
      { phone: '+998900005504', passwordHash: 'x', fullName: 'Reception M5' },
    ])
    .returning({ id: users.id });
  const [owner, doctor, manager, reception] = ins;
  if (!owner || !doctor || !manager || !reception) throw new Error('users');
  doctorUserId = doctor.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'M5', slug: 'ui-m5', ownerUserId: owner.id })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;
  await withTenant(async (tx) => {
    const [a] = await tx.insert(branches).values({ tenantId, name: 'A' }).returning();
    const [b] = await tx.insert(branches).values({ tenantId, name: 'B' }).returning();
    branchA = a!.id;
    branchB = b!.id;
  });
  managerToken = await tokenFor(manager.id, permsFor('branch_manager'), 'branch_manager');
  doctorToken = await tokenFor(doctor.id, permsFor('doctor'), 'doctor');
  receptionToken = await tokenFor(reception.id, permsFor('receptionist'), 'receptionist');
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('UI-M5 rol sanity', () => {
  test('Doctor stock.manage ga ega, expense.manage ga EGA EMAS; Receptionist stock.view yo‘q', () => {
    expect(permsFor('doctor')).toContain('stock.manage');
    expect(permsFor('doctor')).not.toContain('expense.manage');
    expect(permsFor('receptionist')).not.toContain('stock.view');
    expect(permsFor('branch_manager')).toContain('expense.manage');
  });
});

describe('necha kunga yetadi (30 kunlik o‘rtacha sarf)', () => {
  test('qoldiq 10, 30 kunda 30 sarf → 1/kun → 10 kun', async () => {
    const id = await mkItem('Days-10', '10', branchA);
    await mkMovement(id, 'out', '12', 5, 'visit_auto');
    await mkMovement(id, 'out', '18', 20);
    const m = await listItems(managerToken);
    expect(m.get('Days-10')?.daysLeft).toBe(10);
    expect(Number(m.get('Days-10')?.avgDailyUsage)).toBeCloseTo(1, 5);
  });

  test('sarf 0 → daysLeft null (cheksiz, bo‘linish xatosi yo‘q)', async () => {
    await mkItem('Days-nousage', '50', branchA);
    const m = await listItems(managerToken);
    expect(m.get('Days-nousage')?.daysLeft).toBeNull();
    expect(Number(m.get('Days-nousage')?.avgDailyUsage)).toBe(0);
  });

  test('30 kundan eski sarf hisobga olinmaydi; kirim (in) sarf EMAS', async () => {
    const id = await mkItem('Days-old', '10', branchA);
    await mkMovement(id, 'out', '300', 45);
    await mkMovement(id, 'in', '100', 3, 'batch_received');
    const m = await listItems(managerToken);
    expect(m.get('Days-old')?.daysLeft).toBeNull();
  });

  test('visit_edit_return sarfni kamaytiradi (netto)', async () => {
    const id = await mkItem('Days-return', '6', branchA);
    await mkMovement(id, 'out', '30', 2, 'visit_auto');
    await mkMovement(id, 'in', '24', 1, 'visit_edit_return');
    const m = await listItems(managerToken);
    // netto 6 / 30 = 0.2 kunlik → 6 / 0.2 = 30 kun
    expect(m.get('Days-return')?.daysLeft).toBe(30);
  });

  test('qoldiq 0 va sarf bor → 0 kun; manfiy qoldiq ham 0', async () => {
    const a = await mkItem('Days-zero', '0', branchA);
    await mkMovement(a, 'out', '3', 1);
    const b = await mkItem('Days-neg', '-2', branchA);
    await mkMovement(b, 'out', '3', 1);
    const m = await listItems(managerToken);
    expect(m.get('Days-zero')?.daysLeft).toBe(0);
    expect(m.get('Days-neg')?.daysLeft).toBe(0);
  });

  test('Receptionist (stock.view yo‘q) → 403; Doctor (stock.view) → 200', async () => {
    expect((await req('/api/stock/items', receptionToken)).status).toBe(403);
    expect((await req('/api/stock/items', doctorToken)).status).toBe(200);
  });
});

describe('IR-01 boshlang‘ich qoldiq ledgerga', () => {
  test('createItem qty 20 → `in`/initial_balance qatori; qty 0 → qator yo‘q', async () => {
    const res = await req('/api/stock/items', managerToken, {
      method: 'POST',
      body: JSON.stringify({ name: 'Init-20', unit: 'dona', quantity: 20, minThreshold: 2 }),
    });
    expect(res.status).toBe(201);
    const id = ((await res.json()) as { data: { id: string } }).data.id;
    const rows = await withTenant((tx) =>
      tx.select().from(stockMovements).where(eq(stockMovements.itemId, id)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe('in');
    expect(rows[0]?.reason).toBe('initial_balance');
    expect(Number(rows[0]?.quantity)).toBe(20);

    const res0 = await req('/api/stock/items', managerToken, {
      method: 'POST',
      body: JSON.stringify({ name: 'Init-0', unit: 'dona', quantity: 0, minThreshold: 2 }),
    });
    const id0 = ((await res0.json()) as { data: { id: string } }).data.id;
    const rows0 = await withTenant((tx) =>
      tx.select().from(stockMovements).where(eq(stockMovements.itemId, id0)),
    );
    expect(rows0).toHaveLength(0);
  });
});

describe('IR-02 expiring: faqat qoldig‘i bor partiyalar + filial filtri', () => {
  let remainingItem: string;
  const mkBatch = (
    itemId: string,
    qty: string,
    receivedDaysAgo: number,
    expiryInDays: number,
    no: string,
  ) =>
    withTenant((tx) =>
      tx.insert(stockBatches).values({
        tenantId,
        itemId,
        batchNumber: no,
        qtyReceived: qty,
        expiryDate: new Date(Date.now() + expiryInDays * DAY),
        receivedAt: new Date(Date.now() - receivedDaysAgo * DAY),
      }),
    );

  beforeAll(async () => {
    // Item: qoldiq 14; partiyalar: eski E-OLD (10, 60 kun oldin), yangi E-NEW (20, 5 kun oldin).
    // FIFO: qoldiq eng yangi partiyaga taqsimlanadi → E-NEW qoldig'i 14, E-OLD qoldig'i 0.
    remainingItem = await mkItem('Exp-fifo', '14', branchA);
    await mkBatch(remainingItem, '10', 60, 10, 'E-OLD');
    await mkBatch(remainingItem, '20', 5, 12, 'E-NEW');
    // Butunlay sarflangan item (qoldiq 0) — partiyasi chiqmasligi kerak.
    const gone = await mkItem('Exp-gone', '0', branchA);
    await mkBatch(gone, '10', 20, 7, 'G-1');
    // Muddati o'tib ketgan, lekin qoldig'i bor → ko'rinadi (yo'q qilish kerak).
    const exp = await mkItem('Exp-expired', '3', branchA);
    await mkBatch(exp, '3', 40, -4, 'X-EXPIRED');
    // Boshqa filial / tenant-darajali item.
    const other = await mkItem('Exp-branchB', '5', branchB);
    await mkBatch(other, '5', 2, 9, 'B-1');
    const shared = await mkItem('Exp-shared', '5', null);
    await mkBatch(shared, '5', 2, 9, 'S-1');
  });

  const expiring = async (qs: string) => {
    const res = await req(`/api/stock/batches/expiring${qs}`, managerToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ batchNumber: string | null; qtyRemaining: string; itemName: string }>;
    };
    return new Map(body.data.map((b) => [b.batchNumber ?? '', b]));
  };

  test('sarflangan partiya chiqmaydi; FIFO: faqat eng yangi partiyada qoldiq', async () => {
    const m = await expiring('?withinDays=30');
    expect(m.has('G-1')).toBe(false);
    expect(m.has('E-OLD')).toBe(false);
    expect(Number(m.get('E-NEW')?.qtyRemaining)).toBe(14);
    expect(m.get('E-NEW')?.itemName).toBe('Exp-fifo');
  });

  test('muddati o‘tgan, qoldig‘i bor partiya ko‘rinadi', async () => {
    const m = await expiring('?withinDays=30');
    expect(Number(m.get('X-EXPIRED')?.qtyRemaining)).toBe(3);
  });

  test('branchId filtri: A → A + tenant-darajali; B-item chiqmaydi', async () => {
    const m = await expiring(`?withinDays=30&branchId=${branchA}`);
    expect(m.has('E-NEW')).toBe(true);
    expect(m.has('S-1')).toBe(true);
    expect(m.has('B-1')).toBe(false);
    const all = await expiring('?withinDays=30');
    expect(all.has('B-1')).toBe(true);
  });
});

describe('kirim → xarajat (ixtiyoriy belgi)', () => {
  test('Branch Manager: recordAsExpense → partiya + `in` + xarajat (qty × narx), bir tx', async () => {
    const itemId = await mkItem('Rcv-exp', '0', branchA);
    const res = await req('/api/stock/batches', managerToken, {
      method: 'POST',
      body: JSON.stringify({
        itemId,
        qtyReceived: 10,
        costPerUnit: 185000,
        batchNumber: 'K-2611',
        supplierName: 'Dental Market',
        recordAsExpense: true,
      }),
    });
    expect(res.status).toBe(201);
    const exp = await withTenant((tx) => tx.select().from(expenses));
    const row = exp.find((e) => e.note?.includes('K-2611'));
    expect(row).toBeTruthy();
    expect(Number(row?.amount)).toBe(1850000);
    expect(row?.branchId).toBe(branchA);
    const [item] = await withTenant((tx) =>
      tx.select({ q: stockItems.quantity }).from(stockItems).where(eq(stockItems.id, itemId)),
    );
    expect(Number(item?.q)).toBe(10);
  });

  test('belgisiz (yoki false) → xarajat YO‘Q', async () => {
    const itemId = await mkItem('Rcv-noexp', '0', branchA);
    const before = (await withTenant((tx) => tx.select().from(expenses))).length;
    const res = await req('/api/stock/batches', managerToken, {
      method: 'POST',
      body: JSON.stringify({ itemId, qtyReceived: 4, costPerUnit: 1000 }),
    });
    expect(res.status).toBe(201);
    expect((await withTenant((tx) => tx.select().from(expenses))).length).toBe(before);
  });

  test('Doctor (stock.manage bor, expense.manage YO‘Q): recordAsExpense → 403, partiya YOZILMAYDI', async () => {
    const itemId = await mkItem('Rcv-doctor', '0', branchA);
    const res = await req('/api/stock/batches', doctorToken, {
      method: 'POST',
      body: JSON.stringify({ itemId, qtyReceived: 4, costPerUnit: 1000, recordAsExpense: true }),
    });
    expect(res.status).toBe(403);
    const batches = await withTenant((tx) =>
      tx.select().from(stockBatches).where(eq(stockBatches.itemId, itemId)),
    );
    expect(batches).toHaveLength(0);
    // Belgisiz kirim Doctor uchun avvalgidek ishlaydi.
    const ok = await req('/api/stock/batches', doctorToken, {
      method: 'POST',
      body: JSON.stringify({ itemId, qtyReceived: 4 }),
    });
    expect(ok.status).toBe(201);
  });

  test('recordAsExpense narxsiz → 400', async () => {
    const itemId = await mkItem('Rcv-noprice', '0', branchA);
    const res = await req('/api/stock/batches', managerToken, {
      method: 'POST',
      body: JSON.stringify({ itemId, qtyReceived: 4, recordAsExpense: true }),
    });
    expect(res.status).toBe(400);
  });
});

describe('bugungi avto-yechish jurnali', () => {
  test('faqat bugungi visit_auto / visit_edit_return; shifokor nomi vizit yozuvidan', async () => {
    const itemId = await mkItem('Log-item', '9', branchA);
    const visitId = await withTenant(async (tx) => {
      const [p] = await tx.insert(patients).values({ tenantId, fullName: 'Log Bemor' }).returning();
      const [v] = await tx
        .insert(visitNotes)
        .values({ tenantId, patientId: p!.id, doctorId: doctorUserId })
        .returning({ id: visitNotes.id });
      return v!.id;
    });
    await mkMovement(itemId, 'out', '1', 0, 'visit_auto', visitId);
    await mkMovement(itemId, 'in', '1', 0, 'visit_edit_return', visitId);
    await mkMovement(itemId, 'out', '1', 2, 'visit_auto', visitId); // kecha emas — 2 kun oldin
    await mkMovement(itemId, 'out', '1', 0, null); // qo'lda chiqim — jurnalga kirmaydi

    const res = await req('/api/stock/auto-deductions/today', doctorToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{
        itemName: string;
        type: string;
        quantity: string;
        doctorName: string | null;
        createdAt: string;
      }>;
    };
    const mine = body.data.filter((r) => r.itemName === 'Log-item');
    expect(mine).toHaveLength(2);
    expect(mine.map((r) => r.type).sort()).toEqual(['in', 'out']);
    expect(mine[0]?.doctorName).toBe('Karimov Doctor');
    expect((await req('/api/stock/auto-deductions/today', receptionToken)).status).toBe(403);
  });
});
