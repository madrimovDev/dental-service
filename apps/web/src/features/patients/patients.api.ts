import {
  addPatientRelative,
  archivePatient,
  createPatient,
  getMedicalRecord,
  getPatient,
  getPatientBalance,
  listCashierTransactions,
  listPatientRelatives,
  listPatients,
  removePatientRelative,
  updateMedicalRecord,
  updatePatient,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { patientKeys } from './patients.keys';
import { toPatientDetail, toPatientListItem } from './patients.mappers';
import type { ListParams } from './patients.types';

export function usePatients(params: ListParams) {
  const { t } = useTranslation();
  return useQuery({
    queryKey: patientKeys.list(params),
    queryFn: async () => {
      const res = await listPatients({
        search: params.search || undefined,
        archived: params.archived,
        page: params.page,
        pageSize: params.pageSize ?? 20,
      }).then((r) => r.data);
      return { items: res.data.map((p) => toPatientListItem(p, t)), meta: res.meta };
    },
  });
}

export function usePatient(id: string) {
  const { t } = useTranslation();
  return useQuery({
    queryKey: patientKeys.detail(id),
    queryFn: async () => toPatientDetail(await getPatient(id).then((r) => r.data), t),
    enabled: !!id,
  });
}

export function usePatientRaw(id: string) {
  return useQuery({
    queryKey: patientKeys.raw(id),
    queryFn: () => getPatient(id).then((r) => r.data),
    enabled: !!id,
  });
}

export function useUpdatePatient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof updatePatient>[1]) =>
      updatePatient(id, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: patientKeys.detail(id) });
      qc.invalidateQueries({ queryKey: patientKeys.raw(id) });
      qc.invalidateQueries({ queryKey: patientKeys.all });
    },
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof createPatient>[0]) =>
      createPatient(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientKeys.all }),
  });
}

export function useArchivePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archivePatient(id).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientKeys.all }),
  });
}

export function useMedicalRecord(id: string) {
  return useQuery({
    queryKey: patientKeys.medical(id),
    queryFn: () => getMedicalRecord(id).then((r) => r.data),
    enabled: !!id,
  });
}

export function useUpdateMedicalRecord(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof updateMedicalRecord>[1]) =>
      updateMedicalRecord(id, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientKeys.medical(id) }),
  });
}

export function usePatientPayments(id: string) {
  return useQuery({
    queryKey: patientKeys.payments(id),
    queryFn: () => listCashierTransactions({ patientId: id, pageSize: 50 }).then((r) => r.data),
    enabled: !!id,
  });
}

export function usePatientBalance(id: string) {
  return useQuery({
    queryKey: patientKeys.balance(id),
    queryFn: () => getPatientBalance(id).then((r) => r.data),
    enabled: !!id,
  });
}

export function usePatientRelatives(id: string) {
  return useQuery({
    queryKey: patientKeys.relatives(id),
    queryFn: () => listPatientRelatives(id).then((r) => r.data),
    enabled: !!id,
  });
}

export function useAddRelative(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { relativePatientId: string; relationship: string }) =>
      addPatientRelative(id, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientKeys.relatives(id) }),
  });
}

export function useRemoveRelative(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (relId: string) => removePatientRelative(id, relId).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientKeys.relatives(id) }),
  });
}
