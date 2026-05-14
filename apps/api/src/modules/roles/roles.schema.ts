import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const setRolePermissionsSchema = z.object({
  permissions: z.array(z.string()),
});
export type SetRolePermissionsInput = z.infer<typeof setRolePermissionsSchema>;
