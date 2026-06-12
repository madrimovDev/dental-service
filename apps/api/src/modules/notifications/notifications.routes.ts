import { ok } from '@dental/core';
import type { NotificationChannel } from '@dental/notifications';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import { okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import {
  listQuerySchema,
  markAllReadResultSchema,
  markReadResultSchema,
  notificationIdParamSchema,
  notificationsFeedSchema,
} from './notifications.schema.ts';
import { createNotificationsService } from './notifications.service.ts';

export const notificationsRoutes = (deps: { db: Database; sms: NotificationChannel }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createNotificationsService({ sms: deps.sms });

  const userIdOf = (c: Context): string => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'Authentication required' });
    return user.id;
  };

  // ─── GET / — foydalanuvchi feed'i (permission yo'q — faqat o'zini ko'radi) ──

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['notifications'],
    operationId: 'listNotifications',
    request: {
      query: listQuerySchema,
    },
    responses: okJson(notificationsFeedSchema, 'Notification feed + unreadCount'),
  });

  app.openapi(listRoute, async (c) => {
    const query = c.req.valid('query');
    return c.json(ok(await service.list(c, userIdOf(c), query)), 200);
  });

  // ─── POST /{id}/read — bitta bildirishnomani o'qilgan deb belgilaydi ────────

  const markReadRoute = createRoute({
    method: 'post',
    path: '/{id}/read',
    tags: ['notifications'],
    operationId: 'markNotificationRead',
    request: {
      params: notificationIdParamSchema,
    },
    responses: okJson(markReadResultSchema, 'Notification marked read (read:false if not found)'),
  });

  app.openapi(markReadRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = await service.markRead(c, id, userIdOf(c));
    return c.json(ok({ read: !!row, id: row?.id ?? null }), 200);
  });

  // ─── POST /read-all — barcha o'qilmaganlarni o'qilgan deb belgilaydi ────────

  const markAllReadRoute = createRoute({
    method: 'post',
    path: '/read-all',
    tags: ['notifications'],
    operationId: 'markAllNotificationsRead',
    responses: okJson(markAllReadResultSchema, 'Count of notifications marked read'),
  });

  app.openapi(markAllReadRoute, async (c) => {
    return c.json(ok(await service.markAllRead(c, userIdOf(c))), 200);
  });

  return app;
};
