import type { ApiClient } from './client.ts';
import type { PatientImage } from './generated/model/index.ts';

export const createEndpoints = (api: ApiClient) => ({
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
