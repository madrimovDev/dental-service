/**
 * CLI-463 — emergency contact isPrimary eksklyuzivligi (REAL DB).
 *
 * `addEmergencyContact` bir nechta contact'ni bir vaqtda `isPrimary=true` qilishga
 * ruxsat berardi — demote logikasi yo'q edi (`listEmergencyContacts` `isPrimary DESC`
 * bo'yicha tartiblaydi, bitta-primary semantikasini nazarda tutadi).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-463-emergency-contact-primary`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { patients, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createPatientsService } from '../../src/modules/patients/patients.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createPatientsService({ audit: noopAudit });

let tenantId: string;
let ownerId: string;
let patientId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantId
            : undefined,
  }) as unknown as Context;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900004630', passwordHash: 'x', fullName: 'Owner463' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Primary Clinic', slug: 'primary-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor463' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-463 — addEmergencyContact isPrimary eksklyuzivligi — real DB', () => {
  test('ikkinchi isPrimary=true qo`shilsa — birinchisi demote bo`ladi', async () => {
    const first = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.addEmergencyContact(ctx(tx), patientId, {
        name: 'Birinchi Primary',
        phone: '+998901112233',
        isPrimary: true,
      });
    });
    expect(first?.isPrimary).toBe(true);

    const second = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.addEmergencyContact(ctx(tx), patientId, {
        name: 'Ikkinchi Primary',
        phone: '+998904445566',
        isPrimary: true,
      });
    });
    expect(second?.isPrimary).toBe(true);

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.listEmergencyContacts(ctx(tx), patientId);
    });
    const primaries = rows.filter((r) => r.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]?.id).toBe(second?.id);
    const demotedFirst = rows.find((r) => r.id === first?.id);
    expect(demotedFirst?.isPrimary).toBe(false);
  });

  test('isPrimary=false/berilmagan qo`shilsa — mavjud primary o`zgarmaydi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.addEmergencyContact(ctx(tx), patientId, {
        name: 'Uchinchi Oddiy',
        phone: '+998907778899',
      });
    });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.listEmergencyContacts(ctx(tx), patientId);
    });
    const primaries = rows.filter((r) => r.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]?.name).toBe('Ikkinchi Primary');
  });
});
