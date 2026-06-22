import type { z } from '@hono/zod-openapi';
import type { patientImageSchema } from './patient-images.schema.ts';

type PatientImageDto = z.infer<typeof patientImageSchema>;

/** Service DB row (+ presigned url) → wire DTO. timestamp → ISO string. */
type PatientImageRow = {
  id: string;
  tenantId: string;
  patientId: string;
  uploadedByUserId: string | null;
  type: PatientImageDto['type'];
  objectKey: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  title: string | null;
  description: string | null;
  toothNumbers: number[] | null;
  takenDate: Date | null;
  visitNoteId: string | null;
  createdAt: Date;
  url: string;
};

export const toPatientImageDto = (row: PatientImageRow): PatientImageDto => ({
  id: row.id,
  tenantId: row.tenantId,
  patientId: row.patientId,
  uploadedByUserId: row.uploadedByUserId,
  type: row.type,
  objectKey: row.objectKey,
  originalFilename: row.originalFilename,
  contentType: row.contentType,
  sizeBytes: row.sizeBytes,
  title: row.title,
  description: row.description,
  toothNumbers: row.toothNumbers,
  takenDate: row.takenDate ? row.takenDate.toISOString() : null,
  visitNoteId: row.visitNoteId,
  createdAt: row.createdAt.toISOString(),
  url: row.url,
});
