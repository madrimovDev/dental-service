/**
 * CLI-421 — patients.service.ts cross-entity ownership tekshiruvlari (REAL DB).
 *
 * `addRelative`/`addEmergencyContact` FK constraint'ga tayanardi (cross-tenant yoki
 * mavjud bo'lmagan UUID → xom Postgres FK violation → 500), `ownership.ts`dagi
 * mavjud validatorlar (create()larda allaqachon ishlatiladigan) chaqirilmasdi.
 * Endi ikkalasi ham `assertPatientExists` orqali toza `CrossEntityError` (→ routes 400)
 * tashlaydi.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-421-patients-ownership`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { patients, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { CrossEntityError } from '../../src/lib/ownership.ts';
import { createPatientsService } from '../../src/modules/patients/patients.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createPatientsService({ audit: noopAudit });

let tenantId: string;
let otherTenantId: string;
let ownerId: string;
let patientAId: string;
let patientBId: string;
let otherTenantPatientId: string;

const ctx = (tx: DbOrTx, tid = tenantId): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tid
            : undefined,
  }) as unknown as Context;

const NON_EXISTENT_ID = '00000000-0000-0000-0000-000000000000';

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000421', passwordHash: 'fake', fullName: 'Owner421' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant, other] = await db
    .insert(tenants)
    .values([
      { name: 'Ownership Clinic', slug: 'ownership-clinic', ownerUserId: ownerId },
      { name: 'Other Ownership Clinic', slug: 'other-ownership-clinic', ownerUserId: ownerId },
    ])
    .returning({ id: tenants.id });
  if (!tenant || !other) throw new Error('tenant insert failed');
  tenantId = tenant.id;
  otherTenantId = other.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [a] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor A' })
      .returning({ id: patients.id });
    const [b] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor B' })
      .returning({ id: patients.id });
    if (!a || !b) throw new Error('patient insert failed');
    patientAId = a.id;
    patientBId = b.id;
  });

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${otherTenantId}'`));
    const [c] = await tx
      .insert(patients)
      .values({ tenantId: otherTenantId, fullName: 'Bemor C (other tenant)' })
      .returning({ id: patients.id });
    if (!c) throw new Error('patient insert failed');
    otherTenantPatientId = c.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-421 — addRelative ownership — real DB', () => {
  test("relativePatientId mavjud bo'lmagan UUID → CrossEntityError(not_found)", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return service.addRelative(ctx(tx), patientAId, {
          relativePatientId: NON_EXISTENT_ID,
          relationship: 'otasi',
        });
      }),
    ).rejects.toThrow(CrossEntityError);
  });

  test('relativePatientId boshqa tenant bemori → CrossEntityError(not_found, RLS-invisible)', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return service.addRelative(ctx(tx), patientAId, {
          relativePatientId: otherTenantPatientId,
          relationship: 'otasi',
        });
      }),
    ).rejects.toThrow(CrossEntityError);
  });

  test("URL patientId mavjud bo'lmasa ham → CrossEntityError(not_found)", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return service.addRelative(ctx(tx), NON_EXISTENT_ID, {
          relativePatientId: patientBId,
          relationship: 'otasi',
        });
      }),
    ).rejects.toThrow(CrossEntityError);
  });

  test('ikkala patientId ham haqiqiy — muvaffaqiyatli yaratiladi (regressiya)', async () => {
    const link = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.addRelative(ctx(tx), patientAId, {
        relativePatientId: patientBId,
        relationship: 'ukasi',
      });
    });
    expect(link).not.toBeNull();
    expect(link?.patientId).toBe(patientAId);
  });
});

describe('CLI-421 — addEmergencyContact ownership — real DB', () => {
  test("URL patientId mavjud bo'lmasa → CrossEntityError(not_found)", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return service.addEmergencyContact(ctx(tx), NON_EXISTENT_ID, {
          name: 'Ali Valiyev',
          phone: '+998901112233',
        });
      }),
    ).rejects.toThrow(CrossEntityError);
  });

  test('patientId haqiqiy — muvaffaqiyatli yaratiladi (regressiya)', async () => {
    const contact = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.addEmergencyContact(ctx(tx), patientAId, {
        name: 'Vali Aliyev',
        phone: '+998907778899',
      });
    });
    expect(contact).not.toBeNull();
    expect(contact?.patientId).toBe(patientAId);
  });
});
