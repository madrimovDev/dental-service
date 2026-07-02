import { authFetch } from '../../lib/api';
import type { Clinic, ClinicDetail } from './clinics.types';

export const fetchClinics = async (): Promise<Clinic[]> => {
  const res = await authFetch('/v1/admin/clinics');
  if (!res.ok) throw new Error("Klinikalar ro'yxatini yuklab bo'lmadi");
  return res.json();
};

export const fetchClinicDetail = async (id: string): Promise<ClinicDetail> => {
  const res = await authFetch(`/v1/admin/clinics/${id}`);
  if (!res.ok) throw new Error('Klinika topilmadi');
  return res.json();
};
