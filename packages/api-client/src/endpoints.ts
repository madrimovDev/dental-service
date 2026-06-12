import type { ApiClient } from './client.ts';
import type { PatientImage, PatientImageType } from './types-m5.ts';

export const createEndpoints = (api: ApiClient) => ({
  patientImages: {
    list: (patientId: string) => api.get<PatientImage[]>(`/api/patients/${patientId}/images`),
    get: (id: string) => api.get<PatientImage>(`/api/patient-images/${id}`),
    upload: async (form: FormData) => {
      // Special: multipart upload bypasses JSON helpers
      const res = await api.upload<PatientImage>('/api/patient-images', form);
      return res;
    },
    update: (
      id: string,
      body: {
        type?: PatientImageType;
        title?: string | null;
        description?: string | null;
        toothNumbers?: number[] | null;
        takenDate?: string | null;
      },
    ) => api.patch<PatientImage>(`/api/patient-images/${id}`, body),
    remove: (id: string) => api.delete<{ deleted: true }>(`/api/patient-images/${id}`),
  },
});

export type Endpoints = ReturnType<typeof createEndpoints>;
