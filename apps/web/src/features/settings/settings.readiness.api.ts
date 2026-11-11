import { customInstance } from '@dental/api-client';
import { useQuery } from '@tanstack/react-query';
import { settingsKeys } from './settings.keys';

// --- Readiness (UI-M3) ---
// Generated client'da hali yo'q (integratsiya `generate:contract` yurgizguncha) — transport
// to'g'ridan `customInstance` orqali; response tipi API schema (TenantReadiness) bilan bir xil.
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
    queryFn: () =>
      customInstance<{ data: ReadinessDto }>({
        url: '/api/tenant-settings/readiness',
        method: 'GET',
      }).then((r) => r.data),
    enabled,
    retry: false,
  });
}
