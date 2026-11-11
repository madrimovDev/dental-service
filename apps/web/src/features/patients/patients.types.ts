import type { Patient } from '@dental/api-client';

export type ListParams = { search?: string; archived?: boolean; page: number; pageSize?: number };

export type PatientListItem = {
  id: string;
  fullName: string;
  phone: string | null;
  age: number | null;
  genderLabel: string;
  tags: string[];
  balance: number;
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

export type { Patient };
