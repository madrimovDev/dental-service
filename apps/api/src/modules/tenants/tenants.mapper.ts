import type { Tenant } from '@dental/db-schema';
import type { TenantDto } from './tenants.schema.ts';

/** DB row (Date timestamps, nullable trialEndsAt) → wire DTO (ISO strings). */
export const toTenantDto = (row: Tenant): TenantDto => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  ownerUserId: row.ownerUserId,
  defaultLanguage: row.defaultLanguage,
  subscriptionStatus: row.subscriptionStatus,
  trialEndsAt: row.trialEndsAt ? row.trialEndsAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
