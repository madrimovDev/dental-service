import { z } from '@hono/zod-openapi';

/**
 * Tenant settings update DTO — barcha maydonlar optional (partial update).
 *
 * - `vertical` — klinika vertikali (masalan 'dental', 'cosmetology').
 * - `reminderLeadHours` — vizitdan necha soat oldin eslatma (0–168, ya'ni 0..7 kun).
 * - `currency` — valyuta kodi (masalan 'UZS').
 */
export const updateSettingsSchema = z.object({
  vertical: z.string().min(1).optional(),
  reminderLeadHours: z.number().int().min(0).max(168).optional(),
  currency: z.string().min(1).max(8).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** Response DTO — wire shakli (timestamp'lar ISO string). `.openapi()` ref komponent. */
export const tenantSettingsDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    vertical: z.string().openapi({ example: 'dental' }),
    reminderLeadHours: z.number().int().openapi({ example: 24 }),
    currency: z.string().openapi({ example: 'UZS' }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('TenantSettings');

export type TenantSettingsDto = z.infer<typeof tenantSettingsDtoSchema>;
