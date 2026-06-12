import type { visitNotes } from '@dental/db-schema';
import type { VisitNoteDto } from './visit-notes.schema.ts';

type VisitNoteRow = typeof visitNotes.$inferSelect;

/** DB row (Date timestamps) → wire DTO (ISO strings). Envelope type-check uchun zarur. */
export const toVisitNoteDto = (note: VisitNoteRow): VisitNoteDto => ({
  id: note.id,
  tenantId: note.tenantId,
  patientId: note.patientId,
  doctorId: note.doctorId,
  appointmentId: note.appointmentId ?? null,
  visitDate: note.visitDate.toISOString(),
  subjective: note.subjective ?? null,
  objective: note.objective ?? null,
  assessmentDiagnoses: note.assessmentDiagnoses ?? null,
  plan: note.plan ?? null,
  performedServices: note.performedServices ?? null,
  freeNotes: note.freeNotes ?? null,
  createdAt: note.createdAt.toISOString(),
  updatedAt: note.updatedAt.toISOString(),
});
