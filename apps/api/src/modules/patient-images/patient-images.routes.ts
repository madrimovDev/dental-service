import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import {
  ALLOWED_CONTENT_TYPES,
  extFromContentType,
  imageType,
  MAX_UPLOAD_BYTES,
  updateImageMetadataSchema,
} from './patient-images.schema.ts';
import { createPatientImagesService } from './patient-images.service.ts';

export const patientImagesRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createPatientImagesService(deps);

  // List by patient
  app.get('/patients/:patientId/images', requirePermission('patient_image.view'), async (c) => {
    return c.json(ok(await service.list(c, c.req.param('patientId'))));
  });

  // Upload (multipart/form-data)
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
    return c.json(ok(row), 201);
  });

  app.get('/patient-images/:id', requirePermission('patient_image.view'), async (c) => {
    const row = await service.get(c, c.req.param('id'));
    if (!row) return c.json(fail('image.not_found', 'Not found'), 404);
    return c.json(ok(row));
  });

  app.patch('/patient-images/:id', requirePermission('patient_image.upload'), async (c) => {
    const body = updateImageMetadataSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.updateMetadata(c, c.req.param('id'), body.data);
    if (!row) return c.json(fail('image.not_found', 'Not found'), 404);
    return c.json(ok(row));
  });

  app.delete('/patient-images/:id', requirePermission('patient_image.upload'), async (c) => {
    const row = await service.remove(c, c.req.param('id'));
    if (!row) return c.json(fail('image.not_found', 'Not found'), 404);
    return c.json(ok({ deleted: true }));
  });

  return app;
};
