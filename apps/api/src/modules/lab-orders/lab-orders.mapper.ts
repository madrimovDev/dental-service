import type { LabOrder, LabOrderFile, LabOrderMessage } from '@dental/db-schema';
import type { HubMessageDto, LabOrderDto, LabOrderFileDto } from './lab-orders.schema.ts';

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
  labHubLabId: row.labHubLabId ?? null,
  hubSyncStatus: (row.hubSyncStatus as LabOrderDto['hubSyncStatus']) ?? null,
  hubStatus: row.hubStatus ?? null,
  hubRejectReason: row.hubRejectReason ?? null,
  proposedPrice: row.proposedPrice ?? null,
  approvedPrice: row.approvedPrice ?? null,
  approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
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

export const toHubMessageDto = (row: LabOrderMessage): HubMessageDto => ({
  id: row.id,
  labOrderId: row.labOrderId,
  author: row.author,
  authorName: row.authorName ?? null,
  kind: row.kind,
  body: row.body ?? null,
  file: row.hubFile ?? null,
  // Lab xabari Hub'dan kelgan (sinxron); klinika xabari — Hub qabul qilgach.
  synced: row.author === 'lab' || row.syncedAt != null,
  createdAt: row.createdAt.toISOString(),
});
