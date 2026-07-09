import type { ListParams } from './patients.types';

export const patientKeys = {
  all: ['patients'] as const,
  list: (params: ListParams) => ['patients', 'list', params] as const,
  detail: (id: string) => ['patients', 'detail', id] as const,
  raw: (id: string) => ['patients', 'raw', id] as const,
  medical: (id: string) => ['patients', 'medical', id] as const,
  medicalHistory: (id: string) => ['patients', 'medical-history', id] as const,
  payments: (id: string) => ['patients', 'payments', id] as const,
  balance: (id: string) => ['patients', 'balance', id] as const,
  relatives: (id: string) => ['patients', 'relatives', id] as const,
  emergencyContacts: (id: string) => ['patients', 'emergency-contacts', id] as const,
  noShowStrikes: (id: string) => ['patients', 'no-show-strikes', id] as const,
};
