import { getTenantReadiness } from '@dental/api-client';
import { useQuery } from '@tanstack/react-query';
import { settingsKeys } from './settings.keys';

// --- Readiness (UI-M3) ---
export type ReadinessKey =
  | 'workHours'
  | 'doctorSchedule'
  | 'servicePrices'
  | 'channel'
  | 'staff'
  | 'license'
  | 'backup';
export type ReadinessDto = { items: { key: ReadinessKey; ok: boolean }[] };

export function useTenantReadiness(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.readiness(),
    queryFn: () => getTenantReadiness().then((r) => r.data),
    enabled,
    retry: false,
  });
}
