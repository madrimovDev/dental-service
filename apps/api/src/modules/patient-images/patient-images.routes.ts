import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toPatientImageDto } from './patient-images.mapper.ts';
import {
  ALLOWED_CONTENT_TYPES,
  extFromContentType,
  imageType,
  MAX_UPLOAD_BYTES,
  patientImageDeleteSchema,
  patientImageIdParamSchema,
  patientImageSchema,
  patientImagesByPatientParamSchema,
  updateImageMetadataSchema,
} from './patient-images.schema.ts';
import { createPatientImagesService } from './patient-images.service.ts';

/** Standart 404 — get / patch / delete uchun. */
const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Image not found',
  },
};

export const patientImagesRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createPatientImagesService(deps);

  // ─── GET /patients/{patientId}/images — list ─────────────────────────────
  const listRoute = createRoute({
    method: 'get',
    path: '/patients/{patientId}/images',
    tags: ['patient-images'],
    operationId: 'listPatientImages',
    middleware: [requirePermission('patient_image.view')] as const,
    request: { params: patientImagesByPatientParamSchema },
    responses: okJson(z.array(patientImageSchema), 'Patient images'),
  });

  app.openapi(listRoute, async (c) => {
    const rows = await service.list(c, c.req.valid('param').patientId);
    return c.json(ok(rows.map(toPatientImageDto)), 200);
  });

  // ─── POST /patient-images — upload (multipart) — HAND qoladi ─────────────
  // generated orval mutator multipart'ni qo'llab-quvvatlamaydi; frontend `api.upload()`
  // orqali yuboradi, shu sabab bu route OpenAPI spec'iga KIRMAYDI (createRoute emas).
  app.post('/patient-images', requirePermission('patient_image.upload'), async (c) => {
    const form = await c.req.formData();
    const file = form.get('file');
    const patientId = form.get('patientId')?.toString();
    const typeRaw = form.get('type')?.toString();
    const title = form.get('title')?.toString();
    const description = form.get('description')?.toString();
    const toothNumbersRaw = form.get('toothNumbers')?.toString();
    const takenDate = form.get('takenDate')?.toString();

    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: 'Missing file' });
    }
    if (!patientId) throw new HTTPException(400, { message: 'Missing patientId' });
    const typeParsed = imageType.safeParse(typeRaw);
    if (!typeParsed.success) throw new HTTPException(400, { message: 'Invalid type' });

    if (file.size > MAX_UPLOAD_BYTES) {
      throw new HTTPException(413, { message: `File too large (max ${MAX_UPLOAD_BYTES} bytes)` });
    }
    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      throw new HTTPException(415, { message: `Unsupported content type: ${file.type}` });
    }

    const toothNumbers = toothNumbersRaw
      ? toothNumbersRaw
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n) && n > 0)
      : undefined;

    const body = await file.arrayBuffer();

    const row = await service.upload(c, {
      patientId,
      type: typeParsed.data,
      title,
      description,
      toothNumbers,
      takenDate,
      originalFilename: file.name,
      contentType: file.type,
      ext: extFromContentType(file.type),
      body,
    });
    return c.json(ok(toPatientImageDto(row)), 201);
  });

  // ─── GET /patient-images/{id} — get ──────────────────────────────────────
  const getRoute = createRoute({
    method: 'get',
    path: '/patient-images/{id}',
    tags: ['patient-images'],
    operationId: 'getPatientImage',
    middleware: [requirePermission('patient_image.view')] as const,
    request: { params: patientImageIdParamSchema },
    responses: { ...okJson(patientImageSchema, 'Patient image'), ...notFoundResponse },
  });

  app.openapi(getRoute, async (c) => {
    const row = await service.get(c, c.req.valid('param').id);
    if (!row) return c.json(fail('image.not_found', 'Not found'), 404);
    return c.json(ok(toPatientImageDto(row)), 200);
  });

  // ─── PATCH /patient-images/{id} — update metadata ────────────────────────
  const updateRoute = createRoute({
    method: 'patch',
    path: '/patient-images/{id}',
    tags: ['patient-images'],
    operationId: 'updatePatientImage',
    middleware: [requirePermission('patient_image.upload')] as const,
    request: {
      params: patientImageIdParamSchema,
      body: { content: { 'application/json': { schema: updateImageMetadataSchema } } },
    },
    responses: { ...okJson(patientImageSchema, 'Updated image'), ...notFoundResponse },
  });

  app.openapi(updateRoute, async (c) => {
    const row = await service.updateMetadata(c, c.req.valid('param').id, c.req.valid('json'));
    if (!row) return c.json(fail('image.not_found', 'Not found'), 404);
    return c.json(ok(toPatientImageDto(row)), 200);
  });

  // ─── DELETE /patient-images/{id} — remove ────────────────────────────────
  const deleteRoute = createRoute({
    method: 'delete',
    path: '/patient-images/{id}',
    tags: ['patient-images'],
    operationId: 'deletePatientImage',
    middleware: [requirePermission('patient_image.upload')] as const,
    request: { params: patientImageIdParamSchema },
    responses: { ...okJson(patientImageDeleteSchema, 'Image deleted'), ...notFoundResponse },
  });

  app.openapi(deleteRoute, async (c) => {
    const row = await service.remove(c, c.req.valid('param').id);
    if (!row) return c.json(fail('image.not_found', 'Not found'), 404);
    return c.json(ok({ deleted: true as const }), 200);
  });

  return app;
};
