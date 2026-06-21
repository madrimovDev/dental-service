import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toStaffProfileDto, toUserAssignmentDto, toUserAssignmentRowDto } from './users.mapper.ts';
import {
  assignmentIdParamSchema,
  createAssignmentSchema,
  deleteAssignmentResultSchema,
  inviteUserResponseDtoSchema,
  inviteUserSchema,
  resetPasswordResponseDtoSchema,
  staffProfileDtoSchema,
  updateAssignmentSchema,
  upsertProfileSchema,
  userAssignmentDtoSchema,
  userAssignmentRowDtoSchema,
  userIdParamSchema,
} from './users.schema.ts';
import { createUsersService } from './users.service.ts';

/** Standart 404 response — assignment not found */
const assignmentNotFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Assignment not found',
  },
};

/** Standart 404 response — user not found */
const userNotFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'User not found',
  },
};

export const userRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createUsersService(deps);

  // ─── GET /assignments — joriy tenant'dagi xodimlar ───────────────────────

  const listAssignmentsRoute = createRoute({
    method: 'get',
    path: '/assignments',
    tags: ['users'],
    operationId: 'listUserAssignments',
    middleware: [requirePermission('user.view')] as const,
    responses: okJson(z.array(userAssignmentDtoSchema), 'List of user assignments'),
  });

  app.openapi(listAssignmentsRoute, async (c) => {
    const rows = await service.listAssignments(c);
    return c.json(ok(rows.map(toUserAssignmentDto)), 200);
  });

  // ─── POST /invite — yangi xodimni taklif qilish ──────────────────────────

  const inviteRoute = createRoute({
    method: 'post',
    path: '/invite',
    tags: ['users'],
    operationId: 'inviteUser',
    middleware: [requirePermission('user.invite')] as const,
    request: {
      body: { content: { 'application/json': { schema: inviteUserSchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(inviteUserResponseDtoSchema) } },
        description: 'User invited (or assignment already existed)',
      },
      400: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Validation error',
      },
      401: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Unauthorized',
      },
      403: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Forbidden',
      },
      404: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Role or branch not found',
      },
      500: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Internal error (user/assignment creation failed)',
      },
    },
  });

  app.openapi(inviteRoute, async (c) => {
    const body = c.req.valid('json');
    const result = await service.invite(c, body);
    if (!result.ok) {
      const status =
        result.code === 'role.not_found' || result.code === 'branch.not_found' ? 404 : 500;
      return c.json(fail(result.code, result.code), status);
    }
    return c.json(ok(result), 201);
  });

  // ─── POST /{userId}/assignments — mavjud user'ga yangi assignment ─────────

  const addAssignmentRoute = createRoute({
    method: 'post',
    path: '/{userId}/assignments',
    tags: ['users'],
    operationId: 'addUserAssignment',
    middleware: [requirePermission('user.manage')] as const,
    request: {
      params: userIdParamSchema,
      body: { content: { 'application/json': { schema: createAssignmentSchema } } },
    },
    responses: {
      201: {
        content: {
          'application/json': { schema: apiResponseSchema(userAssignmentRowDtoSchema) },
        },
        description: 'Assignment created',
      },
      400: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Validation error',
      },
      401: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Unauthorized',
      },
      403: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Forbidden',
      },
      ...userNotFoundResponse,
    },
  });

  app.openapi(addAssignmentRoute, async (c) => {
    const { userId } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await service.addAssignment(c, userId, body);
    if (!row) return c.json(fail('user.not_found', 'User not found'), 404);
    return c.json(ok(toUserAssignmentRowDto(row)), 201);
  });

  // ─── PATCH /assignments/{assignmentId} ───────────────────────────────────

  const updateAssignmentRoute = createRoute({
    method: 'patch',
    path: '/assignments/{assignmentId}',
    tags: ['users'],
    operationId: 'updateUserAssignment',
    middleware: [requirePermission('user.manage')] as const,
    request: {
      params: assignmentIdParamSchema,
      body: { content: { 'application/json': { schema: updateAssignmentSchema } } },
    },
    responses: {
      ...okJson(userAssignmentRowDtoSchema, 'Updated assignment'),
      ...assignmentNotFoundResponse,
    },
  });

  app.openapi(updateAssignmentRoute, async (c) => {
    const { assignmentId } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await service.updateAssignment(c, assignmentId, body);
    if (!row) return c.json(fail('assignment.not_found', 'Assignment not found'), 404);
    return c.json(ok(toUserAssignmentRowDto(row)), 200);
  });

  // ─── DELETE /assignments/{assignmentId} ──────────────────────────────────

  const deleteAssignmentRoute = createRoute({
    method: 'delete',
    path: '/assignments/{assignmentId}',
    tags: ['users'],
    operationId: 'deleteUserAssignment',
    middleware: [requirePermission('user.manage')] as const,
    request: {
      params: assignmentIdParamSchema,
    },
    responses: {
      ...okJson(deleteAssignmentResultSchema, 'Assignment deleted'),
      ...assignmentNotFoundResponse,
    },
  });

  app.openapi(deleteAssignmentRoute, async (c) => {
    const { assignmentId } = c.req.valid('param');
    const row = await service.removeAssignment(c, assignmentId);
    if (!row) return c.json(fail('assignment.not_found', 'Assignment not found'), 404);
    return c.json(ok({ deleted: true as const }), 200);
  });

  // ─── POST /{userId}/reset-password — admin resets user password ───────────

  const resetPasswordRoute = createRoute({
    method: 'post',
    path: '/{userId}/reset-password',
    tags: ['users'],
    operationId: 'resetUserPassword',
    middleware: [requirePermission('user.manage')] as const,
    request: {
      params: userIdParamSchema,
    },
    responses: {
      ...okJson(resetPasswordResponseDtoSchema, 'Password reset, temporary password returned'),
      ...userNotFoundResponse,
      403: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Forbidden (user not in tenant or cannot reset owner)',
      },
    },
  });

  app.openapi(resetPasswordRoute, async (c) => {
    const { userId } = c.req.valid('param');
    const result = await service.resetUserPassword(c, userId);
    if (!result.ok) {
      const msgs: Record<string, [string, number]> = {
        'user.not_in_tenant': ['Foydalanuvchi bu klinikaga tegishli emas', 403],
        'user.cannot_reset_owner': ["Klinika egasi parolini boshqa admin o'zgartira olmaydi", 403],
        'user.not_found': ['Foydalanuvchi topilmadi', 404],
      };
      const [msg, status] = msgs[result.code] ?? ['Reset failed', 400];
      return c.json(fail(result.code, msg), status as 400 | 403 | 404);
    }
    return c.json(ok(result), 200);
  });

  // ─── GET /{userId}/profile — xodim employment profili ────────────────────

  const getProfileRoute = createRoute({
    method: 'get',
    path: '/{userId}/profile',
    tags: ['users'],
    operationId: 'getUserProfile',
    middleware: [requirePermission('user.view')] as const,
    request: {
      params: userIdParamSchema,
    },
    responses: okJson(staffProfileDtoSchema.nullable(), 'Staff profile (null if not yet created)'),
  });

  app.openapi(getProfileRoute, async (c) => {
    const { userId } = c.req.valid('param');
    const profile = await service.getProfile(c, userId);
    return c.json(ok(profile ? toStaffProfileDto(profile) : null), 200);
  });

  // ─── PUT /{userId}/profile — profilni upsert ─────────────────────────────

  const upsertProfileRoute = createRoute({
    method: 'put',
    path: '/{userId}/profile',
    tags: ['users'],
    operationId: 'upsertUserProfile',
    middleware: [requirePermission('user.manage')] as const,
    request: {
      params: userIdParamSchema,
      body: { content: { 'application/json': { schema: upsertProfileSchema } } },
    },
    responses: okJson(staffProfileDtoSchema, 'Upserted staff profile'),
  });

  app.openapi(upsertProfileRoute, async (c) => {
    const { userId } = c.req.valid('param');
    const body = c.req.valid('json');
    const profile = await service.upsertProfile(c, userId, body);
    // upsert + RETURNING always yields a row; guard instead of `!` so a null
    // surfaces as a 500 via the error handler rather than a runtime cast.
    if (!profile) throw new Error('upsertProfile returned no row');
    return c.json(ok(toStaffProfileDto(profile)), 200);
  });

  return app;
};
