import type { visitNotes } from '@dental/db-schema';

type VisitNoteRow = typeof visitNotes.$inferSelect;

/** Javob = DB row (api-client invariant). */
export const toVisitNoteDto = (note: VisitNoteRow) => note;
