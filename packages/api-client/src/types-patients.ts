export type Gender = 'male' | 'female' | 'other';

export type Patient = {
  id: string;
  tenantId: string;
  fullName: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  phone: string | null;
  phoneSecondary: string | null;
  passport: string | null;
  address: string | null;
  photoUrl: string | null;
  notes: string | null;
  tags: string[];
  source: string | null;
  insurance: { provider: string; policyNumber: string } | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PatientListItem = Patient & { balance: number };

export type AllergyEntry = {
  type: 'anesthetic' | 'medication' | 'material' | 'food' | 'other';
  substance: string;
  severity: 'mild' | 'moderate' | 'severe';
  notes?: string;
};
