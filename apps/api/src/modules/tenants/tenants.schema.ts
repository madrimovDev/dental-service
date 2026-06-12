import { z } from '@hono/zod-openapi';

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

/** Response DTO — wire shape matching the hand `Tenant` type in packages/api-client. */
export const tenantDtoSchema = z
  .object({
    id: z.uuid(),
    name: z.string().openapi({ example: 'Alfa Stomatologiya' }),
    slug: z.string().openapi({ example: 'alfa-stomatologiya' }),
    ownerUserId: z.uuid(),
    defaultLanguage: z.string().openapi({ example: 'uz' }),
    subscriptionStatus: z
      .enum(['trial', 'active', 'suspended', 'cancelled'])
      .openapi({ example: 'trial' }),
    trialEndsAt: z.string().nullable().openapi({ example: '2026-07-01T00:00:00.000Z' }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('Tenant');

export type TenantDto = z.infer<typeof tenantDtoSchema>;
