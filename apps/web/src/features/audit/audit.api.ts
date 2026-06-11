import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api.ts';
import { auditKeys } from './audit.keys';
import type { AuditListParams } from './audit.types';

export function useAuditLog(params: AuditListParams) {
  return useQuery({
    queryKey: auditKeys.list(params),
    queryFn: () => api.audit.list(params),
  });
}

/** UserId → ism xaritasi uchun (filtr selektori + "kim" ustuni). */
export function useUserAssignments() {
  return useQuery({
    queryKey: ['users', 'assignments'],
    queryFn: () => api.users.listAssignments(),
  });
}
