import { z } from 'zod';

export const auditListQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  userId: z.uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;
