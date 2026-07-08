/**
 * CLI-455 — patients.service.ts `update()` PATCH semantikasi (REAL DB).
 *
 * Muammo: `.set({ ...input })` — kalit yo'q bo'lsa ham, `undefined` qiymat bilan
 * ustunga tegilmaydi (drizzle bu holatda to'g'ri ishlaydi), LEKIN eski schema
 * `.nullable()` bo'lmagani uchun `null` yuborib maydonni TOZALASH imkonsiz edi.
 * Endi: `input.field === null` → ustun NULL bo'ladi; kalit umuman yo'q
 * (`undefined`) → ustunga tegilmaydi (no-op).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-455-patient-update`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { patients, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createPatientsService } from '../../src/modules/patients/patients.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createPatientsService({ audit: noopAudit });

let tenantId: string;
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

let ownerId: string;
let patientId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000455', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Update Clinic', slug: 'update-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({
        tenantId,
        fullName: 'Bemor CLI455',
        phone: '+998901112233',
        address: 'Toshkent, Chilonzor',
        notes: 'Boshlangʻich eslatma',
        dateOfBirth: '1990-05-15',
      })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-455 — update() patch semantikasi — real DB', () => {
  test('phone: null yuborilsa — ustun NULL boʻladi (clear)', async () => {
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.update(ctx(tx), patientId, { phone: null });
    });
    expect(updated?.phone).toBeNull();
    // Boshqa maydonlarga tegilmagan
    expect(updated?.address).toBe('Toshkent, Chilonzor');
  });

  test("bo'sh patch ({}) — hech narsa o'zgarmaydi (no-op)", async () => {
    const before = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const [row] = await tx.select().from(patients).where(eq(patients.id, patientId));
      return row;
    });

    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.update(ctx(tx), patientId, {});
    });

    expect(updated?.address).toBe(before?.address);
    expect(updated?.notes).toBe(before?.notes);
    expect(updated?.dateOfBirth).toBe(before?.dateOfBirth);
    // phone was cleared in the previous test — no-op patch keeps it null
    expect(updated?.phone).toBeNull();
  });

  test('faqat address yuborilsa — faqat address oʻzgaradi, notes saqlanadi', async () => {
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.update(ctx(tx), patientId, { address: 'Yangi manzil' });
    });
    expect(updated?.address).toBe('Yangi manzil');
    expect(updated?.notes).toBe('Boshlangʻich eslatma');
  });

  test('dateOfBirth: null yuborilsa — ustun NULL boʻladi', async () => {
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.update(ctx(tx), patientId, { dateOfBirth: null });
    });
    expect(updated?.dateOfBirth).toBeNull();
  });
});
