/**
 * CLI-364 — lab-orders.service.ts o'qish funksiyalari (list/overdue/get) audit_log'ga
 * 'viewed' yozuvi qo'shishini tasdiqlaydi. REAL DB + real audit logger.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-364-lab-orders`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, labOrders, patients, tenants, users } from '@dental/db-schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createLabOrdersService } from '../../src/modules/lab-orders/lab-orders.service.ts';

const audit = createAuditLogger({ db });
const service = createLabOrdersService({ audit });

let tenantId: string;
let userId: string;
let patientId: string;
let labOrderId: string;

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
              ? { id: userId }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000072', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Lab Clinic', slug: 'lab-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;

    const [order] = await tx
      .insert(labOrders)
      .values({
        tenantId,
        patientId,
        doctorId: userId,
        labName: 'Lab A',
        orderType: 'crown',
        items: [{ description: 'Crown 26' }],
      })
      .returning({ id: labOrders.id });
    if (!order) throw new Error('lab order insert failed');
    labOrderId = order.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Lab orders — o‘qish audit (CLI-364)', () => {
  test('list(): audit_log’da action=viewed/resourceType=lab_order/resourceId=patientId', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.list(ctx(tx), { patientId, page: 1, pageSize: 20 });
    });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'viewed'),
            eq(auditLog.resourceType, 'lab_order'),
            eq(auditLog.resourceId, patientId),
          ),
        );
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('overdue(): tenant-wide chaqiruv audit yozadi (resourceId=null)', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.overdue(ctx(tx));
    });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'viewed'),
            eq(auditLog.resourceType, 'lab_order'),
            isNull(auditLog.resourceId),
          ),
        );
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('get(): topilgan buyurtma uchun resourceId=labOrder.id', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.get(ctx(tx), labOrderId);
    });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'viewed'),
            eq(auditLog.resourceType, 'lab_order'),
            eq(auditLog.resourceId, labOrderId),
          ),
        );
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
