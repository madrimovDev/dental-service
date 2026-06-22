import type {
  MedicalRecord,
  Patient,
  PatientEmergencyContact,
  PatientRelative,
} from '@dental/db-schema';
import type {
  EmergencyContactDto,
  MedicalRecordDto,
  PatientDto,
  PatientListItemDto,
  PatientRelativeDto,
} from './patients.schema.ts';

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
