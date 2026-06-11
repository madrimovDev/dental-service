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

export const inviteSchema = z.object({
  phone: z.string().regex(/^\+?\d{9,15}$/, "Telefon raqami noto'g'ri formatda"),
  fullName: z.string().min(2).max(120),
  roleId: z.string().min(1),
  branchId: z.string().optional(),
});
export type InviteFormValues = z.infer<typeof inviteSchema>;

export const tenantSchema = z.object({
  name: z.string().min(2).max(120),
  defaultLanguage: z.enum(['uz', 'ru']),
});
export type TenantFormValues = z.infer<typeof tenantSchema>;

export const transferSchema = z.object({
  newOwnerUserId: z.string().min(1),
  currentPassword: z.string().min(1),
});
export type TransferFormValues = z.infer<typeof transferSchema>;
