export interface ClinicLicenseSummary {
  licenseKey: string;
  plan: string;
  isActive: boolean;
  expiresAt: string;
}

export interface Clinic {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  ownerFullName: string;
  ownerPhone: string;
  createdAt: string;
  license: ClinicLicenseSummary | null;
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
  // `ownerTempPassword` faqat detal javobida keladi (ro'yxatda emas) va
  // klinika aktivatsiya qilgach Supervisor bazasida NULL ga aylanadi.
  clinic: Clinic & { ownerTempPassword?: string | null };
  license: License | null;
}

export interface CreateClinicInput {
  name: string;
  contactEmail?: string;
  contactPhone?: string;
  plan: 'starter' | 'standard' | 'premium' | 'enterprise';
  expiresAt: string;
  gracePeriodDays: number;
  ownerFullName: string;
  ownerPhone: string;
  defaultLanguage: 'uz' | 'ru';
  branchName: string;
  branchAddress?: string;
  branchPhone?: string;
}

/**
 * `POST /v1/admin/clinics` javobi — `ClinicDetail`ga qo'shimcha ravishda
 * vaqtinchalik owner paroli qaytariladi. Parol AYNAN shu javobda va faqat
 * shu yerda ochiq ko'rinadi.
 */
export interface CreateClinicResult extends ClinicDetail {
  credentials: { loginPhone: string; tempPassword: string };
}
