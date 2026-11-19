/**
 * FX-77 (LA-77) — fiskal chek tx ichida EMAS, commit'dan keyin yuboriladi.
 * Tx rollback bo'lsa soliqqa chek ketmaydi; natija commit'dan keyin alohida
 * tenant-tx'da yoziladi. Real DB.
 *
 *   cd apps/api && bun test tests/integration/fx-77-fiscal-after-commit.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  cashierTransactions,
  patients,
  services,
  tenants,
  users,
} from '@dental/db-schema';
import type { FiscalPayment, FiscalProvider } from '@dental/fiscal';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { type AfterCommitFn, runAfterCommit } from '../../src/db/after-commit.ts';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;

let tenantId: string;
let ownerId: string;
let branchId: string;
let patientId: string;
let serviceId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000077', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  ownerId = (owner as { id: string }).id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FX77 Clinic', slug: 'fx77-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  tenantId = (tenant as { id: string }).id;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [b] = await tx
      .insert(branches)
      .values({ tenantId, name: 'B1' })
      .returning({ id: branches.id });
    branchId = (b as { id: string }).id;
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    patientId = (p as { id: string }).id;
    const [s] = await tx
      .insert(services)
      .values({ tenantId, code: 'FX77', nameUz: 'Xizmat' })
      .returning({ id: services.id });
    serviceId = (s as { id: string }).id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const ctx = (tx: DbOrTx, afterCommit: AfterCommitFn[]): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: ownerId }
              : k === 'afterCommit'
                ? afterCommit
                : undefined,
  }) as unknown as Context;

const input = {
  branchId,
  patientId,
  items: [] as unknown[],
  discount: 0,
  paidAmount: 50000,
  paymentMethod: 'cash',
};

const makeCashier = (calls: FiscalPayment[]) => {
  const fiscal: FiscalProvider = {
    async createReceipt(p) {
      calls.push(p);
      return { fiscalId: 'F-77', response: { provider: 'spy' } };
    },
  };
  return createCashierService({
    audit: noopAudit,
    fiscal,
    priceLookup: { getActivePrice: async () => ({ price: '50000' }) },
  });
};

const body = () =>
  ({
    ...input,
    branchId,
    patientId,
    items: [{ serviceId, quantity: 1, unitPrice: 50000, serviceName: 'X' }],
  }) as never;

describe('FX-77: fiscal commit dan keyin', () => {
  test('tx ichida fiscal chaqirilmaydi; commit dan keyin chaqiriladi va natija yoziladi', async () => {
    const calls: FiscalPayment[] = [];
    const cashier = makeCashier(calls);
    const list: AfterCommitFn[] = [];
    let txId = '';
    let callsInTx = -1;
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const r = await cashier.create(ctx(tx, list), body());
      txId = (r as { id: string }).id;
      callsInTx = calls.length;
    });
    expect(callsInTx).toBe(0);
    expect(calls).toHaveLength(0);
    await runAfterCommit(list);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.id).toBe(txId);
    const row = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const [r] = await tx
        .select()
        .from(cashierTransactions)
        .where(eq(cashierTransactions.id, txId));
      return r;
    });
    expect(row?.fiscalReceiptId).toBe('F-77');
    expect((row?.fiscalResponse as { provider: string }).provider).toBe('spy');
  });

  test('tx rollback bo‘lsa fiscal umuman chaqirilmaydi', async () => {
    const calls: FiscalPayment[] = [];
    const cashier = makeCashier(calls);
    const list: AfterCommitFn[] = [];
    await db
      .transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        await cashier.create(ctx(tx, list), body());
        throw new Error('rollback');
      })
      .catch(() => {});
    // rlsMiddleware rollback'da runAfterCommit chaqirmaydi — ro'yxat bajarilmaydi.
    expect(list.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);
  });
});
