import { getRecentActivity, listAuditLog, listUserAssignments } from '@dental/api-client';
import { useQuery } from '@tanstack/react-query';
import { lookupKeys } from '@/lib/lookup-keys';
import { auditKeys } from './audit.keys';
import type { AuditListParams } from './audit.types';

export function useAuditLog(params: AuditListParams) {
  return useQuery({
    queryKey: auditKeys.list(params),
    queryFn: () => listAuditLog(params).then((r) => r.data),
  });
}

/** UserId → ism xaritasi uchun (filtr selektori + "kim" ustuni). */
export function useUserAssignments() {
  return useQuery({
    queryKey: lookupKeys.userAssignments(),
    queryFn: () => listUserAssignments().then((r) => r.data),
  });
}

/**
 * So'nggi 15 ta audit yozuvini metadata-only (before/after yo'q) qaytaradi.
 * ManagerDashboard activity rail uchun.
 */
export function useRecentActivity() {
  return useQuery({
    queryKey: ['audit', 'recent'],
    queryFn: () => getRecentActivity().then((r) => r.data),
  });
}
