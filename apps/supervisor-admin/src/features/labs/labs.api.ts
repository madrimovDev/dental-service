import { authFetch } from '../../lib/api';
import type { CreateLabInput, CreateLabResult, Lab, UpdateLabInput } from './labs.types';

/** Supervisor API → Lab Hub ichki API proksisi (`/v1/admin/labs`). */
const errorFor = async (res: Response, fallback: string) => {
  if (res.status === 503)
    return new Error('Lab Hub ulanmagan (LAB_HUB_URL / SUPERVISOR_HUB_TOKEN sozlanmagan).');
  if (res.status === 502)
    return new Error("Lab Hub javob bermadi — keyinroq qayta urinib ko'ring.");
  const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
  if (body?.error?.code === 'lab_user.phone_taken') {
    return new Error('Bu telefon Lab Hub’da allaqachon ro‘yxatdan o‘tgan.');
  }
  return new Error(fallback);
};

export const fetchLabs = async (): Promise<Lab[]> => {
  const res = await authFetch('/v1/admin/labs');
  if (!res.ok) throw await errorFor(res, "Laboratoriyalar ro'yxatini yuklab bo'lmadi");
  return ((await res.json()) as { labs: Lab[] }).labs;
};

export const createLab = async (input: CreateLabInput): Promise<CreateLabResult> => {
  const res = await authFetch('/v1/admin/labs', { method: 'POST', body: JSON.stringify(input) });
  if (!res.ok) throw await errorFor(res, "Laboratoriya yaratib bo'lmadi");
  return res.json();
};

export const updateLab = async (id: string, input: UpdateLabInput): Promise<Lab> => {
  const res = await authFetch(`/v1/admin/labs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await errorFor(res, "Laboratoriyani yangilab bo'lmadi");
  return ((await res.json()) as { lab: Lab }).lab;
};
