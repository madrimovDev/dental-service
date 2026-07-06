import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toServiceCategoryDto } from './service-categories.mapper.ts';
import {
  createServiceCategorySchema,
  serviceCategoryDeleteResultSchema,
  serviceCategoryDtoSchema,
  serviceCategoryIdParamSchema,
  updateServiceCategorySchema,
} from './service-categories.schema.ts';
import {
  createServiceCategoriesService,
  SERVICE_CATEGORY_DUPLICATE,
  SERVICE_CATEGORY_IN_USE,
} from './service-categories.service.ts';

const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Service category not found',
  },
};

export const serviceCategoryRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createServiceCategoriesService({ audit: deps.audit });

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['service-categories'],
    operationId: 'listServiceCategories',
    middleware: [requirePermission('service.view')] as const,
    responses: okJson(z.array(serviceCategoryDtoSchema), 'List of service categories'),
  });
  app.openapi(listRoute, async (c) => {
    const rows = await service.list(c);
    return c.json(ok(rows.map(toServiceCategoryDto)), 200);
  });

  const createCatRoute = createRoute({
    method: 'post',
    path: '/',
    tags: ['service-categories'],
    operationId: 'createServiceCategory',
    middleware: [requirePermission('service.manage')] as const,
    request: {
      body: { content: { 'application/json': { schema: createServiceCategorySchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(serviceCategoryDtoSchema) } },
        description: 'Service category created',
      },
      409: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Duplicate name',
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
  app.openapi(createCatRoute, async (c) => {
    const body = c.req.valid('json');
    const res = await service.create(c, body);
    if ('error' in res)
      return c.json(fail(SERVICE_CATEGORY_DUPLICATE, 'Category already exists'), 409);
    return c.json(ok(toServiceCategoryDto(res.row)), 201);
  });

  const updateCatRoute = createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['service-categories'],
    operationId: 'updateServiceCategory',
    middleware: [requirePermission('service.manage')] as const,
    request: {
      params: serviceCategoryIdParamSchema,
      body: { content: { 'application/json': { schema: updateServiceCategorySchema } } },
    },
    responses: { ...okJson(serviceCategoryDtoSchema, 'Updated'), ...notFoundResponse },
  });
  app.openapi(updateCatRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const res = await service.update(c, id, body);
    if ('notFound' in res) return c.json(fail('service_category.not_found', 'Not found'), 404);
    if (!res.row) return c.json(fail('service_category.not_found', 'Not found'), 404);
    return c.json(ok(toServiceCategoryDto(res.row)), 200);
  });

  const deleteCatRoute = createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['service-categories'],
    operationId: 'deleteServiceCategory',
    middleware: [requirePermission('service.manage')] as const,
    request: { params: serviceCategoryIdParamSchema },
    responses: {
      ...okJson(serviceCategoryDeleteResultSchema, 'Deleted'),
      409: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Category in use',
      },
      ...notFoundResponse,
    },
  });
  app.openapi(deleteCatRoute, async (c) => {
    const { id } = c.req.valid('param');
    const res = await service.remove(c, id);
    if ('notFound' in res) return c.json(fail('service_category.not_found', 'Not found'), 404);
    if ('error' in res)
      return c.json(fail(SERVICE_CATEGORY_IN_USE, 'Category has linked services'), 409);
    return c.json(ok({ deleted: true as const }), 200);
  });

  return app;
};
