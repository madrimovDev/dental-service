import type { TenantSettings } from '@dental/db-schema';
import type { TenantSettingsDto } from './tenant-settings.schema.ts';

/** DB row (Date timestamp) → wire DTO (ISO string). Envelope type-check uchun zarur. */
export const toTenantSettingsDto = (row: TenantSettings): TenantSettingsDto => ({
  id: row.id,
  tenantId: row.tenantId,
  vertical: row.vertical,
  reminderLeadHours: row.reminderLeadHours,
  currency: row.currency,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
