import type { Notification } from '@dental/db-schema';
import { z } from 'zod';

/** Feed ro'yxati so'rovi (pagination). */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListNotificationsQuery = z.infer<typeof listQuerySchema>;

/** Notification DTO (DB row shaklini takrorlaydi — qo'lda api-client uchun manba). */
export type NotificationDto = {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
};

export const toNotificationDto = (row: Notification): NotificationDto => ({
  id: row.id,
  tenantId: row.tenantId,
  userId: row.userId,
  type: row.type,
  title: row.title,
  body: row.body,
  readAt: row.readAt ? row.readAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
});

/** GET /api/notifications javob shakli (envelope ichidagi `data`). */
export type NotificationsFeed = {
  data: NotificationDto[];
  unreadCount: number;
  meta: { page: number; pageSize: number; total: number };
};
