import type { getMedicalRecord, Patient } from '@dental/api-client';

type MedicalRecord = Awaited<ReturnType<typeof getMedicalRecord>>['data'];

export type ListParams = {
  search?: string;
  archived?: boolean;
  /** FU-24: «Qarzdorlar» filtri (balans > 0). */
  debt?: boolean;
  page: number;
  pageSize?: number;
};

export type PatientListItem = {
  id: string;
  fullName: string;
  phone: string | null;
  age: number | null;
  genderLabel: string;
  tags: string[];
  balance: number;
  // FU-24: eng yaqin kelajak faol yozilish (ISO) — `appointment.view`siz null.
  nextAppointmentAt: string | null;
  // CLI-474 (L7): faol no-show strike soni + chegara belgisi.
  noShowStrikes: number;
  flagged: boolean;
  // UI-R6: ro'yxat belgilari.
  flags: PatientFlags;
};

/** UI-R6: ro'yxat belgilari (backend `flags`). allergy — faqat bor/yo'q. */
export type PatientFlags = {
  allergy: boolean;
  debt: boolean;
  noShows: number;
  telegram: boolean;
};

/** UI-R6: telefon dublikat tekshiruvi natijasi (faqat id + ism). */
export type PhoneCheckMatch = { id: string; fullName: string };

export type PatientDetail = {
  id: string;
  fullName: string;
  phone: string | null;
  phoneSecondary: string | null;
  dateOfBirthFormatted: string | null;
  age: number | null;
  genderLabel: string;
  passport: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
  source: string | null;
  insurance: Patient['insurance'];
  insuranceStatus: Patient['insuranceStatus'];
  archived: boolean;
};

/**
 * Tibbiy karta + anamnez tasdig'i (UI-D2). `confirmedAt`/`confirmedBy` backend'da bor;
 * generated model kontrakt regeneratsiyasigacha ularni bilmaydi — shu paytgacha kengaytma.
 */
export type MedicalRecordView = MedicalRecord & {
  confirmedAt?: string | null;
  confirmedBy?: string | null;
};

export type { Patient };
