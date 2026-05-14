import { z } from 'zod';

export const imageType = z.enum([
  'xray_panoramic',
  'xray_periapical',
  'xray_bitewing',
  'xray_cbct',
  'intraoral_photo',
  'face_photo',
  'before_after',
  'other',
]);

export const uploadImageMetadataSchema = z.object({
  patientId: z.uuid(),
  type: imageType,
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  toothNumbers: z
    .union([z.string(), z.array(z.coerce.number())])
    .transform((v) => {
      if (Array.isArray(v)) return v.map(Number).filter((n) => !Number.isNaN(n));
      return v
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => !Number.isNaN(n));
    })
    .optional(),
  takenDate: z.iso.datetime().optional(),
});

export const updateImageMetadataSchema = z.object({
  type: imageType.optional(),
  title: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  toothNumbers: z.array(z.coerce.number().int()).nullable().optional(),
  takenDate: z.iso.datetime().nullable().optional(),
});
export type UpdateImageMetadataInput = z.infer<typeof updateImageMetadataSchema>;

export const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/dicom',
]);

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024; // 30 MB

export function extFromContentType(ct: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'application/dicom': 'dcm',
  };
  return map[ct] ?? 'bin';
}
