import { z } from '@hono/zod-openapi';

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

/**
 * Audit log entry DTO — wire shape (timestamps as ISO strings, nullable fields explicit).
 * Matches `AuditLogEntry` in `packages/api-client/src/types-audit.ts`.
 */
export const auditLogEntryDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid().nullable(),
    userId: z.uuid().nullable(),
    action: z.string().openapi({ example: 'created' }),
    resourceType: z.string().openapi({ example: 'patient' }),
    resourceId: z.uuid().nullable(),
    before: z.unknown(),
    after: z.unknown(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('AuditLogEntry');

export type AuditLogEntryDto = z.infer<typeof auditLogEntryDtoSchema>;

/** Paginated list response DTO — `{ data, meta }` nested inside the `ok()` envelope. */
export const auditListResponseDtoSchema = z
  .object({
    data: z.array(auditLogEntryDtoSchema),
    meta: z.object({
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
    }),
  })
  .openapi('AuditListResponse');
