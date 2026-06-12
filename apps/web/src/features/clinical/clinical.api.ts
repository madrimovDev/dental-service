import {
  type CreateLabOrderInput,
  type CreatePrescriptionInput,
  type CreateTemplateInput,
  type CreateToothChartInput,
  type CreateTreatmentPlanInput,
  type CreateVisitNoteInput,
  createConsentTemplate,
  createLabOrder,
  createPrescription,
  createToothChart,
  createTreatmentPlan,
  createVisitNote,
  getLatestToothChart,
  getTreatmentPlan,
  type LabOrderStatus,
  listAppointments,
  listConsentForms,
  listConsentTemplates,
  listDiagnoses,
  listLabOrders,
  listPrescriptions,
  listTreatmentPlans,
  listVisitNotes,
  type SignFormInput,
  signConsentForm,
  type TreatmentStageStatus,
  updateLabOrder,
  updateTreatmentStage,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api.ts';
import { clinicalKeys } from './clinical.keys';

const HOUR = 1000 * 60 * 60;

// ===== A: odontogram =====
export function useLatestToothChart(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.toothChartLatest(patientId),
    queryFn: () => getLatestToothChart(patientId).then((r) => r.data),
  });
}

export function useCreateToothChart(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateToothChartInput) => createToothChart(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.toothChartLatest(patientId) }),
  });
}

// ===== A: treatment plans =====
export function useTreatmentPlans(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.plans(patientId),
    queryFn: () => listTreatmentPlans({ patientId }).then((r) => r.data),
  });
}

export function usePlanDetail(planId: string) {
  return useQuery({
    queryKey: clinicalKeys.planDetail(planId),
    queryFn: () => getTreatmentPlan(planId).then((r) => r.data),
  });
}

export function useCreatePlan(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTreatmentPlanInput) => createTreatmentPlan(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.plans(patientId) }),
  });
}

export function useUpdateStage(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TreatmentStageStatus }) =>
      updateTreatmentStage(id, { status }).then((r) => r.data),
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
    queryFn: () => listVisitNotes({ patientId }).then((r) => r.data),
  });
}

export function useCreateVisitNote(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateVisitNoteInput) => createVisitNote(body).then((r) => r.data),
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
    queryFn: () => listPrescriptions({ patientId }).then((r) => r.data),
  });
}

export function useCreatePrescription(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePrescriptionInput) => createPrescription(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.prescriptions(patientId) }),
  });
}

// ===== B: lab orders =====
export function useLabOrders(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.labOrders(patientId),
    queryFn: () => listLabOrders({ patientId }).then((r) => r.data),
  });
}

export function useCreateLabOrder(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLabOrderInput) => createLabOrder(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.labOrders(patientId) }),
  });
}

export function useUpdateLabOrderStatus(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LabOrderStatus }) =>
      updateLabOrder(id, { status }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.labOrders(patientId) }),
  });
}

// ===== B: consent =====
export function useConsentForms(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.consentForms(patientId),
    queryFn: () => listConsentForms({ patientId }).then((r) => r.data),
  });
}

export function useConsentTemplates() {
  return useQuery({
    queryKey: clinicalKeys.consentTemplates(),
    queryFn: () => listConsentTemplates().then((r) => r.data),
  });
}

export function useSignConsent(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SignFormInput) => signConsentForm(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.consentForms(patientId) }),
  });
}

export function useCreateConsentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTemplateInput) => createConsentTemplate(body).then((r) => r.data),
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
