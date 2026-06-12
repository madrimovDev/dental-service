import type { Branch } from '@dental/db-schema';
import type { BranchDto } from './branches.schema.ts';

/** DB row (Date timestamps) → wire DTO (ISO strings, nullable fields preserved). */
export const toBranchDto = (row: Branch): BranchDto => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  address: row.address ?? null,
  phone: row.phone ?? null,
  workHours: row.workHours ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
});
