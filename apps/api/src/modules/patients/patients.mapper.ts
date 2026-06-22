import type {
  MedicalRecord,
  Patient,
  PatientEmergencyContact,
  PatientRelative,
} from '@dental/db-schema';
import type {
  EmergencyContactDto,
  MedicalRecordDto,
  MedicalRecordHistoryEntryDto,
  PatientDto,
  PatientListItemDto,
  PatientRelativeDto,
} from './patients.schema.ts';

/** Medical record snapshot'larida o'zgargan field'lar (audit_log before/after). */
const MEDICAL_RECORD_TRACKED_FIELDS = [
  'anamnez',
  'chronicConditions',
  'currentMedications',
  'allergies',
  'bloodType',
  'pregnancyStatus',
  'testResults',
] as const;

type AuditHistoryRow = {
  id: string;
  changedAt: Date;
  changedById: string | null;
  changedByName: string | null;
  before: unknown;
  after: unknown;
};

/** audit_log yozuvi → tarix DTO (field-darajali diff). */
export const toMedicalRecordHistoryEntry = (row: AuditHistoryRow): MedicalRecordHistoryEntryDto => {
  const before = (row.before ?? {}) as Record<string, unknown>;
  const after = (row.after ?? {}) as Record<string, unknown>;
  const changes = MEDICAL_RECORD_TRACKED_FIELDS.filter(
    (f) => JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null),
  ).map((f) => ({ field: f, before: before[f] ?? null, after: after[f] ?? null }));

  return {
    id: row.id,
    changedAt: row.changedAt.toISOString(),
    changedBy: row.changedById ? { id: row.changedById, fullName: row.changedByName ?? '' } : null,
    changes,
  };
};

/**
 * Patient DB row → wire DTO.
 * ⚠️ `dateOfBirth` is a drizzle `date` column (string mode) — passthrough, NO .toISOString().
 * `archivedAt`/`createdAt`/`updatedAt` are `timestamp` (Date) → ISO string.
 */
export const toPatientDto = (row: Patient): PatientDto => ({
  id: row.id,
  tenantId: row.tenantId,
  fullName: row.fullName,
  dateOfBirth: row.dateOfBirth ?? null,
  gender: row.gender ?? null,
  phone: row.phone ?? null,
  phoneSecondary: row.phoneSecondary ?? null,
  passport: row.passport ?? null,
  address: row.address ?? null,
  photoUrl: row.photoUrl ?? null,
  notes: row.notes ?? null,
  tags: row.tags ?? [],
  source: row.source ?? null,
  insurance: row.insurance ?? null,
  archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** List item — Patient DTO + computed balance (already masked upstream). */
export const toPatientListItemDto = (row: Patient & { balance: number }): PatientListItemDto => ({
  ...toPatientDto(row),
  balance: row.balance,
});

/** Medical record DB row → wire DTO. Timestamps ISO; JSONB fields passthrough. */
export const toMedicalRecordDto = (row: MedicalRecord): MedicalRecordDto => ({
  id: row.id,
  tenantId: row.tenantId,
  patientId: row.patientId,
  anamnez: row.anamnez ?? null,
  chronicConditions: row.chronicConditions ?? null,
  currentMedications: row.currentMedications ?? null,
  allergies: row.allergies ?? null,
  bloodType: row.bloodType ?? null,
  pregnancyStatus: row.pregnancyStatus ?? null,
  testResults: row.testResults ?? null,
  lastUpdatedBy: row.lastUpdatedBy ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** Qarindosh link row DTO (`relatives.add` raw insert qaytaradi). */
export const toPatientRelativeDto = (row: PatientRelative): PatientRelativeDto => ({
  id: row.id,
  tenantId: row.tenantId,
  patientId: row.patientId,
  relativePatientId: row.relativePatientId,
  relationship: row.relationship,
  createdAt: row.createdAt.toISOString(),
});

/** Erkin emergency contact row → wire DTO. */
export const toEmergencyContactDto = (row: PatientEmergencyContact): EmergencyContactDto => ({
  id: row.id,
  tenantId: row.tenantId,
  patientId: row.patientId,
  name: row.name,
  phone: row.phone,
  relationship: row.relationship ?? null,
  isPrimary: row.isPrimary,
  createdAt: row.createdAt.toISOString(),
});
