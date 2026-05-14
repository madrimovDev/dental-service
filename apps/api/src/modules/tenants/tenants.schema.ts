import { z } from 'zod';

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  defaultLanguage: z.enum(['uz', 'ru']).optional(),
});
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export const transferOwnershipSchema = z.object({
  newOwnerUserId: z.uuid(),
  currentPassword: z.string().min(1),
});
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;
