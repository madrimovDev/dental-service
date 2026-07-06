import { z } from '@hono/zod-openapi';

// ─── Request schemas ─────────────────────────────────────────────────────────

export const inviteUserSchema = z.object({
  phone: z.string().regex(/^\+?\d{9,15}$/),
  fullName: z.string().min(2).max(120),
  roleId: z.uuid(),
  branchId: z.uuid().optional(),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const createAssignmentSchema = z.object({
  roleId: z.uuid(),
  branchId: z.uuid().optional(),
  validFrom: z.iso.datetime().optional(),
  validTo: z.iso.datetime().optional(),
});
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentSchema = z.object({
  roleId: z.uuid().optional(),
  branchId: z.uuid().nullable().optional(),
  validTo: z.iso.datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

/**
 * Xodim employment profili upsert (PUT — to'liq almashtirish semantikasi).
 * Ixtiyoriy maydonlar berilmasa — null/default'ga tushadi (replace, merge emas).
 */
export const upsertProfileSchema = z.object({
  specialty: z.string().max(120).optional(),
  employmentStatus: z.enum(['active', 'on_leave', 'inactive']).optional(),
  startedAt: z.iso.date().optional(),
  baseSalary: z.number().min(0),
  commissionPercent: z.number().min(0).max(100),
});
export type UpsertProfileInput = z.infer<typeof upsertProfileSchema>;

// ─── Path param schemas ───────────────────────────────────────────────────────

export const userIdParamSchema = z
  .object({ userId: z.uuid() })
  .openapi({ param: { name: 'userId', in: 'path' } });

export const assignmentIdParamSchema = z
  .object({ assignmentId: z.uuid() })
  .openapi({ param: { name: 'assignmentId', in: 'path' } });

// ─── Response DTOs ────────────────────────────────────────────────────────────

/**
 * Joined list row — `listAssignments` service.
 * Matches api-client `UserAssignment` shape exactly.
 */
export const userAssignmentDtoSchema = z
  .object({
    assignmentId: z.uuid(),
    userId: z.uuid(),
    userEmail: z.string().nullable().openapi({ example: null }),
    userPhone: z.string().openapi({ example: '+998901234567' }),
    userFullName: z.string().nullable().openapi({ example: 'Ali Valiyev' }),
    branchId: z.uuid().nullable().openapi({ example: null }),
    branchName: z.string().nullable().openapi({ example: null }),
    roleId: z.uuid(),
    roleName: z.string().openapi({ example: 'Doctor' }),
    validFrom: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    validTo: z.string().nullable().openapi({ example: null }),
    isActive: z.boolean().openapi({ example: true }),
  })
  .openapi('UserAssignment');

export type UserAssignmentDto = z.infer<typeof userAssignmentDtoSchema>;

/**
 * Raw assignment row — `addAssignment` / `updateAssignment` service.
 * Mirrors the DB `userAssignments.$inferSelect` wire shape (all columns, dates ISO).
 */
export const userAssignmentRowDtoSchema = z
  .object({
    id: z.uuid(),
    userId: z.uuid(),
    tenantId: z.uuid(),
    branchId: z.uuid().nullable(),
    roleId: z.uuid(),
    validFrom: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    validTo: z.string().nullable().openapi({ example: null }),
    isActive: z.boolean().openapi({ example: true }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('UserAssignmentRow');

export type UserAssignmentRowDto = z.infer<typeof userAssignmentRowDtoSchema>;

/**
 * Invite response DTO.
 * Matches api-client `InviteUserResponse` shape exactly.
 */
export const inviteUserResponseDtoSchema = z
  .object({
    ok: z.literal(true),
    userId: z.uuid(),
    assignmentId: z.uuid(),
    tempPassword: z.string().nullable().openapi({ example: null }),
    alreadyExists: z.boolean().openapi({ example: false }),
    // CLI-427: deaktivlangan xodim qayta-taklifda faollashtirildimi (alreadyExists'dan farqli).
    reactivated: z.boolean().openapi({ example: false }),
  })
  .openapi('InviteUserResponse');

export type InviteUserResponseDto = z.infer<typeof inviteUserResponseDtoSchema>;

/**
 * Reset password response DTO.
 * Matches api-client inline type exactly.
 */
export const resetPasswordResponseDtoSchema = z
  .object({
    ok: z.literal(true),
    userId: z.uuid(),
    phone: z.string().openapi({ example: '+998901234567' }),
    tempPassword: z.string().openapi({ example: 'aBcD1234eFgH5678' }),
  })
  .openapi('ResetPasswordResponse');

export type ResetPasswordResponseDto = z.infer<typeof resetPasswordResponseDtoSchema>;

/**
 * Staff profile response DTO.
 * Matches api-client `StaffProfile` (types-hr.ts) shape exactly.
 */
export const staffProfileDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    userId: z.uuid(),
    specialty: z.string().nullable().openapi({ example: 'Orthodontics' }),
    employmentStatus: z.enum(['active', 'on_leave', 'inactive']).openapi({ example: 'active' }),
    startedAt: z.string().nullable().openapi({ example: '2026-01-01' }),
    baseSalary: z.string().openapi({ example: '5000000.00' }),
    commissionPercent: z.string().openapi({ example: '10.00' }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('StaffProfile');

export type StaffProfileDto = z.infer<typeof staffProfileDtoSchema>;

/** DELETE assignment response DTO */
export const deleteAssignmentResultSchema = z
  .object({ deleted: z.literal(true) })
  .openapi('DeleteAssignmentResult');
