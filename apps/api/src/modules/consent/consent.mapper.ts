import type { ConsentForm, ConsentTemplate } from '@dental/db-schema';
import type { ConsentFormDto, ConsentTemplateDto } from './consent.schema.ts';

/** DB row (Date timestamps) → wire DTO (ISO strings, nullable fields preserved). */
export const toConsentTemplateDto = (row: ConsentTemplate): ConsentTemplateDto => ({
  id: row.id,
  tenantId: row.tenantId,
  type: row.type,
  title: row.title,
  bodyUz: row.bodyUz,
  bodyRu: row.bodyRu ?? null,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** DB row (Date timestamps) → wire DTO (ISO strings, nullable fields preserved). */
export const toConsentFormDto = (row: ConsentForm): ConsentFormDto => ({
  id: row.id,
  tenantId: row.tenantId,
  patientId: row.patientId,
  templateId: row.templateId ?? null,
  type: row.type,
  title: row.title,
  bodyText: row.bodyText,
  language: row.language,
  signedAt: row.signedAt.toISOString(),
  signedByUserId: row.signedByUserId,
  patientSignatureName: row.patientSignatureName ?? null,
  notes: row.notes ?? null,
  createdAt: row.createdAt.toISOString(),
});
