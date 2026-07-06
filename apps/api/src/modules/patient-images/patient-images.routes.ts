import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { requireModuleInDesktop } from '../../lib/license-middleware.ts';
import { errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { CrossEntityError } from '../../lib/ownership.ts';
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
  patientImagesListQuerySchema,
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

  // requireModuleInDesktop('patient-images') is applied PER-ROUTE below
  // (each route's `middleware:` array, or inline for the hand-written
  // upload route), NOT as `app.use('*', ...)` or even a path-scoped
  // `app.use(pattern, ...)`. Two reasons:
  //
  // 1. patientImagesRoutes is mounted at the BARE `/api` prefix in app.ts
  //    (like clinicalRoutes — see that file's comment for the full Hono
  //    `.route()` prefix-flattening explanation), so a bare `'*'` would
  //    become `/api/*` and bleed onto every route group mounted after this
  //    one (expenses, stock, payroll, notifications — none in MODULE_MAP).
  //
  // 2. Path-scoped `app.use(pattern, ...)` doesn't work either: app.ts also
  //    mounts clinicalRoutes at bare `/api`, and empirically, when TWO
  //    independently-built OpenAPIHono instances that each register their
  //    own `.use(pattern, ...)` are merged via `.route()` into a third
  //    (parent) app at the SAME prefix, the SECOND-merged instance's
  //    `.use()` middleware silently stops matching for ALL its own
  //    patterns — not just ones that textually overlap with the first
  //    instance's patterns. Reproduced via runtime probes (mount order
  //    flips which side breaks; a single flat app with both sets of
  //    patterns registered directly on ONE instance works fine — so this
  //    is specific to merging two separately-built instances). Per-route
  //    `middleware:` arrays don't hit this because they don't register a
  //    `.use()` pattern at all — this is the only reliable option for the
  //    second bare-`/api` module (patient-images, mounted after clinical).
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createPatientImagesService(deps);

  // ─── GET /patients/{patientId}/images — list ─────────────────────────────
  const listRoute = createRoute({
    method: 'get',
    path: '/patients/{patientId}/images',
    tags: ['patient-images'],
    operationId: 'listPatientImages',
    // requireModuleInDesktop here, not `.use()` — see the comment above the
    // `gate` const for why (Hono `.route()` merge quirk with clinicalRoutes'
    // overlapping /patients/:patientId/* param-prefix).
    middleware: [
      requireModuleInDesktop('patient-images'),
      requirePermission('patient_image.view'),
    ] as const,
    request: {
      params: patientImagesByPatientParamSchema,
      query: patientImagesListQuerySchema,
    },
    responses: okJson(z.array(patientImageSchema), 'Patient images'),
  });

  app.openapi(listRoute, async (c) => {
    const { visitNoteId } = c.req.valid('query');
    const rows = await service.list(c, c.req.valid('param').patientId, visitNoteId);
    return c.json(ok(rows.map(toPatientImageDto)), 200);
  });

  // ─── POST /patient-images — upload (multipart) — HAND qoladi ─────────────
  // generated orval mutator multipart'ni qo'llab-quvvatlamaydi; frontend `api.upload()`
  // orqali yuboradi, shu sabab bu route OpenAPI spec'iga KIRMAYDI (createRoute emas).
  app.post(
    '/patient-images',
    requireModuleInDesktop('patient-images'),
    requirePermission('patient_image.upload'),
    async (c) => {
      const form = await c.req.formData();
      const file = form.get('file');
      const patientId = form.get('patientId')?.toString();
      const typeRaw = form.get('type')?.toString();
      const title = form.get('title')?.toString();
      const description = form.get('description')?.toString();
      const toothNumbersRaw = form.get('toothNumbers')?.toString();
      const takenDate = form.get('takenDate')?.toString();
      const visitNoteId = form.get('visitNoteId')?.toString() || undefined;

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

      try {
        const row = await service.upload(c, {
          patientId,
          type: typeParsed.data,
          title,
          description,
          toothNumbers,
          takenDate,
          visitNoteId,
          originalFilename: file.name,
          contentType: file.type,
          ext: extFromContentType(file.type),
          body,
        });
        return c.json(ok(toPatientImageDto(row)), 201);
      } catch (e) {
        // CLI-421: cross-entity ownership mismatch (patientId/visitNoteId) → 400.
        if (e instanceof CrossEntityError) {
          throw new HTTPException(400, { message: `ownership.${e.reason}: ${e.message}` });
        }
        throw e;
      }
    },
  );

  // ─── GET /patient-images/{id} — get ──────────────────────────────────────
  const getRoute = createRoute({
    method: 'get',
    path: '/patient-images/{id}',
    tags: ['patient-images'],
    operationId: 'getPatientImage',
    middleware: [
      requireModuleInDesktop('patient-images'),
      requirePermission('patient_image.view'),
    ] as const,
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
    middleware: [
      requireModuleInDesktop('patient-images'),
      requirePermission('patient_image.upload'),
    ] as const,
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
    middleware: [
      requireModuleInDesktop('patient-images'),
      requirePermission('patient_image.upload'),
    ] as const,
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
