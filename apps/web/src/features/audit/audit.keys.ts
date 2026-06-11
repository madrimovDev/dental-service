import type { AuditListParams } from './audit.types';

export const auditKeys = {
  all: ['audit'] as const,
  list: (params: AuditListParams) => ['audit', params] as const,
};
