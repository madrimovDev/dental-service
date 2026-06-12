import { fail, ok } from '@dental/core';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { requirePermission } from '../../../middleware/require-permission.ts';
import { createVisitNoteSchema, updateVisitNoteSchema } from './visit-notes.schema.ts';
import { createVisitNotesService } from './visit-notes.service.ts';

export const visitNotesRoutes = (deps: {
  audit: AuditLogger;
  deductStock?: (c: Context, serviceIds: string[], visitNoteId: string) => Promise<void>;
}) => {
  const app = new Hono();
  const service = createVisitNotesService(deps);

  app.get('/visit-notes', requirePermission('medical_record.view'), async (c) => {
    const patientId = c.req.query('patientId') ?? undefined;
    return c.json(ok(await service.list(c, patientId)));
  });

  app.post('/visit-notes', requirePermission('medical_record.edit'), async (c) => {
    const body = createVisitNoteSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const note = await service.create(c, body.data);
    return c.json(ok(note), 201);
  });

  app.get('/visit-notes/:id', requirePermission('medical_record.view'), async (c) => {
    const note = await service.get(c, c.req.param('id'));
    if (!note) return c.json(fail('note.not_found', 'Note not found'), 404);
    return c.json(ok(note));
  });

  app.patch('/visit-notes/:id', requirePermission('medical_record.edit'), async (c) => {
    const body = updateVisitNoteSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const note = await service.update(c, c.req.param('id'), body.data);
    if (!note) return c.json(fail('note.not_found', 'Note not found'), 404);
    return c.json(ok(note));
  });

  return app;
};
