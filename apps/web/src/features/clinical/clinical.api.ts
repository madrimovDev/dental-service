import {
  type CreateLabOrderInput,
  type CreatePrescriptionInput,
  type CreateTemplateInput,
  type CreateToothChartInput,
  type CreateTreatmentPlanInput,
  type CreateVisitNoteInput,
  type LabOrderStatus,
  listAppointments,
  listDiagnoses,
  type SignFormInput,
  type TreatmentStageStatus,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api.ts';
import { clinicalKeys } from './clinical.keys';

const HOUR = 1000 * 60 * 60;

// ===== A: odontogram =====
export function useLatestToothChart(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.toothChartLatest(patientId),
    queryFn: () => api.clinical.getLatestToothChart(patientId),
  });
}

export function useCreateToothChart(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateToothChartInput) => api.clinical.createToothChart(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.toothChartLatest(patientId) }),
  });
}

// ===== A: treatment plans =====
export function useTreatmentPlans(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.plans(patientId),
    queryFn: () => api.clinical.listPlans(patientId),
  });
}

export function usePlanDetail(planId: string) {
  return useQuery({
    queryKey: clinicalKeys.planDetail(planId),
    queryFn: () => api.clinical.getPlan(planId),
  });
}

export function useCreatePlan(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTreatmentPlanInput) => api.clinical.createPlan(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.plans(patientId) }),
  });
}

export function useUpdateStage(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TreatmentStageStatus }) =>
      api.clinical.updateStage(id, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clinicalKeys.plans(patientId) });
      void qc.invalidateQueries({ queryKey: ['clinical', 'plan-detail'] });
    },
  });
}

// ===== A: visit notes =====
export function useVisitNotes(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.visitNotes(patientId),
    queryFn: () => api.clinical.listVisitNotes(patientId),
  });
}

export function useCreateVisitNote(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateVisitNoteInput) => api.clinical.createVisitNote(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.visitNotes(patientId) }),
  });
}

export function useDiagnoses() {
  return useQuery({
    queryKey: clinicalKeys.diagnoses(),
    queryFn: () => listDiagnoses().then((r) => r.data),
    staleTime: HOUR,
  });
}

export function usePatientAppointments(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.appointmentsForPatient(patientId),
    queryFn: () => listAppointments({ patientId }).then((r) => r.data),
  });
}

// ===== B: prescriptions =====
export function usePrescriptions(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.prescriptions(patientId),
    queryFn: () => api.prescriptions.list(patientId),
  });
}

export function useCreatePrescription(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePrescriptionInput) => api.prescriptions.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.prescriptions(patientId) }),
  });
}

// ===== B: lab orders =====
export function useLabOrders(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.labOrders(patientId),
    queryFn: () => api.labOrders.list({ patientId }),
  });
}

export function useCreateLabOrder(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLabOrderInput) => api.labOrders.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.labOrders(patientId) }),
  });
}

export function useUpdateLabOrderStatus(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LabOrderStatus }) =>
      api.labOrders.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.labOrders(patientId) }),
  });
}

// ===== B: consent =====
export function useConsentForms(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.consentForms(patientId),
    queryFn: () => api.consent.listForms(patientId),
  });
}

export function useConsentTemplates() {
  return useQuery({
    queryKey: clinicalKeys.consentTemplates(),
    queryFn: () => api.consent.listTemplates(),
  });
}

export function useSignConsent(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SignFormInput) => api.consent.signForm(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.consentForms(patientId) }),
  });
}

export function useCreateConsentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTemplateInput) => api.consent.createTemplate(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.consentTemplates() }),
  });
}

// ===== C: images =====
export function usePatientImages(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.images(patientId),
    queryFn: () => api.patientImages.list(patientId),
  });
}

export function useUploadPatientImage(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => api.patientImages.upload(form),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.images(patientId) }),
  });
}

export function useDeletePatientImage(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patientImages.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.images(patientId) }),
  });
}
