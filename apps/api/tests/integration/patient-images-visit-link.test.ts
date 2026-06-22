/**
 * V2-6 (Rasmni vizitga bog'lash, CLI-246) — patient_images.visit_note_id filtri.
 * service.list(patientId) barcha rasmlarni, list(patientId, visitNoteId) faqat
 * shu vizitga bog'langanlarni qaytaradi. REAL DB (RLS).
 *
 * Talab: Postgres + S3 env (presign offline). Migration 0023 apply.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env patient-images-visit-link`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { patientImages, patients, tenants, users, visitNotes } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createPatientImagesService } from '../../src/modules/patient-images/patient-images.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createPatientImagesService({ audit: noopAudit });

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

let patientId: string;
let visitNoteId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000022', passwordHash: 'fake', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Image Clinic', slug: 'image-clinic', ownerUserId: owner.id })
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

    const [vn] = await tx
      .insert(visitNotes)
      .values({ tenantId, patientId, doctorId: owner.id })
      .returning({ id: visitNotes.id });
    if (!vn) throw new Error('visit note insert failed');
    visitNoteId = vn.id;

    // Bog'langan rasm + bog'lanmagan rasm
    await tx.insert(patientImages).values([
      {
        tenantId,
        patientId,
        type: 'intraoral_photo',
        objectKey: 'k/linked.jpg',
        originalFilename: 'linked.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 100,
        visitNoteId,
      },
      {
        tenantId,
        patientId,
        type: 'intraoral_photo',
        objectKey: 'k/unlinked.jpg',
        originalFilename: 'unlinked.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 100,
      },
    ]);
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Patient images — visit link filtri', () => {
  test('list(patientId): barcha rasmlar (2)', async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.list(ctx(tx), patientId);
    });
    expect(rows).toHaveLength(2);
  });

  test('list(patientId, visitNoteId): faqat bog‘langan (1)', async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.list(ctx(tx), patientId, visitNoteId);
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.visitNoteId).toBe(visitNoteId);
    expect(rows[0]?.originalFilename).toBe('linked.jpg');
  });
});
