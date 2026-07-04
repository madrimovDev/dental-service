export interface Clinic {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
}

export interface License {
  id: string;
  clinicId: string;
  branchId: string;
  licenseKey: string;
  fingerprint: string | null;
  plan: string;
  modules: string[];
  gracePeriodDays: number;
  expiresAt: string;
  isActive: boolean;
  lastHeartbeatAt: string | null;
  activatedAt: string | null;
  createdAt: string;
}

export interface ClinicDetail {
  clinic: Clinic;
  license: License | null;
}

export interface CreateClinicInput {
  name: string;
  contactEmail?: string;
  contactPhone?: string;
  plan: 'starter' | 'standard' | 'premium' | 'enterprise';
  expiresAt: string;
  gracePeriodDays: number;
}
