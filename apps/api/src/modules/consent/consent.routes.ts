import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toConsentFormDto, toConsentTemplateDto } from './consent.mapper.ts';
import {
  consentFormDtoSchema,
  consentTemplateDtoSchema,
  createTemplateSchema,
  listFormsQuerySchema,
  listTemplatesQuerySchema,
  signFormSchema,
  templateIdParamSchema,
  updateTemplateSchema,
} from './consent.schema.ts';
import { createConsentService } from './consent.service.ts';

/** Standart 404 response — get / patch endpoint'lar uchun. */
const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Template not found',
  },
};

export const consentRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createConsentService(deps);

  // ─── GET /templates — list ────────────────────────────────────────────────

  const listTemplatesRoute = createRoute({
    method: 'get',
    path: '/templates',
    tags: ['consent'],
    operationId: 'listConsentTemplates',
    middleware: [requirePermission('consent.view')] as const,
    request: {
      query: listTemplatesQuerySchema,
    },
    responses: okJson(z.array(consentTemplateDtoSchema), 'List of consent templates'),
  });

  app.openapi(listTemplatesRoute, async (c) => {
    const { type, active } = c.req.valid('query');
    const activeOnly = active !== 'false';
    const rows = await service.listTemplates(c, type, activeOnly);
    return c.json(ok(rows.map(toConsentTemplateDto)), 200);
  });

  // ─── POST /templates — create ─────────────────────────────────────────────

  const createTemplateRoute = createRoute({
    method: 'post',
    path: '/templates',
    tags: ['consent'],
    operationId: 'createConsentTemplate',
    middleware: [requirePermission('consent.manage')] as const,
    request: {
      body: { content: { 'application/json': { schema: createTemplateSchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(consentTemplateDtoSchema) } },
        description: 'Consent template created',
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

  app.openapi(createTemplateRoute, async (c) => {
    const body = c.req.valid('json');
    const row = await service.createTemplate(c, body);
    if (!row) throw new Error('Consent template creation failed');
    return c.json(ok(toConsentTemplateDto(row)), 201);
  });

  // ─── GET /templates/{id} — get by id ─────────────────────────────────────

  const getTemplateRoute = createRoute({
    method: 'get',
    path: '/templates/{id}',
    tags: ['consent'],
    operationId: 'getConsentTemplate',
    middleware: [requirePermission('consent.view')] as const,
    request: {
      params: templateIdParamSchema,
    },
    responses: { ...okJson(consentTemplateDtoSchema, 'Consent template'), ...notFoundResponse },
  });

  app.openapi(getTemplateRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = await service.getTemplate(c, id);
    if (!row) return c.json(fail('template.not_found', 'Not found'), 404);
    return c.json(ok(toConsentTemplateDto(row)), 200);
  });

  // ─── PATCH /templates/{id} — update ──────────────────────────────────────

  const updateTemplateRoute = createRoute({
    method: 'patch',
    path: '/templates/{id}',
    tags: ['consent'],
    operationId: 'updateConsentTemplate',
    middleware: [requirePermission('consent.manage')] as const,
    request: {
      params: templateIdParamSchema,
      body: { content: { 'application/json': { schema: updateTemplateSchema } } },
    },
    responses: {
      ...okJson(consentTemplateDtoSchema, 'Updated consent template'),
      ...notFoundResponse,
    },
  });

  app.openapi(updateTemplateRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await service.updateTemplate(c, id, body);
    if (!row) return c.json(fail('template.not_found', 'Not found'), 404);
    return c.json(ok(toConsentTemplateDto(row)), 200);
  });

  // ─── GET /forms — list ────────────────────────────────────────────────────

  const listFormsRoute = createRoute({
    method: 'get',
    path: '/forms',
    tags: ['consent'],
    operationId: 'listConsentForms',
    middleware: [requirePermission('consent.view')] as const,
    request: {
      query: listFormsQuerySchema,
    },
    responses: okJson(z.array(consentFormDtoSchema), 'List of signed consent forms'),
  });

  app.openapi(listFormsRoute, async (c) => {
    const { patientId } = c.req.valid('query');
    const rows = await service.listForms(c, patientId);
    return c.json(ok(rows.map(toConsentFormDto)), 200);
  });

  // ─── POST /forms — sign ───────────────────────────────────────────────────

  const signFormRoute = createRoute({
    method: 'post',
    path: '/forms',
    tags: ['consent'],
    operationId: 'signConsentForm',
    middleware: [requirePermission('consent.manage')] as const,
    request: {
      body: { content: { 'application/json': { schema: signFormSchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(consentFormDtoSchema) } },
        description: 'Consent form signed',
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

  app.openapi(signFormRoute, async (c) => {
    const body = c.req.valid('json');
    const row = await service.signForm(c, body);
    if (!row) throw new Error('Consent form signing failed');
    return c.json(ok(toConsentFormDto(row)), 201);
  });

  return app;
};
