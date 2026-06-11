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
};

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
  insurance: { provider: string; policyNumber: string } | null;
  archived: boolean;
};

export type { Patient };
