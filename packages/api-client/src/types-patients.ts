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

export type PatientBalance = {
  balance: number;
  planDebt: number;
  nonPlanBalance: number;
};

export type PatientListResponse = {
  data: PatientListItem[];
  meta: { page: number; pageSize: number; total: number };
};

export type AllergyEntry = {
  type: 'anesthetic' | 'medication' | 'material' | 'food' | 'other';
  substance: string;
  severity: 'mild' | 'moderate' | 'severe';
  notes?: string;
};

export type PregnancyStatus = 'not_applicable' | 'pregnant' | 'planning' | 'lactating';

export type TestResult = {
  date: string;
  result: 'positive' | 'negative' | 'unknown';
};

export type TestResults = {
  hiv?: TestResult;
  hepatitis_b?: TestResult;
  hepatitis_c?: TestResult;
  covid?: TestResult;
};

export type MedicalRecord = {
  id: string;
  tenantId: string;
  patientId: string;
  anamnez: string | null;
  chronicConditions: string[] | null;
  currentMedications: string[] | null;
  allergies: AllergyEntry[] | null;
  bloodType: string | null;
  pregnancyStatus: PregnancyStatus | null;
  testResults: TestResults | null;
  lastUpdatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};
