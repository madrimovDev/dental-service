import { z } from 'zod';

export const listDiagnosesQuerySchema = z.object({
  search: z.string().optional(),
});
export type ListDiagnosesQuery = z.infer<typeof listDiagnosesQuerySchema>;
