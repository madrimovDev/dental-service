import type { ListParams } from './patients.types';

export const patientKeys = {
  all: ['patients'] as const,
  list: (params: ListParams) => ['patients', 'list', params] as const,
  detail: (id: string) => ['patients', 'detail', id] as const,
  medical: (id: string) => ['patients', 'medical', id] as const,
  payments: (id: string) => ['patients', 'payments', id] as const,
};
