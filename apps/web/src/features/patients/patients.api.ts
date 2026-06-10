import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api.ts';
import { patientKeys } from './patients.keys';
import { toPatientDetail, toPatientListItem } from './patients.mappers';
import type { ListParams } from './patients.types';

export function usePatients(params: ListParams) {
  const { t } = useTranslation();
  return useQuery({
    queryKey: patientKeys.list(params),
    queryFn: async () => {
      const res = await api.patients.list({
        search: params.search || undefined,
        archived: params.archived,
        page: params.page,
        pageSize: 20,
      });
      return { items: res.data.map((p) => toPatientListItem(p, t)), meta: res.meta };
    },
  });
}

export function usePatient(id: string) {
  const { t } = useTranslation();
  return useQuery({
    queryKey: patientKeys.detail(id),
    queryFn: async () => toPatientDetail(await api.patients.get(id), t),
    enabled: !!id,
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.patients.create>[0]) => api.patients.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientKeys.all }),
  });
}

export function useArchivePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patients.archive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientKeys.all }),
  });
}
