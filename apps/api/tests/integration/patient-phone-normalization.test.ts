/**
 * Bemor telefoni kanonikligi (Task 8 + Task 9) — REAL DB integration test.
 *
 * Nima uchun: `patients.phone` xom kiritilgan shaklda saqlanardi (`901234567`,
 * `+998 90 123 45 67`), `users.phone` esa 0043 dan keyin kanonik. Telegram
 * bemor linking va telefon qidiruvi shu tufayli jimgina topolmasdi.
 *
 * Service-darajasida (`@owner` perms bilan) — permission kodini bu fayl
 * sinamaydi. `patient-emergency-contacts.test.ts` ning ctx/tx naqshi.
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration 0044 apply.
 * Ishga tushirish:
 *   cd apps/api && bun test --env-file=../../.env patient-phone-normalization
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

/** Tenant-scoped tranzaksiya (RLS `SET LOCAL`) ichida service chaqiruvi. */
const inTenantTx = <T>(fn: (c: Context) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx));
  });

const readPatient = (id: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [row] = await tx.select().from(patients).where(eq(patients.id, id));
    return row;
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000044', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Phone Clinic', slug: 'phone-clinic', ownerUserId: owner.id })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('bemor telefoni kanonikligi — yozish (Task 8)', () => {
  test('9 xonali kiritma kanonik shaklda saqlanadi', async () => {
    const patient = await inTenantTx((c) =>
      service.create(c, { fullName: 'Test Bemor', phone: '901234567' }),
    );

    const row = await readPatient(patient.id);
    expect(row?.phone).toBe('+998901234567');
  });

  test('formatlangan kiritma tozalanadi', async () => {
    const patient = await inTenantTx((c) =>
      service.create(c, { fullName: 'Test Bemor 2', phone: '+998 (90) 123-45-67' }),
    );

    const row = await readPatient(patient.id);
    expect(row?.phone).toBe('+998901234567');
  });

  test("telefonsiz bemor NULL qoladi ('+' EMAS)", async () => {
    const patient = await inTenantTx((c) => service.create(c, { fullName: 'Telefonsiz Bemor' }));

    const row = await readPatient(patient.id);
    expect(row?.phone).toBeNull();
  });

  test('ikkilamchi telefon ham normallashtiriladi', async () => {
    const patient = await inTenantTx((c) =>
      service.create(c, {
        fullName: 'Test Bemor 3',
        phone: '901234567',
        phoneSecondary: '911112233',
      }),
    );

    const row = await readPatient(patient.id);
    expect(row?.phoneSecondary).toBe('+998911112233');
  });

  test('update ham normallashtiradi', async () => {
    const patient = await inTenantTx((c) => service.create(c, { fullName: 'Test Bemor 4' }));
    await inTenantTx((c) => service.update(c, patient.id, { phone: '901234567' }));

    const row = await readPatient(patient.id);
    expect(row?.phone).toBe('+998901234567');
  });

  test('update null bilan tozalash saqlanadi (CLI-455 regressiya)', async () => {
    const patient = await inTenantTx((c) =>
      service.create(c, { fullName: 'Test Bemor 4b', phone: '901234567' }),
    );
    await inTenantTx((c) => service.update(c, patient.id, { phone: null }));

    const row = await readPatient(patient.id);
    expect(row?.phone).toBeNull();
  });

  test('favqulodda kontakt telefoni normallashtiriladi', async () => {
    const patient = await inTenantTx((c) => service.create(c, { fullName: 'Test Bemor 5' }));
    const contact = await inTenantTx((c) =>
      service.addEmergencyContact(c, patient.id, { name: 'Qarindosh', phone: '901234567' }),
    );

    expect(contact?.phone).toBe('+998901234567');
  });
});

describe('bemor telefoni kanonikligi — qidiruv (Task 9)', () => {
  beforeAll(async () => {
    await inTenantTx((c) => service.create(c, { fullName: 'Qidiruv Bemori', phone: '901234567' }));
  });

  const listSearch = (search: string) =>
    inTenantTx((c) => service.list(c, { page: 1, pageSize: 50, archived: false, search }));

  test('9 xonali qidiruv kanonik saqlangan bemorni topadi', async () => {
    const result = await listSearch('901234567');
    expect(result.data.some((p) => p.fullName === 'Qidiruv Bemori')).toBe(true);
  });

  test('formatlangan qidiruv ham topadi', async () => {
    const result = await listSearch('+998 90 123 45 67');
    expect(result.data.some((p) => p.fullName === 'Qidiruv Bemori')).toBe(true);
  });

  test("ism bo'yicha qidiruv buzilmagan (regressiya)", async () => {
    const result = await listSearch('Qidiruv');
    expect(result.data.some((p) => p.fullName === 'Qidiruv Bemori')).toBe(true);
  });

  test('qisman raqam qidiruvi xom shox orqali ishlaydi (regressiya)', async () => {
    const result = await listSearch('9012');
    expect(result.data.some((p) => p.fullName === 'Qidiruv Bemori')).toBe(true);
  });
});
