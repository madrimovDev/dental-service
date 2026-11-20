import {
  addPatientEmergencyContact,
  addPatientRelative,
  archivePatient,
  checkPatientPhone,
  confirmMedicalRecord,
  createPatient,
  getMedicalRecord,
  getMedicalRecordHistory,
  getPatient,
  getPatientBalance,
  getPatientNoShowStrikes,
  importPatients,
  listCashierPatientPlans,
  listCashierTransactions,
  listPatientEmergencyContacts,
  listPatientRelatives,
  listPatients,
  removePatientEmergencyContact,
  removePatientRelative,
  setPatientPhoto,
  updateMedicalRecord,
  updatePatient,
  waiveNoShowStrike,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import {
  chunk,
  IMPORT_CHUNK_SIZE,
  type ImportResult,
  type ImportRowInput,
  mergeImportResults,
} from './patient-import';
import { patientKeys } from './patients.keys';
import { toPatientDetail, toPatientListItem } from './patients.mappers';
import type { ListParams, MedicalRecordView } from './patients.types';

export function usePatients(params: ListParams, options?: { enabled?: boolean }) {
  const { t } = useTranslation();
  return useQuery({
    enabled: options?.enabled,
    queryKey: patientKeys.list(params),
    queryFn: async () => {
      const res = await listPatients({
        search: params.search || undefined,
        archived: params.archived,
        // TODO(generate): `debt` generate:contract'dan keyin generated params tipida bo'ladi.
        ...(params.debt ? { debt: true } : {}),
        page: params.page,
        pageSize: params.pageSize ?? 20,
      } as Parameters<typeof listPatients>[0]).then((r) => r.data);
      return { items: res.data.map((p) => toPatientListItem(p, t)), meta: res.meta };
    },
  });
}

/**
 * UI-R6: telefon dublikat tekshiruvi (`GET /api/patients/phone-check`). To'liq raqam
 * (+998XXXXXXXXX) bo'lgandagina so'raydi. Generated klient
 */
export function usePhoneCheck(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return useQuery({
    queryKey: patientKeys.phoneCheck(phone),
    // To'liq O'zbekiston raqami (+998 + 9 raqam = 12 xona) — qisman raqamda so'ramaymiz.
    enabled: digits.length >= 12,
    staleTime: 15_000,
    queryFn: async () => {
      const res = await checkPatientPhone({ phone });
      // FU-23: `patient.view_pii`siz `matches` bo'sh, faqat `count` keladi.
      // TODO(generate): `count` generated tipda generate:contract'dan keyin.
      const data = res.data as typeof res.data & { count?: number };
      return { count: data.count ?? data.matches.length, matches: data.matches };
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

/**
 * FT-06.2: bemor avatari. `file` berilsa — avval `face_photo` sifatida yuklanadi
 * (`POST /patient-images`, multipart), keyin `PATCH /patients/{id}/photo` bilan avatar
 * qilinadi; `null` — avatarni olib tashlash (rasm galereyada qoladi).
 */
export function useSetPatientPhoto(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File | null) => {
      let imageId: string | null = null;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('patientId', patientId);
        fd.append('type', 'face_photo');
        const uploaded = await api.patientImages.upload(fd);
        imageId = uploaded.id;
      }
      return setPatientPhoto(patientId, { imageId }).then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: patientKeys.detail(patientId) });
      qc.invalidateQueries({ queryKey: patientKeys.raw(patientId) });
      qc.invalidateQueries({ queryKey: ['clinical', 'images', patientId] });
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
    queryFn: () => getMedicalRecord(id).then((r) => r.data as MedicalRecordView),
    enabled: !!id,
  });
}

export function useUpdateMedicalRecord(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof updateMedicalRecord>[1]) =>
      updateMedicalRecord(id, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: patientKeys.medical(id) });
      qc.invalidateQueries({ queryKey: patientKeys.medicalHistory(id) });
    },
  });
}

