import { z } from 'zod';

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
