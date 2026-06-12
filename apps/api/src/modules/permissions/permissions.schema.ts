import { z } from '@hono/zod-openapi';

/**
 * Permission DTO — platform-level katalog yozuvi.
 * Wire shakli `packages/api-client/src/types.ts` `PermissionDef` bilan bir xil.
 */
export const permissionDefDtoSchema = z
  .object({
    id: z.uuid(),
    code: z.string().openapi({ example: 'patient.view' }),
    category: z.string().openapi({ example: 'patient' }),
    descriptionUz: z.string().nullable().openapi({ example: "Bemorlarni ko'rish" }),
    descriptionRu: z.string().nullable().openapi({ example: 'Просмотр пациентов' }),
  })
  .openapi('PermissionDef');

export type PermissionDefDto = z.infer<typeof permissionDefDtoSchema>;
