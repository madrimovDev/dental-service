/**
 * CLI-364 — patient-images.service.ts o'qish funksiyalari (list/get) audit_log'ga
 * 'viewed' yozuvi qo'shishini tasdiqlaydi (url/objectKey audit'ga kirmaydi).
 * REAL DB + real audit logger.
 *
 * Talab: Postgres + S3 env (presign offline, patient-images-visit-link.test.ts bilan bir xil).
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-364-patient-images`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, patientImages, patients, tenants, users } from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createPatientImagesService } from '../../src/modules/patient-images/patient-images.service.ts';

const audit = createAuditLogger({ db });
const service = createPatientImagesService({ audit });

let tenantId: string;
let userId: string;
let patientId: string;
let imageId: string;

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
    .values({ phone: '+998900000073', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Image Clinic 2', slug: 'image-clinic-2', ownerUserId: userId })
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

    const [img] = await tx
      .insert(patientImages)
      .values({
        tenantId,
        patientId,
        type: 'intraoral_photo',
        objectKey: 'k/secret.jpg',
        originalFilename: 'secret.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 100,
      })
      .returning({ id: patientImages.id });
    if (!img) throw new Error('image insert failed');
    imageId = img.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Patient images — o‘qish audit (CLI-364)', () => {
  test('list(): audit_log’da action=viewed/resourceType=patient_image, url/objectKey YO‘Q', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.list(ctx(tx), patientId);
    });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'viewed'),
            eq(auditLog.resourceType, 'patient_image'),
            eq(auditLog.resourceId, patientId),
          ),
        );
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const serialized = JSON.stringify(rows[0]?.after ?? {});
    expect(serialized).not.toContain('secret.jpg');
    expect(serialized).not.toContain('k/secret.jpg');
  });

  test('get(): topilgan rasm uchun resourceId=image.id, tarkib audit’ga kirmaydi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.get(ctx(tx), imageId);
    });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'viewed'),
            eq(auditLog.resourceType, 'patient_image'),
            eq(auditLog.resourceId, imageId),
          ),
        );
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.after).toBeNull();
  });
});
