import type { LabOrder, LabOrderFile } from '@dental/db-schema';
import type { LabOrderDto, LabOrderFileDto } from './lab-orders.schema.ts';

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
  dueDate: row.dueDate ?? null,
  shade: row.shade ?? null,
  remakeOfId: row.remakeOfId ?? null,
  remakeReason: (row.remakeReason as LabOrderDto['remakeReason']) ?? null,
  cost: row.cost ?? null,
  currency: row.currency,
  notes: row.notes ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const toLabOrderFileDto = (row: LabOrderFile, url: string): LabOrderFileDto => ({
  id: row.id,
  labOrderId: row.labOrderId,
  label: row.label ?? null,
  originalFilename: row.originalFilename,
  contentType: row.contentType,
  sizeBytes: row.sizeBytes,
  url,
  createdAt: row.createdAt.toISOString(),
});
