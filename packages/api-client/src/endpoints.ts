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

export const createEndpoints = (api: ApiClient) => ({
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
