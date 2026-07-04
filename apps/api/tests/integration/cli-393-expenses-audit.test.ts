/**
 * CLI-393 — expenses.service.ts o'qish funksiyalari (list/getById) audit_log'ga
 * 'viewed' yozuvi qo'shishini tasdiqlaydi. REAL DB + real audit logger. Audit
 * `after`da xarajat summasi YO'Q.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-393-expenses`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, expenses, tenants, users } from '@dental/db-schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createExpensesService } from '../../src/modules/expenses/expenses.service.ts';

const audit = createAuditLogger({ db });
const service = createExpensesService({ audit });

let tenantId: string;
let userId: string;
let expenseId: string;

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
    .values({ phone: '+998900000092', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Expense Audit Clinic', slug: 'expense-audit-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [row] = await tx
      .insert(expenses)
      .values({ tenantId, amount: '150000', date: '2026-06-15', createdBy: userId })
      .returning({ id: expenses.id });
    if (!row) throw new Error('expense insert failed');
    expenseId = row.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const selectAuditRows = (...conds: Parameters<typeof and>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return tx
      .select()
      .from(auditLog)
      .where(and(...conds));
  });

describe('Expenses — o‘qish audit (CLI-393)', () => {
  test('list(): action=viewed/resourceType=expense/resourceId=null, summa yo‘q', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.list(ctx(tx), { page: 1, pageSize: 20 });
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'expense'),
      isNull(auditLog.resourceId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(rows[0]?.after ?? {})).not.toContain('150000');
  });

  test('getById(): resourceId=expense.id', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.getById(ctx(tx), expenseId);
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'expense'),
      eq(auditLog.resourceId, expenseId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
