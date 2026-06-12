import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import {
  toMedicalRecordDto,
  toPatientDto,
  toPatientListItemDto,
  toPatientRelativeDto,
} from './patients.mapper.ts';
import {
  addRelativeSchema,
  createPatientSchema,
  listQuerySchema,
  medicalRecordDtoSchema,
  patientArchiveResultSchema,
  patientBalanceSchema,
  patientDtoSchema,
  patientIdParamSchema,
  patientListResponseDtoSchema,
  patientRelativeDtoSchema,
  patientRelativeViewSchema,
  relativeParamSchema,
  relativeRemoveResultSchema,
  updateMedicalRecordSchema,
  updatePatientSchema,
} from './patients.schema.ts';
import { createPatientsService } from './patients.service.ts';

/** Standart 404 — get / patch / archive / medical endpoint'lar uchun. */
const patientNotFound = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Patient not found',
  },
};

const medicalNotFound = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Medical record not found',
  },
};

const relativeNotFound = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Relative link not found',
  },
};

export const patientRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createPatientsService({ audit: deps.audit });

  // ─── GET / — list ────────────────────────────────────────────────────────

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['patients'],
    operationId: 'listPatients',
    middleware: [requirePermission('patient.view')] as const,
    request: { query: listQuerySchema },
    responses: okJson(patientListResponseDtoSchema, 'Paginated list of patients'),
  });

  app.openapi(listRoute, async (c) => {
    const query = c.req.valid('query');
    const result = await service.list(c, query);
    return c.json(
      ok({
        data: result.data.map(toPatientListItemDto),
        meta: result.meta,
      }),
      200,
    );
  });

  // ─── POST / — create ─────────────────────────────────────────────────────

  const createPatientRoute = createRoute({
    method: 'post',
    path: '/',
    tags: ['patients'],
    operationId: 'createPatient',
    middleware: [requirePermission('patient.create')] as const,
    request: {
      body: { content: { 'application/json': { schema: createPatientSchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(patientDtoSchema) } },
        description: 'Patient created',
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

  app.openapi(createPatientRoute, async (c) => {
    const body = c.req.valid('json');
    const row = await service.create(c, body);
    return c.json(ok(toPatientDto(row)), 201);
  });

  // ─── GET /{id} — get by id ───────────────────────────────────────────────

  const getRoute = createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['patients'],
    operationId: 'getPatient',
    middleware: [requirePermission('patient.view')] as const,
    request: { params: patientIdParamSchema },
    responses: { ...okJson(patientDtoSchema, 'Patient'), ...patientNotFound },
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = await service.findById(c, id);
    if (!row) return c.json(fail('patient.not_found', 'Patient not found'), 404);
    return c.json(ok(toPatientDto(row)), 200);
  });

  // ─── GET /{id}/balance — computed balance ────────────────────────────────

  const balanceRoute = createRoute({
    method: 'get',
    path: '/{id}/balance',
    tags: ['patients'],
    operationId: 'getPatientBalance',
    middleware: [requirePermission('patient.view')] as const,
    request: { params: patientIdParamSchema },
    responses: okJson(patientBalanceSchema, 'Patient balance'),
  });

  app.openapi(balanceRoute, async (c) => {
    const { id } = c.req.valid('param');
    const balance = await service.balanceFor(c, id);
    return c.json(ok(balance), 200);
  });

  // ─── PATCH /{id} — update ────────────────────────────────────────────────

  const updateRoute = createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['patients'],
    operationId: 'updatePatient',
    middleware: [requirePermission('patient.edit')] as const,
    request: {
      params: patientIdParamSchema,
      body: { content: { 'application/json': { schema: updatePatientSchema } } },
    },
    responses: { ...okJson(patientDtoSchema, 'Updated patient'), ...patientNotFound },
  });

  app.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await service.update(c, id, body);
    if (!row) return c.json(fail('patient.not_found', 'Patient not found'), 404);
    return c.json(ok(toPatientDto(row)), 200);
  });

  // ─── DELETE /{id} — archive (soft delete) ────────────────────────────────

  const archiveRoute = createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['patients'],
    operationId: 'archivePatient',
    middleware: [requirePermission('patient.delete')] as const,
    request: { params: patientIdParamSchema },
    responses: { ...okJson(patientArchiveResultSchema, 'Patient archived'), ...patientNotFound },
  });

  app.openapi(archiveRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = await service.archive(c, id);
    if (!row) return c.json(fail('patient.not_found', 'Patient not found'), 404);
    return c.json(ok({ archived: true as const, id: row.id }), 200);
  });

  // ─── Medical record sub-resource ─────────────────────────────────────────

  const getMedicalRoute = createRoute({
    method: 'get',
    path: '/{id}/medical',
    tags: ['patients'],
    operationId: 'getMedicalRecord',
    middleware: [requirePermission('medical_record.view')] as const,
    request: { params: patientIdParamSchema },
    responses: { ...okJson(medicalRecordDtoSchema, 'Medical record'), ...medicalNotFound },
  });

  app.openapi(getMedicalRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = await service.getMedicalRecord(c, id);
    if (!row) return c.json(fail('medical_record.not_found', 'Medical record not found'), 404);
    return c.json(ok(toMedicalRecordDto(row)), 200);
  });

  const updateMedicalRoute = createRoute({
    method: 'patch',
    path: '/{id}/medical',
    tags: ['patients'],
    operationId: 'updateMedicalRecord',
    middleware: [requirePermission('medical_record.edit')] as const,
    request: {
      params: patientIdParamSchema,
      body: { content: { 'application/json': { schema: updateMedicalRecordSchema } } },
    },
    responses: {
      ...okJson(medicalRecordDtoSchema, 'Updated medical record'),
      ...medicalNotFound,
    },
  });

  app.openapi(updateMedicalRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await service.updateMedicalRecord(c, id, body);
    if (!row) return c.json(fail('medical_record.not_found', 'Medical record not found'), 404);
    return c.json(ok(toMedicalRecordDto(row)), 200);
  });

  // ─── Patient relatives (oila) sub-resource ───────────────────────────────

  const listRelativesRoute = createRoute({
    method: 'get',
    path: '/{id}/relatives',
    tags: ['patients'],
    operationId: 'listPatientRelatives',
    middleware: [requirePermission('patient.edit')] as const,
    request: { params: patientIdParamSchema },
    responses: okJson(z.array(patientRelativeViewSchema), 'List of patient relatives'),
  });

  app.openapi(listRelativesRoute, async (c) => {
    const { id } = c.req.valid('param');
    const rows = await service.listRelatives(c, id);
    return c.json(ok(rows), 200);
  });

  const addRelativeRoute = createRoute({
    method: 'post',
    path: '/{id}/relatives',
    tags: ['patients'],
    operationId: 'addPatientRelative',
    middleware: [requirePermission('patient.edit')] as const,
    request: {
      params: patientIdParamSchema,
      body: { content: { 'application/json': { schema: addRelativeSchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(patientRelativeDtoSchema) } },
        description: 'Relative link created',
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

  app.openapi(addRelativeRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await service.addRelative(c, id, body);
    if (!row) throw new Error('Relative link creation failed');
    return c.json(ok(toPatientRelativeDto(row)), 201);
  });

  const removeRelativeRoute = createRoute({
    method: 'delete',
    path: '/{id}/relatives/{relId}',
    tags: ['patients'],
    operationId: 'removePatientRelative',
    middleware: [requirePermission('patient.edit')] as const,
    request: { params: relativeParamSchema },
    responses: {
      ...okJson(relativeRemoveResultSchema, 'Relative link removed'),
      ...relativeNotFound,
    },
  });

  app.openapi(removeRelativeRoute, async (c) => {
    const { id, relId } = c.req.valid('param');
    const row = await service.removeRelative(c, id, relId);
    if (!row) return c.json(fail('patient_relative.not_found', 'Relative link not found'), 404);
    return c.json(ok({ removed: true as const, id: row.id }), 200);
  });

  return app;
};
