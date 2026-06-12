import { z } from '@hono/zod-openapi';

export const listDiagnosesQuerySchema = z.object({
  search: z.string().optional(),
});
export type ListDiagnosesQuery = z.infer<typeof listDiagnosesQuerySchema>;

/** Response DTO — wire shape (api-client Diagnosis invariant). */
export const diagnosisDtoSchema = z
  .object({
    id: z.uuid(),
    code: z.string().openapi({ example: 'K02.1' }),
    nameUz: z.string().openapi({ example: 'Tish kariesi' }),
    nameRu: z.string().openapi({ example: 'Кариес зубов' }),
    category: z.string().nullable().openapi({ example: 'K02' }),
    descriptionUz: z.string().nullable().openapi({ example: null }),
    descriptionRu: z.string().nullable().openapi({ example: null }),
  })
  .openapi('Diagnosis');

export type DiagnosisDto = z.infer<typeof diagnosisDtoSchema>;
