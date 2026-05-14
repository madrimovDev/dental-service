import { sql } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { patients } from './patients.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

export const patientImageTypeEnum = pgEnum('patient_image_type', [
  'xray_panoramic',
  'xray_periapical',
  'xray_bitewing',
  'xray_cbct',
  'intraoral_photo',
  'face_photo',
  'before_after',
  'other',
]);

/**
 * Patient image — MinIO da saqlanadigan rasm (X-ray, photo, va h.k.).
 * Storage layout: `tenants/{tenant_id}/patients/{patient_id}/{image_id}.{ext}`
 * Download — backend short-lived signed URL beradi.
 */
export const patientImages = pgTable(
  'patient_images',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    type: patientImageTypeEnum('type').notNull(),
    objectKey: text('object_key').notNull(), // MinIO key (S3 path)
    originalFilename: text('original_filename').notNull(),
    contentType: text('content_type').notNull(), // image/jpeg, image/png, application/dicom, ...
    sizeBytes: integer('size_bytes').notNull(),

    title: text('title'),
    description: text('description'),
    toothNumbers: integer('tooth_numbers').array(), // FDI raqamlari (ixtiyoriy)
    takenDate: timestamp('taken_date', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('patient_images_patient_idx').on(t.patientId),
    index('patient_images_tenant_created_idx').on(t.tenantId, t.createdAt),
  ],
);

export type PatientImage = typeof patientImages.$inferSelect;
export type PatientImageInsert = typeof patientImages.$inferInsert;
