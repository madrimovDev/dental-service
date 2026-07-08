/**
 * Erkin emergency contact (V2-5, CLI-245) integration test — listEmergencyContacts/
 * addEmergencyContact/removeEmergencyContact ni REAL DB'da (service-darajasida,
 * `@owner` bilan — permission kodini bu fayl sinamaydi). isPrimary ordering +
 * cross-tenant RLS izolyatsiya tekshiriladi.
 *
 * ⚠️ CLI-474 (L1): avval bu izohda "relatives `patient.edit`ni mirror qiladi —
 * yangi RBAC gap yo'q" deyilgan edi — bu qasddan og'ish emas, haqiqiy gap edi
 * (Nurse/Technician/Accountant `patient.view`ga ega, `patient.edit`ga EGA EMAS,
 * ro'yxatni ko'ra olmasdi). Tuzatildi: `patients.routes.ts` LIST (GET) route'lari
 * endi `patient.view` bilan gate qilingan, faqat WRITE (POST/DELETE) `patient.edit`
 * talab qiladi — real HTTP + rol-permset tasdig'i uchun
 * `cli-474-l1-relatives-view-permission.test.ts`ga qarang.
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration 0022 + RLS 0014 apply.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env patient-emergency-contacts`
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
let otherTenantId: string;
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

let ownerId: string;
let patientId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000021', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Emergency Clinic', slug: 'emergency-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  const [other] = await db
    .insert(tenants)
    .values({ name: 'Other Clinic', slug: 'other-clinic-ec', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant || !other) throw new Error('tenant insert failed');
  tenantId = tenant.id;
  otherTenantId = other.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Emergency contacts — real DB', () => {
  let primaryId: string;

  test('addEmergencyContact: erkin kontakt yaratadi', async () => {
    const contact = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.addEmergencyContact(ctx(tx), patientId, {
        name: 'Ali Valiyev',
        phone: '+998901112233',
        relationship: 'aka',
      });
    });
    expect(contact).not.toBeNull();
    expect(contact?.patientId).toBe(patientId);
    expect(contact?.name).toBe('Ali Valiyev');
    expect(contact?.isPrimary).toBe(false);
    expect(contact?.tenantId).toBe(tenantId);
  });

  test('addEmergencyContact: isPrimary kontakt', async () => {
    const contact = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.addEmergencyContact(ctx(tx), patientId, {
        name: 'Lola Karimova',
        phone: '+998907778899',
        isPrimary: true,
      });
    });
    expect(contact?.isPrimary).toBe(true);
    primaryId = contact?.id as string;
  });

  test('listEmergencyContacts: isPrimary avval keladi', async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.listEmergencyContacts(ctx(tx), patientId);
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe(primaryId);
    expect(rows[0]?.isPrimary).toBe(true);
  });

  test('cross-tenant: boshqa tenant bemorining kontaktlari ko‘rinmaydi (RLS)', async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${otherTenantId}'`));
      return service.listEmergencyContacts(ctx(tx, otherTenantId), patientId);
    });
    expect(rows).toHaveLength(0);
  });

  test('removeEmergencyContact: o‘chiradi', async () => {
    const removed = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.removeEmergencyContact(ctx(tx), patientId, primaryId);
    });
    expect(removed?.id).toBe(primaryId);

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.listEmergencyContacts(ctx(tx), patientId);
    });
    expect(rows).toHaveLength(1);
  });

  test('removeEmergencyContact: mavjud bo‘lmagan → null', async () => {
    const removed = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.removeEmergencyContact(ctx(tx), patientId, primaryId);
    });
    expect(removed).toBeNull();
  });
});
