/**
 * CLI-364 — consent.service.ts o'qish funksiyalari (listTemplates/getTemplate/listForms)
 * audit_log'ga 'viewed' yozuvi qo'shishini tasdiqlaydi. REAL DB + real audit logger.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-364-consent`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  auditLog,
  consentForms,
  consentTemplates,
  patients,
  tenants,
  users,
} from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createConsentService } from '../../src/modules/consent/consent.service.ts';

const audit = createAuditLogger({ db });
const service = createConsentService({ audit });

let tenantId: string;
let userId: string;
let patientId: string;
let templateId: string;

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
    .values({ phone: '+998900000070', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Consent Clinic', slug: 'consent-clinic', ownerUserId: userId })
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

    const [template] = await tx
      .insert(consentTemplates)
      .values({ tenantId, type: 'treatment', title: 'Shablon', bodyUz: 'matn' })
      .returning({ id: consentTemplates.id });
    if (!template) throw new Error('template insert failed');
    templateId = template.id;

    await tx.insert(consentForms).values({
      tenantId,
      patientId,
      type: 'treatment',
      title: 'Imzo',
      bodyText: 'matn',
      language: 'uz',
      signedByUserId: userId,
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Consent — o‘qish audit (CLI-364)', () => {
  test('listTemplates(): audit_log’da action=viewed/resourceType=consent_template', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.listTemplates(ctx(tx));
    });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, 'viewed'), eq(auditLog.resourceType, 'consent_template')));
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('getTemplate(): topilgan shablon uchun resourceId=template.id', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.getTemplate(ctx(tx), templateId);
    });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'viewed'),
            eq(auditLog.resourceType, 'consent_template'),
            eq(auditLog.resourceId, templateId),
          ),
        );
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('listForms(): audit_log’da resourceType=consent_form/resourceId=patientId', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.listForms(ctx(tx), patientId);
    });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'viewed'),
            eq(auditLog.resourceType, 'consent_form'),
            eq(auditLog.resourceId, patientId),
          ),
        );
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
