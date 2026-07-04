/**
 * CLI-363 — tooth-charts.service.ts o'qish funksiyalari (list/getLatest) audit_log'ga
 * 'viewed' yozuvi qo'shishini tasdiqlaydi (CLAUDE.md §3.10). REAL DB + real audit logger.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-363-tooth-charts`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, patients, tenants, toothCharts, users } from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createToothChartsService } from '../../src/modules/clinical/tooth-charts/tooth-charts.service.ts';

const audit = createAuditLogger({ db });
const service = createToothChartsService({ audit });

let tenantId: string;
let userId: string;
let patientId: string;
let chartId: string;

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
    .values({ phone: '+998900000060', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Tooth Clinic', slug: 'tooth-clinic', ownerUserId: userId })
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

    const [chart] = await tx
      .insert(toothCharts)
      .values({ tenantId, patientId, isPrimaryDentition: false })
      .returning({ id: toothCharts.id });
    if (!chart) throw new Error('chart insert failed');
    chartId = chart.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

// `db` (top-level) — DATABASE_URL non-superuser role, `audit_log` FORCE RLS'ga
// ega (0001_enable_rls.sql). SELECT policy `tenant_id = current_setting(...)`ni
// tekshiradi — SET LOCAL'siz plain `db.select()` har doim 0 qator qaytaradi.
// Shuning uchun tasdiqlash ham tx ichida SET LOCAL bilan bajariladi.
const selectAuditRows = (...conds: Parameters<typeof and>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return tx
      .select()
      .from(auditLog)
      .where(and(...conds));
  });

describe('Tooth charts — o‘qish audit (CLI-363)', () => {
  test('list(): chaqirilganda audit_log’da action=viewed yozuvi paydo bo‘ladi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.list(ctx(tx), patientId);
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'tooth_chart'),
      eq(auditLog.resourceId, patientId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('getLatest(): topilgan snapshot uchun audit_log’da resourceId=chart.id yozuvi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.getLatest(ctx(tx), patientId);
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'tooth_chart'),
      eq(auditLog.resourceId, chartId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
