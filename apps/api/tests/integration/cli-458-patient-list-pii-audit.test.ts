/**
 * CLI-458 — bulk patient list PII exposure ni audit qilish (REAL DB).
 *
 * `findById` PII ko'rilganda `action:'viewed_pii'` audit yozadi, lekin `list()`
 * xuddi shu `userHasPiiAccess(c)` shartini hisoblab (unmask) PII qaytarsa ham
 * hech qanday audit yozuv yaratmasdi — CLAUDE.md §3.10 buzilishi (bulk PII o'qish
 * kuzatilmagan).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-458-patient-list-pii`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, patients, tenants, users } from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createPatientsService } from '../../src/modules/patients/patients.service.ts';

const audit = createAuditLogger({ db });
const service = createPatientsService({ audit });

let tenantId: string;
let ownerId: string;

const ctx = (tx: DbOrTx, perms: string[]): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: ownerId }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000458', passwordHash: 'x', fullName: 'Owner458' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'List PII Clinic', slug: 'list-pii-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.insert(patients).values([
      { tenantId, fullName: 'Bemor Bir', phone: '+998901112233' },
      { tenantId, fullName: 'Bemor Ikki', phone: '+998904445566' },
    ]);
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const auditRows = (tx: DbOrTx) =>
  tx
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.action, 'viewed_pii'), eq(auditLog.resourceType, 'patient')));

describe('CLI-458 — list() PII audit — real DB', () => {
  test('patient.view_pii permset bilan list() → viewed_pii audit yoziladi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.list(ctx(tx, ['patient.view', 'patient.view_pii']), {
        page: 1,
        pageSize: 20,
        archived: false,
      });
    });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return auditRows(tx);
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.resourceId).toBeNull();
    const after = rows[0]?.after as { count?: number; patientIds?: string[] } | null;
    expect(after?.count).toBe(2);
    expect(after?.patientIds).toHaveLength(2);
  });

  test('patient.view_pii YO`Q bo`lsa (maskланган) → audit yozilmaydi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.list(ctx(tx, ['patient.view']), { page: 1, pageSize: 20, archived: false });
    });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return auditRows(tx);
    });
    // Faqat oldingi testdagi 1 ta yozuv — bu chaqiruv yangi audit qo'shmadi
    expect(rows.length).toBe(1);
  });
});
