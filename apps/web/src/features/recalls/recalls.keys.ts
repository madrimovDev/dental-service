import type { RecallListParams } from './recalls.types';

/** Recall query-key factory (RFC-0010 §3). */
export const recallKeys = {
  all: ['recalls'] as const,
  list: (params: RecallListParams) => ['recalls', 'list', params] as const,
  patient: (patientId: string) => ['recalls', 'patient', patientId] as const,
};
