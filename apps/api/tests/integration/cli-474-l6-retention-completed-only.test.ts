/**
 * CLI-474 (L6) — retention faqat HAQIQATDA kelgan (`completed`) vizitlarni "bemor
 * qaytdi" deb sanaydi. Ilgari status filtri yo'q edi — cancelled/no_show/scheduled
 * appointment ham retention'ni sun'iy oshirardi. REAL DB.
 *
 * Ishga tushirish: `cd apps/api && bun test tests/integration/cli-474-l6-retention-completed-only.test.ts --env-file=../../.env`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { appointments, branches, patients, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createReportsService } from '../../src/modules/reports/reports.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createReportsService({ audit: noopAudit });
let tenantId: string;
let ownerId: string;
let branchId: string;

const ctx = (tx: DbOrTx): Context =>
  ({ get: (k: string) => (k === 'db' ? tx : undefined) }) as unknown as Context;

const RANGE = { from: '2026-03-01', to: '2026-03-31' };

const run = <T>(fn: (c: Context) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx));
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000474', passwordHash: 'x', fullName: 'Doc L6' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'L6', slug: 'l6-retention', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'B' })
      .returning({ id: branches.id });
    branchId = branch!.id;

    // 1 yangi bemor — oraliqda yaratilgan.
    await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Yangi', createdAt: new Date('2026-03-15T10:00:00+05:00') });

    // 3 qaytgan bemor — oraliqdan OLDIN yaratilgan, oraliqda yozilgan, turli status.
    const returning = await tx
      .insert(patients)
      .values(
        (['Done', 'NoShow', 'Cancelled'] as const).map((tag) => ({
          tenantId,
          fullName: `Qaytgan ${tag}`,
          createdAt: new Date('2026-01-01T10:00:00+05:00'),
        })),
      )
      .returning({ id: patients.id });

    const statuses = ['completed', 'no_show', 'cancelled'] as const;
    await tx.insert(appointments).values(
      returning.map((p, i) => ({
        tenantId,
        branchId,
        patientId: p.id,
        doctorId: ownerId,
        startTime: new Date(`2026-03-1${i}T09:00:00+05:00`),
        endTime: new Date(`2026-03-1${i}T10:00:00+05:00`),
        status: statuses[i],
      })),
    );
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-474 L6 — retention faqat completed vizitlarni sanaydi', () => {
  test('3 qaytgan bemordan faqat completed vizitli 1 tasi sanaladi (no_show/cancelled chiqadi)', async () => {
    const r = await run((c) => service.dentalAnalytics(c, RANGE));
    expect(r.retention.newPatients).toBe(1);
    // Uch qaytgan bemordan faqat `completed` appointment'lisi qaytgan deb sanaladi.
    expect(r.retention.returningPatients).toBe(1);
    expect(r.retention.retentionRate).toBe(0.5);
  });
});
