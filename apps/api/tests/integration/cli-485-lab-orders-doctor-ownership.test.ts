/**
 * CLI-485 — lab-orders.service.ts create() doctorId cross-entity ownership (REAL DB).
 * `create()` allaqachon `assertPatientExists`ni ishlatardi, LEKIN `input.doctorId`
 * hech tekshirilmasdan insert qilinardi — FK RLS'ni chetlab o'tgani uchun
 * cross-tenant yoki mavjud bo'lmagan doctorId xom 500 (yoki boshqa tenant doktoriga
 * bog'langan buyurtma) bilan tugardi. Endi visit-notes/prescriptions patterni:
 * `assertUserExists(input.doctorId)` → CrossEntityError → routes 400.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-485-lab-orders-doctor-ownership`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { patients, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { CrossEntityError } from '../../src/lib/ownership.ts';
import { createLabOrdersService } from '../../src/modules/lab-orders/lab-orders.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createLabOrdersService({ audit: noopAudit });

let tenantAId: string;
let ownerAId: string; // owner of tenant A → implicit superuser (valid doctorId)
let patientAId: string;
let outsiderId: string; // platform user with NO assignment in tenant A

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantAId
            : k === 'user'
              ? { id: ownerAId }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

const NON_EXISTENT_ID = '00000000-0000-0000-0000-000000000000';

const validInput = (doctorId: string) => ({
  patientId: patientAId,
  doctorId,
  labName: 'Test Lab',
  orderType: 'crown' as const,
  items: [{ description: 'Zirconia crown' }],
});

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900004851', passwordHash: 'x', fullName: 'Owner485' })
    .returning({ id: users.id });
  const [outsider] = await db
    .insert(users)
    .values({ phone: '+998900004852', passwordHash: 'x', fullName: 'Outsider485' })
    .returning({ id: users.id });
  if (!owner || !outsider) throw new Error('user insert failed');
  ownerAId = owner.id;
  outsiderId = outsider.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Lab Clinic A', slug: 'lab-clinic-a-485', ownerUserId: ownerAId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantAId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId: tenantAId, fullName: 'Bemor A (Lab)' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientAId = p.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-485 — lab-orders create() doctorId ownership — real DB', () => {
  test("doctorId mavjud bo'lmagan UUID → CrossEntityError(not_found)", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
        return service.create(ctx(tx), validInput(NON_EXISTENT_ID));
      }),
    ).rejects.toThrow(CrossEntityError);
  });

  test("doctorId shu tenantda assignment'siz platform user → CrossEntityError(not_found)", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
        return service.create(ctx(tx), validInput(outsiderId));
      }),
    ).rejects.toThrow(CrossEntityError);
  });

  test('doctorId = tenant owner (implicit superuser) → muvaffaqiyatli (regressiya)', async () => {
    const row = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      return service.create(ctx(tx), validInput(ownerAId));
    });
    expect(row?.doctorId).toBe(ownerAId);
    expect(row?.patientId).toBe(patientAId);
  });
});
