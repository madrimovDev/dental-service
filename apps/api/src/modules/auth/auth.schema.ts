import { z } from '@hono/zod-openapi';

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

// ─── Request schemalar (SAQLANADI — frontend ham validatsiya qiladi) ──────────

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

/**
 * Logout body — refreshToken IXTIYORIY (toleratant).
 * ⚠️ Hand `endpoints.ts` xulqi: yaroqsiz/yo'q body bo'lsa ham 200 `{loggedOut:true}`
 * qaytaradi (validatsiya 400 EMAS). Shuni saqlash uchun alohida optional schema.
 */
export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});
export type LogoutInput = z.infer<typeof logoutSchema>;

export const workspaceBranchesResponseSchema = z
  .object({
    branches: z.array(z.object({ id: z.uuid(), name: z.string() })),
    allowAllBranches: z.boolean(),
  })
  .openapi('WorkspaceBranches');
export type WorkspaceBranchesResponseDto = z.infer<typeof workspaceBranchesResponseSchema>;

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

// ─── Response DTO schemalar (wire shape — endpoints.ts bilan AYNAN mos) ────────

/** Login muvaffaqiyatli javobi — token oqimi uchun KRITIK shakl. */
export const loginResponseSchema = z
  .object({
    user: z.object({
      id: z.uuid(),
      phone: z.string(),
      fullName: z.string().nullable(),
      lang: z.string(),
    }),
    accessToken: z.string(),
    refreshToken: z.string(),
    accessExpiresAt: z.iso.datetime(),
  })
  .openapi('LoginResponse');
export type LoginResponseDto = z.infer<typeof loginResponseSchema>;

/** Register-tenant javobi. */
export const registerTenantResponseSchema = z
  .object({
    userId: z.uuid(),
    tenantId: z.uuid(),
    slug: z.string(),
    branchId: z.uuid(),
  })
  .openapi('RegisterTenantResponse');
export type RegisterTenantResponseDto = z.infer<typeof registerTenantResponseSchema>;

/** Refresh / switch-workspace javobi — yangi access + refresh juftligi. */
export const tokenPairResponseSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    accessExpiresAt: z.iso.datetime(),
  })
  .openapi('TokenPairResponse');
export type TokenPairResponseDto = z.infer<typeof tokenPairResponseSchema>;

/** GET /me — foydalanuvchining barcha workspace a'zoliklari. */
export const membershipsResponseSchema = z
  .object({
    userId: z.uuid(),
    assignments: z.array(
      z.object({
        tenantId: z.uuid(),
        tenantName: z.string(),
        tenantSlug: z.string(),
        branchId: z.uuid().nullable(),
        branchName: z.string().nullable(),
        roleId: z.uuid(),
        roleName: z.string(),
        isOwner: z.boolean(),
      }),
    ),
    ownerTenants: z.array(
      z.object({
        tenantId: z.uuid(),
        tenantName: z.string(),
        tenantSlug: z.string(),
      }),
    ),
  })
  .openapi('MembershipsResponse');
export type MembershipsResponseDto = z.infer<typeof membershipsResponseSchema>;

/** POST /logout javobi. */
export const logoutResponseSchema = z
  .object({ loggedOut: z.literal(true) })
  .openapi('LogoutResponse');
export type LogoutResponseDto = z.infer<typeof logoutResponseSchema>;

/** POST /password-reset-request javobi (enumeration oldini olish — doim sent). */
export const passwordResetRequestResponseSchema = z
  .object({ sent: z.literal(true) })
  .openapi('PasswordResetRequestResponse');
export type PasswordResetRequestResponseDto = z.infer<typeof passwordResetRequestResponseSchema>;

/** POST /password-reset javobi. */
export const passwordResetResponseSchema = z
  .object({ ok: z.literal(true) })
  .openapi('PasswordResetResponse');
export type PasswordResetResponseDto = z.infer<typeof passwordResetResponseSchema>;

/** POST /change-password javobi. */
export const changePasswordResponseSchema = z
  .object({ changed: z.literal(true) })
  .openapi('ChangePasswordResponse');
export type ChangePasswordResponseDto = z.infer<typeof changePasswordResponseSchema>;
