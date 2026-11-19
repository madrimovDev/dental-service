import { useLicenseStatus } from '@/features/license';
import type { LicensedModules } from './license-modules';

/**
 * FX-127: joriy tarif modullari (`GET /api/license/status` → `modules`).
 * Yuklanmagan / xato / bulut → `null` (tarif cheklamaydi).
 */
export function useLicensedModules(): LicensedModules {
  const { data } = useLicenseStatus();
  return data?.modules ?? null;
}
