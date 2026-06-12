import type { AuditLogEntry } from '@dental/db-schema';
import type { AuditLogEntryDto } from './audit.schema.ts';

/** DB row (Date createdAt) → wire DTO (ISO string). */
export const toAuditLogEntryDto = (row: AuditLogEntry): AuditLogEntryDto => ({
  id: row.id,
  tenantId: row.tenantId ?? null,
  userId: row.userId ?? null,
  action: row.action,
  resourceType: row.resourceType,
  resourceId: row.resourceId ?? null,
  before: row.before ?? null,
  after: row.after ?? null,
  ip: row.ip ?? null,
  userAgent: row.userAgent ?? null,
  createdAt: row.createdAt.toISOString(),
});
