import type { Notification } from '@dental/db-schema';
import type { NotificationDto } from './notifications.schema.ts';

/** DB row (Date timestamps) → wire DTO (ISO strings, nullable fields guarded). */
export const toNotificationDto = (row: Notification): NotificationDto => ({
  id: row.id,
  tenantId: row.tenantId,
  userId: row.userId,
  type: row.type,
  title: row.title,
  body: row.body ?? null,
  readAt: row.readAt ? row.readAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
});
