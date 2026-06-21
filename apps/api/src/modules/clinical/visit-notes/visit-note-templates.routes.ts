import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../../lib/openapi.ts';
import { requirePermission } from '../../../middleware/require-permission.ts';
import { toVisitNoteTemplateDto } from './visit-note-templates.mapper.ts';
import {
  createVisitNoteTemplateSchema,
  updateVisitNoteTemplateSchema,
  visitNoteTemplateDeleteResultSchema,
  visitNoteTemplateDtoSchema,
} from './visit-note-templates.schema.ts';
import { createVisitNoteTemplatesService } from './visit-note-templates.service.ts';

/** Standart 404 — owner-scoped (boshqa doktor template'i ko'rinmaydi → 404). */
const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Template not found',
  },
};

export const visitNoteTemplatesRoutes = (deps: { audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  const service = createVisitNoteTemplatesService(deps);

  // ─── GET /visit-note-templates — list (isShared OR own) ──────────────────
  const listRoute = createRoute({
    method: 'get',
    path: '/visit-note-templates',
    tags: ['visit-note-templates'],
    operationId: 'listVisitNoteTemplates',
    middleware: [requirePermission('medical_record.view')] as const,
    request: {
      query: z.object({
        category: z.string().optional().openapi({ description: 'Filter by category' }),
      }),
    },
    responses: okJson(z.array(visitNoteTemplateDtoSchema), 'List of visit note templates'),
  });

  app.openapi(listRoute, async (c) => {
    const { category } = c.req.valid('query');
    const rows = await service.list(c, category);
    return c.json(ok(rows.map(toVisitNoteTemplateDto)), 200);
  });

  // ─── POST /visit-note-templates — create ─────────────────────────────────
  const createRoute_ = createRoute({
    method: 'post',
    path: '/visit-note-templates',
    tags: ['visit-note-templates'],
    operationId: 'createVisitNoteTemplate',
    middleware: [requirePermission('medical_record.edit')] as const,
    request: {
      body: { content: { 'application/json': { schema: createVisitNoteTemplateSchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(visitNoteTemplateDtoSchema) } },
        description: 'Template created',
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
    const row = await service.create(c, body);
    if (!row) throw new Error('Template creation failed');
    return c.json(ok(toVisitNoteTemplateDto(row)), 201);
  });

  // ─── PATCH /visit-note-templates/{id} — update (owner-only) ──────────────
  const updateRoute = createRoute({
    method: 'patch',
    path: '/visit-note-templates/{id}',
    tags: ['visit-note-templates'],
    operationId: 'updateVisitNoteTemplate',
    middleware: [requirePermission('medical_record.edit')] as const,
    request: {
      params: z.object({ id: z.uuid() }),
      body: { content: { 'application/json': { schema: updateVisitNoteTemplateSchema } } },
    },
    responses: { ...okJson(visitNoteTemplateDtoSchema, 'Updated template'), ...notFoundResponse },
  });

  app.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await service.update(c, id, body);
    if (!row) return c.json(fail('template.not_found', 'Template not found'), 404);
    return c.json(ok(toVisitNoteTemplateDto(row)), 200);
  });

  // ─── DELETE /visit-note-templates/{id} — delete (owner-only) ─────────────
  const deleteRoute = createRoute({
    method: 'delete',
    path: '/visit-note-templates/{id}',
    tags: ['visit-note-templates'],
    operationId: 'deleteVisitNoteTemplate',
    middleware: [requirePermission('medical_record.edit')] as const,
    request: { params: z.object({ id: z.uuid() }) },
    responses: {
      ...okJson(visitNoteTemplateDeleteResultSchema, 'Template deleted'),
      ...notFoundResponse,
    },
  });

  app.openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = await service.remove(c, id);
    if (!row) return c.json(fail('template.not_found', 'Template not found'), 404);
    return c.json(ok({ deleted: true as const }), 200);
  });

  return app;
};
