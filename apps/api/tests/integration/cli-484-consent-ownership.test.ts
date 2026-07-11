/**
 * CLI-484 — consent.service.ts signForm() cross-entity ownership tekshiruvi (REAL DB).
 * Ilgari `signForm` `input.patientId`/`input.templateId`ni hech qanday ownership
 * tekshiruvisiz insert qilardi — FK constraint RLS'ni chetlab o'tgani uchun
 * cross-tenant yoki mavjud bo'lmagan UUID xom 500 (yoki noto'g'ri template'ga
 * bog'langan forma) bilan tugardi. Endi prescriptions.create patterni: patientId
 * `assertPatientExists`, templateId (berilsa) RLS-scoped select — ikkalasi ham
 * CrossEntityError → routes 400.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-484-consent-ownership`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { consentTemplates, patients, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { CrossEntityError } from '../../src/lib/ownership.ts';
import { createConsentService } from '../../src/modules/consent/consent.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createConsentService({ audit: noopAudit });

let tenantAId: string;
let ownerAId: string;
let patientAId: string;
let templateAId: string;

let tenantBId: string;
let templateBId: string; // belongs to tenant B (cross-tenant)

const ctx = (tx: DbOrTx, tenantId: string, userId: string): Context =>
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

const NON_EXISTENT_ID = '00000000-0000-0000-0000-000000000000';

const validInput = (patientId: string, templateId?: string) => ({
  patientId,
  templateId,
  type: 'treatment' as const,
  title: 'Davolash uchun rozilik',
  bodyText: 'Men davolashga roziман (test matni).',
  language: 'uz' as const,
  isPerpetual: true,
});

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [ownerA] = await db
    .insert(users)
    .values({ phone: '+998900004841', passwordHash: 'x', fullName: 'OwnerA484' })
    .returning({ id: users.id });
  const [ownerB] = await db
    .insert(users)
    .values({ phone: '+998900004842', passwordHash: 'x', fullName: 'OwnerB484' })
    .returning({ id: users.id });
  if (!ownerA || !ownerB) throw new Error('owner insert failed');
  ownerAId = ownerA.id;

  const [tenantA] = await db
    .insert(tenants)
    .values({ name: 'Consent Clinic A', slug: 'consent-clinic-a-484', ownerUserId: ownerAId })
    .returning({ id: tenants.id });
  const [tenantB] = await db
    .insert(tenants)
    .values({ name: 'Consent Clinic B', slug: 'consent-clinic-b-484', ownerUserId: ownerB.id })
    .returning({ id: tenants.id });
  if (!tenantA || !tenantB) throw new Error('tenant insert failed');
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId: tenantAId, fullName: 'Bemor A (Consent)' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientAId = p.id;

    const [tplA] = await tx
      .insert(consentTemplates)
      .values({ tenantId: tenantAId, type: 'treatment', title: 'Shablon A', bodyUz: 'A matni...' })
      .returning({ id: consentTemplates.id });
    if (!tplA) throw new Error('template A insert failed');
    templateAId = tplA.id;
  });

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantBId}'`));
    const [tplB] = await tx
      .insert(consentTemplates)
      .values({ tenantId: tenantBId, type: 'treatment', title: 'Shablon B', bodyUz: 'B matni...' })
      .returning({ id: consentTemplates.id });
    if (!tplB) throw new Error('template B insert failed');
    templateBId = tplB.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-484 — consent signForm() ownership — real DB', () => {
  test("patientId mavjud bo'lmagan UUID → CrossEntityError(not_found)", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
        return service.signForm(ctx(tx, tenantAId, ownerAId), validInput(NON_EXISTENT_ID));
      }),
    ).rejects.toThrow(CrossEntityError);
  });

  test('templateId cross-tenant (tenant B shabloni) → CrossEntityError(not_found)', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
        return service.signForm(ctx(tx, tenantAId, ownerAId), validInput(patientAId, templateBId));
      }),
    ).rejects.toThrow(CrossEntityError);
  });

  test("valid patient + o'z tenant shabloni → muvaffaqiyatli (regressiya)", async () => {
    const row = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      return service.signForm(ctx(tx, tenantAId, ownerAId), validInput(patientAId, templateAId));
    });
    expect(row?.patientId).toBe(patientAId);
    expect(row?.templateId).toBe(templateAId);
  });

  test("valid patient + templateId'siz → muvaffaqiyatli (regressiya)", async () => {
    const row = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
      return service.signForm(ctx(tx, tenantAId, ownerAId), validInput(patientAId));
    });
    expect(row?.patientId).toBe(patientAId);
    expect(row?.templateId).toBeNull();
  });
});
