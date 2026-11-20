/**
 * FT-04 (verifier MAJOR) — `discount.give` maqsad filial (`body.branchId`) doirasida
 * tekshiriladi (X-2 naqshi, refund'dagi `loadBranchScope` kabi), faqat JWT (faol workspace)
 * emas. REAL DB + REAL HTTP + real `user_assignments` + real cheklangan rollar (@owner EMAS).
 *
 *  - A filialida «Kassir+chegirma» (create_transaction + discount.give), B filialida
 *    «Kassir» (faqat create_transaction).
 *  - Workspace A (JWT'da discount.give bor) → B'da chegirmali POS → 403 discount.forbidden,
 *    hech narsa yozilmaydi.
 *  - Workspace B (JWT'da discount.give YO'Q) → A'da chegirmali POS → 201 (A'da huquq bor).
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/ft-04-discount-branch-scope.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
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
} from '@dental/db-schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const BASE = ['cashier.view', 'cashier.create_transaction'];
const WITH_DISCOUNT = [...BASE, 'discount.give'];
const app = createApp();

let tenantId: string;
let brA: string;
let brB: string;
let patientId: string;
let svcId: string;
const tok: Record<string, string> = {};

const call = async (who: string, body: unknown) => {
  const res = await app.request('/api/cashier/transactions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.44.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: test javob shakli
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const posBody = (branchId: string) => ({
  branchId,
  patientId,
  items: [{ serviceId: svcId, quantity: 1, unitPrice: 1, serviceName: 'x' }],
  discount: 10000,
  discountReason: 'test',
  paidAmount: 90000,
  paymentMethod: 'cash',
});

const countAt = (branchId: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return (
      await tx.select().from(cashierTransactions).where(eq(cashierTransactions.branchId, branchId))
    ).length;
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  const owner = await mk('+998900044401');
  const staff = await mk('+998900044402');

  for (const code of WITH_DISCOUNT) {
    await db
      .insert(permissions)
      .values({ code, category: code.split('.')[0]! })
      .onConflictDoNothing();
  }
  const permIds = async (codes: string[]) =>
    db.select({ id: permissions.id }).from(permissions).where(inArray(permissions.code, codes));
  const basePerms = await permIds(BASE);
  const discPerms = await permIds(WITH_DISCOUNT);

  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FT04 scope', slug: 'ft-04-discount-scope', ownerUserId: owner })
      .returning({ id: tenants.id })
  )[0]!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [a, b] = await tx
      .insert(branches)
      .values([
        { tenantId, name: 'A' },
        { tenantId, name: 'B' },
      ])
      .returning({ id: branches.id });
    brA = a!.id;
    brB = b!.id;
    const [discRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Kassir+chegirma' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(discPerms.map((p) => ({ roleId: discRole!.id, permissionId: p.id })));
    const [plainRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Kassir' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(basePerms.map((p) => ({ roleId: plainRole!.id, permissionId: p.id })));
    await tx.insert(userAssignments).values([
      { tenantId, userId: staff, branchId: brA, roleId: discRole!.id },
      { tenantId, userId: staff, branchId: brB, roleId: plainRole!.id },
    ]);
    const [pt] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'P' })
      .returning({ id: patients.id });
    patientId = pt!.id;
    const [svc] = await tx
      .insert(services)
      .values({ tenantId, code: 'S1', nameUz: 'Xizmat' })
      .returning({ id: services.id });
    svcId = svc!.id;
    await tx.insert(servicePrices).values([
      { serviceId: svcId, branchId: brA, price: '100000' },
      { serviceId: svcId, branchId: brB, price: '100000' },
    ]);
  });

  const sign = async (abid: string, perms: string[]) =>
    (await signAccess({ sub: staff, atid: tenantId, abid, perms, roleKey: null, lang: 'uz' }))
      .token;
  tok.wsA = await sign(brA, WITH_DISCOUNT); // faol workspace A — JWT'da discount.give
  tok.wsB = await sign(brB, BASE); // faol workspace B — JWT'da discount.give yo'q
});

describe('FT-04: discount.give maqsad filial doirasida', () => {
  test("workspace A, B'da chegirmali POS → 403 discount.forbidden, yozuv yo'q", async () => {
    const r = await call('wsA', posBody(brB));
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('discount.forbidden');
    expect(await countAt(brB)).toBe(0);
  });

  test("workspace A, B'da chegirmasiz POS → 201 (create_transaction B'da bor)", async () => {
    const r = await call('wsA', { ...posBody(brB), discount: 0, paidAmount: 100000 });
    expect(r.status).toBe(201);
  });

  test("workspace B, A'da chegirmali POS → 201 (A'da discount.give bor)", async () => {
    const r = await call('wsB', posBody(brA));
    expect(r.status).toBe(201);
    expect(r.json.data.discountGrantedBy).toBeTruthy();
    expect(await countAt(brA)).toBe(1);
  });
});
