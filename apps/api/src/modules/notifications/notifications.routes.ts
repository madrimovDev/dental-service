import { ok } from '@dental/core';
import type { NotificationChannel } from '@dental/notifications';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { listQuerySchema } from './notifications.schema.ts';
import { createNotificationsService } from './notifications.service.ts';

export const notificationsRoutes = (deps: { db: Database; sms: NotificationChannel }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createNotificationsService({ sms: deps.sms });

  const userIdOf = (c: Context): string => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'Authentication required' });
    return user.id;
  };

  // GET /api/notifications?page&pageSize → o'z feed'i + unreadCount (permission yo'q)
  app.get('/', async (c) => {
    const query = listQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!query.success) throw new HTTPException(400, { message: 'Invalid query' });
    return c.json(ok(await service.list(c, userIdOf(c), query.data)));
  });

  // POST /api/notifications/:id/read
  app.post('/:id/read', async (c) => {
    const row = await service.markRead(c, c.req.param('id'), userIdOf(c));
    return c.json(ok({ read: !!row, id: row?.id ?? null }));
  });

  // POST /api/notifications/read-all
  app.post('/read-all', async (c) => {
    return c.json(ok(await service.markAllRead(c, userIdOf(c))));
  });

  return app;
};
