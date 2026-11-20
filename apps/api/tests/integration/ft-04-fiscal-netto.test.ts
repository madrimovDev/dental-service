/**
 * FT-04.4 (LA fiskal low) — fiskal chek payload'i izchil: items NETTO (chegirma qatorlarga
 * taqsimlangan), `discount` maydoni, reja to'lovida items = bosqich allocation'lari.
 * To'liq to'lovda `amount (paidAmount) = Σ items.amount`.
 *
 * Spy FiscalProvider (DI) + REAL DB (cashier.create() to'liq oqim, RLS tx ichida).
 * Chaqiruvchi — cheklangan kassir permset'i (`cashier.create_transaction` + `discount.give`),
 * `@owner` EMAS.
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/ft-04-fiscal-netto.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  patients,
  services,
  tenants,
  treatmentPlans,
  treatmentStages,
  users,
} from '@dental/db-schema';
import type { FiscalPayment, FiscalProvider } from '@dental/fiscal';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const KASSIR_PERMS = ['cashier.view', 'cashier.create_transaction', 'discount.give'];

let tenantId: string;
let userId: string;
let branchId: string;
let patientId: string;
let svcA: string;
let svcB: string;
let stage1: string;
let stage2: string;

const PRICES: Record<string, string> = {};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900075401', passwordHash: 'fake', fullName: 'Kassir' })
    .returning({ id: users.id });
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900075402', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  userId = u!.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FT04 Fiskal', slug: 'ft-04-fiskal', ownerUserId: owner!.id })
    .returning({ id: tenants.id });
  tenantId = t!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [br] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Asosiy' })
      .returning({ id: branches.id });
    branchId = br!.id;
    const [pt] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor Fiskal' })
      .returning({ id: patients.id });
    patientId = pt!.id;
    const [a] = await tx
      .insert(services)
      .values({ tenantId, code: 'FT044-A', nameUz: 'Plomba' })
      .returning({ id: services.id });
    const [b] = await tx
      .insert(services)
      .values({ tenantId, code: 'FT044-B', nameUz: 'Rentgen' })
      .returning({ id: services.id });
    svcA = a!.id;
    svcB = b!.id;
    PRICES[svcA] = '100000';
    PRICES[svcB] = '33333';

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: owner!.id, title: 'Reja', status: 'accepted' })
      .returning({ id: treatmentPlans.id });
    const stages = await tx
      .insert(treatmentStages)
      .values([
        {
          treatmentPlanId: plan!.id,
          sequence: 1,
          serviceId: svcA,
          serviceName: 'Plomba (reja)',
          cost: '180000',
          acceptance: 'accepted',
        },
        {
          treatmentPlanId: plan!.id,
          sequence: 2,
          serviceName: 'Erkin ish',
          cost: '50000',
          acceptance: 'accepted',
        },
      ])
      .returning({ id: treatmentStages.id });
    stage1 = stages[0]!.id;
    stage2 = stages[1]!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: KASSIR_PERMS }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: userId }
              : undefined,
  }) as unknown as Context;

const pay = async (input: Record<string, unknown>): Promise<FiscalPayment> => {
  const received: FiscalPayment[] = [];
  const spy: FiscalProvider = {
    async createReceipt(p) {
      received.push(p);
      return { fiscalId: null, response: null };
    },
  };
  const cashier = createCashierService({
    audit: noopAudit,
    fiscal: spy,
    priceLookup: { getActivePrice: async (_c, sid) => ({ price: PRICES[sid] ?? '0' }) },
  });
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await cashier.create(ctx(tx), { branchId, paymentMethod: 'cash', ...input } as never);
  });
  expect(received).toHaveLength(1);
  return received[0]!;
};

// biome-ignore lint/suspicious/noExplicitAny: fiskal item shakli (unknown[] bo'lgan joyda ham)
const sumCents = (items: any[], k: string) =>
  items.reduce((s, i) => s + Math.round(Number(i[k]) * 100), 0);

describe('FT-04.4 — fiskal payload netto', () => {
  test('erkin POS, chegirma 20 000: items netto, Σ items = amount, discount maydoni', async () => {
    // 100 000×1 + 33 333×3 = 199 999 brutto, chegirma 20 000 → 179 999 netto.
    const p = await pay({
      patientId,
      items: [
        { serviceId: svcA, quantity: 1, unitPrice: 1, serviceName: 'Plomba' },
        { serviceId: svcB, quantity: 3, unitPrice: 1, serviceName: 'Rentgen' },
      ],
      discount: 20_000,
      paidAmount: 179_999,
    });
    expect(p.amount).toBe(179_999);
    expect(p.discount).toBe(20_000);
    expect(p.items).toHaveLength(2);
    expect(sumCents(p.items, 'amount')).toBe(17_999_900);
    expect(sumCents(p.items, 'discount')).toBe(2_000_000);
    expect(sumCents(p.items, 'grossAmount')).toBe(19_999_900);
    const [a, b] = p.items;
    expect(a).toMatchObject({
      name: 'Plomba',
      quantity: 1,
      unitPrice: 100_000,
      grossAmount: 100_000,
    });
    expect(b).toMatchObject({
      name: 'Rentgen',
      quantity: 3,
      unitPrice: 33_333,
      grossAmount: 99_999,
    });
    for (const it of p.items) {
      expect(it.discount).toBeGreaterThanOrEqual(0);
      expect(it.discount).toBeLessThanOrEqual(it.grossAmount);
      expect(Math.round((it.grossAmount - it.discount) * 100)).toBe(Math.round(it.amount * 100));
    }
    // Proporsional: 100 000 / 199 999 ulushi ≈ 10 000.05 → ±1 tiyin.
    expect(Math.abs(a!.discount - 10_000.05)).toBeLessThanOrEqual(0.01);
  });

  test('chegirmasiz POS: items amount = brutto, discount 0, Σ = amount (regressiya)', async () => {
    const p = await pay({
      patientId,
      items: [{ serviceId: svcA, quantity: 2, unitPrice: 1, serviceName: 'Plomba' }],
      discount: 0,
      paidAmount: 200_000,
    });
    expect(p.amount).toBe(200_000);
    expect(p.discount).toBe(0);
    expect(p.items).toEqual([
      expect.objectContaining({ grossAmount: 200_000, discount: 0, amount: 200_000 }),
    ]);
  });

  test("reja to'lovi: items = bosqich allocation'lari (nomi, summa), Σ = amount", async () => {
    const p = await pay({
      patientId,
      items: [],
      discount: 0,
      paidAmount: 100_000,
      allocations: [
        { stageId: stage1, amount: 70_000 },
        { stageId: stage2, amount: 30_000 },
      ],
    });
    expect(p.amount).toBe(100_000);
    expect(p.discount).toBe(0);
    expect(p.items).toHaveLength(2);
    expect(sumCents(p.items, 'amount')).toBe(10_000_000);
    expect(p.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Plomba (reja)',
          stageId: stage1,
          quantity: 1,
          amount: 70_000,
        }),
        expect.objectContaining({
          name: 'Erkin ish',
          stageId: stage2,
          quantity: 1,
          amount: 30_000,
        }),
      ]),
    );
  });
});
