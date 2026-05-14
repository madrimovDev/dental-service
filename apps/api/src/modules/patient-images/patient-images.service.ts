import { patientImages } from '@dental/db-schema';
import { desc, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Database } from '../../db/client.ts';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { deleteObject, patientImageKey, presignedGetUrl, uploadObject } from '../../lib/s3.ts';
import type { UpdateImageMetadataInput } from './patient-images.schema.ts';

export type UploadInput = {
  patientId: string;
  type:
    | 'xray_panoramic'
    | 'xray_periapical'
    | 'xray_bitewing'
    | 'xray_cbct'
    | 'intraoral_photo'
    | 'face_photo'
    | 'before_after'
    | 'other';
  title?: string;
  description?: string;
  toothNumbers?: number[];
  takenDate?: string;
  originalFilename: string;
  contentType: string;
  ext: string;
  body: ArrayBuffer;
};

export const createPatientImagesService = (deps: { audit: AuditLogger; db: Database }) => {
  async function list(c: Context, patientId: string) {
    const db = getDb(c);
    const rows = await db
      .select()
      .from(patientImages)
      .where(eq(patientImages.patientId, patientId))
      .orderBy(desc(patientImages.createdAt));

    // Sign URLs for client preview
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        url: await presignedGetUrl(row.objectKey),
      })),
    );
  }

  async function get(c: Context, id: string) {
    const db = getDb(c);
    const [row] = await db.select().from(patientImages).where(eq(patientImages.id, id));
    if (!row) return null;
    return { ...row, url: await presignedGetUrl(row.objectKey) };
  }

  async function upload(c: Context, input: UploadInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');

    // 1) Pre-generate ID + key
    const imageId = crypto.randomUUID();
    const objectKey = patientImageKey({
      tenantId,
      patientId: input.patientId,
      imageId,
      ext: input.ext,
    });

    // 2) Upload to MinIO first (if DB insert fails, we'll have orphan; rare, acceptable)
    await uploadObject({ key: objectKey, body: input.body, contentType: input.contentType });

    // 3) Insert DB row
    const [row] = await db
      .insert(patientImages)
      .values({
        id: imageId,
        tenantId,
        patientId: input.patientId,
        uploadedByUserId: user?.id ?? null,
        type: input.type,
        objectKey,
        originalFilename: input.originalFilename,
        contentType: input.contentType,
        sizeBytes: input.body.byteLength,
        title: input.title ?? null,
        description: input.description ?? null,
        toothNumbers: input.toothNumbers ?? null,
        takenDate: input.takenDate ? new Date(input.takenDate) : null,
      })
      .returning();

    if (!row) {
      // Cleanup orphan
      await deleteObject(objectKey).catch(() => {});
      throw new Error('Insert failed after upload');
    }

    await deps.audit.record(c, {
      action: 'uploaded',
      resourceType: 'patient_image',
      resourceId: row.id,
      after: {
        patientId: input.patientId,
        type: input.type,
        contentType: input.contentType,
        size: row.sizeBytes,
      },
    });

    return { ...row, url: await presignedGetUrl(row.objectKey) };
  }

  async function updateMetadata(c: Context, id: string, input: UpdateImageMetadataInput) {
    const db = getDb(c);
    const [before] = await db.select().from(patientImages).where(eq(patientImages.id, id));
    if (!before) return null;

    const patch: Record<string, unknown> = {};
    if (input.type) patch.type = input.type;
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.toothNumbers !== undefined) patch.toothNumbers = input.toothNumbers;
    if (input.takenDate !== undefined)
      patch.takenDate = input.takenDate ? new Date(input.takenDate) : null;

    const [row] = await db
      .update(patientImages)
      .set(patch)
      .where(eq(patientImages.id, id))
      .returning();

    if (row) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'patient_image',
        resourceId: id,
        before,
        after: row,
      });
    }
    return row ? { ...row, url: await presignedGetUrl(row.objectKey) } : null;
  }

  async function remove(c: Context, id: string) {
    const db = getDb(c);
    const [before] = await db.select().from(patientImages).where(eq(patientImages.id, id));
    if (!before) return null;

    await db.delete(patientImages).where(eq(patientImages.id, id));
    await deleteObject(before.objectKey).catch((err) =>
      // Log but don't fail — DB row already gone
      console.error('[patient-images] delete from S3 failed:', err),
    );

    await deps.audit.record(c, {
      action: 'deleted',
      resourceType: 'patient_image',
      resourceId: id,
      before,
    });
    return before;
  }

  return { list, get, upload, updateMetadata, remove };
};

export type PatientImagesService = ReturnType<typeof createPatientImagesService>;
