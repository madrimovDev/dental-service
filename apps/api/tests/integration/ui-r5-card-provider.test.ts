/**
 * UI-R5 Kassa — karta sub-turi (`card_provider`): terminal | click | payme | other.
 * Real DB (service qatlami) + real HTTP (createApp, cheklangan Accountant permset).
 *
 *  - card + click saqlanadi (DTO'da ham ko'rinadi)
 *  - cash/transfer + provider → 400 (HTTP, route validation)
 *  - kunlik xulosa karta jamini sub-turlar bo'yicha bo'ladi
 *  - refund asl sub-turni meros qiladi va kunlik xulosada ayiriladi
 *
 * Ishga tushirish:
 *   cd apps/api && bun test --env-file=../../.env tests/integration/ui-r5-card-provider.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, patients, servicePrices, services, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { createApp } from '../../src/app.ts';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { createTransactionSchema } from '../../src/modules/cashier/cashier.schema.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;

let tenantId: string;
let ownerId: string;
let branchId: string;
let patientId: string;
let serviceId: string;
let receptionistToken: string;
let accountantToken: string;

const tashkentToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000549', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner');
  ownerId = owner.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'UIR5 Clinic', slug: 'uir5-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [b] = await tx
      .insert(branches)
      .values({ tenantId, name: 'B1' })
      .returning({ id: branches.id });
    if (!b) throw new Error('branch');
    branchId = b.id;
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient');
    patientId = p.id;
    const [s] = await tx
      .insert(services)
      .values({ tenantId, code: 'S-R5', nameUz: 'Xizmat' })
      .returning({ id: services.id });
    if (!s) throw new Error('service');
    serviceId = s.id;
    await tx.insert(servicePrices).values({ tenantId, serviceId, branchId, price: '100000' });
  });

  // Real cheklangan rollar (role-templates.ts ro'yxati bilan bir xil) — @owner EMAS.
  const mint = async (perms: string[]) =>
    (
      await signAccess({
        sub: ownerId,
        atid: tenantId,
        abid: branchId,
        perms,
        roleKey: null,
        lang: 'uz',
      })
    ).token;
  receptionistToken = await mint(['cashier.view', 'cashier.create_transaction', 'cashier.refund']);
  accountantToken = await mint(['cashier.view', 'cashier.refund', 'cashier.void']);
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
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: ownerId }
              : undefined,
  }) as unknown as Context;

const priceLookup = { getActivePrice: async () => ({ price: '100000' }) };
const sale = (paymentMethod: 'cash' | 'card' | 'transfer', cardProvider?: string, paid = 100000) =>
  ({
    branchId,
    patientId,
    items: [{ serviceId, quantity: 1, unitPrice: 100000, serviceName: 'X' }],
    discount: 0,
    paidAmount: paid,
    paymentMethod,
    ...(cardProvider ? { cardProvider } : {}),
  }) as never;

describe('UI-R5: card_provider', () => {
  test('card + click saqlanadi; card providersiz ham ruxsat (null)', async () => {
    const cashier = createCashierService({ audit: noopAudit, priceLookup });
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx);
      const withProvider = await cashier.create(c, sale('card', 'click'));
      expect(withProvider.cardProvider).toBe('click');
      const bare = await cashier.create(c, sale('card'));
      expect(bare.cardProvider).toBeNull();
      const cash = await cashier.create(c, sale('cash'));
      expect(cash.cardProvider).toBeNull();
      const got = await cashier.getById(c, withProvider.id);
      expect(got?.cardProvider).toBe('click');
    });
  });

  test('schema: cash/transfer + cardProvider rad etiladi, noma’lum sub-tur rad etiladi', () => {
    const base = {
      branchId: crypto.randomUUID(),
      items: [{ serviceId: crypto.randomUUID(), quantity: 1, unitPrice: 1, serviceName: 'X' }],
      paidAmount: 1,
    };
    expect(
      createTransactionSchema.safeParse({ ...base, paymentMethod: 'cash', cardProvider: 'click' })
        .success,
    ).toBe(false);
    expect(
      createTransactionSchema.safeParse({
        ...base,
        paymentMethod: 'transfer',
        cardProvider: 'payme',
      }).success,
    ).toBe(false);
    expect(
      createTransactionSchema.safeParse({ ...base, paymentMethod: 'card', cardProvider: 'visa' })
        .success,
    ).toBe(false);
    expect(
      createTransactionSchema.safeParse({
        ...base,
        paymentMethod: 'card',
        cardProvider: 'terminal',
      }).success,
    ).toBe(true);
  });

  test('HTTP (Receptionist permset): cash + cardProvider → 400, card + payme → 201 + DTO; Accountant yarata olmaydi (403)', async () => {
    const app = createApp();
    const post = (body: Record<string, unknown>, token = receptionistToken) =>
      app.request('/api/cashier/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          branchId,
          patientId,
          items: [{ serviceId, quantity: 1, unitPrice: 1, serviceName: 'X' }],
          paidAmount: 100000,
          ...body,
        }),
      });
    const bad = await post({ paymentMethod: 'cash', cardProvider: 'click' });
    expect(bad.status).toBe(400);
    const good = await post({ paymentMethod: 'card', cardProvider: 'payme' });
    expect(good.status).toBe(201);
    const body = (await good.json()) as { data: { cardProvider: string; paymentMethod: string } };
    expect(body.data.paymentMethod).toBe('card');
    expect(body.data.cardProvider).toBe('payme');
    const denied = await post({ paymentMethod: 'card', cardProvider: 'payme' }, accountantToken);
    expect(denied.status).toBe(403);
  });

  test('kunlik xulosa: karta jami sub-turlar bo‘yicha bo‘linadi, refund ayiriladi', async () => {
    await db.execute(sql`TRUNCATE cashier_transactions CASCADE`);
    const cashier = createCashierService({ audit: noopAudit, priceLookup });
    const today = tashkentToday();
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx);
      await cashier.create(c, sale('card', 'click', 100000));
      await cashier.create(c, sale('card', 'click', 100000));
      const payme = await cashier.create(c, sale('card', 'payme', 100000));
      await cashier.create(c, sale('card', 'terminal', 100000));
      await cashier.create(c, sale('cash', undefined, 100000));

      // Refund asl sub-turni meros qiladi
      const r = await cashier.refund(c, payme.id);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.refund.cardProvider).toBe('payme');

      const summary = await cashier.dailySummary(c, branchId, today);
      const rowOf = (m: string, t: string, p: string | null) =>
        summary.breakdown.find(
          (b) => b.paymentMethod === m && b.type === t && b.cardProvider === p,
        );
      expect(rowOf('card', 'payment', 'click')?.total).toBe('200000.00');
      expect(rowOf('card', 'payment', 'payme')?.total).toBe('100000.00');
      expect(rowOf('card', 'payment', 'terminal')?.total).toBe('100000.00');
      expect(rowOf('card', 'refund', 'payme')?.total).toBe('100000.00');
      expect(rowOf('cash', 'payment', null)?.total).toBe('100000.00');
      // Net: 5 to'lov * 100000 - 1 refund
      const net = summary.breakdown.reduce(
        (s, b) => (b.type === 'refund' ? s - Number(b.total) : s + Number(b.total)),
        0,
      );
      expect(net).toBe(400000);
    });
  });
});
