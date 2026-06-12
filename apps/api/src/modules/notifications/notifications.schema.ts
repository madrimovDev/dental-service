import { z } from '@hono/zod-openapi';

/** Feed ro'yxati so'rovi (pagination). */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListNotificationsQuery = z.infer<typeof listQuerySchema>;

/** Path param — :id */
export const notificationIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

/** Notification DTO — wire shape (timestamps ISO string, nullable guarded). `.openapi()` ref. */
export const notificationDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    userId: z.uuid(),
    type: z.string().openapi({ example: 'appointment.reminder' }),
    title: z.string().openapi({ example: 'Yaqinlashib kelayotgan vizit' }),
    body: z.string().nullable().openapi({ example: null }),
    readAt: z.string().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('Notification');

export type NotificationDto = z.infer<typeof notificationDtoSchema>;

/** GET /api/notifications javob shakli (envelope ichidagi `data`). */
export const notificationsFeedSchema = z
  .object({
    data: z.array(notificationDtoSchema),
    unreadCount: z.number().int().openapi({ example: 3 }),
    meta: z.object({
      page: z.number().int().openapi({ example: 1 }),
      pageSize: z.number().int().openapi({ example: 20 }),
      total: z.number().int().openapi({ example: 42 }),
    }),
  })
  .openapi('NotificationsFeed');

export type NotificationsFeed = z.infer<typeof notificationsFeedSchema>;

/** POST /:id/read javob shakli. */
export const markReadResultSchema = z
  .object({
    read: z.boolean().openapi({ example: true }),
    id: z.string().nullable().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
  })
  .openapi('NotificationMarkReadResult');

/** POST /read-all javob shakli. */
export const markAllReadResultSchema = z
  .object({
    count: z.number().int().openapi({ example: 5 }),
  })
  .openapi('NotificationMarkAllReadResult');
