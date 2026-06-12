import type { Service, ServicePrice } from '@dental/db-schema';
import type { ServiceDto, ServicePriceDto, ServiceWithPricesDto } from './services.schema.ts';

/** DB row → Service wire DTO (Date timestamps → ISO strings, nullable fields preserved). */
export const toServiceDto = (row: Service): ServiceDto => ({
  id: row.id,
  tenantId: row.tenantId,
  code: row.code,
  nameUz: row.nameUz,
  nameRu: row.nameRu ?? null,
  category: row.category ?? null,
  durationMinutes: row.durationMinutes,
  requiredRole: row.requiredRole ?? null,
  descriptionUz: row.descriptionUz ?? null,
  descriptionRu: row.descriptionRu ?? null,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
});

/**
 * DB row → ServicePrice wire DTO.
 * validFrom / validTo are Drizzle `date` columns → already strings.
 * Only createdAt is a timestamp → Date, needs toISOString().
 */
export const toServicePriceDto = (row: ServicePrice): ServicePriceDto => ({
  id: row.id,
  serviceId: row.serviceId,
  branchId: row.branchId,
  price: row.price,
  currency: row.currency,
  validFrom: row.validFrom,
  validTo: row.validTo ?? null,
  createdAt: row.createdAt.toISOString(),
});

/** Service row + prices array → ServiceWithPrices wire DTO. */
export const toServiceWithPricesDto = (
  row: Service,
  prices: ServicePrice[],
): ServiceWithPricesDto => ({
  ...toServiceDto(row),
  prices: prices.map(toServicePriceDto),
});
