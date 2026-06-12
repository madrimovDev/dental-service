import { listAuditLog, listUserAssignments } from '@dental/api-client';
import { useQuery } from '@tanstack/react-query';
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
    queryKey: ['users', 'assignments'],
    queryFn: () => listUserAssignments().then((r) => r.data),
  });
}
