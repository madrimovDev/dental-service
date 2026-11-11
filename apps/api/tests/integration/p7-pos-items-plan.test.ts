/**
 * P7 — POS `items` rejimida begona reja va mavjud bo'lmagan bemor rad etiladi.
 * Real DB; ruxsat: cheklangan Receptionist permset (kassir), @owner emas.
 *
 * Ishga tushirish:
 *   cd apps/api && bun test tests/integration/p7-pos-items-plan.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  cashierTransactions,
  patients,
  services,
  tenants,
  treatmentPlans,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import {
  createCashierService,
  ItemsPlanNotAllowedError,
  PatientNotFoundError,
} from '../../src/modules/cashier/cashier.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const cashier = createCashierService({
  audit: noopAudit,
  priceLookup: { getActivePrice: async () => ({ price: '100000' }) },
});

let tenantId: string;
let otherTenantId: string;
let userId: string;
let branchId: string;
let patientId: string;
let otherPatientId: string;
let planId: string;
let serviceId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['cashier.create_transaction', 'cashier.view'] }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: userId }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

const withTx = <T>(tid: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tid}'`));
    return fn(tx);
  });

const base = () => ({
  branchId,
  items: [{ serviceId, quantity: 1, unitPrice: 1, serviceName: 'Svc' }],
  discount: 0,
  paidAmount: 100_000,
  paymentMethod: 'cash' as const,
});

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900000700', passwordHash: 'x', fullName: 'Kassir' })
    .returning({ id: users.id });
  if (!u) throw new Error('user');
  userId = u.id;
  const [t1] = await db
    .insert(tenants)
    .values({ name: 'P7 A', slug: 'p7-a', ownerUserId: userId })
    .returning({ id: tenants.id });
  const [t2] = await db
    .insert(tenants)
    .values({ name: 'P7 B', slug: 'p7-b', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!t1 || !t2) throw new Error('tenant');
  tenantId = t1.id;
  otherTenantId = t2.id;
  await withTx(tenantId, async (tx) => {
    const [b] = await tx.insert(branches).values({ tenantId, name: 'Main' }).returning();
    const [p] = await tx.insert(patients).values({ tenantId, fullName: 'P' }).returning();
    if (!b || !p) throw new Error('seed');
    const [svc] = await tx
      .insert(services)
      .values({ tenantId, code: 'X', nameUz: 'Xizmat' })
      .returning();
    if (!svc) throw new Error('svc');
    serviceId = svc.id;
    branchId = b.id;
    patientId = p.id;
    const [pl] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: userId, title: 'R', status: 'accepted' })
      .returning();
    if (!pl) throw new Error('plan');
    planId = pl.id;
  });
  await withTx(otherTenantId, async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId: otherTenantId, fullName: 'Begona' })
      .returning();
    if (!p) throw new Error('seed2');
    otherPatientId = p.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const count = () =>
  withTx(tenantId, async (tx) => (await tx.select().from(cashierTransactions)).length);

describe('P7 — POS items rejimi', () => {
  test('items + treatmentPlanId -> ItemsPlanNotAllowedError, yozuv yo`q', async () => {
    const before = await count();
    await expect(
      withTx(tenantId, (tx) => cashier.create(ctx(tx), { ...base(), treatmentPlanId: planId })),
    ).rejects.toBeInstanceOf(ItemsPlanNotAllowedError);
    expect(await count()).toBe(before);
  });

  test('items + begona tenant patientId -> PatientNotFoundError', async () => {
    await expect(
      withTx(tenantId, (tx) => cashier.create(ctx(tx), { ...base(), patientId: otherPatientId })),
    ).rejects.toBeInstanceOf(PatientNotFoundError);
    await expect(
      withTx(tenantId, (tx) =>
        cashier.create(ctx(tx), {
          ...base(),
          patientId: '22222222-2222-4222-8222-222222222222',
        }),
      ),
    ).rejects.toBeInstanceOf(PatientNotFoundError);
  });

  test('items + mavjud patientId -> yaratiladi', async () => {
    const r = await withTx(tenantId, (tx) => cashier.create(ctx(tx), { ...base(), patientId }));
    expect(r.patientId).toBe(patientId);
    expect(r.treatmentPlanId).toBeNull();
  });
});
