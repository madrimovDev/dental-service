import type { visitNoteTemplates } from '@dental/db-schema';
import type { VisitNoteTemplateDto } from './visit-note-templates.schema.ts';

type VisitNoteTemplateRow = typeof visitNoteTemplates.$inferSelect;

/** DB row → wire DTO (Date → ISO string). */
export const toVisitNoteTemplateDto = (row: VisitNoteTemplateRow): VisitNoteTemplateDto => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  category: row.category ?? null,
  template: row.template ?? {},
  isShared: row.isShared,
  createdBy: row.createdBy ?? null,
  createdAt: row.createdAt.toISOString(),
});
