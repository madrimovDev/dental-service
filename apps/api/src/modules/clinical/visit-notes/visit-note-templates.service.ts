import type { Context } from 'hono';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { createVisitNoteTemplatesRepository } from './visit-note-templates.repository.ts';
import type {
  CreateVisitNoteTemplateInput,
  UpdateVisitNoteTemplateInput,
} from './visit-note-templates.schema.ts';

export const createVisitNoteTemplatesService = (deps: { audit: AuditLogger }) => {
  const repo = createVisitNoteTemplatesRepository();

  const list = (c: Context, category?: string) => {
    const userId = c.get('user')?.id ?? '';
    return repo.list(c, userId, category);
  };

  async function create(c: Context, input: CreateVisitNoteTemplateInput) {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');
    const userId = c.get('user')?.id ?? null;

    const row = await repo.insert(c, {
      tenantId,
      name: input.name,
      category: input.category ?? null,
      template: input.template,
      isShared: input.isShared,
      createdBy: userId,
    });

    if (row) {
      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'visit_note_template',
        resourceId: row.id,
        after: { name: row.name, isShared: row.isShared },
      });
    }
    return row;
  }

  async function update(c: Context, id: string, input: UpdateVisitNoteTemplateInput) {
    const userId = c.get('user')?.id ?? '';
    const before = await repo.findOwned(c, id, userId);
    if (!before) return null;

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.category !== undefined) patch.category = input.category;
    if (input.template !== undefined) patch.template = input.template;
    if (input.isShared !== undefined) patch.isShared = input.isShared;

    // Bo'sh PATCH — Drizzle `.set({})` xato beradi; owner allaqachon tekshirilgan → no-op.
    if (Object.keys(patch).length === 0) return before;

    const updated = await repo.update(c, id, userId, patch);
    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'visit_note_template',
        resourceId: id,
        before,
        after: updated,
      });
    }
    return updated;
  }

  async function remove(c: Context, id: string) {
    const userId = c.get('user')?.id ?? '';
    const removed = await repo.remove(c, id, userId);
    if (removed) {
      await deps.audit.record(c, {
        action: 'deleted',
        resourceType: 'visit_note_template',
        resourceId: id,
        before: removed,
      });
    }
    return removed;
  }

  return { list, create, update, remove };
};

export type VisitNoteTemplatesService = ReturnType<typeof createVisitNoteTemplatesService>;