/**
 * UI-D2: anamnezni tasdiqlash (`POST /api/patients/{id}/medical-record/confirm`, `medical_record.edit`).
 */
export function useConfirmMedicalRecord(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await confirmMedicalRecord(id);
      return res.data as MedicalRecordView;
    },
    onSuccess: (record) => {
      qc.setQueryData(patientKeys.medical(id), record);
    },
  });
}

export function useMedicalRecordHistory(id: string) {
  return useQuery({
    queryKey: patientKeys.medicalHistory(id),
    queryFn: () => getMedicalRecordHistory(id).then((r) => r.data),
    enabled: !!id,
  });
}

export const PATIENT_PAYMENTS_PAGE_SIZE = 50;

export function usePatientPayments(id: string, page = 1) {
  return useQuery({
    queryKey: [...patientKeys.payments(id), page] as const,
    queryFn: () =>
      listCashierTransactions({ patientId: id, page, pageSize: PATIENT_PAYMENTS_PAGE_SIZE }).then(
        (r) => r.data,
      ),
    enabled: !!id,
  });
}

/** To'lov qatorida reja nomini ko'rsatish uchun (`cashier.view` — PaymentsTab bilan bir ruxsat). */
export function usePatientPlanTitles(id: string) {
  return useQuery({
    queryKey: [...patientKeys.payments(id), 'plan-titles'] as const,
    queryFn: () => listCashierPatientPlans({ patientId: id }).then((r) => r.data),
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

export function usePatientEmergencyContacts(id: string) {
  return useQuery({
    queryKey: patientKeys.emergencyContacts(id),
    queryFn: () => listPatientEmergencyContacts(id).then((r) => r.data),
    enabled: !!id,
  });
}

export function useAddEmergencyContact(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      phone: string;
      relationship?: string;
      isPrimary?: boolean;
    }) => addPatientEmergencyContact(id, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientKeys.emergencyContacts(id) }),
  });
}

export function useRemoveEmergencyContact(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) =>
      removePatientEmergencyContact(id, contactId).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientKeys.emergencyContacts(id) }),
  });
}

// CLI-474 (L7): bemor no-show strike xulosasi (tarix + count + chegara + flag).
export function usePatientNoShowStrikes(id: string, enabled = true) {
  return useQuery({
    queryKey: patientKeys.noShowStrikes(id),
    queryFn: () => getPatientNoShowStrikes(id).then((r) => r.data),
    enabled,
  });
}

// CLI-474 (L7): strike'ni kechirish (waive) — appointment.edit permission (backend).
export function useWaiveNoShowStrike(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; reason?: string | null }) =>
      waiveNoShowStrike(args.id, { reason: args.reason ?? null }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: patientKeys.noShowStrikes(patientId) });
      qc.invalidateQueries({ queryKey: patientKeys.all });
    },
  });
}

/**
 * FU-24: Excel/CSV import (`POST /api/patients/import`, `patient.import`). Server bitta so'rovda
 * ko'pi bilan 1000 qator oladi — kattaroq fayl bo'laklab ketma-ket yuboriladi, natija birlashtiriladi.
 * `dryRun` — hech narsa yozmaydi (oldindan ko'rish: yangi / dublikat / xato).
 */
export async function runPatientImport(
  rows: ImportRowInput[],
  dryRun: boolean,
): Promise<ImportResult> {
  const parts: ImportResult[] = [];
  for (const part of chunk(rows, IMPORT_CHUNK_SIZE)) {
    const res = await importPatients({ rows: part, dryRun } as never);
    parts.push(res.data as unknown as ImportResult);
  }
  return mergeImportResults(parts);
}

export function useImportPatients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { rows: ImportRowInput[]; dryRun: boolean }) =>
      runPatientImport(args.rows, args.dryRun),
    onSuccess: (result) => {
      if (!result.dryRun && result.created > 0) qc.invalidateQueries({ queryKey: patientKeys.all });
    },
  });
}
