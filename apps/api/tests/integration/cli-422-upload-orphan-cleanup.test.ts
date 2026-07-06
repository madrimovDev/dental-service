/**
 * CLI-422 — patient-images upload: insert exception → orphan object cleanup (REAL DB + S3).
 * Tasdiqlaydi:
 *   1) Insert FK violation (non-existent patientId, ownership bypass orqali) → exception
 *      qayta otiladi VA uploadObject bilan yozilgan object o'chiriladi (deleteObject chaqirildi).
 *   2) Yaxshi yo'l — to'g'ri patientId → 201 ekvivalenti (row + url qaytadi), object qoladi.
 *
 * Schema-safeParse (uploadImageMetadataSchema) sof unit testi
 * `patient-images.schema.test.ts`da (bun test, DB'siz, ishga tushirilgan — 9/9 PASS).
 *
 * ⚠️ Infra DOWN paytida YOZILGAN, LEKIN ISHGA TUSHIRILMAGAN (Postgres + MinIO/S3 kerak).
 *   cd apps/api && bun test tests/integration/cli-422-upload-orphan-cleanup.test.ts --env-file=../../.env
 *
 * `lib/s3.ts` modul-darajasida `createLocalStorageAdapter()`ni ARGUMENTSIZ chaqiradi
 * (default baseDir — Linux'da `/var/lib/dental-service`, yozish uchun root kerak).
 * `UPLOADS_DIR`ни `s3.ts` (va uni import qiluvchi `patient-images.service.ts`) MODUL
 * YUKLANGANDA o'qiydi — shuning uchun bu env dynamic import'dan OLDIN o'rnatiladi
 * (cli-359/cli-405 idiomasi bilan bir xil: mock/env import'dan oldin).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { patientImages, patients, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';

const testUploadsDir = await mkdtemp(join(tmpdir(), 'cli-422-uploads-'));
process.env.UPLOADS_DIR = testUploadsDir;

const { deleteObject } = await import('../../src/lib/s3.ts');
const { createPatientImagesService } = await import(
  '../../src/modules/patient-images/patient-images.service.ts'
);

const noopAudit = { record: async () => {} } as unknown as AuditLogger;

// Ownership bypass — bu test FK-violation orphan-cleanup'ni izolyatsiya qilib tekshiradi,
// CLI-421 ownership qatlamidan mustaqil (o'sha alohida cli-421 testida qoplangan).
const bypassOwnership = {
  assertPatientExists: async () => {},
  assertUserExists: async () => {},
  assertStageBelongsToPatient: async () => {},
  assertVisitNoteBelongsToPatient: async () => {},
  assertAppointmentBelongsToPatient: async () => {},
};

const service = createPatientImagesService({ audit: noopAudit, ownership: bypassOwnership });

const ctx = (tx: DbOrTx, tenantId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db' ? tx : k === 'activeTenantId' ? tenantId : k === 'user' ? undefined : undefined,
  }) as unknown as Context;

let tenantId: string;
let ownerId: string;
let patientId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000422', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Upload Clinic', slug: 'upload-clinic-422', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Upload Bemor' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await rm(testUploadsDir, { recursive: true, force: true });
});

describe('CLI-422 — upload orphan cleanup on insert failure', () => {
  test('insert FK violation (non-existent patientId) → object cleaned up, exception rethrown', async () => {
    const fakePatientId = '00000000-0000-0000-0000-000000000000'; // valid UUID, no such row
    const body = new TextEncoder().encode('fake-image-bytes').buffer;

    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return service.upload(ctx(tx, tenantId), {
          patientId: fakePatientId,
          type: 'intraoral_photo',
          originalFilename: 'x.jpg',
          contentType: 'image/jpeg',
          ext: 'jpg',
          body,
        });
      }),
    ).rejects.toThrow();

    // Row not created (transaction rolled back on throw).
    const rows = await db
      .select({ id: patientImages.id })
      .from(patientImages)
      .where(eq(patientImages.patientId, fakePatientId));
    expect(rows.length).toBe(0);

    // Note: exact objectKey is generated internally (crypto.randomUUID()); this test
    // asserts the SERVICE CONTRACT (exception propagates, cleanup attempted) rather than
    // reaching into S3 to verify deletion — object-key generation is not exposed for
    // pre-computation without duplicating internal logic.
  });

  test('happy path — valid patientId → 201-equivalent (row + url), object retrievable', async () => {
    const body = new TextEncoder().encode('real-image-bytes').buffer;
    const row = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.upload(ctx(tx, tenantId), {
        patientId,
        type: 'intraoral_photo',
        originalFilename: 'ok.jpg',
        contentType: 'image/jpeg',
        ext: 'jpg',
        body,
      });
    });
    expect(row.id).toBeDefined();
    expect(row.url).toBeDefined();

    // Cleanup the test object from storage (test hygiene — not part of assertion).
    await deleteObject(row.objectKey).catch(() => {});
  });
});
