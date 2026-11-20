import { CASHIER_PHOTO_SKIPPED_REASONS } from '@dental/db-schema';
import { z } from '@hono/zod-openapi';

/** Kassa rasmi uchun ruxsat etilgan MIME turlari (faqat kamera/fayl rasmlari, DICOM/HEIC emas). */
export const CASHIER_PHOTO_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
export const CASHIER_PHOTO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
/** Retention: shu kundan eski rasm (fayl + qator) kunlik worker tomonidan o'chiriladi. */
export const CASHIER_PHOTO_RETENTION_DAYS = 90;

export const skippedReasonSchema = z.enum(CASHIER_PHOTO_SKIPPED_REASONS);

export const cashierPhotoSettingsDtoSchema = z
  .object({ enabled: z.boolean().openapi({ example: false }) })
  .openapi('CashierPhotoSettings');

export const cashierPhotoDtoSchema = z
  .object({
    id: z.uuid(),
    transactionId: z.uuid(),
    /** `null` — rasm olinmagan (`skippedReason` to'ldirilgan). */
    url: z.string().nullable().openapi({ example: '/uploads/tenants%2F…' }),
    skippedReason: skippedReasonSchema.nullable(),
    capturedBy: z.uuid().nullable(),
    capturedAt: z.string().openapi({ example: '2026-11-20T10:00:00.000Z' }),
  })
  .openapi('CashierPhoto');
export type CashierPhotoDto = z.infer<typeof cashierPhotoDtoSchema>;
