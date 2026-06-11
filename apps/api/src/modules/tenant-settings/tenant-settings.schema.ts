import { z } from 'zod';

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
