import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import {
  createAssignmentSchema,
  inviteUserSchema,
  updateAssignmentSchema,
} from './users.schema.ts';
import { createUsersService } from './users.service.ts';

export const userRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createUsersService(deps);

  // GET /api/users/assignments — joriy tenant'dagi xodimlar
  app.get('/assignments', requirePermission('user.view'), async (c) => {
    return c.json(ok(await service.listAssignments(c)));
  });

  // POST /api/users/invite — yangi xodimni taklif qilish
  app.post('/invite', requirePermission('user.invite'), async (c) => {
    const body = inviteUserSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const result = await service.invite(c, body.data);
    if (!result.ok) {
      const status =
        result.code === 'role.not_found' || result.code === 'branch.not_found' ? 404 : 500;
      return c.json(fail(result.code, result.code), status);
    }
    return c.json(ok(result), 201);
  });

  // POST /api/users/:userId/assignments — mavjud user'ga yangi assignment qo'shish
  app.post('/:userId/assignments', requirePermission('user.manage'), async (c) => {
    const body = createAssignmentSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.addAssignment(c, c.req.param('userId'), body.data);
    if (!row) return c.json(fail('user.not_found', 'User not found'), 404);
    return c.json(ok(row), 201);
  });

  // PATCH /api/users/assignments/:assignmentId
  app.patch('/assignments/:assignmentId', requirePermission('user.manage'), async (c) => {
    const body = updateAssignmentSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.updateAssignment(c, c.req.param('assignmentId'), body.data);
    if (!row) return c.json(fail('assignment.not_found', 'Assignment not found'), 404);
    return c.json(ok(row));
  });

  // DELETE /api/users/assignments/:assignmentId
  app.delete('/assignments/:assignmentId', requirePermission('user.manage'), async (c) => {
    const row = await service.removeAssignment(c, c.req.param('assignmentId'));
    if (!row) return c.json(fail('assignment.not_found', 'Assignment not found'), 404);
    return c.json(ok({ deleted: true }));
  });

  // POST /api/users/:userId/reset-password — admin generated new temp password
  app.post('/:userId/reset-password', requirePermission('user.manage'), async (c) => {
    const result = await service.resetUserPassword(c, c.req.param('userId'));
    if (!result.ok) {
      const msgs: Record<string, [string, number]> = {
        'user.not_in_tenant': ['Foydalanuvchi bu klinikaga tegishli emas', 403],
        'user.cannot_reset_owner': ["Klinika egasi parolini boshqa admin o'zgartira olmaydi", 403],
        'user.not_found': ['Foydalanuvchi topilmadi', 404],
      };
      const [msg, status] = msgs[result.code] ?? ['Reset failed', 400];
      return c.json(fail(result.code, msg), status as 400 | 403 | 404);
    }
    return c.json(ok(result));
  });

  return app;
};
