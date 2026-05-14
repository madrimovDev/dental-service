import { z } from 'zod';

/**
 * Auth endpoint Zod schemalar.
 * Frontend ham shu schemalardan validatsiya qiladi (api-client paketda re-export).
 *
 * ⚠️ M-phone: Identity faqat telefon raqami orqali. Email olib tashlandi.
 * Phone formati: +998XXXXXXXXX (9-15 raqam, ixtiyoriy + bilan).
 */

const phone = z
  .string()
  .regex(/^\+?\d{9,15}$/)
  .describe('Telefon raqami (+998 ... yoki 998... format)');

const password = z.string().min(12).max(128);

export const registerTenantSchema = z.object({
  tenantName: z.string().min(2).max(120),
  ownerPhone: phone,
  ownerFullName: z.string().min(2).max(120),
  ownerPassword: password,
  defaultLanguage: z.enum(['uz', 'ru']).default('uz'),
});
export type RegisterTenantInput = z.infer<typeof registerTenantSchema>;

export const loginSchema = z.object({
  phone,
  password,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const switchWorkspaceSchema = z.object({
  tenantId: z.uuid(),
  branchId: z.uuid().optional(),
  // Refresh token majburiy — chain rotation uchun.
  // Switch endi yangi access + yangi refresh chiqaradi (workspace context bilan).
  refreshToken: z.string().min(1),
});
export type SwitchWorkspaceInput = z.infer<typeof switchWorkspaceSchema>;

export const passwordResetRequestSchema = z.object({
  phone,
});
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetSchema = z.object({
  token: z.string().min(1),
  newPassword: password,
});
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
