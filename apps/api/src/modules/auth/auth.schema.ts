import { z } from 'zod';

/**
 * Auth endpoint Zod schemalar.
 * Frontend ham shu schemalardan validatsiya qiladi (api-client paketda re-export).
 */

const emailOrPhone = z
  .union([z.email(), z.string().regex(/^\+?\d{9,15}$/)])
  .describe('Email yoki telefon raqami (+998 ... yoki email)');

const password = z.string().min(12).max(128);

export const registerTenantSchema = z.object({
  tenantName: z.string().min(2).max(120),
  ownerEmail: z.email(),
  ownerPhone: z
    .string()
    .regex(/^\+?\d{9,15}$/)
    .optional(),
  ownerFullName: z.string().min(2).max(120),
  ownerPassword: password,
  defaultLanguage: z.enum(['uz', 'ru']).default('uz'),
});
export type RegisterTenantInput = z.infer<typeof registerTenantSchema>;

export const loginSchema = z.object({
  identifier: emailOrPhone,
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
  identifier: emailOrPhone,
});
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetSchema = z.object({
  token: z.string().min(1),
  newPassword: password,
});
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
