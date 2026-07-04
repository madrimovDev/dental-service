/**
 * CLI-393 — payroll.service.ts o'qish funksiyalari (listRuns/getRun) audit_log'ga
 * 'viewed' yozuvi qo'shishini tasdiqlaydi. REAL DB + real audit logger. Audit
 * `after`da maosh/komissiya summasi YO'Q.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-393-payroll`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, tenants, users } from '@dental/db-schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createPayrollService } from '../../src/modules/payroll/payroll.service.ts';

const audit = createAuditLogger({ db });
const service = createPayrollService({ audit });

let tenantId: string;
let userId: string;
let runId: string;

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
    .values({ phone: '+998900000091', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Payroll Audit Clinic', slug: 'payroll-audit-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  // Aktiv profil/plan yo'q — createRun 0-line run yaratadi, listRuns/getRun uchun yetarli.
  const run = await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return service.createRun(ctx(tx), { periodFrom: '2026-06-01', periodTo: '2026-06-30' });
  });
  runId = run.id;
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

describe('Payroll — o‘qish audit (CLI-393)', () => {
  test('listRuns(): action=viewed/resourceType=payroll_run/resourceId=null', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.listRuns(ctx(tx));
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'payroll_run'),
      isNull(auditLog.resourceId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('getRun(): resourceId=run.id, summa yo‘q', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.getRun(ctx(tx), runId);
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'payroll_run'),
      eq(auditLog.resourceId, runId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.after).toBeNull();
  });
});
