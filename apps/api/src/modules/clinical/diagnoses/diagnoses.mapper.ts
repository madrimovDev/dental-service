import type { diagnoses } from '@dental/db-schema';
import type { DiagnosisDto } from './diagnoses.schema.ts';

type DiagnosisRow = typeof diagnoses.$inferSelect;

/** DB row → wire DTO (api-client Diagnosis invariant). No timestamps — platform catalog. */
export const toDiagnosisDto = (d: DiagnosisRow): DiagnosisDto => ({
  id: d.id,
  code: d.code,
  nameUz: d.nameUz,
  nameRu: d.nameRu,
  category: d.category,
  descriptionUz: d.descriptionUz ?? null,
  descriptionRu: d.descriptionRu ?? null,
});
