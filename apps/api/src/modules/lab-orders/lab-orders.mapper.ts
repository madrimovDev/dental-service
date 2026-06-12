import type { LabOrder } from '@dental/db-schema';
import type { LabOrderDto } from './lab-orders.schema.ts';

/** DB row (Date timestamps, numeric cost) → wire DTO (ISO strings, nullable fields). */
export const toLabOrderDto = (row: LabOrder): LabOrderDto => ({
  id: row.id,
  tenantId: row.tenantId,
  patientId: row.patientId,
  doctorId: row.doctorId,
  orderNumber: row.orderNumber ?? null,
  labName: row.labName,
  orderType: row.orderType,
  status: row.status,
  items: row.items,
  sentDate: row.sentDate ? row.sentDate.toISOString() : null,
  expectedDate: row.expectedDate ? row.expectedDate.toISOString() : null,
  deliveredDate: row.deliveredDate ? row.deliveredDate.toISOString() : null,
  cost: row.cost ?? null,
  currency: row.currency,
  notes: row.notes ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
