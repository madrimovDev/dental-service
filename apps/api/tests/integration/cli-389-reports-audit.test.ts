/**
 * CLI-389 — reports.service.ts o'qish funksiyalari audit_log'ga 'viewed'/'exported'
 * yozuvi qo'shishini tasdiqlaydi. REAL DB + real audit logger.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-389-reports`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, branches, cashierTransactions, tenants, users } from '@dental/db-schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createReportsService } from '../../src/modules/reports/reports.service.ts';

const audit = createAuditLogger({ db });
const service = createReportsService({ audit });

let tenantId: string;
let userId: string;
let branchId: string;

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
    .values({ phone: '+998900000389', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Reports Clinic', slug: 'reports-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Reports Branch' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');
    branchId = branch.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Reports — o‘qish audit (CLI-389)', () => {
  test('revenue(): audit_log’da action=viewed/resourceType=report/resourceId=null/after.report=revenue', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.revenue(ctx(tx), { from: '2026-01-01', to: '2026-01-31' });
    });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'viewed'),
            eq(auditLog.resourceType, 'report'),
            isNull(auditLog.resourceId),
          ),
        );
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const after = rows[rows.length - 1]?.after as { report?: string } | null;
    expect(after?.report).toBe('revenue');
  });

  test('oneCExport(): action=exported, after.report=1c_export, after.rowCount=natija uzunligi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const [row] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId,
          branchId,
          type: 'payment',
          status: 'completed',
          paymentMethod: 'cash',
          totalAmount: '100000',
          paidAmount: '100000',
        })
        .returning({ id: cashierTransactions.id });
      if (!row) throw new Error('tx insert failed');
    });

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const rows = await service.oneCExport(ctx(tx), { from: '2026-01-01', to: '2026-12-31' });
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    const auditRows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'exported'),
            eq(auditLog.resourceType, 'report'),
            isNull(auditLog.resourceId),
          ),
        );
    });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    const after = auditRows[auditRows.length - 1]?.after as {
      report?: string;
      rowCount?: number;
    } | null;
    expect(after?.report).toBe('1c_export');
    expect(after?.rowCount).toBeGreaterThanOrEqual(1);
    // §4 — natija tarkibi (patientName/amount/receiptNumber) after'da bo'lmasligi kerak.
    expect(JSON.stringify(after)).not.toContain('patientName');
    expect(JSON.stringify(after)).not.toContain('receiptNumber');
  });

  test('appointmentStats(): after.report=appointment_stats', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.appointmentStats(ctx(tx), { from: '2026-01-01', to: '2026-01-31' });
    });
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, 'viewed'), eq(auditLog.resourceType, 'report')));
    });
    const match = rows.find(
      (r) => (r.after as { report?: string })?.report === 'appointment_stats',
    );
    expect(match).toBeTruthy();
  });

  test('doctorWorkload(): after.report=doctor_workload, after.rowCount is a number', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.doctorWorkload(ctx(tx), { from: '2026-01-01', to: '2026-01-31' });
    });
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, 'viewed'), eq(auditLog.resourceType, 'report')));
    });
    const match = rows.find((r) => (r.after as { report?: string })?.report === 'doctor_workload');
    expect(match).toBeTruthy();
    expect(typeof (match?.after as { rowCount?: number })?.rowCount).toBe('number');
  });

  test('planCompletion(): after.report=plan_completion, no branchId key (tenant-wide by-design)', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.planCompletion(ctx(tx), { from: '2026-01-01', to: '2026-01-31' });
    });
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, 'viewed'), eq(auditLog.resourceType, 'report')));
    });
    const match = rows.find((r) => (r.after as { report?: string })?.report === 'plan_completion');
    expect(match).toBeTruthy();
  });

  test('dentalAnalytics(): after.report=dental_analytics', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.dentalAnalytics(ctx(tx), { from: '2026-01-01', to: '2026-01-31' });
    });
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, 'viewed'), eq(auditLog.resourceType, 'report')));
    });
    const match = rows.find((r) => (r.after as { report?: string })?.report === 'dental_analytics');
    expect(match).toBeTruthy();
  });
});
