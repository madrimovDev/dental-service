import type { QueueStatus, QueueTicket } from '@dental/api-client';

/** Ustun guruh kaliti (yakunlangan = done + missed). */
export type QueueColumnKey = 'waiting' | 'in_progress' | 'completed';

/** Bitta navbat kartasi uchun view-model. */
export type QueueCardVM = {
  id: string;
  queueNumber: number;
  status: QueueStatus;
  patientName: string;
  serviceName: string | null;
  createdAt: string;
  calledAt: string | null;
};

/** Ustun (sarlavha kaliti + kartalar). */
export type QueueColumnVM = {
  key: QueueColumnKey;
  tickets: QueueTicket[];
};

/** Mapper lookup kirishlari. */
export type QueueLookups = {
  patientNameById: Map<string, string>;
  serviceNameById: Map<string, string>;
};
