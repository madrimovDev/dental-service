import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../../lib/openapi.ts';
import { requirePermission } from '../../../middleware/require-permission.ts';
import { toVisitNoteDto } from './visit-notes.mapper.ts';
import {
  createVisitNoteSchema,
  updateVisitNoteSchema,
  visitNoteDtoSchema,
} from './visit-notes.schema.ts';
import { createVisitNotesService } from './visit-notes.service.ts';

/** Standart 404 response — get / patch endpoint'lar uchun. */
const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Visit note not found',
  },
};

export const visitNotesRoutes = (deps: {
  audit: AuditLogger;
  deductStock?: (c: Context, serviceIds: string[], visitNoteId: string) => Promise<void>;
}) => {
  const app = new OpenAPIHono();
  const service = createVisitNotesService(deps);

  // ─── GET /visit-notes — list ─────────────────────────────────────────────

  const listRoute = createRoute({
    method: 'get',
    path: '/visit-notes',
    tags: ['visit-notes'],
    operationId: 'listVisitNotes',
    middleware: [requirePermission('medical_record.view')] as const,
    request: {
      query: z.object({
        patientId: z.uuid().optional().openapi({ description: 'Filter by patient ID' }),
      }),
    },
    responses: okJson(z.array(visitNoteDtoSchema), 'List of visit notes'),
  });

  app.openapi(listRoute, async (c) => {
    const { patientId } = c.req.valid('query');
    const rows = await service.list(c, patientId);
    return c.json(ok(rows.map(toVisitNoteDto)), 200);
  });

  // ─── POST /visit-notes — create ──────────────────────────────────────────

  const createRoute_ = createRoute({
    method: 'post',
    path: '/visit-notes',
    tags: ['visit-notes'],
    operationId: 'createVisitNote',
    middleware: [requirePermission('medical_record.edit')] as const,
    request: {
      body: { content: { 'application/json': { schema: createVisitNoteSchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(visitNoteDtoSchema) } },
        description: 'Visit note created',
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
    },
  });

  app.openapi(createRoute_, async (c) => {
    const body = c.req.valid('json');
    const note = await service.create(c, body);
    if (!note) throw new Error('Visit note creation failed');
    return c.json(ok(toVisitNoteDto(note)), 201);
  });

  // ─── GET /visit-notes/{id} — get by id ──────────────────────────────────

  const getRoute = createRoute({
    method: 'get',
    path: '/visit-notes/{id}',
    tags: ['visit-notes'],
    operationId: 'getVisitNote',
    middleware: [requirePermission('medical_record.view')] as const,
    request: {
      params: z.object({ id: z.uuid() }),
    },
    responses: { ...okJson(visitNoteDtoSchema, 'Visit note'), ...notFoundResponse },
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const note = await service.get(c, id);
    if (!note) return c.json(fail('note.not_found', 'Note not found'), 404);
    return c.json(ok(toVisitNoteDto(note)), 200);
  });

  // ─── PATCH /visit-notes/{id} — update ───────────────────────────────────

  const updateRoute = createRoute({
    method: 'patch',
    path: '/visit-notes/{id}',
    tags: ['visit-notes'],
    operationId: 'updateVisitNote',
    middleware: [requirePermission('medical_record.edit')] as const,
    request: {
      params: z.object({ id: z.uuid() }),
      body: { content: { 'application/json': { schema: updateVisitNoteSchema } } },
    },
    responses: { ...okJson(visitNoteDtoSchema, 'Updated visit note'), ...notFoundResponse },
  });

  app.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const note = await service.update(c, id, body);
    if (!note) return c.json(fail('note.not_found', 'Note not found'), 404);
    return c.json(ok(toVisitNoteDto(note)), 200);
  });

  return app;
};
