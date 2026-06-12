import type { diagnoses } from '@dental/db-schema';

type DiagnosisRow = typeof diagnoses.$inferSelect;

/** Javob = DB row (api-client invariant). */
export const toDiagnosisDto = (d: DiagnosisRow) => d;
