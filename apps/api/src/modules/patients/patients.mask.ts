import type { Context } from 'hono';

/** `s` ning oxirgi `keepLastN` belgisidan boshqasini `*` bilan almashtiradi. */
export const maskString = (s: string, keepLastN: number): string => {
  if (s.length <= keepLastN) return '*'.repeat(s.length);
  return '*'.repeat(s.length - keepLastN) + s.slice(-keepLastN);
};

/**
 * PII fieldlarni masklash — user `patient.view_pii` permission yo'q bo'lsa.
 * (list, get, update javoblari uchun yagona qoida — PT-01.)
 */
export const maskPii = <
  T extends {
    phone?: string | null;
    phoneSecondary?: string | null;
    passport?: string | null;
    address?: string | null;
  },
>(
  patient: T,
): T => ({
  ...patient,
  phone: patient.phone ? maskString(patient.phone, 4) : null,
  phoneSecondary: patient.phoneSecondary ? maskString(patient.phoneSecondary, 4) : null,
  passport: patient.passport ? '***' : null,
  address: patient.address ? '***' : null,
});

export const userHasPiiAccess = (c: Context): boolean => {
  const perms = c.get('accessClaims')?.perms ?? [];
  return perms.includes('@owner') || perms.includes('patient.view_pii');
};
