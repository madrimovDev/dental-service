import type { ApiClient } from './client.ts';
import type { PatientImage } from './generated/model/index.ts';

/**
 * Lab buyurtma fayli (UI-D5, `lab_order_files`). Kontrakt generatsiyasigacha qo'lda tip;
 * `generate:contract`dan keyin `LabOrderFile` generated model paydo bo'ladi — shuning uchun
 * nom to'qnashmasligi uchun `LabOrderFileRecord`.
 */
export type LabOrderFileRecord = {
  id: string;
  labOrderId: string;
  label: string | null;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
};

/**
 * Lab Hub (W2 clinic-sync) — `/api/lab-hub/*` va lab buyurtma Hub amallari. Kontrakt
 * generatsiyasigacha qo'lda tip (`*Record` — generated model nomlari bilan to'qnashmasin).
 */
export type LabHubStatusRecord = {
  configured: boolean;
  mode: 'desktop' | 'saas';
  connected: boolean;
  hubClinicId: string | null;
  connectedAt: string | null;
  lastPollAt: string | null;
  lastPushAt: string | null;
  lastError: string | null;
  pendingOutbox: number;
  failedOutbox: number;
};

export type LabHubLabRecord = {
  id: string;
  name: string;
  city: string | null;
  description: string | null;
  /** `null` = so'rov yuborilmagan; `pending | active | rejected | revoked`. */
  linkStatus: string | null;
};

export type LabHubMessageRecord = {
  id: string;
  labOrderId: string;
  author: 'clinic' | 'lab';
  authorName: string | null;
  kind: 'message' | 'file';
  body: string | null;
  file: { id: string; fileName: string | null; mimeType: string; sizeBytes: number } | null;
  synced: boolean;
  createdAt: string;
};

export type LabHubPriceApprovalRecord = {
  approvedPrice: string;
  approvedAt: string | null;
  alreadyApproved: boolean;
  expenseId: string | null;
};

/** `LabOrder` DTO'ga qo'shilgan Hub maydonlari (generatsiyagacha). */
export type LabOrderHubFields = {
  labHubLabId?: string | null;
  hubSyncStatus?: 'pending' | 'synced' | 'failed' | null;
  hubStatus?: string | null;
  hubRejectReason?: string | null;
  proposedPrice?: string | null;
  approvedPrice?: string | null;
  approvedAt?: string | null;
};

export const createEndpoints = (api: ApiClient) => ({
  labHub: {
    status: () => api.get<LabHubStatusRecord>('/api/lab-hub/status'),
    connect: () => api.post<{ connected: true; hubClinicId: string }>('/api/lab-hub/connect', {}),
    labs: () => api.get<{ labs: LabHubLabRecord[]; stale: boolean }>('/api/lab-hub/labs'),
    requestLink: (labId: string) =>
      api.post<{ link: { id: string; labId: string; status: string } }>('/api/lab-hub/links', {
        labId,
      }),
    sendToHub: <T = unknown>(labOrderId: string, labId: string) =>
      api.post<T>(`/api/lab-orders/${labOrderId}/send-to-hub`, { labId }),
    approvePrice: (labOrderId: string) =>
      api.post<LabHubPriceApprovalRecord>(`/api/lab-orders/${labOrderId}/approve-price`, {}),
    messages: (labOrderId: string) =>
      api.get<LabHubMessageRecord[]>(`/api/lab-orders/${labOrderId}/hub-messages`),
    postMessage: (labOrderId: string, body: string) =>
      api.post<LabHubMessageRecord>(`/api/lab-orders/${labOrderId}/hub-messages`, { body }),
  },
  // lab-order fayllari (UI-D5): multipart upload hand (orval multipart'ni qo'llamaydi);
  // list/delete ham shu namespace'da — generatsiyadan keyin generated funksiyalarga ko'chadi.
  labOrders: {
    uploadFile: (id: string, form: FormData) =>
      api.upload<LabOrderFileRecord>(`/api/lab-orders/${id}/files`, form),
    listFiles: (id: string) => api.get<LabOrderFileRecord[]>(`/api/lab-orders/${id}/files`),
    deleteFile: (id: string, fileId: string) =>
      api.delete<{ deleted: true }>(`/api/lab-orders/${id}/files/${fileId}`),
  },
  // patient-images READ + JSON mutatsiya generated client'ga ko'chdi (CLI-145).
  // FAQAT multipart upload hand qoladi — generated orval mutator multipart'ni qo'llamaydi.
  patientImages: {
    upload: async (form: FormData) => {
      // Special: multipart upload bypasses JSON helpers
      const res = await api.upload<PatientImage>('/api/patient-images', form);
      return res;
    },
  },
});

export type Endpoints = ReturnType<typeof createEndpoints>;
