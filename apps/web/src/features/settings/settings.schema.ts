import type { TFunction } from 'i18next';
import { z } from 'zod';

export const roleSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
});
export type RoleFormValues = z.infer<typeof roleSchema>;

export const branchSchema = z.object({
  name: z.string().min(2).max(120),
  address: z.string().max(500).optional(),
  phone: z
    .string()
    .regex(/^\+?\d{9,15}$/)
    .optional()
    .or(z.literal('')),
});
export type BranchFormValues = z.infer<typeof branchSchema>;

export const makeInviteSchema = (t: TFunction) =>
  z.object({
    phone: z.string().regex(/^\+?\d{9,15}$/, t('validation.phone_invalid')),
    fullName: z.string().min(2).max(120),
    roleId: z.string().min(1),
    branchId: z.string().optional(),
  });
export type InviteFormValues = z.infer<ReturnType<typeof makeInviteSchema>>;

export const staffProfileSchema = z.object({
  specialty: z.string().max(120).optional().or(z.literal('')),
  employmentStatus: z.enum(['active', 'on_leave', 'inactive']),
  startedAt: z.string().optional().or(z.literal('')),
  baseSalary: z.number().min(0),
  commissionPercent: z.number().min(0).max(100),
});
export type StaffProfileFormValues = z.infer<typeof staffProfileSchema>;

export const tenantSchema = z.object({
  name: z.string().min(2).max(120),
  defaultLanguage: z.enum(['uz', 'ru']),
});
export type TenantFormValues = z.infer<typeof tenantSchema>;

export const tenantSettingsSchema = z.object({
  vertical: z.enum(['dental', 'general']),
  currency: z.string().min(1).max(8),
  reminderLeadHours: z.number().int().min(0).max(168),
});
export type TenantSettingsFormValues = z.infer<typeof tenantSettingsSchema>;

export const transferSchema = z.object({
  newOwnerUserId: z.string().min(1),
  currentPassword: z.string().min(1),
});
export type TransferFormValues = z.infer<typeof transferSchema>;
